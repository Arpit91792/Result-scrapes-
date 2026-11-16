# Quick Reference: Dynamic Course Selection

## ✅ What Was Fixed

**Problem:** Playwright always selected the first program (B.E.) regardless of user choice.

**Solution:** Playwright now dynamically selects the exact program the user chooses.

---

## 🚀 Quick Test (2 Minutes)

1. Start servers:
   ```bash
   # Terminal 1
   cd backend
   npm start
   
   # Terminal 2
   cd frontend
   npm run dev
   ```

2. Open browser → Login → "Fetch Results"

3. **Test B.Tech:**
   - Select Course: **"B.Tech."**
   - Fill college code, enrollments, etc.
   - Click "Start Live Fetch"
   - **Watch browser:** Should select B.Tech. radio (NOT B.E.)
   - **Check logs:** Should show `✓ Selected programme radio: "B.Tech."`

4. **Test M.C.A:**
   - Select Course: **"M.C.A."**
   - Start fetch
   - **Watch browser:** Should select M.C.A. radio
   - **Check logs:** Should show `✓ Selected programme radio: "M.C.A."`

---

## 📊 Supported Programs (24)

| B.E./B.Tech | Postgraduate | Pharmacy | Others |
|-------------|--------------|----------|---------|
| B.E. | M.C.A. | B.Pharmacy | Diploma |
| B.Tech. | M.Tech. | B.Pharmacy (PCI) | B.Arch. |
| B.E. (PTDC) | M.B.A. | M.Pharmacy | B.Design |
| B.Tech. (PTDC) | M.E. | M.Pharm-PCI | M.Plan |
| | M.Tech. (PT) | Pharm.D. | Ph.D. |
| | M.C.A. (2 Year) | | MAM |
| | MCA (DD) | | M.Arch. |
| | MCA-Bridge | | |

---

## 🔍 How to Verify It's Working

### Check Logs
Look for these messages:

**Success:**
```
📚 Course: "B.Tech." | Mode: "Grading" | Type: "Main"
✓ Selected programme radio: "B.Tech."
✓ Programme selected successfully
```

**Error (if program not found):**
```
❌ Programme "X" not found. Available: [list]
```

### Watch Browser
- Chromium window opens
- Goes to ProgramSelect.aspx
- **Correct radio button is selected** (not always the first one)
- Page navigates to correct result page

### Check Result Data
- StudentResult records show correct `course` field
- Excel export shows correct course column

---

## ⚠️ Common Issues

### Issue 1: Wrong Program Selected
**Symptom:** B.E. selected instead of B.Tech.

**Check:**
1. Frontend sending correct course? (Check network tab)
2. Job record has correct course? (Check MongoDB)
3. Logs show correct course? (Check backend logs)

**Fix:** If logs show wrong course, frontend dropdown value might be wrong.

---

### Issue 2: "Programme Not Found" Error
**Symptom:** Error message lists available programs.

**Causes:**
- RGPV page layout changed
- Course label in `rgpvCourseMap.js` doesn't match RGPV page exactly

**Fix:**
1. Open ProgramSelect.aspx manually
2. Check exact text of radio button labels
3. Update `rgpvLabel` in `rgpvCourseMap.js` to match exactly

---

### Issue 3: B.Tech. (PTDC) Selects Plain B.Tech.
**Symptom:** PTDC variant not selected.

**Cause:** Exact matching might be failing.

**Check Logs:**
```
Looking for "B.Tech.(PTDC)" in "Main" section
```

**Fix:** Verify RGPV page has "B.Tech.(PTDC)" label (with or without space).

---

## 🛠️ Maintenance

### Adding New Course

**Step 1:** Add to frontend (`FetchResultsPage.jsx`):
```jsx
const COURSES = [
  // ...
  'New Course Name',
];
```

**Step 2:** Add to course map (`rgpvCourseMap.js`):
```javascript
{
  courseName: 'New Course Name',
  rgpvLabel: 'New Course',  // Exact text from RGPV
  directUrl: 'https://result.rgpv.ac.in/Result/...',
  directUrlNonGrading: '...',
}
```

**Step 3:** Test it!

---

## 📝 Code Locations

| Feature | File | Method |
|---------|------|--------|
| Course dropdown | `frontend/src/pages/FetchResultsPage.jsx` | Line ~11 |
| Course mapping | `backend/src/utils/rgpvCourseMap.js` | `COURSE_MAP` |
| Radio button selection | `backend/src/services/resultFetcher.js` | `_clickProgrammeRadio()` |
| Program selection | `backend/src/services/resultFetcher.js` | `selectProgramme()` |

---

## 🎯 Test Checklist

Before deploying:

- [ ] B.Tech. selects B.Tech. (not B.E.)
- [ ] B.E. selects B.E. (not B.E. (PTDC))
- [ ] M.C.A. selects M.C.A.
- [ ] Diploma selects Diploma
- [ ] B.Tech. (PTDC) selects PTDC variant
- [ ] Logs show correct course
- [ ] Browser selects correct radio
- [ ] Result page matches course
- [ ] Excel export shows correct course
- [ ] Error handling works (if program not found)

---

## 🐛 Debugging

### Enable Detailed Logs

Check backend console for:
```
[Job 12345] 📚 Course: "..." | Mode: "..." | Type: "..."
[Job 12345] 🔍 ProgramSelect: Looking for "..." in "..." section
[Job 12345] ✓ Selected programme radio: "..."
```

### Manual Test

Open browser console on ProgramSelect.aspx and run:
```javascript
// Find all radio labels
document.querySelectorAll('input[type="radio"]').forEach(r => {
  const td = r.closest('td');
  console.log(td?.innerText);
});
```

This shows all available program labels on the page.

---

## 💡 Tips

1. **Direct URL First:** The system tries direct URLs first (faster). If that fails, it falls back to ProgramSelect.

2. **Section Aware:** Searches "Main Result" or "Revaluation Result" section based on user selection.

3. **Three-Tier Matching:**
   - Exact match (highest priority)
   - StartsWith match
   - Word boundary match (fallback)

4. **No Silent Failures:** If program not found, job fails with clear error. No automatic switching.

5. **Demo Mode:** Works with demo mode too (no browser needed).

---

## 📞 Support

If you encounter issues:

1. **Check logs** for error messages
2. **Watch browser** to see what's selected
3. **Verify RGPV labels** match `rgpvCourseMap.js`
4. **Test in demo mode** first

---

## ✨ Key Benefits

- ✅ User control: Respects user's choice
- ✅ Precise matching: B.E. ≠ B.E. (PTDC)
- ✅ Clear errors: Shows available options
- ✅ 24 programs supported
- ✅ Easy to extend
- ✅ No hardcoding

---

## 🎉 Success Indicator

**You know it's working when:**
- User selects **B.Tech.** → Playwright selects **B.Tech.**
- User selects **M.C.A.** → Playwright selects **M.C.A.**
- User selects **Diploma** → Playwright selects **Diploma**
- **No more automatic B.E. selection!**

---

## 📚 Documentation

- **Full Details:** `IMPLEMENTATION_SUMMARY.md`
- **Test Plan:** `TEST_PLAN_COURSE_SELECTION.md`
- **Fix Summary:** `COURSE_SELECTION_FIX.md`

---

**Last Updated:** November 16, 2026
**Status:** ✅ Implemented & Tested
