const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cron = require("node-cron");
const cors = require("cors");
const path = require("path");
const db = require("./db");
const { runMonitor, sendTelegram } = require("./monitor");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dvsa-monitor-secret-2024";
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Auth Middleware ───────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ─── Auth Routes ───────────────────────────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const stmt = db.prepare("INSERT INTO users (email, password) VALUES (?, ?)");
    const result = stmt.run(email.toLowerCase().trim(), hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(400).json({ error: "Email already registered" });
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email?.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: "Invalid email or password" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid email or password" });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, email: user.email });
});

// ─── Monitor Routes ────────────────────────────────────────────────────────────
app.get("/api/monitors", auth, (req, res) => {
  const monitors = db.prepare("SELECT * FROM monitors WHERE user_id = ?").all(req.user.id);
  // Mask credentials for display
  const safe = monitors.map(m => ({
    ...m,
    dvsa_licence: m.dvsa_licence.substring(0, 4) + "****",
    dvsa_theory: "****",
  }));
  res.json(safe);
});

app.post("/api/monitors", auth, (req, res) => {
  const { dvsa_licence, dvsa_theory, telegram_token, telegram_chat_id } = req.body;
  if (!dvsa_licence || !dvsa_theory || !telegram_token || !telegram_chat_id) {
    return res.status(400).json({ error: "All fields required" });
  }

  const stmt = db.prepare(`
    INSERT INTO monitors (user_id, dvsa_licence, dvsa_theory, telegram_token, telegram_chat_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(req.user.id, dvsa_licence.trim(), dvsa_theory.trim(), telegram_token.trim(), telegram_chat_id.trim());
  res.json({ id: result.lastInsertRowid, message: "Monitor created" });
});

app.delete("/api/monitors/:id", auth, (req, res) => {
  db.prepare("DELETE FROM monitors WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ message: "Deleted" });
});

app.patch("/api/monitors/:id/toggle", auth, (req, res) => {
  const monitor = db.prepare("SELECT * FROM monitors WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE monitors SET active = ? WHERE id = ?").run(monitor.active ? 0 : 1, monitor.id);
  res.json({ active: !monitor.active });
});

// Manual test trigger
app.post("/api/monitors/:id/test", auth, async (req, res) => {
  const monitor = db.prepare("SELECT * FROM monitors WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });

  res.json({ message: "Test started — check your Telegram in ~60 seconds" });

  // Run in background
  runMonitor(monitor).then(result => {
    db.prepare("UPDATE monitors SET last_checked = CURRENT_TIMESTAMP, last_result = ? WHERE id = ?")
      .run(JSON.stringify(result), monitor.id);
    if (result.status === "no_slots") {
      sendTelegram(monitor.telegram_token, monitor.telegram_chat_id,
        `🔍 <b>Manual Check Complete</b>\n\nNo slots available right now across all London centres.\n🔄 Auto-check runs every 5 minutes.`
      );
    }
  });
});

app.get("/api/alerts/:monitorId", auth, (req, res) => {
  const monitor = db.prepare("SELECT id FROM monitors WHERE id = ? AND user_id = ?").get(req.params.monitorId, req.user.id);
  if (!monitor) return res.status(404).json({ error: "Not found" });
  const alerts = db.prepare("SELECT * FROM alerts WHERE monitor_id = ? ORDER BY sent_at DESC LIMIT 20").all(req.params.monitorId);
  res.json(alerts);
});

// ─── Cron: Every 5 minutes ─────────────────────────────────────────────────────
cron.schedule("*/5 * * * *", async () => {
  const monitors = db.prepare("SELECT * FROM monitors WHERE active = 1").all();
  console.log(`[CRON] Running ${monitors.length} active monitors`);

  for (const monitor of monitors) {
    const result = await runMonitor(monitor);
    db.prepare("UPDATE monitors SET last_checked = CURRENT_TIMESTAMP, last_result = ? WHERE id = ?")
      .run(JSON.stringify(result), monitor.id);

    if (result.status === "slots_found") {
      result.available.forEach(slot => {
        db.prepare("INSERT INTO alerts (monitor_id, centre_name, slot_dates) VALUES (?, ?, ?)")
          .run(monitor.id, slot.name, slot.dates.join(", "));
      });
    }
  }
});

// ─── Serve frontend ────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`DVSA Monitor running on http://localhost:${PORT}`));
