const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VI sem Regular June 2022.pdf');
  await extractPdfPages(pdfPath, async (page) => {
    if (page.text && (page.text.includes('0133EC203D01') || page.text.includes('Birendra Kumar Vishwkarma'))) {
      console.log(`Page ${page.pageNumber}:`);
      const lines = page.text.split('\n');
      lines.forEach((l) => {
        if (/0133EC203D01|Birendra|EC601|EC602|EC603|EC604/i.test(l)) {
          console.log('   line:', l);
        }
      });
    }
  });
}

test().catch(console.error);
