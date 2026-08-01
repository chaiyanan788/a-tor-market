// public/app.js — public site logic. Talks to the backend over fetch();
// no client-side storage tricks, no demo fallback — this expects a real
// server (see ../server.js) to be running.

const state = {
  listings: [],
  token: localStorage.getItem('ttToken') || null,
  username: localStorage.getItem('ttUsername') || null,
  filter: '',
  sort: 'new',
  paymentsEnabled: false,
};

// ---------- small helpers ----------
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
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

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

function setSession(token, username) {
  state.token = token;
  state.username = username;
  localStorage.setItem('ttToken', token);
  localStorage.setItem('ttUsername', username);
}
function clearSession() {
  state.token = null;
  state.username = null;
  localStorage.removeItem('ttToken');
  localStorage.removeItem('ttUsername');
}

// ---------- data loading ----------
async function loadListings() {
  state.listings = await api('/listings');
}

// ---------- rendering ----------
function renderHeader() {
  const el = document.getElementById('headerActions');
  if (state.token && state.username) {
    el.innerHTML = `
      <span class="user-chip">สวัสดี, <b>${escapeHtml(state.username)}</b></span>
      <button class="btn btn-ghost" id="btnFindTicket">🔍 หาตั๋ว</button>
      <button class="btn btn-ghost" id="btnMyListings">ประกาศของฉัน</button>
      <button class="btn btn-ghost" id="btnBank">🏦 บัญชีรับโอน</button>
      <button class="btn btn-ghost" id="btnChat">💬 ติดต่อแอดมิน</button>
      <button class="btn btn-primary" id="btnPost">＋ ลงประกาศ</button>
      <button class="btn btn-ghost" id="btnLogout">ออกจากระบบ</button>
    `;
    document.getElementById('btnPost').onclick = () => openPostModal();
    document.getElementById('btnBank').onclick = () => openBankModal();
    document.getElementById('btnChat').onclick = () => openSupportChatModal();
    document.getElementById('btnLogout').onclick = () => { clearSession(); renderAll(); toast('ออกจากระบบแล้ว'); };
    document.getElementById('btnMyListings').onclick = () => {
      document.getElementById('mySection').scrollIntoView({ behavior: 'smooth' });
    };
  } else {
    el.innerHTML = `
      <button class="btn btn-ghost" id="btnFindTicket">🔍 หาตั๋ว</button>
      <button class="btn btn-ghost" id="btnLogin">เข้าสู่ระบบ</button>
      <button class="btn btn-primary" id="btnRegister">สมัครสมาชิก</button>
    `;
    document.getElementById('btnLogin').onclick = () => openAuthModal('login');
    document.getElementById('btnRegister').onclick = () => openAuthModal('register');
  }
  document.getElementById('btnFindTicket').onclick = () => {
    document.getElementById('browseSection').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { const s = document.getElementById('searchInput'); if (s) s.focus(); }, 400);
  };
}

function renderTicker() {
  const track = document.getElementById('tickerTrack');
  if (state.listings.length === 0) {
    track.innerHTML = `<span><em>ยังไม่มีประกาศ</em>เป็นคนแรกที่ลงประกาศขายบัตรของคุณ</span>`.repeat(2);
    return;
  }
  const items = state.listings.slice(0, 12)
    .map(l => `<span><em>ประกาศขาย</em>${escapeHtml(l.event)} · ${escapeHtml(l.venue)} · ฿${money(l.price)}</span>`)
    .join('');
  track.innerHTML = items + items;
}

function sortedListings(list) {
  const arr = [...list];
  if (state.sort === 'new') arr.sort((a, b) => b.created_at - a.created_at);
  if (state.sort === 'dateAsc') arr.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (state.sort === 'priceAsc') arr.sort((a, b) => a.price - b.price);
  if (state.sort === 'priceDesc') arr.sort((a, b) => b.price - a.price);
  return arr;
}

