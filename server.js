import express from "express";
import { run } from "./index.js";
import logger from "./utils/logger.js";

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
  } = req.body;

  if (!startUrl) {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is required" });
  }

  logger.info({ startUrl, name }, "Starting outreach request");

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
      },
    });

    if (result.status === "not_found") {
      logger.warn({ startUrl }, "No form found");
      return res.status(200).json({ success: false, ...result });
    }

    logger.info(
      { startUrl, submitted: result.submitted },
      "Outreach completed",
    );
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err: err.message, startUrl }, "Outreach failed");
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () =>
  logger.info({ port: PORT }, "Server started"),
);
