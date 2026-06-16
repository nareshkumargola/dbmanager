const User = require('../models/userModel');
const bcrypt = require('bcryptjs');

// Saare users dekho — sirf admin
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')  // Password mat bhejo
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, users });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Single user dekho
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User nahi mila!' });
    }
    res.status(200).json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User ka role update karo
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const { id } = req.params;

    // Apna role khud mat badlo
    if (id === req.user.id) {
      return res.status(400).json({ 
        message: 'Apna role khud nahi badal sakte!' 
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User nahi mila!' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Role update ho gaya!',
      user 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// User delete karo
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Khud ko delete mat karo
    if (id === req.user.id) {
      return res.status(400).json({ 
        message: 'Khud ko delete nahi kar sakte!' 
      });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User nahi mila!' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'User delete ho gaya!' 
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};

// Naya user banao — sirf admin
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'Email already registered!' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password: hashed, role });

    res.status(201).json({
      success: true,
      message: 'User ban gaya!',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error', error: err.message });
  }
};