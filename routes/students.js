const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { Parser } = require('json2csv');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const { auth, isAdmin, isTeacherOrAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const PRESENT_STATUSES = ['present', 'late', 'leave'];
const ATTENDANCE_ACTIVE_THRESHOLD = 50;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function mapRowToStudent(row) {
  const mapped = {};
  Object.keys(row || {}).forEach(key => {
    const norm = normalizeHeader(key);
    const value = typeof row[key] === 'string' ? row[key].trim() : row[key];
    if (value === undefined || value === null || value === '') return;

    if (['name', 'studentname', 'studentsname'].includes(norm)) mapped.name = value;
    if (['region', 'location'].includes(norm)) mapped.region = value;
    if (['schoolname', 'school'].includes(norm)) mapped.schoolName = value;
    if (['standard', 'class', 'grade'].includes(norm)) mapped.standard = value;
    if (['batchnumber', 'batch', 'batchno'].includes(norm)) mapped.batchNumber = value;
    if (['mobile', 'phone', 'phonenumber'].includes(norm)) mapped.mobile = value;
    if (['age'].includes(norm)) mapped.age = Number(value);
  });
  return mapped;
}

async function findDuplicateStudent({ name, schoolName, batchNumber, mobile }, excludeId) {
  const or = [];
  if (mobile) or.push({ mobile, role: 'student' });
  if (name && schoolName && batchNumber) {
    or.push({ name, schoolName, batchNumber, role: 'student' });
  }
  if (or.length === 0) return null;

  const query = { $or: or };
  if (excludeId) query._id = { $ne: excludeId };
  return User.findOne(query);
}

async function buildAttendanceStatsMap(studentIds) {
  if (!studentIds || studentIds.length === 0) {
    return new Map();
  }

  const rows = await Attendance.aggregate([
    { $match: { studentId: { $in: studentIds } } },
    {
      $group: {
        _id: '$studentId',
        totalMarked: { $sum: 1 },
        presentCount: {
          $sum: {
            $cond: [{ $in: ['$status', PRESENT_STATUSES] }, 1, 0]
          }
        },
        absentCount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'absent'] }, 1, 0]
          }
        }
      }
    }
  ]);

  const map = new Map();
  rows.forEach(r => {
    const totalMarked = Number(r.totalMarked || 0);
    const presentCount = Number(r.presentCount || 0);
    const absentCount = Number(r.absentCount || 0);
    const attendancePercentage = totalMarked > 0 ? (presentCount / totalMarked) * 100 : 0;

    map.set(String(r._id), {
      totalMarked,
      presentCount,
      absentCount,
      attendancePercentage
    });
  });

  return map;
}

function isAttendanceActive(stats) {
  return Number(stats?.attendancePercentage || 0) >= ATTENDANCE_ACTIVE_THRESHOLD;
}

