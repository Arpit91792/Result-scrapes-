const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VIII Sem May 2023 Regular.pdf');
  const dMatches = new Set();
  await extractPdfPages(pdfPath, async (page) => {
    if (page.text) {
      const lines = page.text.split('\n');
      for (const line of lines) {
        if (/3D\d{2}/i.test(line) || /CS203D05/i.test(line)) {
          console.log(`Page ${page.pageNumber} Line:`, line);
        }
      }
      const matches = page.text.match(/\b\d{4}[A-Z]{2,4}\d{2,3}[A-Z]\d{1,4}\b/gi);
      if (matches) {
        matches.forEach(m => dMatches.add(m.toUpperCase()));
      }
    }
  });
  console.log('Total D matches found:', dMatches.size);
  console.log('Sample D matches:', [...dMatches].slice(0, 10));
}

test().catch(console.error);
