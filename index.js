import "dotenv/config";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-extra";
import {
  TWO_CAPTCHA,
  SCREENSHOT_DIR,
  PROXY,
  HEADLESS,
} from "./utils/constants.js";
import { classifyFormsAI, mapFormToValues } from "./services/ai.js";
import { filterContactLinks, submitFormSmart } from "./services/forms.js";
import { inputFromStdin } from "./utils/input.js";
import { setTimeout } from "node:timers/promises";

puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin(TWO_CAPTCHA));

if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  const input = await inputFromStdin();
  const {
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
  } = input;
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

  const proxy_args = PROXY.url ? [`--proxy-server=${PROXY.url}`] : [];
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox", ...proxy_args],
  });

  const page = await browser.newPage();
  if (PROXY.url) {
    if (!PROXY.username || !PROXY.password)
      throw new Error(
        "PROXY_USERNAME and PROXY_PASSWORD must be set if PROXY_URL is set",
      );
    await page.authenticate({
      password: PROXY.password,
      username: PROXY.username,
    });
  }

  await page.setUserAgent({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  });

  await page.setViewport({
    width: 1200 + Math.floor(Math.random() * 200),
    height: 800 + Math.floor(Math.random() * 200),
  });
  const safeName = startUrl.replace(/https?:\/\//, "").replace(/[^\w]/g, "_");

  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    const links =
      (await page.$$eval("a", (as) => {
        return as.map((a) => a.href);
      })) || [];

    const contactPages = [...filterContactLinks(links), startUrl];
    for (const p of contactPages) {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      try {
        await page.waitForSelector("form", { timeout: 10000 });
      } catch (err) {
        continue;
      }
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
                .filter((el) => !el.disabled && el.type !== "hidden")
                .map((el, i) => ({
                  id: `f${i}`,
                  tag: el.tagName.toLowerCase(),
                  type: el.type || "",
                  name: el.name || "",
                  placeholder: el.placeholder || "",
                  label: labelText(el),
                  multiple: el.multiple ?? false,
                  options: (() => {
                    if (el.tagName.toLowerCase() !== "select") return [];
                    const opts = [];
                    el.querySelectorAll("option").forEach((o) => {
                      const group =
                        o.parentElement &&
                        o.parentElement.tagName.toLowerCase() === "optgroup"
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
                  selectedOptions: (() => {
                    if (el.tagName.toLowerCase() !== "select") return [];
                    return Array.from(el.selectedOptions).map((o) => o.value);
                  })(),
                })),
            },
          ]),
        );
      });
      const valid_form_id = (await classifyFormsAI(forms))?.form_index;
      if (valid_form_id == undefined) continue;
      const valid_form = forms[valid_form_id];
      const mapping = await mapFormToValues(valid_form, values);
      if (!mapping || Object.keys(mapping).length === 0) {
        continue;
      }
      await page.evaluate(
        ({ index }) => {
          const form = document.querySelectorAll("form")[index];
          form?.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "center",
          });
        },
        { index: Number(valid_form_id) },
      );

      // browser side: mark fields
      await page.evaluate(
        ({ mapping, index }) => {
          const form = document.querySelectorAll("form")[index];
          const els = [
            ...form.querySelectorAll("input, textarea, select"),
          ].filter((el) => !el.disabled && el.type !== "hidden");

          for (const [fid, value] of Object.entries(mapping)) {
            const i = Number(fid.replace("f", ""));
            if (els[i]?.getAttribute("type") === "submit") continue;
            if (!els[i]?.getAttribute("data-ai-fill-id")) {
              els[i]?.setAttribute("data-ai-fill-id", fid);
            }
          }
        },
        { mapping: mapping, index: Number(valid_form_id) },
      );
      // node side: type
      for (const [fid, value] of Object.entries(mapping)) {
        const sel = `[data-ai-fill-id="${fid}"]`;
        try {
          await page.waitForSelector(sel, { timeout: 2000 });
          const locator = page.locator(sel);

          const meta = await locator.evaluate((el) => ({
            tag: el.tagName.toLowerCase(),
            type: el.type,
            multiple: el.multiple,
          }));

          // Checkbox
          if (meta.type === "checkbox") {
            const checked = await locator.isChecked();
            if (checked !== Boolean(value)) await locator.click();
          }

          // Radio
          else if (meta.type === "radio") {
            if (value === true) await locator.click();
          }

          // Select
          else if (meta.tag === "select") {
            const vals = Array.isArray(value) ? value : [value];
            await locator.selectOption(vals.map(String));
          }

          // Text-like
          else {
            await locator.fill(String(value));
          }
        } catch {
          // DOM fallback
          const el = await page.$(sel);
          if (el) {
            await el.evaluate((node, value) => {
              if (node.type === "checkbox") node.checked = Boolean(value);
              else if (node.multiple && Array.isArray(value)) {
                [...node.options].forEach((o) => {
                  o.selected = value.includes(o.value);
                });
              } else node.value = value;

              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            }, value);
          }
        }

        await setTimeout(300 + Math.random() * 700);
      }
      await setTimeout(3000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_before.png`),
        fullPage: true,
      });

      const { error: captchaError } = await page.solveRecaptchas();
      if (captchaError) {
        throw new Error(`Failed to solve recaptcha: ${captchaError.error}`);
      }

      await submitFormSmart(page, Number(valid_form_id));

      await Promise.race([
        page.waitForNavigation({ timeout: 5000 }).catch(() => null),
        page
          .waitForResponse((res) => res.status() >= 200 && res.status() < 400, {
            timeout: 5000,
          })
          .catch(() => null),
      ]);
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_after.png`),
        fullPage: true,
      });
      console.log(
        JSON.stringify({ status: "success", url: startUrl, submitted: true }),
      );
      return;
    }

    console.log(
      JSON.stringify({
        status: "not_found",
        url: startUrl,
        submitted: false,
      }),
    );
  } catch (err) {
    try {
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_error.png`),
        fullPage: true,
      });
    } catch {}

    console.log(
      JSON.stringify({
        status: "failed",
        error: err.message,
      }),
    );
  } finally {
    await browser.close();
  }
}

run();
