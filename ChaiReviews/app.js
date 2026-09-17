const SUPABASE_URL = "https://fupysqufnvblxyocqxey.supabase.co";
const SUPABASE_KEY = "sb_publishable_BdHgtwQxbguQOgkAc9gNqg_8uLcLA8e";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const appState = {
  session: null,
  isAdmin: false,
  manageBound: false,
  reviewBound: false
};

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

  bindAuthControls();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  await applySession(data.session);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleAuthChange(session).catch((authError) => {
        renderGlobalStatus(authError.message || "Could not update sign-in state.", "error");
      });
    }, 0);
  });

  if (page === "austin") {
    await initializeAustinPage();
    return;
  }

  if (page === "average") {
    await initializeAveragePage();
    return;
  }

  if (page === "manage") {
    if (appState.isAdmin) {
      await initializeManagePage();
    }
    return;
  }

  if (page === "review") {
    await initializeReviewPage();
  }
}

async function handleAuthChange(session) {
  await applySession(session);

  if (document.body.dataset.page === "manage" && appState.isAdmin) {
    await initializeManagePage();
  }
}

async function applySession(session) {
  appState.session = session;
  appState.isAdmin = false;

  if (session) {
    const { data, error } = await supabaseClient.rpc("is_portfolio_admin");
    if (error) {
      throw new Error(error.message);
    }
    appState.isAdmin = data === true;
  }

  renderAuthState();
  renderReviewAccess();
}

function bindAuthControls() {
  const loginForm = document.getElementById("loginForm");
  const signOutButton = document.getElementById("signOutButton");

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.namedItem("email").value.trim();
    setLocalStatus("authStatus", "Sending sign-in link...", "info");

    const redirectUrl = new URL(window.location.href);
    redirectUrl.hash = "";
    redirectUrl.search = "";

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl.toString() }
    });

    if (error) {
      setLocalStatus("authStatus", error.message, "error");
      return;
    }

    form.reset();
    setLocalStatus("authStatus", "Sign-in link sent. Check your email.", "success");
  });

  signOutButton?.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setLocalStatus("authStatus", error.message, "error");
    }
  });
}

function renderAuthState() {
  const signedOutView = document.getElementById("signedOutView");
  const signedInView = document.getElementById("signedInView");
  const signedInEmail = document.getElementById("signedInEmail");
  const adminOnly = document.getElementById("adminOnly");

  if (signedOutView) {
    signedOutView.hidden = Boolean(appState.session);
  }
  if (signedInView) {
    signedInView.hidden = !appState.session;
  }
  if (signedInEmail) {
    signedInEmail.textContent = appState.session?.user?.email || "authenticated account";
  }
  if (adminOnly) {
    adminOnly.hidden = !appState.isAdmin;
  }

  if (appState.session && !appState.isAdmin) {
    setLocalStatus("authStatus", "This account is signed in but is not a portfolio administrator.", "error");
  } else if (appState.session && appState.isAdmin) {
    setLocalStatus("authStatus", "Administrator access enabled.", "success");
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatRating(numeric, 3) : "No reviews";
}

function formatRating(value, maxDecimals = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }
  return Number(numeric.toFixed(maxDecimals)).toString();
}

