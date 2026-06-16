const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// Public routes — koi bhi access kar sakta hai
router.post('/signup', authController.signup);
router.post('/login', authController.login);

// Protected route — sirf logged in user
router.get('/profile', protect, authController.getProfile);

module.exports = router;