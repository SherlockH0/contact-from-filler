import puppeteer from "puppeteer-extra";

import os from "os";
import { setTimeout } from "node:timers/promises";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import RecaptchaPlugin from "puppeteer-extra-plugin-recaptcha";
import "dotenv/config";

puppeteer.use(StealthPlugin());
puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: "2captcha",
      token: process.env.TWOCAPTCHA_TOKEN,
    },
    visualFeedback: true,
  }),
);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = process.env.OPENAI_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL;
const HEADLESS = process.env.HEADLESS !== "false";
const PROXY_URL = process.env.PROXY_URL;
const PROXY_USERNAME = process.env.PROXY_USERNAME;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD;

const input = JSON.parse(
  await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }),
);

const SCREENSHOT_DIR = path.join(os.tmpdir(), "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR))
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ------------------ Helpers ------------------

function filterContactLinks(links) {
  const regex = /(contact|get.*touch|reach|support|help)/i;
  const negativeRegex = /blog/i;
  return [
    ...new Set(
      links
        .map((l) => {
          try {
            return new URL(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .filter((u) => {
          if (u.protocol === "mailto:") return false;
          if (negativeRegex.test(u.pathname)) return false;
          return regex.test(u.pathname);
        })
        .map((u) => u.href)
        .sort((a, b) => a.length - b.length),
    ),
  ];
}
async function classifyFormsAI(forms) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: `
You analyze website forms.

Your task:
- Select the form that is meant to contact the company.
- Prefer textarea for message
- If no such form is found, return an empty object.

Rules:
- Choose only ONE or ZERO forms
- Prefer textarea for message
- Ignore newsletter, login, demo, search, checkout forms
- Return JSON ONLY

Output format:
{
  "form_index": number,
}
          `.trim(),
        },
        {
          role: "user",
          content: JSON.stringify(forms),
        },
      ],
    }),
  });

  const data = await res.json();
  return JSON.parse(
    data.choices?.[0]?.message?.content || data?.message?.content || "{}",
  );
}

async function submitFormSmart(page, formIndex) {
  return await page.evaluate(async (index) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const form = document.querySelectorAll("form")[index];
    if (!form) return "no-form";

    const click = async (btn, label) => {
      btn.scrollIntoView({ block: "center" });
      await sleep(50);
      btn.click();
      return label;
    };

    for (const btn of form.querySelectorAll(
      'button[type="submit"], input[type="submit"]',
    )) {
      if (!btn.disabled && btn.offsetParent !== null)
        return click(btn, "clicked-submit-button");
    }

    for (const btn of form.querySelectorAll("button, input[type=button]")) {
      if (
        !btn.disabled &&
        btn.offsetParent !== null &&
        /send|submit|continue|next|apply|contact/i.test(
          btn.innerText || btn.value || "",
        )
      ) {
        return click(btn, "clicked-fallback-button");
      }
    }

    if (form.requestSubmit) {
      form.requestSubmit();
      return "requestSubmit";
    }

    const ev = new Event("submit", { bubbles: true, cancelable: true });
    if (form.dispatchEvent(ev)) {
      form.submit();
      return "dispatch-submit";
    }

    form.submit();
    return "forced-submit";
  }, formIndex);
}

// ------------------ Main Logic ------------------

import { classifyFormsAI } from "./services/openAIService.js";
import { submitFormSmart, mapFormToValues } from "./services/formHandler.js";
import {
  filterContactLinks,
  createScreenshotDir,
} from "./utils/fileHelpers.js";
import { validateEnvVariables } from "./utils/envValidation.js";

async function run() {
  const {
    startUrl,
    name = "Newt",
    first_name = "Newt",
    last_name = "Scamander",
    email = "newxt@example.com",
    message = "Hello, do you have any wands?",
    company = "NewtComp",
    phone = "+3800609303",
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

  const proxy_args = PROXY_URL ? [`--proxy-server=${PROXY_URL}`] : [];
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    devtools: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", ...proxy_args],
  });

  const page = await browser.newPage();
  if (PROXY_URL) {
    if (!PROXY_USERNAME || !PROXY_PASSWORD)
      throw new Error(
        "PROXY_USERNAME and PROXY_PASSWORD must be set if PROXY_URL is set",
      );
    await page.authenticate({
      password: PROXY_PASSWORD,
      username: PROXY_USERNAME,
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

      await page.solveRecaptchas();

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_before.png`),
        fullPage: true,
      });

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
      logger.info(
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

// Function that maps a valid_form's fields to actual values using OpenAI and fallback generation
async function mapFormToValues(valid_form, values) {
  // Ask OpenAI which role each field corresponds to
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: `
You are given a list of form fields (id, label, placeholder, name, type, tag) and a list of form values. 
For each field you should return a value to use. For the fields that are not in the list of values, you should generate a realistic value.

Rules:
- For type="email", return a valid email string
- For type="number" or "range", return a number
- For select fields, choose one of the provided options
- For multiple selects, return an array
- Never return null or undefined


Example input:
{
  values: {
    email: "john@gmail.com",
    full_name: "Peter Parker"
  },
  form: [
      {
        id: 'f0',
        tag: 'input',
        type: 'text',
        name: '',
        placeholder: '',
        label: 'Name:',
        multiple: false,
        options: [],
        selectedOptions: []
      },
      {
        id: 'f1',
        tag: 'input',
        type: 'email',
        name: '',
        placeholder: '',
        label: 'Email:',
        multiple: false,
        options: [],
        selectedOptions: []
      },
      {
        id: 'f2',
        tag: 'input',
        type: 'range',
        name: '',
        placeholder: '',
        label: 'Rating (1‑10):',
        multiple: false,
        options: [],
        selectedOptions: []
      }
  ]
}

Your output:
{
  "f0": "Peter Parker",
  "f1": "john@gmail.com",
  "f2": 10
}

Return a JSON object where keys are field ids and values are the final values to fill into the form.
`.trim(),
        },
        {
          role: "user",
          content: JSON.stringify({
            values,
            form: valid_form.fields,
          }),
        },
      ],
      stream: false,
    }),
  });
  const data = await res.json();
  return JSON.parse(
    data.choices?.[0]?.message?.content || data?.message?.content || "{}",
  );
}

run();
