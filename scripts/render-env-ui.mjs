import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { existsSync, readFileSync } from "fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const playwrightRoot = path.join(root, "..", "..", "route-runner");
const { chromium } = require(require.resolve("playwright", { paths: [playwrightRoot] }));

const SERVICE_ID = "srv-d8uvs16rnols73fp09i0";
const ONRENDER = "dablabs-store.onrender.com";

function loadEnv() {
  const envPath = path.join(root, ".env");
  const out = {};
  if (!existsSync(envPath)) return out;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function addVariable(page, key, value) {
  await page.getByRole("button", { name: /add variable/i }).click();
  await sleep(800);

  const row = page.locator('input[name*="envVarKey"]:not([readonly])').last();
  await row.fill(key);

  const valSelectors = [
    'input[name*="envVarValue"]:not([readonly])',
    'textarea[name*="envVarValue"]',
    'input[type="password"]',
    'input[placeholder*="value" i]',
  ];

  let filled = false;
  for (const sel of valSelectors) {
    const val = page.locator(sel).last();
    if (await val.isVisible({ timeout: 1000 }).catch(() => false)) {
      await val.fill(value);
      filled = true;
      break;
    }
  }

  if (!filled) {
    const rowContainer = row.locator("xpath=ancestor::div[1]/following-sibling::*[1]//input").first();
    await rowContainer.fill(value);
  }

  console.log(`Added ${key}`);
}

async function main() {
  const env = loadEnv();
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9225");
  const page = browser.contexts()[0].pages()[0];
  await page.bringToFront();
  await page.goto(`https://dashboard.render.com/web/${SERVICE_ID}/env`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await sleep(2000);

  await page.getByRole("button", { name: /^edit$/i }).first().click();
  console.log("Edit mode");
  await sleep(1500);

  for (const [key, value] of Object.entries({
    PAYPAL_SANDBOX_CLIENT_ID: env.PAYPAL_SANDBOX_CLIENT_ID,
    PAYPAL_SANDBOX_CLIENT_SECRET: env.PAYPAL_SANDBOX_CLIENT_SECRET,
  })) {
    if (!value) continue;
    const exists = await page.locator(`input[value="${key}"]`).isVisible({ timeout: 500 }).catch(() => false);
    if (!exists) await addVariable(page, key, value);
    else console.log(`Exists: ${key}`);
  }

  const saveBtn = page.locator("button").filter({ hasText: /^save/i });
  await saveBtn.first().click({ timeout: 15000 });
  console.log("Saved");
  await sleep(20000);

  for (let i = 1; i <= 30; i++) {
    const res = await fetch(`https://${ONRENDER}/api/paypal/config`);
    const json = await res.json();
    console.log(`paypal ${i}: configured=${json.configured}`);
    if (json.configured && json.clientId) {
      console.log(`SUCCESS — https://${ONRENDER}`);
      process.exit(0);
    }
    await sleep(15000);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});