const API = "";
let token = localStorage.getItem("dvsa_token");
let userEmail = localStorage.getItem("dvsa_email");
let currentPage = "dashboard";

const app = document.getElementById("app");

// ─── Router ──────────────────────────────────────────────────────────────────
function render() {
  if (!token) {
    renderAuth("login");
  } else {
    renderLayout();
  }
}

// ─── Auth Pages ───────────────────────────────────────────────────────────────
function renderAuth(mode) {
  const isLogin = mode === "login";
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="lanes"></div>
      <div class="auth-box">
        <div class="licence-stripe">
          <span class="uk-flag">🇬🇧</span>
          <span class="dvla-text">DVSA · Slot Monitor</span>
          <span class="chip"></span>
        </div>
        <div class="auth-box-inner">
        <div class="auth-logo">
          <div class="icon">🚗</div>
          <h1>DVSA Slot Monitor</h1>
          <p>Get notified when London test slots open</p>
        </div>
        <div id="auth-error"></div>
        <form id="auth-form">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="email" placeholder="you@example.com" required />
          </div>
          <div class="form-group">
            <label>Password ${!isLogin ? "(min. 8 characters)" : ""}</label>
            <div style="position:relative">
              <input type="password" id="password" placeholder="••••••••" required style="padding-right:44px" />
              <button type="button" onclick="togglePw('password',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem">👁</button>
            </div>
          </div>
          ${!isLogin ? `
          <div class="form-group">
            <label>Confirm Password</label>
            <div style="position:relative">
              <input type="password" id="confirm" placeholder="••••••••" required style="padding-right:44px" />
              <button type="button" onclick="togglePw('confirm',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem">👁</button>
            </div>
          </div>` : ""}
          <button type="submit" class="btn btn-primary" id="auth-btn">
            ${isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>
        <div class="auth-switch">
          ${isLogin
            ? `Don't have an account? <a onclick="renderAuth('register')">Sign up</a>`
            : `Already have an account? <a onclick="renderAuth('login')">Sign in</a>`}
        </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const btn = document.getElementById("auth-btn");
    const errDiv = document.getElementById("auth-error");

    if (!isLogin) {
      const confirm = document.getElementById("confirm").value;
      if (password !== confirm) {
        errDiv.innerHTML = `<div class="error-msg">Passwords do not match</div>`;
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = isLogin ? "Signing in..." : "Creating account...";

    try {
      const res = await fetch(`${API}/api/${isLogin ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        errDiv.innerHTML = `<div class="error-msg">${data.error}</div>`;
        btn.disabled = false;
        btn.textContent = isLogin ? "Sign In" : "Create Account";
        return;
      }
      token = data.token;
      userEmail = data.email;
      localStorage.setItem("dvsa_token", token);
      localStorage.setItem("dvsa_email", userEmail);
      render();
    } catch (e) {
      errDiv.innerHTML = `<div class="error-msg">Connection error. Try again.</div>`;
      btn.disabled = false;
    }
  };
}

// ─── Dashboard Layout ─────────────────────────────────────────────────────────
function renderLayout() {
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <h2>🚗 DVSA Monitor</h2>
          <p>London Slot Tracker</p>
        </div>
        <button class="nav-item ${currentPage==='dashboard'?'active':''}" onclick="navigate('dashboard')">
          📊 Dashboard
        </button>
        <button class="nav-item ${currentPage==='monitors'?'active':''}" onclick="navigate('monitors')">
          🔍 My Monitors
        </button>
        <button class="nav-item ${currentPage==='alerts'?'active':''}" onclick="navigate('alerts')">
          🔔 Alert History
        </button>
        <div class="sidebar-footer">
          <div class="user-info">Signed in as<br/><strong>${userEmail}</strong></div>
          <button class="nav-item" onclick="logout()" style="color:#ff4757">⏻ Sign Out</button>
        </div>
      </aside>
      <main class="main" id="main-content">
        <div style="text-align:center;padding:60px;color:var(--muted)">Loading...</div>
      </main>
    </div>
  `;
  loadPage(currentPage);
}

function navigate(page) {
  currentPage = page;
  renderLayout();
}

function logout() {
  token = null;
  userEmail = null;
  localStorage.clear();
  render();
}

// ─── Pages ────────────────────────────────────────────────────────────────────
async function loadPage(page) {
  const main = document.getElementById("main-content");
  if (!main) return;

  if (page === "dashboard") {
    await renderDashboard(main);
  } else if (page === "monitors") {
    await renderMonitors(main);
  } else if (page === "alerts") {
    await renderAlerts(main);
  }
}

async function renderDashboard(el) {
  const monitors = await apiFetch("/api/monitors");
  const active = monitors.filter(m => m.active).length;

  el.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <p>Overview of your DVSA slot monitors</p>
    </div>
    <div class="cards-grid">
      <div class="stat-card">
        <div class="label">ACTIVE MONITORS</div>
        <div class="value" style="color:var(--success)">${active}</div>
        <div class="sub">Checking every 5 minutes</div>
      </div>
      <div class="stat-card">
        <div class="label">TOTAL MONITORS</div>
        <div class="value">${monitors.length}</div>
        <div class="sub">All London centres</div>
      </div>
      <div class="stat-card">
        <div class="label">STATUS</div>
        <div class="value" style="font-size:1.1rem;margin-top:4px">
          ${active > 0
            ? `<span class="badge badge-green">● LIVE</span>`
            : `<span class="badge badge-gray">● PAUSED</span>`}
        </div>
        <div class="sub">Telegram alerts enabled</div>
      </div>
    </div>

    <div class="section-title">RECENT MONITORS</div>
    ${monitors.length === 0
      ? `<div class="empty-state">
          <div class="icon">🔍</div>
          <h3>No monitors yet</h3>
          <p>Add your first monitor to start tracking DVSA slots</p>
          <br/>
          <button class="btn btn-primary btn-sm" onclick="navigate('monitors')" style="display:inline-flex">
            + Add Monitor
          </button>
        </div>`
      : monitors.slice(0, 3).map(m => monitorCard(m, false)).join("")}
  `;
}

async function renderMonitors(el) {
  const monitors = await apiFetch("/api/monitors");

  el.innerHTML = `
    <div class="page-header">
      <h1>My Monitors</h1>
      <p>Manage your DVSA slot monitors</p>
    </div>
    <div class="info-box">
      <strong>How it works:</strong> Enter your DVSA credentials and Telegram details.
      The system logs into DVSA as you and checks all London test centres every 5 minutes.
      You get an instant Telegram message when a slot opens up.
    </div>
    <button class="btn btn-success" onclick="showAddModal()" style="margin-bottom:24px">
      + Add New Monitor
    </button>
    <div id="monitors-list">
      ${monitors.length === 0
        ? `<div class="empty-state">
            <div class="icon">📡</div>
            <h3>No monitors set up</h3>
            <p>Click "Add New Monitor" to get started</p>
          </div>`
        : monitors.map(m => monitorCard(m, true)).join("")}
    </div>
    <div id="modal-container"></div>
  `;
}

function monitorCard(m, showActions) {
  const lastChecked = m.last_checked
    ? new Date(m.last_checked).toLocaleString("en-GB")
    : "Never";
  const result = m.last_result ? JSON.parse(m.last_result) : null;

  return `
    <div class="monitor-card">
      <div class="monitor-status ${m.active ? 'active' : 'inactive'}"></div>
      <div class="monitor-info">
        <h3>Monitor #${m.id} — ${m.dvsa_licence}</h3>
        <p>Telegram: ${m.telegram_chat_id} · Last check: ${lastChecked}</p>
        ${result ? `<p style="margin-top:4px">
          ${result.status === 'slots_found'
            ? `<span class="badge badge-green">Slots found!</span>`
            : result.status === 'error'
            ? `<span class="badge badge-red">Error: ${result.error?.substring(0,40)}</span>`
            : `<span class="badge badge-gray">No slots</span>`}
        </p>` : ""}
      </div>
      ${showActions ? `
      <div class="monitor-actions">
        <button class="btn btn-ghost btn-sm" onclick="testMonitor(${m.id})">▶ Test</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleMonitor(${m.id})">${m.active ? "⏸ Pause" : "▶ Resume"}</button>
        <button class="btn btn-danger" onclick="deleteMonitor(${m.id})">✕</button>
      </div>` : ""}
    </div>
  `;
}

async function renderAlerts(el) {
  const monitors = await apiFetch("/api/monitors");

  if (monitors.length === 0) {
    el.innerHTML = `
      <div class="page-header"><h1>Alert History</h1></div>
      <div class="empty-state">
        <div class="icon">🔔</div>
        <h3>No monitors yet</h3>
        <p>Set up a monitor first to see alert history</p>
      </div>`;
    return;
  }

  let allAlerts = [];
  for (const m of monitors) {
    const alerts = await apiFetch(`/api/alerts/${m.id}`);
    allAlerts = allAlerts.concat(alerts);
  }

  allAlerts.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  el.innerHTML = `
    <div class="page-header">
      <h1>Alert History</h1>
      <p>All slots found and notifications sent</p>
    </div>
    ${allAlerts.length === 0
      ? `<div class="empty-state">
          <div class="icon">📭</div>
          <h3>No alerts yet</h3>
          <p>You'll see alerts here when London DVSA slots are found</p>
        </div>`
      : allAlerts.map(a => `
        <div class="alert-item">
          <div class="alert-icon">📍</div>
          <div class="alert-info">
            <h4>${a.centre_name}</h4>
            <p>Slots: ${a.slot_dates}</p>
            <p>${new Date(a.sent_at).toLocaleString("en-GB")}</p>
          </div>
        </div>`).join("")}
  `;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function showAddModal() {
  const container = document.getElementById("modal-container");
  if (!container) return;

  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <h2>➕ Add New Monitor</h2>
        <div id="modal-error"></div>
        <div class="info-box">
          Your DVSA credentials are stored securely and only used to check slot availability on your behalf.
        </div>
        <form id="add-form">
          <div class="form-group">
            <label>🪪 Driving Licence Number</label>
            <input type="text" id="m-licence" placeholder="e.g. JONES961102W99YT" required />
          </div>
          <div class="form-group">
            <label>📋 Theory Test Pass Certificate Number</label>
            <input type="text" id="m-theory" placeholder="e.g. C1234567890A" required />
          </div>
          <div class="form-group">
            <label>🤖 Telegram Bot Token</label>
            <input type="text" id="m-token" placeholder="1234567890:AAFxxx..." required />
          </div>
          <div class="form-group">
            <label>💬 Telegram Chat ID (personal or group)</label>
            <input type="text" id="m-chat" placeholder="637985448 or -100xxxxxxx" required />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="save-btn">Save Monitor</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById("add-form").onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById("save-btn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      const res = await apiFetch("/api/monitors", "POST", {
        dvsa_licence: document.getElementById("m-licence").value,
        dvsa_theory: document.getElementById("m-theory").value,
        telegram_token: document.getElementById("m-token").value,
        telegram_chat_id: document.getElementById("m-chat").value,
      });
      closeModal();
      await renderMonitors(document.getElementById("main-content"));
    } catch (e) {
      document.getElementById("modal-error").innerHTML = `<div class="error-msg">${e.message}</div>`;
      btn.disabled = false;
      btn.textContent = "Save Monitor";
    }
  };
}

function closeModal() {
  const c = document.getElementById("modal-container");
  if (c) c.innerHTML = "";
}

// ─── Monitor Actions ──────────────────────────────────────────────────────────
async function testMonitor(id) {
  await apiFetch(`/api/monitors/${id}/test`, "POST");
  alert("Test started! Check your Telegram in ~60 seconds.");
}

async function toggleMonitor(id) {
  await apiFetch(`/api/monitors/${id}/toggle`, "PATCH");
  await renderMonitors(document.getElementById("main-content"));
}

async function deleteMonitor(id) {
  if (!confirm("Delete this monitor?")) return;
  await apiFetch(`/api/monitors/${id}`, "DELETE");
  await renderMonitors(document.getElementById("main-content"));
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function apiFetch(url, method = "GET", body = null) {
  const opts = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  if (res.status === 401) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

// ─── Toggle password visibility ──────────────────────────────────────────────
function togglePw(id, btn) {
  const input = document.getElementById(id);
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁";
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
render();
