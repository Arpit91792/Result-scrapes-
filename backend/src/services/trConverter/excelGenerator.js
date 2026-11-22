const ExcelJS = require('exceljs');
const path = require('path');

const BLACK = 'FF000000';
const BORDER_BLACK = {
      top: { style: 'thin', color: { argb: BLACK } },
      left: { style: 'thin', color: { argb: BLACK } },
      bottom: { style: 'thin', color: { argb: BLACK } },
      right: { style: 'thin', color: { argb: BLACK } },
};

function formatSubjectHeader(code, masterCatalog = new Map()) {
      const type = code.includes('[P]') ? 'Practical' : 'Theory';
      const baseCode = code.replace(/\s*\[[TP]\]/i, '').trim();
      let masterName = masterCatalog.get(baseCode) || baseCode;
      if (type === 'Practical' && !masterName.toLowerCase().includes('lab') && !masterName.toLowerCase().includes('project')) {
            masterName += ' Lab';
      }
      const label = `${masterName}(${baseCode})`;
      const fields = type === 'Practical'
            ? ['End Practical(30)', 'PQS(20)', 'Grade']
            : ['End Theory(70)', 'mid Sem(20)', 'assignment(10)', 'Grade'];
      return { code, baseCode, type, label, fields };
}

async function generateWorkbook(job, outputPath) {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'RGPV TR Converter';
      workbook.subject = 'Tabulation Register Conversion';

      // Build master catalog lookup map
      const masterCatalog = new Map();
      for (const s of (job.metadata?.subjects || [])) {
            if (s && s.code && s.name) {
                  masterCatalog.set(s.code, s.name);
            }
      }

      // Identify groups: either pre-computed sheetGroups or create from job.students
      let groups = job.sheetGroups;
      if (!groups || !groups.length) {
            const tempMap = new Map();
            for (const student of (job.students || [])) {
                  const subCodes = Object.keys(student.subjects || {}).sort();
                  const sig = subCodes.join('|');
                  if (!tempMap.has(sig)) {
                        tempMap.set(sig, { signature: sig, subjectCodes: subCodes, students: [] });
                  }
                  tempMap.get(sig).students.push(student);
            }
            groups = [...tempMap.values()].sort((a, b) => b.students.length - a.students.length);
      }

      // If still no groups, create default fallback
      if (!groups.length) {
            groups = [{
                  signature: '',
                  subjectCodes: (job.subjects || []).map(s => s.code),
                  students: job.students || [],
            }];
      }

      let sheetIndex = 1;
      for (const group of groups) {
            if (!group.students || !group.students.length) continue;

            const sheetName = `Sheet${sheetIndex++}`;
            const worksheet = workbook.addWorksheet(sheetName, {
                  views: [{ state: 'frozen', xSplit: 3, ySplit: 3 }],
                  pageSetup: {
                        orientation: 'landscape',
                        fitToPage: true,
                        fitToWidth: 1,
                        fitToHeight: 0,
                        paperSize: 9,
                  },
            });

            // Map and sort subjects: Theory first, then Practical
            const subjects = (group.subjectCodes || [])
                  .map(code => formatSubjectHeader(code, masterCatalog))
                  .sort((a, b) => {
                        if (a.type === b.type) return a.baseCode.localeCompare(b.baseCode);
                        return a.type === 'Theory' ? -1 : 1;
                  });

            // Determine column ranges
            let colIdx = 4;
            for (const sub of subjects) {
                  sub.startCol = colIdx;
                  sub.endCol = colIdx + sub.fields.length - 1;
                  colIdx = sub.endCol + 1;
            }
            const cgpaCol = colIdx++;
            const sgpaCol = colIdx++;
            const lastCol = sgpaCol;

            // Merges for Rows 1 - 3
            worksheet.mergeCells(1, 1, 3, 1);
            worksheet.mergeCells(1, 2, 3, 2);
            worksheet.mergeCells(1, 3, 3, 3);
            worksheet.getCell(1, 1).value = 'S No.';
            worksheet.getCell(1, 2).value = 'Enrollment No.';
            worksheet.getCell(1, 3).value = 'Name';

            for (const sub of subjects) {
                  worksheet.mergeCells(1, sub.startCol, 1, sub.endCol);
                  worksheet.getCell(1, sub.startCol).value = sub.label;

                  worksheet.mergeCells(2, sub.startCol, 2, sub.endCol);
                  worksheet.getCell(2, sub.startCol).value = sub.type === 'Theory' ? 'Therory' : 'Practical';

                  sub.fields.forEach((field, fIdx) => {
                        worksheet.getCell(3, sub.startCol + fIdx).value = field;
                  });
            }

            worksheet.mergeCells(1, cgpaCol, 3, cgpaCol);
            worksheet.getCell(1, cgpaCol).value = 'CGPA';
            worksheet.mergeCells(1, sgpaCol, 3, sgpaCol);
            worksheet.getCell(1, sgpaCol).value = 'SGPA';

            // Apply styling to header rows (1 - 3)
            for (let r = 1; r <= 3; r++) {
                  const row = worksheet.getRow(r);
                  row.height = r === 1 ? 58.5 : r === 2 ? 24.75 : 28;
                  for (let c = 1; c <= lastCol; c++) {
                        const cell = row.getCell(c);
                        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BLACK } };
                        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                        cell.border = BORDER_BLACK;
                  }
            }

            // Set column widths
            worksheet.getColumn(1).width = 7;
            worksheet.getColumn(2).width = 17;
            worksheet.getColumn(3).width = 28;
            for (const sub of subjects) {
                  sub.fields.forEach((field, idx) => {
                        worksheet.getColumn(sub.startCol + idx).width = field === 'Grade' ? 8 : 11;
                  });
            }
            worksheet.getColumn(cgpaCol).width = 9;
            worksheet.getColumn(sgpaCol).width = 9;

            // Student rows (Row 4 onwards)
            let sNo = 1;
            for (const student of group.students) {
                  const rowVals = [sNo++, student.enrollmentNumber || '', student.name || ''];
                  for (const sub of subjects) {
                        const sData = student.subjects?.[sub.code] || {};
                        if (sub.type === 'Theory') {
                              rowVals.push(
                                    sData['End Theory(70)'] ?? sData.endTheory ?? '',
                                    sData['mid Sem(20)'] ?? sData.midSem ?? '',
                                    sData['assignment(10)'] ?? sData.assignment ?? '',
                                    sData.Grade ?? sData.grade ?? ''
                              );
                        } else {
                              rowVals.push(
                                    sData['End Practical(30)'] ?? sData.endPractical ?? '',
                                    sData['PQS(20)'] ?? sData.sessional ?? '',
                                    sData.Grade ?? sData.grade ?? ''
                              );
                        }
                  }
                  rowVals.push(student.cgpa ?? '', student.sgpa ?? '');

                  const row = worksheet.addRow(rowVals);
                  row.height = 20;
                  for (let c = 1; c <= lastCol; c++) {
                        const cell = row.getCell(c);
                        cell.font = { name: 'Calibri', size: 10 };
                        cell.border = BORDER_BLACK;
                        cell.alignment = {
                              horizontal: c === 3 ? 'left' : 'center',
                              vertical: 'middle',
                              wrapText: true,
                        };
                  }
            }
      }

      await workbook.xlsx.writeFile(outputPath);
      return path.basename(outputPath);
}

module.exports = { generateWorkbook };
