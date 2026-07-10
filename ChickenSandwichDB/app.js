const SUPABASE_URL = "https://fupysqufnvblxyocqxey.supabase.co";
const SUPABASE_KEY = "sb_publishable_BdHgtwQxbguQOgkAc9gNqg_8uLcLA8e";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

document.addEventListener("DOMContentLoaded", () => {
  initializePage().catch((error) => {
    renderGlobalStatus(error.message || "Unexpected error.", "error");
  });
});

async function initializePage() {
  const page = document.body.dataset.page;
  highlightCurrentNav(page);

  if (!supabaseClient) {
    renderGlobalStatus("Supabase failed to load. Check your internet connection and try again.", "error");
    return;
  }

  if (page === "master") {
    await initializeMasterPage();
    return;
  }

  if (page === "austin") {
    await initializeAustinPage();
    return;
  }

  if (page === "average") {
    await initializeMasterPage();
    return;
  }

  if (page === "manage") {
    await initializeManagePage();
    return;
  }

  if (page === "review") {
    await initializeReviewPage();
  }
}

function highlightCurrentNav(page) {
  const links = document.querySelectorAll("[data-nav]");
  links.forEach((link) => {
    if (link.dataset.nav === page) {
      link.classList.add("is-active");
    }
  });
}

function renderGlobalStatus(message, tone) {
  const box = document.getElementById("globalStatus");
  if (!box) {
    return;
  }
  box.textContent = message;
  box.className = `status-banner status-${tone}`;
  box.hidden = false;
}

function setLocalStatus(elementId, message, tone) {
  const box = document.getElementById(elementId);
  if (!box) {
    return;
  }
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    box.className = "inline-status";
    return;
  }
  box.hidden = false;
  box.textContent = message;
  box.className = `inline-status status-${tone}`;
}

function formatAverage(value) {
  return value === null ? "No reviews" : value.toFixed(2);
}

function averageFromRatings(ratings) {
  if (!ratings.length) {
    return null;
  }
  const total = ratings.reduce((sum, value) => sum + value, 0);
  return total / ratings.length;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function initializeMasterPage() {
  const tableBody = document.getElementById("masterTableBody");
  tableBody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading sandwiches...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("chickensandwich")
    .select("sandwich_id, name, take_out, restaurant:restaurant_id(name, state, country), review(rating)")
    .order("sandwich_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data
    .map((item) => {
      const ratings = Array.isArray(item.review) ? item.review.map((entry) => entry.rating) : [];
      return {
        sandwichId: item.sandwich_id,
        name: item.name,
        takeOut: item.take_out,
        restaurantName: item.restaurant?.name || "Unknown",
        location: [item.restaurant?.state, item.restaurant?.country].filter(Boolean).join(", "),
        reviewCount: ratings.length,
        average: averageFromRatings(ratings)
      };
    })
    .sort((left, right) => {
      if (left.average === null && right.average === null) {
        return left.name.localeCompare(right.name);
      }
      if (left.average === null) {
        return 1;
      }
      if (right.average === null) {
        return -1;
      }
      if (right.average !== left.average) {
        return right.average - left.average;
      }
      return left.name.localeCompare(right.name);
    });

  renderMasterSummary(rows);
  tableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${row.sandwichId}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.restaurantName)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td>${row.takeOut ? "Take-out" : "Dine-in"}</td>
        <td>
          <strong>${formatAverage(row.average)}</strong>
          <span class="sub-value">${row.reviewCount} review${row.reviewCount === 1 ? "" : "s"}</span>
        </td>
      </tr>
    `)
    .join("");
}

function renderMasterSummary(rows) {
  const totalSandwiches = rows.length;
  const allRatings = rows.flatMap((row) => row.average === null ? [] : Array(row.reviewCount).fill(row.average));
  const totalReviews = rows.reduce((sum, row) => sum + row.reviewCount, 0);
  const ratedRows = rows.filter((row) => row.average !== null);
  const topSandwich = ratedRows[0];

  document.getElementById("masterSandwichCount").textContent = String(totalSandwiches);
  document.getElementById("masterReviewCount").textContent = String(totalReviews);
  document.getElementById("masterAverage").textContent = totalReviews ? formatAverage(allRatings.reduce((sum, value) => sum + value, 0) / totalReviews) : "No reviews";
  document.getElementById("masterLeader").textContent = topSandwich ? `${topSandwich.name} (${formatAverage(topSandwich.average)})` : "No reviews yet";
}

async function initializeAustinPage() {
  const tableBody = document.getElementById("austinTableBody");
  tableBody.innerHTML = `<tr><td colspan="4" class="loading-cell">Loading Austin's reviews...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("review_row_details")
    .select("sandwich_id, sandwich_name, restaurant_name, rating, take_out, reviewer_name")
    .eq("reviewer_name", "Austin Pico")
    .order("rating", { ascending: false })
    .order("sandwich_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const average = data.length ? data.reduce((sum, row) => sum + row.rating, 0) / data.length : null;
  const favorite = data[0];
  const takeOutCount = data.filter((row) => row.take_out).length;

  document.getElementById("austinReviewCount").textContent = String(data.length);
  document.getElementById("austinAverage").textContent = formatAverage(average);
  document.getElementById("austinTakeOutCount").textContent = String(takeOutCount);
  document.getElementById("austinFavorite").textContent = favorite ? `${favorite.sandwich_name} (${favorite.rating}/10)` : "No reviews yet";

  tableBody.innerHTML = data.length
    ? data
        .map((row) => `
          <tr>
            <td>${escapeHtml(row.sandwich_name)}</td>
            <td>${escapeHtml(row.restaurant_name)}</td>
            <td>${row.take_out ? "Take-out" : "Dine-in"}</td>
            <td><strong>${row.rating}/10</strong></td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="4" class="loading-cell">Austin has not reviewed any sandwiches yet.</td></tr>`;
}

async function initializeManagePage() {
  bindManageForms();
  await refreshManageCollections();
}

function bindManageForms() {
  document.getElementById("restaurantForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      state: form.state.value.trim(),
      country: form.country.value.trim()
    };

    await submitManagedInsert({
      table: "restaurant",
      payload,
      statusId: "restaurantStatus",
      successMessage: `Added restaurant ${payload.name}.`,
      form
    });
  });

  document.getElementById("reviewerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      first_name: form.firstName.value.trim(),
      last_name: form.lastName.value.trim()
    };

    await submitManagedInsert({
      table: "reviewer",
      payload,
      statusId: "reviewerStatus",
      successMessage: `Added reviewer ${payload.first_name} ${payload.last_name}.`,
      form
    });
  });

  document.getElementById("sandwichForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      take_out: form.takeOut.checked,
      restaurant_id: Number(form.restaurantId.value)
    };

    await submitManagedInsert({
      table: "chickensandwich",
      payload,
      statusId: "sandwichStatus",
      successMessage: `Added sandwich ${payload.name}.`,
      form
    });
  });
}

