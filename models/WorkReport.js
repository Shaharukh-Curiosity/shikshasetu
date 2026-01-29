const mongoose = require('mongoose');

const WorkReportSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    region: {
        type: String,
        required: true
    },
    batchNumber: {
        type: String,
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    topicsCovered: {
        type: String,
        required: true,
        trim: true
    },
    assignment: {
        type: String,
        required: true,
        trim: true
    },
    attendanceCount: {
        type: Number,
        required: true,
        min: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index for efficient querying
WorkReportSchema.index({ teacherId: 1, date: 1 });
WorkReportSchema.index({ region: 1, batchNumber: 1, date: 1 });

module.exports = mongoose.model('WorkReport', WorkReportSchema);
