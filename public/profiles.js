"use strict";

globalThis.FartProfiles = (() => {
  const KEY = "fart-ai-demo-profiles-v1";
  const profiles = [
    { id: "babatunda", name: "Babatunda", initials: "BA", color: "sage", label: "Everyday balance", goal: "Build strength. Waste less.", condition: "No dietary restriction", preference: "any", nutritionGoal: "protein", targets: { calories: 2300, protein: 145, carbs: 260 },
      intro: "Quick, protein-rich meals for a busy day. Put the ingredients you already have to good use.",
      tips: ["Protein with each meal", "Make room for vegetables", "Use the oldest ingredients first"],
      foods: [["Spinach",85,0],["Greek yogurt",150,3],["Egg",100,5],["Carrot",120,6],["Banana",118,4]],
      meals: ["strength-bowl","chicken-wrap","salmon-plate"] },
    { id: "omar", name: "Omar Hassan", initials: "OH", color: "blue", label: "Carb-conscious", goal: "Balanced meals, with carbs in view.", condition: "Type 2 diabetes", preference: "any", nutritionGoal: "fiber", targets: { calories: 2100, protein: 125, carbs: 210 },
      intro: "Omar’s example meals pair measured carbohydrate portions with protein and fibre. Whole fruit stays on the menu.",
      tips: ["Count total carbs per portion", "½ vegetables · ¼ protein · ¼ carbs", "Prefer water to sugary drinks"],
      foods: [["Spinach",100,1],["Greek yogurt",170,4],["Chicken breast",180,2],["Cucumber",150,5],["Lentils",60,7],["Banana",118,4]],
      meals: ["berry-bowl","chicken-lentils","salmon-plate"] },
    { id: "maya", name: "Maya Patel", initials: "MP", color: "peach", label: "Vegetarian", goal: "More plants. Plenty of protein.", condition: "Vegetarian preference", preference: "any", nutritionGoal: "protein", targets: { calories: 2000, protein: 100, carbs: 250 },
      intro: "Colourful vegetarian meals built around tofu, chickpeas, eggs and dairy, with no meat or fish.",
      tips: ["Plant proteins throughout the day", "Include a variety of vegetables", "Keep quick staples on hand"],
      foods: [["Firm tofu",150,2],["Bell pepper",150,4],["Canned chickpeas",180,3],["Carrot",100,6],["Greek yogurt",170,5]],
      meals: ["berry-bowl","tofu-bowl","chickpea-salad"] },
    { id: "lucas", name: "Lucas Weber", initials: "LW", color: "lavender", label: "Dairy-free", goal: "Simple meals, without dairy.", condition: "Lactose intolerance", preference: "any", nutritionGoal: "protein", targets: { calories: 2200, protein: 125, carbs: 270 },
      intro: "Lucas prefers dairy-free meals. His suggestions use unsweetened plant milk and skip milk, yogurt and cheese.",
      tips: ["Check packaged-food labels", "Choose dairy-free alternatives", "Use tofu, eggs or chicken for protein"],
      foods: [["Egg",100,3],["Firm tofu",150,2],["Blueberry",100,4],["Rolled oats",60,9],["Unsweetened soy milk",250,5]],
      meals: ["plant-oats","tofu-bowl","chicken-lentils"] }
  ];
  const recipes = {
    "strength-bowl": { name: "Banana power bowl", type: "BREAKFAST", minutes: 5, accent: "gold", emoji: "🍌", ingredients: [["Greek yogurt",200],["Banana",118],["Rolled oats",45],["Walnuts",15]], steps: ["Spoon plain Greek yogurt into a bowl.","Slice the banana and add it with the oats.","Finish with chopped walnuts. Use unsweetened yogurt."] },
    "berry-bowl": { name: "Berry & oat yogurt bowl", type: "BREAKFAST", minutes: 5, accent: "pink", emoji: "🫐", ingredients: [["Greek yogurt",170],["Blueberry",80],["Rolled oats",30],["Walnuts",15]], steps: ["Spoon plain, unsweetened yogurt into a bowl.","Add the measured oats and washed blueberries.","Top with chopped walnuts. No honey or added sugar is needed."] },
    "chicken-wrap": { name: "Crunchy chicken wrap", type: "LUNCH", minutes: 18, accent: "peach", emoji: "🌯", ingredients: [["Chicken breast",150],["Flour tortilla",60],["Lettuce",60],["Cucumber",100],["Greek yogurt",40]], steps: ["Cook the chicken thoroughly, then slice.","Warm the tortilla and spread with plain yogurt.","Add the lettuce, cucumber and chicken; fold to serve."] },
    "chicken-lentils": { name: "Chicken & lentil salad", type: "LUNCH", minutes: 25, accent: "green", emoji: "🥗", ingredients: [["Chicken breast",150],["Lentils",55],["Cucumber",150],["Spinach",80],["Lemon",20]], steps: ["Simmer the measured dry lentils in water until tender, then drain.","Cook the chicken thoroughly and slice.","Toss with cucumber, spinach and lemon. Lentils provide carbohydrates as well as protein."] },
    "salmon-plate": { name: "Salmon, greens & sweet potato", type: "DINNER", minutes: 30, accent: "peach", emoji: "🍠", ingredients: [["Salmon",150],["Sweet potato",150],["Green beans",200],["Lemon",20]], steps: ["Dice and roast the sweet potato until tender.","Cook the salmon thoroughly with lemon; steam the green beans.","Serve with plenty of green beans, a protein portion and a measured sweet potato portion."] },
    "tofu-bowl": { name: "Golden tofu & veggie bowl", type: "LUNCH", minutes: 20, accent: "gold", emoji: "🥬", ingredients: [["Firm tofu",180],["White rice",60],["Bell pepper",150],["Spinach",80]], steps: ["Cook the measured dry rice in water.","Brown cubed tofu in a nonstick pan; add sliced pepper.","Wilt in the spinach and serve over the rice. Season to taste."] },
    "chickpea-salad": { name: "Chickpea crunch salad", type: "DINNER", minutes: 10, accent: "green", emoji: "🥑", ingredients: [["Canned chickpeas",180],["Cucumber",150],["Bell pepper",100],["Avocado",60],["Lemon",20]], steps: ["Drain and rinse the chickpeas.","Chop the cucumber, pepper and avocado.","Toss everything with lemon and serve."] },
    "plant-oats": { name: "Blueberry overnight oats", type: "BREAKFAST", minutes: 5, accent: "pink", emoji: "🥣", ingredients: [["Rolled oats",60],["Unsweetened soy milk",200],["Blueberry",100],["Walnuts",15]], steps: ["Mix oats with unsweetened soy milk in a covered jar.","Refrigerate overnight.","Top with washed blueberries and chopped walnuts before serving."] }
  };
  let bank;
  try { bank = JSON.parse(FartStorage.getItem(KEY)); } catch { /* Session-only storage is supported. */ }
  if (!bank || !bank.states || typeof bank.states !== "object" || Array.isArray(bank.states)) bank = { active: "babatunda", states: {} };
  if (!profiles.some(p => p.id === bank.active)) bank.active = "babatunda";
  function current() { return profiles.find(p => p.id === bank.active); }
  function persist() { try { FartStorage.setItem(KEY, JSON.stringify(bank)); } catch { /* Keep the session usable. */ } }
  function seed(profile, largeText = false) {
    const state = FartCore.sampleState(FartCore.today(), largeText);
    state.profileId = profile.id;
    state.preference = profile.preference;
    state.nutritionGoal = profile.nutritionGoal;
    state.foods = profile.foods.map(([name,quantity_g,days],i) => FartCore.makeFood({name,quantity_g,company:"Demo pantry",expiration_date:FartCore.addDays(state.date,days),input_source:"Demo"},state.date,`${profile.id}-${i}`));
    if (profile.id !== "babatunda") state.history = [];
    return state;
  }
  function valid(state) { return state && FartCore.validDate(state.date) && FartCore.validDate(state.nextReview) && Array.isArray(state.foods) && Array.isArray(state.history) && Array.isArray(state.toBuy); }
  function loadState() {
    const stored = bank.states[bank.active];
    if (valid(stored)) return stored;
    const legacy = bank.active === "babatunda" ? FartCore.loadState() : null;
    const state = legacy || seed(current());
    state.profileId = bank.active;
    bank.states[bank.active] = state;
    persist();
    return state;
  }
  function saveState(state) { state.profileId = bank.active; bank.states[bank.active] = state; persist(); }
  function switchTo(id, state) {
    if (!profiles.some(p => p.id === id)) return state;
    saveState(state); bank.active = id;
    const next = loadState(); persist(); return next;
  }
  function reset(state) { const next = seed(current(),state.largeText); saveState(next); return next; }
  function nutrition(ingredients) {
    const totals = { protein:0, carbs:0, fat:0, fiber:0 };
    for (const [name,grams] of ingredients) {
      const macros = FartCore.catalogFor(name)?.macros;
      if (!macros) continue;
      for (const nutrient of Object.keys(totals)) totals[nutrient] += (macros[nutrient] || 0) * grams / 100;
    }
    totals.calories = totals.protein*4 + totals.carbs*4 + totals.fat*9;
    return totals;
  }
  function dailyNutrition(state) {
    return nutrition(state.history.filter(item => item.date === state.date && Number.isFinite(item.quantity_g)).map(item => [item.name,item.quantity_g]));
  }
  function foodNote(food) {
    const profile = current();
    const macros = FartCore.macrosFor(food);
    if (profile.id === "omar") return macros ? `${Math.round(macros.carbs)} g carbs in this portion · include in your meal’s carb total` : "Add a weight to check this portion’s carbohydrates.";
    const item = FartCore.catalogFor(food.name);
    if (profile.id === "lucas" && item?.group === "dairy" && !/^(unsweetened )?(soy|almond|oat|coconut) milk$/i.test(food.name)) return "Contains dairy · consider a dairy-free alternative and check the label.";
    if (profile.id === "maya" && /chicken|salmon|beef|tuna|pork|lamb|fish|turkey|bacon|gelatin|shrimp/i.test(food.name)) return "Does not match this vegetarian preference · choose a plant protein.";
    return "";
  }
  function compatibleRecipe(recipe) {
    if (!recipe) return null;
    const names = [recipe.name,...(recipe.extras || [])].join(" ").replace(/(?:unsweetened )?(?:soy|almond|oat|coconut) milk|peanut butter/gi,"");
    if (current().id === "lucas" && /yogurt|milk|cheese|cream|butter|feta|mozzarella|cheddar/i.test(names)) return false;
    if (current().id === "maya" && /chicken|salmon|beef|tuna|pork|fish|turkey|bacon|shrimp/i.test(names)) return false;
    return true;
  }
  return { profiles, recipes, current, loadState, saveState, switchTo, reset, nutrition, dailyNutrition, foodNote, compatibleRecipe };
})();