async function submitManagedInsert({ table, payload, statusId, successMessage, form }) {
  setLocalStatus(statusId, "Saving...", "info");
  const { error } = await supabaseClient.from(table).insert(payload);

  if (error) {
    setLocalStatus(statusId, error.message, "error");
    return;
  }

  form.reset();
  setLocalStatus(statusId, successMessage, "success");
  await refreshManageCollections();
}

async function refreshManageCollections() {
  const [restaurantsResult, reviewersResult, sandwichesResult] = await Promise.all([
    supabaseClient.from("restaurant").select("restaurant_id, name, state, country").order("name", { ascending: true }),
    supabaseClient.from("reviewer").select("reviewer_id, first_name, last_name").order("first_name", { ascending: true }),
    supabaseClient.from("chickensandwich").select("sandwich_id, name, take_out, restaurant:restaurant_id(name)").order("name", { ascending: true })
  ]);

  const firstError = [restaurantsResult.error, reviewersResult.error, sandwichesResult.error].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  renderRestaurantOptions(restaurantsResult.data);
  renderManageLists(restaurantsResult.data, reviewersResult.data, sandwichesResult.data);
}

function renderRestaurantOptions(restaurants) {
  const select = document.getElementById("sandwichRestaurantId");
  select.innerHTML = restaurants
    .map((restaurant) => `<option value="${restaurant.restaurant_id}">${escapeHtml(restaurant.name)} (${escapeHtml(restaurant.state)}, ${escapeHtml(restaurant.country)})</option>`)
    .join("");
}

function renderManageLists(restaurants, reviewers, sandwiches) {
  document.getElementById("restaurantList").innerHTML = restaurants
    .map((restaurant) => `<li>${escapeHtml(restaurant.name)} <span>${escapeHtml(restaurant.state)}, ${escapeHtml(restaurant.country)}</span></li>`)
    .join("");

  document.getElementById("reviewerList").innerHTML = reviewers
    .map((reviewer) => `<li>${escapeHtml(reviewer.first_name)} ${escapeHtml(reviewer.last_name)}</li>`)
    .join("");

  document.getElementById("sandwichList").innerHTML = sandwiches
    .map((sandwich) => `<li>${escapeHtml(sandwich.name)} <span>${escapeHtml(sandwich.restaurant?.name || "Unknown")} · ${sandwich.take_out ? "Take-out" : "Dine-in"}</span></li>`)
    .join("");
}

async function initializeReviewPage() {
  bindReviewForm();
  await refreshReviewPageData();
}

let reviewPageRows = [];

