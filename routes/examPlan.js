const express = require('express');
const router = express.Router();
const ExamPlan = require('../models/ExamPlan');
const RegionMilestone = require('../models/RegionMilestone');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

function normalizeDate(value) {
  if (!value) return null;
  const dateOnly = String(value).trim().substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    return null;
  }
  return dateOnly;
}

// GET /api/exam-plan?region=...&batchNumber=...
router.get('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const region = String(req.query.region || '').trim();
    const batchNumber = String(req.query.batchNumber || '').trim();

    if (!region) {
      return res.status(400).json({ message: 'region is required' });
    }

    const [plan, milestone] = await Promise.all([
      batchNumber ? ExamPlan.findOne({ region, batchNumber }).lean() : Promise.resolve(null),
      RegionMilestone.findOne({ region }).lean()
    ]);
    if (!plan) {
      return res.json({
        region,
        batchNumber: batchNumber || '',
        projectInaugurationDate: milestone?.projectInaugurationDate || null,
        theoryDate: null,
        practicalDate: null,
        presentationDate: null,
        certificateDate: null,
        updatedByName: milestone?.updatedByName || '',
        updatedAt: milestone?.updatedAt || null
      });
    }

    res.json({
      region: plan.region,
      batchNumber: plan.batchNumber,
      projectInaugurationDate: milestone?.projectInaugurationDate || null,
      theoryDate: plan.theoryDate || null,
      practicalDate: plan.practicalDate || null,
      presentationDate: plan.presentationDate || null,
      certificateDate: plan.certificateDate || null,
      updatedByName: plan.updatedByName || '',
      updatedAt: plan.updatedAt || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exam plan', details: error.message });
  }
});

// PUT /api/exam-plan
router.put('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const region = String(req.body.region || '').trim();
    const batchNumber = String(req.body.batchNumber || '').trim();

    if (!region || !batchNumber) {
      return res.status(400).json({ message: 'region and batchNumber are required' });
    }

    const payload = {
      theoryDate: normalizeDate(req.body.theoryDate),
      practicalDate: normalizeDate(req.body.practicalDate),
      presentationDate: normalizeDate(req.body.presentationDate),
      certificateDate: normalizeDate(req.body.certificateDate),
      updatedBy: String(req.user?._id || ''),
      updatedByName: String(req.user?.name || ''),
      updatedAt: new Date()
    };

    const incomingInaugurationDate = normalizeDate(req.body.projectInaugurationDate);
    const existingMilestone = await RegionMilestone.findOne({ region }).lean();
    const projectInaugurationDate = incomingInaugurationDate || existingMilestone?.projectInaugurationDate || null;
    const [updated, milestone] = await Promise.all([
      ExamPlan.findOneAndUpdate(
        { region, batchNumber },
        {
          $set: {
            region,
            batchNumber,
            ...payload
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean(),
      RegionMilestone.findOneAndUpdate(
        { region },
        {
          $set: {
            region,
            projectInaugurationDate,
            updatedBy: String(req.user?._id || ''),
            updatedByName: String(req.user?.name || ''),
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean()
    ]);

    res.json({
      message: 'Exam plan saved successfully',
      region: updated.region,
      batchNumber: updated.batchNumber,
      projectInaugurationDate: milestone?.projectInaugurationDate || null,
      theoryDate: updated.theoryDate || null,
      practicalDate: updated.practicalDate || null,
      presentationDate: updated.presentationDate || null,
      certificateDate: updated.certificateDate || null,
      updatedByName: updated.updatedByName || '',
      updatedAt: updated.updatedAt || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save exam plan', details: error.message });
  }
});

module.exports = router;
