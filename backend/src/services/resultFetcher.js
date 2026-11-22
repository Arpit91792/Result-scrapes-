/**
 * SIRT / RGPV Multi-Tab Result Fetcher Service
 *
 * Launches ONE Chromium browser window and manages up to MAX_PARALLEL_TABS
 * concurrent tabs (pages in the same BrowserContext) processing students
 * simultaneously in a worker-pool queue.
 *
 * Portal: https://result.rgpv.ac.in/Result/ProgramSelect.aspx
 */

const { chromium } = require('playwright');
const logger = require('../utils/logger');
const { getDirectUrl, getRgpvLabel } = require('../utils/rgpvCourseMap');
const { solveCaptchaFromElement } = require('./captchaSolver');

const PROGRAM_SELECT_URL = 'https://result.rgpv.ac.in/Result/ProgramSelect.aspx';
const PAGE_TIMEOUT = 35000;
const CAPTCHA_WAIT_MS = 180000; // 3 min manual fallback
const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 3;
const MAX_CAPTCHA_RETRIES = 5;

// Default configurable via MAX_PARALLEL_TABS env var (default: 100)
const MAX_PARALLEL_TABS = parseInt(process.env.MAX_PARALLEL_TABS || '100', 10);
// Configurable via HEADLESS_BROWSER env var (default: true)
const isHeadless = process.env.HEADLESS_BROWSER !== 'false';

const CAPTCHA_IMG_SELECTORS = [
      '#ctl00_ContentPlaceHolder1_pnlCaptcha img',
      'img[src*="CaptchaImage"]',
      'img[src*="captcha"]',
      '#ctl00_ContentPlaceHolder1_pnlCaptcha table img',
      'div#ctl00_ContentPlaceHolder1_pnlCaptcha img',
];

class ResultFetcherService {
      constructor(io) {
            this.io = io;
            this.browser = null;
            this.context = null;
            this.isPaused = false;
            this.isCancelled = false;
            this._resolvedEntryUrl = null;

            // Worker tabs registry: array of { tabId, tabName, page, enrollmentNumber, status, message }
            this.tabs = [];
            this.captchaResolvers = new Map(); // tabId -> resolve function
            this.maxTabs = MAX_PARALLEL_TABS;
      }

      // ── Logging ───────────────────────────────────────────────────────────────────
      log(jobId, msg, level = 'info') {
            logger[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
                  `[Job ${jobId}] ${msg}`
            );
            if (this.io) {
                  this.io.to(`job_${jobId}`).emit('log', {
                        jobId, message: msg, level, timestamp: new Date().toISOString(),
                  });
            }
      }

      emitCaptchaStatus(jobId, status, text = '') {
            if (this.io) {
                  this.io.to(`job_${jobId}`).emit('captcha_status', {
                        jobId, status, text, timestamp: new Date().toISOString(),
                  });
            }
      }

      emitCaptchaRequired(jobId, tabId = 1, enrollment = '') {
            if (this.io) {
                  this.io.to(`job_${jobId}`).emit('captcha_required', {
                        jobId,
                        tabId,
                        enrollment,
                        message: `Tab ${tabId} (${enrollment}): Auto OCR failed after multiple attempts. Please verify CAPTCHA in browser window, or click Resume.`,
                        timestamp: new Date().toISOString(),
                  });
            }
      }

      resolveCaptchaWait(tabId = null) {
            if (tabId && this.captchaResolvers.has(tabId)) {
                  const cb = this.captchaResolvers.get(tabId);
                  cb(true);
            } else {
                  for (const [, cb] of this.captchaResolvers.entries()) {
                        cb(true);
                  }
            }
      }

