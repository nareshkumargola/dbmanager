const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, userController.getAllUsers);
router.get('/:id', protect, userController.getUserById);
router.post('/', protect, userController.createUser);
router.put('/:id/role', protect, userController.updateUserRole);
router.delete('/:id', protect, userController.deleteUser);

module.exports = router;