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

// Helper: exec promise
const execPromise = (cursor) => {
  return new Promise((resolve, reject) => {
    cursor.exec((err, docs) => {
      if (err) reject(err);
      else resolve(docs);
    });
  });
};

// Find with sort
const findPostsSorted = (query, sort) => {
  const cursor = postsDB.find(query);
  if (sort) cursor.sort(sort);
  return execPromise(cursor);
};
const findMessagesSorted = (query, sort) => {
  const cursor = messagesDB.find(query);
  if (sort) cursor.sort(sort);
  return execPromise(cursor);
};
const findStoriesSorted = (query, sort) => {
  const cursor = storiesDB.find(query);
  if (sort) cursor.sort(sort);
  return execPromise(cursor);
};
const findBusinessesSorted = (query, sort) => {
  const cursor = businessesDB.find(query);
  if (sort) cursor.sort(sort);
  return execPromise(cursor);
};

const findUsers = (query) => new Promise((resolve, reject) => {
  usersDB.find(query).exec((err, docs) => {
    if (err) reject(err);
    else resolve(docs);
  });
});
const findOneUser = (query) => new Promise((resolve, reject) => {
  usersDB.findOne(query, (err, doc) => {
    if (err) reject(err);
    else resolve(doc);
  });
});
const insertUser = (doc) => new Promise((resolve, reject) => {
  usersDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const updateUser = (query, update) => new Promise((resolve, reject) => {
  usersDB.update(query, update, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const insertPost = (doc) => new Promise((resolve, reject) => {
  postsDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const updatePost = (query, update) => new Promise((resolve, reject) => {
  postsDB.update(query, update, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const findOnePost = (query) => new Promise((resolve, reject) => {
  postsDB.findOne(query, (err, doc) => {
    if (err) reject(err);
    else resolve(doc);
  });
});
const removePost = (query) => new Promise((resolve, reject) => {
  postsDB.remove(query, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const insertMessage = (doc) => new Promise((resolve, reject) => {
  messagesDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const removeMessage = (query) => new Promise((resolve, reject) => {
  messagesDB.remove(query, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const insertStory = (doc) => new Promise((resolve, reject) => {
  storiesDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const removeStory = (query) => new Promise((resolve, reject) => {
  storiesDB.remove(query, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const insertBusiness = (doc) => new Promise((resolve, reject) => {
  businessesDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const removeBusiness = (query) => new Promise((resolve, reject) => {
  businessesDB.remove(query, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});

const findFriendships = (query) => new Promise((resolve, reject) => {
  friendshipsDB.find(query).exec((err, docs) => {
    if (err) reject(err);
    else resolve(docs);
  });
});
const insertFriendship = (doc) => new Promise((resolve, reject) => {
  friendshipsDB.insert(doc, (err, newDoc) => {
    if (err) reject(err);
    else resolve(newDoc);
  });
});
const updateFriendship = (query, update) => new Promise((resolve, reject) => {
  friendshipsDB.update(query, update, {}, (err, num) => {
    if (err) reject(err);
    else resolve(num);
  });
});
const findOneFriendship = (query) => new Promise((resolve, reject) => {
  friendshipsDB.findOne(query, (err, doc) => {
    if (err) reject(err);
    else resolve(doc);
  });
});

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

// ===== HELPERS =====
const isOlderThan15Hours = (dateStr) => {
  const age = Date.now() - new Date(dateStr).getTime();
  return age > 15 * 60 * 60 * 1000;
};

// ===== AUTH =====
app.post('/api/register', async (req, res) => {
  const { username, email, password, yearOfStudy, profilePic } = req.body;
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
      username, email, password: hashed, yearOfStudy,
      profilePic: profilePic || '', bio: '', location: '', interests: '',
      isOnline: true, lastSeen: new Date().toISOString(), createdAt: new Date().toISOString()
    };
    const newUser = await insertUser(user);
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '7d' });
    const { password: pwd, ...userData } = newUser;
    res.status(201).json({ token, user: userData });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
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
  await updateUser({ _id: req.userId }, { $set: { isOnline: false, lastSeen: new Date().toISOString() } });
  res.json({ message: 'Logged out' });
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
    let posts = await findPostsSorted({}, { createdAt: -1 });
    const toKeep = [];
    for (const post of posts) {
      if (isOlderThan15Hours(post.createdAt)) {
        await removePost({ _id: post._id });
      } else {
        toKeep.push(post);
      }
    }
    const populated = await Promise.all(toKeep.map(async (post) => {
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
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/posts/:postId', authenticate, async (req, res) => {
  try {
    const post = await findOnePost({ _id: req.params.postId });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    await removePost({ _id: req.params.postId });
    res.json({ message: 'Post deleted' });
  } catch (err) {
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
    const msgs = await findMessagesSorted({
      $or: [
        { from: req.userId, to: userId },
        { from: userId, to: req.userId }
      ]
    }, { createdAt: 1 });
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

app.delete('/api/messages/:msgId', authenticate, async (req, res) => {
  try {
    const msg = await new Promise((resolve, reject) => {
      messagesDB.findOne({ _id: req.params.msgId }, (err, doc) => {
        if (err) reject(err); else resolve(doc);
      });
    });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.from !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    await removeMessage({ _id: req.params.msgId });
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== STORIES =====
app.get('/api/stories', authenticate, async (req, res) => {
  try {
    let stories = await findStoriesSorted({}, { createdAt: -1 });
    const toKeep = [];
    for (const s of stories) {
      if (isOlderThan15Hours(s.createdAt)) {
        await removeStory({ _id: s._id });
      } else {
        toKeep.push(s);
      }
    }
    const populated = await Promise.all(toKeep.map(async (s) => {
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

app.delete('/api/stories/:storyId', authenticate, async (req, res) => {
  try {
    const story = await new Promise((resolve, reject) => {
      storiesDB.findOne({ _id: req.params.storyId }, (err, doc) => {
        if (err) reject(err); else resolve(doc);
      });
    });
    if (!story) return res.status(404).json({ error: 'Story not found' });
    if (story.author !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    await removeStory({ _id: req.params.storyId });
    res.json({ message: 'Story deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== BUSINESSES =====
app.get('/api/businesses', authenticate, async (req, res) => {
  try {
    const businesses = await findBusinessesSorted({}, { createdAt: -1 });
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

app.delete('/api/businesses/:bizId', authenticate, async (req, res) => {
  try {
    const biz = await new Promise((resolve, reject) => {
      businessesDB.findOne({ _id: req.params.bizId }, (err, doc) => {
        if (err) reject(err); else resolve(doc);
      });
    });
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    if (biz.author !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    await removeBusiness({ _id: req.params.bizId });
    res.json({ message: 'Business deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== REELS =====
app.get('/api/reels', async (req, res) => {
  try {
    const pexelsKey = process.env.PEXELS_API_KEY;
    let videos = [];

    if (pexelsKey) {
      const response = await fetch('https://api.pexels.com/videos/popular?per_page=10', {
        headers: { 'Authorization': pexelsKey }
      });
      const data = await response.json();
      if (data.videos) {
        videos = data.videos.map(v => ({
          id: v.id,
          title: v.user?.name || 'Untitled',
          videoUrl: v.video_files?.find(f => f.quality === 'hd')?.link || v.video_files[0].link,
          thumbnail: v.image,
          duration: v.duration,
          likes: Math.floor(Math.random() * 1000) + 10
        }));
      }
    }

    if (videos.length === 0) {
      videos = [
        { id: '1', title: 'Sunset Lake', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', thumbnail: '', duration: 30, likes: 42 },
        { id: '2', title: 'City Traffic', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', thumbnail: '', duration: 25, likes: 78 },
        { id: '3', title: 'Nature Walk', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', thumbnail: '', duration: 20, likes: 125 }
      ];
    }
    res.json(videos);
  } catch (err) {
    res.json([
      { id: '1', title: 'Demo Reel', videoUrl: 'https://www.w3schools.com/html/mov_bbb.mp4', thumbnail: '', duration: 30, likes: 99 }
    ]);
  }
});

// ===== TELEVISION CHANNELS =====
app.get('/api/tv/channels', (req, res) => {
  const channels = [
    {
      id: 'football',
      name: '⚽ Football (World Cup)',
      type: 'sports',
      streamUrl: 'https://www.youtube.com/embed/LNk0TqBbnBo?autoplay=0&rel=0',
      thumbnail: 'https://img.icons8.com/color/96/000000/football2.png'
    },
    {
      id: 'cartoon',
      name: '📺 Cartoons (24/7)',
      type: 'kids',
      streamUrl: 'https://www.youtube.com/embed/2X5cU7k4P8E?autoplay=0&rel=0',
      thumbnail: 'https://img.icons8.com/color/96/000000/cartoon.png'
    },
    {
      id: 'news',
      name: '📰 News Channel',
      type: 'news',
      streamUrl: 'https://www.youtube.com/embed/5XpR8VbPDJg?autoplay=0&rel=0',
      thumbnail: 'https://img.icons8.com/color/96/000000/news.png'
    },
    {
      id: 'music',
      name: '🎵 Music TV',
      type: 'music',
      streamUrl: 'https://www.youtube.com/embed/7NtK-4Zcy_s?autoplay=0&rel=0',
      thumbnail: 'https://img.icons8.com/color/96/000000/music.png'
    }
  ];
  res.json(channels);
});

// ===== SERVE STATIC =====
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
