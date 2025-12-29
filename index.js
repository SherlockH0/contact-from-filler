import puppeteer from "puppeteer-extra";
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

const SCREENSHOT_DIR = "./screenshots";
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR);

// ------------------ Helpers ------------------

function filterContactLinks(links) {
  const regex = /(contact|get.*touch|reach|support|help)/i;
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
        .filter((u) => regex.test(u.pathname))
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
      model: "openai/gpt-oss-120b:free",
      messages: [
        {
          role: "system",
          content: `
You analyze website forms.

Your task:
- Select the form that is meant to contact the company.
- Prefer textarea for message
- Map its fields to semantic roles.
- If no such form is found, return an empty object.

Roles:
- name
- first_name
- last_name
- email
- message
- company
- phone
- subject
- unknown

Rules:
- Choose only ONE or ZERO forms
- One email and one message max
- Prefer textarea for message
- Ignore newsletter, login, demo, search, checkout forms
- Do not invent fields
- Return JSON ONLY

Output format:
{
  "form_index": number,
  "field_mapping": {
    "<field_id>": "<role>"
  }
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
  return JSON.parse(data.choices[0].message.content);
}

// ------------------ Main Logic ------------------

async function run() {
  const {
    startUrl,
    name = "Newt",
    first_name = "Newt",
    last_name = "Scamander",
    email = "newxt@example.com",
    message = "Hello, do you have any wands?",
    company = "NewtComp",
    phone = "+380060930340",
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

        return Array.from(document.querySelectorAll("form")).map(
          (form, fi) => ({
            index: fi,
            text: form.innerText.slice(0, 800),
            fields: Array.from(form.querySelectorAll("input, textarea, select"))
              .filter((el) => !el.disabled && el.type !== "hidden")
              .map((el, i) => ({
                id: `f${i}`,
                tag: el.tagName.toLowerCase(),
                type: el.type || "",
                name: el.name || "",
                placeholder: el.placeholder || "",
                label: labelText(el),
              })),
          }),
        );
      });

      const mapping = await classifyFormsAI(forms);
      if (
        !mapping ||
        mapping.form_index == null ||
        !mapping.field_mapping ||
        Object.keys(mapping.field_mapping).length === 0
      ) {
        continue;
      }

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_before.png`),
        fullPage: true,
      });

      // browser side: mark fields
      await page.evaluate(
        ({ mapping, index }) => {
          const form = document.querySelectorAll("form")[index];
          const els = [
            ...form.querySelectorAll("input, textarea, select"),
          ].filter((el) => !el.disabled && el.type !== "hidden");

          for (const [fid, role] of Object.entries(mapping)) {
            const i = Number(fid.replace("f", ""));
            if (!els[i]?.getAttribute("data-ai-role")) {
              els[i]?.setAttribute("data-ai-role", role);
            }
          }
        },
        { mapping: mapping.field_mapping, index: mapping.form_index },
      );

      await setTimeout(Math.random() * 1000);
      // node side: type
      for (const [fid, role] of Object.entries(mapping.field_mapping)) {
        const sel = `[data-ai-role="${role}"]`;
        const value = values[role] || unknown;
        try {
          await page.waitForSelector(sel, { timeout: 2000 });
          await page.locator(sel).fill(value);
        } catch {
          // fallback to direct DOM write
          const el = await page.$(sel);
          if (el) {
            await el.evaluate((node, value) => {
              node.value = value;
              node.dispatchEvent(new Event("input", { bubbles: true }));
              node.dispatchEvent(new Event("change", { bubbles: true }));
            }, value);
          }
        }
        await setTimeout(Math.random() * 1000);
      }

      await page.solveRecaptchas();

      await page.evaluate((index) => {
        const form = document.querySelectorAll("form")[index];
        if (form?.requestSubmit) form.requestSubmit();
        else form?.submit();
      }, mapping.form_index);

      await page.evaluate(
        ({ index }) => {
          const form = document.querySelectorAll("form")[index];
          form?.scrollIntoView({
            behavior: "instant",
            block: "center",
            inline: "center",
          });
        },
        { index: mapping.form_index },
      );

      await setTimeout(15000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${safeName}_after.png`),
        fullPage: true,
      });
      console.log(
        JSON.stringify({
          status: "success",
          url: startUrl,
          submitted: true,
        }),
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