      // ── Browser & Context Lifecycle ───────────────────────────────────────────────
      /**
       * Launch ONE Chromium browser instance in headless mode.
       * Runs completely in the background without displaying a desktop window or taskbar icon.
       */
      async launchBrowser() {
            if (this.browser && this.browser.isConnected()) {
                  if (!this.context) {
                        this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
                  }
                  return this.context;
            }
            const headlessMode = process.env.HEADLESS_BROWSER !== 'false';
            this.log('system', `Launching Chromium browser (headless=${headlessMode}, up to ${this.maxTabs} background tabs)`);
            this.browser = await chromium.launch({
                  headless: headlessMode,  // Headless: no window on desktop, no icon in taskbar
                  args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--no-first-run',
                        '--no-default-browser-check',
                  ],
                  timeout: 45000,
            });
            // Single context guarantees all new pages run in the exact same Chromium instance
            this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
            logger.info(`Chromium browser launched (headless=${headlessMode})`);
            return this.context;
      }

      async closeBrowser() {
            try {
                  for (const tab of this.tabs) {
                        if (tab.page && !tab.page.isClosed()) {
                              await tab.page.close().catch(() => { });
                        }
                  }
                  this.tabs = [];
                  if (this.browser) {
                        await this.browser.close().catch(() => { });
                        this.browser = null;
                        this.context = null;
                  }
                  this._resolvedEntryUrl = null;
            } catch (e) {
                  logger.warn('Browser close:', e.message);
            }
      }

      setupDialogHandlerForPage(page, tabId) {
            page._lastAlert = null;
            page.removeAllListeners('dialog');
            page.on('dialog', async (dialog) => {
                  page._lastAlert = dialog.message();
                  logger.info(`[Tab ${tabId}] [Dialog] "${dialog.message()}"`);
                  await dialog.accept().catch(() => { });
            });
      }

      // ── Utilities ─────────────────────────────────────────────────────────────────
      delay(ms) { return new Promise(r => setTimeout(r, ms)); }

      async waitWhilePaused() {
            while (this.isPaused && !this.isCancelled) await this.delay(400);
            return !this.isCancelled;
      }

      pause() { this.isPaused = true; }
      resume() { this.isPaused = false; }
      stop() {
            this.isCancelled = true;
            this.isPaused = false;
            // Unblock any waiting resolvers
            this.resolveCaptchaWait();
      }

      // ── Page Status & Inspection Helpers ──────────────────────────────────────────
      async isResultDisplayed(page) {
            try {
                  const el = await page.$(
                        '#ctl00_ContentPlaceHolder1_lblNameGrading, ' +
                        '#ctl00_ContentPlaceHolder1_lblName, ' +
                        '#ctl00_ContentPlaceHolder1_lblResultNewGrading, ' +
                        '#ctl00_ContentPlaceHolder1_lblResult, ' +
                        '#ctl00_ContentPlaceHolder1_pnlGrading, ' +
                        '#ctl00_ContentPlaceHolder1_pnlshowRslt'
                  );
                  return el ? await el.isVisible() : false;
            } catch { return false; }
      }

      async isOnEntryForm(page) {
            try {
                  if (await this.isResultDisplayed(page)) return false;
                  const rollInput = await page.$('input[name="ctl00$ContentPlaceHolder1$txtrollno"]');
                  return rollInput ? await rollInput.isVisible() : false;
            } catch { return false; }
      }

      async findCaptchaImg(page) {
            for (const sel of CAPTCHA_IMG_SELECTORS) {
                  try {
                        const el = await page.$(sel);
                        if (el && await el.isVisible()) return el;
                  } catch { /* try next */ }
            }
            return null;
      }

      async isCaptchaVisible(page) {
            try {
                  const panel = await page.$('#ctl00_ContentPlaceHolder1_pnlCaptcha');
                  if (panel && await panel.isVisible()) return true;
                  const inp = await page.$('input[name="ctl00$ContentPlaceHolder1$TextBox1"]');
                  return inp ? await inp.isVisible() : false;
            } catch { return false; }
      }

      async _refreshCaptcha(page) {
            try {
                  const img = await this.findCaptchaImg(page);
                  if (img) {
                        const oldSrc = await img.getAttribute('src').catch(() => null);
                        await img.click().catch(() => {});
                        // Wait for RGPV to load a new image URL or wait 1.5 seconds
                        const start = Date.now();
                        while (Date.now() - start < 2000) {
                              await this.delay(300);
                              const newSrc = await img.getAttribute('src').catch(() => null);
                              if (newSrc && newSrc !== oldSrc) break;
                        }
                        await this.delay(400);
                  }
            } catch { /* ignore */ }
      }

      async getText(page, selector) {
            try {
                  const el = await page.$(selector);
                  if (!el) return null;
                  return (await el.innerText()).trim() || null;
            } catch { return null; }
      }

      parseFloat_(str) {
            if (!str) return null;
            const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
            return isNaN(n) ? null : n;
      }

      // ── Scrape result and subjects on a given page ────────────────────────────────
      async scrapeSubjects(page) {
            const subjects = [];
            const subjectCodePattern = /^[A-Z]{2,4}\s*-?\s*\d{3,4}[A-Z]?(?:\s*[-_(]?\s*\[?\s*[TPN]\s*\]?\s*\)?)?$/i;
            const gradePattern = /^(?:O|A\+?|B\+?|C\+?|D|E|F|FF|P|AB|ABS|ABSENT|WH|WITHHELD|PASS|FAIL)$/i;
            try {
                  for (const panelId of [
                        '#ctl00_ContentPlaceHolder1_pnlGrading',
                        '#ctl00_ContentPlaceHolder1_pnlshowRslt',
                        '#ctl00_ContentPlaceHolder1_GridView1',
                  ]) {
                        const panel = await page.$(panelId);
                        if (!panel) continue;

                        const rows = await panel.$$('table tbody tr, table tr');
                        for (const row of rows) {
                              const cells = await row.$$('td');
                              if (cells.length < 3) continue;
                              const vals = await Promise.all(cells.map(c => c.innerText().then(t => t.trim()).catch(() => '')));
                              const first = vals[0].toLowerCase();
                              if (!first || first === 's.no' || first.includes('subject') || first.includes('code')) continue;
                              const branchValue = vals.find(value => /Branch\s*[:\t]?\s*[A-Za-z]+/i.test(value));
                              if (branchValue) {
                                    subjects.push({ subjectCode: branchValue });
                                    continue;
                              }
                              const courseIndex = vals.findIndex(value => value.toLowerCase() === 'course');
                              if (courseIndex >= 0 && vals[courseIndex + 1]) {
                                    subjects.push({ subjectCode: 'Course', grade: vals[courseIndex + 1] });
                                    continue;
                              }
                              const offset = /^\d{1,2}$/.test(vals[0]) ? 1 : 0;
                              const codeIndex = vals.findIndex(value => subjectCodePattern.test(value));
                              if (codeIndex < 0) continue;
                              const code = vals[codeIndex];
                              const nameIndex = [
                                    vals[codeIndex + 1],
                                    vals[codeIndex - 1],
                                    vals[offset + 1],
                              ].findIndex(value => value
                                    && !subjectCodePattern.test(value)
                                    && !/^\d+(?:\.\d+)?$/.test(value)
                                    && !gradePattern.test(value));
                              const nameCandidates = [
                                    codeIndex + 1,
                                    codeIndex - 1,
                                    offset + 1,
                              ];
                              const subjectName = nameIndex >= 0 ? vals[nameCandidates[nameIndex]] : '';
                              const valueStartIndex = nameIndex >= 0 && nameCandidates[nameIndex] > codeIndex
                                    ? nameCandidates[nameIndex] + 1
                                    : codeIndex + 1;
                              subjects.push({
                                    subjectCode: code,
                                    subjectName,
                                    internalMarks: this.parseFloat_(vals[valueStartIndex]),
                                    externalMarks: this.parseFloat_(vals[valueStartIndex + 1]),
                                    practicalMarks: this.parseFloat_(vals[valueStartIndex + 2]),
                                    totalMarks: this.parseFloat_(vals[valueStartIndex + 3]),
                                    credits: this.parseFloat_(vals[valueStartIndex + 4]),
                                    grade: vals[valueStartIndex + 5] || vals[vals.length - 1] || null,
                              });
                        }
                        if (subjects.length > 0) break;
                  }
            } catch (e) {
                  logger.warn('scrapeSubjects:', e.message);
            }
            return subjects;
      }

      async scrapeResult(page, enrollment) {
            try {
                  const studentName = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblNameGrading')
                        || await this.getText(page, '#ctl00_ContentPlaceHolder1_lblName');
                  const rollNo = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblRollNoGrading') || enrollment;
                  const branchText = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblBranchGrading')
                        || await this.getText(page, '#ctl00_ContentPlaceHolder1_lblBranch');
                  const resultText = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblResultNewGrading')
                        || await this.getText(page, '#ctl00_ContentPlaceHolder1_lblResult');
                  const sgpaText = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblSGPA')
                        || await this.getText(page, '#ctl00_ContentPlaceHolder1_lblsgpa');
                  const cgpaText = await this.getText(page, '#ctl00_ContentPlaceHolder1_lblcgpa')
                        || await this.getText(page, '#ctl00_ContentPlaceHolder1_lblCGPA');

                  if (!studentName && !resultText) return null;

                  let resultStatus = 'PENDING';
                  if (resultText) {
                        const u = resultText.toUpperCase();
                        if (u.includes('PASS') || u.includes('PROMOTED')) resultStatus = 'PASS';
                        else if (u.includes('FAIL') || u.includes('BACK') || u.includes('EX-STU')) resultStatus = 'FAIL';
                        else if (u.includes('ABSENT') || u.includes('AB')) resultStatus = 'ABSENT';
                        else if (u.includes('WITHHELD') || u.includes('WH')) resultStatus = 'WITHHELD';
                        else resultStatus = resultText.trim().toUpperCase().substring(0, 20);
                  }

                  const sgpa = this.parseFloat_(sgpaText);
                  const cgpa = this.parseFloat_(cgpaText);
                  const subjects = await this.scrapeSubjects(page);
                  const backlogs = subjects.filter(s => s.grade === 'F' || s.grade === 'FF').length;
                  const totalCredits = subjects.reduce((s, sub) => s + (sub.credits || 0), 0) || null;

                  let detectedBranch = branchText ? branchText.trim().toUpperCase() : null;
                  if (!detectedBranch && subjects && subjects.length > 0) {
                        for (const sub of subjects) {
                              const m = String(sub.subjectCode || '').match(/Branch\s*[:\t]?\s*([A-Za-z]+)/i);
                              if (m) { detectedBranch = m[1].trim().toUpperCase(); break; }
                              if (sub.subjectCode === 'Course' && sub.grade) { detectedBranch = String(sub.grade).trim().toUpperCase(); break; }
                        }
                  }

                  return {
                        studentName: studentName || '',
                        enrollmentNumber: rollNo || enrollment,
                        ...(detectedBranch ? { branch: detectedBranch } : {}),
                        sgpa,
                        cgpa,
                        resultStatus,
                        subjects,
                        backlogs,
                        totalCredits,
                        rawResultText: resultText,
                  };
            } catch (e) {
                  logger.error('scrapeResult:', e.message);
                  return null;
            }
      }

      async clickReset(page) {
            try {
                  const btn = await page.$('#ctl00_ContentPlaceHolder1_btnReset');
                  if (btn && await btn.isVisible()) {
                        await btn.click();
                        await this.delay(1000);
                        return;
                  }
            } catch { /* ignore */ }
            if (this._resolvedEntryUrl) {
                  await page.goto(this._resolvedEntryUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }).catch(() => { });
                  await this.delay(800);
            }
      }

      // ── Programme Navigation ──────────────────────────────────────────────────────
      async selectProgramme(page, jobConfig, jobId) {
            const course = jobConfig.course;
            const resultType = jobConfig.resultType || 'Main';
            const rgpvLabel = getRgpvLabel(course);

            if (!rgpvLabel) {
                  this.log(jobId, `❌ No RGPV label mapping for course: "${course}"`, 'error');
                  return { success: false, error: `Course "${course}" is not supported.` };
            }

            this.log(jobId, `🔍 ProgramSelect: Looking for "${rgpvLabel}" in "${resultType}" section`);

            try {
                  await page.goto(PROGRAM_SELECT_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
                  await this.delay(1500);

                  let clicked = await this._clickProgrammeRadio(page, rgpvLabel, resultType, jobId);
                  if (!clicked) {
                        const available = await this._listAllRadioLabels(page);
                        return {
                              success: false,
                              error: `Programme "${course}" not found on RGPV page. Available: ${available.join(', ')}`,
                        };
                  }

                  await this.delay(2500);
                  if (!(await this.isOnEntryForm(page))) {
                        await this.delay(2000);
                        if (!(await this.isOnEntryForm(page))) {
                              return { success: false, error: 'Programme selected but result form did not appear' };
                        }
                  }

                  this._resolvedEntryUrl = page.url();
                  this.log(jobId, `✓ Programme selected successfully → ${this._resolvedEntryUrl}`);
                  return { success: true, url: this._resolvedEntryUrl };
            } catch (e) {
                  this.log(jobId, `❌ Programme selection error: ${e.message}`, 'error');
                  return { success: false, error: e.message };
            }
      }

      async _clickProgrammeRadio(page, rgpvLabel, resultType, jobId) {
            try {
                  const clicked = await page.evaluate(({ label, resType }) => {
                        const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
                        const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                        let targetTable = null;
                        if (resType === 'Main') {
                              targetTable = document.getElementById('radlstProgram');
                        } else if (resType === 'Revaluation') {
                              targetTable = document.getElementById('radlstRevalProg');
                        } else if (resType === 'Challenge') {
                              targetTable = document.getElementById('ChallengeRbtnList');
                        }

                        if (!targetTable) {
                              const allTables = document.querySelectorAll('table');
                              for (const table of allTables) {
                                    const container = table.closest('div') || table.parentElement;
                                    const prevEl = table.previousElementSibling;
                                    const textBefore = ((prevEl ? prevEl.innerText : '') + ' ' + (container ? container.innerText : '')).toLowerCase();
                                    const isMain = resType === 'Main' && textBefore.includes('main result');
                                    const isReval = resType === 'Revaluation' && textBefore.includes('revaluation');
                                    const isChal = resType === 'Challenge' && textBefore.includes('challenge');
                                    if (isMain || isReval || isChal) {
                                          targetTable = table;
                                          break;
                                    }
                              }
                        }

                        let searchIn = [];
                        if (targetTable) {
                              searchIn = Array.from(targetTable.querySelectorAll('input[type="radio"]'));
                        }
                        if (searchIn.length === 0) {
                              const groupName = resType === 'Revaluation' ? 'radlstRevalProg' : (resType === 'Challenge' ? 'ChallengeRbtnList' : 'radlstProgram');
                              searchIn = Array.from(document.querySelectorAll(`input[type="radio"][name="${groupName}"]`));
                        }
                        if (searchIn.length === 0) {
                              searchIn = Array.from(document.querySelectorAll('input[type="radio"]'));
                        }

                        const targetNorm = normalize(label);
                        const targetClean = clean(label);

                        const getRadioTexts = (radio) => {
                              const td = radio.closest('td');
                              const labelEl = (td && td.querySelector('label')) || document.querySelector(`label[for="${radio.id}"]`);
                              const tdText = td ? normalize(td.innerText) : '';
                              const labelText = labelEl ? normalize(labelEl.innerText) : '';
                              return { tdText, labelText, primaryText: labelText || tdText };
                        };

                        // 1. Exact match
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              if (tdText === targetNorm || labelText === targetNorm) {
                                    radio.click();
                                    return { success: true, matched: primaryText };
                              }
                        }

                        // 2. Clean match
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              if ((tdText && clean(tdText) === targetClean) || (labelText && clean(labelText) === targetClean)) {
                                    radio.click();
                                    return { success: true, matched: primaryText };
                              }
                        }

                        // 3. StartsWith match
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              const matchText = labelText || tdText;
                              if (matchText.startsWith(targetNorm + ' ') || matchText === targetNorm) {
                                    radio.click();
                                    return { success: true, matched: primaryText };
                              }
                        }

                        // 4. Word boundary match
                        const escaped = targetNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              const matchText = labelText || tdText;
                              if (regex.test(matchText)) {
                                    radio.click();
                                    return { success: true, matched: primaryText };
                              }
                        }

                        return { success: false };
                  }, { label: rgpvLabel, resType: resultType });

                  if (clicked && clicked.success) {
                        this.log(jobId, `✓ Selected programme radio: "${clicked.matched}"`);
                        return true;
                  }
            } catch (e) {
                  logger.warn('_clickProgrammeRadio evaluate error:', e.message);
            }
            return false;
      }

      async _listAllRadioLabels(page) {
            try {
                  return await page.evaluate(() => {
                        const labels = new Set();
                        document.querySelectorAll('input[type="radio"]').forEach(r => {
                              const td = r.closest('td');
                              if (td) {
                                    const t = td.innerText.trim().replace(/\s+/g, ' ');
                                    if (t) labels.add(t);
                              }
                        });
                        return [...labels];
                  });
            } catch { return []; }
      }

      async resolveInitialEntryUrl(page, jobConfig, jobId) {
            const directUrl = getDirectUrl(jobConfig.course, jobConfig.resultMode || 'Grading');
            this.log(jobId, `📚 Course: "${jobConfig.course}" | Mode: "${jobConfig.resultMode || 'Grading'}"`);
            this.log(jobId, `Attempting direct URL: ${directUrl}`);

            try {
                  await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
                  await this.delay(1200);
                  if (await this.isOnEntryForm(page)) {
                        this._resolvedEntryUrl = directUrl;
                        this.log(jobId, `✓ Direct URL active for all tabs: ${directUrl}`);
                        return { success: true, url: directUrl };
                  }
            } catch (e) {
                  this.log(jobId, `⚠ Direct URL check failed: ${e.message}, falling back to ProgramSelect`, 'warn');
            }

            const sel = await this.selectProgramme(page, jobConfig, jobId);
            if (sel.success) {
                  this._resolvedEntryUrl = sel.url;
            }
            return sel;
      }

      // ── CAPTCHA Solving on a Specific Tab ─────────────────────────────────────────
      async autoSolveCaptchaOnTab(page, jobId, enrollment, tabId) {
            for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
                  this.log(jobId, `[Tab ${tabId}] OCR CAPTCHA attempt ${attempt}/${MAX_CAPTCHA_RETRIES} for ${enrollment}`);
                  this.emitCaptchaStatus(jobId, 'solving', `Tab ${tabId}: Attempt ${attempt}/${MAX_CAPTCHA_RETRIES}`);

                  const captchaImg = await this.findCaptchaImg(page);
                  if (!captchaImg) {
                        this.log(jobId, `[Tab ${tabId}] CAPTCHA image element not found on page`, 'warn');
                        return { solved: false, reason: 'CAPTCHA image not found' };
                  }

                  const ocrText = await solveCaptchaFromElement(captchaImg)
                        || await solveCaptchaFromElement(page, CAPTCHA_IMG_SELECTORS);

                  // RGPV CAPTCHA is strictly 5 characters. Do not submit short or incomplete strings.
                  if (!ocrText || ocrText.length !== 5) {
                        this.log(jobId, `[Tab ${tabId}] OCR returned non-5-char text: "${ocrText || ''}", refreshing CAPTCHA image...`, 'warn');
                        await this._refreshCaptcha(page);
                        continue;
                  }

                  this.log(jobId, `[Tab ${tabId}] OCR result: "${ocrText}" — filling input`);
                  this.emitCaptchaStatus(jobId, 'filling', `Tab ${tabId}: ${ocrText}`);

                  const captchaInput = await page.$('input[name="ctl00$ContentPlaceHolder1$TextBox1"]')
                        || await page.$('#ctl00_ContentPlaceHolder1_TextBox1');
                  if (!captchaInput) {
                        return { solved: false, reason: 'CAPTCHA input not found' };
                  }

                  await captchaInput.click({ clickCount: 3 });
                  await captchaInput.fill('');
                  await captchaInput.type(ocrText, { delay: 60 });

                  page._lastAlert = null;
                  const submitBtn = await page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                  if (submitBtn) {
                        await submitBtn.click();
                        this.log(jobId, `[Tab ${tabId}] Submitted with CAPTCHA="${ocrText}", waiting for response...`);

                        const startWait = Date.now();
                        while (Date.now() - startWait < 8000) {
                              await this.delay(400);
                              if (page._lastAlert) break;
                              if (await this.isResultDisplayed(page)) break;
                              if (!(await this.isOnEntryForm(page))) break;
                        }
                  }

                  if (page._lastAlert) {
                        const alert = page._lastAlert;
                        this.log(jobId, `[Tab ${tabId}] Alert: "${alert}"`, 'warn');

                        if (/wrong text/i.test(alert) || /invalid captcha/i.test(alert) || /wrong captcha/i.test(alert)) {
                              this.emitCaptchaStatus(jobId, 'wrong', `Tab ${tabId}: ${ocrText}`);
                              await this.delay(1200);
                              await this._refreshCaptcha(page);
                              continue;
                        }

                        if (/not found/i.test(alert)) {
                              return { solved: true, text: ocrText, alertText: alert };
                        }
                  }

                  if (await this.isResultDisplayed(page) || !(await this.isOnEntryForm(page))) {
                        this.log(jobId, `✓ [Tab ${tabId}] CAPTCHA solved with "${ocrText}"! Result loaded.`);
                        this.emitCaptchaStatus(jobId, 'solved', `Tab ${tabId}: ${ocrText}`);
                        return { solved: true, text: ocrText, alertText: page._lastAlert };
                  }

                  await this._refreshCaptcha(page);
            }

            return { solved: false, reason: `OCR failed after ${MAX_CAPTCHA_RETRIES} attempts` };
      }

      async waitForManualCaptchaOnTab(page, jobId, enrollment, tabId) {
            this.log(jobId, `[Tab ${tabId}] Manual verification assistance requested for ${enrollment}`, 'warn');
            this.emitCaptchaRequired(jobId, tabId, enrollment);

            // Bring this tab to the foreground only if not running headless
            if (process.env.HEADLESS_BROWSER === 'false') {
                  await page.bringToFront().catch(() => { });
            }

            return new Promise((resolve) => {
                  let isResolved = false;

                  const cleanup = () => {
                        isResolved = true;
                        if (pollTimer) clearInterval(pollTimer);
                        if (timeoutTimer) clearTimeout(timeoutTimer);
                        this.captchaResolvers.delete(tabId);
                  };

                  const timeoutTimer = setTimeout(() => {
                        if (!isResolved) {
                              cleanup();
                              this.log(jobId, `[Tab ${tabId}] Manual CAPTCHA wait timed out after 3 minutes`, 'warn');
                              resolve(false);
                        }
                  }, CAPTCHA_WAIT_MS);

                  this.captchaResolvers.set(tabId, (solved = true) => {
                        if (!isResolved) {
                              cleanup();
                              this.log(jobId, `✓ [Tab ${tabId}] Resume signal received`);
                              resolve(solved);
                        }
                  });

                  // Poller: auto-detect user submission or 5-char entry
                  let autoSubmitAttempted = false;
                  const pollTimer = setInterval(async () => {
                        if (isResolved || page.isClosed()) {
                              cleanup();
                              return;
                        }
                        try {
                              if (await this.isResultDisplayed(page) || !(await this.isOnEntryForm(page)) || page._lastAlert) {
                                    this.log(jobId, `✓ [Tab ${tabId}] Auto-detected result in tab — resuming automatically!`);
                                    cleanup();
                                    resolve(true);
                                    return;
                              }

                              const captchaVal = await page.$eval(
                                    'input[name="ctl00$ContentPlaceHolder1$TextBox1"], #ctl00_ContentPlaceHolder1_TextBox1',
                                    el => (el.value || '').trim()
                              ).catch(() => '');

                              if (captchaVal.length === 5 && !autoSubmitAttempted) {
                                    autoSubmitAttempted = true;
                                    this.log(jobId, `[Tab ${tabId}] 5-character CAPTCHA detected: "${captchaVal}" — auto-submitting`);
                                    const submitBtn = await page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                                    if (submitBtn) {
                                          await submitBtn.click().catch(() => { });
                                    }
                              }
                        } catch { /* ignore navigation errors */ }
                  }, 600);
            });
      }

      // ── Process Single Result on a Tab ───────────────────────────────────────────
      async fetchSingleResultOnTab(page, enrollment, jobConfig, jobId, tabId) {
            const baseResult = {
                  enrollmentNumber: enrollment,
                  collegeCode: jobConfig.collegeCode,
                  collegeName: jobConfig.collegeName,
                  branch: jobConfig.branch,
                  course: jobConfig.course,
                  semester: jobConfig.semester,
                  examinationYear: jobConfig.examinationYear,
                  examinationSession: jobConfig.examinationSession,
                  resultType: jobConfig.resultType || 'Main',
                  resultMode: jobConfig.resultMode || 'Grading',
                  fetchStatus: 'pending',
                  resultStatus: 'PENDING',
                  source: 'sourceB',
            };

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                  this.log(jobId, `[Tab ${tabId}] Attempt ${attempt}/${MAX_RETRIES} for ${enrollment}`);

                  try {
                        if (!(await this.isOnEntryForm(page))) {
                              const targetUrl = this._resolvedEntryUrl || getDirectUrl(jobConfig.course, jobConfig.resultMode || 'Grading');
                              await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
                              await this.delay(1000);
                        }

                        page._lastAlert = null;

                        // Fill enrollment
                        const enrollInput = await page.waitForSelector(
                              'input[name="ctl00$ContentPlaceHolder1$txtrollno"]',
                              { state: 'visible', timeout: 10000 }
                        );
                        await enrollInput.click({ clickCount: 3 });
                        await enrollInput.fill('');
                        await enrollInput.type(enrollment, { delay: 60 });

                        // Select semester
                        const semSel = await page.$('select[name="ctl00$ContentPlaceHolder1$drpSemester"]');
                        if (semSel) {
                              const semStr = String(jobConfig.semester);
                              await semSel.selectOption({ label: semStr })
                                    .catch(() => semSel.selectOption({ value: semStr }).catch(() => { }));
                        }

                        await this.delay(400);

                        // CAPTCHA handling
                        if (await this.isCaptchaVisible(page)) {
                              const ocrResult = await this.autoSolveCaptchaOnTab(page, jobId, enrollment, tabId);

                              if (ocrResult.solved) {
                                    if (ocrResult.alertText && /not found/i.test(ocrResult.alertText)) {
                                          baseResult.fetchStatus = 'missing';
                                          baseResult.resultStatus = 'NOT_FOUND';
                                          await this.clickReset(page);
                                          return baseResult;
                                    }

                                    const scraped = await this.scrapeResult(page, enrollment);
                                    if (scraped) {
                                          Object.assign(baseResult, scraped);
                                          baseResult.fetchStatus = 'completed';
                                          baseResult.fetchedAt = new Date();
                                          this.log(jobId, `✓ [Tab ${tabId}] ${enrollment} → ${baseResult.resultStatus} SGPA=${baseResult.sgpa}`);
                                          await this.clickReset(page);
                                          return baseResult;
                                    }

                                    continue;
                              } else {
                                    if (process.env.HEADLESS_BROWSER !== 'false') {
                                          baseResult.fetchStatus = 'pending';
                                          baseResult.errorMessage = 'OCR auto-solve failed, queued for automatic re-fetch';
                                          this.log(jobId, `[Tab ${tabId}] ${enrollment}: OCR failed — resetting form for clean re-fetch`, 'warn');
                                          await this.clickReset(page);
                                          return baseResult;
                                    }
                                    const manualSolved = await this.waitForManualCaptchaOnTab(page, jobId, enrollment, tabId);
                                    if (!manualSolved) {
                                          baseResult.fetchStatus = 'pending';
                                          baseResult.errorMessage = 'CAPTCHA verification timed out, marked as pending';
                                          await this.clickReset(page);
                                          return baseResult;
                                    }
                                    await this.delay(1500);
                              }
                        } else {
                              page._lastAlert = null;
                              const submitBtn = await page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                              if (submitBtn) {
                                    await submitBtn.click();
                                    await this.delay(2500);
                              }
                        }

                        // Check alert
                        if (page._lastAlert) {
                              const alert = page._lastAlert;
                              if (/not found/i.test(alert)) {
                                    baseResult.fetchStatus = 'missing';
                                    baseResult.resultStatus = 'NOT_FOUND';
                                    await this.clickReset(page);
                                    return baseResult;
                              }
                              if (/wrong text/i.test(alert) || /captcha/i.test(alert)) {
                                    await this.delay(RETRY_DELAY_MS);
                                    continue;
                              }
                        }

                        // Scrape result
                        const scraped = await this.scrapeResult(page, enrollment);
                        if (scraped) {
                              Object.assign(baseResult, scraped);
                              baseResult.fetchStatus = 'completed';
                              baseResult.fetchedAt = new Date();
                              this.log(jobId, `✓ [Tab ${tabId}] ${enrollment} → ${baseResult.resultStatus} SGPA=${baseResult.sgpa}`);
                              await this.clickReset(page);
                              return baseResult;
                        }

                        if (await this.isOnEntryForm(page)) {
                              this.log(jobId, `[Tab ${tabId}] Result did not appear, retrying...`, 'warn');
                              await this.delay(RETRY_DELAY_MS);
                              continue;
                        }

                        baseResult.fetchStatus = 'portal_error';
                        baseResult.errorMessage = 'Result page content not found';
                        return baseResult;

                  } catch (err) {
                        this.log(jobId, `[Tab ${tabId}] Attempt ${attempt} error: ${err.message}`, 'error');
                        if (attempt < MAX_RETRIES) {
                              await this.delay(RETRY_DELAY_MS);
                              this.setupDialogHandlerForPage(page, tabId);
                        } else {
                              baseResult.fetchStatus = 'network_error';
                              baseResult.errorMessage = err.message;
                        }
                  }
            }

            return baseResult;
      }

      // ── Tab State Getters ─────────────────────────────────────────────────────────
      getTabsStatus() {
            return this.tabs.map(t => ({
                  tabId: t.tabId,
                  tabName: t.tabName,
                  enrollmentNumber: t.enrollmentNumber || '—',
                  status: t.status,
                  message: t.message || '',
            }));
      }

      getActiveTabsCount() {
            return this.tabs.length;
      }

      getProcessingCount() {
            return this.tabs.filter(t => t.status === 'Processing').length;
      }

      // ── Concurrent Queue Worker Pool ──────────────────────────────────────────────
      /**
       * Primary execution method:
       * Launches ONE Chrome window, opens up to MAX_PARALLEL_TABS tabs, and processes
       * the pending enrollment queue concurrently. Each completed tab immediately picks
       * up the next student from the queue.
       */
      async processConcurrentQueue(job, pendingEnrollments, onResult, onTabUpdate, demoMode = false, options = {}) {
            const queue = [...pendingEnrollments];
            const totalToProcess = queue.length;
            const numTabs = Math.min(totalToProcess, this.maxTabs);
            const reusableTabs = options.reuseTabs && this.browser && this.browser.isConnected()
                  ? this.tabs.filter(tab => tab.page && !tab.page.isClosed()).slice(0, numTabs)
                  : [];
            const reuseExistingTabs = reusableTabs.length === numTabs;

            if (reuseExistingTabs) {
                  for (const tab of this.tabs) {
                        if (!reusableTabs.includes(tab) && tab.page && !tab.page.isClosed()) {
                              await tab.page.close().catch(() => { });
                        }
                  }
            } else {
                  for (const tab of this.tabs) {
                        if (tab.page && !tab.page.isClosed()) {
                              await tab.page.close().catch(() => { });
                        }
                  }
            }

            this.log(job._id, `Starting concurrent queue: ${totalToProcess} students with ${numTabs} tabs in 1 Chrome window`);

            // Initialize tab state registry
            if (reuseExistingTabs) {
                  this.tabs = reusableTabs.map((tab, index) => ({
                        ...tab,
                        tabId: index + 1,
                        tabName: `Tab ${index + 1}`,
                        enrollmentNumber: null,
                        status: 'Waiting',
                        message: 'Standing by',
                  }));
            } else {
                  this.tabs = [];
                  for (let i = 0; i < numTabs; i++) {
                        this.tabs.push({
                              tabId: i + 1,
                              tabName: `Tab ${i + 1}`,
                              page: null,
                              enrollmentNumber: null,
                              status: 'Waiting',
                              message: 'Standing by',
                        });
                  }
            }

            onTabUpdate(this.getTabsStatus());

            // ── DEMO MODE BRANCH ───────────────────────────────────────────────────────
            if (demoMode) {
                  this.log(job._id, `[Demo Mode] Running ${numTabs} concurrent simulated workers`);

                  const runDemoWorker = async (tab) => {
                        while (!this.isCancelled && queue.length > 0) {
                              const ok = await this.waitWhilePaused();
                              if (!ok) break;

                              const enrollment = queue.shift();
                              if (!enrollment) break;

                              tab.enrollmentNumber = enrollment;
                              tab.status = 'Processing';
                              tab.message = `Processing ${enrollment}`;
                              onTabUpdate(this.getTabsStatus());

                              // Realistic processing delay (600-1400ms)
                              await this.delay(600 + Math.random() * 800);

                              const resultData = this.generateDemoResult(enrollment, job);
                              await onResult(resultData, tab.tabId, enrollment);

                              tab.status = 'Completed';
                              tab.message = `${resultData.resultStatus} (SGPA: ${resultData.sgpa})`;
                              onTabUpdate(this.getTabsStatus());

                              await this.delay(200);
                        }
                        tab.status = 'Waiting';
                        tab.enrollmentNumber = null;
                        tab.message = 'Finished assigned';
                        onTabUpdate(this.getTabsStatus());
                  };

                  const demoWorkers = this.tabs.map(tab => runDemoWorker(tab));
                  await Promise.all(demoWorkers);
                  return;
            }

            // ── LIVE MODE BRANCH (Real Playwright Browser with 20 Tabs) ────────────────
            try {
                  await this.launchBrowser();

                  if (reuseExistingTabs) {
                        this.log(job._id, `Reusing ${numTabs} existing tabs in the same Chrome window`);
                        for (const tab of this.tabs) {
                              tab.page.setDefaultTimeout(PAGE_TIMEOUT);
                              this.setupDialogHandlerForPage(tab.page, tab.tabId);
                        }
                  } else {
                        // Create Tab 1 first and resolve the entry URL
                        const firstPage = await this.context.newPage();
                        firstPage.setDefaultTimeout(PAGE_TIMEOUT);
                        this.setupDialogHandlerForPage(firstPage, 1);
                        this.tabs[0].page = firstPage;

                        this.tabs[0].status = 'Processing';
                        this.tabs[0].message = 'Resolving portal entry form';
                        onTabUpdate(this.getTabsStatus());

                        const initNav = await this.resolveInitialEntryUrl(firstPage, job, job._id);
                        if (!initNav.success && !this._resolvedEntryUrl) {
                              throw new Error(`Failed to initialize portal entry form: ${initNav.error}`);
                        }

                        // Spawn the remaining tabs in the SAME single window
                        for (let i = 1; i < numTabs; i++) {
                              const page = await this.context.newPage();
                              page.setDefaultTimeout(PAGE_TIMEOUT);
                              this.setupDialogHandlerForPage(page, i + 1);
                              this.tabs[i].page = page;

                              // Navigate each tab to the resolved entry URL with a slight stagger
                              if (this._resolvedEntryUrl) {
                                    page.goto(this._resolvedEntryUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }).catch(() => { });
                              }
                              await this.delay(200);
                        }
                  }

                  this.log(job._id, `✓ All ${numTabs} tabs open and ready in single Chrome window`);

                  // ── Worker Tab Loop ────────────────────────────────────────────────────
                  const runWorkerTab = async (tab) => {
                        const tabId = tab.tabId;
                        const page = tab.page;

                        while (!this.isCancelled) {
                              const ok = await this.waitWhilePaused();
                              if (!ok) break;

                              const enrollment = queue.shift();
                              if (!enrollment) {
                                    tab.status = 'Waiting';
                                    tab.enrollmentNumber = null;
                                    tab.message = 'Queue finished';
                                    onTabUpdate(this.getTabsStatus());
                                    break;
                              }

                              tab.enrollmentNumber = enrollment;
                              tab.status = 'Processing';
                              tab.message = `Processing ${enrollment}`;
                              onTabUpdate(this.getTabsStatus());

                              try {
                                    const resultData = await this.fetchSingleResultOnTab(page, enrollment, job, job._id, tabId);
                                    await onResult(resultData, tabId, enrollment);

                                    if (resultData.fetchStatus === 'completed') {
                                          tab.status = 'Completed';
                                          tab.message = `${resultData.resultStatus} (SGPA: ${resultData.sgpa ?? '—'})`;
                                    } else if (resultData.fetchStatus === 'missing' || resultData.resultStatus === 'NOT_FOUND') {
                                          tab.status = 'Not Found';
                                          tab.message = 'Result not found on portal';
                                    } else if (resultData.fetchStatus === 'verification_required' || resultData.fetchStatus === 'pending') {
                                          tab.status = 'Pending';
                                          tab.message = resultData.errorMessage || 'Pending / CAPTCHA retry';
                                    } else if (resultData.fetchStatus === 'network_error' || resultData.fetchStatus === 'portal_error') {
                                          tab.status = 'Network Error';
                                          tab.message = resultData.errorMessage || 'Network error';
                                    } else {
                                          tab.status = 'Failed';
                                          tab.message = resultData.errorMessage || 'Failed';
                                    }
                                    onTabUpdate(this.getTabsStatus());

                                    // Brief pause before taking next student on this tab
                                    await this.delay(1200);

                              } catch (err) {
                                    logger.error(`[Tab ${tabId}] [${enrollment}] worker error: ${err.message}`);
                                    tab.status = 'Network Error';
                                    tab.message = err.message;
                                    onTabUpdate(this.getTabsStatus());

                                    const errResult = {
                                          jobId: job._id,
                                          enrollmentNumber: enrollment,
                                          fetchStatus: 'network_error',
                                          resultStatus: 'PENDING',
                                          errorMessage: err.message,
                                          fetchedAt: new Date(),
                                    };
                                    await onResult(errResult, tabId, enrollment);
                              }
                        }
                  };

                  // Run all worker tabs concurrently!
                  const workers = this.tabs.map(tab => runWorkerTab(tab));
                  await Promise.all(workers);

            } finally {
                  if (!options.keepBrowserOpen) {
                        await this.closeBrowser();
                  }
            }
      }

      // ── Demo Result Generator ─────────────────────────────────────────────────────
      generateDemoResult(enrollment, jobConfig) {
            const pool = ['PASS', 'PASS', 'PASS', 'PASS', 'FAIL'];
            const status = pool[Math.floor(Math.random() * pool.length)];
            const sgpa = status === 'PASS'
                  ? parseFloat((6 + Math.random() * 4).toFixed(2))
                  : parseFloat((3 + Math.random() * 3).toFixed(2));
            const cgpa = parseFloat((sgpa * (0.9 + Math.random() * 0.1)).toFixed(2));

            const subjects = ['Mathematics-III', 'Data Structures', 'OS', 'Computer Networks', 'Software Engineering']
                  .map((name, i) => {
                        const passed = status === 'PASS' || i < 4;
                        return {
                              subjectCode: `${(jobConfig.branch || 'CS').substring(0, 2).toUpperCase()}${jobConfig.semester || '4'}0${i + 1}`,
                              subjectName: `[DEMO] ${name}`,
                              internalMarks: Math.floor(20 + Math.random() * 30),
                              externalMarks: Math.floor(passed ? 32 : 10 + Math.random() * 22),
                              practicalMarks: Math.floor(15 + Math.random() * 10),
                              credits: 4,
                              grade: passed ? ['O', 'A+', 'A', 'B+', 'B'][Math.floor(Math.random() * 5)] : 'F',
                        };
                  });

            return {
                  enrollmentNumber: enrollment,
                  studentName: `[DEMO] Student ${enrollment.slice(-4)}`,
                  collegeCode: jobConfig.collegeCode,
                  collegeName: jobConfig.collegeName,
                  branch: jobConfig.branch,
                  course: jobConfig.course,
                  semester: jobConfig.semester,
                  examinationYear: jobConfig.examinationYear,
                  examinationSession: jobConfig.examinationSession,
                  resultType: jobConfig.resultType || 'Main',
                  resultMode: jobConfig.resultMode || 'Grading',
                  subjects,
                  sgpa,
                  cgpa,
                  totalCredits: 20,
                  backlogs: subjects.filter(s => s.grade === 'F').length,
                  resultStatus: status,
                  fetchStatus: 'completed',
                  source: 'demo',
                  fetchedAt: new Date(),
            };
      }
}

module.exports = ResultFetcherService;
