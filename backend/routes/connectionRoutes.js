const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const mysqlUserController = require('../controllers/mysqlUserController');
const mongoUserController = require('../controllers/mongoUserController');
const pgUserController = require('../controllers/pgUserController');
const { protect, adminOnly, checkPermission } = require('../middlewares/authMiddleware');

// Saare routes protected
router.get('/', protect, connectionController.getConnections);
router.get('/all', protect, adminOnly, connectionController.getAllConnectionsAdmin);
router.post('/', protect, checkPermission('connections'), connectionController.createConnection);
router.post('/test', protect, checkPermission('connections'), connectionController.testConnectionRoute);
router.delete('/:id', protect, checkPermission('connections'), connectionController.deleteConnection);

// Database operations
router.get('/:id/objects', protect, checkPermission('query'), connectionController.getDatabaseObjects);
router.get('/:id/table/:tableName', protect, checkPermission('query'), connectionController.getTableData);
router.post('/:id/query', protect, checkPermission('query'), connectionController.runQuery);
router.get('/:id/stats', protect, checkPermission('query'), connectionController.getDatabaseStats);
router.get('/:id/databases', protect, checkPermission('query'), connectionController.getDatabases);

// Sharing operations
router.get('/:id/share', protect, checkPermission('connections'), connectionController.getShareInfo);
router.put('/:id/share', protect, checkPermission('connections'), connectionController.updateShareInfo);

// Binlog monitoring
router.post('/:id/binlog/start', protect, checkPermission('binlog'), connectionController.startBinlogMonitoring);
router.get('/:id/binlog/events', protect, checkPermission('binlog'), connectionController.getBinlogEvents);
router.get('/:id/binlog/history', protect, checkPermission('binlog'), connectionController.getBinlogHistory);
router.delete('/:id/binlog/history', protect, checkPermission('binlog'), connectionController.clearBinlogHistory);

// MySQL user management
router.get('/:id/mysql-users', protect, mysqlUserController.listMySQLUsers);
router.get('/:id/mysql-users/:username/:host', protect, mysqlUserController.getMySQLUserPrivileges);
router.post('/:id/mysql-users', protect, mysqlUserController.createMySQLUser);
router.delete('/:id/mysql-users/:username/:host', protect, mysqlUserController.deleteMySQLUser);
router.put('/:id/mysql-users/:username/:host/password', protect, mysqlUserController.updateMySQLUserPassword);
router.put('/:id/mysql-users/:username/:host/privileges', protect, mysqlUserController.updateMySQLUserPrivileges);

// MongoDB user management
router.get('/:id/mongo-users', protect, mongoUserController.listMongoUsers);
router.post('/:id/mongo-users', protect, mongoUserController.createMongoUser);
router.delete('/:id/mongo-users/:username/:dbName', protect, mongoUserController.deleteMongoUser);
router.put('/:id/mongo-users/:username/:dbName/password', protect, mongoUserController.updateMongoUserPassword);
router.put('/:id/mongo-users/:username/:dbName/roles', protect, mongoUserController.updateMongoUserRoles);

// PostgreSQL user management
router.get('/:id/pg-users', protect, pgUserController.listPGUsers);
router.post('/:id/pg-users', protect, pgUserController.createPGUser);
router.delete('/:id/pg-users/:username', protect, pgUserController.deletePGUser);
router.put('/:id/pg-users/:username/password', protect, pgUserController.updatePGUserPassword);
router.put('/:id/pg-users/:username/roles', protect, pgUserController.updatePGUserRoles);

// Shared audit logs
router.get('/:id/audit-logs', protect, checkPermission('auditLogs'), connectionController.getConnectionAuditLogs);

module.exports = router;