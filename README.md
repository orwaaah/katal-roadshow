# KATAL Roadshow – Lead Capture

Mobile web app for roadshow sales agents. **Frontend:** static site on GitHub Pages (this repo, no build step).
**Backend + database:** one Google Sheet + Google Apps Script web app (`apps-script/Code.gs`).

- Agent app: `https://orwaaah.github.io/katal-roadshow/`
- Admin dashboard: `https://orwaaah.github.io/katal-roadshow/admin.html` (Admin PIN in the Settings tab)

## How agents work
1. **New Lead** → client name + phone (+ optional email) → Save. The lead goes to list 1 (**My Leads**).
2. **Send invitation** (after saving, or next to each lead) opens the invitation page; the client name is copied so the agent can paste it.
3. Open a lead → **Confirm coming** → it moves to list 2 (**Confirmed Guests**).
4. At the event: search by name/phone → **Start form** → answer the questions → **Save answers** → the matching units appear; tick the ones the client liked → the lead moves to list 3 (**Final Leads**).
5. Each lead page has Call, WhatsApp, Invite, notes, and "Edit answers". Nothing is sent to the client automatically.
6. Works offline: everything is saved on the phone first and synced automatically ("x pending sync").

---

## خطوات التركيب

### 1) الكود بالـ Apps Script (أول مرة، أو كل ما يتغيّر الكود)
1. افتح الـ Google Sheet ← **Extensions → Apps Script**.
2. امسح كل شي بـ `Code.gs` والصق كل محتوى `apps-script/Code.gs` ← **Ctrl+S**.
3. **أول مرة:** Deploy → New deployment ← ⚙ **Web app** ← Execute as: **Me** ← Who has access: **Anyone** ← Deploy ← Allow.
   **بعد كل تعديل:** Deploy → **Manage deployments** ← ✏️ ← Version: **New version** ← Deploy. (الرابط بيضل نفسو)
4. التابات بتنعمل لحالها مع أول استعمال (أو شغّل `setup`).

### 2) GitHub Pages
Settings → Pages → Branch: `main` / `(root)` → Save.

---

## How the Sheet works (tabs)

| Tab | What it holds | Notes |
|---|---|---|
| **Settings** | Event Name, Admin PIN, Default Country Code, List 1/2/3 Name, Invitation Link | Don't rename the names in column A. The list names are what agents and the dashboard show. `{name}` in the Invitation Link is replaced by the client name. |
| **Agents** | Agent Name, PIN, Active | Active = No blocks login. Changing a PIN logs that agent out. |
| **Questions** | ID, Order, Question, Short Label, Type, Options, Max Picks, Skippable, Show If Question ID, Show If Answers, Active, Show On Dashboard, Match Field | Options & Show-If answers are comma separated. Order can be decimal (4.5). Empty ID is filled automatically. |
| **Projects** | Project Name, Developer, Location, Handover, Payment Plan, Brochure Link, Active | The 3 `SAMPLE – …` projects are fake — replace them. |
| **Units** | Project Name, Property Type, Unit Type, Starting Price (AED), Size From, Available | Project Name must match the Projects tab exactly. |
| **Leads** | Lead ID, Time, Agent, Client Name, Phone, Email, Status, Invited At, Confirmed At, Form Done At, Liked Units, one column per question label, Raw JSON | Written by the app. A new question label automatically gets a new column (before Raw JSON). Status = the list the lead is in. |
| **Notes** | Note ID, Time, Lead ID, Agent, Client Name, Note | Written by the app. |

Question types: `Single choice`, `Multiple choice`, `Short text`, `Number`, `Min–Max range`, `Project picker`.
Match fields: `Location`, `Property Type`, `Unit Type`, `Budget`.

Agents get the new questions/projects when they reopen or refresh the app.

## Technical notes
- API: `doPost` with `Content-Type: text/plain` JSON body `{action, ...}` (no CORS preflight). Actions: `agents, login, config, saveLead, updateLead, checkPhone, myLeads, setLiked, addNote, adminLogin, dashboard, adminData, adminSave`.
- PINs are checked on the server. Tokens are HMAC-signed (secret in Script Properties) and include the PIN, so changing a PIN invalidates old sessions. 6 wrong PINs → 10 min lock.
- An agent can only read/modify their own leads.
- Offline: every write goes to a local outbox (localStorage) and is sent in order when online (auto-retry every 20 s, on reconnect, on app open). Lead IDs are generated on the phone, so retries never create duplicates.
- A service worker caches the app so it opens with no internet.
- `js/config.js` holds the only setting: the Apps Script Web app URL.

### Local testing
```
node dev/test-backend.js && node dev/test-v11.js && node dev/test-autosetup.js   # backend tests (in-memory Sheet mock)
node dev/server.js                # site on :8080, mock API on :8081
node dev/e2e.js && node dev/e2e-admin.js   # browser end-to-end tests (need the server running)
```
Open `http://localhost:8080/?api=http://localhost:8081/exec` to use the app against the mock.

## Phases
- [x] Phase 1 – Sheet + Apps Script, login, question flow (show-if, skip), offline queue
- [x] v1.1 – New workflow: quick add → invite → confirm → form; 3 lists with search; lead page (call, WhatsApp, notes); unit matching + liked units
- [x] Admin dashboard – KPIs, per-agent counts, filters, lead details, Excel export
- [ ] Admin editors (questions, projects, units, agents, settings) — until then edit the Sheet tabs directly

Third-party: `js/vendor/xlsx.full.min.js` is SheetJS Community Edition 0.18.5 (Apache-2.0), used only for the Excel download.
