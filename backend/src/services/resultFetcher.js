/**
 * RGPV Result Fetcher Service
 *
 * Portal: https://result.rgpv.ac.in/Result/ProgramSelect.aspx
 *
 * CAPTCHA AUTO-SOLVE APPROACH:
 *   The RGPV portal uses a simple distorted alphanumeric text CAPTCHA.
 *   From the screenshot we can see it renders text like "UFET9" in
 *   a fixed-width image with mild distortion.
 *
 *   Auto-solve flow:
 *     1. Detect the CAPTCHA image element on page
 *     2. Take a Playwright screenshot of just that element
 *     3. Preprocess with Jimp (greyscale → contrast → binarise → scale 3x)
 *     4. Run Tesseract.js OCR with whitelist "A-Z0-9"
 *     5. Fill the cleaned OCR text into the CAPTCHA input
 *     6. Submit form
 *     7. If alert says "wrong text" → retry OCR up to MAX_CAPTCHA_RETRIES times
 *     8. If OCR repeatedly fails → pause and notify user for manual solve
 *
 * VERIFIED FORM SELECTORS (from live portal HTML):
 *   Enrollment:  input[name="ctl00$ContentPlaceHolder1$txtrollno"]
 *   Semester:    select[name="ctl00$ContentPlaceHolder1$drpSemester"]
 *   CAPTCHA img: #ctl00_ContentPlaceHolder1_pnlCaptcha img  (or table/tr/td/div/img)
 *   CAPTCHA inp: input[name="ctl00$ContentPlaceHolder1$TextBox1"]
 *   Submit btn:  input[name="ctl00$ContentPlaceHolder1$btnviewresult"]
 *   Reset btn:   #ctl00_ContentPlaceHolder1_btnReset
 *   Name:        #ctl00_ContentPlaceHolder1_lblNameGrading
 *   Roll:        #ctl00_ContentPlaceHolder1_lblRollNoGrading
 *   Result:      #ctl00_ContentPlaceHolder1_lblResultNewGrading
 *   SGPA:        #ctl00_ContentPlaceHolder1_lblSGPA
 *   CGPA:        #ctl00_ContentPlaceHolder1_lblcgpa
 */

const { chromium } = require('playwright');
const logger = require('../utils/logger');
const { getDirectUrl, getRgpvLabel } = require('../utils/rgpvCourseMap');
const { solveCaptchaFromElement, terminateWorker } = require('./captchaSolver');

const PROGRAM_SELECT_URL = 'https://result.rgpv.ac.in/Result/ProgramSelect.aspx';
const PAGE_TIMEOUT = 30000;
const CAPTCHA_WAIT_MS = 180000; // 3 min manual fallback
const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 3;
const MAX_CAPTCHA_RETRIES = 5;  // attempts before falling back to manual

