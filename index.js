import "dotenv/config";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import {
  TWO_CAPTCHA,
  SCREENSHOT_DIR,
  PROXY,
  HEADLESS,
} from "./utils/constants.js";
import { classifyFormsAI, mapFormToValues } from "./services/ai.js";
import { filterContactLinks, submitFormSmart } from "./services/forms.js";
import { setTimeout } from "node:timers/promises";
import TwoCaptcha from "@2captcha/captcha-solver";
chromium.use(stealth());

const solver = new TwoCaptcha.Solver(TWO_CAPTCHA.provider.token);

if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const MAX_CAPTCHA_RETRIES = 2;
async function waitForSubmissionSuccess(page) {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText.toLowerCase();

        return (
          text.includes("thank you") ||
          text.includes("success") ||
          text.includes("received") ||
          text.includes("we will contact you")
        );
      },
      { timeout: 8000 },
    );

    return true;
  } catch {
    return false;
  }
}

const log = {
  info: (msg) => console.log(`[CAPTCHA] ${msg}`),
  warn: (msg) => console.warn(`[CAPTCHA] ⚠  ${msg}`),
  error: (msg) => console.error(`[CAPTCHA] ✖  ${msg}`),
  ok: (msg) => console.log(`[CAPTCHA] ✔  ${msg}`),
};

const isValidSitekey = (key) =>
  typeof key === "string" && /^[\w-]{20,}$/.test(key);
