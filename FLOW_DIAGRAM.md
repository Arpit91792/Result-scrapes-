# Visual Flow Diagrams

## 🎯 Course Selection Flow

### Before Fix (Broken) ❌
```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERACTION                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  User selects "B.Tech."
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND SUBMISSION                       │
│  { course: "B.Tech.", collegeCode: "0133", ... }           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                        │
│  FetchJob created with course="B.Tech."                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   PLAYWRIGHT AUTOMATION                      │
│                                                              │
│  1. Opens ProgramSelect.aspx                                │
│  2. ❌ Clicks FIRST radio button → B.E.                     │
│  3. Navigates to BEGradeResult.aspx                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ❌ WRONG RESULTS FETCHED
                    (B.E. instead of B.Tech.)
```

### After Fix (Working) ✅
```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERACTION                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                  User selects "B.Tech."
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND SUBMISSION                       │
│  { course: "B.Tech.", collegeCode: "0133", ... }           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND PROCESSING                        │
│  FetchJob created with course="B.Tech."                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   COURSE MAPPING LOOKUP                      │
│  getRgpvLabel("B.Tech.") → "B.Tech."                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   PLAYWRIGHT AUTOMATION                      │
│                                                              │
│  1. Opens ProgramSelect.aspx                                │
│  2. 🔍 Searches for "B.Tech." label                         │
│  3. ✅ Finds and clicks B.Tech. radio button                │
│  4. Navigates to BtGradeResult.aspx                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                 ✅ CORRECT RESULTS FETCHED
                      (B.Tech. as requested)
```

---

## 🔍 Radio Button Selection Logic

### Three-Tier Matching Strategy

```
┌─────────────────────────────────────────────────────────────┐
│            INPUT: User selected "B.Tech."                    │
│            Looking for RGPV label: "B.Tech."                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1: EXACT MATCH                       │
│                   (Highest Priority)                         │
│                                                              │
│  For each radio button:                                     │
│    if (td.text === "B.Tech.") → ✅ CLICK & RETURN           │
│                                                              │
│  ✓ Prevents "B.E." matching "B.E. (PTDC)"                   │
│  ✓ Prevents "B.Tech." matching "B.Tech. (PTDC)"             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (if no exact match)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 TIER 2: STARTSWITH MATCH                     │
│                                                              │
│  For each radio button:                                     │
│    if (td.text.startsWith("B.Tech. ")) → ✅ CLICK & RETURN  │
│                                                              │
│  ✓ Allows flexible matching                                 │
│  ✓ Still prevents false positives                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (if no startsWith match)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              TIER 3: WORD BOUNDARY MATCH                     │
│                      (Fallback)                              │
│                                                              │
│  For each radio button:                                     │
│    regex = /\bB\.Tech\.\b/                                  │
│    if (regex.test(td.text)) → ✅ CLICK & RETURN             │
│                                                              │
│  ✓ Catches edge cases                                       │
│  ✓ Word boundaries prevent partial matches                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (if no match at all)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      NO MATCH FOUND                          │
│                                                              │
│  ❌ List all available programs                              │
│  ❌ Return error with details                                │
│  ❌ Job fails with clear message                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Example Scenarios

### Scenario A: B.Tech. vs B.E.

```
RGPV Page Radio Buttons:
┌──────────────────┐
│ ○ B.E.          │  ← ❌ Not this one
├──────────────────┤
│ ○ B.Tech.       │  ← ✅ This one!
├──────────────────┤
│ ○ M.C.A.        │
└──────────────────┘

User Selection: "B.Tech."
Matching Process:
  Tier 1: "B.Tech." === "B.E."        → No
  Tier 1: "B.Tech." === "B.Tech."     → ✅ YES! Click this radio
```

### Scenario B: B.Tech. vs B.Tech. (PTDC)

```
RGPV Page Radio Buttons:
┌──────────────────┐
│ ○ B.Tech.       │  ← ✅ This one!
├──────────────────┤
│ ○ B.Tech.(PTDC) │  ← ❌ Not this one
└──────────────────┘

