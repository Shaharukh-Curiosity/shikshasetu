const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

// ============================================
// MARK ATTENDANCE - SIMPLEST POSSIBLE
// ============================================
router.post('/mark', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { attendanceRecords, date } = req.body;

    console.log('\n======= MARKING ATTENDANCE =======');
    console.log('Date:', date);
    console.log('Records:', attendanceRecords?.length);

    if (!attendanceRecords || !date) {
      return res.status(400).json({ message: 'Missing data' });
    }

    // Extract just the date part: "YYYY-MM-DD"
    const dateOnly = date.substring(0, 10);
    console.log('Date (YYYY-MM-DD):', dateOnly);

    let success = 0;
    let errors = 0;
    let conflicts = [];

    for (const record of attendanceRecords) {
      try {
        const student = await User.findById(record.studentId);
        if (!student) {
          console.log('❌ Student not found:', record.studentId);
          errors++;
          continue;
        }

        // CHECK FOR CONFLICTS: Has someone else already marked this student?
        const existingRecord = await Attendance.findOne({
          studentId: String(student._id),
          date: dateOnly
        });

        if (existingRecord) {
          // Someone already marked this student on this date
          if (String(existingRecord.markedBy) !== String(req.user._id)) {
            // Different teacher marked it - CONFLICT! DON'T UPDATE
            console.log(`❌ CONFLICT: ${student.name} already marked by ${existingRecord.markedByName}`);
            conflicts.push({
              studentName: student.name,
              markedBy: existingRecord.markedByName,
              status: existingRecord.status
            });
            errors++;
            continue; // SKIP THIS STUDENT - DON'T SAVE
          } else {
            // Same teacher updating their own record - DELETE OLD AND CREATE NEW
            console.log(`🔄 Updating own record for ${student.name}`);
            await Attendance.deleteMany({
              studentId: String(student._id),
              date: dateOnly
            });
          }
        }

        console.log(`\n✓ ${student.name}: ${record.status}`);

        // Create new attendance record
        const attendance = new Attendance({
          studentId: String(student._id),  // Store as STRING
          studentName: student.name,
          schoolName: student.schoolName,
          batchNumber: student.batchNumber,
          date: dateOnly,  // Store as STRING "YYYY-MM-DD"
          status: record.status.toLowerCase(),
          markedBy: String(req.user._id),
          markedByName: req.user.name
        });

        await attendance.save();
        console.log('  Saved! ID:', String(student._id), 'Date:', dateOnly);
        success++;

      } catch (err) {
        console.log('  Error:', err.message);
        
        // Check if it's a duplicate key error (E11000)
        if (err.code === 11000) {
          console.log(`  ⚠️ DUPLICATE ERROR: Student already marked on this date`);
          conflicts.push({
            studentName: record.studentId, // We'll use ID as fallback
            markedBy: 'Unknown (overwrite attempt)',
            status: 'Already marked'
          });
        }
        
        errors++;
      }
    }

    console.log('\n✅ Success:', success, '❌ Errors:', errors, '⚠️ Conflicts:', conflicts.length);
    console.log('==================================\n');

    // Return conflicts in response so frontend can alert user
    const response = {
      message: 'Attendance processed',
      results: { successful: success, errors: errors }
    };

    if (conflicts.length > 0) {
      response.conflicts = conflicts;
      response.warning = `⚠️ ${conflicts.length} student(s) already marked by another teacher`;
    }

    res.json(response);

  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// VIEW ATTENDANCE - SIMPLEST POSSIBLE
// ============================================
router.get('/by-batch', auth, async (req, res) => {
  try {
    const { schoolName, batchNumber, date, markedByRole } = req.query;

    console.log('\n======= VIEWING ATTENDANCE =======');
    console.log('School:', schoolName);
    console.log('Batch:', batchNumber);
    console.log('Date:', date);
    console.log('Filter by role:', markedByRole || 'none');

    if (!schoolName || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    // Extract just the date part: "YYYY-MM-DD"
    const dateOnly = date.substring(0, 10);
    console.log('Date (YYYY-MM-DD):', dateOnly);

    // Get all students in this batch
    const students = await User.find({
      role: 'student',
      schoolName: schoolName,
      batchNumber: batchNumber,
      isActive: true
    }).lean();

    console.log('Found students:', students.length);

    if (students.length === 0) {
      console.log('No students found\n');
      return res.json([]);
    }

    // Get attendance for this school/batch/date
    let attendanceQuery = {
      schoolName: schoolName,
      batchNumber: batchNumber,
      date: dateOnly
    };

    const attendanceRecords = await Attendance.find(attendanceQuery).lean();

    console.log('Found attendance records:', attendanceRecords.length);

    // Create a map of studentId -> attendance
    const attendanceMap = {};
    attendanceRecords.forEach(att => {
      attendanceMap[att.studentId] = att;
      console.log('  ', att.studentId, '→', att.status, '(marked by:', att.markedByName, ')');
    });

    // Combine students with their attendance
    const results = students.map(student => {
      const studentIdStr = String(student._id);
      const attendance = attendanceMap[studentIdStr];

      console.log(`\n${student.name} (${studentIdStr}):`);
      console.log('  Has attendance?', attendance ? 'YES' : 'NO');
      if (attendance) {
        console.log('  Status:', attendance.status);
        console.log('  Marked by:', attendance.markedByName);
      }

      return {
        _id: student._id,
        name: student.name,
        schoolName: student.schoolName,
        batchNumber: student.batchNumber,
        mobile: student.mobile,
        standard: student.standard,
        attendance: attendance ? {
          status: attendance.status,
          markedBy: attendance.markedByName,
          markedAt: attendance.markedAt
        } : null
      };
    });

    const marked = results.filter(r => r.attendance !== null).length;
    const notMarked = results.filter(r => r.attendance === null).length;

    console.log('\n📊 Summary:');
    console.log('Total:', results.length);
    console.log('Marked:', marked);
    console.log('Not Marked:', notMarked);
    console.log('==================================\n');

    res.json(results);

  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ATTENDANCE SUMMARY - Month/Date wise Report
// ============================================
router.get('/summary', auth, async (req, res) => {
  try {
    const { schoolName, batchNumber, startDate, endDate, filterType } = req.query;

    console.log('\n======= ATTENDANCE SUMMARY =======');
    console.log('School:', schoolName);
    console.log('Batch:', batchNumber);
    console.log('Start Date:', startDate);
    console.log('End Date:', endDate);
    console.log('Filter Type:', filterType);

    if (!schoolName || !batchNumber || !startDate || !endDate) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    // Get all students in this batch
    const students = await User.find({
      role: 'student',
      schoolName: schoolName,
      batchNumber: batchNumber,
      isActive: true
    }).lean();

    console.log('Found students:', students.length);

    if (students.length === 0) {
      console.log('No students found\n');
      return res.json([]);
    }

    // Get attendance records for the date range
    const attendanceRecords = await Attendance.find({
      schoolName: schoolName,
      batchNumber: batchNumber,
      date: {
        $gte: startDate,
        $lte: endDate
      }
    }).lean();

    console.log('Found attendance records:', attendanceRecords.length);

    // Get unique dates in the range (to count total classes)
    const uniqueDates = [...new Set(attendanceRecords.map(r => r.date))];
    console.log('Unique class dates:', uniqueDates.length);

    // Build summary for each student
    const summary = students.map(student => {
      const studentIdStr = String(student._id);
      
      // Get records for this student
      const studentRecords = attendanceRecords.filter(r => r.studentId === studentIdStr);
      
      // Count present and absent
      const presentCount = studentRecords.filter(r => r.status === 'present').length;
      const absentCount = studentRecords.filter(r => r.status === 'absent').length;
      const totalMarked = presentCount + absentCount;

      // Get all unique teachers/admins who marked this student
      const markedBySet = new Set(studentRecords.map(r => r.markedByName).filter(Boolean));
      const markedByList = Array.from(markedBySet).join(', ');

      console.log(`\n${student.name} (${studentIdStr}):`);
      console.log('  Marked:', totalMarked);
      console.log('  Present:', presentCount);
      console.log('  Absent:', absentCount);
      console.log('  Marked By:', markedByList || 'Not marked');

      return {
        _id: student._id,
        name: student.name,
        studentId: student._id,
        schoolName: student.schoolName,
        batchNumber: student.batchNumber,
        standard: student.standard,
        mobile: student.mobile,
        totalClasses: uniqueDates.length,        // Total number of classes held
        totalMarked: totalMarked,                // Number of times student was marked
        present: presentCount,
        absent: absentCount,
        markedBy: markedByList,                  // NEW: Teachers/Admins who marked
        percentage: totalMarked > 0 ? ((presentCount / totalMarked) * 100).toFixed(2) : 0
      };
    });

    const totalPresent = summary.reduce((sum, s) => sum + s.present, 0);
    const totalAbsent = summary.reduce((sum, s) => sum + s.absent, 0);

    console.log('\n📊 Overall Summary:');
    console.log('Total Classes:', uniqueDates.length);
    console.log('Total Present (combined):', totalPresent);
    console.log('Total Absent (combined):', totalAbsent);
    console.log('==================================\n');

    res.json({
      summary: summary,
      stats: {
        totalClasses: uniqueDates.length,
        totalStudents: students.length,
        totalPresent: totalPresent,
        totalAbsent: totalAbsent,
        dateRange: {
          start: startDate,
          end: endDate,
          filterType: filterType
        }
      }
    });

  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