function statusBadge(status) {
  const map = {
    available: { label: 'ว่าง / พร้อมขาย', cls: 'st-available' },
    reserved: { label: 'จองแล้ว / รอโอน', cls: 'st-reserved' },
    sold: { label: 'ขายแล้ว', cls: 'st-sold' },
  };
  const s = map[status] || map.available;
  return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

function ticketCardHtml(l, mine) {
  const revealId = 'reveal-' + l.id;
  const status = l.status || 'available';
  const notices = l.paymentNotices || [];
  return `
  <div class="ticket-card" data-id="${l.id}">
    ${mine ? '<div class="mine-badge">ของฉัน</div>' : ''}
    <div class="main">
      <div class="eyebrow">${escapeHtml(l.section || 'บัตรคอนเสิร์ต')}</div>
      <h3>${escapeHtml(l.event)}</h3>
      <div class="venue">${escapeHtml(l.venue)} · ${l.date ? new Date(l.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
      <div style="margin:2px 0 8px;">${statusBadge(status)}</div>
      <div class="rows">
        <div>จำนวน: <b>${escapeHtml(String(l.qty))}</b> ใบ</div>
        <div>ผู้ขาย: <b>${escapeHtml(l.seller)}</b></div>
      </div>
      ${l.description ? `<div class="desc">${escapeHtml(l.description)}</div>` : ''}
      <div id="${revealId}" class="contact-box" style="display:none;">
        ติดต่อ: <b>${escapeHtml(l.contact)}</b>
        ${l.sellerBank ? `<div style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.14);">บัญชีรับโอน: <b>${escapeHtml(l.sellerBank)}</b></div>` : `<div style="margin-top:6px; color:var(--muted);">ผู้ขายยังไม่ได้แจ้งบัญชีรับโอน สอบถามผ่านช่องทางติดต่อได้เลย</div>`}
      </div>
      <div class="card-actions">
        ${mine ? `
          <button class="link-btn btn-edit">แก้ไข</button>
          <button class="link-btn btn-delete" style="color:var(--danger);border-color:rgba(255,159,67,0.4);">ลบประกาศ</button>
        ` : `
          <button class="link-btn btn-reveal">ดูข้อมูลติดต่อ/บัญชีผู้ขาย</button>
          ${status !== 'sold' && state.paymentsEnabled ? `<button class="link-btn btn-pay-qr" style="border-color:var(--gold); color:var(--gold);">💳 จ่ายผ่าน PromptPay</button>` : ''}
          ${status !== 'sold' ? `<button class="link-btn btn-notice">แจ้งโอนเงินแล้ว</button>` : ''}
        `}
      </div>
      ${mine ? `
        <div class="seller-controls">
          <label style="font-size:11.5px; color:var(--muted); font-weight:700;">สถานะประกาศ</label>
          <select class="status-select">
            <option value="available" ${status === 'available' ? 'selected' : ''}>ว่าง / พร้อมขาย</option>
            <option value="reserved" ${status === 'reserved' ? 'selected' : ''}>จองแล้ว / รอโอน</option>
            <option value="sold" ${status === 'sold' ? 'selected' : ''}>ขายแล้ว</option>
          </select>
          ${notices.length ? `
            <div class="notice-list">
              <div style="font-size:11.5px; font-weight:700; color:var(--muted); margin:8px 0 4px;">แจ้งโอนเงิน (${notices.length})</div>
              ${notices.map(n => `
                <div class="notice-item">
                  <div>฿${money(n.amount)} · ${escapeHtml(n.by_user)} ${n.note ? '· ' + escapeHtml(n.note) : ''}</div>
                  <div style="font-family:monospace; font-size:11px;">${new Date(n.created_at).toLocaleString('th-TH')}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      ` : ''}
    </div>
    <div class="stub">
      <span class="qty">x${escapeHtml(String(l.qty))}</span>
      ${l.original_price ? `<span class="orig">฿${money(l.original_price)}</span>` : ''}
      <span class="price">฿${money(l.price)}</span>
    </div>
  </div>`;
}

function renderBrowse() {
  const grid = document.getElementById('listingGrid');
  let list = state.listings;
  if (state.filter.trim()) {
    const f = state.filter.trim().toLowerCase();
    list = list.filter(l => (l.event + l.venue).toLowerCase().includes(f));
  }
  list = sortedListings(list);
  document.getElementById('listingCount').textContent = `${list.length} ประกาศ`;
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1;">ยังไม่มีประกาศที่ตรงกับการค้นหา ลองเปลี่ยนคำค้นหา หรือเป็นคนแรกที่ลงประกาศ</div>`;
    return;
  }
  grid.innerHTML = list.map(l => ticketCardHtml(l, state.username && l.seller === state.username)).join('');
  bindCardEvents(grid, list);
}

function renderMySection() {
  const section = document.getElementById('mySection');
  if (!state.username) { section.style.display = 'none'; return; }
  const mine = state.listings.filter(l => l.seller === state.username);
  section.style.display = mine.length ? 'block' : 'none';
  const grid = document.getElementById('myGrid');
  grid.innerHTML = mine.map(l => ticketCardHtml(l, true)).join('');
  bindCardEvents(grid, mine);
}

function bindCardEvents(grid, list) {
  grid.querySelectorAll('.ticket-card').forEach(card => {
    const id = card.dataset.id;
    const l = list.find(x => x.id === id);
    const revealBtn = card.querySelector('.btn-reveal');
    if (revealBtn) revealBtn.onclick = () => {
      const box = card.querySelector('.contact-box');
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    };
    const noticeBtn = card.querySelector('.btn-notice');
    if (noticeBtn) noticeBtn.onclick = () => openPaymentNoticeModal(l);
    const payQrBtn = card.querySelector('.btn-pay-qr');
    if (payQrBtn) payQrBtn.onclick = () => openPromptPayModal(l);
    const editBtn = card.querySelector('.btn-edit');
    if (editBtn) editBtn.onclick = () => openPostModal(l);
    const delBtn = card.querySelector('.btn-delete');
    if (delBtn) delBtn.onclick = async () => {
      if (!confirm(`ลบประกาศ "${l.event}" ใช่หรือไม่?`)) return;
      try {
        await api(`/listings/${l.id}`, { method: 'DELETE' });
        await loadListings(); renderAll();
        toast('ลบประกาศแล้ว', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    };
    const statusSelect = card.querySelector('.status-select');
    if (statusSelect) statusSelect.onchange = async (e) => {
      try {
        await api(`/listings/${l.id}`, { method: 'PUT', body: JSON.stringify({ status: e.target.value }) });
        await loadListings(); renderAll();
        toast('อัปเดตสถานะแล้ว', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    };
  });
}

function renderAll() {
  renderHeader();
  renderTicker();
  renderBrowse();
  renderMySection();
}

// ---------- modals ----------
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

function openAuthModal(tab) {
  tab = tab || 'login';
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal">
      <button class="close" id="closeBtn">&times;</button>
      <h3>เข้าสู่ระบบ / สมัครสมาชิก</h3>
      <div class="modal-sub">PIN ของคุณถูกเข้ารหัส (hash) ก่อนบันทึกในเซิร์ฟเวอร์เสมอ</div>
      <div class="tabs">
        <button id="tabLogin" class="${tab === 'login' ? 'active' : ''}">เข้าสู่ระบบ</button>
        <button id="tabRegister" class="${tab === 'register' ? 'active' : ''}">สมัครสมาชิก</button>
      </div>
      <div id="authFormArea"></div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  document.getElementById('tabLogin').onclick = () => renderAuthForm('login');
  document.getElementById('tabRegister').onclick = () => renderAuthForm('register');
  renderAuthForm(tab);
}

function renderAuthForm(tab) {
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  const area = document.getElementById('authFormArea');
  if (tab === 'login') {
    area.innerHTML = `
      <div class="field"><label>ชื่อผู้ใช้</label><input id="loginUser" type="text"></div>
      <div class="field"><label>PIN</label><input id="loginPin" type="password"></div>
      <div class="form-error" id="authErr"></div>
      <div class="submit-row"><button class="btn btn-primary" id="doLogin">เข้าสู่ระบบ</button></div>
    `;
    document.getElementById('doLogin').onclick = async () => {
      const username = document.getElementById('loginUser').value.trim();
      const pin = document.getElementById('loginPin').value.trim();
      const err = document.getElementById('authErr');
      try {
        const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, pin }) });
        setSession(data.token, data.username);
        closeModal(); await loadListings(); renderAll();
        toast(`ยินดีต้อนรับกลับ ${data.username}`, 'ok');
      } catch (e) { err.textContent = e.message; }
    };
  } else {
    area.innerHTML = `
      <div class="field"><label>ชื่อผู้ใช้</label><input id="regUser" type="text"></div>
      <div class="field"><label>PIN (4-6 หลัก)</label><input id="regPin" type="password"></div>
      <div class="field"><label>ช่องทางติดต่อ (LINE ID / เบอร์โทร)</label><input id="regContact" type="text"></div>
      <div class="field"><label>บัญชีธนาคารสำหรับรับโอน (ไม่บังคับ)</label><input id="regBank" type="text"></div>
      <div class="form-error" id="authErr"></div>
      <div class="submit-row"><button class="btn btn-primary" id="doRegister">สมัครสมาชิก</button></div>
    `;
    document.getElementById('doRegister').onclick = async () => {
      const username = document.getElementById('regUser').value.trim();
      const pin = document.getElementById('regPin').value.trim();
      const contact = document.getElementById('regContact').value.trim();
      const bank = document.getElementById('regBank').value.trim();
      const err = document.getElementById('authErr');
      try {
        const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, pin, contact, bank }) });
        setSession(data.token, data.username);
        closeModal(); await loadListings(); renderAll();
        toast(`สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ${data.username}`, 'ok');
      } catch (e) { err.textContent = e.message; }
    };
  }
}

