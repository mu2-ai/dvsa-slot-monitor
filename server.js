const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const session = require("express-session");
const SqliteStore = require("better-sqlite3-session-store")(session);
const cron = require("node-cron");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { runMonitor, sendTelegram } = require("./monitor");
const { sendVerificationEmail, sendWelcomeEmail, sendSlotAlertEmail } = require("./email");

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dvsa-session-secret-2024";
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:" + PORT;

const stripe = STRIPE_SECRET ? require("stripe")(STRIPE_SECRET) : null;

// ─── Stripe webhook (raw body needed) ────────────────────────────────────────
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.sendStatus(200);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook error: ${e.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const customerId = session.customer;
    db.prepare("UPDATE users SET subscription_status = 'active', stripe_customer_id = ? WHERE stripe_customer_id = ?")
      .run(customerId, customerId);
    db.prepare("UPDATE users SET subscription_status = 'active' WHERE stripe_customer_id = ?")
      .run(customerId);
  }

  if (event.type === "customer.subscription.deleted" || event.type === "invoice.payment_failed") {
    const obj = event.data.object;
    const customerId = obj.customer;
    db.prepare("UPDATE users SET subscription_status = 'inactive' WHERE stripe_customer_id = ?").run(customerId);
  }

  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object;
    const status = sub.status === "active" ? "active" : "inactive";
    db.prepare("UPDATE users SET subscription_status = ? WHERE stripe_customer_id = ?").run(status, sub.customer);
  }

  res.sendStatus(200);
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(session({
  store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 900000 } }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Auth Middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Not logged in" });
  req.user = { id: req.session.userId, email: req.session.email };
  next();
}

function requireVerified(req, res, next) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user.verified) return res.status(403).json({ error: "Please verify your email first" });
  next();
}

function requireSubscription(req, res, next) {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > new Date();
  if (user.subscription_status === "active" || trialActive) return next();
  return res.status(402).json({ error: "Subscription required", upgrade: true });
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const verifyToken = crypto.randomBytes(32).toString("hex");
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare(`
      INSERT INTO users (email, password, verify_token, verify_expires)
      VALUES (?, ?, ?, ?)
    `).run(email.toLowerCase().trim(), hashed, verifyToken, verifyExpires);

    sendVerificationEmail(email, verifyToken).catch(e => console.error("Verify email error:", e.message));

    res.json({ message: "Account created! Please check your email to verify your account.", email });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/verify-email/:token", (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE verify_token = ?").get(req.params.token);
  if (!user) return res.redirect(`${APP_URL}/?verified=invalid`);
  if (new Date(user.verify_expires) < new Date()) return res.redirect(`${APP_URL}/?verified=expired`);

  db.prepare("UPDATE users SET verified = 1, verify_token = NULL, verify_expires = NULL WHERE id = ?").run(user.id);
  sendWelcomeEmail(user.email).catch(() => {});
  res.redirect(`${APP_URL}/?verified=success`);
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email?.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  if (!user.verified) return res.status(403).json({ error: "Please verify your email before logging in", unverified: true });

  req.session.userId = user.id;
  req.session.email = user.email;

  const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > new Date();
  res.json({
    email: user.email,
    subscription: user.subscription_status,
    trialActive,
    trialEnds: user.trial_ends_at
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out" });
  });
});

app.get("/api/me", auth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const trialActive = user.trial_ends_at && new Date(user.trial_ends_at) > new Date();
  res.json({
    email: user.email,
    verified: !!user.verified,
    subscription: user.subscription_status,
    trialActive,
    trialEnds: user.trial_ends_at
  });
});

app.post("/api/resend-verification", async (req, res) => {
  const { email } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email?.toLowerCase().trim());
  if (!user || user.verified) return res.json({ message: "OK" });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE users SET verify_token = ?, verify_expires = ? WHERE id = ?").run(token, expires, user.id);
  sendVerificationEmail(email, token).catch(() => {});
  res.json({ message: "Verification email resent" });
});

