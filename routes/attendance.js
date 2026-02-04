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
    const conflicts = [];

    const studentIds = attendanceRecords.map(r => String(r.studentId));
    const students = await User.find({ _id: { $in: studentIds } }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const existingRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: dateOnly
    }).lean();
    const existingMap = new Map(existingRecords.map(r => [String(r.studentId), r]));

    const bulkOps = [];
    const now = new Date();

    for (const record of attendanceRecords) {
      const studentId = String(record.studentId);
      const student = studentMap.get(studentId);
      if (!student) {
        console.log('❌ Student not found:', studentId);
        errors++;
        continue;
      }

      const existingRecord = existingMap.get(studentId);
      if (existingRecord && String(existingRecord.markedBy) !== String(req.user._id)) {
        console.log(`❌ CONFLICT: ${student.name} already marked by ${existingRecord.markedByName}`);
        conflicts.push({
          studentName: student.name,
          markedBy: existingRecord.markedByName,
          status: existingRecord.status
        });
        errors++;
        continue;
      }

      const doc = {
        studentId: studentId,
        studentName: student.name,
        region: student.region,
        schoolName: student.schoolName,
        batchNumber: student.batchNumber,
        date: dateOnly,
        status: record.status.toLowerCase(),
        markedBy: String(req.user._id),
        markedByName: req.user.name,
        markedAt: now
      };

      if (existingRecord) {
        bulkOps.push({
          updateOne: {
            filter: { studentId: studentId, date: dateOnly },
            update: { $set: doc },
            upsert: true
          }
        });
      } else {
        bulkOps.push({ insertOne: { document: doc } });
      }
    }

    if (bulkOps.length > 0) {
      try {
        await Attendance.bulkWrite(bulkOps, { ordered: false });
        success += bulkOps.length;
      } catch (err) {
        console.log('  Error:', err.message);
        if (err.code === 11000) {
          console.log(`  ⚠️ DUPLICATE ERROR: Student already marked on this date`);
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
    const { region, batchNumber, date, markedByRole } = req.query;

    console.log('\n======= VIEWING ATTENDANCE =======');
    console.log('Region:', region);
    console.log('Batch:', batchNumber);
    console.log('Date:', date);
    console.log('Filter by role:', markedByRole || 'none');

    if (!region || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    // Extract just the date part: "YYYY-MM-DD"
    const dateOnly = date.substring(0, 10);
    console.log('Date (YYYY-MM-DD):', dateOnly);

    // Get all students in this batch/region
    const studentsQuery = {
      role: 'student',
      region: region,
      isActive: true
    };
    if (batchNumber && batchNumber !== 'all') {
      studentsQuery.batchNumber = batchNumber;
    }
    const students = await User.find(studentsQuery).lean();

    console.log('Found students:', students.length);

    if (students.length === 0) {
      console.log('No students found\n');
      return res.json([]);
    }

    // Get attendance for this region/batch/date
    let attendanceQuery = {
      region: region,
      date: dateOnly
    };
    if (batchNumber && batchNumber !== 'all') {
      attendanceQuery.batchNumber = batchNumber;
    }

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
    const { region, batchNumber, startDate, endDate, filterType } = req.query;

    console.log('\n======= ATTENDANCE SUMMARY =======');
    console.log('Region:', region);
    console.log('Batch:', batchNumber);
    console.log('Start Date:', startDate);
    console.log('End Date:', endDate);
    console.log('Filter Type:', filterType);

    if (!region || !batchNumber || !startDate || !endDate) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    // Get all students in this batch/region
    const students = await User.find({
      role: 'student',
      region: region,
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
      region: region,
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

// ============================================
// LOW ATTENDANCE - Absent 3+ classes (any days)
// ============================================
router.get('/low-attendance', auth, async (req, res) => {
  try {
    const { region, batchNumber, minAbsent, days } = req.query;

    if (!region) {
      return res.status(400).json({ message: 'Missing region' });
    }

    const threshold = Math.max(parseInt(minAbsent, 10) || 3, 1);
    const daysInt = Math.max(parseInt(days, 10) || 30, 1);
    const endDate = new Date();
    const startDateObj = new Date(endDate);
    startDateObj.setDate(endDate.getDate() - (daysInt - 1));
    const startDate = startDateObj.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const match = {
      region: region,
      status: 'absent',
      date: { $gte: startDate, $lte: endDateStr }
    };
    if (batchNumber && batchNumber !== 'all') {
      match.batchNumber = batchNumber;
    }

    const results = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$studentId',
          dates: { $addToSet: '$date' },
          absentCount: { $sum: 1 }
        }
      },
      { $addFields: { uniqueDatesCount: { $size: '$dates' } } },
      { $match: { absentCount: { $gte: threshold } } },
      { $addFields: { studentObjectId: { $toObjectId: '$_id' } } },
      {
        $lookup: {
          from: 'users',
          localField: 'studentObjectId',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' },
      {
        $match: {
          'student.role': 'student',
          'student.isActive': true
        }
      },
      {
        $project: {
          _id: 0,
          studentId: '$_id',
          name: '$student.name',
          schoolName: '$student.schoolName',
          batchNumber: '$student.batchNumber',
          mobile: '$student.mobile',
          standard: '$student.standard',
          region: '$student.region',
          absentDates: '$dates'
        }
      },
      { $sort: { name: 1 } }
    ]);

    res.json({
      threshold,
      days: daysInt,
      dateRange: { start: startDate, end: endDateStr },
      results
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
