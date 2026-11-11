"use strict";

const Core = globalThis.FartCore;
const Catalog = globalThis.FART_CATALOG;
const byId = (id) => document.getElementById(id);
const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const numberFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const nutrientNames = { protein: "Protein", fiber: "Fibre", carbs: "Carbs", fat: "Fat" };
const foodDialog = byId("food-dialog");
const detailDialog = byId("detail-dialog");
const labelDialog = byId("label-dialog");
const foodForm = byId("food-form");
const nameInput = byId("food-name");
const companyInput = byId("food-company");
const weightInput = byId("food-quantity");
const dateInput = byId("food-date");
const storedInput = byId("stored-since");
const views = ["fridge", "shopping", "method"];

let state = FartProfiles.loadState();
let editFood = null;
let scanPrefill = null;
let memoryFill = null;
let toastTimer;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => escapeMap[character]);
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function foodIcon(name) {
  const symbol = ({ vegetable: "leaf", fruit: "tomato", dairy: "cup", protein: "egg" })[Core.catalogFor(name)?.group] ?? "box";
  return `<span class="food-icon ${symbol}">${icon(symbol)}</span>`;
}

function dateText(date) {
  return dateFormat.format(Core.timestamp(date));
}

function dateMarkup(date) {
  return `<time datetime="${escapeHTML(date)}">${dateText(date)}</time>`;
}

function weightText(food) {
  return Number.isFinite(food.quantity_g) ? `${numberFormat.format(food.quantity_g)} g` : "Weight needed";
}

function dateLine(food) {
  if (!food.expiration_date) return "Add a date to schedule a reminder.";
  const type = food.date_source === "estimate" ? "Estimated reminder" : food.date_kind === "best-before" ? "Best before" : "Use by";
  return `${type} ${dateMarkup(food.expiration_date)}`;
}

function sourceLink(source) {
  return `<a href="${escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.label)}</a>`;
}

function badge(status) {
  return `<span class="badge ${status.tone}">${status.label}</span>`;
}

function renderReminders(ranked) {
  const alerts = ranked.filter(({ status }) => status.days !== null && status.days <= 2)
    .sort((a, b) => a.status.days - b.status.days);
  byId("reminder-count").textContent = alerts.length === 1 ? "1 alert" : `${alerts.length} alerts`;
  byId("reminders").innerHTML = alerts.length ? alerts.map(({ food, status }) => `
    <li class="reminder-row">
      ${foodIcon(food.name)}
      <div><strong>${escapeHTML(food.name)}</strong><span class="meta">${dateLine(food)}</span></div>
      ${badge(status)}
    </li>`).join("") : '<li class="empty">Nothing is due today or in the next two days.</li>';
}

function renderInventory(ranked) {
  byId("inventory-count").textContent = ranked.length === 1 ? "1 item" : `${ranked.length} items`;
  byId("inventory").innerHTML = ranked.length ? ranked.map(({ food, status, points, level }, index) => {
    const name = escapeHTML(food.name);
    const id = escapeHTML(food.id);
    const past = points === null;
    const weights = { Memory: "Saved weight", "Reference portion": "Reference weight", Entered: "Entered weight" };
    const inputLabel = food.input_source === "Camera produce"
      ? `Camera photo · model score ${Math.round(food.confidence * 100)}% · ${weights[food.quantity_source] ?? "Weight checked"}`
      : food.input_source;
    return `<li class="rank-row">
      <span class="item-ordinal" aria-label="Rank ${index + 1}">${index + 1}</span>
      <div class="item-info">
        <strong>${name}</strong>
        <span class="meta">${escapeHTML(food.company)} · ${weightText(food)} · ${escapeHTML(inputLabel)}</span>
        <span class="meta">${dateLine(food)}</span>
        ${FartProfiles.foodNote(food) ? `<span class="diet-food-note">${escapeHTML(FartProfiles.foodNote(food))}</span>` : ""}
      </div>
      ${past ? badge(status) : `<button class="score-button ${level[0]}" type="button" data-id="${id}" data-action="score" aria-label="Show score for ${name}, ${points} points"><strong>${points} pts</strong><small>${level[1]}</small></button>`}
      <div class="row-actions">
        <button class="button text-button" type="button" data-id="${id}" data-action="edit" aria-label="Edit ${name}">Edit</button>
        <button class="button quiet" type="button" data-id="${id}" data-action="${past ? "discard" : "take"}" aria-label="${past ? "Discard" : "Take out"} ${name}">${past ? "Discard" : "Take out"}</button>
        ${past ? "" : badge(status)}
      </div>
    </li>`;
  }).join("") : '<li class="empty">The fridge is empty. Add food by hand or scan it.</li>';
}

