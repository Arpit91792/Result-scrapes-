/**
 * RGPV CAPTCHA Solver
 *
 * The RGPV portal uses a simple distorted alphanumeric text CAPTCHA
 * (e.g. "UFET9", "A3K2M", "A899Z") rendered as a PNG/JPEG image.
 *
 * Strategy:
 *   1. Extract the CAPTCHA image element directly from Playwright
 *   2. Preprocess with sharp:
 *      - Grayscale
 *      - Scale up 3x with lanczos3
 *      - Threshold / contrast enhancement
 *      - White border padding
 *   3. Run Tesseract OCR (tesseract.js) in single-word mode (PSM 8)
 *      with whitelist: A-Z 0-9
 *   4. Multi-pass fallback: threshold -> sharpened contrast -> raw
 *   5. Clean and return the 5-character string
 *
 * Runs locally with cached language data in tessdata/.
 */

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Cache dir for Tesseract language data
const TESSDATA_DIR = path.join(__dirname, '../../tessdata');
if (!fs.existsSync(TESSDATA_DIR)) fs.mkdirSync(TESSDATA_DIR, { recursive: true });

const OCR_POOL_SIZE = Number(process.env.OCR_POOL_SIZE || 25);
if (!Number.isInteger(OCR_POOL_SIZE) || OCR_POOL_SIZE < 1) {
      throw new Error('OCR_POOL_SIZE must be a positive integer');
}
let _workers = [];
let _availableWorkers = [];
let _waitingRequests = [];
let _poolInitialization = null;

async function createOcrWorker() {
      const worker = await createWorker('eng', 1, {
            cachePath: TESSDATA_DIR,
            logger: () => { },        // silence verbose progress logs
      });

      try {
            await worker.setParameters({
                  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
                  tessedit_pageseg_mode: '8',  // PSM_SINGLE_WORD
                  preserve_interword_spaces: '0',
            });
            return worker;
      } catch (err) {
            await worker.terminate().catch(() => { });
            throw err;
      }
}

async function initializeWorkerPool() {
      if (_workers.length === OCR_POOL_SIZE) return;
      if (_poolInitialization) return _poolInitialization;

      logger.info(`Initialising Tesseract OCR worker pool (${OCR_POOL_SIZE} workers)...`);
      _poolInitialization = (async () => {
            const results = await Promise.allSettled(
                  Array.from({ length: OCR_POOL_SIZE }, () => createOcrWorker())
            );
            const workers = results
                  .filter(result => result.status === 'fulfilled')
                  .map(result => result.value);
            const failure = results.find(result => result.status === 'rejected');

            if (failure) {
                  await Promise.all(workers.map(worker => worker.terminate().catch(() => { })));
                  throw failure.reason;
            }

            _workers = workers;
            _availableWorkers = [...workers];
            logger.info(`Tesseract OCR worker pool ready (${OCR_POOL_SIZE} workers)`);
      })();

      try {
            await _poolInitialization;
      } catch (err) {
            _poolInitialization = null;
            throw err;
      }
}

async function acquireWorker() {
      await initializeWorkerPool();
      if (_availableWorkers.length > 0) return _availableWorkers.pop();
      return new Promise(resolve => _waitingRequests.push(resolve));
}

function releaseWorker(worker) {
      if (!_workers.includes(worker)) return;
      const nextRequest = _waitingRequests.shift();
      if (nextRequest) {
            nextRequest(worker);
      } else {
            _availableWorkers.push(worker);
      }
}

async function getWorker() {
      await initializeWorkerPool();
      return _workers[0];
}

/**
 * Preprocess a CAPTCHA image buffer using sharp for optimal OCR.
 */
async function preprocessCaptcha(imageBuffer) {
      return await sharp(imageBuffer)
            .grayscale()
            .resize({ width: 175 * 3, height: 50 * 3, kernel: 'lanczos3' })
            .threshold(145)
            .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#FFFFFF' })
            .png()
            .toBuffer();
}

/**
 * Download CAPTCHA image from a URL.
 */
async function downloadCaptchaImage(imageUrl, cookieHeader) {
      const resp = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
                  'Cookie': cookieHeader || '',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'Referer': 'https://result.rgpv.ac.in/',
            },
            timeout: 15000,
      });
      return Buffer.from(resp.data);
}

/**
 * Post-clean the OCR text:
 *   - Uppercase
 *   - Remove everything except A-Z and 0-9
 *   - Trim to reasonable CAPTCHA length (3–8 chars)
 */
function cleanOcrText(raw) {
      if (!raw) return '';
      return raw
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .substring(0, 8);
}

/**
 * Multi-pass OCR on an image buffer.
 * Tries thresholded -> sharpened/contrast -> raw to reliably get 5 chars.
 */
