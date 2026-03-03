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
  } = req.body;

  if (!startUrl) {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is required" });
  }

  if (!startUrl) {
    return res
      .status(400)
      .json({ success: false, error: "startUrl is required" });
  }

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
      return res.status(404).json({ success: false, ...result });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Run error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
