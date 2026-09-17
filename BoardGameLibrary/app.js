const SUPABASE_URL = "https://fupysqufnvblxyocqxey.supabase.co";
const SUPABASE_KEY = "sb_publishable_BdHgtwQxbguQOgkAc9gNqg_8uLcLA8e";
const BGG_COLLECTION_CSV_URL = "https://boardgamegeek.com/geekcollection.php";
const BGG_COLLECTION_XML_URL = "https://boardgamegeek.com/xmlapi2/collection";

const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const gameState = {
  games: [],
  players: [],
  fields: [],
  plays: [],
  participants: [],
  session: null,
  isAdmin: false,
  manageBound: false,
  playBound: false,
  rankingSortable: null,
  rankingSaving: false
};

document.addEventListener("DOMContentLoaded", () => {
  initializeBoardGames().catch((error) => {
    setGlobalStatus(error.message || "Unexpected error.", "error");
  });
});

async function initializeBoardGames() {
  const page = document.body.dataset.page;
  highlightCurrentNav(page);

  if (!supabaseClient) {
    setGlobalStatus("Supabase failed to load. Check your connection and try again.", "error");
    return;
  }

  bindAuthControls();
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  await applySession(data.session);

  if (page === "collection") {
    document.getElementById("gameSearch").addEventListener("input", renderCollection);
    bindGameDialog();
    await loadCollectionData();
    renderCollectionPage();
  } else if (page === "ranking") {
    await loadGameRankingPage();
    renderGameRankingPage();
  } else if (page === "plays") {
    bindPlayControls();
    await loadPlayPageData();
    renderPlayPage();
  } else if (page === "players") {
    await loadPlayerStatsPage();
  } else if (page === "manage") {
    bindManageControls();
    if (gameState.isAdmin) {
      await refreshManagePage();
    }
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleAuthChange(session).catch((authError) => {
        setGlobalStatus(authError.message || "Could not update sign-in state.", "error");
      });
    }, 0);
  });
}

async function handleAuthChange(session) {
  await applySession(session);

  if (document.body.dataset.page === "manage" && gameState.isAdmin) {
    await refreshManagePage();
  }

  if (document.body.dataset.page === "plays") {
    renderPlayAccess();
    renderPlayHistory();
  }

  if (document.body.dataset.page === "ranking") {
    renderGameRankingPage();
  }
}

async function applySession(session) {
  gameState.session = session;
  gameState.isAdmin = false;

  if (session) {
    const { data, error } = await supabaseClient.rpc("is_portfolio_admin");
    if (error) {
      throw new Error(error.message);
    }
    gameState.isAdmin = data === true;
  }

  renderAuthState();
  renderPlayAccess();
}

function highlightCurrentNav(page) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.nav === page);
  });
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
    signedOutView.hidden = Boolean(gameState.session);
  }
  if (signedInView) {
    signedInView.hidden = !gameState.session;
  }
  if (signedInEmail) {
    signedInEmail.textContent = gameState.session?.user?.email || "authenticated account";
  }
  if (adminOnly) {
    adminOnly.hidden = !gameState.isAdmin;
  }

  if (gameState.session && !gameState.isAdmin) {
    setLocalStatus("authStatus", "This account is signed in but is not a portfolio administrator.", "error");
  } else if (gameState.session && gameState.isAdmin) {
    setLocalStatus("authStatus", "Administrator access enabled.", "success");
  }
}

function renderPlayAccess() {
  const adminOnly = document.getElementById("playAdminOnly");
  const context = document.getElementById("playAdminContext");
  if (adminOnly) {
    adminOnly.hidden = !gameState.isAdmin;
  }
  if (context) {
    context.textContent = gameState.isAdmin ? "Recording enabled" : "Public view";
    context.classList.toggle("is-admin", gameState.isAdmin);
  }
}

async function loadCollectionData() {
  const [gamesResult, playsResult] = await Promise.all([
    supabaseClient.from("board_games").select("*").order("name", { ascending: true }),
    supabaseClient
      .from("board_game_plays")
      .select("play_id, game_id, played_at, game:game_id(name)")
      .order("played_at", { ascending: false })
  ]);

  throwFirstError(gamesResult, playsResult);
  gameState.games = gamesResult.data || [];
  gameState.plays = playsResult.data || [];
}

function renderCollectionPage() {
  const ownedGames = gameState.games.filter((game) => game.owned);
  const playCounts = new Map();
  gameState.plays.forEach((play) => {
    playCounts.set(play.game_id, (playCounts.get(play.game_id) || 0) + 1);
  });

  const mostPlayed = [...ownedGames].sort((left, right) => {
    const countDifference = (playCounts.get(right.game_id) || 0) - (playCounts.get(left.game_id) || 0);
    return countDifference || left.name.localeCompare(right.name);
  })[0];
  const mostPlayedCount = mostPlayed ? playCounts.get(mostPlayed.game_id) || 0 : 0;
  const lastPlay = gameState.plays[0];

  setText("ownedGameCount", ownedGames.length);
  setText("totalPlayCount", gameState.plays.length);
  setText(
    "mostPlayedGame",
    mostPlayedCount ? `${mostPlayed.name} (${mostPlayedCount})` : "No plays yet"
  );
  setText("lastPlayedGame", lastPlay?.game?.name || "No plays yet");
  renderCollection();
}

function renderCollection() {
  const search = document.getElementById("gameSearch").value.trim().toLowerCase();
  const games = gameState.games.filter((game) => {
    if (!search) {
      return true;
    }
    return [
      game.name,
      ...(game.categories || []),
      ...(game.mechanisms || []),
      ...(game.designers || [])
    ].filter(Boolean).join(" ").toLowerCase().includes(search);
  });

  setText("collectionCount", `${games.length} game${games.length === 1 ? "" : "s"}`);
  const grid = document.getElementById("gameGrid");
  grid.replaceChildren();

  if (!games.length) {
    grid.append(createMessage("No games match this search."));
    return;
  }

  const fragment = document.createDocumentFragment();
  games.forEach((game) => fragment.append(createGameCard(game)));
  grid.append(fragment);
}

async function loadGameRankingPage() {
  const { data, error } = await supabaseClient
    .from("board_games")
    .select("*")
    .eq("owned", true);

  if (error) {
    throw new Error(error.message);
  }
  gameState.games = data || [];
}

function getRankedGames() {
  return gameState.games
    .filter((game) => game.owned && Number.isFinite(Number(game.rank_position)))
    .sort((left, right) => Number(left.rank_position) - Number(right.rank_position));
}

function renderGameRankingPage() {
  gameState.rankingSortable?.destroy();
  gameState.rankingSortable = null;

  const rankedGames = getRankedGames();
  setText("rankingCount", `${rankedGames.length} owned game${rankedGames.length === 1 ? "" : "s"}`);

  const context = document.getElementById("rankingAdminContext");
  context.textContent = gameState.rankingSaving
    ? "Saving order..."
    : gameState.isAdmin ? "Editing enabled" : "Public view";
  context.classList.toggle("is-admin", gameState.isAdmin);

  const list = document.getElementById("rankingList");
  list.replaceChildren();
  if (!rankedGames.length) {
    list.append(createMessage("No owned games are ranked yet."));
    return;
  }

  const fragment = document.createDocumentFragment();
  rankedGames.forEach((game, index) => {
    const row = createElement("li", "ranking-row");
    row.dataset.gameId = game.game_id;
    row.append(createRankPosition(index, game));
    row.append(createGameImage(game, "rank-game-image", "rank-game-image-fallback"));

    const details = createElement("div", "rank-game");
    details.append(createElement("h3", "", game.name));
    const contextText = [
      game.categories?.[0],
      game.year_published,
      formatPlayerRange(game)
    ].filter(Boolean).join(" | ");
    if (contextText) {
      details.append(createElement("p", "", contextText));
    }
    if (index === 0) {
      details.append(createElement("span", "favorite-label", "Current favorite"));
    }
    row.append(details);

    if (gameState.isAdmin) {
      row.append(createGameRankControls(game, index, rankedGames.length));
    }
    fragment.append(row);
  });
  list.append(fragment);
  initializeGameRankingDrag();
}

