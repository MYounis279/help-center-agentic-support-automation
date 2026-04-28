# SOP: City Update Logic

## 1. Identity Verification
- Look up `Driver_ID` in **Driver Table**.
- **IF Face_Verified == "no":**
  - Action: Trigger `MSG_VERIFICATION_FAILED`. Stop.

## 2. City Mapping
- Look up `New_City` (from message) in **Plan_Details** tab.
- **IF City NOT FOUND:** Respond "City not currently serviced."

## 3. Execution (Update Operation)
- Step A: Identify the `New Plan` string from the **Plan_Details** tab for that city.
- Step B: Update **Driver Table** for that `Driver_ID`:
  - Set `City` = New City.
  - Set `Plan_ID` = New Plan Code/String.
- Action: Trigger `MSG_CITY_UPDATED`.
