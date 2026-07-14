const express = require('express');
const router = express.Router();
const historyController = require('../controllers/queryHistoryController');
const { protect, adminOnly, checkPermission } = require('../middlewares/authMiddleware');

router.get('/', protect, checkPermission('history'), historyController.getHistory);
router.get('/all', protect, checkPermission('history'), historyController.getAllHistory);
router.get('/procedure-audit', protect, checkPermission('history'), historyController.getProcedureAudits);
router.get('/today', protect, checkPermission('history'), historyController.getTodayQueriesForConnection);
router.delete('/:id', protect, checkPermission('history'), historyController.deleteHistory);
router.delete('/', protect, checkPermission('history'), historyController.clearHistory);

module.exports = router;