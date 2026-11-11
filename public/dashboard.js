"use strict";

function renderPersonalisation() {
  const P = FartProfiles;
  const profile = P.current();
  const daily = P.dailyNutrition(state);
  const due = state.foods.filter(food => {
    const days = Core.deadline(food,state.date);
    return days !== null && days >= 0 && days <= 2;
  }).length;
  byId("welcome-text").textContent = `Welcome back, ${profile.name.split(" ")[0]}.`;
  byId("active-avatar").className = `avatar ${profile.color}`;
  byId("active-avatar").textContent = profile.initials;
  byId("profile-switcher").innerHTML = P.profiles.map(p => `<option value="${p.id}" ${p.id === profile.id ? "selected" : ""}>${escapeHTML(p.name)}</option>`).join("");
  byId("profile-rail").innerHTML = P.profiles.map(p => `<button class="profile-option ${p.id === profile.id ? "selected" : ""}" type="button" data-profile="${p.id}" aria-pressed="${p.id === profile.id}"><span class="avatar ${p.color}">${p.initials}</span><span><strong>${escapeHTML(p.name)}</strong><small>${p.label}</small></span>${p.id === profile.id ? icon("check") : ""}</button>`).join("");
  const stats = [
    { tone:"mint",icon:"fridge",value:state.foods.length,label:"Ingredients in your fridge",sub:"A little possibility in every one" },
    { tone:"apricot",icon:"bell",value:due,label:"To use in the next 2 days",sub:due ? "A good place to start cooking" : "Your ingredients have some time" },
    { tone:"butter",icon:"bowl",value:Math.round(daily.calories).toLocaleString("en-GB"),unit:"kcal",label:"Energy logged today",sub:`Illustrative goal · ${profile.targets.calories.toLocaleString("en-GB")} kcal` },
    { tone:"lilac",icon:"spark",value:Math.round(daily.protein),unit:"g",label:"Protein logged today",sub:`Illustrative goal · ${profile.targets.protein} g` }
  ];
  byId("overview-stats").innerHTML = stats.map(s => `<article class="stat-card ${s.tone}"><span class="stat-icon">${icon(s.icon)}</span><strong>${s.value}<small>${s.unit || ""}</small></strong><p>${s.label}</p><span>${s.sub}</span></article>`).join("");
  const health = profile.id === "omar";
  byId("diet-panel").innerHTML = `<div class="diet-intro"><span class="eyebrow">${health ? "DIABETES-AWARE MEAL IDEAS" : "YOUR FOOD, YOUR WAY"}</span><h3>${profile.goal}</h3><p>${profile.intro}</p><div class="diet-tips">${profile.tips.map(tip => `<span>${icon("check")}${tip}</span>`).join("")}</div>${health ? '<p class="care-note">Meal ideas follow <a href="https://www.cdc.gov/diabetes/healthy-eating/diabetes-meal-planning.html" target="_blank" rel="noopener noreferrer">CDC meal-planning guidance</a>. Carb needs are individual; agree personal targets with a diabetes care team. This demo does not calculate insulin doses.</p>' : ""}</div><div class="diet-targets"><span class="condition-label">${profile.condition}</span><div><span>Carbs logged today</span><strong>${Math.round(daily.carbs)} <small>/ ${profile.targets.carbs} g</small></strong><progress value="${Math.min(daily.carbs,profile.targets.carbs)}" max="${profile.targets.carbs}" aria-label="Carbohydrates logged against illustrative demo goal"></progress></div><p>Illustrative demo goals, not a prescribed diet. Nutrition logs count foods taken out today.</p></div>`;
  byId("meal-grid").innerHTML = profile.meals.map(id => {
    const recipe = P.recipes[id];
    const macros = P.nutrition(recipe.ingredients);
    const inFridge = recipe.ingredients.filter(([name]) => Core.available(name,state)).length;
    return `<article class="meal-card"><div class="meal-art ${recipe.accent}"><span aria-hidden="true">${recipe.emoji}</span><span class="meal-time">${icon("clock")}${recipe.minutes} min</span></div><div class="meal-content"><p class="eyebrow">${recipe.type} · ${profile.label.toUpperCase()}</p><h3>${recipe.name}</h3><div class="meal-macros"><span>~${Math.round(macros.calories)} kcal</span><span>${Math.round(macros.protein)} g protein</span><span>${Math.round(macros.carbs)} g carbs</span></div><p class="meta">${inFridge} of ${recipe.ingredients.length} ingredients in your fridge</p><button class="button text-button recipe-open" type="button" data-recipe="${id}">View recipe ${icon("arrow")}</button></div></article>`;
  }).join("");
}

function changeProfile(id) {
  if (id === FartProfiles.current().id) return;
  state = FartProfiles.switchTo(id,state);
  update(`Switched to ${FartProfiles.current().name}. Their fridge, diet and shopping list are ready.`);
}

byId("profile-switcher").addEventListener("change",event => changeProfile(event.target.value));
byId("profile-rail").addEventListener("click",event => {
  const button = event.target.closest("[data-profile]");
  if (button) changeProfile(button.dataset.profile);
});
byId("meal-grid").addEventListener("click",event => {
  const button = event.target.closest("[data-recipe]");
  if (!button) return;
  const recipe = FartProfiles.recipes[button.dataset.recipe];
  const macros = FartProfiles.nutrition(recipe.ingredients);
  openDetail(recipe.name,`FOR ${FartProfiles.current().name.toUpperCase()} · ${recipe.minutes} MINUTES`, `<p class="detail-summary">One illustrative serving · ~${Math.round(macros.calories)} kcal · ${Math.round(macros.carbs)} g total carbs · ${Math.round(macros.protein)} g protein · ${Math.round(macros.fiber)} g fibre</p><div class="recipe-detail-block"><h3>What you’ll need</h3><ul class="ingredient-list">${recipe.ingredients.map(([name,grams]) => `<li><strong>${grams} g</strong> ${escapeHTML(name)}<span class="ingredient-state ${Core.available(name,state) ? "in-fridge" : ""}">${Core.available(name,state) ? "In your fridge" : "To get"}</span></li>`).join("")}</ul></div><div class="recipe-detail-block"><h3>Let’s make it</h3><ol class="recipe-details-list">${recipe.steps.map(step => `<li>${escapeHTML(step)}</li>`).join("")}</ol></div><p class="field-note">Rice and lentils are weighed dry. Other weights refer to edible ingredients before cooking. Estimates exclude optional oil and seasonings. Check product labels for allergens and nutrition.</p>${FartProfiles.current().id === "omar" ? '<p class="care-note">Count the total carbohydrate for the serving you eat, including fruit, oats and lentils. Your care team can help set your own meal targets.</p>' : ""}`);
});
renderPersonalisation();
