const express = require('express');
const router = express.Router();
const historyController = require('../controllers/queryHistoryController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, historyController.getHistory);
router.delete('/:id', protect, historyController.deleteHistory);
router.delete('/', protect, historyController.clearHistory);

module.exports = router;