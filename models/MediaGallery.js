const mongoose = require('mongoose');

const mediaGallerySchema = new mongoose.Schema({
  title: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  originalName: { type: String, required: true },
  fileName: { type: String, required: true, unique: true },
  filePath: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, default: '' },
    role: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('MediaGallery', mediaGallerySchema);
