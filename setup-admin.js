const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config();

const User = require('./models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  try {
    console.log('\n🎓 Setup Admin Account\n');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const name = await question('Admin name: ');
    const email = await question('Admin email: ');
    const password = await question('Admin password: ');
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const admin = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: 'admin'
    });
    
    await admin.save();
    
    console.log('\n✅ Admin created successfully!');
    console.log('Email:', email);
    console.log('\nYou can now login at http://localhost:3000\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setup();