function averageFromRatings(ratings) {
  if (!ratings.length) {
    return null;
  }
  const total = ratings.reduce((sum, value) => sum + Number(value), 0);
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

async function initializeAveragePage() {
  const tableBody = document.getElementById("averageTableBody");
  tableBody.innerHTML = `<tr><td colspan="6" class="loading-cell">Loading chai ratings...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("chai_item")
    .select("chai_id, name, iced, shop:shop_id(name, state, country), chai_review(rating)")
    .order("chai_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = data
    .map((item) => {
      const ratings = Array.isArray(item.chai_review) ? item.chai_review.map((entry) => entry.rating) : [];
      return {
        chaiId: item.chai_id,
        name: item.name,
        iced: item.iced,
        shopName: item.shop?.name || "Unknown",
        location: [item.shop?.state, item.shop?.country].filter(Boolean).join(", "),
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

  renderAverageSummary(rows);
  tableBody.innerHTML = rows
    .map((row) => `
      <tr>
        <td>${row.chaiId}</td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.shopName)}</td>
        <td>${escapeHtml(row.location)}</td>
        <td>${row.iced ? "Iced" : "Hot"}</td>
        <td>
          <strong>${formatAverage(row.average)}</strong>
          <span class="sub-value">${row.reviewCount} review${row.reviewCount === 1 ? "" : "s"}</span>
        </td>
      </tr>
    `)
    .join("");
}

function renderAverageSummary(rows) {
  const totalChai = rows.length;
  const totalReviews = rows.reduce((sum, row) => sum + row.reviewCount, 0);
  const weightedTotal = rows.reduce((sum, row) => sum + ((row.average || 0) * row.reviewCount), 0);
  const ratedRows = rows.filter((row) => row.average !== null);
  const topChai = ratedRows[0];

  document.getElementById("averageChaiCount").textContent = String(totalChai);
  document.getElementById("averageReviewCount").textContent = String(totalReviews);
  document.getElementById("averageRating").textContent = totalReviews ? formatAverage(weightedTotal / totalReviews) : "No reviews";
  document.getElementById("averageLeader").textContent = topChai ? `${topChai.name} (${formatAverage(topChai.average)})` : "No reviews yet";
}

async function initializeAustinPage() {
  const tableBody = document.getElementById("austinTableBody");
  tableBody.innerHTML = `<tr><td colspan="5" class="loading-cell">Loading Delaine Pico's chai reviews...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("chai_review_row_details")
    .select("chai_id, chai_name, shop_name, shop_state, shop_country, rating, iced, reviewer_name")
    .eq("reviewer_name", "Delaine Pico")
    .order("rating", { ascending: false })
    .order("chai_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const averageRating = data.length ? data.reduce((sum, row) => sum + Number(row.rating), 0) / data.length : null;
  const favorite = data[0];
  const icedCount = data.filter((row) => row.iced).length;

  document.getElementById("austinReviewCount").textContent = String(data.length);
  document.getElementById("austinAverage").textContent = formatAverage(averageRating);
  document.getElementById("austinIcedCount").textContent = String(icedCount);
  document.getElementById("austinFavorite").textContent = favorite ? `${favorite.chai_name} (${formatRating(favorite.rating)}/10)` : "No reviews yet";

  tableBody.innerHTML = data.length
    ? data
        .map((row) => `
          <tr>
            <td>${escapeHtml(row.chai_name)}</td>
            <td>${escapeHtml(row.shop_name)}</td>
            <td>${escapeHtml([row.shop_state, row.shop_country].filter(Boolean).join(", "))}</td>
            <td>${row.iced ? "Iced" : "Hot"}</td>
            <td><strong>${formatRating(row.rating)}/10</strong></td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="5" class="loading-cell">Delaine Pico has not reviewed any chai items yet.</td></tr>`;
}

async function initializeManagePage() {
  if (!appState.manageBound) {
    bindManageForms();
    appState.manageBound = true;
  }
  await refreshManageCollections();
}

function bindManageForms() {
  document.getElementById("shopForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      state: form.state.value.trim(),
      country: form.country.value.trim()
    };

    await submitManagedInsert({
      table: "chai_shop",
      payload,
      statusId: "shopStatus",
      successMessage: `Added chai shop ${payload.name}.`,
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
      table: "chai_reviewer",
      payload,
      statusId: "reviewerStatus",
      successMessage: `Added reviewer ${payload.first_name} ${payload.last_name}.`,
      form
    });
  });

  document.getElementById("chaiForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      name: form.name.value.trim(),
      iced: form.iced.checked,
      shop_id: Number(form.shopId.value)
    };

    await submitManagedInsert({
      table: "chai_item",
      payload,
      statusId: "chaiStatus",
      successMessage: `Added chai item ${payload.name}.`,
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
  const [shopsResult, reviewersResult, chaiResult] = await Promise.all([
    supabaseClient.from("chai_shop").select("shop_id, name, state, country").order("name", { ascending: true }),
    supabaseClient.from("chai_reviewer").select("reviewer_id, first_name, last_name").order("first_name", { ascending: true }),
    supabaseClient.from("chai_item").select("chai_id, name, iced, shop:shop_id(name)").order("name", { ascending: true })
  ]);

  const firstError = [shopsResult.error, reviewersResult.error, chaiResult.error].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  renderShopOptions(shopsResult.data);
  renderManageLists(shopsResult.data, reviewersResult.data, chaiResult.data);
}

function renderShopOptions(shops) {
  const select = document.getElementById("chaiShopId");
  select.innerHTML = shops
    .map((shop) => `<option value="${shop.shop_id}">${escapeHtml(shop.name)} (${escapeHtml(shop.state)}, ${escapeHtml(shop.country)})</option>`)
    .join("");
}

function renderManageLists(shops, reviewers, chaiItems) {
  document.getElementById("shopList").innerHTML = shops
    .map((shop) => `<li>${escapeHtml(shop.name)} <span>${escapeHtml(shop.state)}, ${escapeHtml(shop.country)}</span></li>`)
    .join("");

  document.getElementById("reviewerList").innerHTML = reviewers
    .map((reviewer) => `<li>${escapeHtml(reviewer.first_name)} ${escapeHtml(reviewer.last_name)}</li>`)
    .join("");

  document.getElementById("chaiList").innerHTML = chaiItems
    .map((chaiItem) => `<li>${escapeHtml(chaiItem.name)} <span>${escapeHtml(chaiItem.shop?.name || "Unknown")} · ${chaiItem.iced ? "Iced" : "Hot"}</span></li>`)
    .join("");
}

async function initializeReviewPage() {
  if (!appState.reviewBound) {
    bindReviewForm();
    appState.reviewBound = true;
  }
  await refreshReviewPageData();
}

let reviewPageRows = [];
let reviewPageReviewers = [];

function bindReviewForm() {
  const reviewerSelect = document.getElementById("reviewReviewerId");
  const chaiSelect = document.getElementById("reviewChaiId");
  const ratingInput = document.getElementById("reviewRating");

  reviewerSelect.addEventListener("change", syncExistingReview);
  chaiSelect.addEventListener("change", syncExistingReview);

  document.getElementById("publicReviewerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setLocalStatus("publicReviewerStatus", "Adding reviewer...", "info");
    const { data, error } = await supabaseClient.rpc("create_public_chai_reviewer", {
      p_first_name: form.firstName.value.trim(),
      p_last_name: form.lastName.value.trim()
    });

    if (error) {
      setLocalStatus("publicReviewerStatus", error.message, "error");
      return;
    }

    form.reset();
    await refreshReviewPageData();
    reviewerSelect.value = String(data);
    await syncExistingReview();
    setLocalStatus("publicReviewerStatus", "Reviewer added and selected.", "success");
  });

  document.getElementById("reviewForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewerId = Number(reviewerSelect.value);
    const chaiId = Number(chaiSelect.value);
    const rating = Number(ratingInput.value);

    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      setLocalStatus("reviewStatus", "Rating must be a number between 1 and 10 (up to 3 decimals).", "error");
      return;
    }

    const normalizedRating = Math.round(rating * 1000) / 1000;

    if (selectedReviewerIsProtected() && !appState.isAdmin) {
      setLocalStatus("reviewStatus", "Administrator sign-in is required to edit Delaine Pico reviews.", "error");
      return;
    }

    setLocalStatus("reviewStatus", "Saving review...", "info");
    const { error } = await supabaseClient.rpc("save_chai_review", {
      p_chai_id: chaiId,
      p_reviewer_id: reviewerId,
      p_rating: normalizedRating
    });

    if (error) {
      setLocalStatus("reviewStatus", error.message, "error");
      return;
    }

    setLocalStatus("reviewStatus", "Review saved.", "success");
    await refreshReviewPageData();
    reviewerSelect.value = String(reviewerId);
    chaiSelect.value = String(chaiId);
    ratingInput.value = formatRating(normalizedRating);
  });
}

