const express = require('express');
const router = express.Router();
const dbController = require('../controllers/dbController');
const { protect } = require('../middlewares/authMiddleware');

// ─── MYSQL ROUTES ─────────────────────────────────
router.get('/mysql/tables', protect, dbController.getMysqlTables);
router.get('/mysql/table/:tableName', protect, dbController.getMysqlTableData);
router.post('/mysql/query', protect, dbController.runMysqlQuery);
router.get('/mysql/stats', protect, dbController.getMysqlStats);

// ─── MONGODB ROUTES ───────────────────────────────
router.get('/mongo/collections', protect, dbController.getMongoCollections);
router.get('/mongo/collection/:collectionName', protect, dbController.getMongoCollectionData);
router.get('/mongo/stats', protect, dbController.getMongoStats);

module.exports = router;