/**
 * Institutional Excel Export System for SIRT Bhopal / RGPV Results
 * Reproduces institutional layout, logos, colors, typography, and complete analytics.
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { generateEnrollments } = require('../utils/enrollmentGenerator');

// ── Color Palette Constants ──────────────────────────────────────────────────
const NAVY_BLUE = 'FF1F3864';          // Major title bars & standard headers
const NAVY_BLUE_SUB = 'FF2F4F7C';      // Sub-bars & section headers
const BRAND_GREEN = 'FF1B5E20';        // Table headers for passed/failed files
const BRAND_GREEN_BORDER = 'FF2E7D32';
const SOFT_PEACH = 'FFFFF2CC';         // Explanatory note cards
const BORDER_COLOR = 'FFBFBFBF';       // Thin cell borders
const BORDER_SOFT = 'FFE0E0E0';
const PASS_TEXT = 'FF1B5E20';
const PASS_BG = 'FFE8F5E9';
const GRACE_TEXT = 'FF0D47A1';
const GRACE_BG = 'FFE1F5FE';
const FAIL_TEXT = 'FFB71C1C';
const FAIL_BG = 'FFFFEBEE';
const ROW_ALT_BG = 'FFF2F4F7';
const ROW_WHITE = 'FFFFFFFF';
const META_LABEL_BG = 'FFF1F5F9';

// ── RGPV Subject Names Catalog ────────────────────────────────────────────────
const SUBJECT_NAMES = {
      'BT401': 'Mathematics- III',
      'ES401': 'Energy & Environmental Engineering',
      'CS402': 'Analysis Design of Algorithm',
      'CS403': 'Software Engineering',
      'CS404': 'Computer Org. & Architecture',
      'CS405': 'Operating Systems',
      'CS406': 'Programming Practices',
      'BT301': 'Mathematics- II',
      'CS302': 'Discrete Structure',
      'CS303': 'Data Structure',
      'CS304': 'Digital Systems',
      'CS305': 'Object Oriented Programming & Methodology',
      'CS306': 'Computer Workshop',
      'CS501': 'Theory of Computation',
      'CS502': 'Database Management Systems',
      'CS503': 'Cyber Security',
      'CS504': 'Internet & Web Technology',
      'CS601': 'Machine Learning',
      'CS602': 'Computer Networks',
      'CS603': 'Advanced Computer Architecture',
      'CS604': 'Data Science',
      'CS701': 'Software Architectures',
      'CS702': 'Cloud Computing',
      'CS801': 'Internet of Things',
      'CS802': 'Soft Computing',
      // Common Engineering Subjects
      'BT101': 'Engineering Chemistry',
      'BT102': 'Mathematics- I',
      'BT103': 'English for Communication',
      'BT104': 'Basic Electrical & Electronics Engineering',
      'BT105': 'Engineering Graphics',
      'BT201': 'Engineering Physics',
      'BT202': 'Mathematics- II',
      'BT203': 'Basic Mechanical Engineering',
      'BT204': 'Basic Civil Engineering & Mechanics',
      'BT205': 'Basic Computer Engineering',
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getOrdinal(n) {
      const num = parseInt(n, 10);
      if (isNaN(num)) return n || '';
      const s = ['th', 'st', 'nd', 'rd'];
      const v = num % 100;
      return num + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getDepartmentName(branch) {
      if (!branch) return 'DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING';
      const b = branch.trim().toUpperCase();
      if (b === 'CSE' || b === 'CS') return 'DEPARTMENT OF COMPUTER SCIENCE & ENGINEERING';
      if (b === 'IT') return 'DEPARTMENT OF INFORMATION TECHNOLOGY';
      if (b === 'ME') return 'DEPARTMENT OF MECHANICAL ENGINEERING';
      if (b === 'CE') return 'DEPARTMENT OF CIVIL ENGINEERING';
      if (b === 'EC' || b === 'ECE') return 'DEPARTMENT OF ELECTRONICS & COMMUNICATION ENGINEERING';
      if (b === 'EE' || b === 'EX') return 'DEPARTMENT OF ELECTRICAL & ELECTRONICS ENGINEERING';
      if (b === 'AI' || b === 'AIML') return 'DEPARTMENT OF ARTIFICIAL INTELLIGENCE & MACHINE LEARNING';
      if (b === 'DS') return 'DEPARTMENT OF DATA SCIENCE';
      return `DEPARTMENT OF ${branch.toUpperCase()}`;
}

function compareEnrollments(a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function parseSubjectCode(rawCode) {
      if (!rawCode || typeof rawCode !== 'string') return null;
      const clean = rawCode.trim();
      const m = clean.match(/^([A-Z]{2,4}\s*-?\s*\d{3,4}[A-Z]?)(?:\s*[-_(]?\s*\[?\s*([TPN])\s*\]?\s*\)?)?$/i);
      if (!m) return null;
      const baseCode = m[1].replace(/[\s-]+/g, '').toUpperCase();
      const typeChar = (m[2] || 'T').toUpperCase();
      if (typeChar === 'N') return null; // Exclude non-credit/audit courses from core tables
      const type = typeChar === 'P' ? 'Practical' : 'Theory';
      const label = `${baseCode} (${typeChar})`;
      const subjectName = SUBJECT_NAMES[baseCode] || baseCode;
      return { baseCode, typeChar, type, label, subjectName };
}

function parseSubjectEntry(subject) {
      const codeParsed = parseSubjectCode(subject.subjectCode);
      if (codeParsed) {
            return {
                  ...codeParsed,
                  subjectName: subject.subjectName || codeParsed.subjectName,
            };
      }

      const nameParsed = parseSubjectCode(subject.subjectName);
      if (!nameParsed) return null;
      return {
            ...nameParsed,
            subjectName: subject.subjectCode || nameParsed.subjectName,
      };
}

function isAbs(grade) {
      if (!grade || typeof grade !== 'string') return false;
      const g = grade.trim().toUpperCase();
      return g.includes('ABS') || g === 'AB';
}

function isFail(grade) {
      if (!grade || typeof grade !== 'string') return false;
      const g = grade.trim().toUpperCase();
      if (isAbs(g)) return false;
      return g === 'F' || g === 'FF';
}

function hasGrace(grade) {
      if (!grade || typeof grade !== 'string') return false;
      return grade.includes('*') || grade.includes('##') || grade.includes('$') || grade.toLowerCase().includes('grace');
}

function getLogoPath() {
      const candidates = [
            path.join(__dirname, '../assets/sirt_logo.png'),
            path.join(__dirname, '../../assets/sirt_logo.png'),
            path.join(process.cwd(), 'assets/sirt_logo.png'),
            path.join(process.cwd(), 'backend/assets/sirt_logo.png')
      ];
      for (const p of candidates) {
            if (fs.existsSync(p)) return p;
      }
      return null;
}

function addLogo(workbook, worksheet, col = 0.1, row = 0.1) {
      const logoPath = getLogoPath();
      if (logoPath) {
            try {
                  const imgId = workbook.addImage({ filename: logoPath, extension: 'png' });
                  worksheet.addImage(imgId, {
                        tl: { col: col, row: row },
                        ext: { width: 55, height: 48 },
                  });
            } catch {
                  // Silently continue if image rendering is unsupported
            }
      }
}

function applyBorders(row, startCol, endCol, color = BORDER_COLOR) {
      for (let c = startCol; c <= endCol; c++) {
            row.getCell(c).border = {
                  top: { style: 'thin', color: { argb: color } },
                  bottom: { style: 'thin', color: { argb: color } },
                  left: { style: 'thin', color: { argb: color } },
                  right: { style: 'thin', color: { argb: color } },
            };
      }
}

/**
 * Build consolidated dataset and metadata from Job and Students
 */
