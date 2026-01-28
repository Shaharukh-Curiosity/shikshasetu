const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    // Create a test teacher account
    const password = 'teacher123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if teacher already exists
    let teacher = await User.findOne({ email: 'teacher@test.com' });
    
    if (!teacher) {
      teacher = new User({
        name: 'Test Teacher',
        email: 'teacher@test.com',
        password: hashedPassword,
        role: 'teacher',
        isActive: true
      });
      await teacher.save();
      console.log('✅ Created teacher account:');
    } else {
      teacher.password = hashedPassword;
      teacher.role = 'teacher';
      await teacher.save();
      console.log('✅ Updated teacher account:');
    }
    
    console.log('   Email: teacher@test.com');
    console.log('   Password: teacher123');
    console.log('   Role: teacher');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}).catch(err => {
  console.error('❌ MongoDB Error:', err.message);
  process.exit(1);
});
