const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, adminOnly, checkPermission } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, checkPermission('userManagement'), userController.getAllUsers);
router.get('/:id', protect, checkPermission('userManagement'), userController.getUserById);
router.post('/', protect, adminOnly, userController.createUser);
router.put('/:id', protect, adminOnly, userController.updateUser);
router.put('/:id/role', protect, adminOnly, userController.updateUserRole);
router.put('/:id/permissions', protect, adminOnly, userController.updateUserPermissions);
router.delete('/:id', protect, adminOnly, userController.deleteUser);

module.exports = router;