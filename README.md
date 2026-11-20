# KATAL Roadshow – Lead Capture

Mobile web app for roadshow sales agents. **Frontend:** static site on GitHub Pages (this repo, no build step).
**Backend + database:** one Google Sheet + Google Apps Script web app (`apps-script/Code.gs`).

---

## خطوات التركيب (مرة وحدة بس)

### 1) Google Sheet + Apps Script
1. افتح الـ Google Sheet ← من القائمة فوق: **Extensions → Apps Script**.
2. امسح كل شي مكتوب بـ `Code.gs`، والصق كل محتوى الملف `apps-script/Code.gs`، واضغط **Save** (أيقونة الديسك 💾).
3. فوق، جنب زر **Run**، اختار الدالة **setup** ← اضغط **Run**.
4. رح يطلب صلاحيات: **Review permissions** ← اختار حسابك ← **Advanced** ← **Go to … (unsafe)** ← **Allow**.
5. استنى لحد ما يطلع تحت **Execution completed**. هلق بالشيت صار في 7 تابات: Settings, Agents, Questions, Projects, Units, Leads, Notes.
   - الـ **Admin PIN** موجود بتاب **Settings** (رقم عشوائي، فيك تغيّرو).
6. **Deploy → New deployment** ← جنب "Select type" اضغط ⚙ ← **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
   - اضغط **Deploy** (إذا طلب صلاحيات مرة تانية، نفس الخطوة 4).
7. انسخ الـ **Web app URL** (بينتهي بـ `/exec`). هاد الرابط بينحط بالملف `js/config.js`.

> **إذا عدّلنا الكود بعدين:** الصق الكود الجديد ← Save ← **Deploy → Manage deployments** ← ✏️ ← Version: **New version** ← **Deploy**. الرابط بيضل نفسو.

### 2) GitHub Pages
**Settings → Pages →** Branch: `main` / `(root)` **→ Save**. بعد دقيقة أو دقيقتين الموقع بيشتغل على:
`https://<username>.github.io/katal-roadshow/`

### 3) على موبايل الإيجنت
افتح الرابط بـ Safari (آيفون) أو Chrome (أندرويد). اختياري: **Share → Add to Home Screen** ليصير متل تطبيق.
مهم: كل إيجنت يستعمل نفس الطريقة دايماً (يا المتصفح يا أيقونة الشاشة الرئيسية) لأن كل وحدة إلها ذاكرة منفصلة.

---

## How the Sheet works (tabs)

| Tab | What it holds | Notes |
|---|---|---|
| **Settings** | Event Name, Admin PIN, Default Country Code | Don't rename the names in column A. |
| **Agents** | Agent Name, PIN, Active | Active = No blocks login. Changing a PIN logs that agent out. |
| **Questions** | ID, Order, Question, Short Label, Type, Options, Max Picks, Skippable, Show If Question ID, Show If Answers, Active, Show On Dashboard, Match Field | Options & Show-If answers are comma separated. Order can be decimal (4.5). Empty ID is filled automatically. |
| **Projects** | Project Name, Developer, Location, Handover, Payment Plan, Brochure Link, Active | The 3 `SAMPLE – …` projects are fake — replace them. |
| **Units** | Project Name, Property Type, Unit Type, Starting Price (AED), Size From, Available | Project Name must match the Projects tab exactly. |
| **Leads** | Lead ID, Time, Agent, Client Name, Phone, Liked Units, one column per question label, Raw JSON | Written by the app. A new question label automatically gets a new column (before Raw JSON). |
| **Notes** | Note ID, Time, Lead ID, Agent, Client Name, Note | Written by the app. |

Question types: `Single choice`, `Multiple choice`, `Short text`, `Number`, `Min–Max range`, `Project picker`.
Match fields: `Location`, `Property Type`, `Unit Type`, `Budget`.

Agents get the new questions/projects when they reopen or refresh the app.

## Technical notes
- API: `doPost` with `Content-Type: text/plain` JSON body `{action, ...}` (no CORS preflight). Actions: `agents, login, config, saveLead, checkPhone, myLeads, setLiked, addNote, adminLogin, dashboard, adminData, adminSave`.
- PINs are checked on the server. Tokens are HMAC-signed (secret in Script Properties) and include the PIN, so changing a PIN invalidates old sessions. 6 wrong PINs → 10 min lock.
- An agent can only read/modify their own leads.
- Offline: every write goes to a local outbox (localStorage) and is sent in order when online (auto-retry every 20 s, on reconnect, on app open). Lead IDs are generated on the phone, so retries never create duplicates.
- A service worker caches the app so it opens with no internet.
- `js/config.js` holds the only setting: the Apps Script Web app URL.

### Local testing
```
node dev/test-backend.js          # backend unit tests against an in-memory Sheet mock
node dev/server.js                # site on :8080, mock API on :8081
node dev/e2e.js                   # browser end-to-end test (needs the server running)
```
Open `http://localhost:8080/?api=http://localhost:8081/exec` to use the app against the mock.

## Phases
- [x] Phase 1 – Sheet + Apps Script + setup, login, question flow (show-if, skip), client name/phone, save, offline queue
- [ ] Phase 2 – Unit matching, liked units, My Leads (Call / WhatsApp / notes)
- [ ] Phase 3 – Admin dashboard
- [ ] Phase 4 – Admin editors
