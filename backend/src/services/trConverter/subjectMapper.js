const THEORY_FIELDS = ['End Theory(70)', 'mid Sem(20)', 'assignment(10)', 'Grade'];
const PRACTICAL_FIELDS = ['End Practical(30)', 'PQS(20)', 'Grade'];

function buildSubjectColumnsFromCodes(subjectCodes, masterCatalog = new Map()) {
      return subjectCodes.map(code => {
            const type = code.includes('[P]') ? 'Practical' : 'Theory';
            const baseCode = code.replace(/\s*\[[TP]\]/i, '').trim();
            const entry = masterCatalog.get(baseCode);
            let masterName = (entry && typeof entry === 'object' ? entry.name : entry) || baseCode;
            if (typeof masterName !== 'string') masterName = String(masterName || baseCode);
            if (type === 'Practical' && !masterName.toLowerCase().includes('lab') && !masterName.toLowerCase().includes('project')) {
                  masterName += ' Lab';
            }
            return {
                  code,
                  baseCode,
                  name: masterName,
                  type,
                  label: `${masterName}(${baseCode})`,
                  fields: type === 'Practical' ? PRACTICAL_FIELDS : THEORY_FIELDS,
            };
      }).sort((a, b) => {
            if (a.type === b.type) return a.baseCode.localeCompare(b.baseCode);
            return a.type === 'Theory' ? -1 : 1;
      });
}

function buildSubjectColumns(subjects) {
      return subjects.map(subject => ({
            ...subject,
            type: subject.type === 'Practical' ? 'Practical' : 'Theory',
            fields: subject.type === 'Practical' ? PRACTICAL_FIELDS : THEORY_FIELDS,
      }));
}

module.exports = { buildSubjectColumns, buildSubjectColumnsFromCodes, THEORY_FIELDS, PRACTICAL_FIELDS };
