const mysqldump = require('mysqldump');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Backup folder banao agar nahi hai
const backupDir = path.join(__dirname, '../backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
}

const createBackup = async () => {
  const fileName = `backup_${Date.now()}.sql`;
  const filePath = path.join(backupDir, fileName);

  await mysqldump({
    connection: {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
    },
    dumpToFile: filePath,
  });

  return { fileName, filePath };
};

module.exports = { createBackup, backupDir };