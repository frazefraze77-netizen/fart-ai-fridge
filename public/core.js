"use strict";

globalThis.FartCore = (() => {
  const CURATED = globalThis.FART_CATALOG.foods;
  const CATALOG = { ...CURATED };
  const DAY_MS = 86_400_000;
  const WINDOW = 30;
  const FREQUENT = 2;
  const STORAGE_KEY = "fart-ai-fridge-demo-v2";
  const LEGACY_KEY = "fart-ai-fridge-demo-v1";
  const clock = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
  });
  const ALIASES = new Map(Object.entries(globalThis.FART_CATALOG.aliases));
  const GROUPS = ["any", "fruit", "vegetable", "dairy", "protein", "pantry"];
  const labelNames = [...new Map([
    ...Object.keys(CURATED).map((key) => [key, key]),
    ...ALIASES
  ])].sort(([a], [b]) => b.length - a.length);

  const groupByCategory = new Map([
    [1, "dairy"], [5, "protein"], [7, "protein"], [9, "fruit"], [10, "protein"], [11, "vegetable"],
    [12, "protein"], [13, "protein"], [15, "protein"], [16, "protein"], [17, "protein"]
  ]);
  const curatedIds = new Set(Object.values(CURATED)
    .map(({ nutritionSource }) => Number(nutritionSource.url.match(/food-details\/(\d+)/)?.[1])));
  for (const [id, description, category, protein, fiber, carbs, fat] of globalThis.FART_USDA.rows) {
    if (curatedIds.has(id)) continue;
    let name = description;
    let key = normalizeName(name);
    if (Object.hasOwn(CATALOG, key) || ALIASES.has(key)) {
      name = `${description} (USDA ${id})`;
      key = normalizeName(name);
    }
    CATALOG[key] = {
      name, group: category === 1 && /^egg\b/i.test(description) ? "protein" : groupByCategory.get(category) ?? "pantry",
      category: globalThis.FART_USDA.categories[category] || "USDA foods",
      macros: { protein, fiber, carbs, fat }, referenceOnly: true,
      nutritionSource: { label: description, url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients` }
    };
  }
  const foodIndex = Object.entries(CATALOG).map(([key, profile]) => ({
    key, title: normalizeName(profile.name), words: normalizeName(profile.name).split(" "), profile
  }));

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase().normalize("NFKD")
      .replace(/\p{M}/gu, "").replaceAll("ß", "ss").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function keyFor(name) {
    const key = normalizeName(name) || String(name || "").trim().toLowerCase();
    return ALIASES.get(key) ?? key;
  }

  function searchCatalog(query, group = "any", limit = 20, wholeWords = false) {
    const title = normalizeName(query);
    const exact = keyFor(query);
    const tokens = title ? title.split(" ") : [];
    const ranked = [];
    for (const entry of foodIndex) {
      const { key, profile, words } = entry;
      if (group !== "any" && group !== profile.group) continue;
      if (tokens.length && key !== exact && !tokens.every((token) =>
        words.some((word) => word === token || (!wholeWords && token.length >= 2 && word.startsWith(token))))) continue;
      const score = (key === exact ? 200 : 0)
        + (title && entry.title === title ? 140 : 0)
        + (title && entry.title.startsWith(title) ? 38 : 0)
        + (title && entry.title.includes(title) ? 16 : 0)
        + (tokens.includes(normalizeName(profile.name.split(",")[0])) ? 14 : 0)
        + (profile.referenceOnly ? 0 : 14) - (title ? words.length * 0.3 : 0);
      ranked.push({ score, profile });
    }
    ranked.sort((a, b) => b.score - a.score || a.profile.name.localeCompare(b.profile.name));
    return { total: ranked.length, matches: ranked.slice(0, limit).map(({ profile }) => profile) };
  }

  function findLabelNames(line, includeReferences = true) {
    const exact = catalogFor(line);
    if (exact) return [exact.name];
    const normalized = normalizeName(line);
    const modified = /\b(juice|saft|jam|marmelade|sauce|sosse|puree|chips|powder|pulver|smoothie|geschmack|flavou?r(?:ed)?|frozen|gefroren|canned|dry|dried|getrocknet|cooked|gekocht|roasted|smoked|gerauchert|sweetened|unsweetened|gesusst|ungesusst)\b/.test(normalized);
    if (!modified) {
      const padded = ` ${normalized} `;
      const found = [];
      for (const [alias, key] of labelNames) {
        if (!padded.includes(` ${alias} `) || found.some(({ alias: longer }) => ` ${longer} `.includes(` ${alias} `))) continue;
        found.push({ alias, key });
      }
      if (found.length) return [...new Set(found.map(({ key }) => CATALOG[key].name))];
    }
    if (!includeReferences) return [];
    const commonLabels = { apfelsaft: "apple juice", orangensaft: "orange juice", olivenol: "olive oil" };
    const replacements = { saft: "juice", gefroren: "frozen", getrocknet: "dried", gekocht: "cooked", gerauchert: "smoked" };
    const words = (commonLabels[normalized] ?? normalized).split(" ")
      .filter((word) => word.length >= 2 && !/^(organic|bio|fresh|frisch|premium|original|natural|naturlich)$/.test(word))
      .map((word) => replacements[word] ?? word);
    if (words.length < 2) return [];
    return searchCatalog(words.join(" "), "any", 4, true).matches.map(({ name }) => name);
  }

  function catalogFor(name) {
    const key = keyFor(name);
    return Object.hasOwn(CATALOG, key) ? CATALOG[key] : undefined;
  }

  function today() {
    const parts = Object.fromEntries(clock.formatToParts(new Date()).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function timestamp(date) {
    return Date.parse(`${date}T00:00:00Z`);
  }

  function addDays(date, count) {
    return new Date(timestamp(date) + count * DAY_MS).toISOString().slice(0, 10);
  }

  function daysBetween(date, reference) {
    return (timestamp(date) - timestamp(reference)) / DAY_MS;
  }

  function validDate(date) {
    return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(timestamp(date)) && addDays(date, 0) === date;
  }

  function makeFood(fields, date, id = globalThis.crypto?.randomUUID?.() ?? `food-${Date.now()}-${Math.random()}`) {
    const catalog = catalogFor(fields.name);
    const name = catalog?.name ?? String(fields.name).trim();
    const stored = validDate(fields.stored_since) ? fields.stored_since : date;
    const provided = validDate(fields.expiration_date);
    const estimate = !provided && catalog?.storage;
    return {
      id, name,
      company: String(fields.company || "Unbranded").trim(),
      quantity_g: Number.isFinite(fields.quantity_g) && fields.quantity_g >= 1 ? fields.quantity_g : null,
      stored_since: stored,
      expiration_date: provided ? fields.expiration_date : estimate ? addDays(stored, estimate.days) : null,
      date_source: provided ? "label" : estimate ? "estimate" : "unknown",
      date_kind: fields.date_kind === "best-before" ? "best-before" : "use-by",
      input_source: fields.input_source ?? "Manual",
      quantity_source: fields.quantity_source ?? "Entered",
      confidence: fields.confidence ?? null,
      photo_label: fields.photo_label ?? null
    };
  }

  function sampleState(date = today(), largeText = false) {
    const foods = [
      ["Spinach", "FART Demo Farm", 85, 0],
      ["Greek yogurt", "FART Demo Dairy", 150, 3],
      ["Egg", "FART Demo Farm", 100, 5],
      ["Carrot", "Unbranded", 120, 6]
    ].map(([name, company, quantity_g, days], index) =>
      makeFood({ name, company, quantity_g, expiration_date: addDays(date, days), input_source: "Sample" }, date, `sample-${index}`));
    const history = [
      ["Apple", "Unbranded", 182, -18], ["Apple", "Unbranded", 182, -10], ["Apple", "Unbranded", 182, -3],
      ["Banana", "FART Demo Farm", 120, -12], ["Banana", "FART Demo Farm", 120, -4],
      ["Orange", "Unbranded", 131, -5]
    ].map(([name, company, quantity_g, days]) => ({ name, company, quantity_g, date: addDays(date, days) }));
    return {
      date, foods, history, toBuy: [], lastTakeOut: null,
      preference: "any", nutritionGoal: "fiber", largeText,
      nextReview: addDays(date, WINDOW), lastReview: null, reviewDropped: 0
    };
  }

  function loadState() {
    try {
      const state = JSON.parse(FartStorage.getItem(STORAGE_KEY));
      if (state && validDate(state.date) && validDate(state.nextReview)
          && Array.isArray(state.foods) && Array.isArray(state.history) && Array.isArray(state.toBuy)
          && GROUPS.includes(state.preference) && ["fiber", "protein"].includes(state.nutritionGoal)) return state;
      const old = JSON.parse(FartStorage.getItem(LEGACY_KEY));
      if (old && validDate(old.date) && Array.isArray(old.foods)) {
        const imported = sampleState(old.date, Boolean(old.largeText));
        const sampleNames = ["Spinach", "Cherry tomatoes", "Greek yogurt", "Eggs", "Cucumber"];
        const sampleQuantities = ["1 bag", "1 box", "1 tub", "4 eggs", "1 whole"];
        const sampleDates = [0, 1, 4, 5, 6];
        const untouched = old.foods.length === sampleNames.length && !old.usedCount
          && old.foods.every((food, index) => food.name === sampleNames[index]
            && food.quantity === sampleQuantities[index] && food.useBy === addDays(old.date, sampleDates[index]));
        if (!untouched) {
          imported.history = [];
          imported.foods = old.foods.map((food) => {
            const weight = String(food.quantity).match(/^(\d+(?:\.\d+)?)\s*(kg|g)$/i);
            const quantity_g = weight ? Number(weight[1]) * (weight[2].toLowerCase() === "kg" ? 1000 : 1) : null;
            return makeFood({ name: food.name, company: "Unspecified", quantity_g,
              expiration_date: food.useBy, input_source: "Imported" }, old.date, food.id);
          });
        }
        return imported;
      }
    } catch {
      // When browser storage is unavailable, start a fresh class demo.
    }
    return sampleState();
  }

  function saveState(state) {
    try {
      FartStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The current session remains usable when browser storage is unavailable.
    }
  }

  function deadline(food, date) {
    return validDate(food.expiration_date) ? daysBetween(food.expiration_date, date) : null;
  }

  function dateStatus(food, date) {
    const days = deadline(food, date);
    if (days === null) return { days, tone: "soon", label: "Date needed" };
    if (days < 0) return {
      days, tone: "past", label: food.date_source === "estimate" ? "Estimate passed" : "Past date"
    };
    if (days === 0) return { days, tone: "urgent", label: "Due today" };
    if (days === 1) return { days, tone: "soon", label: "Due tomorrow" };
    if (days === 2) return { days, tone: "soon", label: "Due in 2 days" };
    return { days, tone: "later", label: `In ${days} days` };
  }

  function scoreFood(food, state) {
    const status = dateStatus(food, state.date);
    const profile = catalogFor(food.name);
    const minutes = profile?.recipe?.minutes;
    const nutrient = profile?.macros[state.nutritionGoal];
    const target = state.nutritionGoal === "protein" ? 10 : 5;
    const expiry = status.days === null || status.days < 0 ? 0 : Math.max(0, 40 - 6 * status.days);
    const preference = state.preference === "any" ? 10 : state.preference === profile?.group ? 20 : 0;
    const nutrition = Number.isFinite(nutrient) ? 20 * Math.min(1, nutrient / target) : 0;
    const prep = minutes === undefined ? 0 : minutes <= 10 ? 20 : minutes <= 20 ? 10 : 0;
    const points = status.days !== null && status.days < 0 ? null : 100 - Math.round(expiry + preference + nutrition + prep);
    const level = points === null ? ["past", "Past date"] : points <= 30 ? ["rank-red", "Low"]
      : points <= 55 ? ["rank-yellow", "Good"] : ["rank-green", "Very good"];
    return { status, profile, minutes, nutrient, target, expiry, preference, nutrition, prep, points, level };
  }

  function rankFoods(state) {
    return state.foods.map((food) => ({ food, ...scoreFood(food, state) })).sort((a, b) =>
      (a.points ?? Infinity) - (b.points ?? Infinity) || (a.status.days ?? Infinity) - (b.status.days ?? Infinity)
      || a.food.name.localeCompare(b.food.name));
  }

  function activeUses(state) {
    return state.history.filter((entry) => {
      const age = daysBetween(state.date, entry.date);
      return age >= 0 && age < WINDOW;
    });
  }

  function recurring(state) {
    const groups = new Map();
    for (const entry of activeUses(state)) {
      const key = keyFor(entry.name);
      const previous = groups.get(key);
      if (!previous) groups.set(key, { ...entry, key, uses: 1 });
      else groups.set(key, { ...(entry.date >= previous.date ? entry : previous), key, uses: previous.uses + 1 });
    }
    return [...groups.values()].sort((a, b) => b.uses - a.uses
      || b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }

  function remembered(name, state) {
    return recurring(state).find((food) => food.key === keyFor(name) && food.uses >= FREQUENT);
  }

  function available(name, state) {
    return state.foods.some((food) => keyFor(food.name) === keyFor(name) && !(deadline(food, state.date) < 0));
  }

  function grocery(state) {
    const rows = new Map();
    for (const food of state.toBuy) {
      if (!available(food.name, state)) rows.set(keyFor(food.name), { name: food.name, taken: true, frequent: false });
    }
    for (const item of recurring(state)) {
      if (item.uses < FREQUENT || available(item.name, state)) continue;
      const current = rows.get(item.key);
      rows.set(item.key, { name: item.name, taken: Boolean(current?.taken), frequent: true });
    }
    return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  function saveFood(state, food, editing = false) {
    state.foods = editing ? state.foods.map((item) => item.id === food.id ? food : item) : [...state.foods, food];
    if (!(deadline(food, state.date) < 0)) {
      state.toBuy = state.toBuy.filter((item) => keyFor(item.name) !== keyFor(food.name));
    }
  }

  function takeOut(state, id) {
    const food = state.foods.find((item) => item.id === id);
    if (!food || deadline(food, state.date) < 0) return null;
    state.foods = state.foods.filter((item) => item.id !== id);
    state.history.push({ ...food, date: state.date });
    if (!state.toBuy.some((item) => keyFor(item.name) === keyFor(food.name))) state.toBuy.push({ name: food.name });
    state.lastTakeOut = { ...food, takenOn: state.date };
    return state.lastTakeOut;
  }

  function advance(state, days) {
    state.date = addDays(state.date, days);
    if (state.date < state.nextReview) return false;
    const previous = new Set(state.history.map((entry) => keyFor(entry.name)));
    const keep = new Set(recurring(state).filter((entry) => entry.uses >= FREQUENT).map((entry) => entry.key));
    state.history = activeUses(state).filter((entry) => keep.has(keyFor(entry.name)));
    state.reviewDropped = previous.size - keep.size;
    state.lastReview = state.date;
    do { state.nextReview = addDays(state.nextReview, WINDOW); } while (state.nextReview <= state.date);
    return true;
  }

  function macrosFor(food) {
    const macros = catalogFor(food.name)?.macros;
    if (!macros || !Number.isFinite(food.quantity_g)) return null;
    return Object.fromEntries(Object.entries(macros).map(([name, per100g]) => [name, Number.isFinite(per100g) ? per100g * food.quantity_g / 100 : null]));
  }

  return { FREQUENT, CATALOG, keyFor, catalogFor, findLabelNames, searchCatalog, today, timestamp, addDays, validDate, makeFood, sampleState,
    loadState, saveState, deadline, dateStatus, scoreFood, rankFoods, recurring, remembered, available,
    grocery, saveFood, takeOut, advance, macrosFor };
})();
