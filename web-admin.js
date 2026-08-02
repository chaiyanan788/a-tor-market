// public/admin.js — admin dashboard. Uses its own admin JWT (separate
// from regular user tokens), stored in localStorage under 'ttAdminToken'.

const admState = { token: localStorage.getItem('ttAdminToken') || null, page: 'overview', filter: '', activeThread: null };

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) { return Number(n || 0).toLocaleString('th-TH'); }
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}
async function adminApi(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (admState.token) headers.Authorization = `Bearer ${admState.token}`;
  const res = await fetch(`/api/admin${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

// ---------- gate ----------
async function initGate() {
  try {
    const { isSetUp } = await adminApi('/setup-status');
    if (!isSetUp) renderSetupGate();
    else renderLoginGate();
  } catch (e) {
    document.getElementById('admGateRoot').innerHTML = `<div class="gate-card"><h2>เชื่อมต่อเซิร์ฟเวอร์ไม่ได้</h2><div class="sub">${escapeHtml(e.message)}</div></div>`;
  }
}

function renderSetupGate() {
  document.getElementById('admGateRoot').innerHTML = `
    <div class="gate-card">
      <div class="mark" style="width:44px;height:44px;font-size:22px;">T</div>
      <h2>ตั้งรหัสผ่านแอดมิน</h2>
      <div class="sub">ยังไม่มีการตั้งรหัสผ่านแอดมินสำหรับระบบนี้ ตั้งรหัสผ่านครั้งแรกเพื่อเข้าใช้งานแผงควบคุม (เก็บแบบ hash ในฐานข้อมูล ไม่ใช่ข้อความธรรมดา)</div>
      <div class="field"><label>ตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)</label><input id="p1" type="password"></div>
      <div class="field"><label>ยืนยันรหัสผ่านอีกครั้ง</label><input id="p2" type="password"></div>
      <div class="form-error" id="gateErr"></div>
      <button class="btn btn-primary" id="setupBtn">ตั้งรหัสผ่านและเข้าสู่ระบบ</button>
    </div>`;
  document.getElementById('setupBtn').onclick = async () => {
    const p1 = document.getElementById('p1').value;
    const p2 = document.getElementById('p2').value;
    const err = document.getElementById('gateErr');
    if (p1.length < 6) { err.textContent = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'; return; }
    if (p1 !== p2) { err.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน'; return; }
    try {
      const { token } = await adminApi('/setup', { method: 'POST', body: JSON.stringify({ passcode: p1 }) });
      admState.token = token;
      localStorage.setItem('ttAdminToken', token);
      enterApp();
    } catch (e) { err.textContent = e.message; }
  };
}

function renderLoginGate() {
  document.getElementById('admGateRoot').innerHTML = `
    <div class="gate-card">
      <div class="mark" style="width:44px;height:44px;font-size:22px;">T</div>
      <h2>เข้าสู่ระบบแอดมิน</h2>
      <div class="field"><label>รหัสผ่าน</label><input id="loginPass" type="password"></div>
      <div class="form-error" id="gateErr"></div>
      <button class="btn btn-primary" id="loginBtn">เข้าสู่ระบบ</button>
    </div>`;
  document.getElementById('loginBtn').onclick = async () => {
    const passcode = document.getElementById('loginPass').value;
    const err = document.getElementById('gateErr');
    try {
      const { token } = await adminApi('/login', { method: 'POST', body: JSON.stringify({ passcode }) });
      admState.token = token;
      localStorage.setItem('ttAdminToken', token);
      enterApp();
    } catch (e) { err.textContent = e.message; }
  };
}

function enterApp() {
  document.getElementById('admGateRoot').style.display = 'none';
  document.getElementById('admAppRoot').style.display = 'grid';
  renderPage();
}

document.getElementById('admLogoutBtn').onclick = () => {
  admState.token = null;
  localStorage.removeItem('ttAdminToken');
  document.getElementById('admAppRoot').style.display = 'none';
  document.getElementById('admGateRoot').style.display = 'flex';
  initGate();
};
document.getElementById('admBackBtn').onclick = () => { window.location.href = '/'; };
document.querySelectorAll('.adm-nav-item[data-admpage]').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.adm-nav-item[data-admpage]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    admState.page = btn.dataset.admpage;
    admState.filter = '';
    renderPage();
  };
});

// ---------- CSV export (client builds it from already-fetched data) ----------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvCell).join(',')].concat(rows.map(r => r.map(csvCell).join(',')));
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ---------- pages ----------
function renderPage() {
  if (admState.page === 'overview') renderOverview();
  if (admState.page === 'listings') renderListingsPage();
  if (admState.page === 'users') renderUsersPage();
  if (admState.page === 'payouts') renderPayoutsPage();
  if (admState.page === 'messages') renderMessagesPage();
  updateMessagesBadge();
}

async function updateMessagesBadge() {
  const btn = document.querySelector('.adm-nav-item[data-admpage="messages"]');
  if (!btn) return;
  try {
    const threads = await adminApi('/messages');
    const unread = threads.filter(t => t.unread).length;
    btn.innerHTML = `💬 ข้อความ${unread ? ` <span style="background:var(--danger); color:#2a1400; border-radius:999px; font-size:10px; font-weight:800; padding:1px 6px; margin-left:4px;">${unread}</span>` : ''}`;
  } catch (e) { /* ignore */ }
}

async function renderOverview() {
  const main = document.getElementById('admMainRoot');
  main.innerHTML = `<div class="adm-page-head"><div><h1>ภาพรวมระบบ</h1></div></div>`;
  try {
    const { totalUsers, totalListings, totalValue, recent } = await adminApi('/overview');
    main.innerHTML = `
      <div class="adm-page-head">
        <div><h1>ภาพรวมระบบ</h1><div class="sub">สรุปข้อมูลสมาชิกและประกาศทั้งหมดของตั๋วต่อ</div></div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn btn-ghost" style="width:auto; padding:9px 16px; font-size:13px;" id="expListings">⬇ ดาวน์โหลดประกาศ (CSV)</button>
          <button class="btn btn-ghost" style="width:auto; padding:9px 16px; font-size:13px;" id="expUsers">⬇ ดาวน์โหลดสมาชิก (CSV)</button>
        </div>
      </div>
      <div class="adm-stats">
        <div class="adm-stat-card"><div class="label">สมาชิกทั้งหมด</div><div class="value" style="color:var(--gold);">${totalUsers}</div></div>
        <div class="adm-stat-card"><div class="label">ประกาศทั้งหมด</div><div class="value" style="color:var(--teal);">${totalListings}</div></div>
        <div class="adm-stat-card"><div class="label">มูลค่าประกาศรวม</div><div class="value" style="color:var(--pink);">฿${money(totalValue)}</div></div>
        <div class="adm-stat-card"><div class="label">ประกาศล่าสุด</div><div class="value">${recent.length ? escapeHtml(recent[0].event).slice(0, 14) : '-'}</div></div>
      </div>
      <div class="adm-table-wrap">
        <table>
          <thead><tr><th>ชื่องาน</th><th>ผู้ขาย</th><th>สถานที่</th><th>ราคา</th><th>ลงประกาศเมื่อ</th></tr></thead>
          <tbody>
            ${recent.length ? recent.map(l => `
              <tr><td>${escapeHtml(l.event)}</td><td>${escapeHtml(l.seller)}</td><td>${escapeHtml(l.venue)}</td><td>฿${money(l.price)}</td><td style="font-family:monospace;">${new Date(l.created_at).toLocaleString('th-TH')}</td></tr>
            `).join('') : `<tr class="adm-empty-row"><td colspan="5">ยังไม่มีประกาศในระบบ</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    document.getElementById('expListings').onclick = exportListingsCsv;
    document.getElementById('expUsers').onclick = exportUsersCsv;
  } catch (e) { main.innerHTML = `<div class="adm-page-head"><div class="sub">${escapeHtml(e.message)}</div></div>`; }
}

async function exportListingsCsv() {
  const rows = await adminApi('/listings');
  const headers = ['ชื่องาน', 'วันที่', 'โซน', 'สถานที่', 'จำนวน', 'ราคา', 'ราคาหน้าบัตร', 'ผู้ขาย', 'ช่องทางติดต่อ', 'สถานะ', 'วันที่ลงประกาศ'];
  downloadCsv('tuato-listings.csv', headers, rows.map(l => [l.event, l.date, l.section, l.venue, l.qty, l.price, l.original_price || '', l.seller, l.contact, l.status, new Date(l.created_at).toLocaleString('th-TH')]));
  toast('ดาวน์โหลดข้อมูลประกาศแล้ว', 'ok');
}
async function exportUsersCsv() {
  const rows = await adminApi('/users');
  const headers = ['ชื่อผู้ใช้', 'ช่องทางติดต่อ', 'บัญชีรับโอน', 'จำนวนประกาศ'];
  downloadCsv('tuato-users.csv', headers, rows.map(u => [u.username, u.contact, u.bank, u.listingCount]));
  toast('ดาวน์โหลดข้อมูลสมาชิกแล้ว', 'ok');
}

async function renderListingsPage() {
  const main = document.getElementById('admMainRoot');
  let rows = [];
  try { rows = await adminApi('/listings'); } catch (e) { toast(e.message, 'err'); }
  const stLabel = { available: 'ว่าง', reserved: 'จองแล้ว', sold: 'ขายแล้ว' };
  const draw = () => {
    let list = rows;
    if (admState.filter.trim()) {
      const f = admState.filter.trim().toLowerCase();
      list = list.filter(l => (l.event + l.seller + l.venue).toLowerCase().includes(f));
    }
    document.getElementById('listingsTbody').innerHTML = list.length ? list.map(l => `
      <tr>
        <td>${escapeHtml(l.event)}</td>
        <td><span class="adm-pill">${escapeHtml(l.section || '-')}</span></td>
        <td>${escapeHtml(l.venue)}</td>
        <td style="font-family:monospace;">${l.date || '-'}</td>
        <td>${l.qty}</td>
        <td>฿${money(l.price)}</td>
        <td><span class="adm-pill">${stLabel[l.status] || l.status}</span></td>
        <td>${l.paymentNoticeCount}</td>
        <td>${escapeHtml(l.seller)}</td>
        <td style="font-family:monospace;">${escapeHtml(l.contact)}</td>
        <td><button class="adm-del-btn" data-id="${l.id}">ลบ</button></td>
      </tr>
    `).join('') : `<tr class="adm-empty-row"><td colspan="11">ไม่พบประกาศที่ตรงกับการค้นหา</td></tr>`;
    document.querySelectorAll('#listingsTbody [data-id]').forEach(btn => {
      btn.onclick = async () => {
        const l = rows.find(r => r.id === btn.dataset.id);
        if (!confirm(`ลบประกาศ "${l.event}" ของ ${l.seller} ใช่หรือไม่?`)) return;
        try {
          await adminApi(`/listings/${l.id}`, { method: 'DELETE' });
          rows = rows.filter(r => r.id !== l.id);
          draw();
          toast('ลบประกาศแล้ว', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  };
  main.innerHTML = `
    <div class="adm-page-head">
      <div><h1>ประกาศทั้งหมด</h1><div class="sub">${rows.length} ประกาศในระบบ</div></div>
      <button class="btn btn-ghost" style="width:auto; padding:9px 16px; font-size:13px;" id="expListings2">⬇ ดาวน์โหลด CSV</button>
    </div>
    <div class="adm-toolbar"><input id="searchBox" placeholder="ค้นหาชื่องาน, ผู้ขาย, สถานที่..."></div>
    <div class="adm-table-wrap">
      <table>
        <thead><tr><th>ชื่องาน</th><th>โซน</th><th>สถานที่</th><th>วันที่จัดงาน</th><th>จำนวน</th><th>ราคา</th><th>สถานะ</th><th>แจ้งโอน</th><th>ผู้ขาย</th><th>ติดต่อ</th><th></th></tr></thead>
        <tbody id="listingsTbody"></tbody>
      </table>
    </div>
  `;
  document.getElementById('expListings2').onclick = exportListingsCsv;
  document.getElementById('searchBox').oninput = (e) => { admState.filter = e.target.value; draw(); };
  draw();
}

async function renderUsersPage() {
  const main = document.getElementById('admMainRoot');
  let rows = [];
  try { rows = await adminApi('/users'); } catch (e) { toast(e.message, 'err'); }
  const draw = () => {
    let list = rows;
    if (admState.filter.trim()) {
      const f = admState.filter.trim().toLowerCase();
      list = list.filter(u => u.username.toLowerCase().includes(f));
    }
    document.getElementById('usersTbody').innerHTML = list.length ? list.map(u => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td style="font-family:monospace;">${escapeHtml(u.contact || '-')}</td>
        <td style="font-family:monospace;">${escapeHtml(u.bank || '-')}</td>
        <td><span class="adm-pill">${u.listingCount} ประกาศ</span></td>
        <td><button class="adm-del-btn" data-u="${escapeHtml(u.username)}">ลบสมาชิก</button></td>
      </tr>
    `).join('') : `<tr class="adm-empty-row"><td colspan="5">ไม่พบสมาชิกที่ตรงกับการค้นหา</td></tr>`;
    document.querySelectorAll('#usersTbody [data-u]').forEach(btn => {
      btn.onclick = async () => {
        const u = rows.find(r => r.username === btn.dataset.u);
        if (!confirm(`ลบสมาชิก "${u.username}" ${u.listingCount ? `และประกาศทั้งหมด ${u.listingCount} รายการของเขา` : ''} ใช่หรือไม่?`)) return;
        try {
          await adminApi(`/users/${encodeURIComponent(u.username)}`, { method: 'DELETE' });
          rows = rows.filter(r => r.username !== u.username);
          draw();
          toast('ลบสมาชิกแล้ว', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  };
  main.innerHTML = `
    <div class="adm-page-head">
      <div><h1>สมาชิกทั้งหมด</h1><div class="sub">${rows.length} สมาชิกในระบบ</div></div>
      <button class="btn btn-ghost" style="width:auto; padding:9px 16px; font-size:13px;" id="expUsers2">⬇ ดาวน์โหลด CSV</button>
    </div>
    <div class="adm-toolbar"><input id="searchBox" placeholder="ค้นหาชื่อผู้ใช้..."></div>
    <div class="adm-table-wrap">
      <table>
        <thead><tr><th>ชื่อผู้ใช้</th><th>ช่องทางติดต่อ</th><th>บัญชีรับโอน</th><th>จำนวนประกาศ</th><th></th></tr></thead>
        <tbody id="usersTbody"></tbody>
      </table>
    </div>
  `;
  document.getElementById('expUsers2').onclick = exportUsersCsv;
  document.getElementById('searchBox').oninput = (e) => { admState.filter = e.target.value; draw(); };
  draw();
}

async function renderPayoutsPage() {
  const main = document.getElementById('admMainRoot');
  let rows = [];
  try { rows = await adminApi('/payouts'); } catch (e) { toast(e.message, 'err'); }
  const owed = rows.filter(r => r.payout_status === 'owed');
  const totalOwed = owed.reduce((s, r) => s + r.amount, 0);
  const statusInfo = {
    pending_confirmation: { label: 'รอผู้ซื้อยืนยันรับบัตร', style: 'background:rgba(255,204,51,0.16); color:var(--gold);' },
    owed: { label: 'ค้างจ่าย', style: 'background:rgba(255,159,67,0.18); color:var(--gold);' },
    paid_out: { label: 'จ่ายแล้ว', style: '' },
  };
  const draw = () => {
    document.getElementById('payoutsTbody').innerHTML = rows.length ? rows.map(r => {
      const info = statusInfo[r.payout_status] || { label: r.payout_status, style: '' };
      return `
      <tr>
        <td>${escapeHtml(r.event)}</td>
        <td>${escapeHtml(r.seller)}</td>
        <td style="font-family:monospace;">${escapeHtml(r.seller_bank || 'ยังไม่ได้แจ้งบัญชี')}</td>
        <td>${escapeHtml(r.buyer)}</td>
        <td>฿${money(r.amount)}</td>
        <td><span class="adm-pill" style="${info.style}">${info.label}</span></td>
        <td style="font-family:monospace;">${new Date(r.created_at).toLocaleDateString('th-TH')}</td>
        <td>
          ${r.payout_status === 'owed'
            ? `<button class="adm-del-btn" style="color:var(--teal); border-color:rgba(45,224,194,0.4);" data-mark-paid="${r.id}">จ่ายแล้ว</button>`
            : r.payout_status === 'paid_out'
              ? `<button class="adm-del-btn" data-mark-unpaid="${r.id}">ยกเลิก</button>`
              : `<span style="color:var(--muted); font-size:12px;">รอผู้ซื้อกดยืนยัน</span>`}
        </td>
      </tr>
    `;
    }).join('') : `<tr class="adm-empty-row"><td colspan="8">ยังไม่มีรายการที่ต้องจ่ายเงินผู้ขาย</td></tr>`;
    document.querySelectorAll('[data-mark-paid]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await adminApi(`/payouts/${btn.dataset.markPaid}/mark-paid`, { method: 'POST' });
          rows = await adminApi('/payouts');
          renderPayoutsPage();
          toast('บันทึกว่าจ่ายแล้ว', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      };
    });
    document.querySelectorAll('[data-mark-unpaid]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await adminApi(`/payouts/${btn.dataset.markUnpaid}/mark-unpaid`, { method: 'POST' });
          rows = await adminApi('/payouts');
          renderPayoutsPage();
        } catch (e) { toast(e.message, 'err'); }
      };
    });
  };
  main.innerHTML = `
    <div class="adm-page-head">
      <div><h1>จ่ายเงินผู้ขาย</h1><div class="sub">ยอดที่ต้องโอนให้ผู้ขายทั้งหมด (จากยอดที่ผู้ซื้อจ่ายผ่าน PromptPay สำเร็จ)</div></div>
    </div>
    <div class="adm-stats" style="grid-template-columns:repeat(2,1fr); margin-bottom:20px;">
      <div class="adm-stat-card"><div class="label">ค้างจ่ายทั้งหมด</div><div class="value" style="color:var(--gold);">฿${money(totalOwed)}</div></div>
      <div class="adm-stat-card"><div class="label">รายการค้างจ่าย</div><div class="value" style="color:var(--teal);">${owed.length}</div></div>
    </div>
    <div class="modal-sub" style="margin-bottom:14px; max-width:640px;">
      โอนเงินให้ผู้ขายผ่านบัญชีที่แสดงด้านล่างด้วยตัวเอง (แอปธนาคาร/พร้อมเพย์) แล้วกด "จ่ายแล้ว" เพื่อบันทึกไว้ — ระบบยังไม่โอนเงินอัตโนมัติให้ผู้ขาย
    </div>
    <div class="adm-table-wrap">
      <table>
        <thead><tr><th>ชื่องาน</th><th>ผู้ขาย</th><th>บัญชีรับโอน</th><th>ผู้ซื้อ</th><th>ยอดเงิน</th><th>สถานะ</th><th>วันที่ชำระ</th><th></th></tr></thead>
        <tbody id="payoutsTbody"></tbody>
      </table>
    </div>
  `;
  draw();
}

