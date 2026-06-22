const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL,
    credentials: true,
  }
});

app.set('io', io);

// Bind Socket.io events
const setupBinlogSocket = require('./sockets/binlogSocket');
setupBinlogSocket(io);

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
  skip: (req) => req.originalUrl && req.originalUrl.includes('/binlog/events'),
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
const dbRoutes = require('./routes/dbRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/history', queryHistoryRoutes);
app.use('/api/slow-queries', slowQueryRoutes);
app.use('/api/users', userRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/db', dbRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error!', error: err.message });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`🚀 Server chal raha hai http://localhost:${PORT}`);
  await connectAppDB();
});