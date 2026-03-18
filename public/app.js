const API = "";
let userEmail = null;
let userSub = null;
let userTrialActive = false;
let userTrialEnds = null;
let currentPage = "dashboard";
let autoRefreshTimer = null;
let lastSlotHash = "";

const app = document.getElementById("app");

// ─── Router ──────────────────────────────────────────────────────────────────
async function render() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("verified") === "success") {
    window.history.replaceState({}, "", "/");
    showToast("✅ Email verified! You can now log in.", "success");
  } else if (params.get("verified") === "expired") {
    window.history.replaceState({}, "", "/");
    showToast("⚠️ Verification link expired. Request a new one.", "error");
  } else if (params.get("payment") === "success") {
    window.history.replaceState({}, "", "/");
    showToast("🎉 Payment successful! Subscription activated.", "success");
  }

  try {
    const res = await fetch("/api/me", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      userEmail = data.email;
      userSub = data.subscription;
      userTrialActive = data.trialActive;
      userTrialEnds = data.trialEnds;
      renderLayout();
    } else {
      renderAuth("login");
    }
  } catch {
    renderAuth("login");
  }
}

function showToast(msg, type = "success") {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;top:20px;right:20px;z-index:9999;padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;color:#fff;background:${type==="success"?"#2ed573":"#ff4757"};box-shadow:0 8px 24px rgba(0,0,0,0.3);animation:slideIn 0.3s ease`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
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
        <form id="auth-form" autocomplete="off">
          <input type="text" style="display:none" aria-hidden="true" />
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="email" placeholder="you@example.com" autocomplete="off" required />
          </div>
          <div class="form-group">
            <label>Password ${!isLogin ? "(min. 8 characters)" : ""}</label>
            <div style="position:relative">
              <input type="password" id="password" placeholder="••••••••" autocomplete="${isLogin ? "current-password" : "new-password"}" required style="padding-right:44px" />
              <button type="button" onclick="togglePw('password',this)" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.1rem">👁</button>
            </div>
          </div>
          ${!isLogin ? `
          <div class="form-group">
            <label>Confirm Password</label>
            <div style="position:relative">
              <input type="password" id="confirm" placeholder="••••••••" autocomplete="new-password" required style="padding-right:44px" />
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
        if (data.unverified) {
          errDiv.innerHTML = `
            <div class="error-msg">
              ${data.error}
              <br/><a onclick="resendVerification('${email}')" style="color:#fff;cursor:pointer;text-decoration:underline">Resend verification email</a>
            </div>`;
        } else {
          errDiv.innerHTML = `<div class="error-msg">${data.error}</div>`;
        }
        btn.disabled = false;
        btn.textContent = isLogin ? "Sign In" : "Create Account";
        return;
      }
      if (!isLogin) {
        renderVerifyScreen(email);
        return;
      }
      userEmail = data.email;
      userSub = data.subscription;
      userTrialActive = data.trialActive;
      userTrialEnds = data.trialEnds;
      render();
    } catch (e) {
      errDiv.innerHTML = `<div class="error-msg">Connection error. Try again.</div>`;
      btn.disabled = false;
    }
  };
}

// ─── Verify Email Screen ──────────────────────────────────────────────────────
function renderVerifyScreen(email) {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="lanes"></div>
      <div class="auth-box">
        <div class="licence-stripe">
          <span class="uk-flag">🇬🇧</span>
          <span class="dvla-text">DVSA · Slot Monitor</span>
          <span class="chip"></span>
        </div>
        <div class="auth-box-inner" style="text-align:center">
          <div style="font-size:3rem;margin-bottom:16px">📧</div>
          <h2 style="margin-bottom:8px">Check your email</h2>
          <p style="color:var(--muted);margin-bottom:24px;line-height:1.6">
            We sent a verification link to<br/>
            <strong style="color:var(--text)">${email}</strong>
          </p>
          <p style="color:var(--muted);font-size:0.85rem;margin-bottom:20px">Click the link in the email to activate your account.</p>
          <button class="btn btn-ghost btn-full" onclick="resendVerification('${email}')">Resend email</button>
          <div class="auth-switch" style="margin-top:16px">
            Already verified? <a onclick="renderAuth('login')">Sign in</a>
          </div>
        </div>
      </div>
    </div>`;
}

async function resendVerification(email) {
  await fetch("/api/resend-verification", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  showToast("✉️ Verification email resent!", "success");
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
        <button class="nav-item ${currentPage==='billing'?'active':''}" onclick="navigate('billing')">
          💳 Billing
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
  stopAutoRefresh();
  renderLayout();
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(async () => {
    if (currentPage !== "dashboard") return;
    const main = document.getElementById("main-content");
    if (!main) return;
    try {
      const monitors = await apiFetch("/api/monitors");
      const hash = JSON.stringify(monitors.map(m => m.last_result + m.last_checked));
      if (hash !== lastSlotHash) {
        lastSlotHash = hash;
        await renderDashboard(main);
      }
    } catch {}
  }, 60000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
}

async function logout() {
  await fetch("/api/logout", { method: "POST", credentials: "include" });
  userEmail = null;
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
  } else if (page === "billing") {
    await renderBilling(main);
  }
}

async function renderDashboard(el) {
  startAutoRefresh();
  const monitors = await apiFetch("/api/monitors");
  const active = monitors.filter(m => m.active).length;

  // Collect recent slots from last_result
  const slotsFound = [];
  for (const m of monitors) {
    if (m.last_result) {
      try {
        const r = JSON.parse(m.last_result);
        if (r.status === "slots_found" && r.available) {
          slotsFound.push(...r.available);
        }
      } catch {}
    }
  }

  // Fetch latest alerts (last 24h)
  let recentAlerts = [];
  for (const m of monitors) {
    try {
      const alerts = await apiFetch(`/api/alerts/${m.id}`);
      const recent = alerts.filter(a => {
        const age = Date.now() - new Date(a.sent_at).getTime();
        return age < 24 * 60 * 60 * 1000;
      });
      recentAlerts = recentAlerts.concat(recent);
    } catch {}
  }
  recentAlerts.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  const slotBanner = recentAlerts.length > 0 ? `
    <div class="slot-banner">
      <div class="slot-banner-icon">🚗</div>
      <div class="slot-banner-content">
        <strong>Slots Available Right Now!</strong>
        <p>${recentAlerts.map(a => `${a.centre_name}: ${a.slot_dates}`).join(" · ")}</p>
      </div>
      <a href="https://www.gov.uk/book-driving-test" target="_blank" class="btn btn-book">Book Now →</a>
    </div>` : "";

  const pushState = await getPushState();

  el.innerHTML = `
    ${slotBanner}
    <div class="page-header">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your DVSA slot monitors</p>
        </div>
        <div id="push-btn-wrap">
          ${pushState === "granted"
            ? `<button class="btn btn-push btn-push-on" onclick="unsubscribePush()">🔔 Notifications On</button>`
            : pushState === "denied"
            ? `<span class="push-denied">🔕 Notifications blocked in browser</span>`
            : `<button class="btn btn-push" onclick="subscribePush()">🔔 Enable Notifications</button>`}
        </div>
      </div>
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
        <div class="sub">${recentAlerts.length > 0 ? `${recentAlerts.length} slot(s) found recently` : "In-dashboard alerts enabled"}</div>
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
      <strong>How it works:</strong> Enter your DVSA theory test certificate number.
      The system checks all London test centres every 5 minutes and shows available slots right here in your dashboard.
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

  let slotsHtml = "";
  if (result && result.status === "slots_found" && result.available) {
    slotsHtml = `
      <div class="slots-found-box">
        <strong>🚗 Slots Available!</strong>
        ${result.available.map(s => `
          <div class="slot-row">
            <span class="slot-centre">📍 ${s.name}</span>
            <span class="slot-dates">${s.dates.join(", ")}</span>
          </div>`).join("")}
        <a href="https://www.gov.uk/book-driving-test" target="_blank" class="btn btn-book btn-sm" style="margin-top:10px">Book Now →</a>
      </div>`;
  }

  return `
    <div class="monitor-card ${result && result.status === "slots_found" ? "has-slots" : ""}">
      <div class="monitor-status ${m.active ? 'active' : 'inactive'}"></div>
      <div class="monitor-info">
        <h3>Monitor #${m.id}${m.dvsa_licence ? ` — ${m.dvsa_licence}` : ""}</h3>
        <p>Last check: ${lastChecked}</p>
        ${result ? `<p style="margin-top:4px">
          ${result.status === 'slots_found'
            ? `<span class="badge badge-green">✓ Slots found!</span>`
            : result.status === 'error'
            ? `<span class="badge badge-red">Error: ${result.error?.substring(0,40)}</span>`
            : `<span class="badge badge-gray">No slots right now</span>`}
        </p>` : ""}
        ${slotsHtml}
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
      <p>All slots found across London centres</p>
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
          <a href="https://www.gov.uk/book-driving-test" target="_blank" class="btn btn-book btn-sm">Book →</a>
        </div>`).join("")}
  `;
}

async function renderBilling(el) {
  const trialEndsDate = userTrialEnds ? new Date(userTrialEnds).toLocaleDateString("en-GB") : null;
  const isActive = userSub === "active";
  const isTrial = userTrialActive;

  el.innerHTML = `
    <div class="page-header">
      <h1>Billing</h1>
      <p>Manage your subscription</p>
    </div>
    <div class="stat-card" style="max-width:480px;margin-bottom:24px">
      <div class="label">CURRENT PLAN</div>
      <div class="value" style="font-size:1.3rem;margin-bottom:8px">
        ${isActive ? `<span class="badge badge-green">● Active Subscription</span>`
          : isTrial ? `<span class="badge badge-green" style="background:rgba(0,212,170,0.15);color:var(--accent2)">● Free Trial</span>`
          : `<span class="badge badge-red">● No Active Plan</span>`}
      </div>
      ${isTrial && trialEndsDate ? `<div class="sub">Trial ends: ${trialEndsDate}</div>` : ""}
      ${isActive ? `<div class="sub" style="margin-top:8px">Full access to all monitors and alerts</div>` : ""}
    </div>
    ${!isActive ? `
    <div class="info-box" style="max-width:480px;margin-bottom:20px">
      <strong>Upgrade to continue monitoring</strong><br/>
      Get unlimited monitors, instant slot notifications, and priority checking across all London test centres.
    </div>
    <button class="btn btn-primary" style="max-width:480px" onclick="startCheckout()">
      💳 Subscribe Now
    </button>` : `
    <button class="btn btn-ghost" style="max-width:480px" onclick="cancelSub()">
      Cancel Subscription
    </button>`}
  `;
}

async function startCheckout() {
  try {
    const data = await apiFetch("/api/create-checkout", "POST");
    window.location.href = data.url;
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function cancelSub() {
  if (!confirm("Cancel your subscription? You'll keep access until the end of the billing period.")) return;
  try {
    await apiFetch("/api/cancel-subscription", "POST");
    showToast("Subscription will cancel at end of billing period.", "success");
  } catch (e) {
    showToast(e.message, "error");
  }
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
          Enter your DVSA theory test certificate to start monitoring. Slots will appear directly in your dashboard.
        </div>
        <form id="add-form">
          <div class="form-group">
            <label>🪪 Driving Licence Number <span style="color:var(--muted);font-size:0.8rem">(optional — only needed to book)</span></label>
            <input type="text" id="m-licence" placeholder="e.g. JONES961102W99YT" />
          </div>
          <div class="form-group">
            <label>📋 Theory Test Pass Certificate Number <span style="color:var(--danger)">*</span></label>
            <input type="text" id="m-theory" placeholder="e.g. C1234567890A" required />
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
      await apiFetch("/api/monitors", "POST", {
        dvsa_licence: document.getElementById("m-licence").value || "",
        dvsa_theory: document.getElementById("m-theory").value,
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
  showToast("Test started! Results will appear in dashboard in ~60 seconds.", "success");
  setTimeout(() => renderMonitors(document.getElementById("main-content")), 65000);
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
    credentials: "include",
    headers: { "Content-Type": "application/json" }
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

// ─── Push Notifications ───────────────────────────────────────────────────────
async function getPushState() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission;
}

async function getSwRegistration() {
  await navigator.serviceWorker.register("/sw.js");
  return navigator.serviceWorker.ready;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function subscribePush() {
  if (!("Notification" in window)) {
    showToast("Push notifications not supported in this browser.", "error");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Notification permission denied.", "error");
    document.getElementById("push-btn-wrap").innerHTML =
      `<span class="push-denied">🔕 Notifications blocked in browser</span>`;
    return;
  }

  try {
    const { key } = await apiFetch("/api/push/vapid-public-key");
    const reg = await getSwRegistration();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
    await apiFetch("/api/push/subscribe", "POST", sub.toJSON());
    showToast("🔔 Push notifications enabled!", "success");
    document.getElementById("push-btn-wrap").innerHTML =
      `<button class="btn btn-push btn-push-on" onclick="unsubscribePush()">🔔 Notifications On</button>`;
  } catch (e) {
    showToast("Could not enable notifications: " + e.message, "error");
  }
}

async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await apiFetch("/api/push/unsubscribe", "DELETE", { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    showToast("Notifications turned off.", "success");
    document.getElementById("push-btn-wrap").innerHTML =
      `<button class="btn btn-push" onclick="subscribePush()">🔔 Enable Notifications</button>`;
  } catch (e) {
    showToast("Error: " + e.message, "error");
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
render();
