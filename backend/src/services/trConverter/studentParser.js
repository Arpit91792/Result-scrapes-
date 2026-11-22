const ENROLLMENT_PATTERN = /\b\d{4}[A-Z]{2,6}\d{2,3}(?:[A-Z]\d{1,4}|\d{2,6})\b/i;
const SUBJ_CODE_PATTERN = /\b([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s*\[([TP])\]/i;
const IGNORE_SUBJ_WORDS = /^(PAGE|TOTAL|RESULT|GRADE|POINT|SGPA|CGPA|MAX|MIN|NOTIFICATION|COLLEGE|STATUS|EXAMINATION|BACHELOR|TABULATION)/i;
const GLUED_SUBJECT_SEPARATION = /([a-zA-Z0-9,.\-/])([A-Z]{2,4}\s*\d{3,4}[A-Z]?\s*\[[TP]\])/g;

function cleanName(raw) {
      if (!raw) return '';
      return raw
            .replace(/,\s*S\/D\/W\/O.*$/i, '')
            .replace(/\s+S\/D\/W\/O.*$/i, '')
            .replace(/\s+[A-Z]{2,4}\d{3,4}.*$/i, '')
            .replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
}

function parseSubjectMarks(type, tokens) {
      // Tokens contain marks and grade, e.g. ["24", "18C", "8C", "3", "3", "5", "C"] or ["65C", "27C", "-", "4", "4", "10", "A+", "»"]
      let grade = '';
      if (tokens.length >= 3) {
            const last = tokens[tokens.length - 1];
            const secondLast = tokens[tokens.length - 2];
            if (last === '»' && secondLast) {
                  grade = `${secondLast} »`;
            } else {
                  grade = last;
            }
      }

      if (type === 'Theory') {
            return {
                  type: 'Theory',
                  'End Theory(70)': tokens[0] || '',
                  'mid Sem(20)': tokens[1] || '',
                  'assignment(10)': tokens[2] || '',
                  Grade: grade,
            };
      } else {
            return {
                  type: 'Practical',
                  'End Practical(30)': tokens[0] || '',
                  'PQS(20)': tokens[1] || '',
                  Grade: grade,
            };
      }
}

function createStudentParser() {
      const students = new Map();
      let currentStudent = null;
      let previousEnrollment = null;
      let duplicateEnrollmentCount = 0;
      let parsedLines = 0;

      function ensureStudent(enrollment, line, pageNumber, confidence) {
            const key = enrollment.toUpperCase();
            let student = students.get(key);
            if (!student) {
                  student = {
                        enrollmentNumber: key,
                        name: '',
                        subjects: {},
                        cgpa: '',
                        sgpa: '',
                        result: '',
                        sourcePages: [pageNumber],
                        uncertainFields: [],
                        confidence: confidence || 100,
                  };
                  students.set(key, student);
            } else if (previousEnrollment && previousEnrollment !== key) {
                  duplicateEnrollmentCount += 1;
            }

            if (!student.name) {
                  const after = line.substring(line.indexOf(enrollment) + enrollment.length);
                  const nameM = after.match(/^\s+([^,]+?)(?:,\s*S\/D\/W\/O|\s+S\/D\/W\/O|\s+[A-Z]{2,4}\d{3,4}|$)/i);
                  if (nameM) {
                        student.name = cleanName(nameM[1]);
                  }
            }

            if (!student.sourcePages.includes(pageNumber)) student.sourcePages.push(pageNumber);
            currentStudent = student;
            previousEnrollment = key;
            return student;
      }

      function parsePage(text, pageNumber, confidence = 100) {
            const rawLines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
            for (let line of rawLines) {
                  if (/^Page\s+\d+\s+of\s+\d+/i.test(line)) continue;

                  // Insert space if a subject code is stuck directly to a preceding word/name without whitespace
                  line = line.replace(GLUED_SUBJECT_SEPARATION, '$1 $2');

                  const enrMatch = line.match(ENROLLMENT_PATTERN);
                  if (enrMatch) {
                        ensureStudent(enrMatch[0], line, pageNumber, confidence);
                        parsedLines++;
                  }

                  if (!currentStudent) continue;

                  // Parse SGPA / CGPA / Result
                  const sgpaM = line.match(/SEM\s*(?:VIII|VII|VI|V|IV|III|II|I)\s*:\s*([0-9.]+)/i)
                        || line.match(/\bSGPA\s*[:\-]?\s*([0-9.]+)/i);
                  if (sgpaM && !currentStudent.sgpa) currentStudent.sgpa = sgpaM[1];

                  const cgpaM = line.match(/\bCGPA\s*[:\-]?\s*([0-9.]+)/i);
                  if (cgpaM && !currentStudent.cgpa) currentStudent.cgpa = cgpaM[1];

                  const resM = line.match(/\b(PASS(?:\s+WITH\s+GRACE)?|FAIL|UFM|ABS|DETAINED)\b/i);
                  if (resM && !currentStudent.result) currentStudent.result = resM[1].toUpperCase();

                  // Parse Subject Entry
                  const subM = line.match(SUBJ_CODE_PATTERN);
                  if (subM) {
                        const baseCode = subM[1].replace(/\s+/g, '').toUpperCase();
                        if (!IGNORE_SUBJ_WORDS.test(baseCode)) {
                              const typeChar = subM[2].toUpperCase();
                              const fullCode = `${baseCode} [${typeChar}]`;
                              const type = typeChar === 'P' ? 'Practical' : 'Theory';
                              const subIndex = line.indexOf(subM[0]);
                              const rest = line.substring(subIndex + subM[0].length).trim();
                              const tokens = rest.split(/\s+/).filter(Boolean);

                              currentStudent.subjects[fullCode] = parseSubjectMarks(type, tokens);
                        }
                  }
            }
      }

      function getStudents() {
            return [...students.values()].map(student => {
                  student.uncertainFields = [...new Set(student.uncertainFields)];
                  return student;
            });
      }

      function getGroupedStudents() {
            const all = getStudents();
            const groups = new Map();

            for (const student of all) {
                  const subjectCodes = Object.keys(student.subjects).sort();
                  if (!subjectCodes.length) continue;
                  const signature = subjectCodes.join('|');
                  if (!groups.has(signature)) {
                        groups.set(signature, {
                              signature,
                              subjectCodes,
                              students: [],
                        });
                  }
                  groups.get(signature).students.push(student);
            }

            // Sort groups by student count descending (Sheet1 has the largest group)
            return [...groups.values()].sort((a, b) => b.students.length - a.students.length);
      }

      return {
            parsePage,
            getStudents,
            getGroupedStudents,
            get duplicateEnrollmentCount() { return duplicateEnrollmentCount; },
            get parsedLines() { return parsedLines; },
      };
}

module.exports = { createStudentParser, ENROLLMENT_PATTERN };
