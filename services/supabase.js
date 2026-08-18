import { randomUUID } from "node:crypto";
import { getSupabaseConfig } from "../utils/constants.js";

const BUCKET = "Files";

export async function uploadSuccessScreenshot({ userId, leadId, pngBuffer }) {
  const SUPABASE = getSupabaseConfig();
  if (!SUPABASE.url || !SUPABASE.serviceRoleKey) {
    console.warn("[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping upload");
    return null;
  }
  if (!userId || leadId == null) {
    console.warn("[SUPABASE] Missing userId/leadId, skipping upload");
    return null;
  }

  const fileName = `${randomUUID()}.png`;
  const storagePath = `outreach-proof/${userId}/${leadId}/${fileName}`;

  const key = SUPABASE.serviceRoleKey;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const uploadRes = await fetch(
    `${SUPABASE.url}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "image/png",
      },
      body: pngBuffer,
    },
  );
  if (!uploadRes.ok) {
    throw new Error(`Screenshot upload failed: ${await uploadRes.text()}`);
  }

  const insertRes = await fetch(`${SUPABASE.url}/rest/v1/outreach_attachments`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      user_id: userId,
      lead_id: leadId,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: "image/png",
      type: "contact_form",
    }),
  });
  if (!insertRes.ok) {
    throw new Error(`Attachment row insert failed: ${await insertRes.text()}`);
  }

  const row = await insertRes.json();
  console.log(`[SUPABASE] Uploaded ${storagePath} (id=${row[0]?.id})`);
  return row[0];
}
