const ExcelJS = require('exceljs');
const path = require('path');

async function inspect() {
  const wb = new ExcelJS.Workbook();
  const filePath = path.resolve(__dirname, '../../reference_files/test_converted.xlsx');
  await wb.xlsx.readFile(filePath);
  console.log('Worksheet count:', wb.worksheets.length);
  for (const ws of wb.worksheets) {
    console.log(`\n--- [${ws.name}] (Rows: ${ws.rowCount}, Cols: ${ws.columnCount}) ---`);
    console.log('Row 1 (Subjects):', ws.getRow(1).values.filter(Boolean));
    console.log('Row 2 (Types):', ws.getRow(2).values.filter(Boolean));
    console.log('Row 3 (Components):', ws.getRow(3).values.filter(Boolean).slice(0, 10));
    console.log('Row 4 (Student 1):', ws.getRow(4).values.filter(Boolean).slice(0, 6));
    console.log('Row 4 (Tail):', ws.getRow(4).values.filter(Boolean).slice(-4));
  }
}

inspect().catch(console.error);