User Selection: "B.Tech."
Matching Process:
  Tier 1: "B.Tech." === "B.Tech."       → ✅ YES! Click this radio
  (Stops here, doesn't even check PTDC variant)
```

### Scenario C: B.Tech. (PTDC) Selection

```
RGPV Page Radio Buttons:
┌──────────────────┐
│ ○ B.Tech.       │  ← ❌ Not this one (exact match fails)
├──────────────────┤
│ ○ B.Tech.(PTDC) │  ← ✅ This one!
└──────────────────┘

User Selection: "B.Tech. (PTDC)"
RGPV Label: "B.Tech.(PTDC)"
Matching Process:
  Tier 1: "B.Tech.(PTDC)" === "B.Tech."       → No
  Tier 1: "B.Tech.(PTDC)" === "B.Tech.(PTDC)" → ✅ YES! Click this radio
```

### Scenario D: M.C.A. Variants

```
RGPV Page Radio Buttons:
┌──────────────────────┐
│ ○ M.C.A.            │  ← Selects if user chose "M.C.A."
├──────────────────────┤
│ ○ M.C.A. (2Year)    │  ← Selects if user chose "M.C.A. (2 Year)"
├──────────────────────┤
│ ○ MCA (DD)          │  ← Selects if user chose "MCA (DD)"
├──────────────────────┤
│ ○ MCA-Bridge Course │  ← Selects if user chose "MCA-Bridge Course"
└──────────────────────┘

Each variant is matched precisely - no confusion!
```

---

## 🔄 Section-Aware Selection

### Main Result vs Revaluation Result

```
RGPV ProgramSelect.aspx Structure:

┌───────────────────────────────────────────────────┐
│          📋 MAIN RESULT SECTION                   │
├───────────────────────────────────────────────────┤
│  Table with radio buttons:                        │
│    ○ B.E.                                         │
│    ○ B.Tech.                                      │
│    ○ M.C.A.                                       │
│    ○ Diploma                                      │
│    ...                                            │
└───────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────┐
│       📋 REVALUATION RESULT SECTION               │
├───────────────────────────────────────────────────┤
│  Table with radio buttons:                        │
│    ○ B.E.                                         │
│    ○ B.Tech.                                      │
│    ○ M.C.A.                                       │
│    ...                                            │
└───────────────────────────────────────────────────┘

Algorithm:
  1. Identify resultType (Main or Revaluation)
  2. Find the corresponding section heading
  3. Get the table immediately following that heading
  4. Search ONLY within that table's radio buttons
  5. Fallback to all radios if section not found
```

---

## 🎨 Log Message Flow

### Successful Selection

```
[Job 12345] 📚 Course: "B.Tech." | Mode: "Grading" | Type: "Main"
      │
      │ Trying direct URL first (optimization)
      ▼
[Job 12345] Trying direct URL: https://result.rgpv.ac.in/Result/BtGradeResult.aspx
      │
      │ Direct URL worked!
      ▼
[Job 12345] ✓ Direct URL worked: https://result.rgpv.ac.in/Result/BtGradeResult.aspx
      │
      ▼
   ✅ CONTINUE WITH RESULT FETCHING
```

### Selection via ProgramSelect

```
[Job 12345] 📚 Course: "M.C.A." | Mode: "Grading" | Type: "Main"
      │
      │ Trying direct URL first
      ▼
[Job 12345] Trying direct URL: https://result.rgpv.ac.in/Result/MCArslt.aspx
      │
      │ Direct URL failed (timeout or not found)
      ▼
[Job 12345] ⚠ Direct URL failed: Navigation timeout, trying ProgramSelect
      │
      │ Fallback to ProgramSelect page
      ▼
[Job 12345] 🔍 ProgramSelect: Looking for "M.C.A." in "Main" section
      │
      │ Searching radio buttons...
      ▼
[Job 12345] ✓ Selected programme radio: "M.C.A."
      │
      │ Navigation successful
      ▼
[Job 12345] ✓ Programme selected successfully → https://result.rgpv.ac.in/Result/MCArslt.aspx
      │
      ▼
   ✅ CONTINUE WITH RESULT FETCHING
```

### Error Case

```
[Job 12345] 📚 Course: "NewCourse" | Mode: "Grading" | Type: "Main"
      │
      ▼
[Job 12345] 🔍 ProgramSelect: Looking for "NewCourse" in "Main" section
      │
      │ Searched all tiers, no match found
      ▼
[Job 12345] ❌ Programme "NewCourse" not found. Available: B.E., B.Tech., M.C.A., ...
      │
      ▼
   ❌ JOB FAILS WITH CLEAR ERROR
```

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │  FetchResultsPage.jsx                              │     │
│  │  • Course dropdown (24 options)                    │     │
│  │  • Form validation                                 │     │
│  │  • Submit to backend API                           │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼ POST /api/results/start-fetch
┌──────────────────────────────────────────────────────────────┐
│                         BACKEND API                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │  routes/results.js                                 │     │
│  │  • Validate course field                           │     │
│  │  • Create FetchJob with course                     │     │
│  │  • Start job processor                             │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                      JOB PROCESSOR                           │
│  ┌────────────────────────────────────────────────────┐     │
│  │  services/jobProcessor.js                          │     │
│  │  • Manages job lifecycle                           │     │
│  │  • Passes job config to ResultFetcher              │     │
│  │  • Updates counters                                │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼ job.course
┌──────────────────────────────────────────────────────────────┐
│                      COURSE MAPPING                          │
│  ┌────────────────────────────────────────────────────┐     │
│  │  utils/rgpvCourseMap.js                            │     │
│  │  • Maps "B.Tech." → "B.Tech."                      │     │
│  │  • Maps "M.C.A." → "M.C.A."                        │     │
│  │  • Provides direct URLs                            │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼ rgpvLabel
┌──────────────────────────────────────────────────────────────┐
│                    PLAYWRIGHT AUTOMATION                      │
│  ┌────────────────────────────────────────────────────┐     │
│  │  services/resultFetcher.js                         │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │ selectProgramme()                        │     │     │
│  │  │ • Opens ProgramSelect.aspx               │     │     │
│  │  │ • Calls _clickProgrammeRadio()           │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  │  ┌──────────────────────────────────────────┐     │     │
│  │  │ _clickProgrammeRadio()                   │     │     │
│  │  │ • Tier 1: Exact match                    │     │     │
│  │  │ • Tier 2: StartsWith match               │     │     │
│  │  │ • Tier 3: Word boundary match            │     │     │
│  │  │ • ✅ Clicks correct radio button         │     │     │
│  │  └──────────────────────────────────────────┘     │     │
│  └────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                        RGPV PORTAL                           │
│  • ProgramSelect.aspx                                        │
│  • BtGradeResult.aspx / BEGradeResult.aspx / etc.           │
│  • Result data scraped and stored                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 📈 Decision Tree

```
                         User selects course
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Is course supported?  │
                    └───────────────────────┘
                        │           │
                     Yes│           │No
                        │           └──────→ ❌ Error: "Course not supported"
                        ▼
           ┌────────────────────────┐
           │ Try direct URL first   │
           └────────────────────────┘
                    │        │
              Works │        │ Fails
                    │        │
                    ▼        ▼
              ✅ Done    ┌────────────────────────┐
                         │ Go to ProgramSelect    │
                         └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ Find result section    │
                    │ (Main or Revaluation) │
                    └────────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ TIER 1: Exact match?   │
                    └────────────────────────┘
                         │           │
                      Yes│           │No
                         │           ▼
                         │  ┌────────────────────────┐
                         │  │ TIER 2: StartsWith?    │
                         │  └────────────────────────┘
                         │       │           │
                         │    Yes│           │No
                         │       │           ▼
                         │       │  ┌────────────────────────┐
                         │       │  │ TIER 3: Word boundary? │
                         │       │  └────────────────────────┘
                         │       │       │           │
                         │       │    Yes│           │No
                         │       │       │           ▼
                         ▼       ▼       ▼     ❌ Error: "Programme not found"
                               ✅ Click radio button
                                       │
                                       ▼
                          Page navigates to result form
                                       │
                                       ▼
                                   ✅ Done
```

---

## 🎯 Summary Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    PROBLEM SOLVED                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  BEFORE: Always selected first option (B.E.)           ❌    │
│                                                               │
│  AFTER: Dynamically selects user's choice              ✅    │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│                    KEY COMPONENTS                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Frontend → Sends course selection                        │
│  2. Backend → Stores in FetchJob                             │
│  3. Course Map → Maps to RGPV label                          │
│  4. Playwright → Finds and clicks correct radio button       │
│                                                               │
├──────────────────────────────────────────────────────────────┤
│                    BENEFITS                                   │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ✓ 24 courses supported                                      │
│  ✓ Exact matching (prevents false positives)                 │
│  ✓ Clear error messages                                      │
│  ✓ No silent failures                                        │
│  ✓ Easy to debug (emoji logs)                                │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

*These diagrams provide a visual representation of the course selection implementation. Refer to the other documentation files for detailed code examples and test plans.*
