# 👨‍🏫 TEACHER QUICK START GUIDE

## ⚡ Get Started in 3 Steps

### Step 1️⃣: Setup (One Time)
```bash
# In project directory, run:
node setup-teacher.js
```
✅ This creates a test teacher account with:
- Email: `teacher@test.com`
- Password: `teacher123`

### Step 2️⃣: Login
1. Open http://localhost:3000
2. Enter credentials:
   - Email: `teacher@test.com`
   - Password: `teacher123`
3. Click "Login"

### Step 3️⃣: Access Dashboard
- You'll be redirected to the teacher dashboard automatically
- OR manually go to: http://localhost:3000/teacher

---

## 📋 Teacher Dashboard Features

### 🎯 Tab 1: Mark Attendance
**Purpose**: Mark daily attendance for students

**How to use**:
1. Select **School** (e.g., "CMD")
2. Select **Batch** (e.g., "1")
3. Select **Date** (defaults to today)
4. Mark each student as **Present** or **Absent**
5. Click **Submit Attendance**

**What happens**:
- ✅ Attendance is recorded in database
- ⚠️ If another teacher already marked a student, you'll see a warning
- 📊 Summary shows how many were marked

---

### 👁️ Tab 2: View Daily Attendance
**Purpose**: See who was marked present/absent on a specific day

**How to use**:
1. Select **School**
2. Select **Batch**
3. Select **Date** (any past or current date)
4. Click **View**

**You'll see**:
- Student names
- Status badges (PRESENT, ABSENT, NOT MARKED)
- Teacher who marked them (Marked By column)
- Summary showing Present/Absent/Not Marked counts

---

### 📊 Tab 3: View Report
**Purpose**: See attendance summary for students over a period

**How to use**:
1. Select **School**
2. Select **Batch**
3. Choose **Filter Type**:
   - **Date Range**: View from specific start to end date
   - **Month**: View entire month
4. Select dates
5. Click **Generate Report**

**You'll see**:
- Summary Statistics (Total Classes, Total Students, Total Present, Total Absent)
- Detailed table showing per-student attendance:
  - Total classes in period
  - Days marked
  - Days present
  - Days absent
  - Attendance percentage (%)
  - Who marked attendance for this student

---

## 🔍 Troubleshooting

### Problem: Can't login
**Check**:
- Email exactly: `teacher@test.com`
- Password exactly: `teacher123`
- Server running on port 3000

**Solution**:
```bash
node setup-teacher.js  # Re-create account
node server.js         # Restart server
```

---

### Problem: Schools dropdown is empty
**Check**:
- Are you logged in? (Check browser console - should say "Logged in as: Test Teacher")
- Is there browser storage with token? (F12 → Application → Local Storage)

**Solution**:
1. Press F12 to open DevTools
2. Go to Console tab
3. Look for these messages:
   - ✅ "Schools loaded: ['CMD', 'Swastik']" = WORKING
   - ❌ Red error = Something's wrong (read error message)
   - "NO TOKEN FOUND" = Need to login first

---

### Problem: Batches don't show after selecting school
**Check**:
- School is selected
- Console shows: "✅ Batches loaded: [list]"

**Solution**:
- Verify school has students with batches assigned
- Check MongoDB if students exist in that school

---

### Problem: Students list is empty
**Check**:
- Both school AND batch are selected
- Console shows: "✅ Students loaded: XX"

**Solution**:
- Verify students exist in that school/batch
- Check if students are marked as `isActive: true`

---

### Problem: Attendance won't submit
**Check**:
- At least one student is marked (Present or Absent)
- School, batch, and date are selected
- Console shows: "✅ Records to submit: XX"

**Solution**:
- Mark at least one student
- Check Network tab in DevTools for API errors
- Server must be running and MongoDB connected

---

## 🛠️ Advanced Debugging

### View Full Console Logs
1. Press F12 to open DevTools
2. Click "Console" tab
3. Look for messages with emoji prefixes:
   - 📚 = Loading data
   - ✅ = Success
   - ❌ = Error
   - ⚠️ = Warning
   - 👥 = Student operations
   - 📤 = Submitting data
   - 👀 = Viewing data

