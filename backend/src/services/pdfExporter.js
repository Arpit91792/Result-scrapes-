/**
 * Official RGPV Statement of Marks PDF Generator
 * Matches institutional RGPV Statement of Marks formatting.
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

/**
 * Parse and normalize student data for the Statement of Marks
 */
function parseStudentMarksheetData(student, job) {
      let session = student.examinationSession || (job && job.examinationSession) || 'June';
      let year = student.examinationYear || (job && job.examinationYear) || '2026';
      let course = student.course || (job && job.course) || 'B.Tech';
      let branch = student.branch || (job && job.branch) || 'CS';
      let semester = student.semester != null ? student.semester : ((job && job.semester) || '4');
      let status = 'Regular';
      let revalDate = '';
      let lateFeeDate = '';

      const validSubjects = [];

      (student.subjects || []).forEach((sub) => {
            const code = (sub.subjectCode || '').trim();
            const name = (sub.subjectName || '').trim();

            // Extract session/year & status from header artifact if embedded
            if (code.includes('Statement of Marks') || code.includes('Data Source')) {
                  const mSession = code.match(/Statement of Marks\s*-\s*([A-Za-z]+)-(\d{4})/i);
                  if (mSession) {
                        session = mSession[1];
                        year = mSession[2];
                  }
                  const mStatus = code.match(/Status\s*([A-Za-z]+)/i);
                  if (mStatus) status = mStatus[1];
                  return;
            }

            // Extract revaluation dates if present
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(code)) {
                  revalDate = code;
                  lateFeeDate = name;
                  return;
            }

            // Metadata rows from scrape artifacts
            if (['Name', 'Course', 'Semester', 'Roll No.', 'Branch', 'Status'].includes(code)) {
                  if (code === 'Status' && name) status = name;
                  return;
            }

            // Real subject row: e.g. BT401- [T], CS402- [P], BT408- [N]
            if (/^[A-Z0-9]+.*\[[TPN]\]/i.test(code) || /^[A-Z]{2,4}\s*\d{3,4}/i.test(code)) {
                  let totalCredit = sub.credits != null ? sub.credits : (parseInt(sub.subjectName, 10) || parseInt(sub.internalMarks, 10) || 0);
                  let grade = (sub.grade || '').trim();
                  let earnedCredit = totalCredit;

                  if (code.includes('[N]')) {
                        totalCredit = 0;
                        earnedCredit = 0;
                        if (!grade || grade === 'null') grade = 'NA';
                  } else if (grade === 'F' || grade.includes('ABS')) {
                        earnedCredit = 0;
                  }

                  validSubjects.push({
                        code,
                        totalCredit,
                        earnedCredit,
                        grade
                  });
            }
      });

      return {
            session,
            year,
            course,
            branch,
            semester,
            status,
            revalDate,
            lateFeeDate,
            subjects: validSubjects
      };
}

/**
 * Generate an individual student's Statement of Marks PDF matching the official format
 */
