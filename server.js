import express from "express";
import { run } from "./index.js";

const app = express();
app.use(express.json());

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

  if (!startUrl) {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is required" });
  }

  console.log(`[START] startUrl=${startUrl} name=${name}`);

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

    console.log(
      `[END] startUrl=${startUrl} status=${result.status} submitted=${result.submitted}`,
    );
    res.json({ success: result.status === "success", ...result });
  } catch (err) {
    console.log(`[ERROR] startUrl=${startUrl} error=${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`),
);