// Selectors for the CAPTCHA image — try in order until one works
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
            this.page = null;
            this.isPaused = false;
            this.isCancelled = false;
            this.captchaResolveCallback = null;
            this._currentUrl = null;
            this._lastAlert = null;
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

      emitCaptchaRequired(jobId) {
            if (this.io) {
                  this.io.to(`job_${jobId}`).emit('captcha_required', {
                        jobId,
                        message: 'Auto OCR failed after multiple attempts. Please solve the CAPTCHA in the browser window, then click Resume.',
                        timestamp: new Date().toISOString(),
                  });
            }
      }

      resolveCaptchaWait() {
            if (this.captchaResolveCallback) {
                  this.captchaResolveCallback(true);
                  this.captchaResolveCallback = null;
            }
      }

      // ── Browser lifecycle ─────────────────────────────────────────────────────────
      async launchBrowser() {
            this.log('system', 'Launching Chromium browser');
            this.browser = await chromium.launch({
                  headless: false,  // headed so user can monitor / manually solve if OCR fails
                  args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
                  timeout: 30000,
            });
            this.context = await this.browser.newContext({ viewport: null });
            this.page = await this.context.newPage();
            this.page.setDefaultTimeout(PAGE_TIMEOUT);
            logger.info('Browser launched');
            return this.page;
      }

      async closeBrowser() {
            try {
                  if (this.browser) {
                        await this.browser.close();
                        this.browser = null; this.context = null; this.page = null;
                  }
            } catch (e) { logger.warn('Browser close:', e.message); }
      }

      async ensureBrowser() {
            if (!this.browser || !this.page || this.page.isClosed()) {
                  await this.closeBrowser();
                  await this.launchBrowser();
            }
      }

      // ── Utilities ─────────────────────────────────────────────────────────────────
      delay(ms) { return new Promise(r => setTimeout(r, ms)); }

      async waitWhilePaused() {
            while (this.isPaused && !this.isCancelled) await this.delay(400);
            return !this.isCancelled;
      }

      pause() { this.isPaused = true; }
      resume() { this.isPaused = false; }
      stop() { this.isCancelled = true; this.isPaused = false; }

      setupDialogHandler() {
            if (!this.page) return;
            this._lastAlert = null;
            this.page.removeAllListeners('dialog');
            this.page.on('dialog', async (dialog) => {
                  this._lastAlert = dialog.message();
                  logger.info(`[Dialog] "${dialog.message()}"`);
                  await dialog.accept();
            });
      }

      // ── Check if result is displayed on page ──────────────────────────────────────
      async isResultDisplayed() {
            try {
                  const el = await this.page.$(
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

      // ── Check if on result entry form ─────────────────────────────────────────────
      async isOnEntryForm() {
            try {
                  if (await this.isResultDisplayed()) return false;
                  const rollInput = await this.page.$('input[name="ctl00$ContentPlaceHolder1$txtrollno"]');
                  return rollInput ? await rollInput.isVisible() : false;
            } catch { return false; }
      }

      // ── Find CAPTCHA image element ────────────────────────────────────────────────
      async findCaptchaImg() {
            for (const sel of CAPTCHA_IMG_SELECTORS) {
                  try {
                        const el = await this.page.$(sel);
                        if (el && await el.isVisible()) return el;
                  } catch { /* try next */ }
            }
            return null;
      }

      // ── Check if CAPTCHA is visible ───────────────────────────────────────────────
      async isCaptchaVisible() {
            try {
                  // Check the CAPTCHA panel
                  const panel = await this.page.$('#ctl00_ContentPlaceHolder1_pnlCaptcha');
                  if (panel && await panel.isVisible()) return true;
                  // Check the input field
                  const inp = await this.page.$('input[name="ctl00$ContentPlaceHolder1$TextBox1"]');
                  return inp ? await inp.isVisible() : false;
            } catch { return false; }
      }

      // ── AUTO OCR CAPTCHA SOLVE ────────────────────────────────────────────────────
      /**
       * Automatically solve the CAPTCHA using Tesseract OCR.
       *
       * Returns:
       *   { solved: true, text: 'UFET9' }   — OCR succeeded and form submitted
       *   { solved: false, reason: '...' }  — OCR failed, caller decides what to do
       */
      async autoSolveCaptcha(jobId, enrollment) {
            for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
                  this.log(jobId, `OCR CAPTCHA attempt ${attempt}/${MAX_CAPTCHA_RETRIES} for ${enrollment}`);
                  this.emitCaptchaStatus(jobId, 'solving', `Attempt ${attempt}/${MAX_CAPTCHA_RETRIES}`);

                  // Find the CAPTCHA image
                  const captchaImg = await this.findCaptchaImg();
                  if (!captchaImg) {
                        this.log(jobId, 'CAPTCHA image element not found on page', 'warn');
                        return { solved: false, reason: 'CAPTCHA image not found' };
                  }

                  // Run OCR on the element screenshot
                  const ocrText = await solveCaptchaFromElement(captchaImg)
                        || await solveCaptchaFromElement(this.page, CAPTCHA_IMG_SELECTORS);

                  if (!ocrText || ocrText.length < 3) {
                        this.log(jobId, `OCR returned empty/short text: "${ocrText}", retrying...`, 'warn');
                        await this.delay(1000);
                        // Refresh CAPTCHA image (sometimes reloading helps)
                        await this._refreshCaptcha();
                        continue;
                  }

                  this.log(jobId, `OCR result: "${ocrText}" — filling into CAPTCHA input`);
                  this.emitCaptchaStatus(jobId, 'filling', ocrText);

                  // Fill CAPTCHA input
                  const captchaInput = await this.page.$('input[name="ctl00$ContentPlaceHolder1$TextBox1"]')
                        || await this.page.$('#ctl00_ContentPlaceHolder1_TextBox1');
                  if (!captchaInput) {
                        this.log(jobId, 'CAPTCHA input not found on page', 'warn');
                        return { solved: false, reason: 'CAPTCHA input not found' };
                  }

                  await captchaInput.click({ clickCount: 3 });
                  await captchaInput.fill('');
                  await captchaInput.type(ocrText, { delay: 60 });

                  // Submit
                  this._lastAlert = null;
                  const submitBtn = await this.page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                  if (submitBtn) {
                        await submitBtn.click();
                        this.log(jobId, `Submitted with CAPTCHA="${ocrText}", waiting for portal response...`);

                        // Wait up to 10 seconds for alert, result display, or form update
                        const startWait = Date.now();
                        while (Date.now() - startWait < 10000) {
                              await this.delay(500);
                              if (this._lastAlert) break;
                              if (await this.isResultDisplayed()) break;
                              if (!(await this.isOnEntryForm())) break;
                        }
                  }

                  // Check if CAPTCHA was wrong
                  if (this._lastAlert) {
                        const alert = this._lastAlert;
                        this.log(jobId, `Alert after CAPTCHA submit: "${alert}"`, 'warn');

                        // "wrong text" means CAPTCHA was incorrect
                        if (/wrong text/i.test(alert) || /invalid captcha/i.test(alert) || /wrong captcha/i.test(alert)) {
                              this.log(jobId, `OCR CAPTCHA "${ocrText}" was wrong, retrying...`, 'warn');
                              this.emitCaptchaStatus(jobId, 'wrong', ocrText);
                              await this.delay(1200);
                              // Refresh CAPTCHA image for next attempt
                              await this._refreshCaptcha();
                              continue;
                         }

                        // "not found" means CAPTCHA was correct but enrollment not found
                        if (/not found/i.test(alert)) {
                              return { solved: true, text: ocrText, alertText: alert };
                        }
                  }

                  // If result is displayed or page navigated away from form → success
                  if (await this.isResultDisplayed() || !(await this.isOnEntryForm())) {
                        this.log(jobId, `✓ CAPTCHA solved with OCR text "${ocrText}"! Result page loaded.`);
                        this.emitCaptchaStatus(jobId, 'solved', ocrText);
                        return { solved: true, text: ocrText, alertText: this._lastAlert };
                  }

                  // Still on form after submit — CAPTCHA might have been wrong silently
                  this.log(jobId, 'Still on entry form after submit, retrying CAPTCHA...', 'warn');
                  await this._refreshCaptcha();
            }

            this.log(jobId, `OCR failed after ${MAX_CAPTCHA_RETRIES} attempts`, 'warn');
            this.emitCaptchaStatus(jobId, 'failed', '');
            return { solved: false, reason: `OCR failed after ${MAX_CAPTCHA_RETRIES} attempts` };
      }

      /**
       * OCR directly from a Playwright element handle.
       * Falls back when solveCaptchaFromElement can't find selector.
       */
      async _ocrFromElement(elementHandle, jobId) {
            try {
                  const { solveCaptchaFromElement } = require('./captchaSolver');
                  const text = await solveCaptchaFromElement(elementHandle);
                  if (text) {
                        this.log(jobId, `Element OCR result: "${text}"`);
                  }
                  return text || null;
            } catch (e) {
                  logger.warn('_ocrFromElement:', e.message);
                  return null;
            }
      }

      /**
       * Refresh the CAPTCHA image by clicking it or reloading the src.
       * Some portals support this, some don't.
       */
      async _refreshCaptcha() {
            try {
                  // Try clicking the CAPTCHA image to refresh it
                  const img = await this.findCaptchaImg();
                  if (img) {
                        await img.click();
                        await this.delay(800);
                  }
            } catch { /* ignore */ }
      }

      /**
       * Manual fallback: wait for user to solve CAPTCHA in the browser window.
       * Automatically detects when the CAPTCHA is filled or submitted so the user
       * does NOT need to switch back and click the "Resume" button every time!
       */
      async waitForManualCaptcha(jobId) {
            this.log(jobId, 'Manual CAPTCHA assistance: please verify/solve CAPTCHA in browser window (auto-detecting submit...)', 'warn');
            this.emitCaptchaRequired(jobId);

            return new Promise((resolve) => {
                  let isResolved = false;

                  const cleanup = () => {
                        isResolved = true;
                        if (pollTimer) clearInterval(pollTimer);
                        if (timeoutTimer) clearTimeout(timeoutTimer);
                        this.captchaResolveCallback = null;
                  };

                  const timeoutTimer = setTimeout(() => {
                        if (!isResolved) {
                              cleanup();
                              this.log(jobId, 'Manual CAPTCHA timed out after 3 minutes', 'warn');
                              resolve(false);
                        }
                  }, CAPTCHA_WAIT_MS);

                  // User clicked "Resume After Manual CAPTCHA" button on dashboard
                  this.captchaResolveCallback = (solved) => {
                        if (!isResolved) {
                              cleanup();
                              this.log(jobId, '✓ Resume signal received from dashboard button');
                              resolve(solved);
                        }
                  };

                  // Active poller in the browser: auto-detects when CAPTCHA is submitted or result loads
                  let autoSubmitAttempted = false;
                  const pollTimer = setInterval(async () => {
                        if (isResolved || !this.page || this.page.isClosed()) {
                              cleanup();
                              return;
                        }
                        try {
                              // 1. Result displayed or navigated away or alert shown
                              if (await this.isResultDisplayed() || !(await this.isOnEntryForm()) || this._lastAlert) {
                                    this.log(jobId, '✓ Auto-detected result/submission in browser window — resuming automatically!');
                                    cleanup();
                                    resolve(true);
                                    return;
                              }

                              // 2. If CAPTCHA input has a 5-char value already filled and hasn't been submitted yet
                              const captchaVal = await this.page.$eval(
                                    'input[name="ctl00$ContentPlaceHolder1$TextBox1"], #ctl00_ContentPlaceHolder1_TextBox1',
                                    el => (el.value || '').trim()
                              ).catch(() => '');

                              if (captchaVal.length === 5 && !autoSubmitAttempted) {
                                    autoSubmitAttempted = true;
                                    this.log(jobId, `Auto-submitting filled CAPTCHA "${captchaVal}" in browser...`);
                                    const submitBtn = await this.page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                                    if (submitBtn) {
                                          await submitBtn.click().catch(() => {});
                                          const waitStart = Date.now();
                                          while (Date.now() - waitStart < 5000) {
                                                await this.delay(400);
                                                if (await this.isResultDisplayed() || !(await this.isOnEntryForm()) || this._lastAlert) {
                                                      this.log(jobId, '✓ Submission succeeded — resuming automatically!');
                                                      cleanup();
                                                      resolve(true);
                                                      return;
                                                }
                                          }
                                    }
                              }
                        } catch { /* ignore poll errors */ }
                  }, 800);
            });
      }

      // ── DYNAMIC PROGRAMME SELECTION ───────────────────────────────────────────────
      async selectProgramme(jobConfig, jobId) {
            const course = jobConfig.course;
            const resultType = jobConfig.resultType || 'Main';
            const rgpvLabel = getRgpvLabel(course);

            if (!rgpvLabel) {
                  this.log(jobId, `❌ No RGPV label mapping for course: "${course}"`, 'error');
                  return { success: false, error: `Course "${course}" is not supported.` };
            }

            this.log(jobId, `🔍 ProgramSelect: Looking for "${rgpvLabel}" in "${resultType}" section`);

            try {
                  await this.page.goto(PROGRAM_SELECT_URL, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
                  await this.delay(1500);

                  // Try section-aware click first, then broad scan
                  let clicked = await this._clickProgrammeRadio(rgpvLabel, resultType, jobId);

                  if (!clicked) {
                        const available = await this._listAllRadioLabels();
                        this.log(jobId,
                              `❌ Programme "${rgpvLabel}" not found. Available: ${available.join(', ')}`, 'error'
                        );
                        return {
                              success: false,
                              error: `Programme "${course}" not found on RGPV page. Available: ${available.join(', ')}`,
                        };
                  }

                  // Wait for navigation
                  await this.delay(2500);

                  if (!(await this.isOnEntryForm())) {
                        await this.delay(2000);
                        if (!(await this.isOnEntryForm())) {
                              return { success: false, error: 'Programme selected but result form did not appear' };
                        }
                  }

                  this._currentUrl = this.page.url();
                  this.log(jobId, `✓ Programme selected successfully → ${this._currentUrl}`);
                  return { success: true };

            } catch (e) {
                  this.log(jobId, `❌ Programme selection error: ${e.message}`, 'error');
                  return { success: false, error: e.message };
            }
      }

      async _clickProgrammeRadio(rgpvLabel, resultType, jobId) {
            try {
                  const clicked = await this.page.evaluate(({ label, resType }) => {
                        const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
                        const clean = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                        // Map section to RGPV's well-known ASP.NET table IDs
                        let targetTable = null;
                        if (resType === 'Main') {
                              targetTable = document.getElementById('radlstProgram');
                        } else if (resType === 'Revaluation') {
                              targetTable = document.getElementById('radlstRevalProg');
                        } else if (resType === 'Challenge') {
                              targetTable = document.getElementById('ChallengeRbtnList');
                        }

                        // Fallback: scan table containers if ID was not found
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

                        // Radios to search: target table first, or section-named radios, or all radios
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

                        // 1. Exact text match
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              if (tdText === targetNorm || labelText === targetNorm) {
                                    radio.click();
                                    return { success: true, matched: primaryText, radioId: radio.id };
                              }
                        }

                        // 2. Clean match (alphanumeric only: handles "B.Tech." vs "B.Tech", spacing, dots)
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              if ((tdText && clean(tdText) === targetClean) || (labelText && clean(labelText) === targetClean)) {
                                    radio.click();
                                    return { success: true, matched: primaryText, radioId: radio.id };
                              }
                        }

                        // 3. StartsWith match (safely check with word boundary/space)
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              const matchText = labelText || tdText;
                              if (matchText.startsWith(targetNorm + ' ') || matchText === targetNorm) {
                                    radio.click();
                                    return { success: true, matched: primaryText, radioId: radio.id };
                              }
                        }

                        // 4. Whole-word boundary regex match
                        const escaped = targetNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
                        for (const radio of searchIn) {
                              const { tdText, labelText, primaryText } = getRadioTexts(radio);
                              const matchText = labelText || tdText;
                              if (regex.test(matchText)) {
                                    radio.click();
                                    return { success: true, matched: primaryText, radioId: radio.id };
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
                  this.log(jobId, `⚠ Error during programme selection: ${e.message}`, 'warn');
            }
            return false;
      }

      async _listAllRadioLabels() {
            try {
                  return await this.page.evaluate(() => {
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

      // ── Navigate to result entry form ─────────────────────────────────────────────
      async navigateToResultPage(jobConfig, jobId) {
            const directUrl = getDirectUrl(jobConfig.course, jobConfig.resultMode || 'Grading');
            this.log(jobId, `📚 Course: "${jobConfig.course}" | Mode: "${jobConfig.resultMode || 'Grading'}" | Type: "${jobConfig.resultType || 'Main'}"`);
            this.log(jobId, `Trying direct URL: ${directUrl}`);

            try {
                  await this.page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT });
                  await this.delay(1500);
                  if (await this.isOnEntryForm()) {
                        this._currentUrl = directUrl;
                        this.log(jobId, `✓ Direct URL worked: ${directUrl}`);
                        return { success: true };
                  }
            } catch (e) {
                  this.log(jobId, `⚠ Direct URL failed: ${e.message}, trying ProgramSelect`, 'warn');
            }

            return await this.selectProgramme(jobConfig, jobId);
      }

      // ── Reset / navigate back ─────────────────────────────────────────────────────
      async clickReset() {
            try {
                  const btn = await this.page.$('#ctl00_ContentPlaceHolder1_btnReset');
                  if (btn && await btn.isVisible()) { await btn.click(); await this.delay(1200); return; }
            } catch { /* ignore */ }
            if (this._currentUrl) {
                  await this.page.goto(this._currentUrl, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT }).catch(() => { });
                  await this.delay(1000);
            }
      }

      // ── Element text helper ───────────────────────────────────────────────────────
      async getText(selector) {
            try {
                  const el = await this.page.$(selector);
                  if (!el) return null;
                  return (await el.innerText()).trim() || null;
            } catch { return null; }
      }

      parseFloat_(str) {
            if (!str) return null;
            const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
            return isNaN(n) ? null : n;
      }

      // ── Scrape subjects ───────────────────────────────────────────────────────────
      async scrapeSubjects() {
            const subjects = [];
            try {
                  for (const panelId of [
                        '#ctl00_ContentPlaceHolder1_pnlGrading',
                        '#ctl00_ContentPlaceHolder1_pnlshowRslt',
                        '#ctl00_ContentPlaceHolder1_GridView1',
                  ]) {
                        const panel = await this.page.$(panelId);
                        if (!panel) continue;

                        const rows = await panel.$$('table tbody tr, table tr');
                        for (const row of rows) {
                              const cells = await row.$$('td');
                              if (cells.length < 3) continue;
                              const vals = await Promise.all(cells.map(c => c.innerText().then(t => t.trim()).catch(() => '')));
                              const first = vals[0].toLowerCase();
                              if (!first || first === 's.no' || first.includes('subject') || first.includes('code')) continue;
                              const offset = /^\d{1,2}$/.test(vals[0]) ? 1 : 0;
                              const code = vals[offset];
                              if (!code || code.length < 2) continue;
                              if (/^(sgpa|cgpa|total|grand|result|pass|fail)/i.test(code)) continue;
                              subjects.push({
                                    subjectCode: code,
                                    subjectName: vals[offset + 1] || '',
                                    internalMarks: this.parseFloat_(vals[offset + 2]),
                                    externalMarks: this.parseFloat_(vals[offset + 3]),
                                    practicalMarks: this.parseFloat_(vals[offset + 4]),
                                    totalMarks: this.parseFloat_(vals[offset + 5]),
                                    credits: this.parseFloat_(vals[offset + 6]),
                                    grade: vals[offset + 7] || vals[vals.length - 1] || null,
                              });
                        }
                        if (subjects.length > 0) break;
                  }
            } catch (e) { logger.warn('scrapeSubjects:', e.message); }
            return subjects;
      }

      // ── Scrape result page ────────────────────────────────────────────────────────
      async scrapeResult(enrollment) {
            try {
                  const studentName = await this.getText('#ctl00_ContentPlaceHolder1_lblNameGrading')
                        || await this.getText('#ctl00_ContentPlaceHolder1_lblName');
                  const rollNo = await this.getText('#ctl00_ContentPlaceHolder1_lblRollNoGrading') || enrollment;
                  const resultText = await this.getText('#ctl00_ContentPlaceHolder1_lblResultNewGrading')
                        || await this.getText('#ctl00_ContentPlaceHolder1_lblResult');
                  const sgpaText = await this.getText('#ctl00_ContentPlaceHolder1_lblSGPA')
                        || await this.getText('#ctl00_ContentPlaceHolder1_lblsgpa');
                  const cgpaText = await this.getText('#ctl00_ContentPlaceHolder1_lblcgpa')
                        || await this.getText('#ctl00_ContentPlaceHolder1_lblCGPA');

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
                  const subjects = await this.scrapeSubjects();
                  const backlogs = subjects.filter(s => s.grade === 'F' || s.grade === 'FF').length;
                  const totalCredits = subjects.reduce((s, sub) => s + (sub.credits || 0), 0) || null;

                  return {
                        studentName: studentName || '', enrollmentNumber: rollNo || enrollment,
                        sgpa, cgpa, resultStatus, subjects, backlogs, totalCredits, rawResultText: resultText
                  };
            } catch (e) { logger.error('scrapeResult:', e.message); return null; }
      }

      // ── MAIN: fetch single result ─────────────────────────────────────────────────
      async fetchSingleResult(enrollment, jobConfig, jobId) {
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

            await this.ensureBrowser();
            this.setupDialogHandler();

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                  this.log(jobId, `Attempt ${attempt}/${MAX_RETRIES} for ${enrollment}`);

                  try {
                        // ── Navigate to result entry form ────────────────────────────────
                        if (!(await this.isOnEntryForm())) {
                              const nav = await this.navigateToResultPage(jobConfig, jobId);
                              if (!nav.success) {
                                    baseResult.fetchStatus = 'portal_error';
                                    baseResult.errorMessage = nav.error;
                                    return baseResult;
                              }
                        }

                        await this.delay(500);
                        this._lastAlert = null;

                        // ── Fill enrollment number ────────────────────────────────────────
                        const enrollInput = await this.page.waitForSelector(
                              'input[name="ctl00$ContentPlaceHolder1$txtrollno"]',
                              { state: 'visible', timeout: 10000 }
                        );
                        await enrollInput.click({ clickCount: 3 });
                        await enrollInput.fill('');
                        await enrollInput.type(enrollment, { delay: 80 });
                        this.log(jobId, `Filled enrollment: ${enrollment}`);

                        // ── Select semester ───────────────────────────────────────────────
                        const semSel = await this.page.$('select[name="ctl00$ContentPlaceHolder1$drpSemester"]');
                        if (semSel) {
                              const semStr = String(jobConfig.semester);
                              await semSel.selectOption({ label: semStr })
                                    .catch(() => semSel.selectOption({ value: semStr }).catch(() => { }));
                              this.log(jobId, `Selected semester: ${semStr}`);
                        }

                        // ── Handle CAPTCHA ────────────────────────────────────────────────
                        await this.delay(500);

                        if (await this.isCaptchaVisible()) {
                              this.log(jobId, 'CAPTCHA detected — attempting auto OCR solve');
                              this.emitCaptchaStatus(jobId, 'detected', '');

                              const ocrResult = await this.autoSolveCaptcha(jobId, enrollment);

                              if (ocrResult.solved) {
                                    // Check if it was "not found" (CAPTCHA correct, enrollment missing)
                                    if (ocrResult.alertText && /not found/i.test(ocrResult.alertText)) {
                                          baseResult.fetchStatus = 'missing';
                                          baseResult.resultStatus = 'NOT_FOUND';
                                          await this.clickReset();
                                          return baseResult;
                                    }

                                    // CAPTCHA solved and page navigated — scrape result
                                    const scraped = await this.scrapeResult(enrollment);
                                    if (scraped) {
                                          Object.assign(baseResult, scraped);
                                          baseResult.fetchStatus = 'completed';
                                          baseResult.fetchedAt = new Date();
                                          this.log(jobId, `✓ ${enrollment} → ${baseResult.resultStatus} SGPA=${baseResult.sgpa}`);
                                          this.emitCaptchaStatus(jobId, 'completed', '');
                                          await this.clickReset();
                                          return baseResult;
                                    }

                                    // Page might still be on form — fall through to retry
                                    this.log(jobId, 'CAPTCHA solved but result not found on page, retrying...', 'warn');
                                    continue;

                              } else {
                                    // OCR failed — fall back to manual
                                    this.log(jobId, `OCR failed: ${ocrResult.reason} — requesting manual solve`, 'warn');
                                    const manualSolved = await this.waitForManualCaptcha(jobId);
                                    if (!manualSolved) {
                                          baseResult.fetchStatus = 'verification_required';
                                          baseResult.errorMessage = 'CAPTCHA timed out (auto OCR failed and manual timed out)';
                                          return baseResult;
                                    }
                                    this.log(jobId, 'Manual CAPTCHA resolved by user, checking result...');
                                    await this.delay(1500);
                              }
                        } else {
                              // No CAPTCHA — submit directly
                              this._lastAlert = null;
                              const submitBtn = await this.page.$('input[name="ctl00$ContentPlaceHolder1$btnviewresult"]');
                              if (submitBtn) {
                                    await submitBtn.click();
                                    this.log(jobId, 'No CAPTCHA — submitted form directly');
                                    await this.delay(3000);
                              }
                        }

                        // ── Check alert ───────────────────────────────────────────────────
                        if (this._lastAlert) {
                              const alert = this._lastAlert;
                              this.log(jobId, `Alert: "${alert}"`, 'warn');
                              if (/not found/i.test(alert)) {
                                    baseResult.fetchStatus = 'missing';
                                    baseResult.resultStatus = 'NOT_FOUND';
                                    await this.clickReset();
                                    return baseResult;
                              }
                              if (/wrong text/i.test(alert) || /captcha/i.test(alert)) {
                                    await this.delay(RETRY_DELAY_MS);
                                    continue;
                              }
                        }

                        // ── Scrape result ─────────────────────────────────────────────────
                        const scraped = await this.scrapeResult(enrollment);
                        if (scraped) {
                              Object.assign(baseResult, scraped);
                              baseResult.fetchStatus = 'completed';
                              baseResult.fetchedAt = new Date();
                              this.log(jobId, `✓ ${enrollment} → ${baseResult.resultStatus} SGPA=${baseResult.sgpa}`);
                              await this.clickReset();
                              return baseResult;
                        }

                        if (await this.isOnEntryForm()) {
                              this.log(jobId, 'Result did not appear, retrying...', 'warn');
                              await this.delay(RETRY_DELAY_MS);
                              continue;
                        }

                        baseResult.fetchStatus = 'portal_error';
                        baseResult.errorMessage = 'Result page content not found';
                        return baseResult;

                  } catch (err) {
                        this.log(jobId, `Attempt ${attempt} error: ${err.message}`, 'error');
                        if (attempt < MAX_RETRIES) {
                              await this.delay(RETRY_DELAY_MS);
                              await this.ensureBrowser().catch(() => { });
                              this.setupDialogHandler();
                        } else {
                              baseResult.fetchStatus = 'network_error';
                              baseResult.errorMessage = err.message;
                        }
                  }
            }

            return baseResult;
      }

      // ── Demo result generator ─────────────────────────────────────────────────────
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
                              subjectCode: `${jobConfig.branch.substring(0, 2).toUpperCase()}${jobConfig.semester}0${i + 1}`,
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
                  subjects, sgpa, cgpa,
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
