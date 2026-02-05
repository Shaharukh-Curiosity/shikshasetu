const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { auth, isAdmin, isTeacherOrAdmin } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

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
    await logAudit({
      req,
      action: 'user_add',
      entity: 'user',
      entityId: user._id?.toString(),
      after: { name: user.name, email: user.email, role: user.role }
    });
    res.json({ message: 'User added successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error adding user' });
  }
});

// Update user (name/email/password/role)
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const before = await User.findById(req.params.id).lean();
    const updates = {};

    if (name) updates.name = name;
    if (email) updates.email = email.toLowerCase();
    if (role) updates.role = role;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updates.password = hashedPassword;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAudit({
      req,
      action: 'user_update',
      entity: 'user',
      entityId: user._id?.toString(),
      before,
      after: { name: user.name, email: user.email, role: user.role }
    });

    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user' });
  }
});

// Reset user password (admin)
router.post('/:id/reset-password', auth, isAdmin, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ message: 'Password is required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logAudit({
      req,
      action: 'user_reset_password',
      entity: 'user',
      entityId: user._id?.toString(),
      after: { name: user.name, email: user.email }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password' });
  }
});

// Delete user
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const before = await User.findById(req.params.id).lean();
    await User.findByIdAndDelete(req.params.id);

    await logAudit({
      req,
      action: 'user_delete',
      entity: 'user',
      entityId: req.params.id,
      before
    });

    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
