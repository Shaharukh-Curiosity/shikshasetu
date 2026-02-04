const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { auth, isAdmin } = require('../middleware/auth');

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
    const total = await User.countDocuments({ role: 'student' });
    const active = await User.countDocuments({ role: 'student', isActive: true });

    res.json({ total, active, inactive: total - active });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
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

// ⚠️ GENERAL ROUTES LAST (generic routes)
// Get all students
router.get('/', auth, async (req, res) => {
  try {
    const { region, schoolName, batchNumber } = req.query;
    let query = { role: 'student', isActive: true };
    
    if (region) query.region = region;
    if (schoolName) query.schoolName = schoolName;
    if (batchNumber) query.batchNumber = batchNumber;
    
    const students = await User.find(query).sort({ name: 1 });
    res.json(students);
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

    const student = new User({
      ...req.body,
      role: 'student',
      isActive: true
    });
    
    await student.save();
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

// Delete student
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get stats
router.get('/stats/dashboard', auth, async (req, res) => {
  try {
    const total = await User.countDocuments({ role: 'student' });
    const active = await User.countDocuments({ role: 'student', isActive: true });

    res.json({ total, active, inactive: total - active });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