function renderLatest() {
  const food = state.lastTakeOut;
  byId("latest-takeout").innerHTML = !food
    ? '<p class="empty">Take food out to see its recipe, macros and shopping update.</p>'
    : `<article class="takeout-preview">
        <p class="eyebrow">${escapeHTML(food.name.toUpperCase())} · ${weightText(food)}</p>
        <h3>${escapeHTML(FartProfiles.compatibleRecipe(Core.catalogFor(food.name)?.recipe) === false ? "See your tailored meal ideas" : Core.catalogFor(food.name)?.recipe?.name ?? "Food removed")}</h3>
        <p class="meta">Taken out ${dateMarkup(food.takenOn)}</p>
        <div class="actions"><button class="button quiet" id="show-latest" type="button">View result</button><a class="button text-button" href="#shopping">Shopping list</a></div>
      </article>`;
}

function renderShopping() {
  const shopping = Core.grocery(state);
  byId("shopping-count").textContent = shopping.length === 1 ? "1 item" : `${shopping.length} items`;
  byId("shopping-list").innerHTML = shopping.length ? shopping.map((item) => `
    <li class="shopping-row">${foodIcon(item.name)}
      <div><strong>${escapeHTML(item.name)}</strong><span class="meta">${item.taken ? "Taken out" : "Missing from fridge"}${item.frequent ? " · Frequent" : ""}</span></div>
    </li>`).join("") : '<li class="empty">The shopping list is clear.</li>';
  byId("copy-list").disabled = shopping.length === 0;
  byId("qr-list").disabled = shopping.length === 0;
  byId("share-list").hidden = typeof navigator.share !== "function";
  byId("share-list").disabled = shopping.length === 0;
  byId("copy-fallback").hidden = true;

  const recurring = Core.recurring(state);
  byId("recurring-list").innerHTML = recurring.length ? recurring.map((item) => `
    <li class="shopping-row">${foodIcon(item.name)}
      <div><strong>${escapeHTML(item.name)}</strong><span class="meta">${escapeHTML(item.company)} · ${weightText(item)}</span></div>
      <span class="badge ${item.uses >= Core.FREQUENT ? "rank-green" : "rank-yellow"}">${item.uses} ${item.uses === 1 ? "use" : "uses"}</span>
    </li>`).join("") : '<li class="empty">Take food out to start learning what you use.</li>';
  const lastReview = state.lastReview
    ? `<br>Last review ${dateMarkup(state.lastReview)} · ${state.reviewDropped} ${state.reviewDropped === 1 ? "entry" : "entries"} cleared.` : "";
  byId("memory-review").innerHTML = `<strong>Next review ${dateMarkup(state.nextReview)}</strong><br>At each review, keep foods used at least twice in the latest 30 days.${lastReview}`;
}

function render() {
  byId("demo-date").innerHTML = dateMarkup(state.date);
  byId("preference").value = state.preference;
  byId("nutrition-goal").value = state.nutritionGoal;
  document.documentElement.classList.toggle("large-text", Boolean(state.largeText));
  byId("text-size").setAttribute("aria-pressed", String(Boolean(state.largeText)));
  const ranked = Core.rankFoods(state);
  renderInventory(ranked);
  renderReminders(ranked);
  renderLatest();
  renderShopping();
  if (typeof renderPersonalisation === "function") renderPersonalisation();
}

