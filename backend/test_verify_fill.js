
const { chromium } = require('playwright');
const { solveCaptchaFromElement } = require('./src/services/captchaSolver');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Navigating to ProgramSelect.aspx...');
  await page.goto('https://result.rgpv.ac.in/Result/ProgramSelect.aspx', { timeout: 30000 });

  // Select B.Tech.
  await page.evaluate(({ label }) => {
    const normalize = s => (s || '').replace(/\s+/g, ' ').trim();
    const table = document.getElementById('radlstProgram');
    for (const r of table.querySelectorAll('input[type="radio"]')) {
      const td = r.closest('td');
      if (td && normalize(td.innerText) === normalize(label)) {
        r.click();
        return;
      }
    }
  }, { label: 'B.Tech.' });

  await page.waitForTimeout(2500);
  console.log('Navigated to:', page.url());

  // Fill roll number
  const rollInput = await page.$('input[name="ctl00$ContentPlaceHolder1$txtrollno"]');
  await rollInput.fill('0133CS241001');
  console.log('Filled roll number');

  // Select semester 4
  const semSel = await page.$('select[name="ctl00$ContentPlaceHolder1$drpSemester"]');
  if (semSel) await semSel.selectOption({ label: '4' });
  console.log('Selected semester 4');

  // Find captcha image element
  const captchaImg = await page.$('#ctl00_ContentPlaceHolder1_pnlCaptcha img, img[src*="CaptchaImage"]');
  console.log('Captcha image found?', !!captchaImg);

  // Solve captcha using our new sharp + tesseract solver
  console.log('Solving captcha...');
  const ocrText = await solveCaptchaFromElement(captchaImg);
  console.log('Solved OCR text:', ocrText);

  // Fill into TextBox1
  const captchaInput = await page.$('input[name="ctl00$ContentPlaceHolder1$TextBox1"]');
  await captchaInput.click({ clickCount: 3 });
  await captchaInput.fill('');
  await captchaInput.type(ocrText, { delay: 60 });

  const finalValue = await captchaInput.inputValue();
  console.log('TextBox1 final filled value:', finalValue);

  // Save screenshot of the filled form
  await page.screenshot({ path: 'd:/SIRT RESULT/backend/filled_captcha_verification.png' });
  console.log('Screenshot saved to filled_captcha_verification.png');

  await browser.close();
})();