function analyzeResults(job, students = []) {
      const candidateEnrollments = new Set();
      if (job.enrollmentList && Array.isArray(job.enrollmentList) && job.enrollmentList.length > 0) {
            job.enrollmentList.forEach(e => { if (e) candidateEnrollments.add(String(e).trim()); });
      } else if (job.startingEnrollment && job.endingEnrollment) {
            const gen = generateEnrollments(job.startingEnrollment, job.endingEnrollment);
            if (gen.success && Array.isArray(gen.enrollments)) {
                  gen.enrollments.forEach(e => candidateEnrollments.add(String(e).trim()));
            }
      }

      students.forEach(s => {
            if (s.enrollmentNumber) candidateEnrollments.add(String(s.enrollmentNumber).trim());
      });

      const studentMap = new Map();
      students.forEach(s => {
            if (s.enrollmentNumber) {
                  studentMap.set(String(s.enrollmentNumber).trim().toUpperCase(), s);
            }
      });

      const sortedEnrollments = Array.from(candidateEnrollments)
            .filter(enrollment => {
                  const student = studentMap.get(enrollment.toUpperCase());
                  return !student || (
                        student.fetchStatus !== 'missing'
                        && student.resultStatus !== 'NOT_FOUND'
                  );
            })
            .sort(compareEnrollments);

      // Include every recognized subject in the roster, regardless of the selected job branch.
      const rawSubjectMap = new Map();

      students.forEach(s => {
            (s.subjects || []).forEach(sub => {
                  const p = parseSubjectEntry(sub);
                  if (p) {
                        if (!rawSubjectMap.has(p.label)) {
                              rawSubjectMap.set(p.label, p);
                        }
                  }
            });
      });

      // Keep every parsed subject represented in the results.
      const subjectMap = rawSubjectMap;

      const theorySubs = [];
      const practicalSubs = [];
      for (const p of subjectMap.values()) {
            if (p.type === 'Theory') theorySubs.push(p);
            else practicalSubs.push(p);
      }
      const allSubs = [...theorySubs, ...practicalSubs];

      // Subject stats container
      const subStats = {};
      allSubs.forEach(s => {
            subStats[s.label] = { ...s, eligible: 0, pass: 0, fail: 0, abs: 0 };
      });

      let totalRoster = sortedEnrollments.length;
      let excludedDueToAbs = 0;
      let regularPass = 0;
      let passWithGrace = 0;
      let failedCount = 0;

      const processedStudents = sortedEnrollments.map((enr, idx) => {
            const s = studentMap.get(enr.toUpperCase());
            const studentBranch = (s && s.branch || '').trim().toUpperCase();

            const studentGrades = new Map();
            let studentHasAbs = false;
            let studentHasGrace = false;
            const failedInSubs = [];

            if (s && s.subjects && s.subjects.length > 0) {
                  s.subjects.forEach(sub => {
                        const p = parseSubjectEntry(sub);
                        if (p && subjectMap.has(p.label)) {
                              studentGrades.set(p.label, sub.grade || '');
                              if (isAbs(sub.grade)) studentHasAbs = true;
                              if (hasGrace(sub.grade)) studentHasGrace = true;
                              if (isFail(sub.grade)) failedInSubs.push(p.baseCode);
                        }
                  });
            }

            allSubs.forEach(sub => {
                  const grade = studentGrades.get(sub.label);
                  if (grade != null && grade !== '') {
                        if (isAbs(grade)) {
                              subStats[sub.label].abs++;
                        } else {
                              subStats[sub.label].eligible++;
                              if (isFail(grade)) {
                                    subStats[sub.label].fail++;
                              } else {
                                    subStats[sub.label].pass++;
                              }
                        }
                  }
            });

            // Determine Result Decision
            let decision = '';
            if (s) {
                  if (studentHasGrace || s.resultStatus === 'PASS WITH GRACE') {
                        decision = 'PASS WITH GRACE';
                  } else if (s.resultStatus === 'PASS') {
                        decision = 'PASS';
                  } else if (failedInSubs.length > 0) {
                        decision = `Fail in ${failedInSubs.join(', ')}`;
                  } else if (s.resultStatus === 'FAIL') {
                        decision = 'FAIL';
                  } else {
                        decision = s.resultStatus || '';
                  }
            }

            if (studentHasAbs) {
                  excludedDueToAbs++;
            } else if (s && s.fetchStatus === 'completed') {
                  if (decision === 'PASS WITH GRACE') {
                        passWithGrace++;
                  } else if (decision === 'PASS') {
                        regularPass++;
                  } else if (decision.startsWith('Fail') || decision === 'FAIL') {
                        failedCount++;
                  }
            }

            const categoryLabel = studentBranch ? `Branch: ${studentBranch}` : 'Regular';

            return {
                  sno: idx + 1,
                  enrollmentNumber: enr,
                  studentName: s ? (s.studentName || '') : '',
                  grades: studentGrades,
                  sgpa: s && s.sgpa != null && !isNaN(Number(s.sgpa)) ? Number(s.sgpa) : null,
                  cgpa: s && s.cgpa != null && !isNaN(Number(s.cgpa)) ? Number(s.cgpa) : null,
                  backlogs: s && s.backlogs != null && !isNaN(Number(s.backlogs)) ? parseInt(s.backlogs, 10) : (failedInSubs.length || 0),
                  resultDecision: decision,
                  category: categoryLabel,
                  hasAbs: studentHasAbs ? 'YES' : 'NO',
                  rawResultStatus: s ? s.resultStatus : '',
                  studentObj: s,
            };
      });

      const eligibleOverall = Math.max(0, totalRoster - excludedDueToAbs);
      const totalPassed = regularPass + passWithGrace;
      const passPct = eligibleOverall > 0 ? ((totalPassed / eligibleOverall) * 100).toFixed(2) : '0.00';
      const failPct = eligibleOverall > 0 ? ((failedCount / eligibleOverall) * 100).toFixed(2) : '0.00';
      const excludedPct = totalRoster > 0 ? ((excludedDueToAbs / totalRoster) * 100).toFixed(2) : '0.00';

      return {
            totalRoster,
            excludedDueToAbs,
            eligibleOverall,
            regularPass,
            passWithGrace,
            totalPassed,
            failedCount,
            passPct,
            failPct,
            excludedPct,
            allSubs,
            subStats,
            processedStudents,
      };
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 1: Summary
// ─────────────────────────────────────────────────────────────────────────────
function buildSummarySheet(workbook, job, analysis) {
      const ws = workbook.addWorksheet('Summary', {
            views: [{ showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.1, 0.1);

      // Institutional Header (Rows 1 & 2)
      ws.mergeCells('B1:E1');
      const cCollege = ws.getCell('B1');
      cCollege.value = (job.collegeName || 'SAGAR INSTITUTE OF RESEARCH & TECHNOLOGY,BHOPAL').toUpperCase();
      cCollege.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } };
      cCollege.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('B2:E2');
      const cDept = ws.getCell('B2');
      cDept.value = getDepartmentName(job.branch);
      cDept.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cDept.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(1).height = 20;
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // Major Title Bar (Row 4)
      ws.mergeCells('A4:E4');
      const cTitle = ws.getCell('A4');
      cTitle.value = `${job.branch || 'CSE'} ${getOrdinal(job.semester || 4)} Semester – Consolidated Result Summary`;
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(4).height = 26;

      // Right Side Header: Subject-wise ABS (Row 5)
      const hRight1 = ws.getCell('D5');
      hRight1.value = 'Subject-wise ABS';
      hRight1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      hRight1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      hRight1.alignment = { horizontal: 'center', vertical: 'middle' };

      const hRight2 = ws.getCell('E5');
      hRight2.value = 'Excluded per subject';
      hRight2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      hRight2.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      hRight2.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(5).height = 20;

      // Left Column Stats
      const leftRows = [
            { label: 'Total Students in Uploaded Files', val: analysis.totalRoster, bold: false },
            { label: 'Students Included in Overall Analysis', val: analysis.eligibleOverall, bold: false },
            { label: 'Students Excluded (ABS in one or more subjects)', val: analysis.excludedDueToAbs, bold: false },
            null, // Spacer
            { header: 'Overall Result Metrics' },
            { label: 'Regular Pass', val: analysis.regularPass, bold: false },
            { label: 'Pass with Grace', val: analysis.passWithGrace, bold: false },
            { label: 'Total Passed', val: analysis.totalPassed, bold: true },
            { label: 'Failed', val: analysis.failedCount, bold: false },
            { label: 'Pass Percentage', val: `${analysis.passPct}%`, bold: true },
            { label: 'Fail Percentage', val: `${analysis.failPct}%`, bold: false },
      ];

      const maxRows = Math.max(leftRows.length, analysis.allSubs.length);
      for (let i = 0; i < maxRows; i++) {
            const rowNum = 6 + i;
            const row = ws.getRow(rowNum);
            row.height = 19;

            // Left table
            const item = leftRows[i];
            if (item) {
                  if (item.header) {
                        row.getCell('A').value = item.header;
                        row.getCell('A').font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F3864' } };
                        row.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_ALT_BG } };
                        applyBorders(row, 1, 2);
                  } else if (item.label) {
                        row.getCell('A').value = item.label;
                        row.getCell('A').font = { name: 'Calibri', size: 10, bold: item.bold };
                        row.getCell('A').alignment = { horizontal: 'left', vertical: 'middle' };

                        row.getCell('B').value = item.val;
                        row.getCell('B').font = { name: 'Calibri', size: 10, bold: item.bold };
                        row.getCell('B').alignment = { horizontal: 'center', vertical: 'middle' };
                        applyBorders(row, 1, 2);
                  }
            }

            // Right table (Subject-wise ABS)
            const sub = analysis.allSubs[i];
            if (sub) {
                  const st = analysis.subStats[sub.label];
                  row.getCell('D').value = sub.label;
                  row.getCell('D').font = { name: 'Calibri', size: 10 };
                  row.getCell('D').alignment = { horizontal: 'center', vertical: 'middle' };

                  row.getCell('E').value = st ? st.abs : 0;
                  row.getCell('E').font = { name: 'Calibri', size: 10 };
                  row.getCell('E').alignment = { horizontal: 'center', vertical: 'middle' };
                  applyBorders(row, 4, 5);
            }
      }

      // Note Card: ABSENT HANDLING
      const noteTitleRow = 6 + maxRows + 1;
      ws.mergeCells(`A${noteTitleRow}:E${noteTitleRow}`);
      const cNoteHeader = ws.getCell(`A${noteTitleRow}`);
      cNoteHeader.value = 'ABSENT HANDLING';
      cNoteHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cNoteHeader.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cNoteHeader.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(noteTitleRow).height = 20;

      const noteTextStart = noteTitleRow + 1;
      const noteTextEnd = noteTitleRow + 2;
      ws.mergeCells(`A${noteTextStart}:E${noteTextEnd}`);
      const cNote = ws.getCell(`A${noteTextStart}`);
      cNote.value = 'Overall analysis excludes a student if any of the subject cells contains ABS / F (ABS) / AB. Subject-wise analysis excludes only the ABS entry in that particular subject denominator. The full roster is retained in the Total Students Result sheet.';
      cNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT_PEACH } };
      cNote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF4A3B18' } };
      cNote.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let r = noteTextStart; r <= noteTextEnd; r++) {
            applyBorders(ws.getRow(r), 1, 5, 'FFD6B656');
      }

      ws.getColumn('A').width = 44;
      ws.getColumn('B').width = 16;
      ws.getColumn('C').width = 6;
      ws.getColumn('D').width = 22;
      ws.getColumn('E').width = 22;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 2: Total Students Result