async function solveCaptcha(page) {
  const url = page.url();
  log.info(`Scanning for captcha on ${url}`);

  // ── reCAPTCHA v3 ────────────────────────────────────────────────────────────
  const v3sitekey = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll("script[src]")];
    for (const s of scripts) {
      const match = s.src.match(/render=([^&]+)/);
      if (match && match[1] !== "explicit") return match[1];
    }
    return null;
  });

  if (v3sitekey && isValidSitekey(v3sitekey)) {
    const action = await page.evaluate(
      () =>
        document.querySelector("[data-action]")?.getAttribute("data-action") ??
        "submit",
    );
    log.info(
      `reCAPTCHA v3 detected (action="${action}", sitekey=${v3sitekey.slice(0, 12)}…)`,
    );

    log.info(`reCAPTCHA v3 — solving…`);
    const { data: token } = await solver.recaptcha({
      googlekey: v3sitekey,
      pageurl: url,
      version: "v3",
      action,
      score: 0.9,
    });
    log.info(`reCAPTCHA v3 — token received (${token.slice(0, 16)}…)`);

    await page.evaluate((t) => {
      document
        .querySelectorAll(
          "input[name=recaptcha_token], input[name=g-recaptcha-response]",
        )
        .forEach((el) => (el.value = t));

      if (typeof window.recaptchaCallback === "function")
        window.recaptchaCallback(t);

      const clients = window.__grecaptcha_cfg?.clients ?? {};
      for (const client of Object.values(clients)) {
        for (const val of Object.values(client)) {
          if (val && typeof val.callback === "function") {
            try {
              val.callback(t);
            } catch {}
          }
        }
      }
    }, token);

    log.ok(`reCAPTCHA v3 — token injected`);
    // v3 doesn't preclude a v2 widget being present too — fall through
  }
  let handled = !!v3sitekey;

  // ── reCAPTCHA v2 ────────────────────────────────────────────────────────────
  const v2sitekey = await page
    .$eval(".g-recaptcha, [data-sitekey]", (el) => {
      const key = el.getAttribute("data-sitekey");
      return key?.startsWith("6L") ? key : null;
    })
    .catch(() => null);

  if (v2sitekey && isValidSitekey(v2sitekey)) {
    log.info(`reCAPTCHA v2 detected (sitekey=${v2sitekey.slice(0, 12)}…)`);

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
      log.info(
        `reCAPTCHA v2 — solving (attempt ${attempt}/${MAX_CAPTCHA_RETRIES})`,
      );
      const { data: token } = await solver.recaptcha({
        googlekey: v2sitekey,
        pageurl: url,
      });
      log.info(`reCAPTCHA v2 — token received (${token.slice(0, 16)}…)`);

      const injected = await page.evaluate((t) => {
        const el = document.getElementById("g-recaptcha-response");
        if (el) {
          el.value = t;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }

        const clients = window.___grecaptcha_cfg?.clients ?? {};
        for (const client of Object.values(clients)) {
          for (const val of Object.values(client)) {
            if (val && typeof val.callback === "function") {
              try {
                val.callback(t);
                return true;
              } catch {}
            }
          }
        }
        return !!el;
      }, token);

      if (injected) {
        log.ok(`reCAPTCHA v2 — token injected`);
        break;
      } else {
        log.warn(
          `reCAPTCHA v2 — injection failed on attempt ${attempt}, ${attempt < MAX_CAPTCHA_RETRIES ? "retrying" : "giving up"}`,
        );
      }
    }
    return;
  }

  // ── hCaptcha ─────────────────────────────────────────────────────────────────
  const isTurnstile = await page.evaluate(() =>
    [...document.querySelectorAll("script[src]")].some((s) =>
      s.src.includes("challenges.cloudflare.com"),
    ),
  );
  const hkey = await page

    .$eval(
      ".h-captcha, [data-hcaptcha-sitekey]",
      (el) =>
        el.getAttribute("data-sitekey") ??
        el.getAttribute("data-hcaptcha-sitekey"),
    )
    .catch(() => null);

  if (hkey) {
    if (isTurnstile) {
      log.info(
        `Skipping hCaptcha — Turnstile script detected, deferring to Turnstile handler`,
      );
    } else {
      log.info(`hCaptcha detected (sitekey=${hkey.slice(0, 12)}…)`);

      for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
        log.info(
          `hCaptcha — solving (attempt ${attempt}/${MAX_CAPTCHA_RETRIES})`,
        );
        const { data: token } = await solver.hcaptcha({
          sitekey: hkey,
          pageurl: url,
        });
        log.info(`hCaptcha — token received (${token.slice(0, 16)}…)`);

        const injected = await page.evaluate((t) => {
          const el = document.querySelector("[name=h-captcha-response]");
          if (el) {
            el.value = t;
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
          if (typeof window.hcaptcha !== "undefined") {
            try {
              window.hcaptcha.submit();
              return true;
            } catch {}
          }
          return !!el;
        }, token);

        if (injected) {
          log.ok(`hCaptcha — token injected`);
          break;
        } else {
          log.warn(
            `hCaptcha — injection failed on attempt ${attempt}, ${attempt < MAX_CAPTCHA_RETRIES ? "retrying" : "giving up"}`,
          );
        }
      }
      return;
    }
  }

  // ── Cloudflare Turnstile ─────────────────────────────────────────────────────
  const tskey = await page
    .$eval(
      ".cf-turnstile, [data-cf-turnstile-sitekey]",
      (el) =>
        el.getAttribute("data-sitekey") ??
        el.getAttribute("data-cf-turnstile-sitekey"),
    )
    .catch(() => (isTurnstile ? hkey : null)); // fall back to the UUID we already found

  if (tskey) {
    log.info(`Cloudflare Turnstile detected (sitekey=${tskey.slice(0, 12)}…)`);

    for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
      log.info(
        `Turnstile — solving (attempt ${attempt}/${MAX_CAPTCHA_RETRIES})`,
      );
      const { data: token } = await solver.cloudflareTurnstile({
        sitekey: tskey,
        pageurl: url,
      });
      log.info(`Turnstile — token received (${token.slice(0, 16)}…)`);

      const injected = await page.evaluate((t) => {
        const el = document.querySelector("[name=cf-turnstile-response]");
        if (el) {
          el.value = t;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const cb = window.turnstileCallback ?? window.onTurnstileSuccess;
        if (typeof cb === "function") {
          try {
            cb(t);
            return true;
          } catch {}
        }
        return !!el;
      }, token);

      if (injected) {
        log.ok(`Turnstile — token injected`);
        break;
      } else {
        log.warn(
          `Turnstile — injection failed on attempt ${attempt}, ${attempt < MAX_CAPTCHA_RETRIES ? "retrying" : "giving up"}`,
        );
      }
    }
    return;
  }

  if (!handled) log.warn(`No captcha detected on ${url}`);
  return null;
}

async function moveMouseHuman(page, targetBox) {
  const { x, y, width, height } = targetBox;

  const targetX = x + width / 2 + (Math.random() - 0.5) * 10;
  const targetY = y + height / 2 + (Math.random() - 0.5) * 10;

  const steps = 15 + Math.floor(Math.random() * 10);

  const start = await page.mouse.position();
  const startX = start?.x ?? Math.random() * 300;
  const startY = start?.y ?? Math.random() * 300;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;

    // ease-in-out curve (less robotic)
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const curX = startX + (targetX - startX) * ease + (Math.random() - 0.5) * 2;
    const curY = startY + (targetY - startY) * ease + (Math.random() - 0.5) * 2;

    await page.mouse.move(curX, curY);
    await page.waitForTimeout(5 + Math.random() * 15);
  }
}
const disableAnimations = (page) =>
  page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = `*, *::before, *::after {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }`;
    document.head.appendChild(style);
  });
