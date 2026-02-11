const express = require('express');
const router = express.Router();
const Marks = require('../models/Marks');
const Presentation = require('../models/Presentation');
const ExamAttendance = require('../models/ExamAttendance');
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
    const conflicts = [];

    for (const record of marksRecords) {
      const studentId = String(record.studentId);
      const student = studentMap.get(studentId);
      if (!student) {
        errors++;
        continue;
      }

      const existingRecord = existingMap.get(studentId);
      if (existingRecord && String(existingRecord.markedBy) !== String(req.user._id)) {
        conflicts.push({
          studentName: student.name,
          markedBy: existingRecord.markedByName || 'Unknown',
          date: existingRecord.date
        });
        errors++;
        continue;
      }

      const theory = (record.theory === null || record.theory === undefined || record.theory === '')
        ? null
        : Number(record.theory);
      const practical = (record.practical === null || record.practical === undefined || record.practical === '')
        ? null
        : Number(record.practical);
      const presentation = (record.presentation === null || record.presentation === undefined || record.presentation === '')
        ? null
        : Number(record.presentation);

      if ((theory !== null && (theory < 0 || theory > LIMITS.theory)) ||
          (practical !== null && (practical < 0 || practical > LIMITS.practical)) ||
          (presentation !== null && (presentation < 0 || presentation > LIMITS.presentation))) {
        errors++;
        continue;
      }

      const totalObtained = (theory || 0) + (practical || 0) + (presentation || 0);
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
        const result = await Marks.bulkWrite(bulkOps, { ordered: false });
        success += (result.insertedCount || 0) + (result.matchedCount || 0) + (result.upsertedCount || 0);
      } catch (err) {
        const r = err?.result || err?.result?.result;
        const partialSuccess = r
          ? (r.nInserted || 0) + (r.nMatched || 0) + (r.nUpserted || 0)
          : 0;
        success += partialSuccess;
        errors += Math.max(0, bulkOps.length - partialSuccess);
      }
    }

    const response = {
      message: 'Marks processed',
      results: { successful: success, errors }
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
// VIEW MARKS BY BATCH + DATE
// ============================================
router.get('/by-batch', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { region, batchNumber, date } = req.query;

    if (!region || !date) {
      return res.status(400).json({ message: 'Missing parameters' });
    }

    const dateOnly = date.substring(0, 10);
    const useAllBatches = !batchNumber || String(batchNumber).toLowerCase() === 'all';
    const batchFilter = useAllBatches ? {} : { batchNumber };

    const students = await User.find({
      role: 'student',
      region,
      ...batchFilter,
      isActive: true
    }).lean();

    if (!students || students.length === 0) {
      return res.json([]);
    }

    const marksRecords = await Marks.find({
      region,
      ...batchFilter,
      date: dateOnly
    }).lean();

    const marksMap = new Map(marksRecords.map(r => [String(r.studentId), r]));
    const presentationRecords = await Presentation.find({
      region,
      ...batchFilter,
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
// VIEW MISSED EXAMS
// ============================================
router.get('/missed', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const {
      region,
      batchNumber,
      mode = 'single',
      date,
      theoryDate,
      practicalDate,
      presentationDate,
      startDate,
      endDate
    } = req.query;

    if (!region) {
      return res.status(400).json({ message: 'Missing parameters' });
    }
    const useAllBatches = !batchNumber || String(batchNumber).toLowerCase() === 'all';
    const batchFilter = useAllBatches ? {} : { batchNumber };

    const cleanMode = String(mode || 'single').toLowerCase();
    const allowedModes = new Set(['single', 'plan', 'range', 'latest']);
    if (!allowedModes.has(cleanMode)) {
      return res.status(400).json({ message: 'Invalid mode. Use: single, plan, range, latest' });
    }

    const toDateOnly = (value) => String(value || '').substring(0, 10);
    const hasValue = (v) => v !== null && v !== undefined;
    const hasPresentationInMarks = (m) => !!(m && hasValue(m.presentation));
    const hasPresentationInPresentationTable = (p) => !!(
      p && (
        hasValue(p.presentationMarks) ||
        (
          p.evaluation &&
          (hasValue(p.evaluation.content) || hasValue(p.evaluation.design) || hasValue(p.evaluation.communication))
        )
      )
    );

    const usedDates = {
      mode: cleanMode,
      singleDate: null,
      theoryDate: null,
      practicalDate: null,
      presentationDate: null,
      startDate: null,
      endDate: null
    };

    const students = await User.find({
      role: 'student',
      region,
      ...batchFilter,
      isActive: true
    }).lean();

    if (!students || students.length === 0) {
      return res.json({ mode: cleanMode, usedDates, students: [] });
    }

    const statusMap = new Map();
    students.forEach(s => {
      statusMap.set(String(s._id), {
        hasTheory: false,
        hasPractical: false,
        hasPresentation: false
      });
    });

    if (cleanMode === 'single') {
      if (!date) return res.status(400).json({ message: 'Missing parameter: date' });
      const dateOnly = toDateOnly(date);
      usedDates.singleDate = dateOnly;

      const marksRecords = await Marks.find({ region, ...batchFilter, date: dateOnly }).lean();
      const presentationRecords = await Presentation.find({ region, ...batchFilter, date: dateOnly }).lean();
      const marksMap = new Map(marksRecords.map(r => [String(r.studentId), r]));
      const presentationMap = new Map(presentationRecords.map(r => [String(r.studentId), r]));

      statusMap.forEach((value, studentId) => {
        const m = marksMap.get(studentId);
        const p = presentationMap.get(studentId);
        value.hasTheory = !!(m && hasValue(m.theory));
        value.hasPractical = !!(m && hasValue(m.practical));
        value.hasPresentation = hasPresentationInMarks(m) || hasPresentationInPresentationTable(p);
      });
    }

    if (cleanMode === 'plan') {
      if (!theoryDate || !practicalDate || !presentationDate) {
        return res.status(400).json({ message: 'Missing parameters: theoryDate, practicalDate, presentationDate' });
      }

      const theoryDateOnly = toDateOnly(theoryDate);
      const practicalDateOnly = toDateOnly(practicalDate);
      const presentationDateOnly = toDateOnly(presentationDate);
      usedDates.theoryDate = theoryDateOnly;
      usedDates.practicalDate = practicalDateOnly;
      usedDates.presentationDate = presentationDateOnly;

      const [theoryRecords, practicalRecords, presentationMarksRecords, presentationTableRecords] = await Promise.all([
        Marks.find({ region, ...batchFilter, date: theoryDateOnly }).lean(),
        Marks.find({ region, ...batchFilter, date: practicalDateOnly }).lean(),
        Marks.find({ region, ...batchFilter, date: presentationDateOnly }).lean(),
        Presentation.find({ region, ...batchFilter, date: presentationDateOnly }).lean()
      ]);

      const theoryMap = new Map(theoryRecords.map(r => [String(r.studentId), r]));
      const practicalMap = new Map(practicalRecords.map(r => [String(r.studentId), r]));
      const presentationMarksMap = new Map(presentationMarksRecords.map(r => [String(r.studentId), r]));
      const presentationTableMap = new Map(presentationTableRecords.map(r => [String(r.studentId), r]));

      statusMap.forEach((value, studentId) => {
        const tm = theoryMap.get(studentId);
        const pm = practicalMap.get(studentId);
        const prm = presentationMarksMap.get(studentId);
        const prt = presentationTableMap.get(studentId);
        value.hasTheory = !!(tm && hasValue(tm.theory));
        value.hasPractical = !!(pm && hasValue(pm.practical));
        value.hasPresentation = hasPresentationInMarks(prm) || hasPresentationInPresentationTable(prt);
      });
    }

    if (cleanMode === 'range') {
      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Missing parameters: startDate, endDate' });
      }
      const startDateOnly = toDateOnly(startDate);
      const endDateOnly = toDateOnly(endDate);
      if (startDateOnly > endDateOnly) {
        return res.status(400).json({ message: 'Invalid range: startDate must be before or equal to endDate' });
      }

      usedDates.startDate = startDateOnly;
      usedDates.endDate = endDateOnly;

      const [marksRecords, presentationRecords] = await Promise.all([
        Marks.find({
          region,
          ...batchFilter,
          date: { $gte: startDateOnly, $lte: endDateOnly }
        }).lean(),
        Presentation.find({
          region,
          ...batchFilter,
          date: { $gte: startDateOnly, $lte: endDateOnly }
        }).lean()
      ]);

      marksRecords.forEach(m => {
        const status = statusMap.get(String(m.studentId));
        if (!status) return;
        if (hasValue(m.theory)) status.hasTheory = true;
        if (hasValue(m.practical)) status.hasPractical = true;
        if (hasPresentationInMarks(m)) status.hasPresentation = true;
      });

      presentationRecords.forEach(p => {
        const status = statusMap.get(String(p.studentId));
        if (!status) return;
        if (hasPresentationInPresentationTable(p)) status.hasPresentation = true;
      });
    }

    if (cleanMode === 'latest') {
      const [latestTheoryRec, latestPracticalRec, latestPresentationMarksRec, latestPresentationTableRec] = await Promise.all([
        Marks.findOne({ region, ...batchFilter, theory: { $ne: null } }).sort({ date: -1 }).lean(),
        Marks.findOne({ region, ...batchFilter, practical: { $ne: null } }).sort({ date: -1 }).lean(),
        Marks.findOne({ region, ...batchFilter, presentation: { $ne: null } }).sort({ date: -1 }).lean(),
        Presentation.findOne({
          region,
          ...batchFilter,
          $or: [
            { presentationMarks: { $ne: null } },
            { 'evaluation.content': { $ne: null } },
            { 'evaluation.design': { $ne: null } },
            { 'evaluation.communication': { $ne: null } }
          ]
        }).sort({ date: -1 }).lean()
      ]);

      const latestTheoryDate = latestTheoryRec ? toDateOnly(latestTheoryRec.date) : null;
      const latestPracticalDate = latestPracticalRec ? toDateOnly(latestPracticalRec.date) : null;
      const latestPresentationMarksDate = latestPresentationMarksRec ? toDateOnly(latestPresentationMarksRec.date) : null;
      const latestPresentationTableDate = latestPresentationTableRec ? toDateOnly(latestPresentationTableRec.date) : null;
      const latestPresentationDate = [latestPresentationMarksDate, latestPresentationTableDate]
        .filter(Boolean)
        .sort()
        .pop() || null;

      usedDates.theoryDate = latestTheoryDate;
      usedDates.practicalDate = latestPracticalDate;
      usedDates.presentationDate = latestPresentationDate;

      const queries = [];
      if (latestTheoryDate) queries.push(Marks.find({ region, ...batchFilter, date: latestTheoryDate }).lean());
      else queries.push(Promise.resolve([]));
      if (latestPracticalDate) queries.push(Marks.find({ region, ...batchFilter, date: latestPracticalDate }).lean());
      else queries.push(Promise.resolve([]));
      if (latestPresentationDate) {
        queries.push(Marks.find({ region, ...batchFilter, date: latestPresentationDate }).lean());
        queries.push(Presentation.find({ region, ...batchFilter, date: latestPresentationDate }).lean());
      } else {
        queries.push(Promise.resolve([]));
        queries.push(Promise.resolve([]));
      }

      const [theoryRecords, practicalRecords, presentationMarksRecords, presentationTableRecords] = await Promise.all(queries);
      const theoryMap = new Map(theoryRecords.map(r => [String(r.studentId), r]));
      const practicalMap = new Map(practicalRecords.map(r => [String(r.studentId), r]));
      const presentationMarksMap = new Map(presentationMarksRecords.map(r => [String(r.studentId), r]));
      const presentationTableMap = new Map(presentationTableRecords.map(r => [String(r.studentId), r]));

      statusMap.forEach((value, studentId) => {
        const tm = theoryMap.get(studentId);
        const pm = practicalMap.get(studentId);
        const prm = presentationMarksMap.get(studentId);
        const prt = presentationTableMap.get(studentId);
        value.hasTheory = !!(tm && hasValue(tm.theory));
        value.hasPractical = !!(pm && hasValue(pm.practical));
        value.hasPresentation = hasPresentationInMarks(prm) || hasPresentationInPresentationTable(prt);
      });
    }

    const results = students
      .map(student => {
        const status = statusMap.get(String(student._id)) || {
          hasTheory: false,
          hasPractical: false,
          hasPresentation: false
        };

        return {
          studentId: student._id,
          name: student.name,
          batchNumber: student.batchNumber,
          missed: {
            theory: !status.hasTheory,
            practical: !status.hasPractical,
            presentation: !status.hasPresentation
          }
        };
      })
      .filter(r => r && (r.missed.theory || r.missed.practical || r.missed.presentation));

    res.json({ mode: cleanMode, usedDates, students: results });
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// EXAM ATTENDANCE - VIEW BY BATCH + DATE
// ============================================
router.get('/exam-attendance/by-batch', auth, isTeacherOrAdmin, async (req, res) => {
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

    const records = await ExamAttendance.find({
      region,
      batchNumber,
      date: dateOnly
    }).lean();
    const recordMap = new Map(records.map(r => [String(r.studentId), r]));

    const results = students.map(student => {
      const rec = recordMap.get(String(student._id));
      return {
        studentId: student._id,
        name: student.name,
        batchNumber: student.batchNumber,
        appeared: rec ? !!rec.appeared : null,
        markedBy: rec ? rec.markedByName : null,
        markedAt: rec ? rec.markedAt : null
      };
    });

    res.json(results);
  } catch (error) {
    console.error('FATAL ERROR:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// EXAM ATTENDANCE - SAVE/UPDATE
// ============================================
router.post('/exam-attendance/mark', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { date, records } = req.body;

    if (!date || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ message: 'Missing data' });
    }

    const dateOnly = date.substring(0, 10);
    const studentIds = records.map(r => String(r.studentId));

    const students = await User.find({ _id: { $in: studentIds }, role: 'student' }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const bulkOps = [];
    let success = 0;
    let errors = 0;

    records.forEach(record => {
      const studentId = String(record.studentId);
      const student = studentMap.get(studentId);
      if (!student) {
        errors++;
        return;
      }
      const appeared = !!record.appeared;

      const doc = {
        studentId,
        studentName: student.name,
        region: student.region,
        batchNumber: student.batchNumber,
        date: dateOnly,
        appeared,
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
    });

    if (bulkOps.length > 0) {
      const result = await ExamAttendance.bulkWrite(bulkOps, { ordered: false });
      success += (result.insertedCount || 0) + (result.matchedCount || 0) + (result.upsertedCount || 0);
    }

    res.json({ message: 'Exam attendance saved', results: { successful: success, errors } });
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
    const { date, region, batchNumber } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Missing date' });
    }

    const dateOnly = date.substring(0, 10);

    const query = { date: dateOnly };
    if (region) query.region = region;
    if (batchNumber && String(batchNumber).toLowerCase() !== 'all') {
      query.batchNumber = batchNumber;
    }

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
