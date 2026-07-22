// Verify the graceful fallback for a clip the browser cannot preview,
// and that detection still succeeds for it.
const puppeteer = require("puppeteer-core");
const URL = process.argv[2];
const VID = process.argv[3];
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const clickByText = (page, text) =>
  page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, text);

const waitFor = async (page, fn, ms, label) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("   TIMEOUT:", label);
  return false;
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  const ready = await waitFor(page, () => /Ready/.test(document.querySelector("header")?.innerText || ""), 180000, "Ready");
  console.log("1. service:", ready ? "Ready" : "NOT READY");
  if (!ready) { await browser.close(); process.exit(1); }

  const input = await page.$('input[type="file"]');
  await input.uploadFile(VID);

  const fallback = await waitFor(page, () => /Clip ready to analyze/.test(document.body.innerText), 25000, "fallback card");
  console.log("2. graceful fallback shown (no broken player):", fallback);

  const info = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      brokenPlayerText: /No video with supported format/i.test(t),
      details: (t.match(/test_clip\.avi[^\n]*/) || [null])[0],
      note: /still be\s+analyzed/i.test(t),
      button: [...document.querySelectorAll("button")].map(b => b.innerText.trim()).find(t => /Detect PPE in video/i.test(t)),
    };
  });
  console.log("3. browser error text present:", info.brokenPlayerText, "(should be false)");
  console.log("4. file details shown:", info.details);
  console.log("5. reassurance note shown:", info.note);
  console.log("6. video mode active:", info.button || "NO");

  await clickByText(page, "Detect PPE in video");
  const done = await waitFor(page,
    () => /Annotated video/.test(document.body.innerText) &&
          [...document.querySelectorAll("video")].some(v => (v.src||"").length && !v.src.startsWith("blob:")),
    300000, "annotated video");
  console.log("7. detection still succeeded on unplayable format:", done);

  const verdict = await page.evaluate(() => (document.body.innerText.match(/Violations found|All clear/) || [null])[0]);
  console.log("8. verdict:", verdict);

  await page.screenshot({ path: "C:/tmp/unplayable_result.png", fullPage: true });
  await browser.close();
  process.exit(fallback && done ? 0 : 1);
})();
