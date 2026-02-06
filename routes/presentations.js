const express = require('express');
const router = express.Router();
const Presentation = require('../models/Presentation');
const User = require('../models/User');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

const MAX_GROUP_SIZE = 2;
const MIN_GROUP_SIZE = 1;

// ============================================
// VIEW PRESENTATIONS BY BATCH + DATE
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
      return res.json({ students: [], groupTopics: { 1: '' } });
    }

    const presentations = await Presentation.find({
      region,
      batchNumber,
      date: dateOnly
    }).lean();

    const presentationMap = new Map(presentations.map(p => [String(p.studentId), p]));
    const groupTopics = { 1: '' };
    presentations.forEach(p => {
      if (p.groupNumber === 1 && !groupTopics[1]) groupTopics[1] = p.topic || '';
    });

    const results = students.map(student => {
      const p = presentationMap.get(String(student._id));
      return {
        _id: student._id,
        name: student.name,
        schoolName: student.schoolName,
        standard: student.standard,
        batchNumber: student.batchNumber,
        presentation: p ? {
          groupNumber: p.groupNumber,
          topic: p.topic,
          presentationMarks: p.presentationMarks,
          evaluation: p.evaluation || null,
          evaluationLocked: !!p.evaluationLocked
        } : null
      };
    });

    res.json({ students: results, groupTopics });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// SAVE PRESENTATION EVALUATION
// ============================================
router.post('/evaluate', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, evaluations = [] } = req.body || {};
    if (!region || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const dateOnly = date.substring(0, 10);
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(400).json({ message: 'No evaluations provided' });
    }

    const studentIds = evaluations.map(e => String(e.studentId || '')).filter(Boolean);
    const presentations = await Presentation.find({
      studentId: { $in: studentIds },
      region,
      batchNumber,
      date: dateOnly
    }).lean();

    const presentationMap = new Map(presentations.map(p => [String(p.studentId), p]));

    const bulkOps = [];
    let updated = 0;
    let skipped = 0;

    for (const evalItem of evaluations) {
      const studentId = String(evalItem.studentId || '');
      if (!studentId) {
        skipped += 1;
        continue;
      }

      const existing = presentationMap.get(studentId);
      if (!existing) {
        skipped += 1;
        continue;
      }

      if (existing.evaluationLocked) {
        skipped += 1;
        continue;
      }

      const content = Number(evalItem.content);
      const design = Number(evalItem.design);
      const communication = Number(evalItem.communication);

      const evaluation = {
        content: Number.isFinite(content) ? content : null,
        design: Number.isFinite(design) ? design : null,
        communication: Number.isFinite(communication) ? communication : null
      };

      const hasAnyScore = evaluation.content !== null ||
        evaluation.design !== null ||
        evaluation.communication !== null;

      let totalMarks = null;
      if (hasAnyScore) {
        const sum = (evaluation.content || 0) +
          (evaluation.design || 0) +
          (evaluation.communication || 0);
        totalMarks = Math.max(0, Math.min(20, sum));
      }

      bulkOps.push({
        updateOne: {
          filter: { studentId, date: dateOnly },
          update: {
            $set: {
              evaluation,
              presentationMarks: totalMarks,
              markedBy: String(req.user._id),
              markedByName: req.user.name,
              markedAt: new Date()
            }
          }
        }
      });
      updated += 1;
    }

    if (bulkOps.length > 0) {
      await Presentation.bulkWrite(bulkOps, { ordered: false });
    }

    res.json({ message: 'Evaluations saved', updated, skipped });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// LOCK PRESENTATION EVALUATION
// ============================================
router.post('/lock-evaluation', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, studentIds = [], locked = true } = req.body || {};
    if (!region || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'No student ids provided' });
    }

    const dateOnly = date.substring(0, 10);
    const ids = studentIds.map(id => String(id));

    const result = await Presentation.updateMany(
      { studentId: { $in: ids }, region, batchNumber, date: dateOnly },
      { $set: { evaluationLocked: !!locked } }
    );

    res.json({ message: 'Evaluation lock updated', modified: result.modifiedCount || 0 });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// UPDATE TOPIC FOR GROUP
