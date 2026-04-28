/**
 * Executor
 *
 * Final agent in the pipeline.
 *
 * Responsibilities:
 *   1. Apply all sheetUpdates from DataGuy to Google Sheets
 *   2. Post the driver reply message to Slack (as a thread reply)
 *   3. Log final status
 */

const { Sheets }  = require("../utils/sheets");
const { Slack }   = require("../utils/slack");
const { log }     = require("../utils/logger");

const Executor = {
  /**
   * @param {object} slackEvent   – original Slack event (for channel + thread_ts)
   * @param {object} decision     – output from DataGuy
   */
  async run(slackEvent, decision) {
    const { channel, messageTs } = slackEvent;
    const { action, driverMessage, sheetUpdates } = decision;

    log("EXECUTOR", `Executing action: ${action}`);

    // ── 1. Apply Sheet Updates ─────────────────────────────────────────────
    if (sheetUpdates && sheetUpdates.length > 0) {
      for (const update of sheetUpdates) {
        try {
          if (typeof update.delta === "number") {
            // Delta update — read current value, add delta, write back
            await Sheets.deltaUpdate(
              update.tab,
              update.keyCol,
              update.keyVal,
              update.updateCol,
              update.delta
            );
            log("EXECUTOR", `Delta updated ${update.tab}[${update.keyCol}=${update.keyVal}].${update.updateCol} by ${update.delta}`);
          } else {
            // Direct value set
            await Sheets.setValue(
              update.tab,
              update.keyCol,
              update.keyVal,
              update.updateCol,
              update.value
            );
            log("EXECUTOR", `Set ${update.tab}[${update.keyCol}=${update.keyVal}].${update.updateCol} = "${update.value}"`);
          }
        } catch (err) {
          log("EXECUTOR", `ERROR during sheet update: ${err.message}`);
          throw err;
        }
      }
    } else {
      log("EXECUTOR", "No sheet updates required for this action.");
    }

    // ── 2. Send Slack Reply ────────────────────────────────────────────────
    await Slack.replyInThread(channel, messageTs, driverMessage);
    log("EXECUTOR", `Slack reply sent to ${channel} (thread: ${messageTs})`);

    // ── 3. Optionally add a ✅ emoji reaction to mark ticket closed ────────
    await Slack.addReaction(channel, messageTs, "white_check_mark");
    log("EXECUTOR", "Ticket marked as closed with ✅ reaction.");

    return { success: true, action };
  },
};

module.exports = { Executor };
