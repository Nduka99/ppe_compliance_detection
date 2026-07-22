// End-to-end test of BOTH formats: image and video.
const puppeteer = require("puppeteer-core");
const URL = process.argv[2];
const IMG = process.argv[3];
const VID = process.argv[4];
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
  console.log("   TIMEOUT waiting for:", label);
  return false;
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 200)));

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  const ready = await waitFor(page, () => /Ready/.test(document.querySelector("header")?.innerText || ""), 120000, "Ready badge");
  console.log("1. service status:", ready ? "Ready" : "NOT READY");
  if (!ready) { console.log(errors); await browser.close(); process.exit(1); }

  // ---------- IMAGE ----------
  console.log("\n--- IMAGE FLOW ---");
  let input = await page.$('input[type="file"]');
  await input.uploadFile(IMG);
  await page.waitForSelector('img[alt="Uploaded"]', { timeout: 20000 });
  console.log("2. image uploaded");
  await clickByText(page, "Detect PPE");
  const imgDone = await waitFor(page,
    () => !!document.querySelector('img[alt="Detection result with bounding boxes"]'), 120000, "annotated image");
  console.log("3. annotated image rendered:", imgDone);
  const imgSummary = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      verdict: (t.match(/Violations found|All clear/) || [null])[0],
      stats: (t.match(/\d+ workers? · \d+ detections? total/) || [null])[0],
    };
  });
  console.log("4. image verdict:", imgSummary.verdict, "|", imgSummary.stats);

  // ---------- VIDEO ----------
  console.log("\n--- VIDEO FLOW ---");
  const remove = await page.$('button[aria-label="Remove file"]');
  if (remove) await remove.click();
  await new Promise((r) => setTimeout(r, 800));
  input = await page.$('input[type="file"]');
  await input.uploadFile(VID);
  const vidPreview = await waitFor(page, () => !!document.querySelector("video"), 25000, "video preview");
  console.log("5. video uploaded, preview shown:", vidPreview);

  const btnLabel = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.innerText.trim()).find((t) => /Detect PPE in video/i.test(t)));
  console.log("6. button switched to video mode:", btnLabel || "NOT FOUND");
  await clickByText(page, "Detect PPE in video");

  const vidDone = await waitFor(page,
    () => /Annotated video/.test(document.body.innerText) &&
          [...document.querySelectorAll("video")].some((v) => (v.src || "").length > 0 && !v.src.startsWith("blob:")),
    300000, "annotated video");
  console.log("7. annotated video returned:", vidDone);

  const vidSummary = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      verdict: (t.match(/Violations found|All clear/) || [null])[0],
      frames: (t.match(/appear in \d+ of \d+ analyzed frames|No PPE violations across \d+ analyzed frames/) || [null])[0],
      peak: (t.match(/Peak of \d+ workers? in frame[^\n]*/) || [null])[0],
      download: /Download annotated video/.test(t),
    };
  });
  console.log("8. video verdict:", vidSummary.verdict);
  console.log("9. frames line:", vidSummary.frames);
  console.log("10. peak/duration:", vidSummary.peak);
  console.log("11. download link present:", vidSummary.download);

  // jargon check on rendered text
  const jargon = await page.evaluate(() => {
    const t = document.body.innerText;
    return ["YOLO", "ONNX", "Gradio", "HuggingFace", "backend", "mAP", "Model card"]
      .filter((w) => new RegExp(w, "i").test(t));
  });
  console.log("\n12. jargon/model leaks in visible text:", jargon.length ? jargon : "none");
  console.log("console errors:", errors.length ? errors : "none");

  await page.screenshot({ path: "C:/tmp/video_result.png", fullPage: true });
  await browser.close();
  process.exit(imgDone && vidDone ? 0 : 1);
})();
