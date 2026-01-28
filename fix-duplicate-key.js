require('dotenv').config();
const mongoose = require('mongoose');
const Attendance = require('./models/Attendance');

async function fixDuplicateKeyError() {
  try {
    console.log('Connecting to MongoDB...');
    console.log('MongoDB URI:', process.env.MONGODB_URI || 'mongodb://localhost:27017/StudentData');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/StudentData', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });

    console.log('✓ Connected to MongoDB');

    // Get the collection
    const collection = mongoose.connection.collection('attendances');

    console.log('\n--- Current Indexes ---');
    const indexes = await collection.getIndexes();
    console.log(JSON.stringify(indexes, null, 2));

    // Drop the problematic index if it exists
    console.log('\n--- Dropping problematic indexes ---');
    let droppedCount = 0;
    for (const indexName of Object.keys(indexes)) {
      const indexSpec = indexes[indexName];
      if (indexName === '_id_') continue; // Skip default id index
      
      // Check if this is a problematic index
      if (indexName.includes('student') || 
          (indexSpec.key && (indexSpec.key.student || (indexSpec.key.student_1 && indexSpec.key.date_1)))) {
        console.log(`Dropping index: ${indexName}`, JSON.stringify(indexSpec));
        try {
          await collection.dropIndex(indexName);
          console.log('✓ Dropped');
          droppedCount++;
        } catch (err) {
          console.log(`Note: Could not drop ${indexName}:`, err.message);
        }
      }
    }
    
    if (droppedCount === 0) {
      console.log('No problematic indexes found to drop');
    }

    // Remove any documents with null or invalid student field
    console.log('\n--- Cleaning up invalid records ---');
    const result = await Attendance.deleteMany({
      $or: [
        { student: null },
        { student: { $exists: true, $eq: null } }
      ]
    });
    console.log(`✓ Deleted ${result.deletedCount} invalid records with null student field`);

    // Verify final indexes
    console.log('\n--- Final Indexes ---');
    const finalIndexes = await collection.getIndexes();
    console.log(JSON.stringify(finalIndexes, null, 2));

    console.log('\n✅ Fix complete!');
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

fixDuplicateKeyError();