function createRankPosition(index, game) {
  const position = createElement("div", "rank-position");
  position.append(createElement("strong", "rank-number", index + 1));

  if (gameState.isAdmin) {
    const handle = createElement("button", "rank-drag-handle", "\u2195");
    handle.type = "button";
    handle.disabled = gameState.rankingSaving;
    handle.title = `Drag ${game.name} to a new rank`;
    handle.setAttribute("aria-label", handle.title);
    position.append(handle);
  }
  return position;
}

function createGameRankControls(game, index, total) {
  const controls = createElement("div", "rank-controls");
  const stepControls = createElement("div", "rank-step-controls");
  const upButton = createElement("button", "rank-button", "\u2191");
  const downButton = createElement("button", "rank-button", "\u2193");

  upButton.type = "button";
  downButton.type = "button";
  upButton.disabled = gameState.rankingSaving || index === 0;
  downButton.disabled = gameState.rankingSaving || index === total - 1;
  upButton.title = `Move ${game.name} up`;
  downButton.title = `Move ${game.name} down`;
  upButton.setAttribute("aria-label", upButton.title);
  downButton.setAttribute("aria-label", downButton.title);
  upButton.addEventListener("click", () => setRankedGamePosition(game.game_id, index));
  downButton.addEventListener("click", () => setRankedGamePosition(game.game_id, index + 2));
  stepControls.append(upButton, downButton);

  const rankForm = createElement("form", "rank-jump-form");
  const rankLabel = createElement("label", "rank-jump-label", "Rank");
  const rankInput = createElement("input", "rank-jump-input");
  rankInput.type = "number";
  rankInput.inputMode = "numeric";
  rankInput.min = "1";
  rankInput.max = String(total);
  rankInput.value = String(index + 1);
  rankInput.disabled = gameState.rankingSaving;
  rankInput.setAttribute("aria-label", `New rank for ${game.name}`);
  rankInput.addEventListener("focus", () => rankInput.select());
  rankLabel.append(rankInput);

  const rankSubmit = createElement("button", "rank-jump-button", "Go");
  rankSubmit.type = "submit";
  rankSubmit.disabled = gameState.rankingSaving;
  rankSubmit.setAttribute("aria-label", `Move ${game.name} to entered rank`);
  rankForm.addEventListener("submit", (event) => {
    event.preventDefault();
    setRankedGamePosition(game.game_id, Number(rankInput.value));
  });
  rankForm.append(rankLabel, rankSubmit);

  controls.append(stepControls, rankForm);
  return controls;
}

function initializeGameRankingDrag() {
  if (!gameState.isAdmin || gameState.rankingSaving || !window.Sortable) {
    return;
  }

  gameState.rankingSortable = window.Sortable.create(document.getElementById("rankingList"), {
    animation: 150,
    handle: ".rank-drag-handle",
    draggable: ".ranking-row",
    ghostClass: "is-dragging",
    chosenClass: "is-drag-chosen",
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 3,
    swapThreshold: 0.65,
    onEnd(event) {
      if (event.oldIndex === event.newIndex) {
        return;
      }
      const gameId = event.item.dataset.gameId;
      window.setTimeout(() => setRankedGamePosition(gameId, event.newIndex + 1), 0);
    }
  });
}

async function setRankedGamePosition(gameId, requestedPosition) {
  if (gameState.rankingSaving) {
    return;
  }

  const rankedGames = getRankedGames();
  const currentIndex = rankedGames.findIndex((game) => game.game_id === gameId);
  const numericPosition = Math.trunc(Number(requestedPosition));
  if (currentIndex < 0 || !Number.isFinite(numericPosition)) {
    renderGameRankingPage();
    return;
  }

  const targetIndex = Math.min(Math.max(numericPosition - 1, 0), rankedGames.length - 1);
  if (currentIndex === targetIndex) {
    renderGameRankingPage();
    return;
  }

  const previousRanks = new Map(rankedGames.map((game) => [game.game_id, game.rank_position]));
  const [movedGame] = rankedGames.splice(currentIndex, 1);
  rankedGames.splice(targetIndex, 0, movedGame);
  rankedGames.forEach((game, index) => {
    game.rank_position = index + 1;
  });

  gameState.rankingSaving = true;
  renderGameRankingPage();
  setGlobalStatus(`Moving ${movedGame.name} to rank ${targetIndex + 1}...`, "info");

  const { error } = await supabaseClient.rpc("set_board_game_rank", {
    p_game_id: gameId,
    p_target_position: targetIndex + 1
  });

  if (error) {
    rankedGames.forEach((game) => {
      game.rank_position = previousRanks.get(game.game_id);
    });
    gameState.rankingSaving = false;
    renderGameRankingPage();
    setGlobalStatus(error.message, "error");
    return;
  }

  gameState.rankingSaving = false;
  renderGameRankingPage();
  hideGlobalStatus();
}

function createGameCard(game) {
  const card = createElement("article", "game-card");
  card.append(createGameImage(game, "game-image", "game-image-fallback"));

  const content = createElement("div", "game-content");
  const title = createElement("h3", "", game.name);
  const detailsButton = createElement("button", "game-detail-trigger", game.name);
  detailsButton.type = "button";
  detailsButton.setAttribute("aria-label", `View ${game.name} history and statistics`);
  detailsButton.addEventListener("click", () => openGameDialog(game));
  title.replaceChildren(detailsButton);
  content.append(title);
  content.append(createElement(
    "p",
    "game-designers",
    game.designers?.length ? game.designers.join(", ") : "Designer not listed"
  ));

  const facts = createElement("div", "game-facts");
  facts.append(createElement("span", "fact", formatPlayerRange(game)));
  facts.append(createElement("span", "fact", game.playing_time_minutes ? `${game.playing_time_minutes} min` : "Time not set"));
  facts.append(createElement("span", "fact", game.complexity_weight ? `Weight ${formatDecimal(game.complexity_weight)}` : "Weight not set"));
  content.append(facts);

  if (game.categories?.length) {
    const tags = createElement("div", "game-tags");
    game.categories.slice(0, 3).forEach((category) => {
      tags.append(createElement("span", "game-tag", category));
    });
    content.append(tags);
  }

  card.append(content);
  return card;
}

function bindGameDialog() {
  const dialog = document.getElementById("gameDialog");
  document.getElementById("closeGameDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
}

async function openGameDialog(game) {
  setText("gameDialogTitle", game.name);
  const body = document.getElementById("gameDialogBody");
  body.replaceChildren(createMessage("Loading game history..."));
  const dialog = document.getElementById("gameDialog");
  dialog.dataset.gameId = game.game_id;
  dialog.showModal();

  const [playsResult, fieldsResult] = await Promise.all([
    fetchPlays(game.game_id, null),
    supabaseClient
      .from("board_game_field_definitions")
      .select("*")
      .eq("game_id", game.game_id)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true })
  ]);

  if (!dialog.open || dialog.dataset.gameId !== game.game_id) {
    return;
  }
  try {
    throwFirstError(playsResult, fieldsResult);
    renderGameDialog(game, playsResult.data || [], fieldsResult.data || []);
  } catch (error) {
    body.replaceChildren(createMessage(error.message || "Game history could not be loaded."));
  }
}