// ============================================
router.post('/update-topic', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, groupNumber, topic = '' } = req.body || {};
    if (!region || !batchNumber || !date || !groupNumber) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const dateOnly = date.substring(0, 10);
    const groupNum = Number(groupNumber);
    const cleanTopic = String(topic || '').trim();

    const result = await Presentation.updateMany(
      { region, batchNumber, date: dateOnly, groupNumber: groupNum },
      { $set: { topic: cleanTopic, markedBy: String(req.user._id), markedByName: req.user.name, markedAt: new Date() } }
    );

    res.json({ message: 'Topic updated', modified: result.modifiedCount || 0 });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// UNASSIGN STUDENT FROM PRESENTATION
// ============================================
router.post('/unassign', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date, studentIds = [] } = req.body || {};
    if (!region || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: 'No student ids provided' });
    }

    const dateOnly = date.substring(0, 10);
    const ids = studentIds.map(id => String(id));

    const result = await Presentation.deleteMany({
      studentId: { $in: ids },
      region,
      batchNumber,
      date: dateOnly
    });

    res.json({ message: 'Unassigned students', deleted: result.deletedCount || 0 });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// SAVE/UPDATE PRESENTATIONS
// ============================================
router.post('/save', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const {
      region,
      batchNumber,
      date,
      groupTopics = {},
      assignments = []
    } = req.body || {};

    if (!region || !batchNumber || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const dateOnly = date.substring(0, 10);

    const groupCounts = {};
    assignments.forEach(a => {
      const groupNumber = Number(a.groupNumber || 0);
      if (!groupNumber) return;
      groupCounts[groupNumber] = (groupCounts[groupNumber] || 0) + 1;
    });

    const groupNumbers = Object.keys(groupCounts).map(n => Number(n));
    if (groupNumbers.length === 0) {
      return res.status(400).json({ message: 'Please select one or two students for the group' });
    }

    for (const groupNumber of groupNumbers) {
      const count = groupCounts[groupNumber];
      if (count < MIN_GROUP_SIZE || count > MAX_GROUP_SIZE) {
        return res.status(400).json({ message: 'Each group must have one or two students only' });
      }
      const topic = String((groupTopics || {})[groupNumber] || req.body.topic || '').trim();
      if (!topic) {
        return res.status(400).json({ message: 'Please enter a topic for each group' });
      }
    }

    const studentIds = assignments.map(a => String(a.studentId));
    const students = await User.find({ _id: { $in: studentIds } }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const bulkOps = [];
    let upserted = 0;
    let deleted = 0;
    let skipped = 0;

    for (const assignment of assignments) {
      const studentId = String(assignment.studentId || '');
      const student = studentMap.get(studentId);
      if (!student) {
        skipped += 1;
        continue;
      }

      const groupNumber = Number(assignment.groupNumber || 0);
      if (!groupNumber) {
        bulkOps.push({
          deleteOne: { filter: { studentId, date: dateOnly } }
        });
        deleted += 1;
        continue;
      }

      const topic = String((groupTopics || {})[groupNumber] || req.body.topic || '').trim();

      const doc = {
        studentId,
        studentName: student.name,
        region: student.region,
        batchNumber: student.batchNumber,
        date: dateOnly,
        groupNumber,
        topic,
        markedBy: String(req.user._id),
        markedByName: req.user.name,
        markedAt: new Date()
      };

      bulkOps.push({
        updateOne: {
          filter: { studentId, date: dateOnly },
          update: { $set: doc },
          upsert: true
        }
      });
      upserted += 1;
    }

    if (bulkOps.length > 0) {
      await Presentation.bulkWrite(bulkOps, { ordered: false });
    }

    res.json({
      message: 'Presentations saved',
      upserted,
      deleted,
      skipped
    });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