async function refreshReviewPageData() {
  const [reviewersResult, chaiResult, reviewsResult] = await Promise.all([
    supabaseClient.from("chai_reviewer").select("reviewer_id, first_name, last_name").order("first_name", { ascending: true }),
    supabaseClient.from("chai_item").select("chai_id, name, iced, shop:shop_id(name)").order("name", { ascending: true }),
    supabaseClient.from("chai_review_row_details").select("chai_id, reviewer_id, chai_name, shop_name, reviewer_name, rating, iced").order("chai_name", { ascending: true })
  ]);

  const firstError = [reviewersResult.error, chaiResult.error, reviewsResult.error].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }

  reviewPageRows = reviewsResult.data;
  reviewPageReviewers = reviewersResult.data;
  renderReviewerOptions(reviewersResult.data, "reviewReviewerId");
  renderChaiOptions(chaiResult.data, "reviewChaiId");
  renderExistingReviews();
  renderReviewSummary(reviewsResult.data, reviewersResult.data, chaiResult.data);
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

function selectedReviewerIsProtected() {
  const reviewerId = Number(document.getElementById("reviewReviewerId")?.value);
  const reviewer = reviewPageReviewers.find((candidate) => candidate.reviewer_id === reviewerId);
  return reviewer
    ? `${reviewer.first_name.trim()} ${reviewer.last_name.trim()}`.toLowerCase() === "delaine pico"
    : false;
}

