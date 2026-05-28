const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const User = require('./models/User');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.error('Missing MongoDB URI. Set MONGODB_URI in attendance-final/.env');
  process.exit(1);
}

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('✅ Connected to MongoDB');

    try {
      const result = await User.updateMany(
        { role: 'student', isActive: false },
        { $set: { isActive: true } }
      );
      const updated = result.modifiedCount ?? result.nModified ?? 0;
      if (updated > 0) {
        console.log(`✅ Normalized ${updated} inactive student(s) to active`);
      }
    } catch (error) {
      console.error('⚠️ Failed to normalize student active status:', error);
    }
  })
  .catch(err => console.error('❌ MongoDB error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/marks', require('./routes/marks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/workReport', require('./routes/workReport'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/presentations', require('./routes/presentations'));
app.use('/api/bus-inventory', require('./routes/busInventory'));
app.use('/api/bus-service', require('./routes/busService'));
app.use('/api/csfi-project-bills', require('./routes/csfiProjectBills'));
app.use('/api/exam-plan', require('./routes/examPlan'));
app.use('/api/media-gallery', require('./routes/mediaGallery'));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
