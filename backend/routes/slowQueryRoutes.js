const express = require('express');
const router = express.Router();
const slowQueryController = require('../controllers/slowQueryController');
const { protect } = require('../middlewares/authMiddleware');

router.get('/', protect, slowQueryController.getSlowQueries);
router.delete('/:id', protect, slowQueryController.deleteSlowQuery);
router.delete('/', protect, slowQueryController.clearSlowQueries);

module.exports = router;