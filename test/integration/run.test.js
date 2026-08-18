import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "fixtures");

let run;
let server;
let baseUrl;

const deps = {
  classifyFormsAI: async (forms) =>
    Object.keys(forms).length ? { form_index: 0 } : {},
  mapFormToValues: async () => ({
    f0: "Peter Parker",
    f1: "peter@example.com",
    f2: "Hello, I'm interested in your products.",
  }),
};

const input = {
  name: "Peter Parker",
  email: "peter@example.com",
  message: "Hello, I'm interested in your products.",
  userId: "u-1",
  leadId: 42,
};

before(async () => {
  process.env.HEADLESS = "true";
  ({ run } = await import("../../index.js"));

  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/send_message/" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (url.pathname === "/thanks" && req.method === "POST") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return res.end(
        "<!doctype html><html><body><h1>Thank you</h1><p>We received your message.</p></body></html>",
      );
    }

    const file = path.join(FIXTURES, url.pathname);
    if (!file.startsWith(FIXTURES) || !fs.existsSync(file)) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((r) => server.close(r));
});

test("detects AJAX/fetch submission success (daniildavtian regression)", async () => {
  const uploads = [];
  const result = await run({
    input: { ...input, startUrl: `${baseUrl}/ajax-form.html` },
    deps: {
      ...deps,
      uploadSuccessScreenshot: async (args) => {
        uploads.push(args);
        return { id: 99 };
      },
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.submitted, true);
  assert.equal(result.signals.networkOk, true);
  assert.equal(result.confidence, 1);
  assert.equal(result.attachmentId, 99);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].userId, "u-1");
  assert.equal(uploads[0].leadId, 42);
  assert.ok(Buffer.isBuffer(uploads[0].pngBuffer), "screenshot should be a buffer");
  assert.ok(uploads[0].pngBuffer.length > 0);
});

test("detects classic POST -> thank-you page submission", async () => {
  const uploads = [];
  const result = await run({
    input: { ...input, startUrl: `${baseUrl}/classic-thankyou.html` },
    deps: {
      ...deps,
      uploadSuccessScreenshot: async (args) => {
        uploads.push(args);
        return { id: 100 };
      },
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.submitted, true);
  assert.equal(result.attachmentId, 100);
  assert.equal(uploads.length, 1);
});

test("returns not_found and uploads screenshot when no form exists", async () => {
  const uploads = [];
  const result = await run({
    input: { ...input, startUrl: `${baseUrl}/no-form.html` },
    deps: {
      ...deps,
      uploadSuccessScreenshot: async (args) => {
        uploads.push(args);
        return { id: 1 };
      },
    },
  });

  assert.equal(result.status, "not_found");
  assert.equal(result.submitted, false);
  assert.equal(result.attachmentId, 1);
  assert.equal(uploads.length, 1);
  assert.ok(Buffer.isBuffer(uploads[0].pngBuffer), "screenshot should be a buffer");
  assert.ok(uploads[0].pngBuffer.length > 0);
});

test("uploads screenshot on failed submission (form found but not detected)", async () => {
  const uploads = [];
  const result = await run({
    input: { ...input, startUrl: `${baseUrl}/failed-submit.html` },
    deps: {
      ...deps,
      uploadSuccessScreenshot: async (args) => {
        uploads.push(args);
        return { id: 200 };
      },
    },
  });

  assert.equal(result.status, "success");
  assert.equal(result.submitted, false);
  assert.equal(result.attachmentId, 200);
  assert.equal(uploads.length, 1);
  assert.ok(Buffer.isBuffer(uploads[0].pngBuffer), "screenshot should be a buffer");
  assert.ok(uploads[0].pngBuffer.length > 0);
});
