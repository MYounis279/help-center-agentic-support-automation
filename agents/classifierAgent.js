/**
 * ClassifierAgent
 *
 * Assigns one of two sub-categories to a driver support ticket:
 *   - "Assurance Policy"  → payment / fare / ride earnings complaint
 *   - "City Update"       → driver wants to change operating city
 *
 * No LLM used — pure keyword matching.
 * Message content takes priority over the screen name the driver was on.
 */

const { log } = require("../utils/logger");

// ── Keyword lists ─────────────────────────────────────────────────────────────
const CITY_KEYWORDS = [
  "city", "move", "moved", "transfer", "relocate", "operating",
  "riyadh", "jeddah", "dammam", "madinah", "abha", "mecca",
  "khobar", "tabuk", "taif", "hail", "najran", "jizan",
];

const ASSURANCE_KEYWORDS = [
  "paid", "pay", "payment", "fare", "wallet", "earning", "earnings",
  "dues", "money", "cash", "amount", "sar", "settled", "missing",
  "rid_", "ride",
];

// ── Classifier ────────────────────────────────────────────────────────────────
const ClassifierAgent = {
  /**
   * @param {object} slackEvent
   * @param {string} slackEvent.driverMessage  – raw driver message
   * @param {string} slackEvent.screenName     – screen name from Jeeny app
   * @param {string} slackEvent.driverId       – e.g. "D_101"
   * @returns {object} classification result
   */
  run(slackEvent) {
    const { driverMessage, screenName, driverId } = slackEvent;
    const msg = driverMessage.toLowerCase();

    log("CLASSIFIER", `Input → screenName="${screenName}" | message="${driverMessage}"`);

    const hasCitySignal      = CITY_KEYWORDS.some(k => msg.includes(k));
    const hasAssuranceSignal = ASSURANCE_KEYWORDS.some(k => msg.includes(k));

    let subCategory;

    if (hasCitySignal && !hasAssuranceSignal) {
      // Only city keywords found
      subCategory = "City Update";
    } else if (hasAssuranceSignal && !hasCitySignal) {
      // Only assurance keywords found
      subCategory = "Assurance Policy";
    } else if (hasCitySignal && hasAssuranceSignal) {
      // Both signals — city words win (e.g. "change my city" also mentions "pay")
      subCategory = msg.includes("city") ? "City Update" : "Assurance Policy";
    } else {
      // No clear signal — default to Assurance Policy
      subCategory = "Assurance Policy";
    }

    log("CLASSIFIER", `Result → subCategory="${subCategory}"`);

    return {
      subCategory,
      screenName,
      driverId,
      driverMessage,
      channel:   slackEvent.channel,
      messageTs: slackEvent.messageTs,
    };
  },
};

module.exports = { ClassifierAgent };
