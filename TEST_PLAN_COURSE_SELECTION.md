# Test Plan: Dynamic Course Selection

## Overview
This test plan verifies that Playwright correctly selects the user-chosen course on RGPV's ProgramSelect.aspx page.

## Pre-requisites
1. Backend server running (`cd backend && npm start`)
2. Frontend server running (`cd frontend && npm run dev`)
3. Valid RGPV credentials or demo mode
4. Test college code (e.g., 0133)
5. Valid enrollment numbers for the selected course

## Test Environment Setup

### Test Data Template
```javascript
{
  "collegeCode": "0133",
  "collegeName": "SIRT Bhopal",
  "branch": "CSE",
  "semester": 7,
  "examinationYear": "2024",
  "examinationSession": "November",
  "resultType": "Main",
  "resultMode": "Grading",
  "startingEnrollment": "0133CS241001",
  "endingEnrollment": "0133CS241010"
}
```

## Test Cases

### Test Group 1: Basic Engineering Programs

#### TC1.1: B.Tech. Selection
**Objective:** Verify B.Tech. is selected (not B.E.)

**Steps:**
1. Login to application
2. Navigate to "Fetch Results"
3. Select Course: "B.Tech."
4. Fill other required fields
5. Generate enrollment list
6. Click "Start Live Fetch"
7. Watch Chromium browser window

**Expected Results:**
- Log shows: `📚 Course: "B.Tech." | Mode: "Grading" | Type: "Main"`
- Log shows: `🔍 ProgramSelect: Looking for "B.Tech." in "Main" section`
- Log shows: `✓ Selected programme radio: "B.Tech."`
- Browser navigates to: `BtGradeResult.aspx`
- **NOT** `BEGradeResult.aspx`

**Pass Criteria:**
- Correct radio button selected
- Correct result page opened
- No errors in logs

---

#### TC1.2: B.E. Selection
**Objective:** Verify B.E. is selected (not B.Tech. or B.E. (PTDC))

**Steps:**
1. Login to application
2. Navigate to "Fetch Results"
3. Select Course: "B.E."
4. Fill other required fields
5. Generate enrollment list
6. Click "Start Live Fetch"
7. Watch Chromium browser window

**Expected Results:**
- Log shows: `📚 Course: "B.E." | Mode: "Grading" | Type: "Main"`
- Log shows: `✓ Selected programme radio: "B.E."`
- Browser navigates to: `BEGradeResult.aspx`
- **NOT** `BtGradeResult.aspx` or `BEResult.aspx` with PTDC

**Pass Criteria:**
- Correct radio button selected (B.E. only, not B.E. (PTDC))
- Correct result page opened

---

### Test Group 2: PTDC Programs

#### TC2.1: B.Tech. (PTDC) Selection
**Objective:** Verify B.Tech. (PTDC) is selected (not plain B.Tech.)

**Steps:**
1. Select Course: "B.Tech. (PTDC)"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `🔍 ProgramSelect: Looking for "B.Tech.(PTDC)" in "Main" section`
- Log shows: `✓ Selected programme radio: "B.Tech.(PTDC)"`
- Correct PTDC variant selected
- **NOT** plain B.Tech.

---

#### TC2.2: B.E. (PTDC) Selection
**Objective:** Verify B.E. (PTDC) is selected (not plain B.E.)

**Steps:**
1. Select Course: "B.E. (PTDC)"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "B.E.(PTDC)"`
- Correct PTDC variant selected

---

### Test Group 3: Postgraduate Programs

#### TC3.1: M.C.A. Selection
**Objective:** Verify M.C.A. is selected correctly

**Steps:**
1. Select Course: "M.C.A."
2. Fill other fields (adjust branch and enrollment for MCA)
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "M.C.A."`
- Browser navigates to: `MCArslt.aspx`

---

#### TC3.2: M.Tech. Selection
**Objective:** Verify M.Tech. is selected (not M.Tech. (PT))

**Steps:**
1. Select Course: "M.Tech."
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "M.Tech."`
- Browser navigates to: `MtGradeResult.aspx`
- **NOT** M.Tech. (PT) variant

---

#### TC3.3: M.B.A. Selection
**Objective:** Verify M.B.A. is selected

**Steps:**
1. Select Course: "M.B.A."
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "M.B.A."`
- Browser navigates to: `MBAGradeResult.aspx`

---

### Test Group 4: MCA Variants

#### TC4.1: M.C.A. (2 Year) Selection
**Objective:** Verify 2-year MCA variant is selected

**Steps:**
1. Select Course: "M.C.A. (2 Year)"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "M.C.A. (2Year)"`
- Correct variant selected

---

#### TC4.2: MCA (DD) Selection
**Objective:** Verify dual degree MCA is selected

**Steps:**
1. Select Course: "MCA (DD)"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "MCA (DD)"`
- Browser navigates to: `McaDDrslt.aspx`

---

#### TC4.3: MCA-Bridge Course Selection
**Objective:** Verify bridge course is selected

