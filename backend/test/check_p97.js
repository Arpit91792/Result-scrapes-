const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');
const { createStudentParser } = require('../src/services/trConverter/studentParser');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VI sem Regular June 2022.pdf');
  const parser = createStudentParser();
  let p97Text = '';
  await extractPdfPages(pdfPath, async (page) => {
    if (page.pageNumber === 97) {
      p97Text = page.text;
    }
    if (page.text) {
      parser.parsePage(page.text, page.pageNumber);
    }
  });

  console.log('--- RAW LINES FOR PAGE 97 ---');
  p97Text.split('\n').forEach((l, i) => {
    if (i < 30) console.log(`${i}: ${l}`);
  });

  const students = parser.getStudents();
  const bStudent = students.find(s => s.name.includes('Birendra') || s.enrollmentNumber.includes('EC203D01') || s.enrollmentNumber.includes('EC203D04'));
  console.log('--- PARSED STUDENT ---');
  console.log(JSON.stringify(bStudent, null, 2));

  const ecStudents = students.filter(s => s.enrollmentNumber.includes('EC'));
  console.log('Total EC students:', ecStudents.length);
  const sampleEC = ecStudents.find(s => s.enrollmentNumber === '0133EC191124');
  console.log('Sample EC student subjects:', Object.keys(sampleEC?.subjects || {}));
}

test().catch(console.error);
