const express = require('express');
const router = express.Router();
const monitorController = require('../controllers/monitorController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/:id', protect, monitorController.getMonitoringData);
router.get('/:id/history', protect, monitorController.getMonitoringHistory);
router.get('/:id/tables', protect, monitorController.getTableDetails);

module.exports = router;