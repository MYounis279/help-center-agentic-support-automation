/**
 * DataGuy
 *
 * The data + decision layer. Reads SOPs implicitly via hardcoded logic,
 * queries Google Sheets, and returns a structured decision object.
 *
 * No LLM used:
 *   - Ride_ID extracted via regex  (RID_XXXX pattern)
 *   - City extracted via keyword   (matched against Plan_Details tab)
 *   - Response messages loaded     from "Messages" tab in Google Sheet
 *
 * Google Sheets tabs used:
 *   - Driver_Details     → Driver_ID | Name | City | Plan_ID | Face_Verified | Wallet_Balance
 *   - Passenger_Details  → Passenger_ID | Name | Wallet_Balance
 *   - Ride_Details       → Ride_ID | Driver_ID | Passenger_ID | Total_Fare | Driver_Earning | Payment_Status | Payout_Status
 *   - Plan_Details       → City | Plan_ID
 *   - Messages           → Message_Key | Message_Text
 *
 * Actions:
 *   ASSURANCE_ALREADY_PAID     → no writes needed
 *   ASSURANCE_PAYMENT_RESOLVED → update Ride + Passenger + Driver wallet
 *   ASSURANCE_RIDE_NOT_FOUND   → ask driver for correct Ride_ID
 *   CITY_VERIFICATION_FAILED   → block; face not verified
 *   CITY_NOT_SERVICED          → block; city not in Plan_Details
 *   CITY_UPDATED               → update Driver city + plan_id
 */

const { Sheets } = require("../utils/sheets");
const { log }    = require("../utils/logger");