function renderGameDialog(game, plays, fields) {
  const body = document.getElementById("gameDialogBody");
  body.replaceChildren();
  const playerStats = summarizeGamePlayers(plays);
  const champion = playerStats.find((player) => player.wins > 0);
  const scores = playerStats.flatMap((player) => player.scores);

  const overview = createElement("div", "game-dialog-overview");
  overview.append(createGameImage(game, "dialog-game-image", "dialog-game-image-fallback"));
  const overviewText = createElement("div", "game-dialog-copy");
  if (game.description) {
    overviewText.append(createElement("p", "game-dialog-description", game.description));
  }
  const metadata = [
    game.year_published,
    formatPlayerRange(game),
    game.playing_time_minutes ? `${game.playing_time_minutes} minutes` : null,
    game.complexity_weight ? `Weight ${formatDecimal(game.complexity_weight)}` : null
  ].filter(Boolean);
  overviewText.append(createElement("p", "game-dialog-metadata", metadata.join(" | ")));
  if (game.bgg_id) {
    const sourceLink = createElement("a", "game-source-link", "View on BoardGameGeek");
    sourceLink.href = `https://boardgamegeek.com/boardgame/${game.bgg_id}`;
    sourceLink.target = "_blank";
    sourceLink.rel = "noopener noreferrer";
    overviewText.append(sourceLink);
  }
  overview.append(overviewText);
  body.append(overview);

  const summary = createElement("section", "game-dialog-section");
  summary.append(createElement("h3", "", "At a glance"));
  const metrics = createElement("div", "game-dialog-metrics");
  metrics.append(createDialogMetric(plays.length, "Recorded plays"));
  metrics.append(createDialogMetric(playerStats.length, "Players"));
  metrics.append(createDialogMetric(
    champion ? champion.name : "No winner yet",
    champion ? `${champion.wins} ${champion.wins === 1 ? "win" : "wins"}, current champion` : "Current champion"
  ));
  metrics.append(createDialogMetric(
    scores.length ? formatDecimal(average(scores)) : "Not recorded",
    scores.length ? `Average points from ${scores.length} scores` : "Average points"
  ));
  summary.append(metrics);
  body.append(summary);

  const strategySummaries = summarizeCustomFields(plays, fields.filter(isStrategyField));
  if (strategySummaries.length) {
    body.append(createCustomSummarySection("Common strategies", strategySummaries));
  }

  const customSummaries = summarizeCustomFields(plays, fields.filter((field) => !isStrategyField(field)));
  if (customSummaries.length) {
    body.append(createCustomSummarySection("Recorded fields", customSummaries));
  }

  const peopleSection = createElement("section", "game-dialog-section");
  peopleSection.append(createElement("h3", "", "People who have played"));
  if (!playerStats.length) {
    peopleSection.append(createMessage("No players have been recorded for this game."));
  } else {
    const peopleList = createElement("div", "game-player-list");
    playerStats.forEach((player) => {
      const row = createElement("div", "game-player-row");
      row.append(createElement("strong", "", player.name));
      const facts = [
        `${player.plays} ${player.plays === 1 ? "play" : "plays"}`,
        `${player.wins} ${player.wins === 1 ? "win" : "wins"}`,
        player.scores.length ? `${formatDecimal(average(player.scores))} avg points` : null
      ].filter(Boolean);
      row.append(createElement("span", "", facts.join(" | ")));
      peopleList.append(row);
    });
    peopleSection.append(peopleList);
  }
  body.append(peopleSection);

  const playsSection = createElement("section", "game-dialog-section");
  playsSection.append(createElement("h3", "", "Every recorded play"));
  if (!plays.length) {
    playsSection.append(createMessage("No plays have been recorded for this game."));
  } else {
    const playList = createElement("div", "dialog-play-list");
    plays.forEach((play) => playList.append(createDialogPlay(play, fields)));
    playsSection.append(playList);
  }
  body.append(playsSection);
}

function createDialogMetric(value, label) {
  const metric = createElement("div", "game-dialog-metric");
  metric.append(createElement("strong", "", value));
  metric.append(createElement("span", "", label));
  return metric;
}

function summarizeGamePlayers(plays) {
  const players = new Map();
  plays.forEach((play) => {
    (play.participants || []).forEach((participant) => {
      const playerId = participant.player_id;
      const summary = players.get(playerId) || {
        name: participant.player?.display_name || "Unknown player",
        plays: 0,
        wins: 0,
        scores: []
      };
      summary.plays += 1;
      summary.wins += participant.is_winner ? 1 : 0;
      if (participant.score !== null && participant.score !== undefined && Number.isFinite(Number(participant.score))) {
        summary.scores.push(Number(participant.score));
      }
      players.set(playerId, summary);
    });
  });

  return [...players.values()].sort((left, right) => (
    right.wins - left.wins
    || (right.wins / right.plays) - (left.wins / left.plays)
    || right.plays - left.plays
    || left.name.localeCompare(right.name)
  ));
}

function isStrategyField(field) {
  return ["text", "select"].includes(field.field_type)
    && /strateg|tactic|approach|build/i.test(`${field.field_key} ${field.label}`);
}

function summarizeCustomFields(plays, fields) {
  return fields.map((field) => {
    const values = [];
    plays.forEach((play) => {
      if (field.scope === "play") {
        values.push(play.custom_values?.[field.field_key]);
      } else {
        (play.participants || []).forEach((participant) => {
          values.push(participant.custom_values?.[field.field_key]);
        });
      }
    });
    const recordedValues = values.filter((value) => value !== null && value !== undefined && value !== "");
    if (!recordedValues.length) {
      return null;
    }

    let summary;
    if (field.field_type === "number") {
      const numbers = recordedValues.map(Number).filter(Number.isFinite);
      summary = numbers.length ? `${formatDecimal(average(numbers))}${field.unit ? ` ${field.unit}` : ""} average` : "";
    } else if (field.field_type === "boolean") {
      const trueCount = recordedValues.filter((value) => value === true).length;
      summary = `${trueCount} yes (${formatDecimal(100 * trueCount / recordedValues.length)}%)`;
    } else {
      const counts = new Map();
      recordedValues.forEach((value) => {
        const label = String(value).trim();
        if (label) {
          counts.set(label, (counts.get(label) || 0) + 1);
        }
      });
      summary = [...counts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 4)
        .map(([value, count]) => `${value} (${count})`)
        .join(", ");
    }
    return summary ? { label: field.label, summary, count: recordedValues.length } : null;
  }).filter(Boolean);
}

function createCustomSummarySection(title, summaries) {
  const section = createElement("section", "game-dialog-section");
  section.append(createElement("h3", "", title));
  const grid = createElement("div", "game-field-summary-grid");
  summaries.forEach((item) => {
    const summary = createElement("div", "game-field-summary");
    summary.append(createElement("strong", "", item.label));
    summary.append(createElement("span", "", item.summary));
    summary.append(createElement("small", "", `${item.count} recorded ${item.count === 1 ? "value" : "values"}`));
    grid.append(summary);
  });
  section.append(grid);
  return section;
}

function createDialogPlay(play, fields) {
  const row = createElement("article", "dialog-play");
  const heading = createElement("div", "dialog-play-heading");
  const context = [formatDateTime(play.played_at), play.location, play.duration_minutes ? `${play.duration_minutes} minutes` : null]
    .filter(Boolean)
    .join(" | ");
  heading.append(createElement("strong", "", context));
  const playDetails = formatCustomValues(play.custom_values, fields.filter((field) => field.scope === "play"));
  if (playDetails.length) {
    heading.append(createElement("span", "", playDetails.join(" | ")));
  }
  row.append(heading);

  const playerList = createElement("div", "dialog-play-players");
  [...(play.participants || [])]
    .sort((left, right) => left.seat_order - right.seat_order)
    .forEach((participant) => {
      const line = createElement("p");
      line.append(createElement("strong", "", participant.player?.display_name || "Unknown player"));
      const facts = [
        participant.score !== null && participant.score !== undefined ? `${formatDecimal(participant.score)} points` : null,
        participant.result,
        participant.team ? `Team ${participant.team}` : null,
        ...formatCustomValues(participant.custom_values, fields.filter((field) => field.scope === "player"))
      ].filter(Boolean);
      if (facts.length) {
        line.append(document.createTextNode(` | ${facts.join(" | ")}`));
      }
      if (participant.is_winner) {
        line.append(createElement("span", "winner-tag", "Winner"));
      }
      playerList.append(line);
    });
  row.append(playerList);
  if (play.notes) {
    row.append(createElement("p", "dialog-play-notes", play.notes));
  }
  return row;
}

function average(values) {
  return values.reduce((total, value) => total + Number(value), 0) / values.length;
}

function bindPlayControls() {
  if (gameState.playBound) {
    return;
  }
  gameState.playBound = true;

  document.getElementById("playForm").addEventListener("submit", savePlay);
  document.getElementById("playGameId").addEventListener("change", () => {
    gameState.participants.forEach((participant) => {
      participant.customValues = {};
    });
    renderPlayCustomFields();
    renderParticipants();
  });
  document.getElementById("addPlayerButton").addEventListener("click", addSelectedPlayer);
  setDefaultPlayedAt();
}

async function loadPlayPageData() {
  const [gamesResult, playersResult, fieldsResult, playsResult] = await Promise.all([
    supabaseClient.from("board_games").select("*").order("name", { ascending: true }),
    supabaseClient.from("board_game_players").select("*").order("display_name", { ascending: true }),
    supabaseClient
      .from("board_game_field_definitions")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    fetchPlays()
  ]);

  throwFirstError(gamesResult, playersResult, fieldsResult, playsResult);
  gameState.games = gamesResult.data || [];
  gameState.players = playersResult.data || [];
  gameState.fields = fieldsResult.data || [];
  gameState.plays = playsResult.data || [];
}

