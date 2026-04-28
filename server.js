/**
 * Slack Event Webhook Server
 *
 * Listens for incoming Slack events (specifically app_mention or message events)
 * and triggers the agent pipeline for each new ticket message.
 *
 * Configure your Slack App's Event Subscriptions to point to:
 *   https://<your-domain>/slack/events
 *
 * Start: node server.js
 */

require("dotenv").config();
const express        = require("express");
const crypto         = require("crypto");
const { runPipeline } = require("./orchestrator");
const { log }        = require("./utils/logger");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Raw body needed for Slack signature verification ──────────────────────────
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// ── Slack signature verification middleware ───────────────────────────────────
function verifySlackRequest(req, res, next) {
  const signingSecret  = process.env.SLACK_SIGNING_SECRET;
  const slackSignature = req.headers["x-slack-signature"];
  const timestamp      = req.headers["x-slack-request-timestamp"];

  if (!slackSignature || !timestamp) {
    return res.status(401).json({ error: "Missing Slack headers" });
  }

  // Prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: "Request too old" });
  }

  const baseString = `v0:${timestamp}:${req.rawBody}`;
  const mySignature = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(baseString)
    .digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  next();
}

// ── Event endpoint ────────────────────────────────────────────────────────────
app.post("/slack/events", verifySlackRequest, async (req, res) => {
  const { type, event, challenge } = req.body;

  // Slack URL verification handshake
  if (type === "url_verification") {
    return res.json({ challenge });
  }

  // Acknowledge immediately (Slack requires <3s)
  res.sendStatus(200);

  // Only process driver messages — ignore bot messages and retries
  if (!event || event.bot_id || event.subtype) return;
  if (type !== "event_callback") return;
  if (!["message", "app_mention"].includes(event.type)) return;

  // ── Build normalised Slack event ──────────────────────────────────────────
  const slackEvent = {
    channel:       event.channel,
    messageTs:     event.ts,
    driverId:      extractDriverId(event.text),          // e.g. "D_101" from message
    screenName:    event.metadata?.screen_name ?? "Unknown",
    driverMessage: event.text,
  };

  log("SERVER", `New event from channel=${slackEvent.channel} driver=${slackEvent.driverId}`);

  // Run pipeline asynchronously (don't block the Slack ack)
  runPipeline(slackEvent).catch((err) => {
    log("SERVER", `Pipeline error: ${err.message}`);
    console.error(err);
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => log("SERVER", `Listening on port ${PORT}`));

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDriverId(text) {
  const match = text.match(/\bD_\d+\b/i);
  return match ? match[0] : "UNKNOWN";
}
