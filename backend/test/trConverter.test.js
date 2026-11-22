const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { parseHeader, mergeMetadata } = require('../src/services/trConverter/headerParser');
const { buildSubjectColumns } = require('../src/services/trConverter/subjectMapper');
const { createStudentParser } = require('../src/services/trConverter/studentParser');
const { generateWorkbook } = require('../src/services/trConverter/excelGenerator');
const { createJob, getOwnedJobs, deleteJob } = require('../src/services/trConverter/jobStore');

test('detects subject codes and distinguishes practical subjects from PDF headers', () => {
      const metadata = parseHeader([
            'CIVIL ENGINEERING - VI SEMESTER JUNE 2022',
            'CS601 STRUCTURAL ENGINEERING',
            'CE602 CONCRETE TECHNOLOGY LAB',
      ].join('\n'));

      assert.equal(metadata.branch, 'Civil Engineering');
      assert.equal(metadata.semester, 'VI');
      assert.equal(metadata.examinationSession, 'JUNE');
      assert.equal(metadata.examinationYear, '2022');
      assert.deepEqual(metadata.subjects.map(subject => [subject.code, subject.type]), [
            ['CS601', 'Theory'],
            ['CE602', 'Practical'],
      ]);
});

test('groups multi-page student data and preserves absence, detention, UFM, and grade markers', () => {
      const parser = createStudentParser();
      const subjects = [
            { code: 'CS801', type: 'Theory' },
            { code: 'CS802', type: 'Theory' },
            { code: 'CS803', type: 'Practical' },
            { code: 'CS804', type: 'Practical' },
      ];

      parser.parsePage([
            '0133CE241001 ANITA SHARMA',
            'CS801 70 20 9 A#',
            'CS802 0 0 0 F (ABS)',
            'CS803 8 9 D',
      ].join('\n'), 1, 92, subjects);
      parser.parsePage([
            '0133CE241001',
            'CS804 10 5 UFM',
      ].join('\n'), 2, 91, subjects);

      const [student] = parser.getStudents();
      assert.equal(parser.getStudents().length, 1);
      assert.equal(parser.duplicateEnrollmentCount, 0);
      assert.deepEqual(student.sourcePages, [1, 2]);
      assert.equal(student.subjects.CS801.Grade, 'A#');
      assert.equal(student.subjects.CS802.Grade, 'F (ABS)');
      assert.equal(student.subjects.CS803.Grade, 'D');
      assert.equal(student.subjects.CS804.Grade, 'UFM');
      assert.equal(student.subjects.CS804['End Practical (30)'], '10');
});

test('creates data columns from dynamic subjects without filling absent values with zero', () => {
      const metadata = { subjects: [] };
      mergeMetadata(metadata, {
            subjects: [
                  { code: 'CS801', name: 'Internet of Things', type: 'Theory' },
                  { code: 'CS802', name: 'Internet of Things Lab', type: 'Practical' },
            ],
      });
      const columns = buildSubjectColumns(metadata.subjects);

      assert.deepEqual(columns.map(subject => subject.fields.length), [4, 3]);
      assert.deepEqual(columns.map(subject => subject.type), ['Theory', 'Practical']);
});

test('writes the 26-column TR template layout when six subjects are detected', async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-converter-test-'));
      const outputPath = path.join(directory, 'result.xlsx');
      try {
            const subjects = buildSubjectColumns([
                  { code: 'CS801', name: 'Internet of Things', type: 'Theory' },
                  { code: 'CS802', name: 'Cloud Computing', type: 'Theory' },
                  { code: 'CS803', name: 'Departmental Elective', type: 'Theory' },
                  { code: 'CS801L', name: 'Internet of Things Lab', type: 'Practical' },
                  { code: 'CS804L', name: 'Image Processing Lab', type: 'Practical' },
                  { code: 'CS805L', name: 'Major Project-II', type: 'Practical' },
            ]);
            await generateWorkbook({
                  subjects,
                  students: [{
                        enrollmentNumber: '0133CS171001',
                        name: 'Sample Student',
                        subjects: {
                              CS801: {
                                    'End Theory (70)': 0,
                                    Grade: 'ABS',
                              },
                        },
                  }],
            }, outputPath);

            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(outputPath);
            const sheet = workbook.getWorksheet('Tabulation Register');
            assert.equal(sheet.actualColumnCount, 26);
            assert.equal(sheet.getCell('A1').value, 'S. No.');
            assert.equal(sheet.getCell('B1').value, 'Enrollment No.');
            assert.equal(sheet.getCell('C1').value, 'Name');
            assert.equal(sheet.getCell('D1').value, 'Internet of Things (CS801)');
            assert.equal(sheet.getCell('D2').value, 'Theory');
            assert.equal(sheet.getCell('P2').value, 'Practical');
            assert.equal(sheet.getCell('D3').value, 'End Theory(70)');
            assert.equal(sheet.getCell('P3').value, 'End Practical(30)');
            assert.equal(sheet.getCell('Y1').value, 'CGPA');
            assert.equal(sheet.getCell('Z1').value, 'SGPA');
            assert.equal(sheet.getCell('A4').value, 1);
            assert.equal(sheet.getCell('B4').value, '0133CS171001');
            assert.equal(sheet.getCell('C4').value, 'Sample Student');
            assert.equal(sheet.getCell('D4').value, 0);
            assert.equal(sheet.getCell('G4').value, 'ABS');
      } finally {
            await fs.rm(directory, { recursive: true, force: true });
      }
});

test('lists all temporary TR conversions for their owner without exposing other users jobs', async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tr-converter-jobs-'));
      const first = createJob('user-one', {
            path: path.join(directory, 'first.pdf'),
            originalname: 'first.pdf',
            size: 100,
      });
      const second = createJob('user-one', {
            path: path.join(directory, 'second.pdf'),
            originalname: 'second.pdf',
            size: 200,
      });
      const privateJob = createJob('user-two', {
            path: path.join(directory, 'private.pdf'),
            originalname: 'private.pdf',
            size: 300,
      });
      try {
            first.createdAt = Date.now() - 1000;
            second.createdAt = Date.now();
            second.status = 'processing';
            const userJobs = getOwnedJobs('user-one');
            assert.deepEqual(userJobs.map(job => job.id), [second.id, first.id]);
            assert.equal(userJobs[0].status, 'processing');
            assert.equal(userJobs.some(job => job.id === privateJob.id), false);
      } finally {
            await Promise.all([first, second, privateJob].map(deleteJob));
            await fs.rm(directory, { recursive: true, force: true });
      }
});