function announce(message) {
  byId("announcement").textContent = message;
  const toast = byId("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3700);
}

function update(message) {
  FartProfiles.saveState(state);
  render();
  if (message) announce(message);
}

function switchView(focus = false) {
  const requested = location.hash.slice(1);
  if (focus && requested && !views.includes(requested)) return;
  const view = views.includes(requested) ? requested : "fridge";
  for (const link of document.querySelectorAll("[data-view]")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  byId("meal-section").hidden = view !== "fridge";
  views.forEach((name) => { byId(`${name}-view`).hidden = name !== view; });
  if (focus) {
    byId(`${view}-title`).focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function showFridge() {
  if (location.hash && location.hash !== "#fridge") location.hash = "fridge";
}

function updateDateHint() {
  const storage = Core.catalogFor(nameInput.value)?.storage;
  byId("date-hint").textContent = storage
    ? `Leave blank to estimate from the refrigerated-since date. ${storage.condition} · ${storage.range}.`
    : "Enter the date on the package if you have it.";
}

function useMemory() {
  updateDateHint();
  const key = Core.keyFor(nameInput.value);
  if (editFood) return;
  if (memoryFill && memoryFill.key !== key) {
    if (companyInput.value === memoryFill.company) companyInput.value = "";
    if (Number(weightInput.value) === memoryFill.quantity_g) weightInput.value = "";
    memoryFill = null;
  }
  const saved = Core.remembered(nameInput.value, state);
  const hint = byId("memory-hint");
  if (!saved) { hint.hidden = true; return; }
  memoryFill = saved;
  const usedCompany = !companyInput.value.trim();
  const usedWeight = !weightInput.value && Number.isFinite(saved.quantity_g);
  if (usedCompany) companyInput.value = saved.company;
  if (usedWeight) weightInput.value = saved.quantity_g;
  hint.textContent = `Remembered from ${saved.uses} take-outs. Use the date for this package.`;
  hint.hidden = false;
}

function openFoodForm(food = null, prefill = null) {
  foodForm.reset();
  editFood = food;
  scanPrefill = prefill;
  memoryFill = null;
  for (const input of [nameInput, companyInput, storedInput]) input.setCustomValidity("");
  const fields = food || prefill || {};
  byId("food-dialog-title").textContent = food ? "Edit food" : prefill?.input_source === "Catalogue" ? "Add catalogue food" : prefill ? "Check scanned fields" : "Add food manually";
  nameInput.value = fields.name || "";
  companyInput.value = fields.company || "";
  weightInput.value = fields.quantity_g ?? "";
  dateInput.value = fields.date_source === "estimate" ? "" : fields.expiration_date || "";
  storedInput.value = fields.stored_since ?? state.date;
  storedInput.max = state.date;
  byId("memory-hint").hidden = true;
  updateDateHint();
  const review = byId("scan-review-note");
  review.hidden = !prefill;
  review.textContent = prefill?.input_source === "Camera produce"
    ? "Check the food and edible weight. A suggested weight is a USDA reference portion."
    : prefill?.input_source === "Meal photo" ? "Check the suggested dish and enter its edible weight and date."
    : prefill?.input_source === "Catalogue" ? "Enter the edible weight and the date for this item." : "Check the fields read from your label.";
  if (prefill) useMemory();
  foodDialog.showModal();
  (prefill && fields.name ? companyInput : nameInput).focus();
}

function saveFoodForm(event) {
  event.preventDefault();
  const name = nameInput.value.trim();
  const company = companyInput.value.trim();
  if (!name || !company) {
    const input = name ? companyInput : nameInput;
    input.setCustomValidity(name ? "Enter the company or type Unbranded." : "Enter a food name.");
    input.reportValidity();
    return;
  }
  const weight = Number(weightInput.value);
  const original = editFood ?? scanPrefill;
  const sameName = original && Core.keyFor(original.name) === Core.keyFor(name);
  const recordedWeight = sameName && original.quantity_g === weight ? original.quantity_source : null;
  const food = Core.makeFood({
    name, company, quantity_g: weight,
    expiration_date: dateInput.value,
    date_kind: editFood?.date_kind ?? scanPrefill?.date_kind,
    stored_since: storedInput.value,
    input_source: sameName ? original.input_source : scanPrefill ? "Manual correction" : "Manual",
    quantity_source: memoryFill?.quantity_g === weight ? "Memory" : recordedWeight || "Entered",
    confidence: sameName ? original.confidence : null,
    photo_label: sameName ? original.photo_label : null
  }, state.date, editFood?.id);
  const editing = Boolean(editFood);
  Core.saveFood(state, food, editing);
  foodDialog.close();
  showFridge();
  update(`${food.name} ${editing ? "updated" : "added to the fridge"}.`);
  if (editing) byId("inventory-title").focus({ preventScroll: true });
}

function openDetail(title, kicker, content) {
  byId("detail-title").textContent = title;
  byId("detail-kicker").textContent = kicker;
  byId("detail-content").innerHTML = content;
  detailDialog.showModal();
}

function scoreDetails(food) {
  const score = Core.scoreFood(food, state);
  const goal = state.nutritionGoal === "protein" ? "protein" : "fibre";
  const prep = Number.isFinite(score.minutes) ? `${score.minutes} min in the matched recipe` : "Recipe prep time unavailable";
  const date = score.status.days === null ? "Add a date to score urgency" : `${score.status.days} ${score.status.days === 1 ? "day" : "days"} left`;
  const nutrition = Number.isFinite(score.nutrient) ? `${score.nutrient} g ${goal} per 100 g` : "Nutrition record unavailable";
  const points = (value, max) => `<dd>${numberFormat.format(value)} / ${max}</dd>`;
  const storage = score.profile?.storage;
  openDetail(food.name, "WHY THIS FOOD RANKED HERE", `
    <p class="detail-summary"><strong>${score.points} points · ${score.level[1]}</strong></p>
    <p>Start at 100 and subtract the deductions below. Lower points mean higher priority to use next.</p>
    <dl class="point-breakdown">
      <div><dt>Expiry · ${date}</dt>${points(score.expiry, 40)}</div>
      <div><dt>Food preference</dt>${points(score.preference, 20)}</div>
      <div><dt>Nutrition · ${nutrition}</dt>${points(score.nutrition, 20)}</div>
      <div><dt>Prep · ${prep}</dt>${points(score.prep, 20)}</div>
    </dl>
    ${food.date_source === "estimate" && storage ? `<p class="field-note source-links">${storage.condition} · ${storage.range}. ${sourceLink(storage.source)}</p>` : ""}
  `);
}

function showTakeOut(food) {
  const profile = Core.catalogFor(food.name);
  const recipe = FartProfiles.compatibleRecipe(profile?.recipe) === false ? null : profile?.recipe;
  const macros = Core.macrosFor(food);
  const source = macros ? `<p class="field-note source-links">Per 100 g values scaled to ${weightText(food)}. ${sourceLink(profile.nutritionSource)}</p>` : "";
  const missing = recipe?.extras.filter((name) => !Core.available(name, state));
  const recipeMarkup = recipe ? `
    <div class="recipe-detail-block"><h3>${escapeHTML(recipe.name)}</h3>
      <p class="meta">${recipe.minutes} min · uses ${escapeHTML(food.name)}</p>
      <ol class="recipe-details-list">${recipe.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join("")}</ol>
      <p class="field-note">${missing.length ? `Recipe extras to get · ${escapeHTML(missing.join(", "))}` : "Recipe extras are in the fridge."}</p>
    </div>` : '<p class="empty">No matching recipe for this diet. Try one of your personalised meal ideas in My kitchen.</p>';
  const macroMarkup = macros
    ? `<dl class="nutrient-grid">${Object.entries(nutrientNames).map(([key, label]) =>
        `<div><dt>${label}</dt><dd>${Number.isFinite(macros[key]) ? numberFormat.format(macros[key]) + " g" : "Unavailable"}</dd></div>`).join("")}</dl>`
    : '<p class="empty">A matching nutrition record and weight are needed to calculate macros.</p>';
  const buy = Core.grocery(state).some((entry) => Core.keyFor(entry.name) === Core.keyFor(food.name));
  const changes = buy ? "Removed from the fridge, added to To buy, and counted in Recurring foods."
    : Core.available(food.name, state) ? "Removed and counted in Recurring foods. A matching item is in the fridge."
    : "Removed from the fridge and counted in Recurring foods.";
  openDetail(`${food.name} taken out`, "RECIPE AND NUTRITION", `
    <p class="detail-summary">${changes}</p>
    ${FartProfiles.foodNote(food) ? `<p class="care-note">${escapeHTML(FartProfiles.foodNote(food))}</p>` : ""}
    ${recipeMarkup}
    <div class="recipe-detail-block"><h3>Macros for the food taken out</h3>${macroMarkup}${source}</div>
    <a class="button text-button" href="#shopping" id="detail-shopping">Open shopping and memory ${icon("arrow")}</a>`);
  byId("detail-shopping").addEventListener("click", () => detailDialog.close());
}

function takeFood(id) {
  const removed = Core.takeOut(state, id);
  if (!removed) return;
  showFridge();
  update(`${removed.name} taken out. Recipe and shopping list updated.`);
  showTakeOut(removed);
}

function shoppingText() {
  return ["FART AI shopping list", ...Core.grocery(state).map((item) => `• ${item.name}`)].join("\n");
}

async function copyList() {
  const value = shoppingText();
  const copied = () => announce("Shopping list copied.");
  try {
    await navigator.clipboard.writeText(value);
    copied();
  } catch {
    const field = byId("copy-text");
    byId("copy-fallback").hidden = false;
    field.value = value;
    field.focus();
    field.select();
    let succeeded = false;
    try { succeeded = document.execCommand("copy"); } catch { /* Text stays selected. */ }
    if (succeeded) copied();
    else announce("Select and copy the shopping list text.");
  }
}

function showQR() {
  try {
    const code = window.qrcode(0, "M");
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];
    code.addData(shoppingText(), "Byte");
    code.make();
    openDetail("Shopping list QR", "COPY TO YOUR PHONE", `
      <p class="card-intro">Scan with your phone’s camera or QR reader, then copy the list text.</p>
      <div class="shopping-qr">${code.createSvgTag({ cellSize: 5, margin: 20, scalable: true, alt: "QR code containing shopping list text" })}</div>`);
  } catch {
    announce("This list is too long for a QR. Use Copy shopping list.");
  }
}

byId("add-food").addEventListener("click", () => openFoodForm());
for (const input of [nameInput, companyInput, storedInput]) input.addEventListener("input", () => input.setCustomValidity(""));
nameInput.addEventListener("input", () => {
  if (scanPrefill?.input_source === "Camera produce"
      && Core.keyFor(scanPrefill.name) !== Core.keyFor(nameInput.value)
      && ["Reference portion", "Memory"].includes(scanPrefill.quantity_source)
      && Number(weightInput.value) === scanPrefill.quantity_g) weightInput.value = "";
  useMemory();
});
nameInput.addEventListener("change", useMemory);
foodForm.addEventListener("submit", saveFoodForm);

byId("inventory").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const food = state.foods.find((item) => item.id === button.dataset.id);
  if (!food) return;
  if (button.dataset.action === "score") scoreDetails(food);
  if (button.dataset.action === "edit") openFoodForm(food);
  if (button.dataset.action === "take") takeFood(food.id);
  if (button.dataset.action === "discard") {
    state.foods = state.foods.filter((item) => item.id !== food.id);
    update(`${food.name} discarded.`);
    byId("inventory-title").focus({ preventScroll: true });
  }
});

byId("latest-takeout").addEventListener("click", (event) => {
  if (event.target.closest("#show-latest") && state.lastTakeOut) showTakeOut(state.lastTakeOut);
});

for (const button of document.querySelectorAll("[data-close]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

for (const [id, days] of [["advance-day", 1], ["advance-month", 30]]) {
  byId(id).addEventListener("click", () => {
    const reviewed = Core.advance(state, days);
    update(reviewed ? `Demo date ${dateText(state.date)}. Recurring foods refreshed.` : `Demo date ${dateText(state.date)}.`);
  });
}
byId("reset-demo").addEventListener("click", () => { state = FartProfiles.reset(state); update("Sample fridge reset."); });
byId("preference").addEventListener("change", (event) => { state.preference = event.target.value; update("Food priorities updated."); });
byId("nutrition-goal").addEventListener("change", (event) => { state.nutritionGoal = event.target.value; update("Food priorities updated."); });
byId("text-size").addEventListener("click", () => { state.largeText = !state.largeText; update(); });

byId("copy-list").addEventListener("click", copyList);
byId("qr-list").addEventListener("click", showQR);
byId("share-list").addEventListener("click", async () => {
  try { await navigator.share({ title: "FART AI shopping list", text: shoppingText() }); }
  catch (error) { if (error.name !== "AbortError") await copyList(); }
});
window.addEventListener("hashchange", () => switchView(true));
byId("food-examples").innerHTML = Object.values(Catalog.foods).map(({ name }) => `<option value="${escapeHTML(name)}"></option>`).join("");
byId("sources").innerHTML = Catalog.sources.map(sourceLink).join(" · ");
byId("sources").classList.add("source-links");
render();
switchView();
