/**
 * Excel Export Service using ExcelJS
 * Generates professionally formatted workbooks for RGPV results
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const HEADER_FILL = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
};

const HEADER_FONT = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
      size: 11,
      name: 'Calibri',
};

const PASS_FILL = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8F5E9' },
};

const FAIL_FILL = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFEBEE' },
};

const MISSING_FILL = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF3E0' },
};

function applyHeaderStyle(worksheet) {
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
            cell.fill = HEADER_FILL;
            cell.font = HEADER_FONT;
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = {
                  top: { style: 'thin', color: { argb: 'FF000000' } },
                  left: { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: { style: 'thin', color: { argb: 'FF000000' } },
                  right: { style: 'thin', color: { argb: 'FF000000' } },
            };
      });
      headerRow.height = 30;
}

function getStatusFill(status) {
      if (status === 'PASS') return PASS_FILL;
      if (status === 'FAIL') return FAIL_FILL;
      if (['NOT_FOUND', 'PENDING', 'ERROR'].includes(status)) return MISSING_FILL;
      return null;
}

function addInfoSheet(workbook, job) {
      const infoSheet = workbook.addWorksheet('Examination Info');
      infoSheet.columns = [
            { header: 'Field', key: 'field', width: 25 },
            { header: 'Value', key: 'value', width: 40 },
      ];

      applyHeaderStyle(infoSheet);

      const info = [
            ['University', job.university || 'RGPV'],
            ['College Code', job.collegeCode],
            ['College Name', job.collegeName || ''],
            ['Course', job.course],
            ['Branch', job.branch],
            ['Semester', job.semester],
            ['Examination Year', job.examinationYear],
            ['Examination Session', job.examinationSession],
            ['Result Type', job.resultType || 'Main'],
            ['Result Mode', job.resultMode || 'Grading'],
            ['Total Students', job.totalStudents],
            ['Passed', job.passedCount || 0],
            ['Failed', job.failedCount || 0],
            ['Missing', job.missingCount || 0],
            ['Generated On', new Date().toLocaleString()],
      ];

      info.forEach(([field, value]) => {
            infoSheet.addRow({ field, value });
      });

      infoSheet.autoFilter = { from: 'A1', to: 'B1' };
      infoSheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addStudentsSheet(workbook, sheetName, students, includeSubjects = false) {
      const ws = workbook.addWorksheet(sheetName);

      const baseColumns = [
            { header: 'S.No', key: 'sno', width: 7 },
            { header: 'Enrollment No', key: 'enrollmentNumber', width: 18 },
            { header: 'Student Name', key: 'studentName', width: 28 },
            { header: 'College Code', key: 'collegeCode', width: 14 },
            { header: 'Branch', key: 'branch', width: 10 },
            { header: 'Semester', key: 'semester', width: 10 },
            { header: 'SGPA', key: 'sgpa', width: 10 },
            { header: 'CGPA', key: 'cgpa', width: 10 },
            { header: 'Total Credits', key: 'totalCredits', width: 14 },
            { header: 'Backlogs', key: 'backlogs', width: 10 },
            { header: 'Result Status', key: 'resultStatus', width: 15 },
            { header: 'Fetch Status', key: 'fetchStatus', width: 18 },
            { header: 'Source', key: 'source', width: 12 },
            { header: 'Fetched At', key: 'fetchedAt', width: 20 },
      ];

      ws.columns = baseColumns;
      applyHeaderStyle(ws);
      ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + baseColumns.length)}1` };
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      students.forEach((s, idx) => {
            const rowData = {
                  sno: idx + 1,
                  enrollmentNumber: s.enrollmentNumber || '',
                  studentName: s.studentName || (s.fetchStatus === 'missing' ? 'NOT FOUND' : ''),
                  collegeCode: s.collegeCode || '',
                  branch: s.branch || '',
                  semester: s.semester || '',
                  sgpa: s.sgpa != null ? s.sgpa : '',
                  cgpa: s.cgpa != null ? s.cgpa : '',
                  totalCredits: s.totalCredits != null ? s.totalCredits : '',
                  backlogs: s.backlogs != null ? s.backlogs : '',
                  resultStatus: s.resultStatus || 'PENDING',
                  fetchStatus: s.fetchStatus || 'pending',
                  source: s.source || '',
                  fetchedAt: s.fetchedAt ? new Date(s.fetchedAt).toLocaleString() : '',
            };

            const row = ws.addRow(rowData);

            const fill = getStatusFill(s.resultStatus);
            if (fill) {
                  row.eachCell((cell) => {
                        cell.fill = fill;
                  });
            }

            row.getCell('sno').alignment = { horizontal: 'center' };
            row.getCell('semester').alignment = { horizontal: 'center' };
            row.getCell('sgpa').alignment = { horizontal: 'center' };
            row.getCell('cgpa').alignment = { horizontal: 'center' };
            row.getCell('backlogs').alignment = { horizontal: 'center' };
            row.getCell('resultStatus').alignment = { horizontal: 'center' };
            row.getCell('fetchStatus').alignment = { horizontal: 'center' };
      });

      return ws;
}

function addSubjectSheet(workbook, students) {
      const ws = workbook.addWorksheet('Subject Wise Marks');
      ws.columns = [
            { header: 'Enrollment No', key: 'enrollmentNumber', width: 18 },
            { header: 'Student Name', key: 'studentName', width: 28 },
            { header: 'Subject Code', key: 'subjectCode', width: 14 },
            { header: 'Subject Name', key: 'subjectName', width: 32 },
            { header: 'Internal', key: 'internalMarks', width: 11 },
            { header: 'External', key: 'externalMarks', width: 11 },
            { header: 'Practical', key: 'practicalMarks', width: 11 },
            { header: 'Total', key: 'totalMarks', width: 10 },
            { header: 'Credits', key: 'credits', width: 10 },
            { header: 'Grade', key: 'grade', width: 10 },
      ];

      applyHeaderStyle(ws);
      ws.autoFilter = { from: 'A1', to: 'J1' };
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      students.forEach((s) => {
            if (s.subjects && s.subjects.length > 0) {
                  s.subjects.forEach((sub) => {
                        ws.addRow({
                              enrollmentNumber: s.enrollmentNumber,
                              studentName: s.studentName || '',
                              subjectCode: sub.subjectCode || '',
                              subjectName: sub.subjectName || '',
                              internalMarks: sub.internalMarks != null ? sub.internalMarks : '',
                              externalMarks: sub.externalMarks != null ? sub.externalMarks : '',
                              practicalMarks: sub.practicalMarks != null ? sub.practicalMarks : '',
                              totalMarks: sub.totalMarks != null ? sub.totalMarks : '',
                              credits: sub.credits != null ? sub.credits : '',
                              grade: sub.grade || '',
                        });
                  });
            }
      });
}

function addAnalyticsSheet(workbook, students, job) {
      const ws = workbook.addWorksheet('Performance Analytics');
      ws.getColumn('A').width = 30;
      ws.getColumn('B').width = 20;

      const headerRow = ws.getRow(1);
      headerRow.getCell(1).value = 'Performance Analytics';
      headerRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
      ws.mergeCells('A1:B1');

      const total = students.length;
      const passed = students.filter(s => s.resultStatus === 'PASS').length;
      const failed = students.filter(s => s.resultStatus === 'FAIL').length;
      const missing = students.filter(s => ['NOT_FOUND', 'PENDING'].includes(s.resultStatus)).length;
      const withResults = students.filter(s => s.sgpa != null);
      const avgSgpa = withResults.length
            ? (withResults.reduce((acc, s) => acc + parseFloat(s.sgpa || 0), 0) / withResults.length).toFixed(2)
            : 'N/A';
      const maxSgpa = withResults.length ? Math.max(...withResults.map(s => parseFloat(s.sgpa || 0))).toFixed(2) : 'N/A';
      const minSgpa = withResults.length ? Math.min(...withResults.map(s => parseFloat(s.sgpa || 0))).toFixed(2) : 'N/A';
      const passPercent = total > 0 ? ((passed / total) * 100).toFixed(1) : 0;

      const rows = [
            ['', ''],
            ['Total Students', total],
            ['Passed', passed],
            ['Failed', failed],
            ['Missing / Not Found', missing],
            ['Pass Percentage', `${passPercent}%`],
            ['', ''],
            ['Average SGPA', avgSgpa],
            ['Highest SGPA', maxSgpa],
            ['Lowest SGPA', minSgpa],
            ['', ''],
            ['College Code', job.collegeCode],
            ['Branch', job.branch],
            ['Semester', job.semester],
            ['Exam Session', `${job.examinationSession} ${job.examinationYear}`],
      ];

      rows.forEach(([label, value]) => {
            const r = ws.addRow([label, value]);
            if (label) {
                  r.getCell(1).font = { bold: true };
            }
      });
}

/**
 * Generate complete Excel workbook for a job.
 */
