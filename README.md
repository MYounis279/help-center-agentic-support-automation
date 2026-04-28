# Jeeny Help Center — Agentic Pipeline

A 4-agent AI system that handles driver support tickets from Slack, resolves them via Google Sheets, and closes tickets automatically.

---

## Architecture

```
Slack Message
      │
      ▼
┌─────────────────┐
│ ClassifierAgent │  Reads screen name + message → assigns subCategory
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ContextBuilder  │  Loads assurance.md or city_update.md from /sops
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    DataGuy      │  Queries Sheets, reasons against SOP, builds update plan
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Executor     │  Writes Sheets + replies on Slack thread + adds ✅
└─────────────────┘
```

---

## Folder Structure

```
jeeny-agent/
├── orchestrator.js          ← Main pipeline runner
├── server.js                ← Express webhook server for Slack events
├── agents/
│   ├── classifierAgent.js   ← Agent 1: classify ticket
│   ├── contextBuilder.js    ← Agent 2: load SOP
│   ├── dataGuy.js           ← Agent 3: read sheet + decide action
│   └── executor.js          ← Agent 4: write sheet + send Slack reply
├── sops/
│   ├── assurance.md         ← SOP for payment disputes
│   └── city_update.md       ← SOP for city change requests
├── utils/
│   ├── sheets.js            ← Google Sheets CRUD helpers
│   ├── slack.js             ← Slack Web API helpers
│   └── logger.js            ← Timestamped console logger
└── config/
    ├── slackEvent.example.json   ← Sample event for local testing
    ├── SHEETS_SCHEMA.md          ← Google Sheets tab structure
    └── service-account.json      ← (you add this — NOT committed to git)
```

---

## Google Sheets Setup

See `config/SHEETS_SCHEMA.md` for the exact tab names and column headers.

**Quick summary — 4 tabs required:**

| Tab Name           | Key Column   |
|--------------------|-------------|
| `Driver_Details`   | Driver_ID   |
| `Passenger_Details`| Passenger_ID|
| `Ride_Details`     | Ride_ID     |
| `Plan_Details`     | City        |

---

## Installation

```bash
npm install
cp .env.example .env
# Fill in .env with your credentials
```

---

## Environment Variables

| Variable                          | Description                                    |
|-----------------------------------|------------------------------------------------|
| `SPREADSHEET_ID`                  | ID from your Google Sheet URL                  |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | Path to service account JSON (default: `./config/service-account.json`) |
| `SLACK_BOT_TOKEN`                 | Bot token starting with `xoxb-`                |
| `SLACK_SIGNING_SECRET`            | From Slack App → Basic Information             |
| `PORT`                            | Server port (default: 3000)                    |

---

## Running

```bash
# Production
npm start

# Development (auto-reload)
npm run dev

# Test pipeline locally (uses config/slackEvent.example.json)
npm run test:pipeline
```

---

## Slack App Configuration

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. **OAuth & Permissions** → Add Bot Token Scopes:
   - `chat:write`
   - `reactions:write`
   - `channels:history`
3. **Event Subscriptions** → Enable Events → Request URL:
   ```
   https://<your-domain>/slack/events
   ```
4. Subscribe to bot events:
   - `message.channels`
   - `app_mention`
5. Install app to workspace → copy Bot Token to `.env`
6. Copy Signing Secret to `.env`

---

## Agent Decision Matrix

### Assurance Policy

| Condition                                     | Action                      | Sheet Updates                                      |
|-----------------------------------------------|-----------------------------|----------------------------------------------------|
| Ride ID not found                             | `ASSURANCE_RIDE_NOT_FOUND`  | None                                               |
| Payment=Completed AND Payout=Settled          | `ASSURANCE_ALREADY_PAID`    | None                                               |
| Payment=Failed                                | `ASSURANCE_PAYMENT_RESOLVED`| Deduct 10% passenger wallet, add driver earnings, set Payout_Status=Settled_Manual |

### City Update

| Condition                         | Action                    | Sheet Updates                          |
|-----------------------------------|---------------------------|----------------------------------------|
| Driver face_verified = "no"       | `CITY_VERIFICATION_FAILED`| None                                   |
| City not in Plan_Details          | `CITY_NOT_SERVICED`       | None                                   |
| City found and driver verified    | `CITY_UPDATED`            | Update Driver City + Plan_ID           |

---

## Test Cases (from Meta_Data CSV)

| Ticket | Screen Name      | Message                           | Expected Action              |
|--------|------------------|-----------------------------------|------------------------------|
| 1001   | Payment Issues   | Ride RID_5001, 80 SAR missing     | ASSURANCE_PAYMENT_RESOLVED   |
| 1002   | Account Settings | Moved from Madinah to Riyadh      | CITY_UPDATED                 |
| 1003   | Update Phone     | App shows Jeddah, I'm in Dammam   | CITY_UPDATED (mismatch fixed)|
| 1004   | Assurance Policy | Change city to Abha               | CITY_UPDATED (mismatch fixed)|
| 1005   | Payment Issues   | RID_5002 fare discrepancy         | ASSURANCE_ALREADY_PAID       |
| 1006   | Profile Edit     | Want to drive in London           | CITY_NOT_SERVICED            |
| 1007   | Support          | RID_5003 passenger rude, no pay   | ASSURANCE_ALREADY_PAID       |
| 1008   | Account Update   | Change city to Riyadh. ID: D_103  | CITY_VERIFICATION_FAILED     |

---

## Cursor Agent Mode — Recommended Prompt

When using Cursor's agent mode to iterate on this project, use this system prompt:

```
You are working on the Jeeny driver help center agentic pipeline.
The project is in /jeeny-agent. The pipeline has 4 agents:
1. ClassifierAgent (agents/classifierAgent.js)
2. ContextBuilder  (agents/contextBuilder.js)
3. DataGuy         (agents/dataGuy.js)
4. Executor        (agents/executor.js)

SOPs are in /sops. Sheets utility is in utils/sheets.js.
Always maintain the decision matrix in README.md when adding new cases.
Run `npm run test:pipeline` to verify changes.
```