function fetchPlays(gameId = null, limit = 200) {
  let query = supabaseClient
    .from("board_game_plays")
    .select(`
      play_id,
      game_id,
      played_at,
      location,
      duration_minutes,
      notes,
      custom_values,
      game:game_id(name),
      participants:board_game_play_players(
        player_id,
        seat_order,
        score,
        is_winner,
        result,
        team,
        custom_values,
        player:player_id(display_name)
      )
    `)
    .order("played_at", { ascending: false });

  if (gameId) {
    query = query.eq("game_id", gameId);
  }
  return limit === null ? query : query.limit(limit);
}

function renderPlayPage() {
  renderGameSelect("playGameId");
  renderPlayerToAdd();
  renderPlayCustomFields();
  renderParticipants();
  renderPlayHistory();
  renderPlayAccess();
}

function renderGameSelect(selectId) {
  const select = document.getElementById(selectId);
  if (!select) {
    return;
  }

  const currentValue = select.value;
  select.replaceChildren();
  gameState.games.forEach((game) => {
    const option = createElement("option", "", game.name);
    option.value = game.game_id;
    select.append(option);
  });

  if (gameState.games.some((game) => game.game_id === currentValue)) {
    select.value = currentValue;
  }
}

function addSelectedPlayer() {
  const select = document.getElementById("playerToAdd");
  const playerId = select.value;
  if (!playerId || gameState.participants.some((participant) => participant.playerId === playerId)) {
    return;
  }

  gameState.participants.push({
    playerId,
    score: "",
    isWinner: false,
    result: "",
    team: "",
    customValues: {}
  });
  renderPlayerToAdd();
  renderParticipants();
}

function renderPlayerToAdd() {
  const select = document.getElementById("playerToAdd");
  if (!select) {
    return;
  }

  const selectedIds = new Set(gameState.participants.map((participant) => participant.playerId));
  const availablePlayers = gameState.players.filter((player) => player.active && !selectedIds.has(player.player_id));
  select.replaceChildren();

  if (!availablePlayers.length) {
    const option = createElement("option", "", "No players available");
    option.value = "";
    select.append(option);
    document.getElementById("addPlayerButton").disabled = true;
    return;
  }

  availablePlayers.forEach((player) => {
    const option = createElement("option", "", player.display_name);
    option.value = player.player_id;
    select.append(option);
  });
  document.getElementById("addPlayerButton").disabled = false;
}

function renderPlayCustomFields() {
  const container = document.getElementById("playCustomFields");
  if (!container) {
    return;
  }
  container.replaceChildren();

  getSelectedGameFields("play").forEach((definition) => {
    container.append(createCustomFieldControl(definition, undefined));
  });
}

function renderParticipants() {
  const container = document.getElementById("participantList");
  if (!container) {
    return;
  }
  container.replaceChildren();

  if (!gameState.participants.length) {
    container.append(createMessage("No players added to this play."));
    return;
  }

  const playerFields = getSelectedGameFields("player");
  gameState.participants.forEach((participant, index) => {
    const player = gameState.players.find((candidate) => candidate.player_id === participant.playerId);
    const row = createElement("article", "participant-row");
    const heading = createElement("div", "participant-heading");
    heading.append(createElement("h3", "", player?.display_name || "Unknown player"));

    const removeButton = createElement("button", "remove-player", "Remove");
    removeButton.type = "button";
    removeButton.addEventListener("click", () => {
      gameState.participants.splice(index, 1);
      renderPlayerToAdd();
      renderParticipants();
    });
    heading.append(removeButton);
    row.append(heading);

    const baseFields = createElement("div", "participant-fields");
    baseFields.append(createParticipantTextControl(participant, "score", "Score", "number"));
    baseFields.append(createWinnerControl(participant));
    baseFields.append(createParticipantTextControl(participant, "result", "Result", "text"));
    baseFields.append(createParticipantTextControl(participant, "team", "Team", "text"));
    row.append(baseFields);

    if (playerFields.length) {
      const customFields = createElement("div", "participant-custom-fields");
      playerFields.forEach((definition) => {
        customFields.append(createCustomFieldControl(
          definition,
          participant.customValues[definition.field_key],
          (value) => {
            if (value === undefined) {
              delete participant.customValues[definition.field_key];
            } else {
              participant.customValues[definition.field_key] = value;
            }
          }
        ));
      });
      row.append(customFields);
    }

    container.append(row);
  });
}

function createParticipantTextControl(participant, property, labelText, type) {
  const label = createElement("label", "", labelText);
  const input = createElement("input");
  input.type = type;
  if (type === "number") {
    input.step = "any";
  }
  input.value = participant[property];
  input.addEventListener("input", () => {
    participant[property] = input.value;
  });
  label.append(input);
  return label;
}

function createWinnerControl(participant) {
  const label = createElement("label", "winner-control");
  const input = createElement("input");
  input.type = "checkbox";
  input.checked = participant.isWinner;
  input.addEventListener("change", () => {
    participant.isWinner = input.checked;
  });
  label.append(input, document.createTextNode("Winner"));
  return label;
}

function createCustomFieldControl(definition, initialValue, onValueChange) {
  const displayLabel = definition.unit ? `${definition.label} (${definition.unit})` : definition.label;
  const isBoolean = definition.field_type === "boolean";
  const label = createElement("label", isBoolean ? "checkbox-label" : "", isBoolean ? "" : displayLabel);
  let control;

  if (definition.field_type === "select") {
    control = createElement("select");
    if (!definition.required) {
      const emptyOption = createElement("option", "", "Not recorded");
      emptyOption.value = "";
      control.append(emptyOption);
    }
    (definition.options || []).forEach((optionValue) => {
      const option = createElement("option", "", optionValue);
      option.value = optionValue;
      control.append(option);
    });
    control.value = initialValue ?? "";
  } else {
    control = createElement("input");
    control.type = isBoolean ? "checkbox" : definition.field_type;
    if (definition.field_type === "number") {
      control.step = "any";
    }
    if (isBoolean) {
      control.checked = initialValue === true;
    } else {
      control.value = initialValue ?? "";
    }
  }

  control.dataset.customKey = definition.field_key;
  control.dataset.customType = definition.field_type;
  if (definition.required && !isBoolean) {
    control.required = true;
  }

  if (onValueChange) {
    const update = () => onValueChange(readCustomControlValue(control));
    control.addEventListener(isBoolean ? "change" : "input", update);
    if (definition.field_type === "select") {
      control.addEventListener("change", update);
    }
  }

  if (isBoolean) {
    label.append(control, document.createTextNode(displayLabel));
  } else {
    label.append(control);
  }
  return label;
}

function getSelectedGameFields(scope) {
  const gameId = document.getElementById("playGameId")?.value;
  return gameState.fields.filter((field) => field.game_id === gameId && field.scope === scope);
}

async function savePlay(event) {
  event.preventDefault();
  if (!gameState.isAdmin) {
    setLocalStatus("playFormStatus", "Administrator access required.", "error");
    return;
  }
  if (!gameState.participants.length) {
    setLocalStatus("playFormStatus", "Add at least one player.", "error");
    return;
  }

  const form = event.currentTarget;
  const playedAtValue = formControl(form, "playedAt").value;
  const payload = {
    p_game_id: formControl(form, "gameId").value,
    p_played_at: playedAtValue ? new Date(playedAtValue).toISOString() : new Date().toISOString(),
    p_location: optionalText(formControl(form, "location").value),
    p_duration_minutes: optionalNumber(formControl(form, "durationMinutes").value),
    p_notes: optionalText(formControl(form, "notes").value),
    p_custom_values: collectCustomValues(document.getElementById("playCustomFields")),
    p_players: gameState.participants.map((participant, index) => ({
      player_id: participant.playerId,
      seat_order: index + 1,
      score: optionalNumber(participant.score),
      is_winner: participant.isWinner,
      result: optionalText(participant.result),
      team: optionalText(participant.team),
      custom_values: participant.customValues
    }))
  };

  setLocalStatus("playFormStatus", "Saving play...", "info");
  const { error } = await supabaseClient.rpc("record_board_game_play", payload);
  if (error) {
    setLocalStatus("playFormStatus", error.message, "error");
    return;
  }

  form.reset();
  gameState.participants = [];
  setDefaultPlayedAt();
  renderGameSelect("playGameId");
  renderPlayerToAdd();
  renderPlayCustomFields();
  renderParticipants();

  const playsResult = await fetchPlays();
  if (playsResult.error) {
    setLocalStatus("playFormStatus", playsResult.error.message, "error");
    return;
  }
  gameState.plays = playsResult.data || [];
  renderPlayHistory();
  setLocalStatus("playFormStatus", "Play saved.", "success");
}

