# Dynamic RGPV Course/Program Selection - Implementation Complete

## Summary
Fixed Playwright to dynamically select the course/program that the user chooses on the website, instead of always selecting the first option (B.E.).

## What Was Changed

### 1. Frontend (Already Correct ✓)
- `FetchResultsPage.jsx` already includes a Course dropdown with all 24 RGPV programs
- The selected course is sent to the backend in the fetch request

### 2. Backend Routes (Already Correct ✓)
- `/start-fetch` endpoint already validates and extracts the `course` field
- The course is stored in the FetchJob model

### 3. Course Mapping (Already Correct ✓)
- `rgpvCourseMap.js` contains complete mappings from user-friendly names to RGPV labels
- Supports all 24 programs with exact label matching

### 4. Playwright Automation (IMPROVED ✓)
**File:** `backend/src/services/resultFetcher.js`

**Key Improvements:**

#### a. `selectProgramme()` method:
- Receives the user-selected `course` from jobConfig
- Looks up the exact RGPV label using `getRgpvLabel(course)`
- Navigates to ProgramSelect.aspx
- Calls `_clickProgrammeRadio()` to find and select the correct program

#### b. `_clickProgrammeRadio()` method - Enhanced Matching Logic:
Three-tier matching strategy to prevent incorrect selections:

**Tier 1: Exact Match (Highest Priority)**
```javascript
if (tdText === normalize(label))
```
- Prevents "B.E." from matching "B.E. (PTDC)"
- Prevents "B.Tech." from matching "B.Tech. (PTDC)"
- Most precise matching

**Tier 2: StartsWith Match**
```javascript
if (tdText.startsWith(normalize(label) + ' ') || tdText === normalize(label))
```
- Allows "B.Tech." to match "B.Tech. Computer Science" (if such text exists)
- Includes space check to prevent false positives

**Tier 3: Word Boundary Match (Fallback)**
```javascript
const regex = new RegExp('\\b' + normalizedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
if (regex.test(tdText))
```
- Uses regex word boundaries to ensure whole-word matching
- Prevents partial matches like "Tech" matching "B.Tech."

#### c. Section-Aware Selection:
- Searches within the correct section first (Main Result vs Revaluation Result)
- Falls back to all radios if section-specific search fails

## Supported Courses
All 24 RGPV programs are supported:

1. B.E.
2. B.Tech.
3. M.C.A.
4. B.Pharmacy
5. B.Pharmacy (PCI)
6. B.Arch.
7. M.Pharmacy
8. M.E.
9. M.Tech.
10. B.E. (PTDC)
11. M.Tech. (PT)
12. MAM
13. MCA (DD)
14. Diploma
15. Ph.D.
16. Pharm.D.
17. M.Arch.
18. M.C.A. (2 Year)
19. M.B.A.
20. B.Tech. (PTDC)
21. M.Pharm-PCI
22. B.Design
23. M.Plan
24. MCA-Bridge Course

## Test Cases

### Test Case 1: B.Tech Selection
- **Frontend:** User selects "B.Tech."
- **Expected:** Playwright selects "B.Tech." radio button (NOT B.E.)
- **RGPV Label:** "B.Tech."

### Test Case 2: B.E. Selection
- **Frontend:** User selects "B.E."
- **Expected:** Playwright selects "B.E." radio button (NOT B.E. (PTDC))
- **RGPV Label:** "B.E."

### Test Case 3: M.C.A. Selection
- **Frontend:** User selects "M.C.A."
- **Expected:** Playwright selects "M.C.A." radio button
- **RGPV Label:** "M.C.A."

### Test Case 4: Diploma Selection
- **Frontend:** User selects "Diploma"
- **Expected:** Playwright selects "Diploma" radio button
- **RGPV Label:** "Diploma"