// ─── DataGuy ──────────────────────────────────────────────────────────────────
const DataGuy = {

  /**
   * @param {object} slackEvent   – raw Slack event
   * @param {object} context      – output from ContextBuilder
   * @returns {Promise<object>}   – decision object
   */
  async run(slackEvent, context) {
    const { subCategory, driverId, driverMessage } = context;

    log("DATA_GUY", `Processing subCategory="${subCategory}" for driver="${driverId}"`);

    // Load messages from sheet once
    const MESSAGES = await this._getMessages();

    if (subCategory === "Assurance Policy") {
      return this._handleAssurance(driverId, driverMessage, MESSAGES);
    } else if (subCategory === "City Update") {
      return this._handleCityUpdate(driverId, driverMessage, MESSAGES);
    }

    throw new Error(`DataGuy: Unknown subCategory "${subCategory}"`);
  },

  // ── Assurance SOP ──────────────────────────────────────────────────────────
  async _handleAssurance(driverId, driverMessage, MESSAGES) {
    // 1. Extract Ride_ID via regex
    const rideId = this._extractRideId(driverMessage);
    log("DATA_GUY", `Extracted Ride_ID: ${rideId}`);

    if (!rideId) {
      return {
        action:        "ASSURANCE_RIDE_NOT_FOUND",
        driverMessage: MESSAGES.MSG_RIDE_NOT_FOUND,
        sheetUpdates:  [],
      };
    }

    // 2. Look up Ride_ID in Ride_Details
    const ride = await Sheets.findRow("Ride_Details", "Ride_ID", rideId);
    if (!ride) {
      return {
        action:        "ASSURANCE_RIDE_NOT_FOUND",
        driverMessage: MESSAGES.MSG_RIDE_NOT_FOUND,
        sheetUpdates:  [],
      };
    }

    log("DATA_GUY", `Ride found: ${JSON.stringify(ride)}`);

    // 3. Already paid?
    if (ride["Payment_Status"] === "Completed" && ride["Payout_Status"] === "Settled") {
      return {
        action:        "ASSURANCE_ALREADY_PAID",
        driverMessage: MESSAGES.MSG_ALREADY_PAID,
        sheetUpdates:  [],
        rideId,
      };
    }

    // 4. Payment Failed → settle manually
    if (ride["Payment_Status"] === "Failed") {
      const totalFare     = parseFloat(ride["Total_Fare"]);
      const driverEarning = parseFloat(ride["Driver_Earning"]);
      const deduction     = totalFare * 0.10;

      const sheetUpdates = [
        {
          tab:       "Passenger_Details",
          keyCol:    "Passenger_ID",
          keyVal:    ride["Passenger_ID"],
          updateCol: "Wallet_Balance",
          delta:     -deduction,        // deduct 10% from passenger
        },
        {
          tab:       "Driver_Details",
          keyCol:    "Driver_ID",
          keyVal:    driverId,
          updateCol: "Wallet_Balance",
          delta:     +driverEarning,    // credit driver earnings
        },
        {
          tab:       "Ride_Details",
          keyCol:    "Ride_ID",
          keyVal:    rideId,
          updateCol: "Payout_Status",
          value:     "Settled_Manual",
        },
      ];

      return {
        action:        "ASSURANCE_PAYMENT_RESOLVED",
        driverMessage: MESSAGES.MSG_PAYMENT_RESOLVED,
        sheetUpdates,
        rideId,
        totalFare,
        driverEarning,
        deduction,
      };
    }

    // Fallback
    return {
      action:        "ASSURANCE_RIDE_NOT_FOUND",
      driverMessage: MESSAGES.MSG_RIDE_NOT_FOUND,
      sheetUpdates:  [],
      rideId,
    };
  },

  // ── City Update SOP ────────────────────────────────────────────────────────
  async _handleCityUpdate(driverId, driverMessage, MESSAGES) {
    // 1. Verify driver face verification
    const driver = await Sheets.findRow("Driver_Details", "Driver_ID", driverId);
    if (!driver) {
      return {
        action:        "CITY_VERIFICATION_FAILED",
        driverMessage: MESSAGES.MSG_VERIFICATION_FAILED,
        sheetUpdates:  [],
      };
    }

    if ((driver["Face_Verified"] || "").toLowerCase() === "no") {
      log("DATA_GUY", `Driver ${driverId} failed face verification`);
      return {
        action:        "CITY_VERIFICATION_FAILED",
        driverMessage: MESSAGES.MSG_VERIFICATION_FAILED,
        sheetUpdates:  [],
      };
    }

    // 2. Extract city from message by matching against Plan_Details tab
    const newCity = await this._extractCity(driverMessage);
    log("DATA_GUY", `Extracted city: ${newCity}`);

    if (!newCity) {
      return {
        action:        "CITY_NOT_SERVICED",
        driverMessage: MESSAGES.MSG_CITY_NOT_SERVICED,
        sheetUpdates:  [],
      };
    }

    // 3. Look up city in Plan_Details
    const plan = await Sheets.findRow("Plan_Details", "City", newCity);
    if (!plan) {
      log("DATA_GUY", `City "${newCity}" not found in Plan_Details`);
      return {
        action:        "CITY_NOT_SERVICED",
        driverMessage: MESSAGES.MSG_CITY_NOT_SERVICED,
        sheetUpdates:  [],
      };
    }

    const newPlanId = plan["Plan_ID"];
    log("DATA_GUY", `Plan found: city=${newCity}, plan_id=${newPlanId}`);

    // 4. Build sheet updates
    const sheetUpdates = [
      {
        tab:       "Driver_Details",
        keyCol:    "Driver_ID",
        keyVal:    driverId,
        updateCol: "City",
        value:     newCity,
      },
      {
        tab:       "Driver_Details",
        keyCol:    "Driver_ID",
        keyVal:    driverId,
        updateCol: "Plan_ID",
        value:     newPlanId,
      },
    ];

    return {
      action:        "CITY_UPDATED",
      driverMessage: MESSAGES.MSG_CITY_UPDATED,
      sheetUpdates,
      newCity,
      newPlanId,
    };
  },

  // ── Extraction helpers (no LLM) ────────────────────────────────────────────

  /**
   * Extract Ride_ID using regex. Matches patterns like RID_5001, rid_123, etc.
   */
  _extractRideId(message) {
    const match = message.match(/RID_\d+/i);
    const result = match ? match[0].toUpperCase() : null;
    return result;
  },

  /**
   * Extract city by loading all cities from Plan_Details tab
   * and checking if any appear in the message.
   * This way adding a new city to the sheet automatically works here too.
   */
  async _extractCity(message) {
    const plans = await Sheets.getAllRows("Plan_Details");
    const msg   = message.toLowerCase();

    const matched = plans.find(row => {
      const city = (row["City"] || "").toLowerCase();
      return city && msg.includes(city);
    });

    return matched ? matched["City"] : null;
  },

  // ── Load messages from Google Sheet ───────────────────────────────────────
  /**
   * Reads the Messages tab and returns a key→text map.
   * Sheet columns: Message_Key | Message_Text
   *
   * Example rows:
   *   MSG_ALREADY_PAID    | ✅ Hi Driver, your payment has already been settled...
   *   MSG_PAYMENT_RESOLVED| ✅ Hi Driver, we've manually settled your payment...
   *   MSG_RIDE_NOT_FOUND  | ❓ Hi Driver, we could not locate that Ride ID...
   *   MSG_VERIFICATION_FAILED | 🚫 Hi Driver, your face verification is incomplete...
   *   MSG_CITY_NOT_SERVICED   | 🏙️ Hi Driver, that city is not currently serviced...
   *   MSG_CITY_UPDATED    | ✅ Hi Driver, your operating city has been updated...
   */
  async _getMessages() {
    const rows = await Sheets.getAllRows("Messages");
    const map  = {};
    rows.forEach(row => {
      if (row["Message_Key"] && row["Message_Text"]) {
        map[row["Message_Key"]] = row["Message_Text"];
      }
    });
    log("DATA_GUY", `Loaded ${Object.keys(map).length} message templates from sheet`);
    return map;
  },
};

module.exports = { DataGuy };