function renderPlayHistory() {
  const container = document.getElementById("playHistory");
  if (!container) {
    return;
  }

  setText("playHistoryCount", `${gameState.plays.length} play${gameState.plays.length === 1 ? "" : "s"}`);
  container.replaceChildren();

  if (!gameState.plays.length) {
    container.append(createMessage("No plays have been recorded."));
    return;
  }

  gameState.plays.forEach((play) => {
    const row = createElement("article", "play-history-row");
    const gameBlock = createElement("div", "play-game");
    gameBlock.append(createElement("h3", "", play.game?.name || "Unknown game"));
    const dateAndPlace = [formatDateTime(play.played_at), play.location].filter(Boolean).join(", ");
    gameBlock.append(createElement("p", "", dateAndPlace));
    if (play.duration_minutes) {
      gameBlock.append(createElement("p", "", `${play.duration_minutes} minutes`));
    }

    const playFieldText = formatCustomValues(play.custom_values, getFieldsForGame(play.game_id, "play"));
    if (playFieldText.length) {
      gameBlock.append(createElement("p", "play-extra", playFieldText.join(", ")));
    }
    row.append(gameBlock);

    const playersBlock = createElement("div", "play-players");
    [...(play.participants || [])]
      .sort((left, right) => left.seat_order - right.seat_order)
      .forEach((participant) => {
        const line = createElement("p", "play-player-line");
        line.append(document.createTextNode(participant.player?.display_name || "Unknown player"));
        if (participant.score !== null && participant.score !== undefined) {
          line.append(document.createTextNode(`, ${formatDecimal(participant.score)} points`));
        }
        if (participant.result) {
          line.append(document.createTextNode(`, ${participant.result}`));
        }
        if (participant.team) {
          line.append(document.createTextNode(`, team ${participant.team}`));
        }
        const customText = formatCustomValues(
          participant.custom_values,
          getFieldsForGame(play.game_id, "player")
        );
        if (customText.length) {
          line.append(document.createTextNode(`, ${customText.join(", ")}`));
        }
        if (participant.is_winner) {
          line.append(createElement("span", "winner-tag", "Winner"));
        }
        playersBlock.append(line);
      });
    row.append(playersBlock);

    if (gameState.isAdmin) {
      const actions = createElement("div", "play-actions");
      const deleteButton = createElement("button", "button-danger", "Delete");
      deleteButton.type = "button";
      deleteButton.addEventListener("click", () => deletePlay(play));
      actions.append(deleteButton);
      row.append(actions);
    }
    container.append(row);
  });
}

async function deletePlay(play) {
  if (!window.confirm(`Delete the ${play.game?.name || "game"} play from ${formatDateTime(play.played_at)}?`)) {
    return;
  }

  const { error } = await supabaseClient.from("board_game_plays").delete().eq("play_id", play.play_id);
  if (error) {
    setGlobalStatus(error.message, "error");
    return;
  }

  gameState.plays = gameState.plays.filter((candidate) => candidate.play_id !== play.play_id);
  renderPlayHistory();
  setGlobalStatus("Play deleted.", "success");
}

async function loadPlayerStatsPage() {
  const [summaryResult, categoriesResult] = await Promise.all([
    supabaseClient
      .from("board_game_player_summary")
      .select("*")
      .order("total_plays", { ascending: false })
      .order("display_name", { ascending: true }),
    supabaseClient
      .from("board_game_player_category_stats")
      .select("*")
      .order("win_rate", { ascending: false })
      .order("plays", { ascending: false })
  ]);

  throwFirstError(summaryResult, categoriesResult);
  renderPlayerStats(summaryResult.data || [], categoriesResult.data || []);
}

function renderPlayerStats(summaries, categoryStats) {
  setText("trackedPlayerCount", summaries.length);
  setText("mostActivePlayer", summaries[0]?.display_name || "No plays yet");
  const mostWins = [...summaries].sort((left, right) => Number(right.wins) - Number(left.wins))[0];
  setText(
    "mostWinningPlayer",
    mostWins && Number(mostWins.wins) > 0 ? `${mostWins.display_name} (${mostWins.wins})` : "No wins yet"
  );

  const grid = document.getElementById("playerStatsGrid");
  grid.replaceChildren();
  if (!summaries.length) {
    grid.append(createMessage("No players have been added."));
    return;
  }

  summaries.forEach((summary) => {
    const card = createElement("article", "player-card");
    const header = createElement("div", "player-header");
    header.append(createElement("div", "player-initials", getInitials(summary.display_name)));
    const nameBlock = createElement("div");
    nameBlock.append(createElement("h3", "", summary.display_name));
    nameBlock.append(createElement(
      "p",
      "",
      summary.most_played_game
        ? `Most played: ${summary.most_played_game} (${summary.most_played_game_count})`
        : "No recorded games"
    ));
    header.append(nameBlock);
    card.append(header);

    const metrics = createElement("div", "player-metrics");
    metrics.append(createPlayerMetric(summary.total_plays, "Plays"));
    metrics.append(createPlayerMetric(summary.wins, "Wins"));
    metrics.append(createPlayerMetric(summary.win_rate === null ? "-" : `${formatDecimal(summary.win_rate)}%`, "Win rate"));
    card.append(metrics);

    const playerCategories = categoryStats
      .filter((row) => row.player_id === summary.player_id)
      .sort((left, right) => Number(right.win_rate) - Number(left.win_rate) || Number(right.plays) - Number(left.plays))
      .slice(0, 4);

    if (playerCategories.length) {
      const categorySection = createElement("section", "category-section");
      categorySection.append(createElement("h4", "", "Best categories"));
      const list = createElement("div", "category-list");
      playerCategories.forEach((category) => {
        const row = createElement("div", "category-row");
        row.append(createElement("span", "", category.category));
        row.append(createElement("strong", "", `${formatDecimal(category.win_rate)}% from ${category.plays}`));
        list.append(row);
      });
      categorySection.append(list);
      card.append(categorySection);
    }

    grid.append(card);
  });
}

function createPlayerMetric(value, label) {
  const metric = createElement("div", "player-metric");
  metric.append(createElement("strong", "", value ?? 0));
  metric.append(createElement("span", "", label));
  return metric;
}

function bindManageControls() {
  if (gameState.manageBound) {
    return;
  }
  gameState.manageBound = true;

  document.getElementById("gameForm").addEventListener("submit", saveGame);
  document.getElementById("playerForm").addEventListener("submit", savePlayer);
  document.getElementById("fieldForm").addEventListener("submit", saveFieldDefinition);
  document.getElementById("bggExportForm").addEventListener("submit", openBggCollectionExport);
  document.getElementById("bggXmlExportButton").addEventListener("click", openBggCollectionXml);
  document.getElementById("bggImportForm").addEventListener("submit", importBggCollection);
  document.getElementById("cancelGameEdit").addEventListener("click", resetGameForm);
  document.getElementById("cancelFieldEdit").addEventListener("click", resetFieldForm);

  const fieldForm = document.getElementById("fieldForm");
  formControl(fieldForm, "label").addEventListener("input", () => {
    const keyControl = formControl(fieldForm, "fieldKey");
    if (!keyControl.dataset.touched) {
      keyControl.value = toFieldKey(formControl(fieldForm, "label").value);
    }
  });
  formControl(fieldForm, "fieldKey").addEventListener("input", () => {
    formControl(fieldForm, "fieldKey").dataset.touched = "true";
  });
}

