/**
 * RGPV Course / Programme Mapping
 *
 * Maps the user-selected course name to:
 *   - The exact radio button label as it appears on result.rgpv.ac.in/Result/ProgramSelect.aspx
 *   - The direct result page URL (used as a faster shortcut when it works)
 *
 * Label values were read directly from the live ProgramSelect.aspx page (screenshot verified).
 * Main Result section and Revaluation Result section use the same label text.
 */

const COURSE_MAP = [
      // { courseName: value shown in our dropdown, rgpvLabel: exact text on RGPV radio, directUrl: direct result page }
      {
            courseName: 'B.E.',
            rgpvLabel: 'B.E.',
            directUrl: 'https://result.rgpv.ac.in/Result/BEGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BEResult.aspx',
      },
      {
            courseName: 'B.Tech.',
            rgpvLabel: 'B.Tech.',
            directUrl: 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BtResult.aspx',
      },
      {
            courseName: 'B.Tech',          // alias without dot
            rgpvLabel: 'B.Tech.',
            directUrl: 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BtResult.aspx',
      },
      {
            courseName: 'M.C.A.',
            rgpvLabel: 'M.C.A.',
            directUrl: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      },
      {
            courseName: 'MCA',             // alias
            rgpvLabel: 'M.C.A.',
            directUrl: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      },
      {
            courseName: 'B.Pharmacy',
            rgpvLabel: 'B.Pharmacy',
            directUrl: 'https://result.rgpv.ac.in/Result/BpharmaGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BpharmaResult.aspx',
      },
      {
            courseName: 'B.Pharmacy (PCI)',
            rgpvLabel: 'B.Pharmacy(PCI)',
            directUrl: 'https://result.rgpv.ac.in/Result/BpharmaGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BpharmaResult.aspx',
      },
      {
            courseName: 'B.Arch.',
            rgpvLabel: 'B.Arch.',
            directUrl: 'https://result.rgpv.ac.in/Result/BArchGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BArchResult.aspx',
      },
      {
            courseName: 'M.Pharmacy',
            rgpvLabel: 'M.Pharmacy',
            directUrl: 'https://result.rgpv.ac.in/Result/MpharmaGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MpharmaResult.aspx',
      },
      {
            courseName: 'M.E.',
            rgpvLabel: 'M.E.',
            directUrl: 'https://result.rgpv.ac.in/Result/MEGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MEResult.aspx',
      },
      {
            courseName: 'M.Tech.',
            rgpvLabel: 'M.Tech.',
            directUrl: 'https://result.rgpv.ac.in/Result/MtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MtResult.aspx',
      },
      {
            courseName: 'M.Tech',          // alias
            rgpvLabel: 'M.Tech.',
            directUrl: 'https://result.rgpv.ac.in/Result/MtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MtResult.aspx',
      },
      {
            courseName: 'B.E. (PTDC)',
            rgpvLabel: 'B.E.(PTDC)',
            directUrl: 'https://result.rgpv.ac.in/Result/BEGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BEResult.aspx',
      },
      {
            courseName: 'M.Tech. (PT)',
            rgpvLabel: 'M.Tech.(PT)',
            directUrl: 'https://result.rgpv.ac.in/Result/MtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MtResult.aspx',
      },
      {
            courseName: 'MAM',
            rgpvLabel: 'MAM',
            directUrl: 'https://result.rgpv.ac.in/Result/MAMGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MAMResult.aspx',
      },
      {
            courseName: 'MCA (DD)',
            rgpvLabel: 'MCA (DD)',
            directUrl: 'https://result.rgpv.ac.in/Result/McaDDrslt.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/McaDDrslt.aspx',
      },
      {
            courseName: 'Diploma',
            rgpvLabel: 'Diploma',
            directUrl: 'https://result.rgpv.ac.in/Result/DiplomaGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/DiplomaResult.aspx',
      },
      {
            courseName: 'Ph.D.',
            rgpvLabel: 'Ph.D.',
            directUrl: 'https://result.rgpv.ac.in/Result/PhDResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/PhDResult.aspx',
      },
      {
            courseName: 'Pharm.D.',
            rgpvLabel: 'Pharm D.',
            directUrl: 'https://result.rgpv.ac.in/Result/PharmDResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/PharmDResult.aspx',
      },
      {
            courseName: 'M.Arch.',
            rgpvLabel: 'M.Arch.',
            directUrl: 'https://result.rgpv.ac.in/Result/MArchGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MArchResult.aspx',
      },
      {
            courseName: 'M.C.A. (2 Year)',
            rgpvLabel: 'M.C.A. (2Year)',
            directUrl: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      },
      {
            courseName: 'M.B.A.',
            rgpvLabel: 'M.B.A.',
            directUrl: 'https://result.rgpv.ac.in/Result/MBAGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MBAResult.aspx',
      },
      {
            courseName: 'MBA',             // alias
            rgpvLabel: 'M.B.A.',
            directUrl: 'https://result.rgpv.ac.in/Result/MBAGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MBAResult.aspx',
      },
      {
            courseName: 'B.Tech. (PTDC)',
            rgpvLabel: 'B.Tech.(PTDC)',
            directUrl: 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BtResult.aspx',
      },
      {
            courseName: 'M.Pharm-PCI',
            rgpvLabel: 'M.Pharm-PCI',
            directUrl: 'https://result.rgpv.ac.in/Result/MpharmaGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MpharmaResult.aspx',
      },
      {
            courseName: 'B.Design',
            rgpvLabel: 'B.Design',
            directUrl: 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/BtResult.aspx',
      },
      {
            courseName: 'M.Plan',
            rgpvLabel: 'M.Plan',
            directUrl: 'https://result.rgpv.ac.in/Result/MPlanGradeResult.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MPlanResult.aspx',
      },
      {
            courseName: 'MCA-Bridge Course',
            rgpvLabel: 'MCA-Bridge Course',
            directUrl: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
            directUrlNonGrading: 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      },
];

