/**
 * Slack utility
 *
 * Wraps the Slack Web API for the two operations used by Executor:
 *   - replyInThread  → post a threaded reply
 *   - addReaction    → emoji-react to a message (to mark ticket closed)
 *
 * Auth: set SLACK_BOT_TOKEN in .env
 */

require("dotenv").config();
const { WebClient } = require("@slack/web-api");
const { log }       = require("./logger");

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

const Slack = {
  /**
   * Post `text` as a thread reply to the original driver message.
   *
   * @param {string} channel    – Slack channel ID (e.g. "C012AB3CD")
   * @param {string} threadTs   – timestamp of the parent message
   * @param {string} text       – message to send
   */
  async replyInThread(channel, threadTs, text) {
    await slack.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
    });
    log("SLACK", `Reply sent → channel=${channel} thread=${threadTs}`);
  },

  /**
   * Add an emoji reaction to a message.
   *
   * @param {string} channel    – Slack channel ID
   * @param {string} messageTs  – timestamp of the message to react to
   * @param {string} emoji      – emoji name without colons (e.g. "white_check_mark")
   */
  async addReaction(channel, messageTs, emoji) {
    try {
      await slack.reactions.add({
        channel,
        timestamp: messageTs,
        name:      emoji,
      });
      log("SLACK", `Reaction :${emoji}: added to ${messageTs}`);
    } catch (err) {
      // Reaction already added → ignore
      if (err.data?.error !== "already_reacted") throw err;
    }
  },
};

module.exports = { Slack };
