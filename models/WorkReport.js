const mongoose = require('mongoose');

const WorkReportSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    teacherName: {
        type: String,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    region: {
        type: String,
        default: ''
    },
    batchNumber: {
        type: String,
        default: ''
    },
    subject: {
        type: String,
        trim: true,
        default: 'Daily Work'
    },
    topicsCovered: {
        type: String,
        required: true,
        trim: true
    },
    assignment: {
        type: String,
        trim: true,
        default: ''
    },
    attendanceCount: {
        type: Number,
        min: 0,
        default: 0
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
