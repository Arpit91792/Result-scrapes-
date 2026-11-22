const ExcelJS = require('exceljs');
const path = require('path');

async function checkD() {
  const wb = new ExcelJS.Workbook();
  const filePath = path.resolve(__dirname, '../../reference_files/test_converted.xlsx');
  await wb.xlsx.readFile(filePath);
  let foundTarget = false;
  let totalDInWorkbook = 0;

  for (const ws of wb.worksheets) {
    let wsDCount = 0;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 3) {
        const enr = String(row.getCell(2).value || '');
        if (enr.includes('3D') || /D\d+$/.test(enr)) {
          wsDCount++;
          totalDInWorkbook++;
          if (enr.toUpperCase() === '0133CS203D05') {
            foundTarget = true;
            console.log(`TARGET FOUND in ${ws.name} at row ${rowNumber}:`, {
              sNo: row.getCell(1).value,
              enr: row.getCell(2).value,
              name: row.getCell(3).value,
              sampleMarks: [
                row.getCell(4).value,
                row.getCell(5).value,
                row.getCell(6).value,
                row.getCell(7).value
              ]
            });
          }
        }
      }
    });
    console.log(`${ws.name} has ${wsDCount} lateral/diploma students`);
  }
  console.log('Total lateral students found across all sheets:', totalDInWorkbook);
  console.log('Target 0133CS203D05 included:', foundTarget);
}

checkD().catch(console.error);
