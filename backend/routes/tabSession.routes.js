const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { getTabSession, saveTabSession } = require('../controllers/userTabSessionController');

router.get('/:connectionId', protect, getTabSession);
router.post('/:connectionId', protect, saveTabSession);

module.exports = router;
