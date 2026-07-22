import { chromium } from "playwright-core";

const routes = ["/", "/auth", "/terms", "/privacy", "/conduct", "/cookies", "/dmca",
  "/legal", "/virtual-goods", "/subscription-terms", "/csae-policy", "/eula",
  "/acceptable-use", "/sensitive-content", "/feed", "/discover", "/leaderboard",
  "/battles", "/store", "/rewards", "/crowns", "/frames", "/invite", "/verify-age"];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const issues = [];
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    // ignore expected noise: failed supabase fetches due to signed-out 401s etc.? keep all, filter later
    issues.push({ route: page.url(), text: t.slice(0, 300) });
  }
});
page.on("pageerror", (err) => issues.push({ route: page.url(), text: "PAGEERROR: " + String(err).slice(0, 300) }));

for (const r of routes) {
  try {
    await page.goto("http://127.0.0.1:8080" + r, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
  } catch (e) {
    issues.push({ route: r, text: "NAV-FAIL: " + String(e).slice(0, 200) });
  }
}
await browser.close();
const seen = new Set();
for (const i of issues) {
  const key = i.route + "|" + i.text;
  if (seen.has(key)) continue;
  seen.add(key);
  console.log(i.route, "→", i.text.replace(/\n/g, " "));
}
console.log("TOTAL UNIQUE:", seen.size);
