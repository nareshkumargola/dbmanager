const express = require('express');
const router = express.Router();
const monitorController = require('../controllers/monitorController');
const { protect, checkPermission } = require('../middlewares/authMiddleware');

router.get('/:id', protect, checkPermission('monitor'), monitorController.getMonitoringData);
router.get('/:id/history', protect, checkPermission('monitor'), monitorController.getMonitoringHistory);
router.get('/:id/tables', protect, checkPermission('monitor'), monitorController.getTableDetails);

router.get('/:id/alerts', protect, checkPermission('monitor'), monitorController.getConnectionAlerts);
router.post('/:id/alerts/:alertId/resolve', protect, checkPermission('monitor'), monitorController.resolveAlert);
router.put('/:id/alert-settings', protect, checkPermission('monitor'), monitorController.updateAlertSettings);

module.exports = router;