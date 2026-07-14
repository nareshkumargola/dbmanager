const express = require('express');
const router = express.Router();
const slowQueryController = require('../controllers/slowQueryController');
const { protect, checkPermission } = require('../middlewares/authMiddleware');

router.get('/', protect, checkPermission('slowQuery'), slowQueryController.getSlowQueries);
router.delete('/:id', protect, checkPermission('slowQuery'), slowQueryController.deleteSlowQuery);
router.delete('/', protect, checkPermission('slowQuery'), slowQueryController.clearSlowQueries);

module.exports = router;