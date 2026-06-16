const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Bahut zyada requests!',
});
app.use('/api', limiter);

// Sirf app ka MongoDB connect karo — users, history etc ke liye
const connectAppDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ App MongoDB Connected!');
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
  }
};

// Routes — sirf zaroori wale
const authRoutes = require('./routes/authRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const queryHistoryRoutes = require('./routes/queryHistoryRoutes');
const slowQueryRoutes = require('./routes/slowQueryRoutes');
const userRoutes = require('./routes/userRoutes');
const monitorRoutes = require('./routes/monitorRoutes');
const backupRoutes = require('./routes/backupRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/history', queryHistoryRoutes);
app.use('/api/slow-queries', slowQueryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/backup', backupRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error!', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 Server chal raha hai http://localhost:${PORT}`);
  await connectAppDB();
});