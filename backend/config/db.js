const mongoose = require('mongoose');
require('dotenv').config();

const connectAppDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ App MongoDB Connected!');
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
  }
};

module.exports = { connectAppDB };