/**
 * RGPV Portal Configuration
 * Maps courses and modes to their result page URLs and programme radio selectors.
 * Verified from https://result.rgpv.ac.in/Result/ProgramSelect.aspx
 */

const RESULT_PAGES = {
      // B.Tech
      'B.Tech_Grading': 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
      'B.Tech_Non-Grading': 'https://result.rgpv.ac.in/Result/BtResult.aspx',
      // B.E.
      'B.E._Grading': 'https://result.rgpv.ac.in/Result/BEGradeResult.aspx',
      'B.E._Non-Grading': 'https://result.rgpv.ac.in/Result/BEResult.aspx',
      // MCA
      'MCA_Grading': 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      'MCA_Non-Grading': 'https://result.rgpv.ac.in/Result/MCArslt.aspx',
      // MBA
      'MBA_Grading': 'https://result.rgpv.ac.in/Result/MBAGradeResult.aspx',
      // M.Tech
      'M.Tech_Grading': 'https://result.rgpv.ac.in/Result/MtGradeResult.aspx',
      // B.Design (falls back to BTech grading page)
      'B.Design_Grading': 'https://result.rgpv.ac.in/Result/BtGradeResult.aspx',
};

// Revaluation URLs
const REVAL_PAGES = {
      'B.Tech_Grading': 'https://result.rgpv.ac.in/Result/BtGradeRevResult.aspx',
      'B.Tech_Non-Grading': 'https://result.rgpv.ac.in/Result/BtRevResult.aspx',
};

function getResultPageUrl(course, resultMode, resultType) {
      const key = `${course}_${resultMode}`;
      if (resultType === 'Revaluation' && REVAL_PAGES[key]) {
            return REVAL_PAGES[key];
      }
      return RESULT_PAGES[key] || RESULT_PAGES['B.Tech_Grading'];
}

// Known semester values as they appear in the RGPV dropdown
// The portal uses numeric text "1","2",..."8"
function getSemesterOptions() {
      return ['1', '2', '3', '4', '5', '6', '7', '8'];
}

module.exports = { getResultPageUrl, RESULT_PAGES, REVAL_PAGES, getSemesterOptions };