async function generateExcelReport(job, students, outputDir) {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RGPV Smart Bulk Result Manager';
      workbook.lastModifiedBy = 'RGPV Smart Bulk Result Manager';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Sheets
      addInfoSheet(workbook, job);
      addStudentsSheet(workbook, 'All Students', students);
      addStudentsSheet(workbook, 'Passed Students', students.filter(s => s.resultStatus === 'PASS'));
      addStudentsSheet(workbook, 'Failed Students', students.filter(s => s.resultStatus === 'FAIL'));
      addStudentsSheet(workbook, 'Missing Results', students.filter(s =>
            ['NOT_FOUND', 'PENDING', 'ERROR'].includes(s.resultStatus) || s.fetchStatus !== 'completed'
      ));
      addSubjectSheet(workbook, students);
      addAnalyticsSheet(workbook, students, job);

      if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
      }

      const fileName = `RGPV_Results_${job.collegeCode}_${job.branch}_Sem${job.semester}_${job.examinationSession}${job.examinationYear}_${Date.now()}.xlsx`;
      const filePath = path.join(outputDir, fileName);

      await workbook.xlsx.writeFile(filePath);
      return { fileName, filePath };
}

/**
 * Generate a focused Excel file (passed/failed only).
 */
async function generateFilteredExcel(job, students, filter, outputDir) {
      let filtered;
      let label;

      switch (filter) {
            case 'passed':
                  filtered = students.filter(s => s.resultStatus === 'PASS');
                  label = 'Passed';
                  break;
            case 'failed':
                  filtered = students.filter(s => s.resultStatus === 'FAIL');
                  label = 'Failed';
                  break;
            default:
                  filtered = students;
                  label = 'All';
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RGPV Smart Bulk Result Manager';
      addInfoSheet(workbook, job);
      addStudentsSheet(workbook, `${label} Students`, filtered);
      addSubjectSheet(workbook, filtered);

      if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
      }

      const fileName = `RGPV_${label}_${job.collegeCode}_Sem${job.semester}_${Date.now()}.xlsx`;
      const filePath = path.join(outputDir, fileName);
      await workbook.xlsx.writeFile(filePath);
      return { fileName, filePath };
}

module.exports = { generateExcelReport, generateFilteredExcel };