async function solveCaptchaFromBuffer(buffer) {
      let worker = null;
      try {
            worker = await acquireWorker();

            // Pass 1: Thresholded Lanczos 3x
            const p1 = await preprocessCaptcha(buffer);
            const r1 = await worker.recognize(p1);
            const t1 = cleanOcrText(r1.data.text);
            if (t1.length === 5) {
                  logger.info(`CAPTCHA OCR (threshold): "${t1}" conf=${(r1.data.confidence || 0).toFixed(1)}%`);
                  return t1;
            }

            // Pass 2: Normalized & sharpened 3x (handles faint or broken glyphs)
            const p2 = await sharp(buffer)
                  .grayscale()
                  .resize({ width: 175 * 3, height: 50 * 3, kernel: 'lanczos3' })
                  .normalize()
                  .sharpen()
                  .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#FFFFFF' })
                  .png()
                  .toBuffer();
            const r2 = await worker.recognize(p2);
            const t2 = cleanOcrText(r2.data.text);
            if (t2.length === 5) {
                  logger.info(`CAPTCHA OCR (sharpen): "${t2}" conf=${(r2.data.confidence || 0).toFixed(1)}%`);
                  return t2;
            }

            // Pass 3: Raw image buffer
            const rRaw = await worker.recognize(buffer);
            const tRaw = cleanOcrText(rRaw.data.text);
            if (tRaw.length === 5) {
                  logger.info(`CAPTCHA OCR (raw): "${tRaw}" conf=${(rRaw.data.confidence || 0).toFixed(1)}%`);
                  return tRaw;
            }

            // Fallback: pick the best candidate >= 3 chars
            const candidates = [
                  { text: t1, conf: r1.data.confidence || 0 },
                  { text: t2, conf: r2.data.confidence || 0 },
                  { text: tRaw, conf: rRaw.data.confidence || 0 },
            ].filter(c => c.text && c.text.length >= 3);

            if (candidates.length > 0) {
                  candidates.sort((a, b) => {
                        const scoreA = (a.text.length === 5 ? 100 : a.text.length) + a.conf;
                        const scoreB = (b.text.length === 5 ? 100 : b.text.length) + b.conf;
                        return scoreB - scoreA;
                  });
                  logger.info(`CAPTCHA OCR (fallback best): "${candidates[0].text}" conf=${candidates[0].conf.toFixed(1)}%`);
                  return candidates[0].text;
            }

            const fallback = t1 || t2 || tRaw || null;
            logger.warn(`CAPTCHA OCR unable to get 5 chars, returning: "${fallback}"`);
            return fallback;
      } catch (err) {
            logger.error('solveCaptchaFromBuffer error:', err.message);
            return null;
      } finally {
            if (worker) releaseWorker(worker);
      }
}

/**
 * Given a CAPTCHA image URL and cookies, returns the solved text string.
 */
async function solveCaptcha(imageUrl, cookieHeader) {
      try {
            logger.info(`Solving CAPTCHA from URL: ${imageUrl}`);
            const rawBuffer = await downloadCaptchaImage(imageUrl, cookieHeader);
            return await solveCaptchaFromBuffer(rawBuffer);
      } catch (err) {
            logger.error('CAPTCHA solving from URL error:', err.message);
            return null;
      }
}

/**
 * Takes element screenshot directly from Playwright page or ElementHandle, then runs OCR.
 */
async function solveCaptchaFromElement(pageOrElement, captchaImgSelector) {
      try {
            let imgEl = null;

            if (pageOrElement && typeof pageOrElement.screenshot === 'function') {
                  imgEl = pageOrElement;
            } else if (pageOrElement && typeof pageOrElement.$ === 'function') {
                  const selectors = Array.isArray(captchaImgSelector)
                        ? captchaImgSelector
                        : [captchaImgSelector, '#ctl00_ContentPlaceHolder1_pnlCaptcha img', 'img[src*="CaptchaImage"]', 'img[src*="captcha"]'];
                  for (const sel of selectors) {
                        if (!sel) continue;
                        try {
                              const el = await pageOrElement.$(sel);
                              if (el && await el.isVisible()) {
                                    imgEl = el;
                                    break;
                              }
                        } catch { }
                  }
            }

            if (!imgEl) {
                  logger.warn('CAPTCHA image element not found on page');
                  return null;
            }

            const screenshotBuffer = await imgEl.screenshot({ type: 'png' });
            return await solveCaptchaFromBuffer(screenshotBuffer);
      } catch (err) {
            logger.error('CAPTCHA element OCR error:', err.message);
            return null;
      }
}

/**
 * Terminate the Tesseract worker (call on app shutdown).
 */
async function terminateWorker() {
      if (_poolInitialization) {
            await _poolInitialization.catch(() => { });
      }

      const workers = _workers;
      _workers = [];
      _availableWorkers = [];
      _poolInitialization = null;
      _waitingRequests.splice(0).forEach(resolve => resolve(null));

      await Promise.all(workers.map(worker => worker.terminate()));
      if (workers.length > 0) logger.info(`Tesseract OCR worker pool terminated (${workers.length} workers)`);
}

module.exports = {
      solveCaptcha,
      solveCaptchaFromElement,
      solveCaptchaFromBuffer,
      preprocessCaptcha,
      terminateWorker,
      getWorker,
};
