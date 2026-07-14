const express = require('express');
const router = express.Router();
const dbController = require('../controllers/dbController');
const { protect, checkPermission } = require('../middlewares/authMiddleware');

// ─── MYSQL ROUTES ─────────────────────────────────
router.get('/mysql/tables', protect, checkPermission('query'), dbController.getMysqlTables);
router.get('/mysql/table/:tableName', protect, checkPermission('query'), dbController.getMysqlTableData);
router.post('/mysql/query', protect, checkPermission('query'), dbController.runMysqlQuery);
router.get('/mysql/stats', protect, checkPermission('query'), dbController.getMysqlStats);

// ─── MONGODB ROUTES ───────────────────────────────
router.get('/mongo/collections', protect, checkPermission('query'), dbController.getMongoCollections);
router.get('/mongo/collection/:collectionName', protect, checkPermission('query'), dbController.getMongoCollectionData);
router.get('/mongo/stats', protect, checkPermission('query'), dbController.getMongoStats);

// ─── POSTGRESQL ROUTES ────────────────────────────
router.get('/pg/tables', protect, checkPermission('query'), dbController.getPostgresTables);
router.get('/pg/table/:tableName', protect, checkPermission('query'), dbController.getPostgresTableData);
router.post('/pg/query', protect, checkPermission('query'), dbController.runPostgresQuery);
router.get('/pg/stats', protect, checkPermission('query'), dbController.getPostgresStats);

module.exports = router;