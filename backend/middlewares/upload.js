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
    cb(null, `restore_${Date.now()}.sql`);
  },
});

// Sirf .sql files allow karo
const fileFilter = (req, file, cb) => {
  if (path.extname(file.originalname) === '.sql') {
    cb(null, true);
  } else {
    cb(new Error('Sirf .sql files allowed hain!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB
});

module.exports = upload;