// ⚠️ SPECIFIC ROUTES FIRST (before parameterized routes)
// Get all regions
router.get('/regions/all', auth, async (req, res) => {
  try {
    const regions = await User.distinct('region', { role: 'student', isActive: true });
    res.json(regions.filter(r => r));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get schools
router.get('/schools', auth, async (req, res) => {
  try {
    const schools = await User.distinct('schoolName', { role: 'student', isActive: true });
    res.json(schools.filter(s => s));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get schools by region
router.get('/schools/:region', auth, async (req, res) => {
  try {
    const schools = await User.distinct('schoolName', {
      role: 'student',
      region: req.params.region,
      isActive: true
    });
    res.json(schools.filter(s => s));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get stats
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('_id').lean();
    const total = students.length;
    const ids = students.map(s => String(s._id));
    const statsMap = await buildAttendanceStatsMap(ids);

    const active = students.filter(s => isAttendanceActive(statsMap.get(String(s._id)))).length;

    res.json({ total, active, inactive: total - active });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get inactive student names (limited)
router.get('/inactive-names', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const region = req.query.region;
    const query = { role: 'student' };
    if (region) query.region = region;

    const students = await User.find(query)
      .select('name region batchNumber mobile')
      .sort({ name: 1 })
      .lean();

    const ids = students.map(s => String(s._id));
    const statsMap = await buildAttendanceStatsMap(ids);
    const inactiveStudents = students.filter(s => !isAttendanceActive(statsMap.get(String(s._id))));
    const total = inactiveStudents.length;

    res.json({ total, students: inactiveStudents.slice(0, limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get inactive student details with attendance summary
router.get('/inactive-details', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const region = req.query.region;
    const query = { role: 'student' };
    if (region) query.region = region;

    const students = await User.find(query)
      .select('name region batchNumber mobile')
      .sort({ name: 1 })
      .lean();

    if (!students.length) {
      return res.json({ students: [] });
    }

    const ids = students.map(s => String(s._id));
    const statsMap = await buildAttendanceStatsMap(ids);

    const result = students.filter(s => !isAttendanceActive(statsMap.get(String(s._id)))).map(s => {
      const stats = statsMap.get(String(s._id)) || {};
      return {
        studentId: s._id,
        name: s.name,
        batchNumber: s.batchNumber,
        mobile: s.mobile,
        totalClasses: stats.totalMarked || 0,
        absentCount: stats.absentCount || 0,
        attendancePercentage: Number(stats.attendancePercentage || 0).toFixed(2)
      };
    }).slice(0, limit);

    res.json({ students: result });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Auto-inactivate students with too many absences
router.post('/auto-inactivate-absent', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const threshold = Math.max(1, Number(req.body?.threshold || 5));

    const absences = await Attendance.aggregate([
      { $match: { status: 'absent' } },
      { $group: { _id: '$studentId', count: { $sum: 1 } } },
      { $match: { count: { $gt: threshold } } }
    ]);

    const studentIds = absences.map(a => a._id).filter(Boolean);
    if (studentIds.length === 0) {
      return res.json({ threshold, totalAbsentStudents: 0, updated: 0 });
    }

    const result = await User.updateMany(
      { _id: { $in: studentIds }, role: 'student', isActive: true },
      { $set: { isActive: false } }
    );

    res.json({
      threshold,
      totalAbsentStudents: studentIds.length,
      updated: result.modifiedCount || result.nModified || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Auto-inactivate failed', details: error.message });
  }
});

// Get batches for a region (parameterized route)
router.get('/batches/:region', auth, async (req, res) => {
  try {
    const batches = await User.distinct('batchNumber', {
      role: 'student',
      region: req.params.region,
      isActive: true
    });
    res.json(batches.filter(b => b));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Student profile (attendance + marks)
router.get('/profile/:id', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await User.findOne({ _id: id, role: 'student' }).lean();
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const attendanceRecords = await Attendance.find({ studentId: String(id) })
      .sort({ date: -1 })
      .limit(60)
      .lean();

    const marksRecords = await Marks.find({ studentId: String(id) })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    const presentCount = attendanceRecords.filter(r => ['present', 'late', 'leave'].includes(r.status)).length;
    const absentCount = attendanceRecords.filter(r => r.status === 'absent').length;

    res.json({
      student: {
        _id: student._id,
        name: student.name,
        region: student.region,
        schoolName: student.schoolName,
        batchNumber: student.batchNumber,
        standard: student.standard,
        mobile: student.mobile,
        age: student.age,
        isActive: student.isActive
      },
      attendance: {
        presentCount,
        absentCount,
        totalMarked: presentCount + absentCount,
        records: attendanceRecords
      },
      marks: marksRecords
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load profile', details: error.message });
  }
});

// Export students (CSV or JSON)
router.get('/export', auth, isAdmin, async (req, res) => {
  try {
    const { format = 'csv', region, schoolName, batchNumber } = req.query;
    const query = { role: 'student' };
    if (region) query.region = region;
    if (schoolName) query.schoolName = schoolName;
    if (batchNumber) query.batchNumber = batchNumber;

    const students = await User.find(query).select('-password').lean();

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="students.json"');
      return res.send(JSON.stringify(students, null, 2));
    }

    const fields = [
      '_id',
      'name',
      'region',
      'schoolName',
      'standard',
      'batchNumber',
      'mobile',
      'age',
      'isActive'
    ];
    const parser = new Parser({ fields });
    const csv = parser.parse(students);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    return res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Export failed', details: error.message });
  }
});

// Import students from CSV
router.post('/import', auth, isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'CSV file is required' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

    const created = [];
    const skipped = [];
    for (const raw of records) {
      const data = mapRowToStudent(raw);
      if (!data.name || !data.schoolName || !data.batchNumber || !data.region) {
        skipped.push({ reason: 'Missing required fields', row: raw });
        continue;
      }

      if (data.mobile && !/^[0-9+ -]{7,15}$/.test(String(data.mobile))) {
        skipped.push({ reason: 'Invalid mobile format', row: raw });
        continue;
      }

      const dup = await findDuplicateStudent(data);
      if (dup) {
        skipped.push({ reason: 'Duplicate student', row: raw });
        continue;
      }

      const student = new User({
        ...data,
        role: 'student',
        isActive: true
      });
      await student.save();
      created.push(student);
    }

    await logAudit({
      req,
      action: 'student_import',
      entity: 'student',
      meta: { created: created.length, skipped: skipped.length }
    });

    res.json({
      message: 'Import completed',
      created: created.length,
      skipped: skipped.length,
      skippedDetails: skipped.slice(0, 50)
    });
  } catch (error) {
    res.status(500).json({ message: 'Import failed', details: error.message });
  }
});

// Bulk update by region + batch (safe fields only)
router.post('/bulk-update', auth, isAdmin, async (req, res) => {
  try {
    const { region, batchNumber, updates } = req.body || {};
    if (!region || !batchNumber) {
      return res.status(400).json({ message: 'Region and batch are required' });
    }

    const allowed = new Set(['region', 'batchNumber', 'schoolName', 'standard', 'mobile', 'age', 'isActive']);
    const updatePayload = {};
    Object.keys(updates || {}).forEach(key => {
      if (!allowed.has(key)) return;
      const value = updates[key];
      if (value === undefined || value === null) return;
      if (typeof value === 'string' && value.trim() === '') return;
      updatePayload[key] = value;
    });

    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const filter = { role: 'student', region, batchNumber };
    const result = await User.updateMany(filter, { $set: updatePayload });

    await logAudit({
      req,
      action: 'student_bulk_update',
      entity: 'student',
      meta: { region, batchNumber, updates: updatePayload, matched: result.matchedCount || result.n || 0 }
    });

    res.json({
      message: 'Bulk update completed',
      matched: result.matchedCount || result.n || 0,
      modified: result.modifiedCount || result.nModified || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Bulk update failed', details: error.message });
  }
});

// ⚠️ GENERAL ROUTES LAST (generic routes)
// Get all students
router.get('/', auth, async (req, res) => {
  try {
    const { region, schoolName, batchNumber, q, status } = req.query;
    let query = { role: 'student' };
    const normalizedStatus = String(status || 'active').toLowerCase();
    
    if (region) query.region = region;
    if (schoolName) query.schoolName = schoolName;
    if (batchNumber) query.batchNumber = batchNumber;
    if (q) {
      const or = [
        { name: { $regex: q, $options: 'i' } },
        { mobile: { $regex: q, $options: 'i' } }
      ];
      if (/^[a-fA-F0-9]{24}$/.test(q)) {
        or.push({ _id: q });
      }
      query.$or = or;
    }
    
    const students = await User.find(query).sort({ name: 1 }).lean();
    const ids = students.map(s => String(s._id));
    const statsMap = await buildAttendanceStatsMap(ids);

    const studentsWithAttendanceStatus = students.map(student => {
      const stats = statsMap.get(String(student._id)) || {};
      const attendancePercentage = Number(stats.attendancePercentage || 0);
      const attendanceActive = isAttendanceActive(stats);

      return {
        ...student,
        isActive: attendanceActive,
        attendanceStatus: attendanceActive ? 'active' : 'inactive',
        attendancePercentage: Number(attendancePercentage.toFixed(2))
      };
    });

    if (normalizedStatus === 'all') {
      return res.json(studentsWithAttendanceStatus);
    }

    if (normalizedStatus !== 'active' && normalizedStatus !== 'inactive') {
      return res.json(studentsWithAttendanceStatus);
    }

    const filtered = studentsWithAttendanceStatus.filter(s => s.attendanceStatus === normalizedStatus);

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add student
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!req.body.schoolName) {
      return res.status(400).json({ message: 'School name is required' });
    }
    if (!req.body.batchNumber) {
      return res.status(400).json({ message: 'Batch number is required' });
    }
    if (req.body.mobile && !/^[0-9+ -]{7,15}$/.test(String(req.body.mobile))) {
      return res.status(400).json({ message: 'Invalid mobile format' });
    }

    const dup = await findDuplicateStudent(req.body);
    if (dup) {
      return res.status(400).json({ message: 'Duplicate student detected' });
    }

    const student = new User({
      ...req.body,
      role: 'student',
      isActive: true
    });
    
    await student.save();
    await logAudit({
      req,
      action: 'student_add',
      entity: 'student',
      entityId: student._id?.toString(),
      after: { name: student.name, region: student.region, schoolName: student.schoolName }
    });

    res.json({ message: 'Student added successfully', student });
  } catch (error) {
    console.error('❌ Error adding student:', error.message);
    
    // Handle specific errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${field} already exists` });
    }
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: 'Validation failed', details: messages });
    }
    
    res.status(500).json({ message: 'Error adding student', details: error.message });
  }
});

// Update student
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await User.findById(id).lean();
    
    // Validate required fields
    if (!req.body.name) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!req.body.schoolName) {
      return res.status(400).json({ message: 'School name is required' });
    }
    if (!req.body.batchNumber) {
      return res.status(400).json({ message: 'Batch number is required' });
    }
    if (req.body.mobile && !/^[0-9+ -]{7,15}$/.test(String(req.body.mobile))) {
      return res.status(400).json({ message: 'Invalid mobile format' });
    }

    const dup = await findDuplicateStudent(req.body, id);
    if (dup) {
      return res.status(400).json({ message: 'Duplicate student detected' });
    }

    const student = await User.findByIdAndUpdate(
      id,
      {
        name: req.body.name,
        age: req.body.age,
        schoolName: req.body.schoolName,
        mobile: req.body.mobile,
        standard: req.body.standard,
        batchNumber: req.body.batchNumber
      },
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await logAudit({
      req,
      action: 'student_update',
      entity: 'student',
      entityId: student._id?.toString(),
      before,
      after: {
        name: student.name,
        region: student.region,
        schoolName: student.schoolName,
        mobile: student.mobile,
        standard: student.standard,
        batchNumber: student.batchNumber,
        age: student.age
      }
    });

    res.json({ message: 'Student updated successfully', student });
  } catch (error) {
    console.error('❌ Error updating student:', error.message);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: 'Validation failed', details: messages });
    }

    res.status(500).json({ message: 'Error updating student', details: error.message });
  }
});

// Update student active status
router.patch('/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body || {};
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be boolean' });
    }

    const before = await User.findById(id).lean();
    const student = await User.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    await logAudit({
      req,
      action: 'student_status_update',
      entity: 'student',
      entityId: student._id?.toString(),
      before,
      after: { isActive: student.isActive }
    });

    res.json({ message: 'Student status updated', student });
  } catch (error) {
    res.status(500).json({ message: 'Error updating status', details: error.message });
  }
});

// Delete student
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const before = await User.findById(req.params.id).lean();
    await User.findByIdAndDelete(req.params.id);

    await logAudit({
      req,
      action: 'student_delete',
      entity: 'student',
      entityId: req.params.id,
      before
    });

    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get stats
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('_id').lean();
    const total = students.length;
    const ids = students.map(s => String(s._id));
    const statsMap = await buildAttendanceStatsMap(ids);

    const active = students.filter(s => isAttendanceActive(statsMap.get(String(s._id)))).length;

    res.json({ total, active, inactive: total - active });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
