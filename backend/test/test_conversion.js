const fs = require('fs');
const path = require('path');
const { extractPdfPages } = require('../src/services/trConverter/pdfExtractor');
const { parseHeader, mergeMetadata } = require('../src/services/trConverter/headerParser');
const { createStudentParser } = require('../src/services/trConverter/studentParser');
const { generateWorkbook } = require('../src/services/trConverter/excelGenerator');

async function test() {
  const pdfPath = path.resolve(__dirname, '../../reference_files/VIII Sem May 2023 Regular.pdf');
  console.log('Extracting text lines from:', pdfPath);
  let metadata = { subjects: [] };
  const studentParser = createStudentParser();

  await extractPdfPages(pdfPath, async (pageData) => {
    if (pageData.pageNumber % 30 === 0 || pageData.pageNumber === 1) {
      console.log(`Processing page ${pageData.pageNumber}/${pageData.pageCount}`);
    }
    if (pageData.text) {
      const pageMeta = parseHeader(pageData.text);
      metadata = mergeMetadata(metadata, pageMeta);
      studentParser.parsePage(pageData.text);
    }
  });

  console.log(`Master catalog has ${metadata.subjects.length} subjects.`);
  const grouped = studentParser.getGroupedStudents();
  console.log('Total students parsed:', studentParser.getStudents().length);
  console.log('Distinct subject groups (sheets):', grouped.length);
  grouped.forEach((g, idx) => {
    const sheetName = `Sheet${idx + 1}`;
    console.log(`${sheetName}: ${g.students.length} students, subjects: ${g.subjectCodes.join(', ')}`);
  });

  const job = {
    metadata,
    students: studentParser.getStudents(),
    sheetGroups: grouped.map((g, idx) => ({
      sheetName: `Sheet${idx + 1}`,
      subjectCodes: g.subjectCodes,
      students: g.students
    }))
  };

  const outPath = path.resolve(__dirname, '../../reference_files/test_converted.xlsx');
  await generateWorkbook(job, outPath);
  const stats = fs.statSync(outPath);
  console.log('Successfully wrote:', outPath, `(${stats.size} bytes)`);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
