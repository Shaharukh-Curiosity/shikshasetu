const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('Missing MongoDB URI');
  }

  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.collection('users');
  const indexes = await collection.indexes();

  const mobileIndexes = indexes.filter((index) => {
    if (!index.unique) return false;
    const key = index.key || {};
    return Object.keys(key).length === 1 && key.mobile === 1;
  });

  if (mobileIndexes.length === 0) {
    console.log('No unique mobile index found on users collection.');
    return;
  }

  for (const index of mobileIndexes) {
    console.log(`Dropping index: ${index.name}`);
    await collection.dropIndex(index.name);
  }

  console.log(`Removed ${mobileIndexes.length} unique mobile index(es).`);
}

main()
  .catch((error) => {
    console.error('Failed to remove mobile unique index:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