**Steps:**
1. Select Course: "MCA-Bridge Course"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "MCA-Bridge Course"`
- Correct variant selected

---

### Test Group 5: Pharmacy Programs

#### TC5.1: B.Pharmacy Selection
**Objective:** Verify B.Pharmacy is selected (not B.Pharmacy (PCI))

**Steps:**
1. Select Course: "B.Pharmacy"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "B.Pharmacy"`
- **NOT** B.Pharmacy (PCI)

---

#### TC5.2: B.Pharmacy (PCI) Selection
**Objective:** Verify PCI variant is selected

**Steps:**
1. Select Course: "B.Pharmacy (PCI)"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "B.Pharmacy(PCI)"`
- Correct PCI variant selected

---

### Test Group 6: Other Programs

#### TC6.1: Diploma Selection
**Steps:**
1. Select Course: "Diploma"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "Diploma"`
- Browser navigates to: `DiplomaGradeResult.aspx`

---

#### TC6.2: B.Arch. Selection
**Steps:**
1. Select Course: "B.Arch."
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "B.Arch."`
- Browser navigates to: `BArchGradeResult.aspx`

---

#### TC6.3: B.Design Selection
**Steps:**
1. Select Course: "B.Design"
2. Fill other fields
3. Start fetch

**Expected Results:**
- Log shows: `✓ Selected programme radio: "B.Design"`
- Correct program selected

---

### Test Group 7: Result Type Variations

#### TC7.1: B.Tech. - Revaluation Result
**Objective:** Verify correct section is targeted

**Steps:**
1. Select Course: "B.Tech."
2. Select Result Type: "Revaluation"
3. Fill other fields
4. Start fetch

**Expected Results:**
- Log shows: `Type: "Revaluation"`
- Log shows: `Looking for "B.Tech." in "Revaluation" section`
- Radio selected from Revaluation Result section
- Browser navigates to revaluation result page

---

#### TC7.2: M.C.A. - Revaluation Result
**Steps:**
1. Select Course: "M.C.A."
2. Select Result Type: "Revaluation"
3. Start fetch

**Expected Results:**
- Correct revaluation section targeted
- MCA revaluation result page opened

---

### Test Group 8: Result Mode Variations

#### TC8.1: B.Tech. - Non-Grading Mode
**Steps:**
1. Select Course: "B.Tech."
2. Select Result Mode: "Non-Grading"
3. Start fetch

**Expected Results:**
- Log shows: `Mode: "Non-Grading"`
- Browser navigates to: `BtResult.aspx` (not BtGradeResult.aspx)

---

#### TC8.2: B.E. - Non-Grading Mode
**Steps:**
1. Select Course: "B.E."
2. Select Result Mode: "Non-Grading"
3. Start fetch

**Expected Results:**
- Browser navigates to: `BEResult.aspx` (not BEGradeResult.aspx)

---

### Test Group 9: Error Handling

#### TC9.1: Unsupported Course (Negative Test)
**Objective:** Verify graceful error handling

**Steps:**
1. Manually send API request with invalid course:
```javascript
POST /api/results/start-fetch
{
  "course": "INVALID_COURSE",
  // ... other fields
}
```

**Expected Results:**
- Validation error returned
- No browser launched
- Error message: "Course 'INVALID_COURSE' is not supported"

---

#### TC9.2: Course Not Found on RGPV Page
**Objective:** Verify error when course unavailable

**Scenario:** RGPV page doesn't have the selected program

**Expected Results:**
- Log shows: `❌ Programme "X" not found`
- Log shows: `Available: [list of all available programs]`
- Job fails with clear error message
- Browser remains open for manual inspection

---

### Test Group 10: Demo Mode

#### TC10.1: B.Tech. Demo Mode
**Steps:**
1. Enable Demo Mode toggle
2. Select Course: "B.Tech."
3. Start demo fetch

**Expected Results:**
- No browser launched
- Demo data generated with correct course metadata
- Job completes successfully

---

#### TC10.2: M.C.A. Demo Mode
**Steps:**
1. Enable Demo Mode
2. Select Course: "M.C.A."
3. Start demo fetch

**Expected Results:**
- Demo results show MCA course data
- No actual RGPV portal interaction

---

## Validation Checklist

For each test case, verify:

- [ ] **Log Messages:**
  - Course name appears correctly in logs
  - RGPV label is correct
  - Selection success message appears

- [ ] **Browser Behavior:**
  - Correct radio button is selected
  - Correct result page opens
  - No automatic fallback to wrong course

- [ ] **Result Data:**
  - Fetched results have correct course metadata
  - StudentResult records show correct course

- [ ] **Error Handling:**
  - Clear error messages when program not found
  - No silent failures
  - Browser stays open for debugging

---

## Regression Tests

After the fix, verify these scenarios still work:

### R1: Enrollment Generation
- Generate enrollment list works correctly
- Upload CSV/Excel works correctly

### R2: CAPTCHA Handling
- Auto OCR CAPTCHA solving works
- Manual CAPTCHA fallback works
- Resume after verification works

### R3: Job Management
- Pause/Resume works
- Cancel works
- Multiple jobs can run sequentially

### R4: Data Export
- Excel export includes correct course data
- PDF export shows correct course
- ZIP archive works

---

## Performance Tests

### P1: Direct URL vs ProgramSelect
**Objective:** Verify direct URL optimization works

**Test:**
1. Monitor logs for "Trying direct URL"
2. Check if direct URL succeeds first (faster)
3. Verify fallback to ProgramSelect if direct URL fails

**Expected:**
- Direct URL should work for most cases (faster)
- ProgramSelect as fallback for edge cases

---

## Log Analysis

### Success Pattern
```
[Job 12345] 📚 Course: "B.Tech." | Mode: "Grading" | Type: "Main"
[Job 12345] Trying direct URL: https://result.rgpv.ac.in/Result/BtGradeResult.aspx
[Job 12345] ✓ Direct URL worked: https://result.rgpv.ac.in/Result/BtGradeResult.aspx
```

OR

```
[Job 12345] 📚 Course: "M.B.A." | Mode: "Grading" | Type: "Main"
[Job 12345] Trying direct URL: https://result.rgpv.ac.in/Result/MBAGradeResult.aspx
[Job 12345] ⚠ Direct URL failed: ..., trying ProgramSelect
[Job 12345] 🔍 ProgramSelect: Looking for "M.B.A." in "Main" section
[Job 12345] ✓ Selected programme radio: "M.B.A."
[Job 12345] ✓ Programme selected successfully → https://result.rgpv.ac.in/Result/MBAGradeResult.aspx
```

### Error Pattern
```
[Job 12345] 📚 Course: "B.Tech." | Mode: "Grading" | Type: "Main"
[Job 12345] 🔍 ProgramSelect: Looking for "B.Tech." in "Main" section
[Job 12345] ❌ Programme "B.Tech." not found. Available: B.E., M.C.A., Diploma, ...
```

---

## Automated Test Script (Optional)

```javascript
// test-course-selection.js
const courses = [
  'B.E.', 'B.Tech.', 'M.C.A.', 'B.Pharmacy', 'Diploma',
  'M.B.A.', 'M.Tech.', 'B.Arch.', 'B.Tech. (PTDC)', 'MCA (DD)'
];

