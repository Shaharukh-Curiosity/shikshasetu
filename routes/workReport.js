const express = require('express');
const router = express.Router();
const WorkReport = require('../models/WorkReport');
const auth = require('../middleware/auth');

// @route   POST /api/workReport
// @desc    Submit a new daily work report
// @access  Private (Teachers only)
router.post('/', auth, async (req, res) => {
    try {
        const { date, region, batchNumber, subject, topicsCovered, assignment, attendanceCount } = req.body;

        // Validation
        if (!date || !region || !batchNumber || !subject || !topicsCovered || !assignment || attendanceCount === undefined) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (attendanceCount < 0) {
            return res.status(400).json({ error: 'Attendance count cannot be negative' });
        }

        // Check if report already exists for this date, teacher, region, batch
        const existingReport = await WorkReport.findOne({
            teacherId: req.userId,
            date: new Date(date),
            region,
            batchNumber
        });

        if (existingReport) {
            // Update existing report
            existingReport.subject = subject;
            existingReport.topicsCovered = topicsCovered;
            existingReport.assignment = assignment;
            existingReport.attendanceCount = attendanceCount;
            existingReport.updatedAt = new Date();

            await existingReport.save();
            return res.json({ message: 'Report updated successfully', report: existingReport });
        }

        // Create new report
        const workReport = new WorkReport({
            teacherId: req.userId,
            date: new Date(date),
            region,
            batchNumber,
            subject,
            topicsCovered,
            assignment,
            attendanceCount
        });

        await workReport.save();
        res.status(201).json({ message: 'Report submitted successfully', report: workReport });
    } catch (error) {
        console.error('❌ Error submitting work report:', error);
        res.status(500).json({ error: 'Error submitting report: ' + error.message });
    }
});

// @route   GET /api/workReport
// @desc    Get all work reports for logged-in teacher with filtering
// @access  Private (Teachers only)
router.get('/', auth, async (req, res) => {
    try {
        const { date, region, batchNumber } = req.query;

        // Build filter
        let filter = { teacherId: req.userId };

        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            filter.date = { $gte: startDate, $lt: endDate };
        }

        if (region) {
            filter.region = region;
        }

        if (batchNumber) {
            filter.batchNumber = batchNumber;
        }

        const reports = await WorkReport.find(filter)
            .sort({ date: -1 })
            .lean();

        res.json(reports);
    } catch (error) {
        console.error('❌ Error fetching work reports:', error);
        res.status(500).json({ error: 'Error fetching reports: ' + error.message });
    }
});

// @route   GET /api/workReport/:id
// @desc    Get a specific work report by ID
// @access  Private (Teachers only)
router.get('/:id', auth, async (req, res) => {
    try {
        const report = await WorkReport.findOne({
            _id: req.params.id,
            teacherId: req.userId
        });

        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(report);
    } catch (error) {
        console.error('❌ Error fetching work report:', error);
        res.status(500).json({ error: 'Error fetching report: ' + error.message });
    }
});

// @route   DELETE /api/workReport/:id
// @desc    Delete a work report
// @access  Private (Teachers only)
router.delete('/:id', auth, async (req, res) => {
    try {
        const report = await WorkReport.findOneAndDelete({
            _id: req.params.id,
            teacherId: req.userId
        });

        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('❌ Error deleting work report:', error);
        res.status(500).json({ error: 'Error deleting report: ' + error.message });
    }
});

module.exports = router;
