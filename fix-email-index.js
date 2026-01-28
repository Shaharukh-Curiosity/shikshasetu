require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function cleanupDuplicateEmails() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/StudentData');
    console.log('✓ Connected to MongoDB');

    // Get the collection
    const collection = mongoose.connection.collection('users');

    // Check current indexes
    console.log('\n--- Current Indexes ---');
    const indexes = await collection.getIndexes();
    console.log(JSON.stringify(indexes, null, 2));

    // Drop the email unique index if it exists and has issues
    console.log('\n--- Handling email index ---');
    for (const indexName of Object.keys(indexes)) {
      if (indexName.includes('email')) {
        console.log(`Found email index: ${indexName}`, JSON.stringify(indexes[indexName]));
        try {
          await collection.dropIndex(indexName);
          console.log('✓ Dropped email index');
        } catch (err) {
          console.log(`Note: Could not drop ${indexName}:`, err.message);
        }
      }
    }

    // Set empty/null emails to undefined to avoid unique constraint issues
    console.log('\n--- Cleaning up null/empty emails ---');
    const result = await User.updateMany(
      { email: { $in: [null, '', undefined] } },
      { $unset: { email: 1 } }
    );
    console.log(`✓ Updated ${result.modifiedCount} records`);

    console.log('\n✅ Cleanup complete!');
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

cleanupDuplicateEmails();
