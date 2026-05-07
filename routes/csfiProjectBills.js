const express = require('express');
const router = express.Router();
const CsfiProjectBill = require('../models/CsfiProjectBill');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

const allowedProjects = new Set(['first-bus', 'bio-diversity', 'shikshamitra', 'malnutrition']);

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

// @route   GET /api/csfi-project-bills
// @desc    Get CSFI project bills
// @access  Private (Teacher/Admin)
router.get('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { project, startDate, endDate } = req.query;
    const filter = {};

    if (project && allowedProjects.has(String(project))) {
      filter.project = String(project);
    }

    const start = normalizeDate(startDate);
    const end = normalizeDate(endDate);
    if (start && end) {
      const inclusiveEnd = new Date(end);
      inclusiveEnd.setDate(inclusiveEnd.getDate() + 1);
      filter.billDate = { $gte: start, $lt: inclusiveEnd };
    }

    const bills = await CsfiProjectBill.find(filter)
      .sort({ billDate: -1, createdAt: -1 })
      .limit(500)
      .lean();

    res.json(bills);
  } catch (error) {
    console.error('Error fetching CSFI project bills:', error);
    res.status(500).json({ message: 'Failed to fetch CSFI project bills' });
  }
});

// @route   POST /api/csfi-project-bills
// @desc    Save a CSFI project bill
// @access  Private (Teacher/Admin)
router.post('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { billDate, project, matter, amount, entries } = req.body;

    const projectKey = String(project || '').trim();
    if (!allowedProjects.has(projectKey)) {
      return res.status(400).json({ message: 'project is invalid' });
    }

    const basePayload = {
      project: projectKey,
      createdBy: req.user._id,
      createdByName: req.user.name || ''
    };

    if (Array.isArray(entries)) {
      const cleanedEntries = [];
      const skipped = [];

      entries.forEach((entry, index) => {
        const parsedDate = normalizeDate(entry?.billDate || entry?.date);
        const matterText = String(entry?.matter || '').trim();
        const numericAmount = Number(entry?.amount);

        if (!parsedDate) {
          skipped.push({ row: index + 1, reason: 'billDate is invalid' });
          return;
        }
        if (!matterText) {
          skipped.push({ row: index + 1, reason: 'matter is required' });
          return;
        }
        if (!Number.isFinite(numericAmount) || numericAmount < 0) {
          skipped.push({ row: index + 1, reason: 'amount must be a valid number' });
          return;
        }

        cleanedEntries.push({
          ...basePayload,
          billDate: parsedDate,
          matter: matterText,
          amount: numericAmount
        });
      });

      if (!cleanedEntries.length) {
        return res.status(400).json({
          message: 'No valid Excel rows found',
          skipped
        });
      }

      const saved = await CsfiProjectBill.insertMany(cleanedEntries);
      return res.status(201).json({
        message: 'CSFI project bills saved',
        created: saved.length,
        skipped: skipped.length,
        skippedDetails: skipped.slice(0, 50),
        bills: saved
      });
    }

    const parsedDate = normalizeDate(billDate);
    if (!parsedDate) {
      return res.status(400).json({ message: 'billDate is invalid' });
    }

    const matterText = String(matter || '').trim();
    if (!matterText) {
      return res.status(400).json({ message: 'matter is required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: 'amount must be a valid number' });
    }

    const bill = new CsfiProjectBill({
      ...basePayload,
      billDate: parsedDate,
      matter: matterText,
      amount: numericAmount
    });

    await bill.save();
    res.status(201).json({ message: 'CSFI project bill saved', bill });
  } catch (error) {
    console.error('Error saving CSFI project bill:', error);
    res.status(500).json({ message: 'Failed to save CSFI project bill' });
  }
});

module.exports = router;
