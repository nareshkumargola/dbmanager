const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/dbmanager';

// Same rule as server.js: the Docker host name "mongodb" falls back to the local database
module.exports = async () => {
  const uri = process.env.MONGODB_URI || LOCAL_URI;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
  } catch (err) {
    if (!uri.includes('mongodb:27017')) throw err;
    await mongoose.connect(LOCAL_URI, { serverSelectionTimeoutMS: 3000 });
  }
};