// ─── Stripe Payment Routes ────────────────────────────────────────────────────
app.post("/api/create-checkout", auth, requireVerified, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Payments not configured" });

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  let customerId = user.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email });
    customerId = customer.id;
    db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${APP_URL}/?payment=success`,
    cancel_url: `${APP_URL}/?payment=cancelled`,
    allow_promotion_codes: true
  });

  res.json({ url: session.url });
});

app.post("/api/cancel-subscription", auth, requireVerified, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Payments not configured" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (!user.stripe_customer_id) return res.status(400).json({ error: "No subscription found" });

  const subs = await stripe.subscriptions.list({ customer: user.stripe_customer_id, status: "active" });
  for (const sub of subs.data) {
    await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
  }
  res.json({ message: "Subscription will cancel at end of billing period" });
});

// ─── Monitor Routes ───────────────────────────────────────────────────────────
app.get("/api/monitors", auth, requireVerified, (req, res) => {
  const monitors = db.prepare("SELECT * FROM monitors WHERE user_id = ?").all(req.user.id);
  res.json(monitors.map(m => ({
    ...m,
    dvsa_licence: m.dvsa_licence.substring(0, 4) + "****",
    dvsa_theory: "****"
  })));
});

app.post("/api/monitors", auth, requireVerified, requireSubscription, (req, res) => {
  const { dvsa_licence, dvsa_theory, telegram_token, telegram_chat_id } = req.body;
  if (!dvsa_theory)
    return res.status(400).json({ error: "Theory test pass certificate number is required" });

  const result = db.prepare(`
    INSERT INTO monitors (user_id, dvsa_licence, dvsa_theory, telegram_token, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, (dvsa_licence || "").trim(), dvsa_theory.trim(), (telegram_token || "").trim(), (telegram_chat_id || "").trim());
  res.json({ id: result.lastInsertRowid, message: "Monitor created" });
});

app.delete("/api/monitors/:id", auth, requireVerified, (req, res) => {
  db.prepare("DELETE FROM monitors WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ message: "Deleted" });
});

app.patch("/api/monitors/:id/toggle", auth, requireVerified, (req, res) => {
  const monitor = db.prepare("SELECT * FROM monitors WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE monitors SET active = ? WHERE id = ?").run(monitor.active ? 0 : 1, monitor.id);
  res.json({ active: !monitor.active });
});

app.post("/api/monitors/:id/test", auth, requireVerified, requireSubscription, async (req, res) => {
  const monitor = db.prepare("SELECT * FROM monitors WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });

  res.json({ message: "Test started — results will appear in your dashboard in ~60 seconds" });
  runMonitor(monitor).then(result => {
    db.prepare("UPDATE monitors SET last_checked = CURRENT_TIMESTAMP, last_result = ? WHERE id = ?")
      .run(JSON.stringify(result), monitor.id);
    if (result.status === "slots_found") {
      result.available.forEach(slot => {
        db.prepare("INSERT INTO alerts (monitor_id, centre_name, slot_dates) VALUES (?, ?, ?)")
          .run(monitor.id, slot.name, slot.dates.join(", "));
      });
    }
  });
});

app.get("/api/alerts/:monitorId", auth, requireVerified, (req, res) => {
  const monitor = db.prepare("SELECT id FROM monitors WHERE id = ? AND user_id = ?").get(req.params.monitorId, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });
  const alerts = db.prepare("SELECT * FROM alerts WHERE monitor_id = ? ORDER BY sent_at DESC LIMIT 20").all(req.params.monitorId);
  res.json(alerts);
});

// ─── Cron ─────────────────────────────────────────────────────────────────────
cron.schedule("*/5 * * * *", async () => {
  const monitors = db.prepare(`
    SELECT m.*, u.email as user_email, u.subscription_status, u.trial_ends_at
    FROM monitors m JOIN users u ON m.user_id = u.id
    WHERE m.active = 1
  `).all();

  const active = monitors.filter(m => {
    const trialActive = m.trial_ends_at && new Date(m.trial_ends_at) > new Date();
    return m.subscription_status === "active" || trialActive;
  });

  console.log(`[CRON] Running ${active.length} active monitors`);

  for (const monitor of active) {
    const result = await runMonitor(monitor);
    db.prepare("UPDATE monitors SET last_checked = CURRENT_TIMESTAMP, last_result = ? WHERE id = ?")
      .run(JSON.stringify(result), monitor.id);

    if (result.status === "slots_found") {
      result.available.forEach(slot => {
        db.prepare("INSERT INTO alerts (monitor_id, centre_name, slot_dates) VALUES (?, ?, ?)")
          .run(monitor.id, slot.name, slot.dates.join(", "));
      });
      sendSlotAlertEmail(monitor.user_email, result.available).catch(console.error);
    }
  }
});

// ─── Frontend ─────────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`DVSA Monitor running on http://localhost:${PORT}`));
