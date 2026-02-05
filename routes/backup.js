const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Marks = require('../models/Marks');
const WorkReport = require('../models/WorkReport');
const { auth, isAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const collectionMap = {
  students: () => User.find({ role: 'student' }).select('-password').lean(),
  users: () => User.find({ role: { $in: ['teacher', 'admin'] } }).lean(),
  attendance: () => Attendance.find({}).lean(),
  marks: () => Marks.find({}).lean(),
  workReports: () => WorkReport.find({}).lean()
};

// Backup download
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const { collection = 'students', download = '1' } = req.query;
    const loader = collectionMap[collection];
    if (!loader) {
      return res.status(400).json({ message: 'Invalid collection' });
    }

    const data = await loader();
    const payload = { collection, count: data.length, data };

    if (download === '1') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${collection}-backup.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Backup failed', details: error.message });
  }
});

// Restore (students + users only)
router.post('/restore', auth, isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'JSON backup file is required' });
    }

    const jsonText = req.file.buffer.toString('utf8');
    const payload = JSON.parse(jsonText);
    const students = payload.students || payload.data?.filter?.(d => d.role === 'student') || [];
    const users = payload.users || payload.data?.filter?.(d => d.role !== 'student') || [];

    let createdStudents = 0;
    let skippedStudents = 0;
    for (const s of students) {
      if (!s.name || !s.schoolName || !s.batchNumber || !s.region) {
        skippedStudents++;
        continue;
      }
      const dup = await User.findOne({
        role: 'student',
        $or: [
          s.mobile ? { mobile: s.mobile } : null,
          { name: s.name, schoolName: s.schoolName, batchNumber: s.batchNumber }
        ].filter(Boolean)
      });
      if (dup) {
        skippedStudents++;
        continue;
      }
      await User.create({
        name: s.name,
        region: s.region,
        schoolName: s.schoolName,
        standard: s.standard,
        batchNumber: s.batchNumber,
        mobile: s.mobile,
        age: s.age,
        role: 'student',
        isActive: s.isActive !== undefined ? s.isActive : true
      });
      createdStudents++;
    }

    let createdUsers = 0;
    let skippedUsers = 0;
    for (const u of users) {
      if (!u.email || !u.name || !u.role || !u.password) {
        skippedUsers++;
        continue;
      }
      const dup = await User.findOne({ email: u.email.toLowerCase() });
      if (dup) {
        skippedUsers++;
        continue;
      }
      await User.create({
        name: u.name,
        email: u.email.toLowerCase(),
        password: u.password,
        role: u.role
      });
      createdUsers++;
    }

    res.json({
      message: 'Restore completed',
      createdStudents,
      skippedStudents,
      createdUsers,
      skippedUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Restore failed', details: error.message });
  }
});

module.exports = router;