async function refreshManagePage() {
  const [gamesResult, playersResult, fieldsResult] = await Promise.all([
    supabaseClient.from("board_games").select("*").order("name", { ascending: true }),
    supabaseClient.from("board_game_players").select("*").order("display_name", { ascending: true }),
    supabaseClient
      .from("board_game_field_definitions")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true })
  ]);

  throwFirstError(gamesResult, playersResult, fieldsResult);
  gameState.games = gamesResult.data || [];
  gameState.players = playersResult.data || [];
  gameState.fields = fieldsResult.data || [];

  renderGameSelect("fieldGameId");
  renderManageGames();
  renderManagePlayers();
  renderManageFields();
}

async function saveGame(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const minPlayers = optionalNumber(formControl(form, "minPlayers").value);
  const maxPlayers = optionalNumber(formControl(form, "maxPlayers").value);
  if (minPlayers !== null && maxPlayers !== null && maxPlayers < minPlayers) {
    setLocalStatus("gameFormStatus", "Maximum players cannot be lower than minimum players.", "error");
    return;
  }

  const payload = {
    name: formControl(form, "name").value.trim(),
    bgg_id: optionalNumber(formControl(form, "bggId").value),
    year_published: optionalNumber(formControl(form, "yearPublished").value),
    min_players: minPlayers,
    max_players: maxPlayers,
    playing_time_minutes: optionalNumber(formControl(form, "playingTime").value),
    min_age: optionalNumber(formControl(form, "minAge").value),
    complexity_weight: optionalNumber(formControl(form, "complexityWeight").value),
    bgg_rating: optionalNumber(formControl(form, "bggRating").value),
    categories: splitList(formControl(form, "categories").value),
    mechanisms: splitList(formControl(form, "mechanisms").value),
    designers: splitList(formControl(form, "designers").value),
    description: optionalText(formControl(form, "description").value),
    image_url: optionalText(formControl(form, "imageUrl").value),
    thumbnail_url: optionalText(formControl(form, "thumbnailUrl").value),
    owned: formControl(form, "owned").checked,
    notes: optionalText(formControl(form, "notes").value)
  };

  const gameId = formControl(form, "gameId").value;
  setLocalStatus("gameFormStatus", "Saving game...", "info");
  const result = gameId
    ? await supabaseClient.from("board_games").update(payload).eq("game_id", gameId)
    : await supabaseClient.from("board_games").insert(payload);

  if (result.error) {
    setLocalStatus("gameFormStatus", result.error.message, "error");
    return;
  }

  resetGameForm();
  setLocalStatus("gameFormStatus", gameId ? "Game updated." : "Game added.", "success");
  await refreshManagePage();
}

async function savePlayer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const displayName = formControl(form, "displayName").value.trim();
  setLocalStatus("playerFormStatus", "Saving player...", "info");

  const { error } = await supabaseClient
    .from("board_game_players")
    .insert({ display_name: displayName });

  if (error) {
    setLocalStatus("playerFormStatus", error.message, "error");
    return;
  }

  form.reset();
  setLocalStatus("playerFormStatus", `${displayName} added.`, "success");
  await refreshManagePage();
}

async function saveFieldDefinition(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fieldType = formControl(form, "fieldType").value;
  const options = splitList(formControl(form, "options").value);
  if (fieldType === "select" && !options.length) {
    setLocalStatus("fieldFormStatus", "Add at least one option for an option-list field.", "error");
    return;
  }

  const payload = {
    game_id: formControl(form, "gameId").value,
    label: formControl(form, "label").value.trim(),
    field_key: formControl(form, "fieldKey").value.trim(),
    scope: formControl(form, "scope").value,
    field_type: fieldType,
    options: fieldType === "select" ? options : [],
    unit: optionalText(formControl(form, "unit").value),
    required: formControl(form, "required").checked,
    sort_order: Number(formControl(form, "sortOrder").value || 0)
  };

  const fieldId = formControl(form, "fieldId").value;
  setLocalStatus("fieldFormStatus", "Saving field...", "info");
  const result = fieldId
    ? await supabaseClient.from("board_game_field_definitions").update(payload).eq("field_id", fieldId)
    : await supabaseClient.from("board_game_field_definitions").insert(payload);

  if (result.error) {
    setLocalStatus("fieldFormStatus", result.error.message, "error");
    return;
  }

  resetFieldForm();
  setLocalStatus("fieldFormStatus", fieldId ? "Field updated." : "Field added.", "success");
  await refreshManagePage();
}

function renderManageGames() {
  setText("manageGameCount", `${gameState.games.length} game${gameState.games.length === 1 ? "" : "s"}`);
  const list = document.getElementById("manageGameList");
  list.replaceChildren();

  if (!gameState.games.length) {
    list.append(createMessage("No games have been added."));
    return;
  }

  gameState.games.forEach((game) => {
    const row = createElement("article", `record-row${game.owned ? "" : " is-inactive"}`);
    const main = createElement("div", "record-main");
    main.append(createElement("h3", "", game.name));
    main.append(createElement(
      "p",
      "",
      [game.year_published, formatPlayerRange(game), game.bgg_id ? `BGG ${game.bgg_id}` : null]
        .filter(Boolean)
        .join(", ")
    ));

    const actions = createElement("div", "record-actions");
    const editButton = createElement("button", "button-secondary", "Edit");
    const deleteButton = createElement("button", "button-danger", "Delete");
    editButton.type = "button";
    deleteButton.type = "button";
    editButton.addEventListener("click", () => startEditingGame(game));
    deleteButton.addEventListener("click", () => deleteGame(game));
    actions.append(editButton, deleteButton);

    row.append(main, actions);
    list.append(row);
  });
}

function renderManagePlayers() {
  const list = document.getElementById("managePlayerList");
  list.replaceChildren();
  if (!gameState.players.length) {
    list.append(createMessage("No players have been added."));
    return;
  }

  gameState.players.forEach((player) => {
    const row = createElement("article", `record-row${player.active ? "" : " is-inactive"}`);
    const main = createElement("div", "record-main");
    main.append(createElement("h3", "", player.display_name));
    main.append(createElement("p", "", player.active ? "Active" : "Inactive"));

    const actions = createElement("div", "record-actions");
    const toggleButton = createElement("button", "button-secondary", player.active ? "Deactivate" : "Activate");
    toggleButton.type = "button";
    toggleButton.addEventListener("click", () => togglePlayer(player));
    actions.append(toggleButton);

    row.append(main, actions);
    list.append(row);
  });
}

function renderManageFields() {
  const list = document.getElementById("manageFieldList");
  list.replaceChildren();
  if (!gameState.fields.length) {
    list.append(createMessage("No game-specific fields have been added."));
    return;
  }

  gameState.fields.forEach((field) => {
    const game = gameState.games.find((candidate) => candidate.game_id === field.game_id);
    const row = createElement("article", "record-row");
    const main = createElement("div", "record-main");
    main.append(createElement("h3", "", field.label));
    main.append(createElement(
      "p",
      "",
      `${game?.name || "Unknown game"}, ${field.scope === "player" ? "each player" : "whole play"}, ${field.field_type}`
    ));

    const actions = createElement("div", "record-actions");
    const editButton = createElement("button", "button-secondary", "Edit");
    const deleteButton = createElement("button", "button-danger", "Delete");
    editButton.type = "button";
    deleteButton.type = "button";
    editButton.addEventListener("click", () => startEditingField(field));
    deleteButton.addEventListener("click", () => deleteField(field));
    actions.append(editButton, deleteButton);

    row.append(main, actions);
    list.append(row);
  });
}

function startEditingGame(game) {
  const form = document.getElementById("gameForm");
  const values = {
    gameId: game.game_id,
    name: game.name,
    bggId: game.bgg_id,
    yearPublished: game.year_published,
    minPlayers: game.min_players,
    maxPlayers: game.max_players,
    playingTime: game.playing_time_minutes,
    minAge: game.min_age,
    complexityWeight: game.complexity_weight,
    bggRating: game.bgg_rating,
    categories: game.categories?.join(", "),
    mechanisms: game.mechanisms?.join(", "),
    designers: game.designers?.join(", "),
    imageUrl: game.image_url,
    thumbnailUrl: game.thumbnail_url,
    description: game.description,
    notes: game.notes
  };
  Object.entries(values).forEach(([name, value]) => {
    formControl(form, name).value = value ?? "";
  });
  formControl(form, "owned").checked = game.owned;
  setText("gameFormHeading", `Edit ${game.name}`);
  setText("saveGameButton", "Update game");
  document.getElementById("cancelGameEdit").hidden = false;
  setLocalStatus("gameFormStatus", "", "info");
  form.scrollIntoView({ block: "start" });
}

