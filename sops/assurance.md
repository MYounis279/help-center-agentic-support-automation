# SOP: Assurance Policy (Non-Payment)

## 1. Input Extraction
- Extract `Ride_ID` from the message.
- Extract `Driver_ID` from the message or ticket metadata.

## 2. Validation (Read Operation)
- Look up `Ride_ID` in **Ride_Details** tab.
- **IF NOT FOUND:** Respond asking for correct Ride ID.
- **IF Payment Status == "Completed" AND Payout Status == "Settled":**
  - Action: Trigger `MSG_ALREADY_PAID`.

## 3. Execution (Update Operation)
- **IF Payment Status == "Failed":**
  - Step A: Calculate 10% of `Total Fare` from **Ride_Details**.
  - Step B: Deduct that 10% from `Wallet Balance` in **Passenger Table**.
  - Step C: Add `Driver Earning` amount to `Wallet Balance` in **Driver Table**.
  - Step D: Update `Payout Status` to "Settled_Manual" in **Ride_Details**.
- Action: Trigger `MSG_PAYMENT_RESOLVED`.