function bindReviewForm() {
  const reviewerSelect = document.getElementById("reviewReviewerId");
  const sandwichSelect = document.getElementById("reviewSandwichId");
  const ratingInput = document.getElementById("reviewRating");

  reviewerSelect.addEventListener("change", syncExistingReview);
  sandwichSelect.addEventListener("change", syncExistingReview);

  document.getElementById("reviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewerId = Number(reviewerSelect.value);
    const sandwichId = Number(sandwichSelect.value);
    const rating = Number(ratingInput.value);

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      setLocalStatus("reviewStatus", "Rating must be a whole number from 1 to 10.", "error");
      return;
    }

    setLocalStatus("reviewStatus", "Saving review...", "info");
    const { error } = await supabaseClient
      .from("review")
      .upsert({ sandwich_id: sandwichId, reviewer_id: reviewerId, rating }, { onConflict: "sandwich_id,reviewer_id" });

    if (error) {
      setLocalStatus("reviewStatus", error.message, "error");
      return;
    }

    setLocalStatus("reviewStatus", "Review saved.", "success");
    await refreshReviewPageData();
    reviewerSelect.value = String(reviewerId);
    sandwichSelect.value = String(sandwichId);
    ratingInput.value = String(rating);
  });
}

async function refreshReviewPageData() {
  const [reviewersResult, sandwichesResult, reviewsResult] = await Promise.all([
    supabaseClient.from("reviewer").select("reviewer_id, first_name, last_name").order("first_name", { ascending: true }),
    supabaseClient.from("chickensandwich").select("sandwich_id, name, restaurant:restaurant_id(name)").order("name", { ascending: true }),
    supabaseClient.from("review_row_details").select("sandwich_id, reviewer_id, sandwich_name, restaurant_name, reviewer_name, rating").order("sandwich_name", { ascending: true })
  ]);

  const firstError = [reviewersResult.error, sandwichesResult.error, reviewsResult.error].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  reviewPageRows = reviewsResult.data;
  renderReviewerOptions(reviewersResult.data, "reviewReviewerId");
  renderSandwichOptions(sandwichesResult.data, "reviewSandwichId");
  renderExistingReviews();
  renderReviewSummary(reviewsResult.data, reviewersResult.data, sandwichesResult.data);
  await syncExistingReview();
}

function renderReviewerOptions(reviewers, selectId) {
  const select = document.getElementById(selectId);
  const currentValue = select.value;
  select.innerHTML = reviewers
    .map((reviewer) => `<option value="${reviewer.reviewer_id}">${escapeHtml(reviewer.first_name)} ${escapeHtml(reviewer.last_name)}</option>`)
    .join("");

  if (currentValue && reviewers.some((reviewer) => String(reviewer.reviewer_id) === currentValue)) {
    select.value = currentValue;
  }
}

function renderSandwichOptions(sandwiches, selectId) {
  const select = document.getElementById(selectId);
  const currentValue = select.value;
  select.innerHTML = sandwiches
    .map((sandwich) => `<option value="${sandwich.sandwich_id}">${escapeHtml(sandwich.name)} (${escapeHtml(sandwich.restaurant?.name || "Unknown")})</option>`)
    .join("");

  if (currentValue && sandwiches.some((sandwich) => String(sandwich.sandwich_id) === currentValue)) {
    select.value = currentValue;
  }
}

function renderExistingReviews() {
  const selectedReviewerId = Number(document.getElementById("reviewReviewerId")?.value);
  const tableBody = document.getElementById("existingReviewTableBody");
  const filteredReviews = selectedReviewerId
    ? reviewPageRows.filter((review) => review.reviewer_id === selectedReviewerId)
    : reviewPageRows;

  tableBody.innerHTML = filteredReviews.length
    ? filteredReviews
        .map((review) => `
          <tr>
            <td>${escapeHtml(review.sandwich_name)}</td>
            <td>${escapeHtml(review.restaurant_name)}</td>
            <td>${escapeHtml(review.reviewer_name)}</td>
            <td><strong>${review.rating}/10</strong></td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="4" class="loading-cell">No reviews yet for this reviewer.</td></tr>`;
}

function renderReviewSummary(reviews, reviewers, sandwiches) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;
  document.getElementById("reviewCoverage").textContent = `${reviews.length} saved review${reviews.length === 1 ? "" : "s"}`;
  document.getElementById("reviewReviewerCount").textContent = `${reviewers.length} reviewer${reviewers.length === 1 ? "" : "s"}`;
  document.getElementById("reviewSandwichCount").textContent = `${sandwiches.length} sandwich${sandwiches.length === 1 ? "" : "es"}`;
  document.getElementById("reviewAverage").textContent = formatAverage(average);
}

async function syncExistingReview() {
  const reviewerId = Number(document.getElementById("reviewReviewerId")?.value);
  const sandwichId = Number(document.getElementById("reviewSandwichId")?.value);
  const ratingInput = document.getElementById("reviewRating");

  renderExistingReviews();

  if (!reviewerId || !sandwichId || !ratingInput) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("review")
    .select("rating")
    .eq("reviewer_id", reviewerId)
    .eq("sandwich_id", sandwichId)
    .maybeSingle();

  if (error) {
    setLocalStatus("reviewStatus", error.message, "error");
    return;
  }

  ratingInput.value = data?.rating ? String(data.rating) : "5";
  setLocalStatus(
    "reviewStatus",
    data?.rating ? "Existing score loaded. Submitting will update it." : "No score yet for this reviewer and sandwich.",
    data?.rating ? "info" : "success"
  );
}