function chatBubbleHtml(m, isMine) {
  return `
  <div class="chat-row ${isMine ? 'me' : 'them'}">
    <div class="chat-bubble ${isMine ? 'me' : 'them'}">
      <div class="chat-text">${escapeHtml(m.text)}</div>
      <div class="chat-time">${new Date(m.created_at).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}</div>
    </div>
  </div>`;
}

async function renderMessagesPage() {
  const main = document.getElementById('admMainRoot');
  let threads = [];
  try { threads = await adminApi('/messages'); } catch (e) { toast(e.message, 'err'); }
  main.innerHTML = `
    <div class="adm-page-head">
      <div><h1>ข้อความจากสมาชิก</h1><div class="sub">${threads.length} บทสนทนา</div></div>
    </div>
    <div style="display:grid; grid-template-columns:260px 1fr; gap:16px; align-items:start;">
      <div class="adm-table-wrap" style="max-height:520px; overflow-y:auto;">
        ${threads.length ? threads.map(t => `
          <div class="adm-thread-item" data-thread="${escapeHtml(t.username)}" style="padding:12px 14px; border-bottom:1px solid var(--line); cursor:pointer; ${admState.activeThread === t.username ? 'background:var(--bg-elev2);' : ''}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <b>${escapeHtml(t.username)}</b>
              ${t.unread ? '<span class="adm-pill" style="background:rgba(255,159,67,0.2); color:var(--danger);">ใหม่</span>' : ''}
            </div>
            <div style="font-size:12px; color:var(--muted); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.last.text)}</div>
          </div>
        `).join('') : `<div style="padding:24px; text-align:center; color:var(--muted); font-size:13px;">ยังไม่มีข้อความเข้ามา</div>`}
      </div>
      <div class="adm-table-wrap" style="padding:18px; min-height:400px; display:flex; flex-direction:column;">
        <div id="chatThread" style="flex:1; display:flex; flex-direction:column; gap:10px; max-height:400px; overflow-y:auto; margin-bottom:12px;"></div>
        <div id="chatInputRow" style="display:none; gap:8px;">
          <input id="chatInput" placeholder="พิมพ์ข้อความตอบกลับ..." style="flex:1; background:var(--bg-elev2); border:1px solid var(--line); color:var(--text); padding:10px 12px; border-radius:9px; font-size:14px; font-family:inherit;">
          <button class="btn btn-primary" id="chatSendBtn" style="width:auto; padding:10px 18px;">ส่ง</button>
        </div>
      </div>
    </div>
  `;
  document.querySelectorAll('.adm-thread-item').forEach(item => {
    item.onclick = () => { admState.activeThread = item.dataset.thread; renderMessagesPage(); };
  });
  const active = threads.find(t => t.username === admState.activeThread);
  if (active) {
    document.getElementById('chatThread').innerHTML = active.messages.map(m => chatBubbleHtml(m, m.sender === 'admin')).join('');
    document.getElementById('chatInputRow').style.display = 'flex';
    const sendFn = async () => {
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        await adminApi(`/messages/${encodeURIComponent(admState.activeThread)}`, { method: 'POST', body: JSON.stringify({ text }) });
        renderMessagesPage();
      } catch (e) { toast(e.message, 'err'); }
    };
    document.getElementById('chatSendBtn').onclick = sendFn;
    document.getElementById('chatInput').onkeydown = (e) => { if (e.key === 'Enter') sendFn(); };
  } else {
    document.getElementById('chatThread').innerHTML = `<div style="text-align:center; color:var(--muted); font-size:13px; margin:auto;">เลือกบทสนทนาทางซ้ายเพื่อดูและตอบกลับ</div>`;
  }
}

// ---------- init ----------
if (admState.token) enterApp();
else initGate();
