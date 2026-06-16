const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const { protect } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, connectionController.getConnections);
router.post('/', protect, connectionController.createConnection);
router.post('/test', protect, connectionController.testConnectionRoute);
router.delete('/:id', protect, connectionController.deleteConnection);

// Database operations
router.get('/:id/objects', protect, connectionController.getDatabaseObjects);
router.get('/:id/table/:tableName', protect, connectionController.getTableData);
router.post('/:id/query', protect, connectionController.runQuery);
router.get('/:id/stats', protect, connectionController.getDatabaseStats);
router.get('/:id/databases', protect, connectionController.getDatabases);
module.exports = router;