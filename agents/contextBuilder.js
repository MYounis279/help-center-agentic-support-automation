/**
 * ContextBuilder
 *
 * Takes ClassifierAgent output and loads the matching SOP file from disk.
 * Returns the raw SOP text so DataGuy can reason against it.
 *
 * SOP files live in  /sops/assurance.md  and  /sops/city_update.md
 */

const fs   = require("fs");
const path = require("path");
const { log } = require("../utils/logger");

const SOP_MAP = {
  "Assurance Policy": "assurance.md",
  "City Update":      "city_update.md",
};

const SOP_DIR = path.join(__dirname, "../sops");

const ContextBuilder = {
  /**
   * @param {object} classification  – output from ClassifierAgent
   * @returns {Promise<object>}      – classification + sopFile + sopText
   */
  async run(classification) {
    const { subCategory } = classification;

    const fileName = SOP_MAP[subCategory];
    if (!fileName) {
      throw new Error(`ContextBuilder: No SOP mapped for subCategory "${subCategory}"`);
    }

    const sopPath = path.join(SOP_DIR, fileName);

    if (!fs.existsSync(sopPath)) {
      throw new Error(`ContextBuilder: SOP file not found at ${sopPath}`);
    }

    const sopText = fs.readFileSync(sopPath, "utf8");
    log("CONTEXT_BUILDER", `Loaded SOP: ${fileName} (${sopText.length} chars)`);

    return {
      ...classification,
      sopFile: fileName,
      sopText,
    };
  },
};

module.exports = { ContextBuilder };
