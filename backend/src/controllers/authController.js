const User = require('../models/User');
const jwt = require('jsonwebtoken');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

const normalizeEmail = (email) => (
  typeof email === 'string' ? email.trim().toLowerCase() : ''
);

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = normalizeEmail(email);
    const rawPassword = typeof password === 'string' ? password : '';

    if (!trimmedName || !trimmedEmail || !rawPassword) {
      return res.status(400).json({
        message: 'Name, email, and password are required'
      });
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      return res.status(400).json({
        message: 'Enter a valid email address'
      });
    }

    if (rawPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters'
      });
    }

    const userExists = await User.findOne({ email: trimmedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({ name: trimmedName, email: trimmedEmail, password: rawPassword });
    await user.save();

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      token: generateToken(user._id)
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }

    if (error.code === 11000) {
      return res.status(400).json({ message: 'User already exists' });
    }

    console.log(error);
    res.status(500).json({ message: 'Unable to register. Try again later.' });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const trimmedEmail = normalizeEmail(email);
    const rawPassword = typeof password === 'string' ? password : '';

    if (!trimmedEmail || !rawPassword) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: trimmedEmail });

    if (user && (await user.matchPassword(rawPassword))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Unable to sign in. Try again later.' });
  }
};

module.exports = { registerUser, loginUser };
