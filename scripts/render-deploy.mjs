import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { mkdir } from "fs/promises";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVICE_NAME = "dablabs-store";
const ONRENDER = "dablabs-store.onrender.com";
const GITHUB_REPO = "https://github.com/leaflock420-weedman/dablabs-store";
const PROFILE_CANDIDATES = [
  path.join(root, ".chrome-deploy-profile"),
  path.join(path.dirname(root), "leaflock-store-v2", ".chrome-deploy-profile"),
  path.join(path.dirname(root), "leaflock-pharmacy-crm", ".chrome-render-profile"),
];
const CDP_PORTS = [9225, 9224, 9223, 9222, 9333];
const DEPLOY_PROFILE = path.join(root, ".chrome-deploy-profile");
const PLAYWRIGHT_ROOT = path.join(path.dirname(root), "route-runner");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function screenshot(page, name) {
  const file = path.join(root, name);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`Screenshot: ${name}`);
}

async function connectCdp() {
  for (const port of CDP_PORTS) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      console.log(`Connected to Chrome CDP on port ${port}`);
      return browser;
    } catch {}
  }
  return null;
}

async function launchDebugChrome() {
  const { spawn } = await import("child_process");
  const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  await mkdir(DEPLOY_PROFILE, { recursive: true });
  spawn(
    chrome,
    [
      "--remote-debugging-port=9225",
      `--user-data-dir=${DEPLOY_PROFILE}`,
      "--no-first-run",
      "--no-default-browser-check",
      `https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`,
    ],
    { detached: true, stdio: "ignore" }
  ).unref();
  console.log("Started Chrome on debug port 9225");
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const browser = await connectCdp();
    if (browser) return browser;
  }
  return null;
}

