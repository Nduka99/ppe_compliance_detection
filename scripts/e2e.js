// Live end-to-end check of the deployed app.
const puppeteer = require("puppeteer-core");
const URL = process.argv[2];
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const clickByText = (page, text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, text);

const waitForText = async (page, regex, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = await page.evaluate(() => document.body.innerText);
    const m = t.match(regex);
    if (m) return m[0];
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  const online = await waitForText(page, /Online/, 180000);
  console.log("1. backend:", online || "NOT ONLINE");
  if (!online) { console.log(errors); await browser.close(); process.exit(1); }

  await clickByText(page, "Try an example image");
  await page.waitForSelector('img[alt="Uploaded"]', { timeout: 20000 });
  console.log("2. example loaded");

  await clickByText(page, "Detect PPE");
  console.log("3. detection started");

  const verdict = await waitForText(page, /Violations found|All clear/, 150000);
  console.log("4. result:", verdict || "TIMED OUT");

  const detail = await page.evaluate(() => {
    const t = document.body.innerText;
    const items = [...t.matchAll(/(Hard hat|Missing hard hat|Safety vest|Missing vest|Worker)\s+(\d+)%/g)]
      .map((m) => `${m[1]} ${m[2]}%`);
    const stats = (t.match(/\d+ workers? · \d+ detections? total/) || [null])[0];
    return { items, stats };
  });
  console.log("5. detections:", detail.items.join(", ") || "none listed");
  console.log("6. stats:", detail.stats || "none");
  console.log("console errors:", errors.length ? errors : "none");
  await browser.close();
  process.exit(verdict ? 0 : 1);
})();
