const STORAGE_KEY = "menu-planner-v1";

const state = {
  profiles: [],
  recipes: [],
  ratings: [],
  plans: {},
  historyPlans: {},
  editing: {
    profileId: null,
    recipeId: null,
    ratingId: null,
  },
  currentView: "data",
  generator: {
    start: todayISO(),
    mode: "days",
    count: 30,
  },
  cadence: {
    nextNewRecipeOn: null,
    nextEatOutOn: null,
  },
  selectedDay: null,
};

const els = {
  profileForm: document.getElementById("profile-form"),
  profileName: document.getElementById("profile-name"),
  profileDislikes: document.getElementById("profile-dislikes"),
  profilesList: document.getElementById("profiles-list"),
  profileSubmit: document.getElementById("profile-submit"),
  profileCancel: document.getElementById("profile-cancel"),
  profileEditHint: document.getElementById("profile-edit-hint"),

  recipeForm: document.getElementById("recipe-form"),
  recipeName: document.getElementById("recipe-name"),
  recipeComplexity: document.getElementById("recipe-complexity"),
  recipeDislikedTags: document.getElementById("recipe-disliked-tags"),
  recipeText: document.getElementById("recipe-text"),
  recipeReference: document.getElementById("recipe-reference"),
  recipesList: document.getElementById("recipes-list"),
  recipeSubmit: document.getElementById("recipe-submit"),
  recipeCancel: document.getElementById("recipe-cancel"),
  recipeEditHint: document.getElementById("recipe-edit-hint"),

  ratingForm: document.getElementById("rating-form"),
  ratingRecipe: document.getElementById("rating-recipe"),
  ratingProfile: document.getElementById("rating-profile"),
  ratingValue: document.getElementById("rating-value"),
  ratingsList: document.getElementById("ratings-list"),
  ratingSubmit: document.getElementById("rating-submit"),
  ratingCancel: document.getElementById("rating-cancel"),
  ratingEditHint: document.getElementById("rating-edit-hint"),

  generateMode: document.getElementById("generate-mode"),
  generateCount: document.getElementById("generate-count"),
  generateStart: document.getElementById("generate-start"),
  generatePlan: document.getElementById("generate-plan"),
  plannerStatus: document.getElementById("planner-status"),
  calendarGrid: document.getElementById("calendar-grid"),

  saveJson: document.getElementById("save-json"),
  loadJson: document.getElementById("load-json"),
  clearCalendar: document.getElementById("clear-calendar"),
  clearAll: document.getElementById("clear-all"),
  seedDemo: document.getElementById("seed-demo"),

  dayDialog: document.getElementById("day-dialog"),
  dialogDate: document.getElementById("dialog-date"),
  dialogTitle: document.getElementById("dialog-title"),
  dialogMeta: document.getElementById("dialog-meta"),
  dialogRating: document.getElementById("dialog-rating"),
  dialogDislikes: document.getElementById("dialog-dislikes"),
  dialogRecipe: document.getElementById("dialog-recipe"),
  dialogRef: document.getElementById("dialog-ref"),
  regenerateDay: document.getElementById("regenerate-day"),
  closeDialog: document.getElementById("close-dialog"),

  navData: document.getElementById("nav-data"),
  navCalendar: document.getElementById("nav-calendar"),
  viewData: document.getElementById("view-data"),
  viewCalendar: document.getElementById("view-calendar"),
};

function init() {
  loadState();
  if (!state.generator.start) {
    state.generator.start = todayISO();
  }
  bindEvents();
  applyView(getViewFromHash(), false);
  renderAll();
}

function bindEvents() {
  els.profileForm.addEventListener("submit", onProfileSubmit);
  els.recipeForm.addEventListener("submit", onRecipeSubmit);
  els.ratingForm.addEventListener("submit", onRatingSubmit);
  els.profileCancel.addEventListener("click", clearProfileEditMode);
  els.recipeCancel.addEventListener("click", clearRecipeEditMode);
  els.ratingCancel.addEventListener("click", clearRatingEditMode);

  els.generatePlan.addEventListener("click", onGeneratePlan);
  els.generateMode.addEventListener("change", () => {
    state.generator.mode = els.generateMode.value;
    persist();
  });
  els.generateCount.addEventListener("change", () => {
    state.generator.count = toInt(els.generateCount.value, 30);
    persist();
  });
  els.generateStart.addEventListener("change", () => {
    state.generator.start = els.generateStart.value || todayISO();
    persist();
  });

  els.saveJson.addEventListener("click", saveJson);
  els.loadJson.addEventListener("change", loadJson);
  els.clearCalendar.addEventListener("click", clearCalendarData);
  els.clearAll.addEventListener("click", clearAllData);
  els.seedDemo.addEventListener("click", seedDemoData);

  els.closeDialog.addEventListener("click", () => els.dayDialog.close());
  els.regenerateDay.addEventListener("click", onRegenerateDay);

  els.navData.addEventListener("click", () => applyView("data"));
  els.navCalendar.addEventListener("click", () => applyView("calendar"));
  window.addEventListener("hashchange", () => {
    applyView(getViewFromHash(), false);
  });
}

function onProfileSubmit(event) {
  event.preventDefault();
  const name = els.profileName.value.trim();
  if (!name) {
    return;
  }

  const editingProfileId = state.editing.profileId;
  if (editingProfileId) {
    const profile = state.profiles.find((x) => x.id === editingProfileId);
    if (!profile) {
      clearProfileEditMode();
      return;
    }
    profile.name = name;
    profile.dislikedFoods = parseCsv(els.profileDislikes.value);
    clearProfileEditMode();
    persistAndRender();
    return;
  }

  state.profiles.push({
    id: uid(),
    name,
    dislikedFoods: parseCsv(els.profileDislikes.value),
  });

  els.profileForm.reset();
  persistAndRender();
}