function resetGameForm() {
  const form = document.getElementById("gameForm");
  form.reset();
  formControl(form, "gameId").value = "";
  formControl(form, "owned").checked = true;
  setText("gameFormHeading", "Add a game");
  setText("saveGameButton", "Save game");
  document.getElementById("cancelGameEdit").hidden = true;
}

function startEditingField(field) {
  const form = document.getElementById("fieldForm");
  const values = {
    fieldId: field.field_id,
    gameId: field.game_id,
    label: field.label,
    fieldKey: field.field_key,
    scope: field.scope,
    fieldType: field.field_type,
    options: field.options?.join(", "),
    unit: field.unit,
    sortOrder: field.sort_order
  };
  Object.entries(values).forEach(([name, value]) => {
    formControl(form, name).value = value ?? "";
  });
  formControl(form, "required").checked = field.required;
  formControl(form, "fieldKey").dataset.touched = "true";
  setText("saveFieldButton", "Update field");
  document.getElementById("cancelFieldEdit").hidden = false;
  form.scrollIntoView({ block: "start" });
}

function resetFieldForm() {
  const form = document.getElementById("fieldForm");
  form.reset();
  formControl(form, "fieldId").value = "";
  formControl(form, "fieldKey").dataset.touched = "";
  formControl(form, "sortOrder").value = "0";
  renderGameSelect("fieldGameId");
  setText("saveFieldButton", "Save field");
  document.getElementById("cancelFieldEdit").hidden = true;
}

async function deleteGame(game) {
  if (!window.confirm(`Delete ${game.name}? Games with recorded plays cannot be deleted.`)) {
    return;
  }
  const { error } = await supabaseClient.from("board_games").delete().eq("game_id", game.game_id);
  if (error) {
    setGlobalStatus(error.message, "error");
    return;
  }
  await refreshManagePage();
  setGlobalStatus(`${game.name} deleted.`, "success");
}

async function togglePlayer(player) {
  const { error } = await supabaseClient
    .from("board_game_players")
    .update({ active: !player.active })
    .eq("player_id", player.player_id);
  if (error) {
    setGlobalStatus(error.message, "error");
    return;
  }
  await refreshManagePage();
}

async function deleteField(field) {
  if (!window.confirm(`Delete the ${field.label} field? Existing recorded values remain in play history.`)) {
    return;
  }
  const { error } = await supabaseClient
    .from("board_game_field_definitions")
    .delete()
    .eq("field_id", field.field_id);
  if (error) {
    setGlobalStatus(error.message, "error");
    return;
  }
  await refreshManagePage();
  setGlobalStatus(`${field.label} deleted.`, "success");
}

function openBggCollectionExport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const username = formControl(form, "username").value.trim();
  const exportUrl = new URL(BGG_COLLECTION_CSV_URL);
  exportUrl.searchParams.set("action", "exportcsv");
  exportUrl.searchParams.set("subtype", "boardgame");
  exportUrl.searchParams.set("username", username);
  window.open(exportUrl.toString(), "_blank", "noopener,noreferrer");
  setLocalStatus("bggStatus", "When the CSV download finishes, select that file below.", "info");
}

function openBggCollectionXml() {
  const form = document.getElementById("bggExportForm");
  if (!form.reportValidity()) {
    return;
  }

  const exportUrl = new URL(BGG_COLLECTION_XML_URL);
  exportUrl.searchParams.set("username", formControl(form, "username").value.trim());
  exportUrl.searchParams.set("own", "1");
  exportUrl.searchParams.set("stats", "1");
  window.open(exportUrl.toString(), "_blank", "noopener,noreferrer");
  setLocalStatus("bggStatus", "Save the XML from the BGG tab, then select that file below.", "info");
}

async function importBggCollection(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const file = formControl(form, "collectionFile").files[0];
  if (!file) {
    setLocalStatus("bggStatus", "Choose a BGG collection CSV or XML file.", "error");
    return;
  }

  setLocalStatus("bggStatus", "Reading collection file...", "info");
  let games;
  try {
    games = parseBggCollectionFile(await file.text(), file);
  } catch (error) {
    setLocalStatus("bggStatus", error.message || "The collection file could not be read.", "error");
    return;
  }

  const existingByBggId = new Map(
    gameState.games
      .filter((game) => game.bgg_id !== null)
      .map((game) => [Number(game.bgg_id), game])
  );
  const newGames = [];
  const metadataUpdates = [];
  games.forEach((game) => {
    const existingGame = existingByBggId.get(game.bgg_id);
    if (!existingGame) {
      newGames.push(game);
      return;
    }

    const values = getMissingCollectionMetadata(existingGame, game);
    if (Object.keys(values).length) {
      metadataUpdates.push({ gameId: existingGame.game_id, values });
    }
  });

  if (!newGames.length && !metadataUpdates.length) {
    setLocalStatus("bggStatus", `No changes found. All ${games.length} collection games are already up to date.`, "info");
    return;
  }

  let importedCount = 0;
  for (let offset = 0; offset < newGames.length; offset += 100) {
    const batch = newGames.slice(offset, offset + 100);
    const { error } = await supabaseClient.from("board_games").insert(batch);
    if (error) {
      await refreshManagePage();
      const prefix = importedCount ? `${importedCount} games imported before the error. ` : "";
      setLocalStatus("bggStatus", `${prefix}${error.message}`, "error");
      return;
    }
    importedCount += batch.length;
  }

  let updatedCount = 0;
  for (const update of metadataUpdates) {
    const { error } = await supabaseClient
      .from("board_games")
      .update(update.values)
      .eq("game_id", update.gameId);
    if (error) {
      await refreshManagePage();
      setLocalStatus(
        "bggStatus",
        `${importedCount} new and ${updatedCount} existing games saved before the error. ${error.message}`,
        "error"
      );
      return;
    }
    updatedCount += 1;
  }

  form.reset();
  await refreshManagePage();
  const unchangedCount = games.length - importedCount - updatedCount;
  const fileHasImages = games.some((game) => game.image_url || game.thumbnail_url);
  const imageNotice = fileHasImages
    ? ""
    : " This file has no image URLs; import the XML export later to fill missing images.";
  setLocalStatus(
    "bggStatus",
    `${importedCount} new, ${updatedCount} enriched, ${unchangedCount} unchanged.${imageNotice}`,
    "success"
  );
}

function getMissingCollectionMetadata(existingGame, importedGame) {
  const values = {};
  [
    "year_published",
    "min_players",
    "max_players",
    "playing_time_minutes",
    "min_age",
    "complexity_weight",
    "bgg_rating",
    "image_url",
    "thumbnail_url",
    "notes"
  ].forEach((field) => {
    const existingValue = existingGame[field];
    const importedValue = importedGame[field];
    if (
      (existingValue === null || existingValue === undefined || existingValue === "")
      && importedValue !== null
      && importedValue !== undefined
      && importedValue !== ""
    ) {
      values[field] = importedValue;
    }
  });
  if (!existingGame.owned) {
    values.owned = true;
  }
  if (Object.keys(values).length) {
    values.bgg_synced_at = importedGame.bgg_synced_at;
  }
  return values;
}

function parseBggCollectionFile(fileText, file) {
  const fileName = String(file?.name || "").toLowerCase();
  const fileType = String(file?.type || "").toLowerCase();
  const looksLikeXml = fileText.trimStart().startsWith("<");
  if (fileName.endsWith(".csv") || fileType.includes("csv") || !looksLikeXml) {
    return parseBggCollectionCsv(fileText);
  }
  return parseBggCollectionXml(fileText);
}

function parseBggCollectionCsv(csvText) {
  if (!window.Papa) {
    throw new Error("The CSV parser did not load. Refresh the page and try again.");
  }

  const result = window.Papa.parse(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeCsvHeader
  });
  const quoteError = result.errors.find((error) => error.type === "Quotes");
  if (quoteError) {
    throw new Error(`The CSV could not be read: ${quoteError.message}`);
  }

  const gamesById = new Map();
  result.data.forEach((row) => {
    const game = parseBggCollectionCsvRow(row);
    if (game && !gamesById.has(game.bgg_id)) {
      gamesById.set(game.bgg_id, game);
    }
  });
  if (!gamesById.size) {
    throw new Error("No owned board games were found in this BGG CSV file.");
  }
  return [...gamesById.values()];
}

