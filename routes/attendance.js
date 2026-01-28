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

module.exports = router;