function onRecipeSubmit(event) {
  event.preventDefault();
  const name = els.recipeName.value.trim();
  const complexity = clamp(toInt(els.recipeComplexity.value, 5), 1, 10);
  const recipeText = els.recipeText.value.trim();
  const reference = els.recipeReference.value.trim();

  if (!name) {
    return;
  }

  if (!recipeText && !reference) {
    window.alert("Add either full recipe text or a reference link/source.");
    return;
  }

  const editingRecipeId = state.editing.recipeId;
  if (editingRecipeId) {
    const recipe = state.recipes.find((x) => x.id === editingRecipeId);
    if (!recipe) {
      clearRecipeEditMode();
      return;
    }

    recipe.name = name;
    recipe.complexity = complexity;
    recipe.dislikedTags = parseCsv(els.recipeDislikedTags.value);
    recipe.recipeText = recipeText;
    recipe.reference = reference;
    clearRecipeEditMode();
    persistAndRender();
    return;
  }

  state.recipes.push({
    id: uid(),
    name,
    complexity,
    dislikedTags: parseCsv(els.recipeDislikedTags.value),
    recipeText,
    reference,
    createdAt: new Date().toISOString(),
  });

  els.recipeForm.reset();
  els.recipeComplexity.value = 5;
  persistAndRender();
}

function onRatingSubmit(event) {
  event.preventDefault();
  const recipeId = els.ratingRecipe.value;
  if (!recipeId) {
    window.alert("Add at least one recipe first.");
    return;
  }

  const value = clamp(toInt(els.ratingValue.value, 80), 1, 100);
  const editingRatingId = state.editing.ratingId;
  if (editingRatingId) {
    const rating = state.ratings.find((x) => x.id === editingRatingId);
    if (!rating) {
      clearRatingEditMode();
      return;
    }
    rating.recipeId = recipeId;
    rating.profileId = els.ratingProfile.value || null;
    rating.score = value;
    clearRatingEditMode();
    persistAndRender();
    return;
  }

  state.ratings.push({
    id: uid(),
    recipeId,
    profileId: els.ratingProfile.value || null,
    score: value,
    createdAt: new Date().toISOString(),
  });

  els.ratingValue.value = 80;
  persistAndRender();
}

function onGeneratePlan() {
  if (!state.recipes.length) {
    window.alert("Add recipes before generating a menu.");
    return;
  }

  const startDate = els.generateStart.value || todayISO();
  const mode = els.generateMode.value;
  const count = clamp(toInt(els.generateCount.value, 30), 1, 365);
  const daysToGenerate = mode === "months" ? clamp(count * 30, 30, 365) : count;

  state.generator.start = startDate;
  state.generator.mode = mode;
  state.generator.count = count;

  const dates = buildDateRange(startDate, daysToGenerate);
  ensureCadenceAnchors(startDate);
  const usedNewRecipeIds = new Set(
    Object.values(state.plans)
      .filter((entry) => entry.type === "recipe" && entry.isNewRecipeNight)
      .map((entry) => entry.recipeId)
  );

  const generated = [];
  for (const date of dates) {
    const dateNum = dateToNumber(date);

    if (state.cadence.nextEatOutOn !== null && dateNum >= state.cadence.nextEatOutOn) {
      generated.push({ date, type: "special", label: pickEatOutLabel() });
      state.cadence.nextEatOutOn = dateNum + randomInt(19, 24);
      continue;
    }

    const forceNewRecipe = state.cadence.nextNewRecipeOn !== null && dateNum >= state.cadence.nextNewRecipeOn;
    const entry = pickRecipeForDate(date, generated, forceNewRecipe, null, usedNewRecipeIds);
    generated.push(entry);

    if (entry.type === "recipe" && entry.isNewRecipeNight) {
      usedNewRecipeIds.add(entry.recipeId);
    }

    if (forceNewRecipe) {
      state.cadence.nextNewRecipeOn = dateNum + randomInt(11, 17);
    }
  }

  for (const entry of generated) {
    state.plans[entry.date] = {
      ...entry,
      generatedAt: new Date().toISOString(),
    };
  }

  const specials = generated.filter((x) => x.type === "special").length;
  const newNights = generated.filter((x) => x.type === "recipe" && x.isNewRecipeNight).length;
  state.generator.start = findNextEmptyDate(startDate);
  els.plannerStatus.textContent = `Generated ${generated.length} days (${newNights} new recipe nights, ${specials} eat-out nights).`;
  persistAndRender();
}

function onRegenerateDay() {
  if (!state.selectedDay) {
    return;
  }

  const date = state.selectedDay;
  const old = state.plans[date];
  if (!old) {
    return;
  }

  if (old.type === "special") {
    state.plans[date] = {
      date,
      type: "special",
      label: pickEatOutLabel(),
      generatedAt: new Date().toISOString(),
    };
    persistAndRender();
    openDayDialog(date);
    return;
  }

  const usedNewRecipeIds = new Set(
    Object.values(state.plans)
      .filter((entry) => entry.type === "recipe" && entry.isNewRecipeNight && entry.date !== date)
      .map((entry) => entry.recipeId)
  );

  const replacement = pickRecipeForDate(date, [], old.isNewRecipeNight, old.recipeId, usedNewRecipeIds);
  state.plans[date] = {
    ...replacement,
    generatedAt: new Date().toISOString(),
  };
  persistAndRender();
  openDayDialog(date);
}

