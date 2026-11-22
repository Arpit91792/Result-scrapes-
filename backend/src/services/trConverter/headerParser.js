const MASTER_SUBJ_REGEX = /^\s*(\d+)\s+([A-Z]{2,4}\s*\d{3,4}[A-Z]?)\s+([A-Za-z][A-Za-z0-9 &,\-\/().]+?)(?:\s+\d{2,3}\s+\d{1,3}|\s+Total\b|$)/i;
const IGNORE_SUBJ_PREFIX = /^(PAGE|TOTAL|RESULT|GRADE|POINT|SGPA|CGPA|MAX|MIN|NOTIFICATION|COLLEGE|STATUS|EXAMINATION|BACHELOR|TABULATION)/i;

function firstMatch(text, patterns) {
      for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) return match[1].trim();
      }
      return '';
}

function parseHeader(text) {
      const upper = text.toUpperCase();
      const metadata = {
            collegeCode: firstMatch(upper, [
                  /(?:COLLEGE|INSTITUTE)\s*CODE\s*[:\-]?\s*([A-Z0-9]{4,10})/,
                  /\bCODE\s*[:\-]?\s*([A-Z0-9]{4,10})\b/,
            ]),
            branch: firstMatch(upper, [
                  /\b(CIVIL|COMPUTER SCIENCE|COMPUTER|MECHANICAL|ELECTRICAL|ELECTRONICS|INFORMATION TECHNOLOGY|CHEMICAL|PHARMACY|ARCHITECTURE)\s+ENGINEERING\b/,
                  /\b(?:B\.?E\.?|B\.?TECH\.?)\s*[-:]?\s*([A-Z &]+)\b/,
            ]),
            semester: firstMatch(upper, [
                  /(?:SEMESTER|SEM\.?)\s*[:\-]?\s*(VIII|VII|VI|V|IV|III|II|I|[1-8])\b/,
            ]),
            examinationSession: firstMatch(upper, [/\b(JUNE|NOVEMBER|DECEMBER|MAY)\b/]),
            examinationYear: firstMatch(upper, [/\b(20\d{2})\b/]),
            examinationType: firstMatch(upper, [
                  /\b(REGULAR|EX|EX-STUDENT|ATKT|REVALUATION|SUPPLEMENTARY)\b/,
            ]),
            subjects: [],
      };

      const branchNames = {
            CIVIL: 'Civil Engineering',
            'COMPUTER SCIENCE': 'Computer Science and Engineering',
            COMPUTER: 'Computer Science and Engineering',
            MECHANICAL: 'Mechanical Engineering',
            ELECTRICAL: 'Electrical Engineering',
            ELECTRONICS: 'Electronics and Communication Engineering',
            'INFORMATION TECHNOLOGY': 'Information Technology',
            CHEMICAL: 'Chemical Engineering',
            PHARMACY: 'Pharmacy',
            ARCHITECTURE: 'Architecture',
      };
      if (metadata.branch) {
            metadata.branch = branchNames[metadata.branch] || metadata.branch;
            if (!/ENGINEERING|PHARMACY|ARCHITECTURE/i.test(metadata.branch)) {
                  metadata.branch = `${metadata.branch} Engineering`;
            }
      }

      const collegeLine = text.split(/\r?\n/).find(line =>
            /\b(COLLEGE|INSTITUTE|UNIVERSITY)\b/i.test(line)
            && !/\b(COLLEGE|INSTITUTE)\s*CODE\b/i.test(line)
      );
      if (collegeLine) metadata.collegeName = collegeLine.trim().slice(0, 180);

      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const seen = new Set();
      for (const line of lines) {
            if (/^Page\s+\d+\s+of\s+\d+/i.test(line)) continue;
            if (IGNORE_SUBJ_PREFIX.test(line)) continue;

            const match = line.match(MASTER_SUBJ_REGEX);
            if (match) {
                  const code = match[2].replace(/\s+/g, '').toUpperCase();
                  if (IGNORE_SUBJ_PREFIX.test(code)) continue;
                  let name = match[3].trim().replace(/[\s\-–—]+$/, '');
                  if (name.length >= 3 && !IGNORE_SUBJ_PREFIX.test(name) && !seen.has(code)) {
                        seen.add(code);
                        metadata.subjects.push({
                              code,
                              name,
                              type: /\b(PRACTICAL|PRACT|LAB(?:ORATORY)?)\b/i.test(name) ? 'Practical' : 'Theory',
                        });
                  }
            }
      }

      return metadata;
}

function mergeMetadata(target, incoming) {
      for (const key of ['collegeCode', 'collegeName', 'branch', 'semester', 'examinationSession', 'examinationYear', 'examinationType']) {
            if (!target[key] && incoming[key]) target[key] = incoming[key];
      }
      const subjectMap = new Map((target.subjects || []).map(subject => [subject.code, subject]));
      for (const subject of incoming.subjects || []) {
            const previous = subjectMap.get(subject.code);
            if (!previous) subjectMap.set(subject.code, subject);
            else if (!previous.name && subject.name) previous.name = subject.name;
            else if (subject.type === 'Practical') previous.type = 'Practical';
      }
      target.subjects = [...subjectMap.values()];
      return target;
}

module.exports = { parseHeader, mergeMetadata };
