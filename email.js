const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendWelcomeEmail(to) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: `"DVSA Slot Monitor" <${process.env.SMTP_USER}>`,
    to,
    subject: "✅ Welcome to DVSA Slot Monitor",
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#003082,#c8102e,#003082);padding:14px 24px;display:flex;align-items:center;gap:12px">
          <span style="font-size:1.4rem">🇬🇧</span>
          <span style="color:#fff;font-weight:700;letter-spacing:0.1em;font-size:0.85rem">DVSA · SLOT MONITOR</span>
        </div>
        <div style="padding:32px 28px">
          <h2 style="margin-bottom:8px">Account Created 🎉</h2>
          <p style="color:#888;margin-bottom:24px">You're now signed up to monitor London DVSA practical test cancellations.</p>
          <div style="background:#1a1a26;border:1px solid #2a2a3a;border-radius:10px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 8px;font-weight:600">Next Steps:</p>
            <ol style="color:#aaa;padding-left:20px;line-height:2">
              <li>Log in to your dashboard</li>
              <li>Click <strong style="color:#fff">"Add New Monitor"</strong></li>
              <li>Enter your DVSA credentials & Telegram details</li>
              <li>Hit <strong style="color:#fff">Test</strong> to confirm it works</li>
            </ol>
          </div>
          <a href="${process.env.APP_URL || "https://dvsa-slot-monitor-production.up.railway.app"}"
             style="display:inline-block;background:#6c63ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Go to Dashboard →
          </a>
        </div>
        <div style="padding:16px 28px;border-top:1px solid #2a2a3a;color:#555;font-size:0.75rem">
          DVSA Slot Monitor · London UK · You registered with ${to}
        </div>
      </div>
    `
  });
}

async function sendSlotAlertEmail(to, slots) {
  if (!process.env.SMTP_USER) return;
  const rows = slots.map(s =>
    `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a3a;font-weight:600">📍 ${s.name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #2a2a3a;color:#00d4aa">${s.dates.join(", ")}</td>
    </tr>`
  ).join("");

  await transporter.sendMail({
    from: `"DVSA Slot Monitor" <${process.env.SMTP_USER}>`,
    to,
    subject: "🚗 DVSA Test Slots Available in London!",
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(90deg,#003082,#c8102e,#003082);padding:14px 24px">
          <span style="color:#fff;font-weight:700;letter-spacing:0.1em;font-size:0.85rem">🇬🇧 DVSA · SLOT MONITOR</span>
        </div>
        <div style="padding:32px 28px">
          <h2 style="color:#2ed573;margin-bottom:4px">🚗 Slots Available Now!</h2>
          <p style="color:#888;margin-bottom:24px">Practical test slots have opened at London centres.</p>
          <table style="width:100%;border-collapse:collapse;background:#1a1a26;border-radius:10px;overflow:hidden;border:1px solid #2a2a3a;margin-bottom:24px">
            <thead>
              <tr style="background:#12121a">
                <th style="padding:10px 14px;text-align:left;color:#888;font-size:0.8rem">CENTRE</th>
                <th style="padding:10px 14px;text-align:left;color:#888;font-size:0.8rem">AVAILABLE DATES</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <a href="https://www.gov.uk/book-driving-test"
             style="display:inline-block;background:#2ed573;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
            Book Now →
          </a>
          <p style="color:#555;font-size:0.8rem;margin-top:20px">Slots go fast — book immediately!</p>
        </div>
      </div>
    `
  });
}

module.exports = { sendWelcomeEmail, sendSlotAlertEmail };
