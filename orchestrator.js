/**
 * Jeeny Help Center — Agentic Orchestrator
 * Entry point: receives a Slack event payload and runs the 4-agent pipeline.
 *
 * Pipeline:
 *   1. ClassifierAgent  → assigns sub-category
 *   2. ContextBuilder   → loads the right SOP
 *   3. DataGuy          → reads/writes Google Sheets, decides action
 *   4. Executor         → writes Sheet + sends Slack reply
 */

const { ClassifierAgent }  = require("./agents/classifierAgent");
const { ContextBuilder }   = require("./agents/contextBuilder");
const { DataGuy }          = require("./agents/dataGuy");
const { Executor }         = require("./agents/executor");
const { log }              = require("./utils/logger");

/**
 * Main pipeline function.
 * @param {object} slackEvent  – raw Slack event (see config/slackEvent.example.json)
 */
async function runPipeline(slackEvent) {
  log("ORCHESTRATOR", `Starting pipeline for ticket from channel ${slackEvent.channel}`);

  // ── Step 1: Classify ───────────────────────────────────────────────────────
  const classification = await ClassifierAgent.run(slackEvent);
  log("ORCHESTRATOR", `Classified → subCategory: "${classification.subCategory}"`);

  // ── Step 2: Load SOP ───────────────────────────────────────────────────────
  const context = await ContextBuilder.run(classification);
  log("ORCHESTRATOR", `Context loaded → sopFile: "${context.sopFile}"`);

  // ── Step 3: Reason + Prepare Sheet Actions ─────────────────────────────────
  const decision = await DataGuy.run(slackEvent, context);
  log("ORCHESTRATOR", `DataGuy decision → action: "${decision.action}", message: "${decision.driverMessage}"`);

  // ── Step 4: Execute (Sheet write + Slack reply) ────────────────────────────
  await Executor.run(slackEvent, decision);
  log("ORCHESTRATOR", "Pipeline complete — ticket closed.");
}

module.exports = { runPipeline };

// ── Direct CLI invocation for testing ─────────────────────────────────────────
if (require.main === module) {
  const testEvent = require("./config/slackEvent.example.json");
  runPipeline(testEvent).catch(console.error);
}