function generateStudentPDF(student, outputPath, job = null) {
      return new Promise((resolve, reject) => {
            const doc = new PDFDocument({
                  margin: 40,
                  size: 'A4',
                  autoFirstPage: true
            });

            const stream = fs.createWriteStream(outputPath);
            doc.pipe(stream);

            const info = parseStudentMarksheetData(student, job);

            const startX = 40;
            const tableWidth = 515;
            const borderColor = '#666666';
            const headerBg = '#E0E0E0';
            const pageHeight = doc.page.height;
            let curY = 40;

            // Helper to draw cells with border and centered text
            function drawCell(x, y, w, h, bg, text, isBold = false, align = 'center', fontSize = 9.5) {
                  if (bg) {
                        doc.rect(x, y, w, h).fill(bg);
                  }
                  doc.rect(x, y, w, h).lineWidth(0.75).stroke(borderColor);

                  if (text != null && text !== '') {
                        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica')
                           .fontSize(fontSize)
                           .fillColor('#000000');

                        const pad = align === 'left' ? 8 : 0;
                        const textY = y + (h - fontSize) / 2 - 1.5;
                        doc.text(String(text), x + pad, textY, {
                              width: w - pad * 2,
                              align: align
                        });
                  }
            }

            // ── Section A: Main Heading ──────────────────────────────────────────────
            drawCell(startX, curY, tableWidth, 22, headerBg, `Statement of Marks - ${info.session}-${info.year}`, true, 'center', 10.5);
            curY += 22;

            // ── Section B: Student Information ───────────────────────────────────────
            const c1 = 85, c2 = 172.5, c3 = 85, c4 = 172.5;
            const studentRows = [
                  [['Name', true, 'left'], [student.studentName || '', false, 'left'], ['Roll No.', true, 'left'], [student.enrollmentNumber, false, 'left']],
                  [['Course', true, 'left'], [info.course, false, 'left'], ['Branch', true, 'left'], [info.branch, false, 'left']],
                  [['Semester', true, 'left'], [String(info.semester), false, 'left'], ['Status', true, 'left'], [info.status, false, 'left']],
            ];

            studentRows.forEach(row => {
                  let cx = startX;
                  const [f1, f2, f3, f4] = row;
                  drawCell(cx, curY, c1, 20, null, f1[0], f1[1], f1[2]); cx += c1;
                  drawCell(cx, curY, c2, 20, null, f2[0], f2[1], f2[2]); cx += c2;
                  drawCell(cx, curY, c3, 20, null, f3[0], f3[1], f3[2]); cx += c3;
                  drawCell(cx, curY, c4, 20, null, f4[0], f4[1], f4[2]);
                  curY += 20;
            });

            curY += 10; // Spacing

            // ── Section C: Subject-wise Marks & Credits Table ────────────────────────
            const subW = [140, 125, 125, 125];
            const subHeaders = ['Subject', 'Total Credit', 'Earned Credit', 'Grade'];

            function drawSubjectHeader(y) {
                  let cx = startX;
                  subHeaders.forEach((h, i) => {
                        drawCell(cx, y, subW[i], 22, headerBg, h, true, 'center');
                        cx += subW[i];
                  });
            }

            drawSubjectHeader(curY);
            curY += 22;

            info.subjects.forEach(sub => {
                  if (curY + 19 > pageHeight - 60) {
                        doc.addPage();
                        curY = 40;
                        drawSubjectHeader(curY);
                        curY += 22;
                  }

                  let cx = startX;
                  drawCell(cx, curY, subW[0], 19, null, sub.code, false, 'center'); cx += subW[0];
                  drawCell(cx, curY, subW[1], 19, null, String(sub.totalCredit), false, 'center'); cx += subW[1];
                  drawCell(cx, curY, subW[2], 19, null, String(sub.earnedCredit), false, 'center'); cx += subW[2];
                  drawCell(cx, curY, subW[3], 19, null, sub.grade, false, 'center');
                  curY += 19;
            });

            curY += 10; // Spacing

            // Check page overflow before Summary
            if (curY + 110 > pageHeight - 40) {
                  doc.addPage();
                  curY = 40;
            }

            // ── Section D: Result Summary Section ────────────────────────────────────
            const resW = [171.6, 171.6, 171.8];
            let cx = startX;
            ['Result Des.', 'SGPA', 'CGPA'].forEach((h, i) => {
                  drawCell(cx, curY, resW[i], 22, headerBg, h, true, 'center');
                  cx += resW[i];
            });
            curY += 22;

            cx = startX;
            const sgpaVal = student.sgpa != null && !isNaN(Number(student.sgpa)) ? Number(student.sgpa).toFixed(2) : '-';
            const cgpaVal = student.cgpa != null && !isNaN(Number(student.cgpa)) ? Number(student.cgpa).toFixed(2) : '-';
            drawCell(cx, curY, resW[0], 20, null, student.resultStatus || 'PASS', false, 'center'); cx += resW[0];
            drawCell(cx, curY, resW[1], 20, null, sgpaVal, false, 'center'); cx += resW[1];
            drawCell(cx, curY, resW[2], 20, null, cgpaVal, false, 'center');
            curY += 20;

            // ── Section E: Revaluation Information ───────────────────────────────────
            cx = startX;
            ['Revaluation Date', 'Revaluation Date with Late Fee', ''].forEach((h, i) => {
                  drawCell(cx, curY, resW[i], 22, headerBg, h, true, 'center');
                  cx += resW[i];
            });
            curY += 22;

            cx = startX;
            drawCell(cx, curY, resW[0], 20, null, info.revalDate || '', false, 'center'); cx += resW[0];
            drawCell(cx, curY, resW[1], 20, null, info.lateFeeDate || '', false, 'center'); cx += resW[1];
            drawCell(cx, curY, resW[2], 20, null, '', false, 'center');
            curY += 20;

            curY += 12; // Spacing

            // ── Section F: Data Source Footer ────────────────────────────────────────
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
            doc.text('Data Source : Rajiv Gandhi Proudyogiki Vishwavidyalaya, Bhopal', startX, curY);

            doc.end();
            stream.on('finish', () => resolve(outputPath));
            stream.on('error', reject);
      });
}

/**
 * Bulk zip generator for archiving
 */
async function generateZipArchive(filePaths, zipPath) {
      return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => resolve(zipPath));
            archive.on('error', reject);
            archive.pipe(output);

            filePaths.forEach((fp) => {
                  if (fs.existsSync(fp)) {
                        archive.file(fp, { name: path.basename(fp) });
                  }
            });

            archive.finalize();
      });
}

module.exports = {
      generateStudentPDF,
      generateZipArchive,
};
