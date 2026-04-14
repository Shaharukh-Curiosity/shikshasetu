const express = require('express');
const router = express.Router();
const BusServiceExpense = require('../models/BusServiceExpense');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

// @route   GET /api/bus-service
// @desc    Get bus service expenditure entries
// @access  Private (Teacher/Admin)
router.get('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      filter.serviceDate = { $gte: start, $lt: end };
    }

    const entries = await BusServiceExpense.find(filter)
      .sort({ serviceDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    res.json(entries);
  } catch (error) {
    console.error('Error fetching bus service expenses:', error);
    res.status(500).json({ message: 'Failed to fetch bus service expenses' });
  }
});

// @route   POST /api/bus-service
// @desc    Save bus service expenditure entry
// @access  Private (Teacher/Admin)
router.post('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { servicePart, amount, serviceDate, notes, busName, entries, garageName, garageAddress, garageMobile } = req.body;

    const parsedDate = serviceDate ? new Date(serviceDate) : new Date();
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'serviceDate is invalid' });
    }

    const basePayload = {
      busName: String(busName || 'Bus On Wheels').trim() || 'Bus On Wheels',
      serviceDate: parsedDate,
      garageName: String(garageName || '').trim(),
      garageAddress: String(garageAddress || '').trim(),
      garageMobile: String(garageMobile || '').trim(),
      createdBy: req.user._id,
      createdByName: req.user.name || ''
    };

    if (Array.isArray(entries)) {
      const cleanedEntries = entries.map((item) => ({
        ...basePayload,
        servicePart: String(item.servicePart || '').trim(),
        amount: Number(item.amount),
        notes: String(item.notes || '').trim()
      })).filter((item) => item.servicePart && Number.isFinite(item.amount) && item.amount >= 0);

      if (cleanedEntries.length === 0) {
        return res.status(400).json({ message: 'No valid service entries provided' });
      }

      const saved = await BusServiceExpense.insertMany(cleanedEntries);
      return res.status(201).json({ message: 'Bus service expenses saved', entries: saved });
    }

    if (!servicePart || String(servicePart).trim().length === 0) {
      return res.status(400).json({ message: 'servicePart is required' });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: 'amount must be a valid number' });
    }

    const entry = new BusServiceExpense({
      ...basePayload,
      servicePart: String(servicePart).trim(),
      amount: numericAmount,
      notes: String(notes || '').trim()
    });

    await entry.save();
    res.status(201).json({ message: 'Bus service expense saved', entry });
  } catch (error) {
    console.error('Error saving bus service expense:', error);
    res.status(500).json({ message: 'Failed to save bus service expense' });
  }
});

// @route   PUT /api/bus-service/:id
// @desc    Update a bus service expenditure entry
// @access  Private (Teacher/Admin)
router.put('/:id', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { servicePart, amount, serviceDate, notes, garageName, garageAddress, garageMobile } = req.body;

    const updateDoc = {};
    if (servicePart !== undefined) updateDoc.servicePart = String(servicePart || '').trim();
    if (amount !== undefined) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount < 0) {
        return res.status(400).json({ message: 'amount must be a valid number' });
      }
      updateDoc.amount = numericAmount;
    }
    if (serviceDate !== undefined) {
      const parsedDate = new Date(serviceDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ message: 'serviceDate is invalid' });
      }
      updateDoc.serviceDate = parsedDate;
    }
    if (notes !== undefined) updateDoc.notes = String(notes || '').trim();
    if (garageName !== undefined) updateDoc.garageName = String(garageName || '').trim();
    if (garageAddress !== undefined) updateDoc.garageAddress = String(garageAddress || '').trim();
    if (garageMobile !== undefined) updateDoc.garageMobile = String(garageMobile || '').trim();

    if (!Object.keys(updateDoc).length) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const updated = await BusServiceExpense.findByIdAndUpdate(
      req.params.id,
      { $set: updateDoc },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: 'Service entry not found' });
    }

    res.json({ message: 'Bus service expense updated', entry: updated });
  } catch (error) {
    console.error('Error updating bus service expense:', error);
    res.status(500).json({ message: 'Failed to update bus service expense' });
  }
});

module.exports = router;
