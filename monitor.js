const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
chromium.use(StealthPlugin());

const DVSA_BASE = "https://driverpracticaltest.dvsa.gov.uk";

const LONDON_KEYWORDS = [
  "belsize", "chiswick", "croydon", "enfield", "goodmayes",
  "hammersmith", "hendon", "norwood", "sidcup", "southwark",
  "tolworth", "walthamstow", "wood green", "london"
];

async function sendTelegram(token, chatId, message) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" })
    });
    return await res.json();
  } catch (e) {
    console.error("Telegram error:", e.message);
  }
}

async function checkDVSA(licence, theoryPass) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      locale: "en-GB",
      timezoneId: "Europe/London",
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    const capturedCentres = [];

    page.on("response", async (response) => {
      try {
        const url = response.url();
        if (url.includes("/api/v1/test-centres") && !url.includes("/slots")) {
          const data = await response.json();
          if (data?.testCentres?.length) capturedCentres.push(...data.testCentres);
        }
      } catch {}
    });

    // Step 1: Load the site
    await page.goto(`${DVSA_BASE}/`, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1500);

    // Step 2: Log in with DVSA credentials
    const loginUrl = await page.url();
    console.log("Page URL:", loginUrl);

    // Look for licence number field
    try {
      await page.fill('input[name="licenceNumber"], input[id*="licence"], input[id*="license"]', licence);
      await page.fill('input[name="theoryTestPassCertificateNumber"], input[id*="theory"]', theoryPass);
      await page.click('button[type="submit"], input[type="submit"]');
      await page.waitForNavigation({ waitUntil: "networkidle", timeout: 15000 });
    } catch (e) {
      console.log("Login form not found:", e.message.split("\n")[0]);
    }

    // Step 3: Navigate to find test centres
    const searches = ["London", "Croydon", "Enfield", "Walthamstow", "Sidcup"];
    for (const q of searches) {
      try {
        await page.goto(`${DVSA_BASE}/find-test-centre?testType=car&query=${encodeURIComponent(q)}`, {
          waitUntil: "networkidle", timeout: 12000
        });
        await page.waitForTimeout(800);
      } catch {}
    }

    // Filter London centres
    const seen = new Set();
    const londonCentres = capturedCentres.filter(c => {
      if (seen.has(c.testCentreId)) return false;
      seen.add(c.testCentreId);
      return LONDON_KEYWORDS.some(k => (c.name || "").toLowerCase().includes(k));
    });

    if (!londonCentres.length) {
      return { success: false, error: "Could not access DVSA - login may be required or site is blocking requests" };
    }

    // Step 4: Check slots for each centre
    const available = [];
    const today = new Date().toISOString().split("T")[0];

    for (const centre of londonCentres) {
      const slots = { data: null };
      const handler = async (r) => {
        try {
          if (r.url().includes(`/test-centres/${centre.testCentreId}/slots`))
            slots.data = await r.json();
        } catch {}
      };
      page.on("response", handler);
      try {
        await page.goto(
          `${DVSA_BASE}/find-test-centre/${centre.testCentreId}?testType=car&dateFrom=${today}`,
          { waitUntil: "networkidle", timeout: 10000 }
        );
        await page.waitForTimeout(400);
      } catch {}
      page.off("response", handler);

      if (slots.data) {
        const dates = slots.data?.slotDates || slots.data?.slots || [];
        if (dates.length > 0) available.push({ name: centre.name, dates: dates.slice(0, 5) });
      }
    }

    return { success: true, available, checked: londonCentres.length };
  } finally {
    await browser.close();
  }
}

async function runMonitor(monitor) {
  console.log(`Running monitor ${monitor.id}...`);
  try {
    const result = await checkDVSA(monitor.dvsa_licence, monitor.dvsa_theory);

    if (result.success && result.available.length > 0) {
      const lines = result.available.map(c =>
        `📍 <b>${c.name}</b>\n🗓 ${c.dates.join(", ")}`
      ).join("\n\n");

      await sendTelegram(
        monitor.telegram_token,
        monitor.telegram_chat_id,
        `🚗 <b>DVSA Practical Test Slots in London!</b>\n\n${lines}\n\n👉 <a href="https://www.gov.uk/book-driving-test">Book Now</a>`
      );

      return { status: "slots_found", available: result.available };
    } else if (!result.success) {
      return { status: "error", error: result.error };
    }

    return { status: "no_slots", checked: result.checked };
  } catch (e) {
    console.error(`Monitor ${monitor.id} error:`, e.message);
    return { status: "error", error: e.message };
  }
}

module.exports = { runMonitor, sendTelegram };
