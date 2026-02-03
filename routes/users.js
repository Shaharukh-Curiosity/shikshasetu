const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, isAdmin, isTeacherOrAdmin } = require('../middleware/auth');

// Get teachers (for teacher/admin dropdowns)
router.get('/teachers', auth, isTeacherOrAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: 'teacher' }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (teachers/admins)
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ['teacher', 'admin'] }
    }).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add user
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role
    });
    
    await user.save();
    res.json({ message: 'User added successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error adding user' });
  }
});

// Delete user
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
