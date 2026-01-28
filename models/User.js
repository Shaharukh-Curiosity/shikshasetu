const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, lowercase: true, sparse: true },
  password: String,
  role: { type: String, enum: ['student', 'teacher', 'admin'], required: true },
  
  // Student fields
  schoolName: String,
  batchNumber: String,
  mobile: String,
  age: Number,
  standard: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
