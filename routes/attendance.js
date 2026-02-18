const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const PlannedAbsence = require('../models/PlannedAbsence');
const ContactLog = require('../models/ContactLog');
const User = require('../models/User');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'leave']);
const PRESENT_STATUSES = new Set(['present', 'late', 'leave']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function isValidDateOnly(value) {
  return DATE_REGEX.test(value);
}

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

      const statusRaw = String(record.status || '').toLowerCase();
      if (!VALID_STATUSES.has(statusRaw)) {
        console.log('❌ Invalid status:', statusRaw, 'for', student.name);
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
        status: statusRaw,
        note: record.note ? String(record.note).trim().slice(0, 200) : '',
        markedBy: String(req.user._id),
        markedByName: req.user.name,
        markedAt: now
      };

      if (existingRecord) {
        bulkOps.push({
          updateOne: {
            filter: { studentId: studentId, date: dateOnly },
            update: {
              $set: doc,
              $push: {
                history: {
                  status: existingRecord.status,
                  note: existingRecord.note || '',
                  markedBy: existingRecord.markedBy,
                  markedByName: existingRecord.markedByName,
                  markedAt: existingRecord.markedAt
                }
              }
            },
            upsert: true
          }
        });
      } else {
        bulkOps.push({ insertOne: { document: { ...doc, history: [] } } });
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

    await logAudit({
      req,
      action: 'attendance_mark',
      entity: 'attendance',
      meta: {
        date: dateOnly,
        total: attendanceRecords.length,
        successful: success,
        errors: errors,
        conflicts: conflicts.length
      }
    });

    res.json(response);

  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// PLANNED ABSENCE - CREATE
// ============================================
router.post('/planned-absences', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const studentId = String(req.body?.studentId || '');
    const fromDate = normalizeDateOnly(req.body?.fromDate);
    const toDate = normalizeDateOnly(req.body?.toDate);
    const reason = String(req.body?.reason || '').trim();

    if (!studentId || !fromDate || !toDate || !reason) {
      return res.status(400).json({ message: 'studentId, fromDate, toDate and reason are required' });
    }
    if (!isValidDateOnly(fromDate) || !isValidDateOnly(toDate)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }
    if (fromDate > toDate) {
      return res.status(400).json({ message: 'fromDate cannot be after toDate' });
    }
    if (reason.length > 200) {
      return res.status(400).json({ message: 'Reason is too long (max 200 characters)' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const overlapping = await PlannedAbsence.findOne({
      studentId,
      status: 'active',
      fromDate: { $lte: toDate },
      toDate: { $gte: fromDate }
    }).lean();

    if (overlapping) {
      const mergedFromDate = overlapping.fromDate < fromDate ? overlapping.fromDate : fromDate;
      const mergedToDate = overlapping.toDate > toDate ? overlapping.toDate : toDate;

      const planned = await PlannedAbsence.findByIdAndUpdate(
        overlapping._id,
        {
          $set: {
            fromDate: mergedFromDate,
            toDate: mergedToDate,
            reason
          }
        },
        { new: true }
      ).lean();

      const attendanceReasonUpdate = await Attendance.updateMany(
        {
          studentId,
          status: 'absent',
          date: { $gte: fromDate, $lte: toDate },
          $or: [{ note: { $exists: false } }, { note: '' }]
        },
        { $set: { note: reason } }
      );

      await logAudit({
        req,
        action: 'planned_absence_reason_update',
        entity: 'planned_absence',
        entityId: String(planned?._id || overlapping._id),
        meta: {
          studentId,
          requestedFromDate: fromDate,
          requestedToDate: toDate,
          mergedFromDate,
          mergedToDate,
          reason,
          attendanceNotesUpdated: attendanceReasonUpdate.modifiedCount || 0
        }
      });

      return res.json({
        message: 'Reason saved on existing planned absence',
        plannedAbsence: planned,
        attendanceNotesUpdated: attendanceReasonUpdate.modifiedCount || 0
      });
    }

    const planned = await PlannedAbsence.create({
      studentId,
      studentName: student.name,
      region: student.region || '',
      schoolName: student.schoolName || '',
      batchNumber: student.batchNumber || '',
      fromDate,
      toDate,
      reason,
      createdBy: String(req.user._id),
      createdByName: req.user.name || ''
    });

    const attendanceReasonUpdate = await Attendance.updateMany(
      {
        studentId,
        status: 'absent',
        date: { $gte: fromDate, $lte: toDate },
        $or: [{ note: { $exists: false } }, { note: '' }]
      },
      { $set: { note: reason } }
    );

    await logAudit({
      req,
      action: 'planned_absence_create',
      entity: 'planned_absence',
      entityId: String(planned._id),
      meta: {
        studentId,
        fromDate,
        toDate,
        reason,
        attendanceNotesUpdated: attendanceReasonUpdate.modifiedCount || 0
      }
    });

    return res.json({
      message: 'Planned absence created',
      plannedAbsence: planned,
      attendanceNotesUpdated: attendanceReasonUpdate.modifiedCount || 0
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// PLANNED ABSENCE - LIST
// ============================================
router.get('/planned-absences', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, studentId, date, startDate, endDate } = req.query;
    const query = { status: 'active' };

    if (studentId) query.studentId = String(studentId);
    if (region) query.region = String(region);
    if (batchNumber && batchNumber !== 'all') query.batchNumber = String(batchNumber);

    if (date) {
      const dateOnly = normalizeDateOnly(date);
      if (!isValidDateOnly(dateOnly)) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
      }
      query.fromDate = { $lte: dateOnly };
      query.toDate = { $gte: dateOnly };
    } else if (startDate || endDate) {
      const rangeStart = normalizeDateOnly(startDate);
      const rangeEnd = normalizeDateOnly(endDate);
      if (!rangeStart || !rangeEnd || !isValidDateOnly(rangeStart) || !isValidDateOnly(rangeEnd)) {
        return res.status(400).json({ message: 'Invalid date range format. Use startDate/endDate as YYYY-MM-DD' });
      }
      if (rangeStart > rangeEnd) {
        return res.status(400).json({ message: 'startDate cannot be after endDate' });
      }
      query.fromDate = { $lte: rangeEnd };
      query.toDate = { $gte: rangeStart };
    }

    const rows = await PlannedAbsence.find(query).sort({ fromDate: 1, studentName: 1 }).lean();
    return res.json(rows);
  } catch (error) {
    console.error('FATAL ERROR:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// PLANNED ABSENCE - CANCEL
// ============================================
router.patch('/planned-absences/:id/cancel', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await PlannedAbsence.findOneAndUpdate(
      { _id: id, status: 'active' },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: String(req.user._id),
          cancelledAt: new Date()
        }
      },
      { new: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ message: 'Planned absence not found or already cancelled' });
    }

    await logAudit({
      req,
      action: 'planned_absence_cancel',
      entity: 'planned_absence',
      entityId: String(doc._id),
      meta: {
        studentId: doc.studentId,
        fromDate: doc.fromDate,
        toDate: doc.toDate
      }
    });

    return res.json({ message: 'Planned absence cancelled', plannedAbsence: doc });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// VIEW ATTENDANCE - SIMPLEST POSSIBLE
// ============================================
router.get('/by-batch', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, markedByRole, status } = req.query;

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

    // Compute previous day (YYYY-MM-DD)
    const prevDateObj = new Date(dateOnly);
    prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = prevDateObj.toISOString().split('T')[0];

    const prev2DateObj = new Date(dateOnly);
    prev2DateObj.setDate(prev2DateObj.getDate() - 2);
    const prev2Date = prev2DateObj.toISOString().split('T')[0];

    // Get all students in this batch/region
    const studentsQuery = {
      role: 'student',
      region: region
    };
    if (batchNumber && batchNumber !== 'all') {
      studentsQuery.batchNumber = batchNumber;
    }
    const normalizedStatus = String(status || 'all').toLowerCase();
    if (normalizedStatus === 'active') studentsQuery.isActive = true;
    if (normalizedStatus === 'inactive') studentsQuery.isActive = false;
    const students = await User.find(studentsQuery).lean();

    console.log('Found students:', students.length);

    if (students.length === 0) {
      console.log('No students found\n');
      return res.json([]);
    }

    const studentIds = students.map(s => String(s._id));

    // Fetch attendance by enrolled student IDs so batch data stays correct even if batch/status changed later
    const attendanceRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: dateOnly
    }).lean();
    const plannedAbsences = await PlannedAbsence.find({
      studentId: { $in: studentIds },
      status: 'active',
      fromDate: { $lte: dateOnly },
      toDate: { $gte: dateOnly }
    }).lean();
    const plannedMap = new Map(plannedAbsences.map(r => [String(r.studentId), r]));

    console.log('Found attendance records:', attendanceRecords.length);

    // Get previous 1-2 days attendance for these students
    const prevAttendanceRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: prevDate
    }).lean();
    const prevMap = new Map(prevAttendanceRecords.map(r => [String(r.studentId), r]));
    const prev2AttendanceRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: prev2Date
    }).lean();
    const prev2Map = new Map(prev2AttendanceRecords.map(r => [String(r.studentId), r]));

    // Create a map of studentId -> attendance
    const attendanceMap = {};
    attendanceRecords.forEach(att => {
      attendanceMap[att.studentId] = att;
      console.log('  ', att.studentId, '→', att.status, '(marked by:', att.markedByName, ')');
    });

    // Recent history (last 7 days)
    const recentStartObj = new Date(dateOnly);
    recentStartObj.setDate(recentStartObj.getDate() - 7);
    const recentStart = recentStartObj.toISOString().split('T')[0];
    const recentRecords = await Attendance.find({
      studentId: { $in: studentIds },
      date: { $gte: recentStart, $lte: dateOnly }
    }).sort({ date: -1 }).lean();
    const recentMap = new Map();
    recentRecords.forEach(r => {
      const key = String(r.studentId);
      const list = recentMap.get(key) || [];
      if (list.length < 5) {
        list.push({
          date: r.date,
          status: r.status,
          note: r.note || '',
          markedByName: r.markedByName,
          markedAt: r.markedAt
        });
        recentMap.set(key, list);
      }
    });

    // Combine students with their attendance
    const results = students.map(student => {
      const studentIdStr = String(student._id);
      const attendance = attendanceMap[studentIdStr];
      const planned = plannedMap.get(studentIdStr);

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
        previousDay: prevMap.get(studentIdStr)
          ? { status: prevMap.get(studentIdStr).status, date: prevDate }
          : null,
        previousTwoDays: prev2Map.get(studentIdStr)
          ? { status: prev2Map.get(studentIdStr).status, date: prev2Date }
          : null,
        recent: recentMap.get(studentIdStr) || [],
        plannedAbsence: planned ? {
          id: planned._id,
          fromDate: planned.fromDate,
          toDate: planned.toDate,
          reason: planned.reason,
          createdByName: planned.createdByName
        } : null,
        attendance: attendance ? {
          status: attendance.status,
          note: attendance.note || '',
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
router.get('/summary', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, startDate, endDate, filterType, status } = req.query;

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
    const studentsQuery = {
      role: 'student',
      region: region,
      batchNumber: batchNumber
    };
    const normalizedStatus = String(status || 'all').toLowerCase();
    if (normalizedStatus === 'active') studentsQuery.isActive = true;
    if (normalizedStatus === 'inactive') studentsQuery.isActive = false;

    const students = await User.find(studentsQuery).lean();

    console.log('Found students:', students.length);

    if (students.length === 0) {
      console.log('No students found\n');
      return res.json([]);
    }

    // Get attendance records for the date range
    const studentIds = students.map(s => String(s._id));
    const attendanceRecords = await Attendance.find({
      studentId: { $in: studentIds },
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
      const presentCount = studentRecords.filter(r => PRESENT_STATUSES.has(r.status)).length;
      const lateCount = studentRecords.filter(r => r.status === 'late').length;
      const leaveCount = studentRecords.filter(r => r.status === 'leave').length;
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
        enrollmentDate: student.createdAt,
        totalClasses: uniqueDates.length,        // Total number of classes held
        totalMarked: totalMarked,                // Number of times student was marked
        present: presentCount,
        late: lateCount,
        leave: leaveCount,
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
router.get('/low-attendance', auth, isTeacherOrAdmin, async (req, res) => {
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

// ============================================
// CONTACT LOG - Save teacher outreach
// ============================================
router.post('/contact-log', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { studentId, phone, source } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: 'Missing studentId' });
    }

    const student = await User.findOne({ _id: studentId, role: 'student' }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const log = await ContactLog.create({
      studentId: String(student._id),
      studentName: student.name,
      studentMobile: student.mobile || '',
      teacherId: String(req.user._id),
      teacherName: req.user.name,
      region: student.region || '',
      schoolName: student.schoolName || '',
      batchNumber: student.batchNumber || '',
      standard: student.standard || '',
      phoneDialed: phone ? String(phone) : '',
      source: source ? String(source).slice(0, 50) : 'unknown'
    });

    await logAudit({
      req,
      action: 'student_contact',
      entity: 'contact_log',
      entityId: String(log._id),
      meta: {
        studentId: String(student._id),
        teacherId: String(req.user._id),
        source: log.source
      }
    });

    res.json({ message: 'Contact logged', id: String(log._id) });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// CONTACT LOG - List teacher outreach
// ============================================
router.get('/contact-log', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, days } = req.query;

    if (!region) {
      return res.status(400).json({ message: 'Missing region' });
    }

    const daysInt = Math.max(parseInt(days, 10) || 30, 1);
    const endDate = new Date();
    const startDateObj = new Date(endDate);
    startDateObj.setDate(endDate.getDate() - (daysInt - 1));

    const query = {
      region: region,
      createdAt: { $gte: startDateObj, $lte: endDate }
    };
    if (batchNumber && batchNumber !== 'all') {
      query.batchNumber = batchNumber;
    }

    const results = await ContactLog.find(query).sort({ createdAt: -1 }).lean();

    res.json({
      days: daysInt,
      dateRange: {
        start: startDateObj.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      results
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// ENGAGEMENT - Top Attendance + Most Improved
// ============================================
router.get('/engagement', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, days } = req.query;
    if (!region) {
      return res.status(400).json({ message: 'Missing region' });
    }

    const daysInt = Math.max(parseInt(days, 10) || 30, 7);
    const endDateObj = new Date();
    const endDate = endDateObj.toISOString().split('T')[0];
    const startRecentObj = new Date(endDateObj.getTime() - (daysInt - 1) * MS_PER_DAY);
    const startRecent = startRecentObj.toISOString().split('T')[0];
    const endPrevObj = new Date(startRecentObj.getTime() - MS_PER_DAY);
    const startPrevObj = new Date(endPrevObj.getTime() - (daysInt - 1) * MS_PER_DAY);
    const startPrev = startPrevObj.toISOString().split('T')[0];
    const endPrev = endPrevObj.toISOString().split('T')[0];

    const studentsQuery = { role: 'student', region, isActive: true };
    if (batchNumber && batchNumber !== 'all') {
      studentsQuery.batchNumber = batchNumber;
    }
    const students = await User.find(studentsQuery).lean();
    if (!students.length) {
      return res.json({ topAttendance: [], mostImproved: [], dateRange: { recent: { start: startRecent, end: endDate }, previous: { start: startPrev, end: endPrev } } });
    }
    const studentIds = students.map(s => String(s._id));

    const buildStats = async (start, end) => {
      const match = {
        studentId: { $in: studentIds },
        date: { $gte: start, $lte: end }
      };
      if (batchNumber && batchNumber !== 'all') {
        match.batchNumber = batchNumber;
      }
      const rows = await Attendance.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$studentId',
            total: { $sum: 1 },
            present: {
              $sum: {
                $cond: [{ $in: ['$status', Array.from(PRESENT_STATUSES)] }, 1, 0]
              }
            }
          }
        }
      ]);
      const map = new Map(rows.map(r => [String(r._id), r]));
      return map;
    };

    const recentMap = await buildStats(startRecent, endDate);
    const prevMap = await buildStats(startPrev, endPrev);

    const enriched = students.map(s => {
      const recent = recentMap.get(String(s._id)) || { total: 0, present: 0 };
      const prev = prevMap.get(String(s._id)) || { total: 0, present: 0 };
      const recentRate = recent.total > 0 ? recent.present / recent.total : 0;
      const prevRate = prev.total > 0 ? prev.present / prev.total : 0;
      const improvement = recentRate - prevRate;
      return {
        studentId: s._id,
        name: s.name,
        batchNumber: s.batchNumber,
        recent: { total: recent.total, present: recent.present, rate: Number((recentRate * 100).toFixed(2)) },
        previous: { total: prev.total, present: prev.present, rate: Number((prevRate * 100).toFixed(2)) },
        improvement: Number((improvement * 100).toFixed(2))
      };
    });

    const topAttendance = enriched
      .filter(r => r.recent.total > 0)
      .sort((a, b) => b.recent.rate - a.recent.rate)
      .slice(0, 10);

    const mostImproved = enriched
      .filter(r => r.recent.total > 0 && r.previous.total > 0)
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10);

    res.json({
      topAttendance,
      mostImproved,
      dateRange: {
        recent: { start: startRecent, end: endDate, days: daysInt },
        previous: { start: startPrev, end: endPrev, days: daysInt }
      }
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// UNDO ATTENDANCE (by teacher for date/batch)
// ============================================
router.post('/undo', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, studentIds } = req.body;
    if (!region || !date) {
      return res.status(400).json({ message: 'Missing region/date' });
    }
    const dateOnly = date.substring(0, 10);
    const query = {
      region,
      date: dateOnly,
      markedBy: String(req.user._id)
    };
    if (batchNumber && batchNumber !== 'all') {
      query.batchNumber = batchNumber;
    }
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      query.studentId = { $in: studentIds.map(String) };
    }

    const result = await Attendance.deleteMany(query);

    await logAudit({
      req,
      action: 'attendance_undo',
      entity: 'attendance',
      meta: {
        region,
        batchNumber: batchNumber || 'all',
        date: dateOnly,
        deleted: result.deletedCount
      }
    });

    res.json({ message: 'Undo complete', deleted: result.deletedCount });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
