import express from "express";
import { run } from "./index.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const REQUEST_TIMEOUT = 120_000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/run", async (req, res) => {
  const {
    startUrl,
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
    userId,
    leadId,
  } = req.body;

  if (!startUrl || typeof startUrl !== "string") {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is required" });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(startUrl);
  } catch {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is not a valid URL" });
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return res
      .status(400)
      .json({ success: false, error: "startUrl must use http or https" });
  }

  console.log(`[START] startUrl=${startUrl} name=${name}`);

  const timer = setTimeout(() => {
    res.status(504).json({ success: false, error: "Request timed out" });
  }, REQUEST_TIMEOUT);

  try {
    const result = await run({
      input: {
        startUrl,
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
        userId,
        leadId,
      },
    });

    clearTimeout(timer);
    console.log(
      `[END] startUrl=${startUrl} status=${result.status} submitted=${result.submitted}`,
    );
    res.json({ success: result.status === "success", ...result });
  } catch (err) {
    clearTimeout(timer);
    console.log(`[ERROR] startUrl=${startUrl} error=${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`),
);
