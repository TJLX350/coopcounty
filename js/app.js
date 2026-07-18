(() => {
  "use strict";

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const state = CoopStorage.getState();
  const panel = $("#panel");
  const panelBody = $("#panelBody");
  const panelTitle = $("#panelTitle");
  const panelKicker = $("#panelKicker");
  const scrim = $("#scrim");
  const toast = $("#toast");
  const cameraInput = $("#cameraInput");
  const restoreInput = $("#restoreInput");
  const confirmDialog = $("#confirmDialog");

  const APP_VERSION = "1.5 Test";
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let lastFocusedElement = null;
  let lastCounterChange = null;

  function totalToday() {
    return state.today.coop1 + state.today.coop2;
  }

  function persist() {
    CoopStorage.save();
    renderScene();
  }

  function renderScene() {
    const stats = calculateStats();
    $("#sceneCoop1").textContent = state.today.coop1;
    $("#sceneCoop2").textContent = state.today.coop2;
    $("#sceneTotal").textContent = totalToday();
    $("#sceneRolling").textContent = stats.rollingTotal;
    $("#sceneAverage").textContent = stats.average;
    $("#sceneBest").textContent = stats.bestDay;
    $("#screenReaderStatus").textContent =
      `${state.settings.coop1Name}: ${state.today.coop1}. ` +
      `${state.settings.coop2Name}: ${state.today.coop2}. ` +
      `Today's total: ${totalToday()}.`;
  }

  function calculateStats() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - 29);

    const rows = state.journal.filter((entry) => {
      const date = new Date(`${entry.date}T12:00:00`);
      return date >= cutoff;
    });

    const rollingTotal = rows.reduce((sum, entry) => sum + entry.total, 0);
    const average = rows.length ? (rollingTotal / rows.length).toFixed(1) : "0";
    const bestDay = rows.length ? Math.max(...rows.map((entry) => entry.total)) : 0;
    const coop1Total = rows.reduce((sum, entry) => sum + entry.coop1, 0);
    const coop2Total = rows.reduce((sum, entry) => sum + entry.coop2, 0);
    const sortedDates = rows.map((entry) => entry.date).sort();
    let streak = 0;
    const recorded = new Set(sortedDates);
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    if (!recorded.has(Helpers.todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (recorded.has(Helpers.todayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    const last7Cutoff = new Date();
    last7Cutoff.setHours(0, 0, 0, 0);
    last7Cutoff.setDate(last7Cutoff.getDate() - 6);
    const previous7Cutoff = new Date(last7Cutoff);
    previous7Cutoff.setDate(previous7Cutoff.getDate() - 7);
    const last7 = rows.filter((entry) => new Date(`${entry.date}T12:00:00`) >= last7Cutoff)
      .reduce((sum, entry) => sum + entry.total, 0);
    const previous7 = rows.filter((entry) => {
      const date = new Date(`${entry.date}T12:00:00`);
      return date >= previous7Cutoff && date < last7Cutoff;
    }).reduce((sum, entry) => sum + entry.total, 0);
    const change = previous7 ? Math.round(((last7 - previous7) / previous7) * 100) : null;

    return { rollingTotal, average, bestDay, coop1Total, coop2Total, daysRecorded: rows.length, streak, last7, previous7, change, rows };
  }

  function sevenDayChartHtml() {
    const entriesByDate = new Map(state.journal.map((entry) => [entry.date, entry]));
    entriesByDate.set(state.today.date, {
      date: state.today.date,
      coop1: state.today.coop1,
      coop2: state.today.coop2,
      total: totalToday()
    });

    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = Helpers.todayKey(date);
      const entry = entriesByDate.get(key) || { date: key, coop1: 0, coop2: 0, total: 0 };
      days.push(entry);
    }

    const max = Math.max(1, ...days.map((day) => day.total));
    return `<div class="production-chart" role="img" aria-label="Egg totals for the last seven days">
      ${days.map((day) => {
        const label = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
        const height = Math.max(day.total ? 8 : 2, Math.round((day.total / max) * 100));
        return `<div class="chart-day" title="${Helpers.escapeHtml(Helpers.niceDate(day.date))}: ${day.total} eggs">
          <span class="chart-value">${day.total}</span>
          <span class="chart-bar" style="--bar-height:${height}%"></span>
          <span class="chart-label">${Helpers.escapeHtml(label)}</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function openPanel(title, kicker, html) {
    lastFocusedElement = document.activeElement;
    panelTitle.textContent = title;
    panelKicker.textContent = kicker;
    panelBody.innerHTML = html;
    scrim.hidden = false;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    bindPanelActions();
    setTimeout(() => $("#closePanel").focus(), 10);
  }

  function closePanel() {
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
    document.body.style.overflow = "";
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  function trapPanelFocus(event) {
    if (event.key !== "Tab" || !panel.classList.contains("open")) return;
    const focusable = $$(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      panel
    ).filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function changeCounter(which, delta) {
    const before = Number(state.today[which] || 0);
    const after = Math.max(0, before + delta);
    if (before === after) return;
    lastCounterChange = { which, before, after };
    state.today[which] = after;
    persist();

    const live = $(`[data-live-counter="${which}"]`);
    if (live) live.textContent = state.today[which];

    const total = $("[data-live-total]");
    if (total) total.textContent = totalToday();
  }

  function counterCard(which, title) {
    const count = state.today[which];
    return `
      <section class="card">
        <h2>${Helpers.escapeHtml(title)}</h2>
        <p>Tap the buttons as you gather. Nothing gets saved to the journal until you button up the day.</p>
        <div class="counter-grid">
          <div class="big-count" data-live-counter="${which}">${count}</div>
          <div class="stepper">
            <button class="round-button" data-panel-counter="${which}" data-delta="-1" aria-label="Subtract one egg">−</button>
            <button class="round-button" data-panel-counter="${which}" data-delta="1" aria-label="Add one egg">+</button>
          </div>
        </div>
      </section>
      <div class="button-row">
        <button class="button button-primary" data-open="gather">Open Today's Gathering</button>
      </div>`;
  }

  function gatheringHtml() {
    return `
      <section class="card">
        <div class="field">
          <label for="coop1Name">First coop name</label>
          <input id="coop1Name" value="${Helpers.escapeHtml(state.settings.coop1Name)}">
        </div>
        <div class="counter-grid">
          <div>
            <h2>${Helpers.escapeHtml(state.settings.coop1Name)}</h2>
            <div class="big-count" data-live-counter="coop1">${state.today.coop1}</div>
          </div>
          <div class="stepper">
            <button class="round-button" data-panel-counter="coop1" data-delta="-1" aria-label="Subtract one egg from first coop">−</button>
            <button class="round-button" data-panel-counter="coop1" data-delta="1" aria-label="Add one egg to first coop">+</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="field">
          <label for="coop2Name">Second coop name</label>
          <input id="coop2Name" value="${Helpers.escapeHtml(state.settings.coop2Name)}">
        </div>
        <div class="counter-grid">
          <div>
            <h2>${Helpers.escapeHtml(state.settings.coop2Name)}</h2>
            <div class="big-count" data-live-counter="coop2">${state.today.coop2}</div>
          </div>
          <div class="stepper">
            <button class="round-button" data-panel-counter="coop2" data-delta="-1" aria-label="Subtract one egg from second coop">−</button>
            <button class="round-button" data-panel-counter="coop2" data-delta="1" aria-label="Add one egg to second coop">+</button>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Today's Gathering</h2>
        <div class="big-count" data-live-total>${totalToday()}</div>
        <p>eggs gathered today</p>
      </section>

      <div class="button-row">
        <button class="button button-secondary" data-action-panel="voice-count">🎙 Tell Me the Counts</button>
        <button class="button button-secondary" data-action-panel="undo-count" ${lastCounterChange ? "" : "disabled"}>Undo Last Count</button>
        <button class="button button-primary" data-action-panel="save">Button Up Today's Gathering</button>
      </div>`;
  }

  function notesHtml() {
    return `
      <section class="card">
        <h2>Chicken Scratch</h2>
        <p>Jot down feed notes, flock behavior, weather, repairs, or the little things worth remembering.</p>
        <div class="field">
          <label for="notesField">Today's notes</label>
          <textarea id="notesField" placeholder="The girls were lively this morning...">${Helpers.escapeHtml(state.today.notes)}</textarea>
        </div>
        ${state.today.photo ? `<img class="photo-preview" src="${state.today.photo}" alt="Today's farm photo">` : ""}
        <div class="button-row">
          <button class="button button-secondary" data-action-panel="voice-notes">🎙 Speak Notes</button>
          <button class="button button-secondary" data-action-panel="camera">📷 Add Photo</button>
          <button class="button button-primary" data-action-panel="save-notes">Save Chicken Scratch</button>
        </div>
      </section>`;
  }

  function journalHtml(search = "") {
    const query = search.trim().toLowerCase();
    const entries = state.journal
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((entry) => {
        if (!query) return true;
        const haystack = [
          entry.date,
          entry.notes,
          entry.coop1Name,
          entry.coop2Name,
          entry.total
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      });

    const list = entries.length
      ? entries.map((entry) => `
          <article class="journal-entry">
            <header>
              <div>
                <strong>${Helpers.escapeHtml(Helpers.niceDate(entry.date))}</strong>
                <div>${Helpers.escapeHtml(entry.coop1Name)}: ${entry.coop1} · ${Helpers.escapeHtml(entry.coop2Name)}: ${entry.coop2}</div>
              </div>
              <strong>${entry.total} eggs</strong>
            </header>
            ${entry.notes ? `<p>${Helpers.escapeHtml(entry.notes)}</p>` : ""}
            ${entry.photo ? `<img src="${entry.photo}" alt="Farm photo from ${Helpers.escapeHtml(entry.date)}">` : ""}
            <div class="entry-actions">
              <button class="small-button" data-edit-entry="${entry.id}">Edit</button>
              <button class="small-button" data-delete-entry="${entry.id}">Delete</button>
            </div>
          </article>
        `).join("")
      : `<div class="empty-state">No journal entries match that search.</div>`;

    return `
      <section class="card">
        <div class="field">
          <label for="journalSearch">Search the journal</label>
          <input id="journalSearch" type="search" value="${Helpers.escapeHtml(search)}" placeholder="Search notes, dates, or totals">
        </div>
      </section>
      <div class="journal-list" id="journalList">${list}</div>`;
  }

  function editJournalEntryHtml(id) {
    const entry = state.journal.find((item) => item.id === id);
    if (!entry) return `<div class="empty-state">That journal entry could not be found.</div>`;
    return `
      <section class="card">
        <h2>${Helpers.escapeHtml(Helpers.niceDate(entry.date))}</h2>
        <div class="field"><label for="editDate">Date</label><input id="editDate" type="date" value="${Helpers.escapeHtml(entry.date)}"></div>
        <div class="edit-count-grid">
          <div class="field"><label for="editCoop1">${Helpers.escapeHtml(entry.coop1Name)}</label><input id="editCoop1" type="number" min="0" inputmode="numeric" value="${entry.coop1}"></div>
          <div class="field"><label for="editCoop2">${Helpers.escapeHtml(entry.coop2Name)}</label><input id="editCoop2" type="number" min="0" inputmode="numeric" value="${entry.coop2}"></div>
        </div>
        <div class="field"><label for="editNotes">Chicken Scratch</label><textarea id="editNotes">${Helpers.escapeHtml(entry.notes)}</textarea></div>
        ${entry.photo ? `<img class="photo-preview" src="${entry.photo}" alt="Farm photo from ${Helpers.escapeHtml(entry.date)}">` : ""}
        <div class="button-row">
          <button class="button button-secondary" data-open="journal">Cancel</button>
          <button class="button button-primary" data-save-entry="${entry.id}">Save Changes</button>
        </div>
      </section>`;
  }

  function dashboardHtml() {
    const stats = calculateStats();
    const recent = state.journal.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    return `
      <section class="card">
        <h2>30-Day Overview</h2>
        <p>The numbers that help you notice patterns without turning the barn into an office.</p>
        <div class="stat-grid">
          <div class="stat-box"><strong>${stats.rollingTotal}</strong><span>Total eggs</span></div>
          <div class="stat-box"><strong>${stats.average}</strong><span>Daily average</span></div>
          <div class="stat-box"><strong>${stats.bestDay}</strong><span>Best day</span></div>
        </div>
        <div class="stat-grid stat-grid-secondary">
          <div class="stat-box"><strong>${stats.coop1Total}</strong><span>${Helpers.escapeHtml(state.settings.coop1Name)}</span></div>
          <div class="stat-box"><strong>${stats.coop2Total}</strong><span>${Helpers.escapeHtml(state.settings.coop2Name)}</span></div>
          <div class="stat-box"><strong>${stats.daysRecorded}</strong><span>Days recorded</span></div>
        </div>
      </section>
      <section class="card">
        <h2>Production Pulse</h2>
        <div class="pulse-grid">
          <div class="pulse-item"><strong>${stats.streak}</strong><span>day recording streak</span></div>
          <div class="pulse-item"><strong>${stats.last7}</strong><span>eggs in the last 7 days</span></div>
          <div class="pulse-item"><strong>${stats.change === null ? "—" : `${stats.change > 0 ? "+" : ""}${stats.change}%`}</strong><span>vs. previous 7 days</span></div>
        </div>
      </section>
      <section class="card">
        <h2>Last 7 Days</h2>
        <p>A quick look at the gathering rhythm, including today.</p>
        ${sevenDayChartHtml()}
      </section>
      <section class="card">
        <h2>Today</h2>
        <p>${Helpers.niceDate(state.today.date)}</p>
        <div class="stat-grid">
          <div class="stat-box"><strong>${state.today.coop1}</strong><span>${Helpers.escapeHtml(state.settings.coop1Name)}</span></div>
          <div class="stat-box"><strong>${state.today.coop2}</strong><span>${Helpers.escapeHtml(state.settings.coop2Name)}</span></div>
          <div class="stat-box"><strong>${totalToday()}</strong><span>Total</span></div>
        </div>
      </section>
      <section class="card">
        <h2>Recent Journal Entries</h2>
        ${recent.length ? recent.map((entry) => `
          <p><strong>${Helpers.escapeHtml(entry.date)}</strong> — ${entry.total} eggs${entry.notes ? ` · ${Helpers.escapeHtml(entry.notes.slice(0, 70))}` : ""}</p>
        `).join("") : `<div class="empty-state">The first page is waiting on today's story.</div>`}
        <div class="button-row">
          <button class="button button-secondary" data-open="journal">View Full Journal</button>
        </div>
      </section>`;
  }

  function toolsHtml() {
    const installButton = deferredInstallPrompt
      ? `<button class="button button-primary" data-action-panel="install">Install Coop County</button>`
      : "";

    return `
      ${installButton ? `
      <section class="card install-banner">
        <h2>Keep Coop County Close</h2>
        <p>Install it on the home screen so it opens like its own app.</p>
        ${installButton}
      </section>` : ""}
      <section class="card">
        <h2>Backup & Export</h2>
        <p>Your journal lives on this device. Take a backup now and then so your history travels with you.</p>
        <div class="button-row">
          <button class="button button-secondary" data-action-panel="export-csv">Export Spreadsheet</button>
          <button class="button button-secondary" data-action-panel="backup">Download Backup</button>
          <button class="button button-secondary" data-action-panel="restore">Restore Backup</button>
        </div>
      </section>
      <section class="card">
        <h2>Today</h2>
        <div class="button-row">
          <button class="button button-secondary" data-action-panel="clear-today">Clear Today Only</button>
        </div>
      </section>
      <section class="card">
        <h2>Whole App</h2>
        <p>This removes all counts, notes, photos, names, and journal history from this browser.</p>
        <div class="button-row">
          <button class="button button-danger" data-action-panel="reset-all">Erase Everything</button>
        </div>
      </section>
      <section class="card">
        <h2>About</h2>
        <p><strong>Coop County Version ${APP_VERSION}</strong><br>Offline-first. No account. No subscription. Your records stay on your device unless you export them.</p>
      </section>`;
  }

  function menuHtml() {
    return `
      <div class="menu-grid">
        <button class="menu-button" data-open="gather"><strong>Morning Gathering</strong><span>Count both coops and save the day.</span></button>
        <button class="menu-button" data-open="notes"><strong>Chicken Scratch</strong><span>Notes, thoughts, and farm details.</span></button>
        <button class="menu-button" data-open="journal"><strong>Farm Journal</strong><span>Review, search, edit, and delete entries.</span></button>
        <button class="menu-button" data-open="dashboard"><strong>30-Day Overview</strong><span>Totals, average, and best day.</span></button>
        <button class="menu-button" data-open="camera"><strong>Farm Camera</strong><span>Add a photo to today's entry.</span></button>
        <button class="menu-button" data-open="tools"><strong>Tool Shed</strong><span>Backup, export, restore, and reset.</span></button>
      </div>`;
  }

  function openView(view) {
    switch (view) {
      case "coop-one":
        openPanel(state.settings.coop1Name, "Egg Counter", counterCard("coop1", state.settings.coop1Name));
        break;
      case "coop-two":
        openPanel(state.settings.coop2Name, "Egg Counter", counterCard("coop2", state.settings.coop2Name));
        break;
      case "gather":
        openPanel("Morning Gathering", Helpers.niceDate(state.today.date), gatheringHtml());
        break;
      case "notes":
        openPanel("Chicken Scratch", "Notes, thoughts & ideas", notesHtml());
        break;
      case "journal":
        openPanel("Farm Journal", `${state.journal.length} saved day${state.journal.length === 1 ? "" : "s"}`, journalHtml());
        break;
      case "dashboard":
        openPanel("30-Day Overview", "A little farm wisdom in the numbers", dashboardHtml());
        break;
      case "camera":
        cameraInput.click();
        break;
      case "tools":
        openPanel("Tool Shed", "Settings, backups & more", toolsHtml());
        break;
      case "menu":
        openPanel("Coop County", "Where do you want to go?", menuHtml());
        break;
      default:
        openPanel("Coop County", "Good morning", menuHtml());
    }
  }

  function saveToday() {
    state.settings.coop1Name = ($("#coop1Name")?.value || state.settings.coop1Name).trim() || "Coop One";
    state.settings.coop2Name = ($("#coop2Name")?.value || state.settings.coop2Name).trim() || "Coop Two";
    if ($("#notesField")) state.today.notes = $("#notesField").value.trim();

    const now = new Date().toISOString();
    const existing = state.journal.find((entry) => entry.date === state.today.date);
    const row = {
      id: existing?.id || Helpers.uuid(),
      date: state.today.date,
      coop1: state.today.coop1,
      coop2: state.today.coop2,
      total: totalToday(),
      notes: state.today.notes,
      photo: state.today.photo,
      coop1Name: state.settings.coop1Name,
      coop2Name: state.settings.coop2Name,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    if (existing) {
      Object.assign(existing, row);
    } else {
      state.journal.push(row);
    }

    state.journal.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    showToast("Everything's buttoned up tighter than a feed sack.");
    openView("dashboard");
  }

  function saveNotes() {
    state.today.notes = $("#notesField")?.value.trim() || "";
    persist();
    showToast("Chicken Scratch tucked safely away.");
  }

  function startVoice(mode) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      showToast("Voice listening is not supported in this browser.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    showToast("Listening…");

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript.trim();

      if (mode === "notes") {
        const field = $("#notesField");
        const existing = field?.value.trim() || "";
        if (field) field.value = `${existing}${existing ? " " : ""}${text}`;
        state.today.notes = field?.value || text;
        persist();
        showToast("I caught it and tucked it into Chicken Scratch.");
        return;
      }

      const numbers = (text.match(/\d+/g) || []).map(Number);
      if (numbers.length >= 2) {
        state.today.coop1 = Math.max(0, numbers[0]);
        state.today.coop2 = Math.max(0, numbers[1]);
        persist();
        openView("gather");
        showToast(`Got it — ${numbers[0]} and ${numbers[1]}.`);
      } else {
        showToast('Try saying, “Coop one 8, coop two 6.”');
      }
    };

    recognition.onerror = () => showToast("I didn't catch that one. Try again or type it in.");
    recognition.start();
  }

  async function handlePhoto(file) {
    try {
      state.today.photo = await Helpers.fileToDataUrl(file);
      persist();
      showToast("Farm photo added to today's gathering.");
      openView("notes");
    } catch (error) {
      showToast(error.message || "That photo could not be added.");
    } finally {
      cameraInput.value = "";
    }
  }

  function exportCsv() {
    const rows = [
      ["Date", "First Coop", "First Coop Eggs", "Second Coop", "Second Coop Eggs", "Total", "Chicken Scratch"],
      ...(() => {
        const rows = state.journal.slice();
        if (!rows.some((entry) => entry.date === state.today.date) && (totalToday() || state.today.notes || state.today.photo)) {
          rows.push({
            date: state.today.date, coop1Name: state.settings.coop1Name, coop1: state.today.coop1,
            coop2Name: state.settings.coop2Name, coop2: state.today.coop2, total: totalToday(), notes: state.today.notes
          });
        }
        return rows.sort((a, b) => a.date.localeCompare(b.date));
      })().map((entry) => [
        entry.date,
        entry.coop1Name,
        entry.coop1,
        entry.coop2Name,
        entry.coop2,
        entry.total,
        entry.notes
      ])
    ];

    const csv = rows.map((row) =>
      row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    Helpers.download(csv, `coop-county-journal-${Helpers.todayKey()}.csv`, "text/csv;charset=utf-8");
    showToast("Spreadsheet copy downloaded.");
  }

  function backup() {
    const payload = {
      app: "Coop County",
      version: 2,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
    Helpers.download(
      JSON.stringify(payload, null, 2),
      `coop-county-backup-${Helpers.todayKey()}.json`,
      "application/json"
    );
    showToast("Backup downloaded.");
  }

  async function restore(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const nextState = parsed?.data || parsed;
      const replaced = CoopStorage.replaceState(nextState);
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, replaced);
      renderScene();
      closePanel();
      showToast("Backup restored. Welcome home.");
    } catch (error) {
      showToast("That backup could not be restored.");
    } finally {
      restoreInput.value = "";
    }
  }

  function confirmAction(title, message) {
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    confirmDialog.showModal();
    return new Promise((resolve) => {
      const handler = () => {
        confirmDialog.removeEventListener("close", handler);
        resolve(confirmDialog.returnValue === "confirm");
      };
      confirmDialog.addEventListener("close", handler);
    });
  }

  async function deleteEntry(id) {
    const entry = state.journal.find((item) => item.id === id);
    if (!entry) return;
    const confirmed = await confirmAction(
      "Delete this journal entry?",
      `${Helpers.niceDate(entry.date)} and its notes/photo will be removed.`
    );
    if (!confirmed) return;
    state.journal = state.journal.filter((item) => item.id !== id);
    persist();
    openView("journal");
    showToast("Journal entry deleted.");
  }

  function editEntry(id) {
    const entry = state.journal.find((item) => item.id === id);
    if (!entry) return;
    openPanel("Edit Journal Entry", Helpers.niceDate(entry.date), editJournalEntryHtml(id));
  }

  function saveEditedEntry(id) {
    const entry = state.journal.find((item) => item.id === id);
    if (!entry) return;
    const nextDate = $("#editDate")?.value || entry.date;
    const duplicate = state.journal.find((item) => item.id !== id && item.date === nextDate);
    if (duplicate) {
      showToast("There is already a saved entry for that date.");
      return;
    }
    entry.date = nextDate;
    entry.coop1 = Math.max(0, Number($("#editCoop1")?.value) || 0);
    entry.coop2 = Math.max(0, Number($("#editCoop2")?.value) || 0);
    entry.total = entry.coop1 + entry.coop2;
    entry.notes = $("#editNotes")?.value.trim() || "";
    entry.updatedAt = new Date().toISOString();
    state.journal.sort((a, b) => a.date.localeCompare(b.date));
    persist();
    openView("journal");
    showToast("Journal entry updated without changing today's count.");
  }

  function bindPanelActions() {
    $$("[data-panel-counter]", panelBody).forEach((button) => {
      button.addEventListener("click", () => {
        changeCounter(button.dataset.panelCounter, Number(button.dataset.delta));
      });
    });

    $$("[data-open]", panelBody).forEach((button) => {
      button.addEventListener("click", () => openView(button.dataset.open));
    });

    $("[data-action-panel='save']", panelBody)?.addEventListener("click", saveToday);
    $("[data-action-panel='save-notes']", panelBody)?.addEventListener("click", saveNotes);
    $("[data-action-panel='voice-count']", panelBody)?.addEventListener("click", () => startVoice("count"));
    $("[data-action-panel='undo-count']", panelBody)?.addEventListener("click", () => {
      if (!lastCounterChange) return;
      state.today[lastCounterChange.which] = lastCounterChange.before;
      lastCounterChange = null;
      persist();
      openView("gather");
      showToast("Last count change undone.");
    });
    $("[data-action-panel='voice-notes']", panelBody)?.addEventListener("click", () => startVoice("notes"));
    $("[data-action-panel='camera']", panelBody)?.addEventListener("click", () => cameraInput.click());
    $("[data-action-panel='export-csv']", panelBody)?.addEventListener("click", exportCsv);
    $("[data-action-panel='backup']", panelBody)?.addEventListener("click", backup);
    $("[data-action-panel='restore']", panelBody)?.addEventListener("click", () => restoreInput.click());

    $("[data-action-panel='install']", panelBody)?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      openView("tools");
    });

    $("[data-action-panel='clear-today']", panelBody)?.addEventListener("click", async () => {
      const confirmed = await confirmAction(
        "Clear today's slate?",
        "Today's unsaved counts, notes, and photo will be reset. Saved journal entries remain."
      );
      if (!confirmed) return;
      state.today = {
        date: Helpers.todayKey(),
        coop1: 0,
        coop2: 0,
        notes: "",
        photo: ""
      };
      persist();
      closePanel();
      showToast("Today's slate is clean.");
    });

    $("[data-action-panel='reset-all']", panelBody)?.addEventListener("click", async () => {
      const confirmed = await confirmAction(
        "Erase everything?",
        "This removes all Coop County data stored in this browser. Download a backup first if you may want it later."
      );
      if (!confirmed) return;
      const fresh = CoopStorage.resetAll();
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, fresh);
      renderScene();
      closePanel();
      showToast("Coop County has been reset.");
    });

    const search = $("#journalSearch", panelBody);
    if (search) {
      search.addEventListener("input", Helpers.debounce(() => {
        $("#journalList").innerHTML = (() => {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = journalHtml(search.value);
          return $("#journalList", wrapper)?.innerHTML || "";
        })();
        bindJournalEntryButtons();
      }, 160));
    }

    $("[data-save-entry]", panelBody)?.addEventListener("click", (event) => saveEditedEntry(event.currentTarget.dataset.saveEntry));

    bindJournalEntryButtons();
  }

  function bindJournalEntryButtons() {
    $$("[data-delete-entry]", panelBody).forEach((button) => {
      button.addEventListener("click", () => deleteEntry(button.dataset.deleteEntry));
    });
    $$("[data-edit-entry]", panelBody).forEach((button) => {
      button.addEventListener("click", () => editEntry(button.dataset.editEntry));
    });
  }

  function bindScene() {
    $$("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "save") saveToday();
        else openView(action);
      });
    });

    $$("[data-counter]").forEach((button) => {
      button.addEventListener("click", () => {
        changeCounter(button.dataset.counter, Number(button.dataset.delta));
      });
    });

    $("#closePanel").addEventListener("click", closePanel);
    scrim.addEventListener("click", closePanel);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && panel.classList.contains("open")) closePanel();
      trapPanelFocus(event);
    });

    cameraInput.addEventListener("change", () => {
      const file = cameraInput.files?.[0];
      if (file) handlePhoto(file);
    });

    restoreInput.addEventListener("change", () => {
      const file = restoreInput.files?.[0];
      if (file) restore(file);
    });

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
    });

    window.addEventListener("appinstalled", () => {
      deferredInstallPrompt = null;
      showToast("Coop County is installed.");
    });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").then((registration) => {
        registration.update();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              showToast("A fresh Coop County update is ready. Reopen the app to use it.");
            }
          });
        });
      }).catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
    });
  }

  bindScene();
  renderScene();
  registerServiceWorker();
})();
