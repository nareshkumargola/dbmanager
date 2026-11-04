const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const mfaController = require('../controllers/mfaController');
const { protect } = require('../middlewares/authMiddleware');
const { credentialLimiter, passwordResetLimiter } = require('../middlewares/rateLimiters');

// Public routes — koi bhi access kar sakta hai
router.post('/login', credentialLimiter, authController.login);
router.post('/mfa/verify', credentialLimiter, mfaController.verifyLogin);
router.post('/mfa/login-setup', credentialLimiter, mfaController.startLoginSetup);
router.post('/mfa/login-enable', credentialLimiter, mfaController.finishLoginSetup);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, authController.resetPassword);

// Protected route — sirf logged in user
router.get('/profile', protect, authController.getProfile);
router.put('/profile', protect, authController.updateProfile);
router.put('/change-password', protect, authController.changePassword);
router.put('/preferences', protect, authController.updatePreferences);
router.post('/logout', protect, authController.logout);

// Two-step sign-in settings for the signed-in user
router.get('/mfa', protect, mfaController.getStatus);
router.post('/mfa/setup', protect, credentialLimiter, mfaController.startSetup);
router.post('/mfa/enable', protect, credentialLimiter, mfaController.confirmSetup);
router.post('/mfa/disable', protect, credentialLimiter, mfaController.disable);
router.post('/mfa/backup-codes', protect, credentialLimiter, mfaController.regenerateBackupCodes);

module.exports = router;