import { OPENAI } from "./constants.js";
import fetch from "node-fetch";

export async function aiRequest(system_message, user_message) {
  const res = await fetch(OPENAI.api_url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI.api_key}`,
      "Content-Type": "application/json",
    },
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

  const data = await res.json();
  return JSON.parse(
    data.choices?.[0]?.message?.content || data?.message?.content || "{}",
  );
}
