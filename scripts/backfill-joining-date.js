const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');

function toDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function getBackupStudents(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.students)) return payload.students;
  if (Array.isArray(payload.data)) {
    return payload.data.filter((item) => item && (item.role === 'student' || item.schoolName || item.batchNumber));
  }
  return [];
}

function buildBackupMaps(students) {
  const byId = new Map();
  const byMobile = new Map();
  const byComposite = new Map();

  students.forEach((student) => {
    const id = String(student._id || '').trim();
    const mobile = String(student.mobile || '').trim();
    const composite = [
      String(student.name || '').trim().toLowerCase(),
      String(student.schoolName || '').trim().toLowerCase(),
      String(student.batchNumber || '').trim().toLowerCase()
    ].join('|');

    if (id) byId.set(id, student);
    if (mobile) byMobile.set(mobile, student);
    if (composite !== '||') byComposite.set(composite, student);
  });

  return { byId, byMobile, byComposite };
}

function findBackupStudent(student, maps) {
  const id = String(student._id || '').trim();
  const mobile = String(student.mobile || '').trim();
  const composite = [
    String(student.name || '').trim().toLowerCase(),
    String(student.schoolName || '').trim().toLowerCase(),
    String(student.batchNumber || '').trim().toLowerCase()
  ].join('|');

  return maps.byId.get(id) || maps.byMobile.get(mobile) || maps.byComposite.get(composite) || null;
}

function resolveJoiningDate(student, backupStudent) {
  const backupDate = backupStudent
    ? toDateOnly(backupStudent.joiningDate || backupStudent.dateOfJoining || backupStudent.enrollmentDate || backupStudent.createdAt)
    : '';
  if (backupDate) return backupDate;
  return toDateOnly(student.joiningDate || student.createdAt);
}

function parseArgs(argv) {
  const args = { backup: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--backup') {
      args.backup = argv[i + 1] || '';
      i += 1;
    } else if (value === '--dry-run') {
      args.dryRun = true;
    }
  }
  return args;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Missing MongoDB URI. Set MONGODB_URI in attendance-final/.env');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const backupPath = args.backup ? path.resolve(process.cwd(), args.backup) : '';
  let backupMaps = { byId: new Map(), byMobile: new Map(), byComposite: new Map() };

  if (backupPath) {
    if (!fs.existsSync(backupPath)) {
      console.error(`Backup file not found: ${backupPath}`);
      process.exit(1);
    }
    const payload = readJsonFile(backupPath);
    const backupStudents = getBackupStudents(payload);
    backupMaps = buildBackupMaps(backupStudents);
    console.log(`Loaded ${backupStudents.length} student row(s) from backup.`);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    const students = await User.find({
      role: 'student',
      $or: [
        { joiningDate: { $exists: false } },
        { joiningDate: null },
        { joiningDate: '' }
      ]
    })
      .select('_id name schoolName batchNumber mobile createdAt joiningDate')
      .lean();

    let matchedFromBackup = 0;
    let fromCreatedAt = 0;
    let updated = 0;

    for (const student of students) {
      const backupStudent = backupPath ? findBackupStudent(student, backupMaps) : null;
      const joiningDate = resolveJoiningDate(student, backupStudent);
      if (!joiningDate) continue;

      if (backupStudent) matchedFromBackup += 1;
      else fromCreatedAt += 1;

      console.log(
        `${args.dryRun ? '[dry-run] ' : ''}${student.name || student._id}: ${joiningDate}` +
        (backupStudent ? ' (from backup)' : ' (from createdAt)')
      );

      if (!args.dryRun) {
        await User.updateOne(
          { _id: student._id },
          { $set: { joiningDate } }
        );
        updated += 1;
      }
    }

    console.log('');
    console.log(`Students scanned: ${students.length}`);
    console.log(`Matched from backup: ${matchedFromBackup}`);
    console.log(`Filled from createdAt: ${fromCreatedAt}`);
    console.log(`Updated: ${args.dryRun ? 0 : updated}`);
    if (args.dryRun) {
      console.log('Dry run complete. Re-run without --dry-run to write changes.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