async function clickFirst(page, makers, timeout = 4000) {
  for (const make of makers) {
    try {
      const el = make(page).first();
      if (await el.isVisible({ timeout })) {
        await el.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function waitForLogin(page) {
  const body = await page.locator("body").innerText().catch(() => "");
  if (!/sign in to render/i.test(body)) return true;

  console.log("Sign in to Render in the Chrome window (up to 3 minutes)...");
  const start = Date.now();
  while (Date.now() - start < 180000) {
    await sleep(3000);
    const text = await page.locator("body").innerText().catch(() => "");
    if (!/sign in to render/i.test(text)) {
      console.log("Render login detected");
      return true;
    }
  }
  return false;
}

async function fillSecretEnvVars(page, env) {
  const secrets = [
    ["PAYPAL_SANDBOX_CLIENT_ID", env.PAYPAL_SANDBOX_CLIENT_ID],
    ["PAYPAL_SANDBOX_CLIENT_SECRET", env.PAYPAL_SANDBOX_CLIENT_SECRET],
  ].filter(([, v]) => v);

  for (const [key, value] of secrets) {
    const row = page.locator(`text=${key}`).first();
    if (!(await row.isVisible({ timeout: 2000 }).catch(() => false))) continue;
    const input = row.locator("xpath=ancestor::*[1]//input | following::input[1]").first();
    if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
      await input.fill(value);
      console.log(`Filled ${key}`);
    }
  }
}

async function fillBlueprintName(page) {
  const input = page.getByLabel(/blueprint name/i).first();
  if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
    await input.fill("dablabs-store");
    console.log("Filled Blueprint Name");
    return true;
  }
  return false;
}

async function deployViaOneClick(page, env) {
  console.log("Opening one-click Blueprint deploy...");
  await page.goto(`https://render.com/deploy?repo=${encodeURIComponent(GITHUB_REPO)}`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await sleep(5000);
  await waitForLogin(page);
  await fillBlueprintName(page);
  await fillSecretEnvVars(page, env);
  await screenshot(page, "render-step-1-deploy.png");

  return clickFirst(page, [
    (p) => p.getByRole("button", { name: /deploy blueprint/i }),
    (p) => p.getByRole("button", { name: /^apply$/i }),
    (p) => p.locator("button:has-text('Deploy Blueprint')"),
    (p) => p.locator("button:has-text('Apply')"),
  ], 10000);
}

async function openExistingService(page) {
  const link = page.getByRole("link", { name: new RegExp(SERVICE_NAME, "i") }).first();
  if (await link.isVisible({ timeout: 5000 }).catch(() => false)) {
    await link.click();
    await sleep(3000);
    return true;
  }
  return false;
}

async function setEnvOnService(page, env) {
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  if (!(await openExistingService(page))) return false;

  const envTab = page.getByRole("link", { name: /^environment$/i }).first();
  if (await envTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await envTab.click();
    await sleep(2000);
  }

  const pairs = [
    ["PAYPAL_MODE", env.PAYPAL_MODE || "sandbox"],
    ["PAYPAL_SANDBOX_CLIENT_ID", env.PAYPAL_SANDBOX_CLIENT_ID],
    ["PAYPAL_SANDBOX_CLIENT_SECRET", env.PAYPAL_SANDBOX_CLIENT_SECRET],
    ["STORE_EMAIL", env.STORE_EMAIL || "hello@dablabs.com.au"],
  ].filter(([, v]) => v);

  for (const [key, value] of pairs) {
    const existing = page.locator(`text=${key}`).first();
    if (await existing.isVisible({ timeout: 1500 }).catch(() => false)) {
      const edit = existing.locator("xpath=ancestor::*[1]//button | following::button[1]").first();
      if (await edit.isVisible({ timeout: 1000 }).catch(() => false)) await edit.click();
    } else {
      await clickFirst(page, [
        (p) => p.getByRole("button", { name: /add environment variable/i }),
        (p) => p.locator("button:has-text('Add Environment Variable')"),
      ], 3000);
      await sleep(1000);
    }
    const keyInput = page.getByPlaceholder(/key/i).or(page.locator("input[name='key']")).first();
    const valInput = page.getByPlaceholder(/value/i).or(page.locator("input[name='value'], textarea[name='value']")).first();
    if (await keyInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await keyInput.fill(key);
      await valInput.fill(value);
      await clickFirst(page, [
        (p) => p.getByRole("button", { name: /^save/i }),
        (p) => p.locator("button:has-text('Save')"),
      ], 3000);
      console.log(`Set env ${key}`);
      await sleep(1500);
    }
  }

  await clickFirst(page, [
    (p) => p.getByRole("button", { name: /manual deploy/i }),
    (p) => p.locator("button:has-text('Manual Deploy')"),
  ], 5000);
  return true;
}

async function verifyLive() {
  const base = `https://${ONRENDER}`;
  for (let attempt = 1; attempt <= 40; attempt++) {
    try {
      const [home, health, config] = await Promise.all([
        fetch(`${base}/`, { redirect: "follow" }),
        fetch(`${base}/api/health`),
        fetch(`${base}/api/paypal/config`),
      ]);
      const healthJson = health.ok ? await health.json() : null;
      const configJson = config.ok ? await config.json() : null;
      const homeText = home.ok ? await home.text() : "";
      console.log(
        `${base} home=${home.status} health=${health.status} paypal=${config.status} (attempt ${attempt})`
      );
      if (
        home.status === 200 &&
        homeText.includes("Dab Labs") &&
        healthJson?.ok &&
        configJson?.configured
      ) {
        return true;
      }
    } catch (e) {
      console.log(`${base} -> error: ${e.message} (attempt ${attempt})`);
    }
    await sleep(15000);
  }
  return false;
}

async function main() {
  const env = loadEnv();
  let context;
  let ownsContext = false;

  let browser = await connectCdp();
  if (!browser) browser = await launchDebugChrome();
  if (browser) {
    context = browser.contexts()[0];
  } else {
    const profile = PROFILE_CANDIDATES.find((p) => existsSync(p)) || DEPLOY_PROFILE;
    console.log(`Launching Chrome with profile: ${profile}`);
    await mkdir(profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, {
      channel: "chrome",
      headless: false,
      viewport: { width: 1440, height: 900 },
      args: ["--disable-blink-features=AutomationControlled", "--remote-debugging-port=9225"],
    });
    ownsContext = true;
  }

  const page = context.pages().find((p) => /render/i.test(p.url())) || context.pages()[0] || (await context.newPage());
  await page.bringToFront();
  await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);
  await waitForLogin(page);

  let onService = await openExistingService(page);
  if (!onService) {
    const ok = await deployViaOneClick(page, env);
    if (ok) {
      console.log("Blueprint deploy submitted");
      await sleep(8000);
    }
    await page.goto("https://dashboard.render.com/", { waitUntil: "domcontentloaded" });
    onService = await openExistingService(page);
  }

  if (onService) await setEnvOnService(page, env);

  await screenshot(page, "render-deploy.png");

  const ok = await verifyLive();
  console.log(ok ? `SUCCESS — https://${ONRENDER}` : `Building — check https://${ONRENDER}`);

  if (ownsContext) console.log("Chrome left open for any remaining steps.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});