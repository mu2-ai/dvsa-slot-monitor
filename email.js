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

const APP_URL = process.env.APP_URL || "https://dvsa-slot-monitor-production.up.railway.app";
const FROM = `"DVSA Slot Monitor" <${process.env.SMTP_USER}>`;

const header = `
  <div style="background:linear-gradient(90deg,#003082,#c8102e,#003082);padding:14px 24px;display:flex;align-items:center;gap:12px">
    <span style="font-size:1.3rem">🇬🇧</span>
    <span style="color:#fff;font-weight:700;letter-spacing:0.1em;font-size:0.85rem">DVSA · SLOT MONITOR</span>
  </div>`;

const footer = (email) => `
  <div style="padding:16px 28px;border-top:1px solid #2a2a3a;color:#555;font-size:0.75rem">
    DVSA Slot Monitor · London UK · ${email}
  </div>`;

async function sendVerificationEmail(to, token) {
  if (!process.env.SMTP_USER) return;
  const link = `${APP_URL}/api/verify-email/${token}`;
  await transporter.sendMail({
    from: FROM, to,
    subject: "✉️ Verify your DVSA Slot Monitor account",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
        ${header}
        <div style="padding:32px 28px">
          <h2 style="margin-bottom:8px">Verify your email 📧</h2>
          <p style="color:#888;margin-bottom:28px;line-height:1.6">
            Thanks for signing up! Click the button below to verify your email address and activate your account.
          </p>
          <a href="${link}" style="display:inline-block;background:#6c63ff;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem">
            Verify Email Address →
          </a>
          <p style="color:#555;font-size:0.8rem;margin-top:20px">
            This link expires in <strong style="color:#888">24 hours</strong>.<br/>
            If you didn't sign up, ignore this email.
          </p>
        </div>
        ${footer(to)}
      </div>`
  });
}

async function sendWelcomeEmail(to) {
  if (!process.env.SMTP_USER) return;
  await transporter.sendMail({
    from: FROM, to,
    subject: "✅ Welcome to DVSA Slot Monitor — Account Verified!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
        ${header}
        <div style="padding:32px 28px">
          <h2 style="margin-bottom:8px">You're all set! 🎉</h2>
          <p style="color:#888;margin-bottom:24px">Your account is verified. You have a <strong style="color:#fff">7-day free trial</strong> — no card needed.</p>
          <div style="background:#1a1a26;border:1px solid #2a2a3a;border-radius:10px;padding:20px;margin-bottom:24px">
            <p style="margin:0 0 10px;font-weight:600">To start monitoring:</p>
            <ol style="color:#aaa;padding-left:20px;line-height:2.2">
              <li>Log in to your dashboard</li>
              <li>Click <strong style="color:#fff">"Add New Monitor"</strong></li>
              <li>Enter your DVSA credentials &amp; Telegram details</li>
              <li>Hit <strong style="color:#fff">Test</strong> to confirm it works</li>
            </ol>
          </div>
          <a href="${APP_URL}" style="display:inline-block;background:#6c63ff;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Go to Dashboard →
          </a>
        </div>
        ${footer(to)}
      </div>`
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
    from: FROM, to,
    subject: "🚗 DVSA Test Slots Available in London!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e8e8f0;border-radius:12px;overflow:hidden">
        ${header}
        <div style="padding:32px 28px">
          <h2 style="color:#2ed573;margin-bottom:4px">🚗 Slots Available Now!</h2>
          <p style="color:#888;margin-bottom:24px">Practical test slots have opened at London centres — book fast!</p>
          <table style="width:100%;border-collapse:collapse;background:#1a1a26;border-radius:10px;overflow:hidden;border:1px solid #2a2a3a;margin-bottom:24px">
            <thead><tr style="background:#12121a">
              <th style="padding:10px 14px;text-align:left;color:#888;font-size:0.8rem">CENTRE</th>
              <th style="padding:10px 14px;text-align:left;color:#888;font-size:0.8rem">AVAILABLE DATES</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <a href="https://www.gov.uk/book-driving-test" style="display:inline-block;background:#2ed573;color:#000;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700">
            Book Now →
          </a>
        </div>
        ${footer(to)}
      </div>`
  });
}

module.exports = { sendVerificationEmail, sendWelcomeEmail, sendSlotAlertEmail };
