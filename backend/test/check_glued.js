const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VI sem Regular June 2022.pdf');
  const glued = [];
  await extractPdfPages(pdfPath, async (page) => {
    if (page.text) {
      const lines = page.text.split('\n');
      lines.forEach((l, idx) => {
        if (/[a-z][A-Z]{2,4}\d{3,4}\s*\[[TP]\]/i.test(l)) {
          glued.push({ page: page.pageNumber, line: l });
        }
      });
    }
  });
  console.log(`Found ${glued.length} glued lines in PDF:`);
  glued.forEach(g => console.log(`Page ${g.page}: ${g.line}`));
}

test().catch(console.error);
