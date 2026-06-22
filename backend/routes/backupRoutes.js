const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

// Backup routes protected
router.get('/info', protect, backupController.getBackupInfo);
router.get('/download', protect, backupController.takeBackup);
router.post('/restore', protect, upload.single('sqlFile'), backupController.restoreBackup);

module.exports = router;