const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

// Public routes — koi bhi access kar sakta hai
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyLoginOtp);
router.post('/resend-otp', authController.resendLoginOtp);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

// Protected route — sirf logged in user
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);
router.put('/change-password', protect, authController.changePassword);
router.put('/preferences', protect, authController.updatePreferences);
router.post('/logout', protect, authController.logout);

module.exports = router;