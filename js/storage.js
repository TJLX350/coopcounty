(() => {
  "use strict";

  const STORAGE_KEY = "coopCounty.v1.legendary";
  const SCHEMA_VERSION = 2;

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        coop1Name: "Daisy",
        coop2Name: "Mae",
        sound: false
      },
      today: {
        date: Helpers.todayKey(),
        coop1: 0,
        coop2: 0,
        notes: "",
        photo: ""
      },
      journal: []
    };
  }

  function normalize(input) {
    const clean = defaultState();
    if (!input || typeof input !== "object") return clean;

    clean.settings = {
      ...clean.settings,
      ...(input.settings && typeof input.settings === "object" ? input.settings : {})
    };

    if (input.today && typeof input.today === "object") {
      clean.today = {
        ...clean.today,
        ...input.today,
        coop1: Math.max(0, Number(input.today.coop1) || 0),
        coop2: Math.max(0, Number(input.today.coop2) || 0)
      };
    }

    clean.journal = Array.isArray(input.journal)
      ? input.journal
          .filter((entry) => entry && entry.date)
          .map((entry) => ({
            id: entry.id || Helpers.uuid(),
            date: String(entry.date),
            coop1: Math.max(0, Number(entry.coop1) || 0),
            coop2: Math.max(0, Number(entry.coop2) || 0),
            total: Math.max(0, Number(entry.total) || ((Number(entry.coop1) || 0) + (Number(entry.coop2) || 0))),
            notes: String(entry.notes || ""),
            photo: String(entry.photo || ""),
            coop1Name: String(entry.coop1Name || clean.settings.coop1Name),
            coop2Name: String(entry.coop2Name || clean.settings.coop2Name),
            createdAt: entry.createdAt || new Date().toISOString(),
            updatedAt: entry.updatedAt || new Date().toISOString()
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

    clean.version = SCHEMA_VERSION;
    return clean;
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.error("Coop County storage load failed:", error);
      return defaultState();
    }
  }

  let state = load();

  function archiveDraft(day) {
    const hasContent = day.coop1 > 0 || day.coop2 > 0 || day.notes.trim() || day.photo;
    if (!hasContent || !day.date) return;

    const now = new Date().toISOString();
    const existing = state.journal.find((entry) => entry.date === day.date);
    const row = {
      id: existing?.id || Helpers.uuid(),
      date: day.date,
      coop1: Math.max(0, Number(day.coop1) || 0),
      coop2: Math.max(0, Number(day.coop2) || 0),
      total: Math.max(0, Number(day.coop1) || 0) + Math.max(0, Number(day.coop2) || 0),
      notes: String(day.notes || ""),
      photo: String(day.photo || ""),
      coop1Name: state.settings.coop1Name,
      coop2Name: state.settings.coop2Name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      autoSaved: true
    };

    if (existing) Object.assign(existing, row);
    else state.journal.push(row);
    state.journal.sort((a, b) => a.date.localeCompare(b.date));
  }

  function rolloverDay() {
    const today = Helpers.todayKey();
    if (state.today.date !== today) {
      archiveDraft(state.today);
      state.today = {
        date: today,
        coop1: 0,
        coop2: 0,
        notes: "",
        photo: ""
      };
      save();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.error("Coop County storage save failed:", error);
      return false;
    }
  }

  function getState() {
    rolloverDay();
    return state;
  }

  function replaceState(nextState) {
    state = normalize(nextState);
    rolloverDay();
    save();
    return state;
  }

  function resetAll() {
    state = defaultState();
    save();
    return state;
  }

  window.CoopStorage = Object.freeze({
    getState,
    save,
    replaceState,
    resetAll,
    STORAGE_KEY
  });
})();
