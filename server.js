require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_me';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const usersDB = new Datastore({ filename: path.join(dataDir, 'users.db'), autoload: true });
const postsDB = new Datastore({ filename: path.join(dataDir, 'posts.db'), autoload: true });
const messagesDB = new Datastore({ filename: path.join(dataDir, 'messages.db'), autoload: true });

// ================== Helpers ==================
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ================== Routes ==================
// Register
app.post('/api/register', async (req, res) => {
  const { username, email, password, yearOfStudy, profilePic } = req.body;
  console.log('Register attempt:', username, email, yearOfStudy);
  if (!username || !email || !password || !yearOfStudy) {
    return res.status(400).json({ error: 'All fields are mandatory' });
  }
  // Check existing
  usersDB.findOne({ email }, (err, existingEmail) => {
    if (existingEmail) return res.status(400).json({ error: 'Email already taken' });
    usersDB.findOne({ username }, (err, existingUser) => {
      if (existingUser) return res.status(400).json({ error: 'Username already taken' });
      const hashed = bcrypt.hashSync(password, 10);
      const user = {
        username,
        email,
        password: hashed,
        yearOfStudy,
        profilePic: profilePic || '',
        bio: '',
        location: '',
        interests: '',
        isOnline: true,
        lastSeen: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };
      usersDB.insert(user, (err, newUser) => {
        if (err) {
          console.error('Insert error:', err);
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
        const { password, ...userData } = newUser;
        res.status(201).json({ token, user: userData });
      });
    });
  });
});

// Login (similar, but keep it short)
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  usersDB.findOne({ email }, (err, user) => {
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    usersDB.update({ _id: user._id }, { $set: { isOnline: true, lastSeen: new Date().toISOString() } }, {}, () => {});
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: pwd, ...userData } = user;
    res.json({ token, user: userData });
  });
});

// ... (all other routes unchanged – keep from previous version)

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