function pickRecipeForDate(
  date,
  inProgressEntries,
  forceNewRecipeNight = false,
  excludeRecipeId = null,
  usedNewRecipeIds = new Set()
) {
  const candidates = state.recipes.filter((recipe) => {
    if (excludeRecipeId && recipe.id === excludeRecipeId) {
      return false;
    }
    if (violatesLockout(recipe.id, date, inProgressEntries)) {
      return false;
    }
    return true;
  });

  let filtered = candidates;
  let isNewRecipeNight = false;
  if (forceNewRecipeNight) {
    const newRecipes = candidates.filter(
      (recipe) => getRecipeRatingCount(recipe.id) === 0 && !usedNewRecipeIds.has(recipe.id)
    );
    if (newRecipes.length) {
      filtered = newRecipes;
      isNewRecipeNight = true;
    }
  }

  if (!filtered.length) {
    filtered = candidates.length ? candidates : state.recipes.filter((recipe) => recipe.id !== excludeRecipeId);
  }

  const scored = filtered.map((recipe) => ({
    recipe,
    score: scoreRecipe(recipe, date, inProgressEntries, forceNewRecipeNight),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topSlice = scored.slice(0, Math.min(8, scored.length));
  const chosen = weightedPick(topSlice);

  return {
    date,
    type: "recipe",
    recipeId: chosen.recipe.id,
    isNewRecipeNight,
  };
}

function scoreRecipe(recipe, date, inProgressEntries = [], forceNewRecipeNight = false) {
  const avgRating = getRecipeAverage(recipe.id);
  const ratingNorm = avgRating === null ? 0.5 : avgRating / 100;
  const complexityNorm = recipe.complexity / 10;

  const lastServedDate = getLastServedDate(recipe.id, date);
  const daysSince = lastServedDate ? daysBetween(lastServedDate, date) : 120;
  const recencyNorm = Math.min(daysSince / 45, 1);

  const dislikeBurden = computeDislikeBurden(recipe);
  const recentDislikePenalty = computeRecentDislikePenalty(recipe, date);
  const favoriteBalance = computeFavoriteBalanceAdjustment(recipe, date, inProgressEntries, avgRating);
  const complexityBalance = computeComplexityBalanceAdjustment(recipe, date, inProgressEntries);

  // Weighted score balancing quality, ease, and fairness.
  const base = recencyNorm * 0.36 + ratingNorm * 0.34 + (1 - complexityNorm) * 0.16;
  const penalties = dislikeBurden * 0.17 + recentDislikePenalty * 0.14;
  const explorationBoost = avgRating === null
    ? (forceNewRecipeNight ? 0.2 : -0.05)
    : 0;

  return Math.max(0.01, base - penalties + explorationBoost + favoriteBalance + complexityBalance);
}

function computeFavoriteBalanceAdjustment(recipe, date, inProgressEntries, avgRating = getRecipeAverage(recipe.id)) {
  const priorEntries = getPriorRecipeEntries(date, inProgressEntries);
  const recentWeek = priorEntries.filter((entry) => daysBetween(entry.date, date) <= 6);
  const recentFavorites = recentWeek.filter((entry) => isFavoriteRecipeId(entry.recipeId)).length;
  const daysSinceFavorite = getDaysSinceLastFavorite(date, inProgressEntries);
  const isFavorite = isFavoriteRating(avgRating);

  let adjustment = 0;
  if (isFavorite && recentFavorites >= 2) {
    adjustment -= 0.14 + ((recentFavorites - 2) * 0.03);
  }

  if (isFavorite && daysSinceFavorite !== null && daysSinceFavorite >= 4) {
    adjustment += Math.min(0.12, 0.03 * (daysSinceFavorite - 3));
  }

  if (!isFavorite && daysSinceFavorite !== null && daysSinceFavorite >= 6) {
    adjustment -= Math.min(0.08, 0.02 * (daysSinceFavorite - 5));
  }

  return adjustment;
}

function computeComplexityBalanceAdjustment(recipe, date, inProgressEntries) {
  const priorEntries = getPriorRecipeEntries(date, inProgressEntries);
  const recentWeek = priorEntries.filter((entry) => daysBetween(entry.date, date) <= 6);
  const recentComplexities = recentWeek
    .map((entry) => getRecipeComplexity(entry.recipeId))
    .filter((value) => value !== null);

  if (!recentComplexities.length) {
    return 0;
  }

  const recentComplexMeals = recentComplexities.filter((value) => value >= 7).length;
  const recentEasyMeals = recentComplexities.filter((value) => value <= 3).length;
  const avgRecentComplexity = recentComplexities.reduce((sum, value) => sum + value, 0) / recentComplexities.length;

  let adjustment = 0;
  if (recipe.complexity >= 7 && recentComplexMeals >= 2) {
    adjustment -= 0.14 + ((recentComplexMeals - 2) * 0.04);
  }

  if (recipe.complexity <= 3 && recentEasyMeals >= 3) {
    adjustment -= 0.05 + ((recentEasyMeals - 3) * 0.02);
  }

  if (avgRecentComplexity >= 5.8 && recipe.complexity <= 4) {
    adjustment += 0.08;
  }

  if (avgRecentComplexity <= 3.2 && recipe.complexity >= 5 && recipe.complexity <= 7) {
    adjustment += 0.04;
  }

  return adjustment;
}

function computeRecentDislikePenalty(recipe, date) {
  if (!state.profiles.length || !recipe.dislikedTags.length) {
    return 0;
  }

  const tags = new Set(recipe.dislikedTags.map(normalizeToken));
  let totalPenalty = 0;
  let impacted = 0;

  for (const profile of state.profiles) {
    const dislikes = profile.dislikedFoods.map(normalizeToken);
    const hasOverlap = dislikes.some((food) => tags.has(food));
    if (!hasOverlap) {
      continue;
    }

    impacted += 1;
    const days = daysSinceLastDislikedMealForProfile(profile.id, date);
    // Recent disliked exposures increase penalty sharply in first 10 days.
    const recencyPenalty = days === null ? 0.25 : Math.max(0, (10 - days) / 10);
    totalPenalty += recencyPenalty;
  }

  if (!impacted) {
    return 0;
  }

  return totalPenalty / impacted;
}

function daysSinceLastDislikedMealForProfile(profileId, beforeDate) {
  const profile = state.profiles.find((x) => x.id === profileId);
  if (!profile) {
    return null;
  }

  const dislikedSet = new Set(profile.dislikedFoods.map(normalizeToken));
  const entries = getAllRecipeEntries([])
    .filter((entry) => entry.type === "recipe" && entry.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const entry of entries) {
    const recipe = state.recipes.find((x) => x.id === entry.recipeId);
    if (!recipe || !recipe.dislikedTags.length) {
      continue;
    }
    const tags = recipe.dislikedTags.map(normalizeToken);
    if (tags.some((tag) => dislikedSet.has(tag))) {
      return daysBetween(entry.date, beforeDate);
    }
  }

  return null;
}

function computeDislikeBurden(recipe) {
  if (!state.profiles.length || !recipe.dislikedTags.length) {
    return 0;
  }

  const tags = new Set(recipe.dislikedTags.map(normalizeToken));
  let impactedProfiles = 0;
  let totalHits = 0;

  for (const profile of state.profiles) {
    const dislikes = profile.dislikedFoods.map(normalizeToken);
    const hits = dislikes.filter((food) => tags.has(food)).length;
    if (hits > 0) {
      impactedProfiles += 1;
      totalHits += hits;
    }
  }

  const profileImpact = impactedProfiles / state.profiles.length;
  const intensity = Math.min(totalHits / Math.max(1, state.profiles.length), 1);
  return Math.min((profileImpact * 0.7) + (intensity * 0.3), 1);
}

function violatesLockout(recipeId, targetDate, inProgressEntries) {
  const allEntries = getAllRecipeEntries(inProgressEntries);
  for (const entry of allEntries) {
    if (entry.type !== "recipe" || entry.recipeId !== recipeId) {
      continue;
    }

    if (entry.date === targetDate) {
      continue;
    }

    const delta = Math.abs(daysBetween(entry.date, targetDate));
    if (delta < 14) {
      return true;
    }
  }
  return false;
}

function getLastServedDate(recipeId, beforeDate) {
  const dates = getAllRecipeEntries([])
    .filter((entry) => entry.type === "recipe" && entry.recipeId === recipeId)
    .map((entry) => entry.date)
    .filter((date) => date < beforeDate)
    .sort((a, b) => (a < b ? 1 : -1));

  return dates[0] || null;
}

function getPriorRecipeEntries(beforeDate, inProgressEntries = []) {
  return getAllRecipeEntries(inProgressEntries)
    .filter((entry) => entry.type === "recipe" && entry.date < beforeDate)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function getAllRecipeEntries(inProgressEntries = []) {
  return Object.values(state.historyPlans)
    .concat(Object.values(state.plans))
    .concat(inProgressEntries || []);
}

function getDaysSinceLastFavorite(beforeDate, inProgressEntries = []) {
  const favoriteEntry = getPriorRecipeEntries(beforeDate, inProgressEntries)
    .find((entry) => isFavoriteRecipeId(entry.recipeId));

  if (!favoriteEntry) {
    return null;
  }

  return daysBetween(favoriteEntry.date, beforeDate);
}

function isFavoriteRecipeId(recipeId) {
  return isFavoriteRating(getRecipeAverage(recipeId));
}

function isFavoriteRating(avgRating) {
  return avgRating !== null && avgRating >= 85;
}

function getRecipeComplexity(recipeId) {
  const recipe = state.recipes.find((x) => x.id === recipeId);
  return recipe ? recipe.complexity : null;
}

function getRecipeAverage(recipeId) {
  const hits = state.ratings.filter((rating) => rating.recipeId === recipeId);
  if (!hits.length) {
    return null;
  }

  const total = hits.reduce((sum, item) => sum + item.score, 0);
  return Math.round((total / hits.length) * 10) / 10;
}

function getRecipeRatingCount(recipeId) {
  return state.ratings.filter((rating) => rating.recipeId === recipeId).length;
}

function ensureCadenceAnchors(startDate) {
  const startNum = dateToNumber(startDate);
  if (state.cadence.nextNewRecipeOn === null || state.cadence.nextNewRecipeOn < startNum) {
    state.cadence.nextNewRecipeOn = startNum + randomInt(11, 17);
  }
  if (state.cadence.nextEatOutOn === null || state.cadence.nextEatOutOn < startNum) {
    state.cadence.nextEatOutOn = startNum + randomInt(19, 24);
  }
}

function pickEatOutLabel() {
  return Math.random() < 0.5 ? "Order In" : "Eat Out";
}

function weightedPick(items) {
  const sum = items.reduce((acc, item) => acc + item.score, 0);
  let roll = Math.random() * sum;
  for (const item of items) {
    roll -= item.score;
    if (roll <= 0) {
      return item;
    }
  }
  return items[0];
}

function renderAll() {
  applyView(state.currentView || "data", false);
  els.generateMode.value = state.generator.mode;
  els.generateCount.value = state.generator.count;
  els.generateStart.value = state.generator.start || todayISO();

  renderProfiles();
  renderRecipes();
  renderRatingSelectors();
  renderRatings();
  renderCalendar();
  renderEditStates();
}

function renderEditStates() {
  const profileEditing = Boolean(state.editing.profileId);
  els.profileSubmit.textContent = profileEditing ? "Save Profile" : "Add Profile";
  els.profileCancel.hidden = !profileEditing;
  els.profileEditHint.hidden = !profileEditing;

  const recipeEditing = Boolean(state.editing.recipeId);
  els.recipeSubmit.textContent = recipeEditing ? "Save Recipe" : "Add Recipe";
  els.recipeCancel.hidden = !recipeEditing;
  els.recipeEditHint.hidden = !recipeEditing;

  const ratingEditing = Boolean(state.editing.ratingId);
  els.ratingSubmit.textContent = ratingEditing ? "Save Review" : "Submit Review";
  els.ratingCancel.hidden = !ratingEditing;
  els.ratingEditHint.hidden = !ratingEditing;
}

function applyView(view, syncHash = true) {
  const normalized = view === "calendar" ? "calendar" : "data";
  state.currentView = normalized;

  const showCalendar = normalized === "calendar";
  els.viewData.classList.toggle("active", !showCalendar);
  els.viewCalendar.classList.toggle("active", showCalendar);
  els.navData.classList.toggle("active", !showCalendar);
  els.navCalendar.classList.toggle("active", showCalendar);

  document.querySelectorAll(".calendar-action").forEach((node) => {
    node.hidden = !showCalendar;
  });
  document.querySelectorAll(".data-action").forEach((node) => {
    node.hidden = showCalendar;
  });

  if (syncHash) {
    const targetHash = showCalendar ? "#calendar" : "#data";
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }
}

function getViewFromHash() {
  return window.location.hash === "#calendar" ? "calendar" : (state.currentView || "data");
}

function renderProfiles() {
  els.profilesList.innerHTML = "";
  if (!state.profiles.length) {
    els.profilesList.innerHTML = "<li><div class='card-main'><strong>No profiles yet.</strong><small>Add eaters to tune dislike-aware planning.</small></div></li>";
    return;
  }

  for (const profile of state.profiles) {
    const li = document.createElement("li");
    li.classList.add("selectable");
    li.innerHTML = `<div class="card-main"><strong>${escapeHtml(profile.name)}</strong><small>Dislikes: ${escapeHtml(profile.dislikedFoods.join(", ") || "None")}</small></div>`;
    li.addEventListener("click", () => startProfileEdit(profile.id));
    const btn = buildDeleteButton(() => {
      state.profiles = state.profiles.filter((x) => x.id !== profile.id);
      state.ratings = state.ratings.map((rating) => {
        if (rating.profileId === profile.id) {
          return { ...rating, profileId: null };
        }
        return rating;
      });
      if (state.editing.profileId === profile.id) {
        clearProfileEditMode();
      }
      persistAndRender();
    });
    li.appendChild(btn);
    els.profilesList.appendChild(li);
  }
}

function renderRecipes() {
  els.recipesList.innerHTML = "";
  if (!state.recipes.length) {
    els.recipesList.innerHTML = "<li><div class='card-main'><strong>No recipes yet.</strong><small>Add meal ideas to generate menus.</small></div></li>";
    return;
  }

  for (const recipe of state.recipes) {
    const avg = getRecipeAverage(recipe.id);
    const li = document.createElement("li");
    li.classList.add("selectable");
    li.innerHTML = `<div class="card-main"><strong>${escapeHtml(recipe.name)}</strong><small>Complexity ${recipe.complexity}/10 | Avg: ${avg === null ? "New" : avg}</small><small>Disliked tags: ${escapeHtml(recipe.dislikedTags.join(", ") || "None")}</small></div>`;
    li.addEventListener("click", () => startRecipeEdit(recipe.id));
    const btn = buildDeleteButton(() => {
      state.recipes = state.recipes.filter((x) => x.id !== recipe.id);
      state.ratings = state.ratings.filter((x) => x.recipeId !== recipe.id);
      Object.keys(state.plans).forEach((date) => {
        const entry = state.plans[date];
        if (entry.type === "recipe" && entry.recipeId === recipe.id) {
          delete state.plans[date];
        }
      });
      if (state.editing.recipeId === recipe.id) {
        clearRecipeEditMode();
      }
      if (state.editing.ratingId) {
        const editingRating = state.ratings.find((x) => x.id === state.editing.ratingId);
        if (!editingRating) {
          clearRatingEditMode();
        }
      }
      persistAndRender();
    });
    li.appendChild(btn);
    els.recipesList.appendChild(li);
  }
}

function renderRatingSelectors() {
  els.ratingRecipe.innerHTML = "";
  for (const recipe of state.recipes) {
    const option = document.createElement("option");
    option.value = recipe.id;
    option.textContent = recipe.name;
    els.ratingRecipe.appendChild(option);
  }

  els.ratingProfile.innerHTML = "<option value=''>Any / Household</option>";
  for (const profile of state.profiles) {
    const option = document.createElement("option");
    option.value = profile.id;
    option.textContent = profile.name;
    els.ratingProfile.appendChild(option);
  }
}

function renderRatings() {
  els.ratingsList.innerHTML = "";
  if (!state.ratings.length) {
    els.ratingsList.innerHTML = "<li><div class='card-main'><strong>No reviews yet.</strong><small>Rate meals from 1-100.</small></div></li>";
    return;
  }

  const latest = [...state.ratings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 30);
  for (const rating of latest) {
    const recipe = state.recipes.find((x) => x.id === rating.recipeId);
    const profile = state.profiles.find((x) => x.id === rating.profileId);
    const li = document.createElement("li");
    li.classList.add("selectable");
    li.innerHTML = `<div class="card-main"><strong>${escapeHtml(recipe ? recipe.name : "Deleted Recipe")}: ${rating.score}</strong><small>${escapeHtml(profile ? profile.name : "Household")}, ${formatDate(rating.createdAt.slice(0, 10))}</small></div>`;
    li.addEventListener("click", () => startRatingEdit(rating.id));
    const btn = buildDeleteButton(() => {
      state.ratings = state.ratings.filter((x) => x.id !== rating.id);
      if (state.editing.ratingId === rating.id) {
        clearRatingEditMode();
      }
      persistAndRender();
    });
    li.appendChild(btn);
    els.ratingsList.appendChild(li);
  }
}

function startProfileEdit(profileId) {
  const profile = state.profiles.find((x) => x.id === profileId);
  if (!profile) {
    return;
  }

  state.editing.profileId = profile.id;
  els.profileName.value = profile.name;
  els.profileDislikes.value = profile.dislikedFoods.join(", ");
  renderEditStates();
}

function clearProfileEditMode() {
  state.editing.profileId = null;
  els.profileForm.reset();
  renderEditStates();
}

function startRecipeEdit(recipeId) {
  const recipe = state.recipes.find((x) => x.id === recipeId);
  if (!recipe) {
    return;
  }

  state.editing.recipeId = recipe.id;
  els.recipeName.value = recipe.name;
  els.recipeComplexity.value = recipe.complexity;
  els.recipeDislikedTags.value = recipe.dislikedTags.join(", ");
  els.recipeText.value = recipe.recipeText || "";
  els.recipeReference.value = recipe.reference || "";
  renderEditStates();
}

function clearRecipeEditMode() {
  state.editing.recipeId = null;
  els.recipeForm.reset();
  els.recipeComplexity.value = 5;
  renderEditStates();
}

function startRatingEdit(ratingId) {
  const rating = state.ratings.find((x) => x.id === ratingId);
  if (!rating) {
    return;
  }

  state.editing.ratingId = rating.id;
  els.ratingRecipe.value = rating.recipeId;
  els.ratingProfile.value = rating.profileId || "";
  els.ratingValue.value = rating.score;
  renderEditStates();
}

function clearRatingEditMode() {
  state.editing.ratingId = null;
  els.ratingForm.reset();
  els.ratingValue.value = 80;
  renderEditStates();
}

function renderCalendar() {
  const dates = Object.keys(state.plans).sort();
  if (!dates.length) {
    els.calendarGrid.innerHTML = "";
    els.plannerStatus.textContent = "Generate a plan to fill your calendar.";
    return;
  }

  const firstPlanned = dates[0];
  const lastPlanned = dates[dates.length - 1];
  const today = todayISO();
  const threeDaysAgo = addDaysISO(today, -3);

  // Keep at most 3 historical days visible, but preserve all plan history in state.
  const visibleStart = firstPlanned > threeDaysAgo ? firstPlanned : threeDaysAgo;
  const visibleEnd = lastPlanned > today ? lastPlanned : today;
  const calendarDays = fullCalendarRange(visibleStart, visibleEnd);

  els.calendarGrid.innerHTML = "";
  for (const date of calendarDays) {
    const entry = state.plans[date];
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `day-cell ${entry ? "" : "empty"}`;

    if (!entry) {
      cell.innerHTML = `<div class="day-top"><strong>${dayOfMonth(date)}</strong><span></span></div><div class="day-meal">&nbsp;</div>`;
      cell.disabled = true;
      els.calendarGrid.appendChild(cell);
      continue;
    }

    const title = entry.type === "special" ? entry.label : getRecipeName(entry.recipeId);
    const mealClasses = ["day-meal"];
    if (entry.type === "special") {
      mealClasses.push("special");
    }
    if (entry.type === "recipe" && entry.isNewRecipeNight) {
      mealClasses.push("new-recipe");
    }

    cell.innerHTML = `<div class="day-top"><strong>${dayOfMonth(date)}</strong><span>${shortWeekday(date)}</span></div><div class="${mealClasses.join(" ")}">${escapeHtml(title)}</div>`;
    cell.addEventListener("click", () => openDayDialog(date));
    els.calendarGrid.appendChild(cell);
  }
}

function openDayDialog(date) {
  const entry = state.plans[date];
  if (!entry) {
    return;
  }

  state.selectedDay = date;
  els.dialogDate.textContent = formatDate(date);

  if (entry.type === "special") {
    els.dialogTitle.textContent = entry.label;
    els.dialogMeta.textContent = "Special event day.";
    els.dialogRating.textContent = "Average Rating: n/a";
    els.dialogDislikes.textContent = "Potential disliked foods: n/a";
    els.dialogRecipe.textContent = "Recipe: n/a";
    els.dialogRef.textContent = "Reference: n/a";
    els.dayDialog.showModal();
    return;
  }

  const recipe = state.recipes.find((x) => x.id === entry.recipeId);
  const avg = getRecipeAverage(entry.recipeId);
  els.dialogTitle.textContent = recipe ? recipe.name : "Unknown recipe";
  els.dialogMeta.textContent = `Complexity: ${recipe ? recipe.complexity : "?"}/10${entry.isNewRecipeNight ? " | New recipe night" : ""}`;
  els.dialogRating.textContent = `Average Rating: ${avg === null ? "New (no ratings yet)" : avg + "/100"}`;
  els.dialogDislikes.textContent = `Potential disliked foods: ${recipe && recipe.dislikedTags.length ? recipe.dislikedTags.join(", ") : "None listed"}`;
  els.dialogRecipe.textContent = `Recipe: ${recipe && recipe.recipeText ? recipe.recipeText : "No full recipe entered."}`;
  els.dialogRef.textContent = `Reference: ${recipe && recipe.reference ? recipe.reference : "No external reference."}`;
  els.dayDialog.showModal();
}

function saveJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `menu-planner-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadJson(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      mergeImportedState(parsed);
      persistAndRender();
      window.alert("Load completed. Imported data was merged with your existing planner data.");
    } catch (_error) {
      window.alert("Invalid JSON file.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function mergeImportedState(parsed) {
  const imported = normalizeStatePayload(parsed);

  state.profiles = mergeRecordsById(state.profiles, imported.profiles);
  state.recipes = mergeRecordsById(state.recipes, imported.recipes);
  state.ratings = mergeRecordsById(state.ratings, imported.ratings);
  state.historyPlans = {
    ...state.historyPlans,
    ...imported.historyPlans,
  };
  state.plans = {
    ...state.plans,
    ...imported.plans,
  };

  state.cadence = {
    nextNewRecipeOn: maxNullableNumber(state.cadence.nextNewRecipeOn, imported.cadence.nextNewRecipeOn),
    nextEatOutOn: maxNullableNumber(state.cadence.nextEatOutOn, imported.cadence.nextEatOutOn),
  };

  state.generator = {
    start: findNextEmptyDate(state.generator.start || imported.generator.start || todayISO()),
    mode: state.generator.mode || imported.generator.mode,
    count: state.generator.count || imported.generator.count,
  };

  state.selectedDay = null;
  state.editing = {
    profileId: null,
    recipeId: null,
    ratingId: null,
  };
}

function clearAllData() {
  if (!window.confirm("Clear all data? This cannot be undone.")) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  state.profiles = [];
  state.recipes = [];
  state.ratings = [];
  state.plans = {};
  state.historyPlans = {};
  state.cadence = { nextNewRecipeOn: null, nextEatOutOn: null };
  state.generator = { start: todayISO(), mode: "days", count: 30 };
  state.selectedDay = null;
  renderAll();
}

function clearCalendarData() {
  if (!window.confirm("Clear generated calendar only? Recipes, profiles, and ratings will stay.")) {
    return;
  }

  const today = todayISO();
  const pastPlans = Object.fromEntries(
    Object.entries(state.plans).filter(([date]) => date < today)
  );

  state.historyPlans = {
    ...state.historyPlans,
    ...pastPlans,
  };
  state.plans = {};
  state.cadence = { nextNewRecipeOn: null, nextEatOutOn: null };
  state.selectedDay = null;
  state.generator.start = todayISO();
  els.plannerStatus.textContent = "Calendar cleared. Generate a new plan when ready.";
  persistAndRender();
}

function seedDemoData() {
  if (state.recipes.length || state.profiles.length) {
    if (!window.confirm("Seed demo data in addition to existing data?")) {
      return;
    }
  }

  const demoProfiles = [
    { name: "Alex", dislikedFoods: ["mushrooms", "olives"] },
    { name: "Sam", dislikedFoods: ["cilantro", "shrimp"] },
    { name: "Jamie", dislikedFoods: ["eggplant"] },
  ];

  const demoRecipes = [
    { name: "Taco Bowls", complexity: 4, dislikedTags: ["cilantro"], recipeText: "Cook rice, season beef or beans, add toppings.", reference: "Family notebook p. 11" },
    { name: "Lemon Pasta", complexity: 3, dislikedTags: [], recipeText: "Boil pasta, saute garlic, lemon zest, parmesan.", reference: "https://example.com/lemon-pasta" },
    { name: "Sheet Pan Chicken", complexity: 2, dislikedTags: ["onion"], recipeText: "Roast chicken and vegetables at 425F for 35 min.", reference: "Cookbook vol. 2 p. 87" },
    { name: "Mushroom Risotto", complexity: 8, dislikedTags: ["mushrooms"], recipeText: "Stir arborio rice with broth slowly until creamy.", reference: "Italian Basics p. 53" },
    { name: "Teriyaki Salmon", complexity: 5, dislikedTags: ["fish"], recipeText: "Bake salmon glazed in teriyaki, serve with rice.", reference: "https://example.com/salmon" },
    { name: "Veggie Stir Fry", complexity: 4, dislikedTags: ["broccoli"], recipeText: "Stir fry mixed vegetables, add sauce, serve over noodles.", reference: "Quick Meals p. 22" },
    { name: "Chili Night", complexity: 4, dislikedTags: ["beans"], recipeText: "Simmer beef, beans, tomatoes, chili spices for 45 min.", reference: "Family notebook p. 3" },
    { name: "Chicken Curry", complexity: 6, dislikedTags: ["onion"], recipeText: "Cook onions, curry paste, coconut milk, chicken.", reference: "Curry Book p. 18" },
  ];

  for (const profile of demoProfiles) {
    state.profiles.push({ id: uid(), ...profile });
  }

  for (const recipe of demoRecipes) {
    state.recipes.push({
      id: uid(),
      ...recipe,
      createdAt: new Date().toISOString(),
    });
  }

  for (const recipe of state.recipes.slice(0, 5)) {
    state.ratings.push({
      id: uid(),
      recipeId: recipe.id,
      profileId: state.profiles[Math.floor(Math.random() * state.profiles.length)]?.id || null,
      score: randomInt(65, 96),
      createdAt: new Date().toISOString(),
    });
  }

  persistAndRender();
}

function buildDeleteButton(onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger";
  button.textContent = "Delete";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function hydrateState(parsed) {
  const normalized = normalizeStatePayload(parsed);

  state.profiles = normalized.profiles;
  state.recipes = normalized.recipes;
  state.ratings = normalized.ratings;
  state.historyPlans = normalized.historyPlans;
  state.plans = normalized.plans;
  state.currentView = normalized.currentView;
  state.generator = normalized.generator;
  state.cadence = normalized.cadence;

  state.selectedDay = null;
  state.editing = {
    profileId: null,
    recipeId: null,
    ratingId: null,
  };
}

function normalizeStatePayload(parsed) {
  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
    ratings: Array.isArray(parsed.ratings) ? parsed.ratings : [],
    historyPlans: parsed.historyPlans && typeof parsed.historyPlans === "object" ? parsed.historyPlans : {},
    plans: parsed.plans && typeof parsed.plans === "object" ? parsed.plans : {},
    currentView: parsed.currentView === "calendar" ? "calendar" : "data",
    generator: parsed.generator && typeof parsed.generator === "object"
      ? {
        start: parsed.generator.start || todayISO(),
        mode: parsed.generator.mode === "months" ? "months" : "days",
        count: clamp(toInt(parsed.generator.count, 30), 1, 365),
      }
      : { start: todayISO(), mode: "days", count: 30 },
    cadence: parsed.cadence && typeof parsed.cadence === "object"
      ? {
        nextNewRecipeOn: Number.isInteger(parsed.cadence.nextNewRecipeOn) ? parsed.cadence.nextNewRecipeOn : null,
        nextEatOutOn: Number.isInteger(parsed.cadence.nextEatOutOn) ? parsed.cadence.nextEatOutOn : null,
      }
      : { nextNewRecipeOn: null, nextEatOutOn: null },
  };
}

function mergeRecordsById(existing, incoming) {
  const merged = [...existing];
  const indexById = new Map(existing.map((item, index) => [item.id, index]));

  for (const incomingItem of incoming) {
    if (!incomingItem || !incomingItem.id) {
      continue;
    }

    const existingIndex = indexById.get(incomingItem.id);
    if (existingIndex === undefined) {
      indexById.set(incomingItem.id, merged.length);
      merged.push(incomingItem);
      continue;
    }

    merged[existingIndex] = incomingItem;
  }

  return merged;
}

function maxNullableNumber(left, right) {
  if (left === null || left === undefined) {
    return right ?? null;
  }
  if (right === null || right === undefined) {
    return left;
  }
  return Math.max(left, right);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    hydrateState(JSON.parse(raw));
  } catch (_error) {
    window.alert("Could not load saved data. Starting fresh.");
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function persistAndRender() {
  persist();
  renderAll();
}

function buildDateRange(startDate, countDays) {
  const start = parseDate(startDate);
  const dates = [];
  for (let i = 0; i < countDays; i += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(toISODate(d));
  }
  return dates;
}

function fullCalendarRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);

  const calendarStart = new Date(start);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());

  const calendarEnd = new Date(end);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));

  const days = [];
  const cursor = new Date(calendarStart);
  while (cursor <= calendarEnd) {
    days.push(toISODate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function addDaysISO(isoDate, deltaDays) {
  const d = parseDate(isoDate);
  d.setDate(d.getDate() + deltaDays);
  return toISODate(d);
}

function findNextEmptyDate(fromDate) {
  const cursor = parseDate(fromDate || todayISO());
  for (let i = 0; i < 5000; i += 1) {
    const probe = toISODate(cursor);
    if (!state.plans[probe]) {
      return probe;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return todayISO();
}

function parseCsv(input) {
  return String(input || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function parseDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`);
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  return toISODate(new Date());
}

function dateToNumber(isoDate) {
  return Math.floor(parseDate(isoDate).getTime() / 86400000);
}

function daysBetween(dateA, dateB) {
  return Math.floor((parseDate(dateB).getTime() - parseDate(dateA).getTime()) / 86400000);
}

function formatDate(isoDate) {
  return parseDate(isoDate).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function shortWeekday(isoDate) {
  return parseDate(isoDate).toLocaleDateString(undefined, { weekday: "short" });
}

function dayOfMonth(isoDate) {
  return String(parseDate(isoDate).getDate());
}

function getRecipeName(recipeId) {
  return state.recipes.find((x) => x.id === recipeId)?.name || "Unknown recipe";
}

function normalizeToken(input) {
  return String(input).trim().toLowerCase();
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

init();
