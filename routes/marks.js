const express = require('express');
const router = express.Router();
const Marks = require('../models/Marks');
const Presentation = require('../models/Presentation');
const User = require('../models/User');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

const TOTAL_MARKS = 100;
const LIMITS = { theory: 40, practical: 40, presentation: 20 };

// ============================================
// MARKS - SAVE/UPDATE
// ============================================
router.post('/mark', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { marksRecords, date } = req.body;

    if (!marksRecords || marksRecords.length === 0) {
      return res.status(400).json({ message: 'Missing marks records' });
    }

    const dateOnly = (date || new Date().toISOString().split('T')[0]).substring(0, 10);

    const studentIds = marksRecords.map(r => String(r.studentId));
    const students = await User.find({ _id: { $in: studentIds } }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const existingRecords = await Marks.find({
      studentId: { $in: studentIds },
      date: dateOnly
    }).lean();
    const existingMap = new Map(existingRecords.map(r => [String(r.studentId), r]));

    const bulkOps = [];
    let success = 0;
    let errors = 0;

    for (const record of marksRecords) {
      const studentId = String(record.studentId);
      const student = studentMap.get(studentId);
      if (!student) {
        errors++;
        continue;
      }

      const theory = Number(record.theory || 0);
      const practical = Number(record.practical || 0);
      const presentation = Number(record.presentation || 0);

      if (theory < 0 || theory > LIMITS.theory ||
          practical < 0 || practical > LIMITS.practical ||
          presentation < 0 || presentation > LIMITS.presentation) {
        errors++;
        continue;
      }

      const totalObtained = theory + practical + presentation;
      const percentage = totalObtained > 0 ? Number(((totalObtained / TOTAL_MARKS) * 100).toFixed(2)) : 0;

      const doc = {
        studentId: studentId,
        studentName: student.name,
        region: student.region,
        batchNumber: student.batchNumber,
        date: dateOnly,
        theory,
        practical,
        presentation,
        totalMarks: TOTAL_MARKS,
        totalObtained,
        percentage,
        markedBy: String(req.user._id),
        markedByName: req.user.name,
        markedAt: new Date()
      };

      const existingRecord = existingMap.get(studentId);
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
      await Marks.bulkWrite(bulkOps, { ordered: false });
      success += bulkOps.length;
    }

    res.json({
      message: 'Marks processed',
      results: { successful: success, errors }
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// VIEW MARKS BY BATCH + DATE
// ============================================
router.get('/by-batch', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date } = req.query;

    if (!region || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const dateOnly = date.substring(0, 10);

    const students = await User.find({
      role: 'student',
      region,
      batchNumber,
      isActive: true
    }).lean();

    if (!students || students.length === 0) {
      return res.json([]);
    }

    const marksRecords = await Marks.find({
      region,
      batchNumber,
      date: dateOnly
    }).lean();

    const marksMap = new Map(marksRecords.map(r => [String(r.studentId), r]));
    const presentationRecords = await Presentation.find({
      region,
      batchNumber,
      date: dateOnly
    }).lean();
    const presentationMap = new Map(presentationRecords.map(r => [String(r.studentId), r]));

    const results = students.map(student => {
      const m = marksMap.get(String(student._id));
      const p = presentationMap.get(String(student._id));
      let presentationPrefill = null;
      if (p) {
        if (Number.isFinite(p.presentationMarks)) {
          presentationPrefill = p.presentationMarks;
        } else if (p.evaluation) {
          const content = Number(p.evaluation.content || 0);
          const design = Number(p.evaluation.design || 0);
          const communication = Number(p.evaluation.communication || 0);
          const sum = content + design + communication;
          presentationPrefill = Math.max(0, Math.min(20, sum));
        }
      }
      return {
        _id: student._id,
        name: student.name,
        schoolName: student.schoolName,
        standard: student.standard,
        batchNumber: student.batchNumber,
        presentationPrefill,
        marks: m ? {
          theory: m.theory,
          practical: m.practical,
          presentation: m.presentation,
          totalMarks: m.totalMarks,
          totalObtained: m.totalObtained,
          percentage: m.percentage,
          markedBy: m.markedByName,
          markedAt: m.markedAt
        } : null
      };
    });

    res.json(results);
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// TOP 3 MARKS (BY DATE)
// ============================================
router.get('/top', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { date, region } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Missing date' });
    }

    const dateOnly = date.substring(0, 10);

    const query = { date: dateOnly };
    if (region) query.region = region;

    const results = await Marks.find(query)
      .sort({ totalObtained: -1 })
      .limit(3)
      .lean();

    res.json(results.map(r => ({
      studentName: r.studentName,
      batchNumber: r.batchNumber,
      region: r.region,
      totalMarks: r.totalMarks,
      totalObtained: r.totalObtained,
      percentage: r.percentage
    })));
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
