import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { uploadSuccessScreenshot } from "../../services/supabase.js";

const ORIG = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const makeRes = ({ ok = true, status = 200, body = {} } = {}) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

let calls = [];
let realFetch;

function stubFetch(routes) {
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const route = routes.find((r) => r.match(String(url)));
    return route ? route.res(init) : makeRes({ ok: false, status: 404 });
  };
}

beforeEach(() => {
  calls = [];
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (ORIG.url) process.env.SUPABASE_URL = ORIG.url;
  else delete process.env.SUPABASE_URL;
  if (ORIG.key) process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG.key;
  else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

test("uploads png and inserts row with correct payload, returns inserted id", async () => {
  stubFetch([
    {
      match: (u) => u.includes("/storage/v1/object/Files/outreach-proof/u-1/42/") && u.endsWith(".png"),
      res: () => makeRes(),
    },
    {
      match: (u) => u.endsWith("/rest/v1/outreach_attachments"),
      res: () => makeRes({ body: [{ id: 77 }] }),
    },
  ]);

  const png = Buffer.from("fake-png-bytes");
  const row = await uploadSuccessScreenshot({ userId: "u-1", leadId: 42, pngBuffer: png });

  assert.equal(row.id, 77);

  const [upload, insert] = calls;
  assert.equal(upload.init.method, "POST");
  assert.equal(upload.init.body, png);
  assert.equal(upload.init.headers.apikey, "sb_secret_test");
  assert.equal(upload.init.headers.Authorization, "Bearer sb_secret_test");
  assert.equal(upload.init.headers["Content-Type"], "image/png");

  assert.equal(insert.init.method, "POST");
  assert.equal(insert.init.headers.apikey, "sb_secret_test");
  assert.equal(insert.init.headers.Authorization, "Bearer sb_secret_test");

  const body = JSON.parse(insert.init.body);
  assert.equal(body.user_id, "u-1");
  assert.equal(body.lead_id, 42);
  assert.equal(body.type, "contact_form");
  assert.equal(body.mime_type, "image/png");
  assert.match(body.file_name, /^[0-9a-f-]{36}\.png$/);
  assert.match(body.storage_path, /^outreach-proof\/u-1\/42\/[0-9a-f-]{36}\.png$/);
  assert.equal("outreach_status_id" in body, false);
});

test("returns null and makes no requests when env is missing", async () => {
  stubFetch([]);
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const row = await uploadSuccessScreenshot({ userId: "u-1", leadId: 42, pngBuffer: Buffer.from("x") });
  assert.equal(row, null);
  assert.equal(calls.length, 0);
});

test("returns null and makes no requests when ids are missing", async () => {
  stubFetch([]);
  const png = Buffer.from("x");

  assert.equal(await uploadSuccessScreenshot({ leadId: 42, pngBuffer: png }), null);
  assert.equal(await uploadSuccessScreenshot({ userId: "u-1", pngBuffer: png }), null);
  assert.equal(await uploadSuccessScreenshot({ userId: "u-1", leadId: null, pngBuffer: png }), null);
  assert.equal(calls.length, 0);
});

test("throws when storage upload fails", async () => {
  stubFetch([{ match: () => true, res: () => makeRes({ ok: false, status: 400 }) }]);

  await assert.rejects(
    () => uploadSuccessScreenshot({ userId: "u-1", leadId: 42, pngBuffer: Buffer.from("x") }),
    /Screenshot upload failed/,
  );
});

test("throws when row insert fails", async () => {
  stubFetch([
    { match: (u) => u.includes("/storage/"), res: () => makeRes() },
    { match: () => true, res: () => makeRes({ ok: false, status: 400 }) },
  ]);

  await assert.rejects(
    () => uploadSuccessScreenshot({ userId: "u-1", leadId: 42, pngBuffer: Buffer.from("x") }),
    /Attachment row insert failed/,
  );
});