function openBankModal() {
  if (!state.token) return;
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal">
      <button class="close" id="closeBtn">&times;</button>
      <h3>บัญชีรับโอนเงิน</h3>
      <div class="modal-sub">ข้อมูลนี้จะแสดงให้ผู้ซื้อเห็นเมื่อกด "ดูข้อมูลติดต่อผู้ขาย"</div>
      <div class="field"><label>บัญชีธนาคารสำหรับรับโอน</label><input id="bankInput" type="text" placeholder="กำลังโหลด..."></div>
      <div class="submit-row"><button class="btn btn-primary" id="saveBankBtn">บันทึก</button></div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  api('/auth/me').then(me => { document.getElementById('bankInput').value = me.bank || ''; }).catch(() => {});
  document.getElementById('saveBankBtn').onclick = async () => {
    try {
      await api('/auth/me/bank', { method: 'PUT', body: JSON.stringify({ bank: document.getElementById('bankInput').value.trim() }) });
      closeModal(); await loadListings(); renderAll();
      toast('บันทึกบัญชีรับโอนแล้ว', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
}

function openPostModal(existing) {
  if (!state.token) { openAuthModal('login'); toast('กรุณาเข้าสู่ระบบก่อนลงประกาศ'); return; }
  const isEdit = !!existing;
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal">
      <button class="close" id="closeBtn">&times;</button>
      <h3>${isEdit ? 'แก้ไขประกาศ' : 'ลงประกาศขายบัตร'}</h3>
      <div class="field"><label>ชื่องาน / ศิลปิน</label><input id="fEvent" value="${existing ? escapeHtml(existing.event) : ''}"></div>
      <div class="field-row">
        <div class="field"><label>วันที่จัดงาน</label><input id="fDate" type="date" value="${existing ? (existing.date || '') : ''}"></div>
        <div class="field"><label>ประเภทบัตร / โซน</label><input id="fSection" value="${existing ? escapeHtml(existing.section || '') : ''}"></div>
      </div>
      <div class="field"><label>สถานที่จัดงาน</label><input id="fVenue" value="${existing ? escapeHtml(existing.venue) : ''}"></div>
      <div class="field-row">
        <div class="field"><label>จำนวนบัตร</label><input id="fQty" type="number" min="1" value="${existing ? existing.qty : '1'}"></div>
        <div class="field"><label>ราคาขาย (บาท/ใบ)</label><input id="fPrice" type="number" min="0" value="${existing ? existing.price : ''}"></div>
      </div>
      <div class="field"><label>ราคาหน้าบัตร (ไม่บังคับ)</label><input id="fOrig" type="number" min="0" value="${existing && existing.original_price ? existing.original_price : ''}"></div>
      <div class="field"><label>รายละเอียดเพิ่มเติม</label><textarea id="fDesc">${existing ? escapeHtml(existing.description || '') : ''}</textarea></div>
      <div class="field"><label>ช่องทางติดต่อ</label><input id="fContact" value="${existing ? escapeHtml(existing.contact) : ''}"></div>
      <div class="form-error" id="postErr"></div>
      <div class="submit-row"><button class="btn btn-primary" id="doSubmit">${isEdit ? 'บันทึกการแก้ไข' : 'ลงประกาศ'}</button></div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  if (!isEdit) api('/auth/me').then(me => { document.getElementById('fContact').value = me.contact || ''; }).catch(() => {});
  document.getElementById('doSubmit').onclick = async () => {
    const body = {
      event: document.getElementById('fEvent').value.trim(),
      date: document.getElementById('fDate').value,
      section: document.getElementById('fSection').value.trim(),
      venue: document.getElementById('fVenue').value.trim(),
      qty: parseInt(document.getElementById('fQty').value, 10),
      price: parseFloat(document.getElementById('fPrice').value),
      originalPrice: document.getElementById('fOrig').value ? parseFloat(document.getElementById('fOrig').value) : null,
      description: document.getElementById('fDesc').value.trim(),
      contact: document.getElementById('fContact').value.trim(),
    };
    const err = document.getElementById('postErr');
    if (!body.event || !body.venue || !body.contact || !body.qty || body.qty < 1 || isNaN(body.price) || body.price < 0) {
      err.textContent = 'กรอกข้อมูลให้ครบและถูกต้อง'; return;
    }
    try {
      if (isEdit) await api(`/listings/${existing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/listings', { method: 'POST', body: JSON.stringify(body) });
      closeModal(); await loadListings(); renderAll();
      toast(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'ลงประกาศสำเร็จ', 'ok');
    } catch (e) { err.textContent = e.message; }
  };
}

function openPaymentNoticeModal(l) {
  if (!state.token) { openAuthModal('login'); toast('กรุณาเข้าสู่ระบบก่อนแจ้งโอนเงิน'); return; }
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal">
      <button class="close" id="closeBtn">&times;</button>
      <h3>แจ้งโอนเงินแล้ว</h3>
      <div class="modal-sub">แจ้งผู้ขาย "${escapeHtml(l.seller)}" ว่าคุณโอนเงินค่าบัตร "${escapeHtml(l.event)}" แล้ว — ระบบไม่มีการรับ-ส่งเงินจริงผ่านเว็บ</div>
      <div class="field"><label>จำนวนเงินที่โอน (บาท)</label><input id="noticeAmount" type="number" min="0" value="${l.price * l.qty}"></div>
      <div class="field"><label>หมายเหตุ / เลขอ้างอิง</label><input id="noticeNote" type="text"></div>
      <div class="form-error" id="noticeErr"></div>
      <div class="submit-row"><button class="btn btn-primary" id="submitNotice">ส่งแจ้งเตือนผู้ขาย</button></div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  document.getElementById('submitNotice').onclick = async () => {
    const amount = parseFloat(document.getElementById('noticeAmount').value);
    const note = document.getElementById('noticeNote').value.trim();
    const err = document.getElementById('noticeErr');
    if (isNaN(amount) || amount <= 0) { err.textContent = 'กรอกจำนวนเงินให้ถูกต้อง'; return; }
    try {
      await api(`/listings/${l.id}/payment-notice`, { method: 'POST', body: JSON.stringify({ amount, note }) });
      closeModal(); await loadListings(); renderAll();
      toast('แจ้งผู้ขายเรียบร้อยแล้ว รอผู้ขายยืนยัน', 'ok');
    } catch (e) { err.textContent = e.message; }
  };
}

function openPromptPayModal(l) {
  if (!state.token) { openAuthModal('login'); toast('กรุณาเข้าสู่ระบบก่อนชำระเงิน'); return; }
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal" style="text-align:center;">
      <button class="close" id="closeBtn">&times;</button>
      <h3>สแกนจ่ายผ่าน PromptPay</h3>
      <div class="modal-sub">"${escapeHtml(l.event)}" — ยอดชำระ ฿${money(l.price * l.qty)}</div>
      <div id="qrArea" style="padding:20px 0;">กำลังสร้าง QR โค้ด...</div>
      <div id="payStatusMsg" style="font-size:13px; color:var(--muted);"></div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = () => { stopPollingPayment(); closeModal(); };
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') { stopPollingPayment(); closeModal(); } };

  api('/payments/create-charge', { method: 'POST', body: JSON.stringify({ listingId: l.id }) })
    .then(data => {
      document.getElementById('qrArea').innerHTML = `<img src="${data.qrImageUrl}" alt="PromptPay QR" style="max-width:220px; border-radius:12px; background:#fff; padding:10px;">`;
      document.getElementById('payStatusMsg').textContent = 'กำลังรอการชำระเงิน... (หน้าต่างนี้จะอัปเดตอัตโนมัติ)';
      pollPaymentStatus(data.paymentId, l);
    })
    .catch(e => {
      document.getElementById('qrArea').innerHTML = `<div class="form-error">${escapeHtml(e.message)}</div>`;
    });
}

let paymentPollTimer = null;
function stopPollingPayment() { if (paymentPollTimer) { clearInterval(paymentPollTimer); paymentPollTimer = null; } }

function pollPaymentStatus(paymentId, listing) {
  stopPollingPayment();
  paymentPollTimer = setInterval(async () => {
    try {
      const { status } = await api(`/payments/status/${paymentId}`);
      const msg = document.getElementById('payStatusMsg');
      if (status === 'paid') {
        stopPollingPayment();
        if (msg) msg.textContent = 'ชำระเงินสำเร็จ! ✅';
        toast(`ชำระเงินสำเร็จสำหรับ "${listing.event}"`, 'ok');
        await loadListings(); renderAll();
        setTimeout(closeModal, 1500);
      } else if (status === 'failed') {
        stopPollingPayment();
        if (msg) msg.textContent = 'การชำระเงินไม่สำเร็จหรือหมดเวลา กรุณาลองใหม่';
      }
    } catch (e) { /* keep polling */ }
  }, 3000);
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

function openSupportChatModal() {
  if (!state.token) { openAuthModal('login'); toast('กรุณาเข้าสู่ระบบก่อนแชทกับแอดมิน'); return; }
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
  <div class="modal-overlay" id="overlay">
    <div class="modal chat-modal">
      <button class="close" id="closeBtn">&times;</button>
      <h3>💬 ติดต่อแอดมิน</h3>
      <div class="chat-thread" id="chatThread"></div>
      <div class="chat-input-row">
        <input id="chatInput" type="text" placeholder="พิมพ์ข้อความ...">
        <button class="btn btn-primary" id="chatSendBtn" style="width:auto; padding:11px 18px;">ส่ง</button>
      </div>
    </div>
  </div>`;
  document.getElementById('closeBtn').onclick = closeModal;
  document.getElementById('overlay').onclick = (e) => { if (e.target.id === 'overlay') closeModal(); };
  refreshChatThread();
  const sendFn = async () => {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    try {
      await api('/messages/mine', { method: 'POST', body: JSON.stringify({ text }) });
      await refreshChatThread();
    } catch (e) { toast(e.message, 'err'); }
  };
  document.getElementById('chatSendBtn').onclick = sendFn;
  document.getElementById('chatInput').onkeydown = (e) => { if (e.key === 'Enter') sendFn(); };
}

async function refreshChatThread() {
  const thread = document.getElementById('chatThread');
  if (!thread) return;
  try {
    const msgs = await api('/messages/mine');
    thread.innerHTML = msgs.length
      ? msgs.map(m => chatBubbleHtml(m, m.sender === 'user')).join('')
      : `<div style="text-align:center; color:var(--muted); font-size:13px; padding:20px 0;">ยังไม่มีข้อความ พิมพ์ทักแอดมินได้เลย</div>`;
    thread.scrollTop = thread.scrollHeight;
  } catch (e) { /* ignore */ }
}

// ---------- init ----------
document.getElementById('ctaPost').onclick = () => openPostModal();
document.getElementById('ctaBrowse').onclick = () => document.getElementById('browseSection').scrollIntoView({ behavior: 'smooth' });
document.getElementById('searchInput').addEventListener('input', (e) => { state.filter = e.target.value; renderBrowse(); });
document.getElementById('sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; renderBrowse(); });

async function init() {
  document.getElementById('listingCount').textContent = 'กำลังโหลด...';
  try {
    const [_, paymentsConfig] = await Promise.all([
      loadListings(),
      api('/payments/config').catch(() => ({ enabled: false })),
    ]);
    state.paymentsEnabled = !!(paymentsConfig && paymentsConfig.enabled);
  } catch (e) {
    toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'err');
  }
  renderAll();
}
init();
