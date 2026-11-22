const ExcelJS = require('exceljs');
const path = require('path');

async function test() {
  const wb = new ExcelJS.Workbook();
  const filePath = path.resolve(__dirname, '../../reference_files/test_vi_sem_converted.xlsx');
  await wb.xlsx.readFile(filePath);
  console.log('Worksheet count:', wb.worksheets.length);
  wb.worksheets.forEach(ws => console.log(`   - ${ws.name} (Students: ${ws.rowCount - 3})`));

  const ws4 = wb.getWorksheet('Sheet4');
  let birendraFound = null;
  ws4.eachRow((row, rowNumber) => {
    if (rowNumber > 3) {
      const enr = String(row.getCell(2).value || '');
      const name = String(row.getCell(3).value || '');
      if (enr.includes('203D04') || name.includes('Birendra')) {
        birendraFound = {
          row: rowNumber,
          sNo: row.getCell(1).value,
          enr,
          name,
          ec601_T: row.getCell(4).value,
          ec601_mid: row.getCell(5).value,
          ec601_asg: row.getCell(6).value,
          ec601_grade: row.getCell(7).value,
          sgpa: row.getCell(ws4.columnCount - 1).value,
          cgpa: row.getCell(ws4.columnCount).value
        };
      }
    }
  });

  console.log('\n--- Birendra in Sheet4 ---');
  console.log(JSON.stringify(birendraFound, null, 2));
}

test().catch(console.error);
