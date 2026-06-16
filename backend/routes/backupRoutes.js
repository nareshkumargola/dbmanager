const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

// Sirf admin backup le sakta hai
router.get('/info', protect, backupController.getBackupInfo);
router.get('/download', protect, adminOnly, backupController.takeBackup);
router.post('/restore', protect, adminOnly, upload.single('sqlFile'), backupController.restoreBackup);

module.exports = router;