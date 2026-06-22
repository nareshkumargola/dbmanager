const express = require('express');
const router = express.Router();
const historyController = require('../controllers/queryHistoryController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

router.get('/', protect, historyController.getHistory);
router.get('/all', protect, historyController.getAllHistory);
router.get('/procedure-audit', protect, historyController.getProcedureAudits);
router.get('/today', protect, historyController.getTodayQueriesForConnection);
router.delete('/:id', protect, historyController.deleteHistory);
router.delete('/', protect, historyController.clearHistory);

module.exports = router;