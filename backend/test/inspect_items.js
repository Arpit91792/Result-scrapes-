const fs = require('fs');
const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VI sem Regular June 2022.pdf');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = await fs.promises.readFile(pdfPath);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const page = await doc.getPage(97);
  const content = await page.getTextContent();
  content.items.forEach(it => {
    if (/Vishwakarma|EC601/i.test(it.str)) {
      console.log('Item:', JSON.stringify({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    }
  });
}

test().catch(console.error);