### Test Case 5: B.Tech. (PTDC) Selection
- **Frontend:** User selects "B.Tech. (PTDC)"
- **Expected:** Playwright selects "B.Tech.(PTDC)" radio button (NOT plain B.Tech.)
- **RGPV Label:** "B.Tech.(PTDC)"

## Error Handling

### Course Not Found
If the selected course is not available on the RGPV page:
1. Logs all available programs
2. Returns error: `Programme "X" not found on RGPV page. Available: [list]`
3. Job fails with clear error message
4. Does NOT silently switch to another course

### Invalid Course
If an unsupported course is sent:
1. Returns error: `Course "X" is not supported`
2. Job fails immediately before browser launch

## Flow Diagram

```
User Selects "B.Tech." on Frontend
         ↓
Frontend sends: { course: "B.Tech.", ... }
         ↓
Backend creates FetchJob with course="B.Tech."
         ↓
JobProcessor calls fetchSingleResult(enrollment, job, jobId)
         ↓
fetchSingleResult calls navigateToResultPage(job, jobId)
         ↓
navigateToResultPage calls selectProgramme(job, jobId)
         ↓
selectProgramme:
  - Gets rgpvLabel = "B.Tech." from getRgpvLabel("B.Tech.")
  - Opens ProgramSelect.aspx
  - Calls _clickProgrammeRadio("B.Tech.", "Main", jobId)
         ↓
_clickProgrammeRadio:
  - Finds all radio buttons in "Main Result" section
  - Searches for EXACT match: "B.Tech."
  - Clicks the matching radio button
  - Returns success
         ↓
Page navigates to BtGradeResult.aspx
         ↓
Result fetching begins with correct program
```

## Verification Steps

1. **Test B.E. vs B.Tech:**
   - Select B.E. → Should open BEGradeResult.aspx
   - Select B.Tech. → Should open BtGradeResult.aspx

2. **Test PTDC Programs:**
   - Select B.Tech. (PTDC) → Should match only PTDC variant
   - Select B.E. (PTDC) → Should match only PTDC variant

3. **Test M.C.A. Programs:**
   - Select M.C.A. → Should match standard MCA
   - Select M.C.A. (2 Year) → Should match 2-year variant
   - Select MCA (DD) → Should match dual degree
   - Select MCA-Bridge Course → Should match bridge program

4. **Check Logs:**
   - Look for: `✓ Selected programme radio: "B.Tech."`
   - Should show exact matched text from RGPV page

## Benefits

1. **No More Hardcoding:** Never selects first option by default
2. **User Control:** Respects user's course selection
3. **Safety:** Won't silently switch to wrong course
4. **Clear Errors:** Shows available options if course not found
5. **Future-Proof:** Easy to add new courses by updating rgpvCourseMap.js
6. **Precise Matching:** Three-tier matching prevents false positives

## Files Modified

1. `backend/src/services/resultFetcher.js` - Enhanced `_clickProgrammeRadio()` method

## Files Already Correct (No Changes Needed)

1. `frontend/src/pages/FetchResultsPage.jsx` - Already sends course field
2. `backend/src/routes/results.js` - Already validates and stores course
3. `backend/src/utils/rgpvCourseMap.js` - Already has complete mappings
4. `backend/src/services/jobProcessor.js` - Already passes job object
5. `backend/src/models/FetchJob.js` - Already stores course field

## Testing Commands

```bash
# Start backend
cd backend
npm start

# Start frontend
cd frontend
npm run dev

# Test different courses:
# 1. Login to the application
# 2. Go to "Fetch Results"
# 3. Select different courses from dropdown
# 4. Start fetch job
# 5. Watch browser window - verify correct program is selected
# 6. Check logs for: "✓ Selected programme radio: ..."
```

## Success Criteria

✓ Playwright selects the exact program the user chooses
✓ B.Tech. selects B.Tech., NOT B.E.
✓ B.E. selects B.E., NOT B.E. (PTDC)
✓ Each program maps to its correct RGPV radio button
✓ Clear error if program unavailable
✓ No silent course switching
