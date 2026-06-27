const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'my_super_secret_key_change_me';

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Log all requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.url}`);
  next();
});

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const usersDB = new Datastore({ filename: path.join(dataDir, 'users.db'), autoload: true });
const postsDB = new Datastore({ filename: path.join(dataDir, 'posts.db'), autoload: true });
const messagesDB = new Datastore({ filename: path.join(dataDir, 'messages.db'), autoload: true });
const storiesDB = new Datastore({ filename: path.join(dataDir, 'stories.db'), autoload: true });
const businessesDB = new Datastore({ filename: path.join(dataDir, 'businesses.db'), autoload: true });
const friendshipsDB = new Datastore({ filename: path.join(dataDir, 'friendships.db'), autoload: true });

const { promisify } = require('util');
const findUsers = promisify(usersDB.find.bind(usersDB));
const findOneUser = promisify(usersDB.findOne.bind(usersDB));
const insertUser = promisify(usersDB.insert.bind(usersDB));
const updateUser = promisify(usersDB.update.bind(usersDB));

const findPosts = promisify(postsDB.find.bind(postsDB));
const insertPost = promisify(postsDB.insert.bind(postsDB));
const updatePost = promisify(postsDB.update.bind(postsDB));
const findOnePost = promisify(postsDB.findOne.bind(postsDB));

const findMessages = promisify(messagesDB.find.bind(messagesDB));
const insertMessage = promisify(messagesDB.insert.bind(messagesDB));

const findStories = promisify(storiesDB.find.bind(storiesDB));
const insertStory = promisify(storiesDB.insert.bind(storiesDB));

const findBusinesses = promisify(businessesDB.find.bind(businessesDB));
const insertBusiness = promisify(businessesDB.insert.bind(businessesDB));

const findFriendships = promisify(friendshipsDB.find.bind(friendshipsDB));
const insertFriendship = promisify(friendshipsDB.insert.bind(friendshipsDB));
const updateFriendship = promisify(friendshipsDB.update.bind(friendshipsDB));
const findOneFriendship = promisify(friendshipsDB.findOne.bind(friendshipsDB));

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

// ===== AUTH =====
app.post('/api/register', async (req, res) => {
  const { username, email, password, yearOfStudy, profilePic } = req.body;
  console.log('📝 Register:', username, email);
  if (!username || !email || !password || !yearOfStudy) {
    return res.status(400).json({ error: 'All fields mandatory' });
  }
  try {
    const existingEmail = await findOneUser({ email });
    if (existingEmail) return res.status(400).json({ error: 'Email already taken' });
    const existingUser = await findOneUser({ username });
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
    const newUser = await insertUser(user);
    console.log('✅ User created:', newUser._id);
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: pwd, ...userData } = newUser;
    res.status(201).json({ token, user: userData });
  } catch (err) {
    console.error('❌ Register error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('🔑 Login:', email);
  try {
    const user = await findOneUser({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    await updateUser({ _id: user._id }, { $set: { isOnline: true, lastSeen: new Date().toISOString() } });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: pwd, ...userData } = user;
    res.json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', authenticate, async (req, res) => {
  try {
    await updateUser({ _id: req.userId }, { $set: { isOnline: false, lastSeen: new Date().toISOString() } });
    res.json({ message: 'Logged out' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== USERS =====
app.get('/api/users', authenticate, async (req, res) => {
  try {
    const users = await findUsers({ _id: { $ne: req.userId } });
    res.json(users.map(u => { const { password, ...rest } = u; return rest; }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profile', authenticate, async (req, res) => {
  const { username, bio, location, interests } = req.body;
  try {
    await updateUser({ _id: req.userId }, { $set: { username, bio, location, interests } });
    const user = await findOneUser({ _id: req.userId });
    const { password, ...userData } = user;
    res.json(userData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== FRIENDSHIPS =====
app.post('/api/friends/request', authenticate, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error: 'Recipient required' });
  if (to === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });
  try {
    const existing = await findOneFriendship({
      $or: [
        { from: req.userId, to },
        { from: to, to: req.userId }
      ]
    });
    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
      if (existing.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
      await updateFriendship({ _id: existing._id }, { $set: { status: 'pending' } });
      return res.json({ message: 'Friend request sent' });
    }
    const friendship = {
      from: req.userId,
      to,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    await insertFriendship(friendship);
    res.json({ message: 'Friend request sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/friends/accept', authenticate, async (req, res) => {
  const { from } = req.body;
  if (!from) return res.status(400).json({ error: 'Sender required' });
  try {
    const friendship = await findOneFriendship({ from, to: req.userId, status: 'pending' });
    if (!friendship) return res.status(404).json({ error: 'No pending request' });
    await updateFriendship({ _id: friendship._id }, { $set: { status: 'accepted' } });
    res.json({ message: 'Friend added' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/friends/reject', authenticate, async (req, res) => {
  const { from } = req.body;
  if (!from) return res.status(400).json({ error: 'Sender required' });
  try {
    const friendship = await findOneFriendship({ from, to: req.userId, status: 'pending' });
    if (!friendship) return res.status(404).json({ error: 'No pending request' });
    await updateFriendship({ _id: friendship._id }, { $set: { status: 'rejected' } });
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/friends', authenticate, async (req, res) => {
  try {
    const friendships = await findFriendships({
      $or: [
        { from: req.userId, status: 'accepted' },
        { to: req.userId, status: 'accepted' }
      ]
    });
    const friendIds = friendships.map(f => f.from === req.userId ? f.to : f.from);
    const friends = await findUsers({ _id: { $in: friendIds } });
    res.json(friends.map(u => { const { password, ...rest } = u; return rest; }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/friends/pending', authenticate, async (req, res) => {
  try {
    const pending = await findFriendships({ to: req.userId, status: 'pending' });
    const fromIds = pending.map(f => f.from);
    const users = await findUsers({ _id: { $in: fromIds } });
    res.json(users.map(u => { const { password, ...rest } = u; return rest; }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== POSTS =====
app.get('/api/posts', authenticate, async (req, res) => {
  try {
    const posts = await findPosts({}).sort({ createdAt: -1 });
    const populated = await Promise.all(posts.map(async (post) => {
      const author = await findOneUser({ _id: post.author });
      if (author) post.author = { _id: author._id, username: author.username, profilePic: author.profilePic, yearOfStudy: author.yearOfStudy };
      if (post.comments && post.comments.length) {
        const commentUsers = await Promise.all(post.comments.map(async (c) => {
          if (c.user) {
            const user = await findOneUser({ _id: c.user });
            if (user) { c.username = user.username; c.profilePic = user.profilePic; }
          }
          return c;
        }));
        post.comments = commentUsers;
      }
      return post;
    }));
    res.json(populated);
  } catch (err) {
    console.error('❌ Error fetching posts:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts', authenticate, async (req, res) => {
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
  try {
    const newPost = await insertPost(post);
    const author = await findOneUser({ _id: newPost.author });
    if (author) newPost.author = { _id: author._id, username: author.username, profilePic: author.profilePic, yearOfStudy: author.yearOfStudy };
    res.status(201).json(newPost);
  } catch (err) {
    console.error('❌ Error creating post:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:postId/like', authenticate, async (req, res) => {
  try {
    const post = await findOnePost({ _id: req.params.postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const idx = post.likes.indexOf(req.userId);
    if (idx > -1) post.likes.splice(idx, 1);
    else post.likes.push(req.userId);
    await updatePost({ _id: req.params.postId }, { $set: { likes: post.likes } });
    res.json({ likes: post.likes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/posts/:postId/comment', authenticate, async (req, res) => {
  const { text } = req.body;
  try {
    const post = await findOnePost({ _id: req.params.postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    const user = await findOneUser({ _id: req.userId });
    const comment = {
      user: req.userId,
      text,
      username: user ? user.username : 'Unknown',
      profilePic: user ? user.profilePic : '',
      createdAt: new Date().toISOString()
    };
    post.comments.push(comment);
    await updatePost({ _id: req.params.postId }, { $set: { comments: post.comments } });
    res.json({ comments: post.comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== MESSAGES =====
app.get('/api/messages/:userId', authenticate, async (req, res) => {
  const { userId } = req.params;
  try {
    const msgs = await findMessages({
      $or: [
        { from: req.userId, to: userId },
        { from: userId, to: req.userId }
      ]
    }).sort({ createdAt: 1 });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/messages', authenticate, async (req, res) => {
  const { to, content } = req.body;
  const msg = {
    from: req.userId,
    to,
    content,
    read: false,
    createdAt: new Date().toISOString()
  };
  try {
    const newMsg = await insertMessage(msg);
    res.status(201).json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== STORIES =====
app.get('/api/stories', authenticate, async (req, res) => {
  try {
    const stories = await findStories({}).sort({ createdAt: -1 });
    const populated = await Promise.all(stories.map(async (s) => {
      const author = await findOneUser({ _id: s.author });
      if (author) s.author = { _id: author._id, username: author.username, profilePic: author.profilePic };
      return s;
    }));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stories', authenticate, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Story text required' });
  const story = {
    author: req.userId,
    text,
    createdAt: new Date().toISOString()
  };
  try {
    const newStory = await insertStory(story);
    const author = await findOneUser({ _id: newStory.author });
    if (author) newStory.author = { _id: author._id, username: author.username, profilePic: author.profilePic };
    res.status(201).json(newStory);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BUSINESSES =====
app.get('/api/businesses', authenticate, async (req, res) => {
  try {
    const businesses = await findBusinesses({}).sort({ createdAt: -1 });
    const populated = await Promise.all(businesses.map(async (b) => {
      const author = await findOneUser({ _id: b.author });
      if (author) b.author = { _id: author._id, username: author.username, profilePic: author.profilePic };
      return b;
    }));
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/businesses', authenticate, async (req, res) => {
  const { name, category, description, image, animation } = req.body;
  if (!name || !description) {
    return res.status(400).json({ error: 'Name and description required' });
  }
  const business = {
    author: req.userId,
    name,
    category: category || 'Other',
    description,
    image: image || null,
    animation: animation || 'none',
    createdAt: new Date().toISOString()
  };
  try {
    const newBiz = await insertBusiness(business);
    const author = await findOneUser({ _id: newBiz.author });
    if (author) newBiz.author = { _id: author._id, username: author.username, profilePic: author.profilePic };
    res.status(201).json(newBiz);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== SERVE STATIC =====
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: serve index.html for any non-API route (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