export async function run({
  input: {
    startUrl,
    name = "Newt",
    first_name = "Newt",
    last_name = "Scamander",
    email = "newxt@example.com",
    message = "Hello, do you have any wands?",
    company = "NewtComp",
    phone = "123456789098",
    subject = "Hello",
    unknown = "Unknown",
    location = "US",
  },
}) {
  const values = {
    name,
    first_name,
    last_name,
    email,
    message,
    company,
    phone,
    subject,
    unknown,
    location,
  };
  const safeName = startUrl.replace(/https?:\/\//, "").replace(/[^\w]/g, "_");

  const browser = await chromium.launch({
    args: ["--disable-blink-features=AutomationControlled"],
    headless: HEADLESS,
    proxy: PROXY.url
      ? {
          server: PROXY.url,
          username: PROXY.username,
          password: PROXY.password,
        }
      : undefined,
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: {
      width: 1200 + Math.floor(Math.random() * 200),
      height: 800 + Math.floor(Math.random() * 200),
    },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  await context.addInitScript(() => {
    window.addEventListener("error", (e) => {
      console.log("[IGNORED ERROR]", e.message);
      e.preventDefault();
    });

    window.addEventListener("unhandledrejection", (e) => {
      console.log("[IGNORED PROMISE]", e.reason);
      e.preventDefault();
    });
  });
  await context.addInitScript(() => {
    // reCAPTCHA
    window.grecaptcha = window.grecaptcha || {
      render: () => "mock",
      execute: () => Promise.resolve("mock"),
      ready: (cb) => cb(),
      getResponse: () => "mock",
    };

    // hCaptcha
    window.hcaptcha = window.hcaptcha || {
      render: () => "mock",
      execute: () => Promise.resolve("mock"),
      getResponse: () => "mock",
    };

    // Cloudflare Turnstile
    window.turnstile = window.turnstile || {
      render: () => "mock",
    };

    // Google Maps (VERY common crash source)
    window.google = window.google || {};
    window.google.maps = window.google.maps || {};

    // Analytics (can break apps if blocked)
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {};

    // Missing callback patterns
    window.onRecaptchaLoaded = window.onRecaptchaLoaded || (() => {});
  });
  const page = await context.newPage();
  // playwright-extra drops per-call timeout options; set a safe global default
  page.setDefaultTimeout(15000);

  try {
    const res = await page.goto(startUrl, { waitUntil: "commit", timeout: 15000 });
    console.log(`[GOTO] status=${res?.status()} url=${res?.url()}`);

    const links = await page.$$eval("a", (as) => as.map((a) => a.href));
    const contactPages = [...filterContactLinks(links), startUrl];

    for (const p of contactPages) {
      await page.goto(p, { waitUntil: "commit", timeout: 15000 });

      // optional: wait for forms specifically
      await Promise.race([
        page.waitForSelector("form", { timeout: 5000 }),
        page.waitForTimeout(3000),
      ]);
      await page.mouse.move(100, 100);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(1000);
      await page.evaluate(() => {
        document
          .querySelectorAll("form")
          .forEach((f) => f.scrollIntoView({ behavior: "instant" }));
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        document
          .querySelectorAll(".scroll-trigger, .animate--slide-in")
          .forEach((el) => {
            el.style.opacity = "1";
            el.style.visibility = "visible";
            el.style.transform = "none";
          });
      });

      const forms = await page.evaluate(() => {
        function labelText(el) {
          return el.labels
            ? [...el.labels].map((l) => l.innerText).join(" ")
            : "";
        }
        return Object.fromEntries(
          Array.from(document.querySelectorAll("form")).map((form, idx) => [
            idx,
            {
              text: form.innerText.slice(0, 800),
              fields: Array.from(
                form.querySelectorAll("input, textarea, select"),
              )
                .filter((el) => {
                  const style = window.getComputedStyle(el);
                  return !(
                    el.type === "hidden" ||
                    el.type === "file" ||
                    style.display === "none" ||
                    style.visibility === "hidden" ||
                    // el.offsetParent === null ||
                    ["website", "url", "fax"].some((n) =>
                      (el.name || "").toLowerCase().includes(n),
                    )
                  );
                })
                .map((el, i) => ({
                  id: `f${i}`,
                  tag: el.tagName.toLowerCase(),
                  type: el.type || "",
                  name: el.name || "",
                  placeholder: el.placeholder || "",
                  label: labelText(el),
                  multiple: el.multiple ?? false,
                  options:
                    el.tagName.toLowerCase() !== "select"
                      ? []
                      : (() => {
                          const opts = [];
                          el.querySelectorAll("option").forEach((o) => {
                            const group =
                              o.parentElement?.tagName.toLowerCase() ===
                              "optgroup"
                                ? o.parentElement.label
                                : null;
                            opts.push({
                              value: o.value,
                              label: o.label,
                              disabled: o.disabled,
                              selected: o.selected,
                              optgroup: group,
                            });
                          });
                          return opts;
                        })(),
                  selectedOptions:
                    el.tagName.toLowerCase() !== "select"
                      ? []
                      : Array.from(el.selectedOptions).map((o) => o.value),
                })),
            },
          ]),
        );
      });

      const valid_form_id = (await classifyFormsAI(forms))?.form_index;
      if (valid_form_id == undefined) continue;

      const valid_form = forms[valid_form_id];
      const mapping = await mapFormToValues(valid_form, values);
      if (!mapping || Object.keys(mapping).length === 0) continue;

      await page.evaluate(
        ({ index }) => {
          document
            .querySelectorAll("form")
            [index]?.scrollIntoView({ behavior: "smooth", block: "center" });
        },
        { index: Number(valid_form_id) },
      );

      await page.evaluate(
        ({ mapping, index }) => {
          const form = document.querySelectorAll("form")[index];
          const els = [
            ...form.querySelectorAll("input, textarea, select"),
          ].filter((el) => {
            const style = window.getComputedStyle(el);
            return !(
              el.disabled ||
              el.type === "hidden" ||
              el.type === "file" ||
              style.display === "none" ||
              style.visibility === "hidden" ||
              // el.offsetParent === null ||
              ["website", "url", "fax"].some((n) =>
                (el.name || "").toLowerCase().includes(n),
              )
            );
          });
          for (const [fid] of Object.entries(mapping)) {
            const i = Number(fid.replace("f", ""));
            if (els[i]?.getAttribute("type") === "submit") continue;
            if (!els[i]?.getAttribute("data-ai-fill-id"))
              els[i]?.setAttribute("data-ai-fill-id", fid);
          }
        },
        { mapping, index: Number(valid_form_id) },
      );

      for (const [fid, value] of Object.entries(mapping)) {
        const sel = `[data-ai-fill-id="${fid}"]`;
        try {
          await page.waitForSelector(sel, { timeout: 2000 });
          const locator = page.locator(sel).first();
          const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
          const type = await locator.evaluate((el) => el.type);

          const box = await locator.boundingBox();
          if (box) await moveMouseHuman(page, box);

          if (type === "checkbox") {
            const checked = await locator.isChecked();
            if (checked !== Boolean(value)) await locator.click();
          } else if (type === "radio") {
            if (value === true) await locator.click();
          } else if (tag === "select") {
            await locator.selectOption(
              (Array.isArray(value) ? value : [value]).map(String),
            );
          } else {
            if (String(value).length > 20 || tag === "textarea") {
              await locator.pressSequentially(String(value), {
                delay: 40 + Math.random() * 120,
              });
            } else {
              await locator.fill(String(value));
            }
          }
        } catch {
          await page.evaluate(
            ({ sel, value }) => {
              const node = document.querySelector(sel);
              if (!node) return;
              if (node.type === "checkbox") node.checked = Boolean(value);
              else if (node.multiple && Array.isArray(value)) {
                [...node.options].forEach((o) => {
                  o.selected = value.includes(o.value);
                });
              } else node.value = String(value);
              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            },
            { sel, value },
          );
        }

        await setTimeout(300 + Math.random() * 700);
      }

      await setTimeout(3000);
      await disableAnimations(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_before.png`),
        fullPage: false,
        animations: "disabled",
      });

      await solveCaptcha(page);
      const formAction = await page.evaluate(
        (i) => document.querySelectorAll("form")[i]?.action,
        valid_form_id,
      );

      const urlBeforeSubmit = page.url();
      const [, networkOk] = await Promise.all([
        submitFormSmart(page, Number(valid_form_id)),
        Promise.race([
          page
            .waitForNavigation({ timeout: 5000 })
            .then(() => false)
            .catch(() => false),
          page
            .waitForResponse(
              (r) =>
                r.url() === formAction && r.status() >= 200 && r.status() < 400,
              { timeout: 5000 },
            )
            .then(() => true)
            .catch(() => false),
        ]),
      ]);
      const urlChanged = page.url() !== urlBeforeSubmit;
      const isThankYouPage = /thank.?you|confirm|success/i.test(page.url());
      const formGone = await page
        .$(`form:nth-of-type(${valid_form_id + 1})`)
        .then((el) => !el)
        .catch(() => true);
      const happyText = await waitForSubmissionSuccess(page);

      await setTimeout(2000);
      await disableAnimations(page);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_after.png`),
        fullPage: false,
        animations: "disabled",
      });
      return {
        status: "success",
        url: startUrl,
        submitted:
          networkOk || urlChanged || formGone || happyText || isThankYouPage,
        confidence: [
          networkOk,
          urlChanged,
          formGone,
          happyText,
          isThankYouPage,
        ].filter(Boolean).length,
        signals: {
          networkOk,
          urlChanged,
          formGone,
          happyText,
          isThankYouPage,
        },
      };
    }

    return { status: "not_found", url: startUrl, submitted: false };
  } catch (err) {
    try {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_error.png`),
        fullPage: true,
      });
    } catch {}
    throw err;
  } finally {
    await browser.close();
  }
}
