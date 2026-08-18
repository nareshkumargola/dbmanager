const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/authMiddleware');
const { getTabSession, saveTabSession } = require('../controllers/userTabSessionController');

router.get('/:connectionId', auth, getTabSession);
router.post('/:connectionId', auth, saveTabSession);

module.exports = router;
