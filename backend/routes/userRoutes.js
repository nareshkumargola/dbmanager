const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, adminOnly, userController.getAllUsers);
router.get('/:id', protect, adminOnly, userController.getUserById);
router.post('/', protect, adminOnly, userController.createUser);
router.put('/:id/role', protect, adminOnly, userController.updateUserRole);
router.put('/:id/permissions', protect, adminOnly, userController.updateUserPermissions);
router.delete('/:id', protect, adminOnly, userController.deleteUser);

module.exports = router;