function renderReviewAccess() {
  const saveButton = document.getElementById("saveReviewButton");
  if (!saveButton) {
    return;
  }

  const requiresAdmin = selectedReviewerIsProtected() && !appState.isAdmin;
  saveButton.disabled = requiresAdmin;
  setLocalStatus(
    "reviewAccessStatus",
    requiresAdmin ? "Administrator sign-in is required to edit Delaine Pico reviews." : "",
    requiresAdmin ? "info" : "success"
  );
}

function renderChaiOptions(chaiItems, selectId) {
  const select = document.getElementById(selectId);
  const currentValue = select.value;
  select.innerHTML = chaiItems
    .map((item) => `<option value="${item.chai_id}">${escapeHtml(item.name)} (${escapeHtml(item.shop?.name || "Unknown")} · ${item.iced ? "Iced" : "Hot"})</option>`)
    .join("");

  if (currentValue && chaiItems.some((item) => String(item.chai_id) === currentValue)) {
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
            <td>${escapeHtml(review.chai_name)}</td>
            <td>${escapeHtml(review.shop_name)}</td>
            <td>${review.iced ? "Iced" : "Hot"}</td>
            <td>${escapeHtml(review.reviewer_name)}</td>
            <td><strong>${formatRating(review.rating)}/10</strong></td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="5" class="loading-cell">No reviews yet for this reviewer.</td></tr>`;
}

function renderReviewSummary(reviews, reviewers, chaiItems) {
  const average = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : null;
  document.getElementById("reviewCoverage").textContent = `${reviews.length} saved review${reviews.length === 1 ? "" : "s"}`;
  document.getElementById("reviewReviewerCount").textContent = `${reviewers.length} reviewer${reviewers.length === 1 ? "" : "s"}`;
  document.getElementById("reviewChaiCount").textContent = `${chaiItems.length} chai item${chaiItems.length === 1 ? "" : "s"}`;
  document.getElementById("reviewAverage").textContent = formatAverage(average);
}

async function syncExistingReview() {
  const reviewerId = Number(document.getElementById("reviewReviewerId")?.value);
  const chaiId = Number(document.getElementById("reviewChaiId")?.value);
  const ratingInput = document.getElementById("reviewRating");

  renderExistingReviews();
  renderReviewAccess();

  if (!reviewerId || !chaiId || !ratingInput) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("chai_review")
    .select("rating")
    .eq("reviewer_id", reviewerId)
    .eq("chai_id", chaiId)
    .maybeSingle();

  if (error) {
    setLocalStatus("reviewStatus", error.message, "error");
    return;
  }

  ratingInput.value = data?.rating ? formatRating(data.rating) : "7";
  setLocalStatus(
    "reviewStatus",
    data?.rating ? "Existing score loaded. Submitting will update it." : "No score yet for this reviewer and chai.",
    data?.rating ? "info" : "success"
  );
}