/**
 * Find course mapping by user-selected course name.
 * Returns null if not found.
 */
function getCourseMapping(courseName) {
      if (!courseName) return null;
      const name = courseName.trim();
      // Exact match first
      let found = COURSE_MAP.find(c => c.courseName === name);
      if (found) return found;
      // Case-insensitive
      found = COURSE_MAP.find(c => c.courseName.toLowerCase() === name.toLowerCase());
      if (found) return found;
      // Partial match (e.g. "B.Tech" matches "B.Tech.")
      found = COURSE_MAP.find(c =>
            c.courseName.replace(/\./g, '').toLowerCase() === name.replace(/\./g, '').toLowerCase()
      );
      return found || null;
}

/**
 * Get direct result URL for a course + resultMode combination.
 * Falls back to B.Tech Grading if not found.
 */
function getDirectUrl(courseName, resultMode) {
      const mapping = getCourseMapping(courseName);
      if (!mapping) return 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx';
      return resultMode === 'Non-Grading'
            ? mapping.directUrlNonGrading
            : mapping.directUrl;
}

/**
 * Get the RGPV label to match against radio button text on ProgramSelect page.
 */
function getRgpvLabel(courseName) {
      const mapping = getCourseMapping(courseName);
      return mapping ? mapping.rgpvLabel : null;
}

/** All course names for the frontend dropdown */
const ALL_COURSES = [
      'B.E.',
      'B.Tech.',
      'M.C.A.',
      'B.Pharmacy',
      'B.Pharmacy (PCI)',
      'B.Arch.',
      'M.Pharmacy',
      'M.E.',
      'M.Tech.',
      'B.E. (PTDC)',
      'M.Tech. (PT)',
      'MAM',
      'MCA (DD)',
      'Diploma',
      'Ph.D.',
      'Pharm.D.',
      'M.Arch.',
      'M.C.A. (2 Year)',
      'M.B.A.',
      'B.Tech. (PTDC)',
      'M.Pharm-PCI',
      'B.Design',
      'M.Plan',
      'MCA-Bridge Course',
];

module.exports = { COURSE_MAP, getCourseMapping, getDirectUrl, getRgpvLabel, ALL_COURSES };
