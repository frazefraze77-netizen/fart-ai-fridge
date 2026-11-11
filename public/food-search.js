"use strict";

const catalogueDialog = byId("catalogue-dialog");
const catalogueQuery = byId("catalogue-query");
const catalogueGroup = byId("catalogue-group");
const catalogueResults = byId("catalogue-results");
let catalogueMatches = [];
let catalogueTimer;
let cataloguePhoto = null;

function renderCatalogue() {
  const { total, matches } = Core.searchCatalog(catalogueQuery.value, catalogueGroup.value);
  catalogueMatches = matches;
  const formatted = new Intl.NumberFormat("en-GB").format(total);
  byId("catalogue-count").textContent = total > matches.length
    ? `Showing ${matches.length} of ${formatted} foods`
    : `${formatted} ${total === 1 ? "food" : "foods"} found`;
  catalogueResults.innerHTML = matches.length ? matches.map((profile, index) => `
    <li>
      <div><strong>${escapeHTML(profile.name)}</strong>
        <p class="meta">${escapeHTML(profile.referenceOnly ? profile.category : "Recipe available")} · USDA record</p>
      </div>
      <button type="button" class="button quiet" data-catalogue-pick="${index}" aria-label="Add ${escapeHTML(profile.name)}">Add</button>
    </li>`).join("") : '<li class="empty">Try a shorter name or choose a different food group.</li>';
}

function openFoodCatalogue(query = "", photo = null) {
  clearTimeout(catalogueTimer);
  cataloguePhoto = photo;
  const note = byId("catalogue-photo-note");
  note.hidden = !photo;
  note.textContent = photo ? `Photo suggests ${photo.name}. Choose the closest nutrition record or use the photo name.` : "";
  byId("catalogue-photo-name").hidden = !photo;
  catalogueQuery.value = query;
  catalogueGroup.value = "any";
  renderCatalogue();
  catalogueDialog.showModal();
  catalogueQuery.focus();
}

byId("open-food-catalogue").addEventListener("click", () => openFoodCatalogue());
catalogueQuery.addEventListener("input", () => {
  clearTimeout(catalogueTimer);
  catalogueTimer = setTimeout(renderCatalogue, 85);
});
catalogueGroup.addEventListener("change", renderCatalogue);
catalogueResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalogue-pick]");
  if (!button) return;
  const chosen = catalogueMatches[Number(button.dataset.cataloguePick)];
  if (!chosen) return;
  catalogueDialog.close();
  openFoodForm(null, { company: "Unbranded", input_source: "Catalogue", ...cataloguePhoto, name: chosen.name });
});

byId("catalogue-photo-name").addEventListener("click", () => {
  if (!cataloguePhoto) return;
  catalogueDialog.close();
  openFoodForm(null, cataloguePhoto);
});

function suggestFoodNames() {
  const query = nameInput.value.trim();
  const suggestions = query.length >= 2
    ? Core.searchCatalog(query, "any", 18).matches : Object.values(Catalog.foods);
  byId("food-examples").innerHTML = suggestions.map(({ name }) => `<option value="${escapeHTML(name)}"></option>`).join("");
}
nameInput.addEventListener("input", suggestFoodNames);

