const DEFAULT_TO = "franksharpe008@gmail.com";

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function recommendTier(revenue, constraint) {
  if (revenue === "scale" || constraint === "premium-positioning") {
    return {
      tier: "Flagship Experience",
      note: "Lead with authority, premium positioning, and a stronger retained relationship path.",
    };
  }
  if (revenue === "growth" || constraint === "retention") {
    return {
      tier: "Growth System",
      note: "Lead with cleaner conversion flow, stronger qualification, and better follow-through after the first win.",
    };
  }
  return {
    tier: "Rapid Launch",
    note: "Lead with the shortest path to proof so the buyer sees motion without committing to the full build yet.",
  };
}

function buildRecipients() {
  const raw = process.env.APPLY_TO_EMAILS || process.env.APPLY_TO_EMAIL || DEFAULT_TO;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

function buildText(payload, recommendation) {
  return [
    "Sharpe Digital sprint request",
    "",
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company}`,
    `Vertical: ${payload.vertical}`,
    `Revenue band: ${payload.revenue}`,
    `Constraint: ${payload.constraint}`,
    `Focus: ${payload.focus || "appointments"}`,
    `Recommended tier: ${recommendation.tier}`,
    "",
    "Current front-end problem:",
    payload.note || "(none provided)",
  ].join("\n");
}

async function sendLead(payload, recommendation) {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.BREVO_FROM_EMAIL || DEFAULT_TO;
  const fromName = process.env.BREVO_FROM_NAME || "Maximillion";

  if (!apiKey) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: fromName },
      to: buildRecipients(),
      replyTo: { email: payload.email, name: payload.name },
      subject: `Sharpe Digital sprint request | ${payload.company}`,
      textContent: buildText(payload, recommendation),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || `Brevo send failed: HTTP ${response.status}`);
  }

  return body?.messageId || "unknown";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const payload = parseBody(req.body);
  const required = ["name", "email", "company", "vertical", "revenue", "constraint"];
  const missing = required.filter((field) => !String(payload[field] || "").trim());
  if (missing.length) {
    res.status(400).json({ ok: false, error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  if (String(payload.website || "").trim()) {
    res.status(200).json({ ok: true, ignored: true, message: "Ignored" });
    return;
  }

  const recommendation = recommendTier(payload.revenue, payload.constraint);
  if (String(process.env.BREVO_DRY_RUN || "") === "1" || String(req.headers["x-dry-run"] || "") === "1") {
    res.status(200).json({
      ok: true,
      dryRun: true,
      recommendation,
      message: `Dry run complete for ${payload.company}.`,
    });
    return;
  }

  try {
    const messageId = await sendLead(payload, recommendation);
    res.status(200).json({
      ok: true,
      recommendation,
      message: `Application sent to strategy inbox. Reference: ${messageId}`,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : "Submission failed",
    });
  }
};
