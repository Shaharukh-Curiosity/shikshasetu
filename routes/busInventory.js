const express = require('express');
const router = express.Router();
const BusInventory = require('../models/BusInventory');
const { auth, isTeacherOrAdmin } = require('../middleware/auth');

const DEFAULT_ITEMS = [
  { name: 'Computers', category: 'Hardware', quantity: 26, location: 'Bus', remarks: '' },
  { name: 'AC', category: 'Electrical', quantity: 2, location: 'Bus', remarks: '' },
  { name: 'Fans', category: 'Electrical', quantity: 14, location: 'Bus', remarks: '' },
  { name: 'Fire Extinguishers', category: 'Safety', quantity: 2, location: 'Bus', remarks: '' },
  { name: 'Markers', category: 'Stationery', quantity: 2, location: 'Bus', remarks: '' },
  { name: 'Routers', category: 'Networking', quantity: 1, location: 'Bus', remarks: '' },
  { name: 'Switch', category: 'Networking', quantity: 1, location: 'Bus', remarks: '' },
  { name: 'Cameras', category: 'Security', quantity: 2, location: 'Bus', remarks: '' },
  { name: 'DVR', category: 'Security', quantity: 1, location: 'Bus', remarks: '' },
  { name: 'Solar Inverter', category: 'Power', quantity: 1, location: 'Bus', remarks: '' },
  { name: 'Monitors', category: 'Hardware', quantity: 26, location: 'Bus', remarks: '' },
  { name: 'Keyboards', category: 'Hardware', quantity: 26, location: 'Bus', remarks: '' },
  { name: 'Mouse', category: 'Hardware', quantity: 26, location: 'Bus', remarks: '' }
];

// @route   GET /api/bus-inventory
// @desc    Get Bus on Wheels inventory
// @access  Private (Teacher/Admin)
router.get('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const record = await BusInventory.findOne({ key: 'bus-on-wheels' }).lean();
    if (!record) {
      return res.json({
        key: 'bus-on-wheels',
        items: DEFAULT_ITEMS,
        updatedByName: '',
        updatedAt: null
      });
    }

    const mergedItems = DEFAULT_ITEMS.map((item) => {
      const found = (record.items || []).find((i) => i.name === item.name);
      return found
        ? {
            name: item.name,
            category: String(found.category || item.category || ''),
            quantity: Number(found.quantity) || 0,
            location: 'Bus',
            remarks: String(found.remarks || '')
          }
        : item;
    });

    res.json({
      key: record.key,
      items: mergedItems,
      updatedByName: record.updatedByName || '',
      updatedAt: record.updatedAt || null
    });
  } catch (error) {
    console.error('Error fetching bus inventory:', error);
    res.status(500).json({ message: 'Failed to fetch bus inventory' });
  }
});

// @route   GET /api/bus-inventory/details
// @desc    Get current + history details for Bus on Wheels inventory
// @access  Private (Teacher/Admin)
router.get('/details', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const record = await BusInventory.findOne({ key: 'bus-on-wheels' }).lean();
    if (!record) {
      return res.json({
        current: {
          items: DEFAULT_ITEMS,
          updatedByName: '',
          updatedAt: null
        },
        history: []
      });
    }

    const mergedCurrent = DEFAULT_ITEMS.map((item) => {
      const found = (record.items || []).find((i) => i.name === item.name);
      return found
        ? {
            name: item.name,
            category: String(found.category || item.category || ''),
            quantity: Number(found.quantity) || 0,
            location: 'Bus',
            remarks: String(found.remarks || '')
          }
        : item;
    });

    const history = (record.history || []).map((h) => ({
      updatedByName: h.updatedByName || 'Unknown',
      updatedAt: h.updatedAt || null,
      items: (h.items || []).map((i) => ({
        name: i.name,
        category: String(i.category || ''),
        quantity: Number(i.quantity) || 0,
        location: 'Bus',
        remarks: String(i.remarks || '')
      }))
    })).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.json({
      current: {
        items: mergedCurrent,
        updatedByName: record.updatedByName || '',
        updatedAt: record.updatedAt || null
      },
      history
    });
  } catch (error) {
    console.error('Error fetching bus inventory details:', error);
    res.status(500).json({ message: 'Failed to fetch bus inventory details' });
  }
});

// @route   PUT /api/bus-inventory
// @desc    Save Bus on Wheels inventory
// @access  Private (Teacher/Admin)
router.put('/', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items array is required' });
    }

    const cleanedItems = items.map((item) => ({
      name: String(item.name || '').trim(),
      category: String(item.category || '').trim(),
      quantity: Math.max(0, Number(item.quantity) || 0),
      location: 'Bus',
      remarks: String(item.remarks || '').trim()
    })).filter((item) => item.name);

    if (cleanedItems.length === 0) {
      return res.status(400).json({ message: 'No valid items provided' });
    }

    const existing = await BusInventory.findOne({ key: 'bus-on-wheels' }).lean();
    const now = new Date();
    const historyEntry = existing ? {
      items: Array.isArray(existing.items) ? existing.items : [],
      updatedBy: existing.updatedBy || null,
      updatedByName: existing.updatedByName || '',
      updatedAt: existing.updatedAt || now
    } : null;

    const updateDoc = {
      $set: {
        items: cleanedItems,
        updatedBy: req.user._id,
        updatedByName: req.user.name || '',
        updatedAt: now
      }
    };
    if (historyEntry && historyEntry.items.length) {
      updateDoc.$push = { history: { $each: [historyEntry], $slice: -50 } };
    }

    const updated = await BusInventory.findOneAndUpdate(
      { key: 'bus-on-wheels' },
      updateDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    res.json({
      message: 'Bus inventory saved successfully',
      key: updated.key,
      items: updated.items,
      updatedByName: updated.updatedByName || '',
      updatedAt: updated.updatedAt || null
    });
  } catch (error) {
    console.error('Error saving bus inventory:', error);
    res.status(500).json({ message: 'Failed to save bus inventory' });
  }
});

module.exports = router;
