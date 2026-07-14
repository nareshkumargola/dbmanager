const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload folder banao
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `restore_${Date.now()}${ext}`);
  },
});

// Allow .sql and .json files
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.sql' || ext === '.json') {
    cb(null, true);
  } else {
    cb(new Error('Only .sql and .json files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB
});

module.exports = upload;