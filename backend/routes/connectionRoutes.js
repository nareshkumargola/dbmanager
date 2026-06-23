const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const mysqlUserController = require('../controllers/mysqlUserController');
const { protect, adminOnly } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, connectionController.getConnections);
router.get('/all', protect, connectionController.getAllConnectionsAdmin);
router.post('/', protect, connectionController.createConnection);
router.post('/test', protect, connectionController.testConnectionRoute);
router.delete('/:id', protect, connectionController.deleteConnection);

// Database operations
router.get('/:id/objects', protect, connectionController.getDatabaseObjects);
router.get('/:id/table/:tableName', protect, connectionController.getTableData);
router.post('/:id/query', protect, connectionController.runQuery);
router.get('/:id/stats', protect, connectionController.getDatabaseStats);
router.get('/:id/databases', protect, connectionController.getDatabases);

// Sharing operations
router.get('/:id/share', protect, connectionController.getShareInfo);
router.put('/:id/share', protect, connectionController.updateShareInfo);

// Binlog monitoring
router.post('/:id/binlog/start', protect, connectionController.startBinlogMonitoring);
router.get('/:id/binlog/events', protect, connectionController.getBinlogEvents);
router.get('/:id/binlog/history', protect, connectionController.getBinlogHistory);
router.delete('/:id/binlog/history', protect, connectionController.clearBinlogHistory);

// MySQL user management
router.get('/:id/mysql-users', protect, mysqlUserController.listMySQLUsers);
router.get('/:id/mysql-users/:username/:host', protect, mysqlUserController.getMySQLUserPrivileges);
router.post('/:id/mysql-users', protect, mysqlUserController.createMySQLUser);
router.delete('/:id/mysql-users/:username/:host', protect, mysqlUserController.deleteMySQLUser);
router.put('/:id/mysql-users/:username/:host/password', protect, mysqlUserController.updateMySQLUserPassword);
router.put('/:id/mysql-users/:username/:host/privileges', protect, mysqlUserController.updateMySQLUserPrivileges);

module.exports = router;