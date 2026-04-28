/**
 * Minimal logger — prefixes every line with [TIMESTAMP][AGENT].
 */

function log(agent, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}][${agent.padEnd(16)}] ${message}`);
}

module.exports = { log };