for (const course of courses) {
  console.log(`Testing: ${course}`);
  const result = await fetch('/api/results/start-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      collegeCode: '0133',
      course: course,
      branch: 'CSE',
      semester: 7,
      examinationYear: '2024',
      examinationSession: 'November',
      startingEnrollment: '0133CS241001',
      endingEnrollment: '0133CS241002',
      demoMode: true
    })
  });
  
  const data = await result.json();
  console.log(`  Status: ${result.status}`);
  console.log(`  Job ID: ${data.job?._id}`);
  console.log(`  Course in DB: ${data.job?.course}`);
  
  // Wait 2 seconds between tests
  await new Promise(r => setTimeout(r, 2000));
}
```

---

## Sign-off

| Test Group | Tester | Date | Status | Notes |
|------------|--------|------|--------|-------|
| Basic Engineering | | | | |
| PTDC Programs | | | | |
| Postgraduate | | | | |
| MCA Variants | | | | |
| Pharmacy | | | | |
| Other Programs | | | | |
| Result Type | | | | |
| Result Mode | | | | |
| Error Handling | | | | |
| Demo Mode | | | | |

---

## Known Limitations

1. **Portal Changes:** If RGPV changes radio button labels, `rgpvCourseMap.js` needs updating
2. **New Programs:** New programs must be added to both frontend dropdown and course map
3. **Network Issues:** Slow networks may need timeout adjustments

---

## Maintenance

### Adding a New Course

1. **Frontend:** Add to `COURSES` array in `FetchResultsPage.jsx`
2. **Course Map:** Add entry to `COURSE_MAP` in `rgpvCourseMap.js`:
   ```javascript
   {
     courseName: 'New Program',
     rgpvLabel: 'New Program',  // Exact text from RGPV page
     directUrl: 'https://result.rgpv.ac.in/Result/NewProgramResult.aspx',
     directUrlNonGrading: 'https://result.rgpv.ac.in/Result/NewProgramResult.aspx',
   }
   ```
3. **Test:** Run complete test suite with new program

---

## Quick Smoke Test

**Minimum tests to verify the fix works:**

1. ✓ B.Tech. → Should open BtGradeResult.aspx
2. ✓ B.E. → Should open BEGradeResult.aspx  
3. ✓ M.C.A. → Should open MCArslt.aspx
4. ✓ Diploma → Should open DiplomaGradeResult.aspx
5. ✓ B.Tech. (PTDC) → Should select PTDC variant, not plain B.Tech.

If all 5 pass → Fix is working correctly! ✅
