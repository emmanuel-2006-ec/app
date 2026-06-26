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

// ================== Databases ==================
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
  // Check existing
  usersDB.find({ $or: [{ email }, { username }] }, (err, docs) => {
    if (docs.length) return res.status(400).json({ error: 'Email or username already taken' });
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
      if (err) return res.status(500).json({ error: err.message });
      const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
      const { password, ...userData } = newUser;
      res.status(201).json({ token, user: userData });
    });
  });
});

// Login
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

// Logout
app.post('/api/logout', authenticate, (req, res) => {
  usersDB.update({ _id: req.userId }, { $set: { isOnline: false, lastSeen: new Date().toISOString() } }, {}, () => {});
  res.json({ message: 'Logged out' });
});

// Get all users (except self)
app.get('/api/users', authenticate, (req, res) => {
  usersDB.find({ _id: { $ne: req.userId } }, (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(users.map(u => { const { password, ...rest } = u; return rest; }));
  });
});

// Get online users
app.get('/api/users/online', authenticate, (req, res) => {
  usersDB.find({ _id: { $ne: req.userId }, isOnline: true }, (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(users.map(u => { const { password, ...rest } = u; return rest; }));
  });
});

// Update profile
app.put('/api/profile', authenticate, (req, res) => {
  const { username, bio, location, interests } = req.body;
  usersDB.update({ _id: req.userId }, { $set: { username, bio, location, interests } }, {}, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    usersDB.findOne({ _id: req.userId }, (err, user) => {
      const { password, ...userData } = user;
      res.json(userData);
    });
  });
});

// ===== Posts =====
app.get('/api/posts', authenticate, (req, res) => {
  postsDB.find({}).sort({ createdAt: -1 }).exec((err, posts) => {
    if (err) return res.status(500).json({ error: err.message });
    // Populate author info manually
    const populate = async () => {
      const populated = await Promise.all(posts.map(async (post) => {
        const author = await new Promise((resolve, reject) => {
          usersDB.findOne({ _id: post.author }, (err, u) => {
            if (err) reject(err);
            else resolve(u);
          });
        });
        if (author) {
          post.author = { _id: author._id, username: author.username, profilePic: author.profilePic, yearOfStudy: author.yearOfStudy };
        }
        // Populate comments user info
        if (post.comments) {
          const commentUsers = await Promise.all(post.comments.map(async (c) => {
            if (c.user) {
              const user = await new Promise((resolve, reject) => {
                usersDB.findOne({ _id: c.user }, (err, u) => {
                  if (err) reject(err);
                  else resolve(u);
                });
              });
              if (user) {
                c.username = user.username;
                c.profilePic = user.profilePic;
              }
            }
            return c;
          }));
          post.comments = commentUsers;
        }
        return post;
      }));
      res.json(populated);
    };
    populate().catch(err => res.status(500).json({ error: err.message }));
  });
});

app.post('/api/posts', authenticate, (req, res) => {
  const { content, type, stickerType, audioUrl, videoUrl, audioDuration } = req.body;
  const post = {
    author: req.userId,
    content: content || '',
    type: type || 'text',
    stickerType: stickerType || null,
    audioUrl: audioUrl || null,
    videoUrl: videoUrl || null,
    audioDuration: audioDuration || '0:05',
    likes: [],
    comments: [],
    createdAt: new Date().toISOString()
  };
  postsDB.insert(post, (err, newPost) => {
    if (err) return res.status(500).json({ error: err.message });
    // Fetch author
    usersDB.findOne({ _id: newPost.author }, (err, author) => {
      if (author) newPost.author = { _id: author._id, username: author.username, profilePic: author.profilePic, yearOfStudy: author.yearOfStudy };
      res.status(201).json(newPost);
    });
  });
});

app.post('/api/posts/:postId/like', authenticate, (req, res) => {
  const { postId } = req.params;
  postsDB.findOne({ _id: postId }, (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const idx = post.likes.indexOf(req.userId);
    if (idx > -1) post.likes.splice(idx, 1);
    else post.likes.push(req.userId);
    postsDB.update({ _id: postId }, { $set: { likes: post.likes } }, {}, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ likes: post.likes });
    });
  });
});

app.post('/api/posts/:postId/comment', authenticate, (req, res) => {
  const { postId } = req.params;
  const { text } = req.body;
  postsDB.findOne({ _id: postId }, (err, post) => {
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const comment = {
      user: req.userId,
      text,
      username: '',  // will populate on GET
      profilePic: '',
      createdAt: new Date().toISOString()
    };
    // Get user info
    usersDB.findOne({ _id: req.userId }, (err, user) => {
      if (user) {
        comment.username = user.username;
        comment.profilePic = user.profilePic;
      }
      post.comments.push(comment);
      postsDB.update({ _id: postId }, { $set: { comments: post.comments } }, {}, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ comments: post.comments });
      });
    });
  });
});

// ===== Messages =====
app.get('/api/messages/:userId', authenticate, (req, res) => {
  const { userId } = req.params;
  messagesDB.find({
    $or: [
      { from: req.userId, to: userId },
      { from: userId, to: req.userId }
    ]
  }).sort({ createdAt: 1 }).exec((err, msgs) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(msgs);
  });
});

app.post('/api/messages', authenticate, (req, res) => {
  const { to, content } = req.body;
  const msg = {
    from: req.userId,
    to,
    content,
    read: false,
    createdAt: new Date().toISOString()
  };
  messagesDB.insert(msg, (err, newMsg) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json(newMsg);
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