// ─────────────────────────────────────────────────────────────────────────────
function buildTotalStudentsSheet(workbook, job, analysis) {
      const ws = workbook.addWorksheet('Total Students Result', {
            views: [{ state: 'frozen', ySplit: 3, showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.05, 0.02);

      const totalCols = 3 + analysis.allSubs.length + 5; // SNo, Roll, Name + subs + SGPA, CGPA, Result, Category, ABS
      const lastColLetter = ws.getColumn(totalCols).letter;

      // Row 1: Merged Title Bar
      ws.mergeCells(`A1:${lastColLetter}1`);
      const cTitle = ws.getCell('A1');
      cTitle.value = 'Complete Student Result';
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 36;

      ws.getRow(2).height = 6; // Spacer

      // Row 3: Headers
      const headers = ['S No.', 'Roll Number', 'Name'];
      analysis.allSubs.forEach(s => headers.push(s.label));
      headers.push('SGPA', 'CGPA', 'Result Decision', 'Category', 'ABS in Any Subject');

      const hRow = ws.getRow(3);
      hRow.height = 28;
      headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      applyBorders(hRow, 1, headers.length);
      ws.autoFilter = `A3:${lastColLetter}3`;

      // Student rows
      analysis.processedStudents.forEach((st, idx) => {
            const rowNum = 4 + idx;
            const row = ws.getRow(rowNum);
            row.height = 21;
            const isAlt = idx % 2 === 1;
            const bg = isAlt ? ROW_ALT_BG : ROW_WHITE;

            // 1. S No.
            row.getCell(1).value = st.sno;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // 2. Roll Number (Text)
            const cRoll = row.getCell(2);
            cRoll.value = String(st.enrollmentNumber);
            cRoll.numFmt = '@';
            cRoll.alignment = { horizontal: 'center', vertical: 'middle' };

            // 3. Name (Left)
            const cName = row.getCell(3);
            cName.value = st.studentName || '';
            cName.alignment = { horizontal: 'left', vertical: 'middle' };

            // Subject columns
            let colIdx = 4;
            analysis.allSubs.forEach(sub => {
                  const cSub = row.getCell(colIdx);
                  const gr = st.grades.get(sub.label) || '';
                  cSub.value = gr;
                  cSub.alignment = { horizontal: 'center', vertical: 'middle' };
                  if (isAbs(gr)) {
                        cSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC00000' } };
                        cSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } };
                  } else if (isFail(gr)) {
                        cSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: FAIL_TEXT } };
                  } else if (hasGrace(gr)) {
                        cSub.font = { name: 'Calibri', size: 10, bold: true, color: { argb: GRACE_TEXT } };
                  }
                  colIdx++;
            });

            // SGPA
            const cSgpa = row.getCell(colIdx++);
            if (st.sgpa != null) { cSgpa.value = st.sgpa; cSgpa.numFmt = '0.00'; }
            else cSgpa.value = '';
            cSgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // CGPA
            const cCgpa = row.getCell(colIdx++);
            if (st.cgpa != null) { cCgpa.value = st.cgpa; cCgpa.numFmt = '0.00'; }
            else cCgpa.value = '';
            cCgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // Result Decision
            const cRes = row.getCell(colIdx++);
            cRes.value = st.resultDecision || '';
            cRes.alignment = { horizontal: 'center', vertical: 'middle' };
            if (st.resultDecision === 'PASS') {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PASS_TEXT } };
            } else if (st.resultDecision === 'PASS WITH GRACE') {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: GRACE_TEXT } };
            } else if (st.resultDecision.startsWith('Fail') || st.resultDecision === 'FAIL') {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: FAIL_TEXT } };
            }

            // Category
            const cCat = row.getCell(colIdx++);
            cCat.value = st.category || 'Regular';
            cCat.alignment = { horizontal: 'center', vertical: 'middle' };

            // ABS in Any Subject
            const cAbs = row.getCell(colIdx++);
            cAbs.value = st.hasAbs;
            cAbs.alignment = { horizontal: 'center', vertical: 'middle' };
            if (st.hasAbs === 'YES') {
                  cAbs.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC00000' } };
            }

            // Apply base font and alternating background
            for (let c = 1; c <= headers.length; c++) {
                  const cell = row.getCell(c);
                  if (!cell.fill) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                  }
                  if (!cell.font) {
                        cell.font = { name: 'Calibri', size: 10 };
                  }
            }
            applyBorders(row, 1, headers.length);
      });

      // Set column widths
      ws.getColumn(1).width = 8;
      ws.getColumn(2).width = 18;
      ws.getColumn(3).width = 28;
      let c = 4;
      analysis.allSubs.forEach(() => { ws.getColumn(c++).width = 12; });
      ws.getColumn(c++).width = 10; // SGPA
      ws.getColumn(c++).width = 10; // CGPA
      ws.getColumn(c++).width = 24; // Result Decision
      ws.getColumn(c++).width = 12; // Category
      ws.getColumn(c++).width = 18; // ABS
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 3: Top 10 Toppers
// ─────────────────────────────────────────────────────────────────────────────
function buildToppersSheet(workbook, job, analysis) {
      const ws = workbook.addWorksheet('Top 10 Toppers', {
            views: [{ state: 'frozen', ySplit: 6, showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.1, 0.1);

      // Header
      ws.mergeCells('B1:G1');
      const cCollege = ws.getCell('B1');
      cCollege.value = (job.collegeName || 'SAGAR INSTITUTE OF RESEARCH & TECHNOLOGY,BHOPAL').toUpperCase();
      cCollege.font = { name: 'Calibri', size: 12, bold: true };
      cCollege.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('B2:G2');
      const cDept = ws.getCell('B2');
      cDept.value = getDepartmentName(job.branch);
      cDept.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cDept.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(1).height = 20;
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // Title Bar (Row 4)
      ws.mergeCells('A4:G4');
      const cTitle = ws.getCell('A4');
      cTitle.value = `${job.branch || 'CSE'} ${getOrdinal(job.semester || 4)} Semester – Top 10 Toppers`;
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(4).height = 26;

      ws.getRow(5).height = 8;

      // Table Header (Row 6)
      const headers = ['Rank', 'Roll Number', 'Student Name', 'SGPA', 'CGPA', 'Result Decision', 'Category'];
      const hRow = ws.getRow(6);
      hRow.height = 26;
      headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      applyBorders(hRow, 1, headers.length);
      ws.autoFilter = 'A6:G6';

      // Filter eligible passed students with valid SGPA
      const eligibleToppers = analysis.processedStudents.filter(s =>
            (s.resultDecision === 'PASS' || s.resultDecision === 'PASS WITH GRACE') &&
            s.sgpa != null && !isNaN(s.sgpa) && s.hasAbs === 'NO'
      );

      eligibleToppers.sort((a, b) => {
            if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
            return (b.cgpa || 0) - (a.cgpa || 0);
      });

      const top10 = eligibleToppers.slice(0, 10);

      top10.forEach((st, idx) => {
            const rowNum = 7 + idx;
            const row = ws.getRow(rowNum);
            row.height = 22;
            const bg = idx % 2 === 1 ? ROW_ALT_BG : ROW_WHITE;

            // 1. Rank
            row.getCell(1).value = idx + 1;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // 2. Roll Number
            const cRoll = row.getCell(2);
            cRoll.value = String(st.enrollmentNumber);
            cRoll.numFmt = '@';
            cRoll.alignment = { horizontal: 'center', vertical: 'middle' };

            // 3. Name
            const cName = row.getCell(3);
            cName.value = st.studentName || '';
            cName.alignment = { horizontal: 'left', vertical: 'middle' };

            // 4. SGPA
            const cSgpa = row.getCell(4);
            cSgpa.value = st.sgpa;
            cSgpa.numFmt = '0.00';
            cSgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // 5. CGPA
            const cCgpa = row.getCell(5);
            if (st.cgpa != null) { cCgpa.value = st.cgpa; cCgpa.numFmt = '0.00'; }
            else cCgpa.value = '';
            cCgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // 6. Result Decision
            const cRes = row.getCell(6);
            cRes.value = st.resultDecision;
            cRes.alignment = { horizontal: 'center', vertical: 'middle' };
            cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: st.resultDecision === 'PASS' ? PASS_TEXT : GRACE_TEXT } };

            // 7. Category
            const cCat = row.getCell(7);
            cCat.value = st.category || 'Regular';
            cCat.alignment = { horizontal: 'center', vertical: 'middle' };

            for (let c = 1; c <= 7; c++) {
                  const cell = row.getCell(c);
                  if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
                  if (!cell.font) cell.font = { name: 'Calibri', size: 10 };
            }
            applyBorders(row, 1, 7);
      });

      ws.getColumn('A').width = 10;
      ws.getColumn('B').width = 20;
      ws.getColumn('C').width = 30;
      ws.getColumn('D').width = 14;
      ws.getColumn('E').width = 14;
      ws.getColumn('F').width = 22;
      ws.getColumn('G').width = 14;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 4: Overall Result Analysis
// ─────────────────────────────────────────────────────────────────────────────
function buildOverallAnalysisSheet(workbook, job, analysis) {
      const ws = workbook.addWorksheet('Overall Result Analysis', {
            views: [{ showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.1, 0.1);

      // Header
      ws.mergeCells('B1:D1');
      const cCollege = ws.getCell('B1');
      cCollege.value = (job.collegeName || 'SAGAR INSTITUTE OF RESEARCH & TECHNOLOGY,BHOPAL').toUpperCase();
      cCollege.font = { name: 'Calibri', size: 12, bold: true };
      cCollege.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('B2:D2');
      const cDept = ws.getCell('B2');
      cDept.value = getDepartmentName(job.branch);
      cDept.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cDept.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(1).height = 20;
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // Title Bar (Row 4)
      ws.mergeCells('A4:D4');
      const cTitle = ws.getCell('A4');
      cTitle.value = 'Overall Result Analysis – ABS Excluded';
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(4).height = 26;

      ws.getRow(5).height = 8;

      // Table Header (Row 6)
      const headers = ['Metric', 'Students', 'Percentage', 'Basis'];
      const hRow = ws.getRow(6);
      hRow.height = 24;
      headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      applyBorders(hRow, 1, 4);

      const rows = [
            { metric: 'Total students in roster', students: analysis.totalRoster, pct: '100.00%', basis: 'Both source files', bold: false },
            { metric: 'Excluded due to ABS', students: analysis.excludedDueToAbs, pct: `${analysis.excludedPct}%`, basis: 'ABS/F (ABS)/AB in any subject', bold: false },
            { metric: 'Eligible for overall analysis', students: analysis.eligibleOverall, pct: '100.00%', basis: 'No ABS in any subject', bold: true },
            { metric: 'Regular Pass', students: analysis.regularPass, pct: `${analysis.eligibleOverall > 0 ? ((analysis.regularPass / analysis.eligibleOverall) * 100).toFixed(2) : '0.00'}%`, basis: 'Result Decision = PASS', bold: false },
            { metric: 'Pass with Grace', students: analysis.passWithGrace, pct: `${analysis.eligibleOverall > 0 ? ((analysis.passWithGrace / analysis.eligibleOverall) * 100).toFixed(2) : '0.00'}%`, basis: 'Result Decision = PASS WITH GRACE', bold: false },
            { metric: 'Total Passed', students: analysis.totalPassed, pct: `${analysis.passPct}%`, basis: 'Regular + Grace', bold: true },
            { metric: 'Failed', students: analysis.failedCount, pct: `${analysis.failPct}%`, basis: 'Eligible students not passed', bold: false },
      ];

      rows.forEach((r, idx) => {
            const rowNum = 7 + idx;
            const row = ws.getRow(rowNum);
            row.height = 20;

            row.getCell(1).value = r.metric;
            row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

            row.getCell(2).value = r.students;
            row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(3).value = r.pct;
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(4).value = r.basis;
            row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

            for (let c = 1; c <= 4; c++) {
                  row.getCell(c).font = { name: 'Calibri', size: 10, bold: r.bold };
            }
            applyBorders(row, 1, 4);
      });

      // Interpretation Note
      const noteTitleRow = 15;
      ws.mergeCells(`A${noteTitleRow}:D${noteTitleRow}`);
      const cNoteH = ws.getCell(`A${noteTitleRow}`);
      cNoteH.value = 'Interpretation';
      cNoteH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cNoteH.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cNoteH.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(noteTitleRow).height = 20;

      const noteTextStart = 16;
      const noteTextEnd = 17;
      ws.mergeCells(`A${noteTextStart}:D${noteTextEnd}`);
      const cNote = ws.getCell(`A${noteTextStart}`);
      cNote.value = 'For overall result analysis, a student with an absence marker in any subject is excluded entirely from the eligible denominator. Such students remain visible in the complete roster.';
      cNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT_PEACH } };
      cNote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF4A3B18' } };
      cNote.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let r = noteTextStart; r <= noteTextEnd; r++) {
            applyBorders(ws.getRow(r), 1, 4, 'FFD6B656');
      }

      ws.getColumn('A').width = 34;
      ws.getColumn('B').width = 14;
      ws.getColumn('C').width = 16;
      ws.getColumn('D').width = 38;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET 5: Subject-wise Result Analysis
// ─────────────────────────────────────────────────────────────────────────────
function buildSubjectAnalysisSheet(workbook, job, analysis) {
      const ws = workbook.addWorksheet('Subject-wise Result Analysis', {
            views: [{ showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.1, 0.1);

      // Header
      ws.mergeCells('B1:I1');
      const cCollege = ws.getCell('B1');
      cCollege.value = (job.collegeName || 'SAGAR INSTITUTE OF RESEARCH & TECHNOLOGY,BHOPAL').toUpperCase();
      cCollege.font = { name: 'Calibri', size: 12, bold: true };
      cCollege.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('B2:I2');
      const cDept = ws.getCell('B2');
      cDept.value = getDepartmentName(job.branch);
      cDept.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cDept.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(1).height = 20;
      ws.getRow(2).height = 18;
      ws.getRow(3).height = 8;

      // Title Bar (Row 4)
      ws.mergeCells('A4:I4');
      const cTitle = ws.getCell('A4');
      cTitle.value = 'Subject-wise Result Analysis – ABS Excluded per Subject';
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(4).height = 26;

      ws.getRow(5).height = 8;

      // Table Header (Row 6)
      const headers = ['Subject', 'Subject Code', 'Type', 'Eligible Students', 'Pass', 'Fail', 'ABS Excluded', 'Pass %', 'Fail %'];
      const hRow = ws.getRow(6);
      hRow.height = 26;
      headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      applyBorders(hRow, 1, headers.length);
      ws.autoFilter = 'A6:I6';

      analysis.allSubs.forEach((sub, idx) => {
            const rowNum = 7 + idx;
            const row = ws.getRow(rowNum);
            row.height = 20;
            const st = analysis.subStats[sub.label];
            const pPct = st.eligible > 0 ? ((st.pass / st.eligible) * 100).toFixed(2) : '0.00';
            const fPct = st.eligible > 0 ? ((st.fail / st.eligible) * 100).toFixed(2) : '0.00';

            row.getCell(1).value = sub.subjectName || sub.baseCode;
            row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

            row.getCell(2).value = sub.label;
            row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(3).value = sub.type;
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(4).value = st.eligible;
            row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(5).value = st.pass;
            row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(6).value = st.fail;
            row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(7).value = st.abs;
            row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(8).value = `${pPct}%`;
            row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };

            row.getCell(9).value = `${fPct}%`;
            row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };

            for (let c = 1; c <= 9; c++) {
                  row.getCell(c).font = { name: 'Calibri', size: 10 };
            }
            applyBorders(row, 1, 9);
      });

      // Method Note Card
      const noteTitleRow = 7 + analysis.allSubs.length + 1;
      ws.mergeCells(`A${noteTitleRow}:I${noteTitleRow}`);
      const cNoteH = ws.getCell(`A${noteTitleRow}`);
      cNoteH.value = 'Method';
      cNoteH.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cNoteH.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cNoteH.alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getRow(noteTitleRow).height = 20;

      const noteTextStart = noteTitleRow + 1;
      const noteTextEnd = noteTitleRow + 2;
      ws.mergeCells(`A${noteTextStart}:I${noteTextEnd}`);
      const cNote = ws.getCell(`A${noteTextStart}`);
      cNote.value = 'For each subject, ABS / F (ABS) / AB entries are excluded from that subject\'s denominator. Grade F is counted as fail; all other non-ABS grades are counted as pass.';
      cNote.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT_PEACH } };
      cNote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF4A3B18' } };
      cNote.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let r = noteTextStart; r <= noteTextEnd; r++) {
            applyBorders(ws.getRow(r), 1, 9, 'FFD6B656');
      }

      ws.getColumn('A').width = 32;
      ws.getColumn('B').width = 16;
      ws.getColumn('C').width = 12;
      ws.getColumn('D').width = 16;
      ws.getColumn('E').width = 10;
      ws.getColumn('F').width = 10;
      ws.getColumn('G').width = 14;
      ws.getColumn('H').width = 12;
      ws.getColumn('I').width = 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKBOOKS: Passed / Failed Focused Files (PART 5 & PART 6)
// ─────────────────────────────────────────────────────────────────────────────
async function generateFilteredWorkbook(job, students, filterType, outputDir) {
      const isPassed = filterType === 'passed';
      const targetFileName = isPassed ? 'RGPV_Passed_Students.xlsx' : 'RGPV_Failed_Students.xlsx';
      const sheetName = isPassed ? 'Passed Students' : 'Failed Students';
      const titleLabel = isPassed ? 'Passed Students Result' : 'Failed Students Result';

      const analysis = analyzeResults(job, students);

      // Filtering according to exact user rules:
      let filtered = [];
      if (isPassed) {
            filtered = analysis.processedStudents.filter(s =>
                  s.resultDecision === 'PASS' || s.resultDecision === 'PASS WITH GRACE'
            );
      } else {
            filtered = analysis.processedStudents.filter(s =>
                  s.resultDecision === 'FAIL' || s.resultDecision.startsWith('Fail in')
            );
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sagar Institute of Research & Technology, Bhopal';
      workbook.created = new Date();

      const ws = workbook.addWorksheet(sheetName, {
            views: [{ state: 'frozen', ySplit: 7, showGridLines: true }],
            pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      });

      addLogo(workbook, ws, 0.1, 0.1);

      // 1. Institutional Header
      ws.mergeCells('B1:G1');
      const cCollege = ws.getCell('B1');
      cCollege.value = (job.collegeName || 'SAGAR INSTITUTE OF RESEARCH & TECHNOLOGY,BHOPAL').toUpperCase();
      cCollege.font = { name: 'Calibri', size: 12, bold: true };
      cCollege.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells('B2:G2');
      const cDept = ws.getCell('B2');
      cDept.value = getDepartmentName(job.branch);
      cDept.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF333333' } };
      cDept.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getRow(1).height = 20;
      ws.getRow(2).height = 18;

      // 2. Examination Details (Rows 3 & 4)
      const examDetails = [
            [
                  { label: 'College Code:', value: job.collegeCode ? String(job.collegeCode) : '' },
                  { label: 'Branch:', value: job.branch ? String(job.branch) : '' },
                  { label: 'Semester:', value: job.semester != null ? String(job.semester) : '' }
            ],
            [
                  { label: 'Examination Session:', value: job.examinationSession ? String(job.examinationSession) : '' },
                  { label: 'Examination Year:', value: job.examinationYear ? String(job.examinationYear) : '' },
                  { label: 'Category:', value: isPassed ? 'PASS & PASS WITH GRACE' : 'FAIL' }
            ]
      ];

      [3, 4].forEach((rowNum, i) => {
            const row = ws.getRow(rowNum);
            row.height = 20;
            const info = examDetails[i];

            row.getCell(1).value = info[0].label;
            row.getCell(2).value = info[0].value;
            row.getCell(3).value = info[1].label;
            row.getCell(4).value = info[1].value;
            row.getCell(5).value = info[2].label;
            row.getCell(6).value = info[2].value;
            ws.mergeCells(`F${rowNum}:G${rowNum}`);

            [1, 3, 5].forEach(col => {
                  const cell = row.getCell(col);
                  cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF334155' } };
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: META_LABEL_BG } };
                  cell.alignment = { horizontal: 'right', vertical: 'middle' };
            });
            [2, 4, 6].forEach(col => {
                  const cell = row.getCell(col);
                  cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
                  cell.alignment = { horizontal: 'left', vertical: 'middle' };
            });
            applyBorders(row, 1, 7, BORDER_SOFT);
      });

      // 3. Dark Navy-Blue Title Bar (Row 5)
      ws.mergeCells('A5:G5');
      const cTitle = ws.getCell('A5');
      cTitle.value = titleLabel;
      cTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_BLUE } };
      cTitle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(5).height = 26;

      ws.getRow(6).height = 6;

      // 4. Student Table Header (Row 7) - Dark Green
      const headers = ['S.No.', 'Enrollment No.', 'Student Name', 'SGPA', 'CGPA', 'Backlogs', 'Result'];
      const hRow = ws.getRow(7);
      hRow.height = 26;
      headers.forEach((h, idx) => {
            const cell = hRow.getCell(idx + 1);
            cell.value = h;
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_GREEN } };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      applyBorders(hRow, 1, 7, BRAND_GREEN_BORDER);
      ws.autoFilter = 'A7:G7';

      // 5. Data rows
      filtered.forEach((st, idx) => {
            const rowNum = 8 + idx;
            const row = ws.getRow(rowNum);
            row.height = 21;
            const bg = idx % 2 === 1 ? ROW_ALT_BG : ROW_WHITE;

            // 1. S.No.
            row.getCell(1).value = idx + 1;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // 2. Enrollment No. (Text)
            const cRoll = row.getCell(2);
            cRoll.value = String(st.enrollmentNumber);
            cRoll.numFmt = '@';
            cRoll.alignment = { horizontal: 'center', vertical: 'middle' };

            // 3. Student Name
            const cName = row.getCell(3);
            cName.value = st.studentName || '';
            cName.alignment = { horizontal: 'left', vertical: 'middle' };

            // 4. SGPA
            const cSgpa = row.getCell(4);
            if (st.sgpa != null) { cSgpa.value = st.sgpa; cSgpa.numFmt = '0.00'; }
            else cSgpa.value = '';
            cSgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // 5. CGPA
            const cCgpa = row.getCell(5);
            if (st.cgpa != null) { cCgpa.value = st.cgpa; cCgpa.numFmt = '0.00'; }
            else cCgpa.value = '';
            cCgpa.alignment = { horizontal: 'center', vertical: 'middle' };

            // 6. Backlogs
            const cBack = row.getCell(6);
            cBack.value = st.backlogs != null ? st.backlogs : '';
            cBack.alignment = { horizontal: 'center', vertical: 'middle' };

            // 7. Result
            const cRes = row.getCell(7);
            cRes.value = st.resultDecision;
            cRes.alignment = { horizontal: 'center', vertical: 'middle' };

            if (st.resultDecision === 'PASS') {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: PASS_TEXT } };
                  cRes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PASS_BG } };
            } else if (st.resultDecision === 'PASS WITH GRACE') {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: GRACE_TEXT } };
                  cRes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRACE_BG } };
            } else {
                  cRes.font = { name: 'Calibri', size: 10, bold: true, color: { argb: FAIL_TEXT } };
                  cRes.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FAIL_BG } };
            }

            for (let c = 1; c <= 6; c++) {
                  const cell = row.getCell(c);
                  cell.font = { name: 'Calibri', size: 10 };
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
            }
            applyBorders(row, 1, 7);
      });

      // Column widths
      ws.getColumn('A').width = 8;
      ws.getColumn('B').width = 18;
      ws.getColumn('C').width = 28;
      ws.getColumn('D').width = 12;
      ws.getColumn('E').width = 12;
      ws.getColumn('F').width = 12;
      ws.getColumn('G').width = 20;

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const diskFileName = `${path.parse(targetFileName).name}_${job.collegeCode || 'RGPV'}_${Date.now()}.xlsx`;
      const filePath = path.join(outputDir, diskFileName);
      await workbook.xlsx.writeFile(filePath);

      return { fileName: targetFileName, filePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKBOOK 1: All Results.xlsx (Five Worksheets)
// ─────────────────────────────────────────────────────────────────────────────
async function generateAllResultsWorkbook(job, students, outputDir) {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sagar Institute of Research & Technology, Bhopal';
      workbook.lastModifiedBy = 'Sagar Institute of Research & Technology, Bhopal';
      workbook.created = new Date();

      const analysis = analyzeResults(job, students);

      // Build the 5 Worksheets in order:
      buildSummarySheet(workbook, job, analysis);
      buildTotalStudentsSheet(workbook, job, analysis);
      buildToppersSheet(workbook, job, analysis);
      buildOverallAnalysisSheet(workbook, job, analysis);
      buildSubjectAnalysisSheet(workbook, job, analysis);

      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
      const targetFileName = 'All Results.xlsx';
      const diskFileName = `All_Results_${job.collegeCode || 'RGPV'}_${Date.now()}.xlsx`;
      const filePath = path.join(outputDir, diskFileName);

      await workbook.xlsx.writeFile(filePath);
      return { fileName: targetFileName, filePath };
}

/**
 * Main Controller function for exporting
 */
async function generateExcelFile(job, students = [], filter = 'all', outputDir) {
      if (filter === 'passed') {
            return generateFilteredWorkbook(job, students, 'passed', outputDir);
      }
      if (filter === 'failed') {
            return generateFilteredWorkbook(job, students, 'failed', outputDir);
      }
      return generateAllResultsWorkbook(job, students, outputDir);
}

// Backward-compatible exports
async function generateExcelReport(job, students, outputDir) {
      return generateExcelFile(job, students, 'all', outputDir);
}

async function generateFilteredExcel(job, students, filter, outputDir) {
      return generateExcelFile(job, students, filter, outputDir);
}

module.exports = {
      generateExcelFile,
      generateExcelReport,
      generateFilteredExcel,
};
