const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { protect } = require('../middlewares/authMiddleware');

// Get all system audit logs (Admin Only)
router.get('/', protect, auditLogController.getSystemAuditLogs);

module.exports = router;
