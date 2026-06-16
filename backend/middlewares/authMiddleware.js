const jwt = require('jsonwebtoken');
require('dotenv').config();

// Login check
exports.protect = (req, res, next) => {
  let token;

  // Header se token lo
  if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Login karo pehle!' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Token invalid ya expire ho gaya!' });
  }
};

// Role check
exports.adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      message: 'Sirf admin kar sakta hai yeh kaam!' 
    });
  }
  next();
};