### Check Network Requests
1. Press F12 → Network tab
2. Do an action (select school, mark attendance, etc.)
3. Look for requests to:
   - `/api/students/schools` (should return: ["CMD", "Swastik"])
   - `/api/students/batches/CMD` (should return list of batches)
   - `/api/students?schoolName=CMD&batchNumber=1` (should return students)
   - `/api/attendance/mark` (POST request when submitting)

### Check LocalStorage
1. Press F12 → Application tab
2. Click "Local Storage" in left sidebar
3. Look for:
   - `token` key = JWT token for authentication
   - `user` key = User data (name, email, role)

---

## ⚙️ Behind the Scenes

### How It Works
```
You click login.html
        ↓
Enter email & password
        ↓
Send to /api/auth/login
        ↓
Server checks password & creates JWT token
        ↓
Token & user data stored in browser localStorage
        ↓
Redirected to /teacher dashboard
        ↓
Page checks for token in localStorage
        ↓
Uses token to fetch schools from /api/students/schools
        ↓
Teacher dashboard loads with data populated
```

### API Endpoints Used
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login and get token |
| `/api/students/schools` | GET | List all schools |
| `/api/students/batches/:schoolName` | GET | List batches in school |
| `/api/students` | GET | List students with filters |
| `/api/attendance/mark` | POST | Submit attendance marks |
| `/api/attendance/by-batch` | GET | Get attendance for a date |
| `/api/attendance/summary` | GET | Get attendance report |

---

## 📱 Browser Requirements

- Chrome/Firefox/Safari (modern browser)
- JavaScript enabled
- LocalStorage enabled
- Cookies enabled (if required)

---

## 🔐 Security Notes

- Token expires after 7 days - need to login again
- Token is stored in browser localStorage
- Always logout when done (click Logout button)
- Don't share your credentials
- Clear localStorage after logging out (optional)

---

## 💡 Tips & Tricks

### Keyboard Shortcuts
- Press **F12** to open DevTools anytime
- Press **Ctrl+Shift+K** to open just the Console
- Click on any student name to copy it (if you need it)

### Batch Operations
- Mark multiple students at once before submitting
- Use date range in report to see trends over time
- Export reports by clicking the Print button (Ctrl+P)

### Common Tasks
- **Mark today's attendance**: Go to Mark tab, select school/batch, click Submit
- **Review yesterday's attendance**: Go to View Daily, change date to yesterday
- **Check attendance trend**: Go to View Report, select date range, check percentages

---

## ❓ FAQ

**Q: Why is the schools dropdown empty when I first load the page?**
A: You need to be logged in. The page checks for a login token. If you see "NO TOKEN FOUND", go back to login at http://localhost:3000

**Q: Can I mark attendance for past dates?**
A: Yes! Select any date and mark attendance. This is useful if you forgot to mark on a specific day.

**Q: What if I accidentally mark a student wrong?**
A: You can mark them again - the latest marking will override the previous one.

**Q: How do I know attendance was submitted successfully?**
A: You'll see an alert with "✅ Attendance Processing Complete" and a summary of how many students were marked.

**Q: Can I see which teacher marked each student?**
A: Yes! In the View Daily and View Report tabs, there's a "Marked By" column showing the teacher's name.

**Q: What if two teachers mark the same student on the same day?**
A: The system will show a warning and NOT update that student (to prevent data loss). First teacher's marking wins.

---

## 📞 Need Help?

### Debug Steps
1. Open F12 (DevTools)
2. Go to Console tab
3. Do the action that's failing
4. Look for red ❌ messages with error details
5. Read the error message carefully
6. Check this guide for matching problem

### Still Stuck?
- Check TEACHER_LOGIN_FIX.md for detailed technical info
- Run `node setup-teacher.js` to reset account
- Restart server with `node server.js`
- Clear browser cache and reload (Ctrl+Shift+Delete)

---

**Last Updated**: January 28, 2026  
**Version**: 1.0