function parseBggCollectionCsvRow(row) {
  const bggId = positiveInteger(readCsvValue(row, "objectid", "bggid", "id"));
  const name = optionalText(readCsvValue(row, "name", "title", "objectname"));
  const ownedValue = readCsvValue(row, "own", "owned");
  const explicitlyNotOwned = ownedValue !== null
    && !["1", "true", "yes", "y"].includes(String(ownedValue).trim().toLowerCase());
  if (!bggId || !name || explicitlyNotOwned) {
    return null;
  }

  const minPlayers = positiveInteger(readCsvValue(row, "minplayers"));
  const parsedMaxPlayers = positiveInteger(readCsvValue(row, "maxplayers"));
  return {
    name,
    bgg_id: bggId,
    year_published: boundedInteger(readCsvValue(row, "yearpublished", "year"), 1800, 3000),
    min_players: minPlayers,
    max_players: minPlayers && parsedMaxPlayers && parsedMaxPlayers < minPlayers ? null : parsedMaxPlayers,
    playing_time_minutes: positiveInteger(readCsvValue(row, "playingtime", "maxplaytime")),
    min_age: leadingInteger(readCsvValue(row, "minage", "bggrecagerange"), 0, 100),
    complexity_weight: boundedDecimal(readCsvValue(row, "avgweight", "averageweight", "weight"), 1, 5),
    bgg_rating: boundedDecimal(readCsvValue(row, "average", "baverage"), 0, 10),
    image_url: optionalText(readCsvValue(row, "image", "imageurl")),
    thumbnail_url: optionalText(readCsvValue(row, "thumbnail", "thumbnailurl")),
    owned: true,
    notes: optionalText(readCsvValue(row, "comment", "usercomment")),
    bgg_synced_at: new Date().toISOString()
  };
}

function normalizeCsvHeader(header) {
  return String(header).replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readCsvValue(row, ...headers) {
  const header = headers.find((candidate) => row[candidate] !== undefined && row[candidate] !== "");
  return header ? row[header] : null;
}

function parseBggCollectionXml(xmlText) {
  const documentNode = new DOMParser().parseFromString(xmlText, "application/xml");
  if (documentNode.querySelector("parsererror")) {
    throw new Error("The selected file is not valid XML.");
  }

  const message = documentNode.querySelector("message")?.textContent?.trim();
  if (message && !documentNode.querySelector("item")) {
    throw new Error(`BGG has not prepared the collection yet: ${message}`);
  }

  const gamesById = new Map();
  documentNode.querySelectorAll("items > item").forEach((item) => {
    const game = parseBggCollectionItem(item);
    if (game && !gamesById.has(game.bgg_id)) {
      gamesById.set(game.bgg_id, game);
    }
  });

  if (!gamesById.size) {
    throw new Error("No owned board games were found in this collection file.");
  }
  return [...gamesById.values()];
}

function parseBggCollectionItem(item) {
  const status = item.querySelector("status");
  const bggId = Number(item.getAttribute("objectid"));
  const name = item.querySelector("name")?.textContent?.trim();
  if (status?.getAttribute("own") !== "1" || !Number.isSafeInteger(bggId) || bggId <= 0 || !name) {
    return null;
  }

  const stats = item.querySelector("stats");
  const rating = stats?.querySelector("rating");
  const minPlayers = positiveInteger(stats?.getAttribute("minplayers"));
  const parsedMaxPlayers = positiveInteger(stats?.getAttribute("maxplayers"));
  return {
    name,
    bgg_id: bggId,
    year_published: boundedInteger(item.querySelector("yearpublished")?.textContent, 1800, 3000),
    min_players: minPlayers,
    max_players: minPlayers && parsedMaxPlayers && parsedMaxPlayers < minPlayers ? null : parsedMaxPlayers,
    playing_time_minutes: positiveInteger(stats?.getAttribute("playingtime")),
    complexity_weight: boundedDecimal(rating?.querySelector("averageweight")?.getAttribute("value"), 1, 5),
    bgg_rating: boundedDecimal(rating?.querySelector("average")?.getAttribute("value"), 0, 10),
    image_url: optionalText(item.querySelector("image")?.textContent || ""),
    thumbnail_url: optionalText(item.querySelector("thumbnail")?.textContent || ""),
    owned: true,
    bgg_synced_at: new Date().toISOString()
  };
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function boundedInteger(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= minimum && number <= maximum ? number : null;
}

function leadingInteger(value, minimum, maximum) {
  const match = String(value || "").match(/\d+/);
  return match ? boundedInteger(match[0], minimum, maximum) : null;
}

function boundedDecimal(value, minimum, maximum) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function collectCustomValues(container) {
  const values = {};
  container.querySelectorAll("[data-custom-key]").forEach((control) => {
    const value = readCustomControlValue(control);
    if (value !== undefined) {
      values[control.dataset.customKey] = value;
    }
  });
  return values;
}

function readCustomControlValue(control) {
  if (control.dataset.customType === "boolean") {
    return control.checked;
  }
  if (control.value === "") {
    return undefined;
  }
  if (control.dataset.customType === "number") {
    return Number(control.value);
  }
  return control.value;
}

function getFieldsForGame(gameId, scope) {
  return gameState.fields.filter((field) => field.game_id === gameId && field.scope === scope);
}

function formatCustomValues(values, definitions) {
  if (!values || typeof values !== "object") {
    return [];
  }
  const definitionsByKey = new Map(definitions.map((definition) => [definition.field_key, definition]));
  return Object.entries(values).map(([key, value]) => {
    const definition = definitionsByKey.get(key);
    const label = definition?.label || key.replaceAll("_", " ");
    const formattedValue = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
    const unit = definition?.unit ? ` ${definition.unit}` : "";
    return `${label}: ${formattedValue}${unit}`;
  });
}

function createGameImage(game, imageClass, fallbackClass) {
  const imageUrl = safeHttpUrl(game.image_url || game.thumbnail_url);
  if (!imageUrl) {
    return createImageFallback(game.name, fallbackClass);
  }

  const image = createElement("img", imageClass);
  image.src = imageUrl;
  image.alt = `${game.name} box art`;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    image.replaceWith(createImageFallback(game.name, fallbackClass));
  }, { once: true });
  return image;
}

function createImageFallback(name, className) {
  const fallback = createElement("div", className, getInitials(name));
  fallback.setAttribute("aria-hidden", "true");
  return fallback;
}

function setDefaultPlayedAt() {
  const input = document.querySelector('[name="playedAt"]');
  if (!input) {
    return;
  }
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  input.value = now.toISOString().slice(0, 16);
}

function formatPlayerRange(game) {
  if (!game.min_players && !game.max_players) {
    return "Players not set";
  }
  if (game.min_players === game.max_players || !game.max_players) {
    return `${game.min_players} player${game.min_players === 1 ? "" : "s"}`;
  }
  return `${game.min_players}-${game.max_players} players`;
}

function formatDateTime(value) {
  if (!value) {
    return "Date not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDecimal(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)).toString() : "-";
}

function createElement(tagName, className = "", text = "") {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== "") {
    element.textContent = String(text);
  }
  return element;
}

function createMessage(message) {
  return createElement("div", "empty-state", message);
}

function formControl(form, name) {
  return form.elements.namedItem(name);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(value);
  }
}

function setGlobalStatus(message, tone) {
  const status = document.getElementById("globalStatus");
  if (!status) {
    return;
  }
  status.hidden = false;
  status.textContent = message;
  status.className = `status-banner status-${tone}`;
}

function hideGlobalStatus() {
  const status = document.getElementById("globalStatus");
  if (status) {
    status.hidden = true;
  }
}

function setLocalStatus(id, message, tone) {
  const status = document.getElementById(id);
  if (!status) {
    return;
  }
  status.hidden = !message;
  status.textContent = message;
  status.className = message ? `inline-status status-${tone}` : "inline-status";
}

function throwFirstError(...results) {
  const firstError = results.map((result) => result.error).find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }
}

function splitList(value) {
  return [...new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function optionalText(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function optionalNumber(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

function safeHttpUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function getInitials(value) {
  return String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function toFieldKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 50);
}