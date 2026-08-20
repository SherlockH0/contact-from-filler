import { OPENAI } from "./constants.js";
import fetch from "node-fetch";

function stripMarkdownFences(text) {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

export async function aiRequest(system_message, user_message) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(OPENAI.api_url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI.api_key}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENAI.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: system_message.trim(),
          },
          {
            role: "user",
            content: user_message.trim(),
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI API returned ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || data?.message?.content || "{}";
    return JSON.parse(stripMarkdownFences(raw));
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("AI API request timed out after 30s");
    }
    if (err instanceof SyntaxError) {
      throw new Error(`AI returned invalid JSON: ${err.message}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
