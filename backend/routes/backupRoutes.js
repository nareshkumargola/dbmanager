const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backupController');
const { protect, adminOnly, checkPermission } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

// Backup routes protected
router.get('/info', protect, checkPermission('backup'), backupController.getBackupInfo);
router.get('/download', protect, checkPermission('backup'), backupController.takeBackup);
router.post('/download', protect, checkPermission('backup'), backupController.takeBackup);
router.post('/restore', protect, checkPermission('backup'), upload.single('sqlFile'), backupController.restoreBackup);

module.exports = router;