const express = require('express');
const router = express.Router();
const savedQueryController = require('../controllers/savedQueryController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', savedQueryController.getSavedQueries);
router.post('/', savedQueryController.createSavedQuery);
router.put('/:id', savedQueryController.updateSavedQuery);
router.delete('/:id', savedQueryController.deleteSavedQuery);

module.exports = router;
