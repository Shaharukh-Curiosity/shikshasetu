const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const MediaGallery = require('../models/MediaGallery');
const { auth, isAdmin, isTeacherOrAdmin } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'media');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeBase = path
      .basename(file.originalname || 'media', ext)
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'media';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (_req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }
});

function toPublicUrl(filePath) {
  return `/uploads/media/${path.basename(filePath)}`;
}

router.get('/', auth, isTeacherOrAdmin, async (_req, res) => {
  try {
    const items = await MediaGallery.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(items.map((item) => ({
      ...item,
      fileUrl: toPublicUrl(item.filePath)
    })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to load media gallery', details: error.message });
  }
});

router.post('/', auth, isAdmin, upload.array('photos', 20), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ message: 'At least one photo is required' });
    }

    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();

    const created = await MediaGallery.insertMany(files.map((file) => ({
      title,
      description,
      originalName: file.originalname,
      fileName: file.filename,
      filePath: file.path,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: {
        userId: req.user?._id,
        name: req.user?.name || '',
        role: req.user?.role || ''
      }
    })));

    res.json({
      message: 'Media uploaded successfully',
      created: created.length,
      items: created.map((item) => ({
        ...item.toObject(),
        fileUrl: toPublicUrl(item.filePath)
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', details: error.message });
  }
});

router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const item = await MediaGallery.findById(req.params.id).lean();
    if (!item) {
      return res.status(404).json({ message: 'Media item not found' });
    }

    if (item.filePath && fs.existsSync(item.filePath)) {
      fs.unlinkSync(item.filePath);
    }

    await MediaGallery.deleteOne({ _id: req.params.id });
    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', details: error.message });
  }
});

module.exports = router;
