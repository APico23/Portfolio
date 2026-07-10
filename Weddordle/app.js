const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

// Supabase — the publishable key is intentionally public; security is
// enforced by Row Level Security policies on the table.
const SUPABASE_URL = "https://fupysqufnvblxyocqxey.supabase.co";
const SUPABASE_KEY = "sb_publishable_BdHgtwQxbguQOgkAc9gNqg_8uLcLA8e";
let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Wedding Day Challenge words — update these to change the puzzle set.
const CHALLENGE_WORDS = ["bride", "groom", "hitch", "aisle", "jesus"];

const boardEl = document.getElementById("board");
const keyboardEl = document.getElementById("keyboard");
const statusEl = document.getElementById("statusText");
const helpBtn = document.getElementById("helpBtn");
const newGameBtn = document.getElementById("newGameBtn");
const instructionsDialog = document.getElementById("instructionsDialog");
const closeInstructionsBtn = document.getElementById("closeInstructionsBtn");

const fallbackAnswers = [
  "bride", "groom", "aisle", "altar", "party",
  "dance", "heart", "music", "bloom", "toast"
];

let dictionary = new Set();
let answers = [...fallbackAnswers];
let enforceDictionary = true;

let targetWord = "";
let rowIndex = 0;
let colIndex = 0;
let boardState = [];
let gameOver = false;
let animating = false;

let gameMode = null;           // "endless" | "challenge"
let challengePuzzleIndex = 0;
let challengeResults = [];     // [{guesses, time, failed}]
let challengeTimerInterval = null;
let challengeElapsed = 0;

const keyStateOrder = { unknown: 0, absent: 1, present: 2, correct: 3 };
const keyStates = new Map();

init();

async function init() {
  buildBoard();
  buildKeyboard();
  sizeTiles();
  window.addEventListener("resize", sizeTiles);
  wireEvents();

  // Show mode selection first; game starts when user picks a mode.
  showModeScreen();

  await loadWordLists();
}

async function loadWordLists() {
  const [dictionaryResult, answersResult] = await Promise.allSettled([
    fetch("dictionary.txt"),
    fetch("answers.txt")
  ]);

  let dictionaryLoaded = false;
  let answersLoaded = false;

  if (dictionaryResult.status === "fulfilled" && dictionaryResult.value.ok) {
    const dictionaryText = await dictionaryResult.value.text();
    const dictionaryWords = parseWordList(dictionaryText);

    if (dictionaryWords.length > 0) {
      dictionary = new Set(dictionaryWords);
      dictionaryLoaded = true;
    }
  }

  if (answersResult.status === "fulfilled" && answersResult.value.ok) {
    const answersText = await answersResult.value.text();
    const answerWords = parseWordList(answersText);

    if (answerWords.length > 0) {
      answers = answerWords;
      answersLoaded = true;
    }
  }

  if (!answersLoaded) {
    answers = [...fallbackAnswers];
  }

  if (!dictionaryLoaded) {
    enforceDictionary = false;
    dictionary = new Set(answers);
  }
}

function parseWordList(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((word) => /^[a-z]{5}$/.test(word));
}

function buildBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < MAX_GUESSES; r += 1) {
    const row = document.createElement("div");
    row.className = "row";

    for (let c = 0; c < WORD_LENGTH; c += 1) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.dataset.row = String(r);
      tile.dataset.col = String(c);
      row.appendChild(tile);
    }

    boardEl.appendChild(row);
  }
}

function buildKeyboard() {
  keyboardEl.innerHTML = "";

  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"]
  ];

  rows.forEach((keys) => {
    const row = document.createElement("div");
    row.className = "key-row";

    keys.forEach((keyName) => {
      const key = document.createElement("button");
      key.className = "key";
      key.type = "button";

      if (keyName === "BACKSPACE") {
        key.textContent = "Back";
        key.dataset.key = "BACKSPACE";
        key.classList.add("wide");
      } else if (keyName === "ENTER") {
        key.textContent = "Enter";
        key.dataset.key = "ENTER";
        key.classList.add("wide");
      } else {
        key.textContent = keyName;
        key.dataset.key = keyName;
      }

      row.appendChild(key);
    });

    keyboardEl.appendChild(row);
  });
}

function wireEvents() {
  document.addEventListener("keydown", onPhysicalKey);
  keyboardEl.addEventListener("click", onVirtualKey);
  newGameBtn.addEventListener("click", startNewGame);

  helpBtn.addEventListener("click", () => {
    if (typeof instructionsDialog.showModal === "function") {
      instructionsDialog.showModal();
    }
  });

  closeInstructionsBtn.addEventListener("click", () => instructionsDialog.close());

  document.getElementById("challengeModeBtn").addEventListener("click", startChallengeMode);
  document.getElementById("endlessModeBtn").addEventListener("click", startEndlessMode);
  document.getElementById("nextPuzzleBtn").addEventListener("click", advanceChallengePuzzle);
  document.getElementById("backToMenuBtn").addEventListener("click", showModeScreen);
  document.getElementById("submitScoreBtn").addEventListener("click", submitScore);
  document.getElementById("playAgainBtn").addEventListener("click", showModeScreen);
}

function startNewGame() {
  if (answers.length === 0) {
    statusEl.textContent = "No answers loaded. Add words to answers.txt.";
    return;
  }

  targetWord = answers[Math.floor(Math.random() * answers.length)];
  rowIndex = 0;
  colIndex = 0;
  gameOver = false;
  animating = false;
  keyStates.clear();

  boardState = Array.from({ length: MAX_GUESSES }, () =>
    Array.from({ length: WORD_LENGTH }, () => "")
  );

  document.querySelectorAll(".tile").forEach((tile) => {
    tile.textContent = "";
    tile.className = "tile";
  });

  document.querySelectorAll(".key").forEach((key) => {
    key.classList.remove("correct", "present", "absent");
  });

  statusEl.textContent = "Guess the wedding word in 6 tries.";
  newGameBtn.classList.add("hidden");
}

function onPhysicalKey(event) {
  const key = event.key.toUpperCase();

  if (key === "ENTER") {
    submitGuess();
    return;
  }

  if (key === "BACKSPACE") {
    deleteLetter();
    return;
  }

  if (/^[A-Z]$/.test(key)) {
    addLetter(key);
  }
}

function onVirtualKey(event) {
  const button = event.target.closest("button[data-key]");
  if (!button) return;

  const key = button.dataset.key;

  if (key === "ENTER") {
    submitGuess();
  } else if (key === "BACKSPACE") {
    deleteLetter();
  } else {
    addLetter(key);
  }
}

function addLetter(letter) {
  if (gameOver || animating || colIndex >= WORD_LENGTH) return;

  boardState[rowIndex][colIndex] = letter;
  updateTile(rowIndex, colIndex, letter, true);

  const tile = getTile(rowIndex, colIndex);
  tile.classList.remove("pop");
  void tile.offsetWidth;
  tile.classList.add("pop");
  tile.addEventListener("animationend", () => tile.classList.remove("pop"), { once: true });

  colIndex += 1;
}

function deleteLetter() {
  if (gameOver || animating || colIndex === 0) return;

  colIndex -= 1;
  boardState[rowIndex][colIndex] = "";
  updateTile(rowIndex, colIndex, "", false);
}

function submitGuess() {
  if (gameOver || animating) return;

  if (colIndex < WORD_LENGTH) {
    statusEl.textContent = "Not enough letters.";
    shakeRow(rowIndex);
    return;
  }

  const guess = boardState[rowIndex].join("").toLowerCase();

  if (enforceDictionary && !dictionary.has(guess) && !answers.includes(guess)) {
    statusEl.textContent = "Word not in dictionary.";
    shakeRow(rowIndex);
    return;
  }

  const result = scoreGuess(guess, targetWord);
  const STAGGER = 280;
  const FLIP_DURATION = 420;
  const totalAnim = (WORD_LENGTH - 1) * STAGGER + FLIP_DURATION;

  animating = true;
  paintRow(rowIndex, result, STAGGER, FLIP_DURATION);

  setTimeout(() => {
    updateKeyboard(guess, result);

    if (guess === targetWord) {
      gameOver = true;
      animating = false;
      statusEl.textContent = "You got it! 💍";
      bounceRow(rowIndex);
      launchCelebration();
      if (gameMode === "challenge") {
        clearInterval(challengeTimerInterval);
        setTimeout(() => finishChallengePuzzle(false), 2200);
      } else {
        newGameBtn.classList.remove("hidden");
      }
      return;
    }

    if (rowIndex === MAX_GUESSES - 1) {
      gameOver = true;
      animating = false;
      statusEl.textContent = `Out of tries. The word was ${targetWord.toUpperCase()}.`;
      if (gameMode === "challenge") {
        clearInterval(challengeTimerInterval);
        setTimeout(() => finishChallengePuzzle(true), 1600);
      } else {
        newGameBtn.classList.remove("hidden");
      }
      return;
    }

    rowIndex += 1;
    colIndex = 0;
    animating = false;
    statusEl.textContent = "Keep going!";
  }, totalAnim + 80);
}

function updateTile(row, col, letter, filled) {
  const tile = getTile(row, col);
  tile.textContent = letter;

  if (filled) {
    tile.classList.add("filled");
  } else {
    tile.classList.remove("filled", "correct", "present", "absent");
  }
}

function getTile(row, col) {
  return boardEl.querySelector(`.tile[data-row="${row}"][data-col="${col}"]`);
}

function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const answerChars = answer.split("");

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess[i] === answerChars[i]) {
      result[i] = "correct";
      answerChars[i] = "#";
    }
  }

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (result[i] !== "absent") continue;

    const foundIndex = answerChars.indexOf(guess[i]);
    if (foundIndex !== -1) {
      result[i] = "present";
      answerChars[foundIndex] = "#";
    }
  }

  return result;
}

function paintRow(row, result, stagger = 280, duration = 420) {
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const tile = getTile(row, i);
    const delay = i * stagger;

    setTimeout(() => {
      tile.classList.add("flipping");

      // Swap in color at the halfway point when tile is invisible.
      setTimeout(() => {
        tile.classList.remove("filled");
        tile.classList.add(result[i]);
      }, duration / 2);

      setTimeout(() => {
        tile.classList.remove("flipping");
      }, duration);
    }, delay);
  }
}

function updateKeyboard(guess, result) {
  for (let i = 0; i < guess.length; i += 1) {
    const letter = guess[i].toUpperCase();
    const nextState = result[i];
    const prevState = keyStates.get(letter) || "unknown";

    if (keyStateOrder[nextState] > keyStateOrder[prevState]) {
      keyStates.set(letter, nextState);

      const key = keyboardEl.querySelector(`.key[data-key="${letter}"]`);
      if (key) {
        key.classList.remove("correct", "present", "absent");
        key.classList.add(nextState);
      }
    }
  }
}

function shakeRow(row) {
  const rowEl = boardEl.querySelectorAll(".row")[row];
  rowEl.classList.remove("shake");
  void rowEl.offsetWidth;
  rowEl.classList.add("shake");
  rowEl.addEventListener("animationend", () => rowEl.classList.remove("shake"), { once: true });
}

function bounceRow(row) {
  const STAGGER = 120;
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    const tile = getTile(row, i);
    setTimeout(() => {
      tile.classList.remove("bounce");
      void tile.offsetWidth;
      tile.classList.add("bounce");
    }, i * STAGGER);
  }
}

function sizeTiles() {
  requestAnimationFrame(() => {
    const gap = 5;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const appWidth = Math.min(vw * 0.94, 500);

    // Measure the real height consumed by everything except the board.
    const appEl = document.querySelector(".app");
    let nonBoardH = 0;
    if (appEl) {
      const cs = getComputedStyle(appEl);
      nonBoardH += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      for (const child of appEl.children) {
        if (child.id !== "board") {
          const r = child.getBoundingClientRect();
          const ccs = getComputedStyle(child);
          nonBoardH += r.height + parseFloat(ccs.marginTop) + parseFloat(ccs.marginBottom);
        }
      }
    }

    const byWidth  = Math.floor((appWidth - gap * 4) / 5);
    const byHeight = Math.floor((vh - nonBoardH - gap * 5 - 12) / 6); // 12px breathing room
    const tileSize = Math.max(36, Math.min(byWidth, byHeight, 72));

    document.documentElement.style.setProperty("--tile-size", tileSize + "px");
    document.documentElement.style.setProperty("--tile-font", Math.round(tileSize * 0.56) + "px");
  });
}

function launchCelebration() {
  const COLORS = ["#3a7cb0", "#7bbce0", "#4e8620", "#a8d4ec", "#ffffff", "#c8e2f5", "#6ab4dc", "#8eca40"];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Confetti bursts upward from random points along the bottom edge.
  for (let i = 0; i < 80; i += 1) {
    const el = document.createElement("div");
    el.className = "confetti-piece";

    const startX = vw * 0.05 + Math.random() * vw * 0.9;
    const tx = (Math.random() - 0.5) * 340;
    const ty = -(vh * (0.3 + Math.random() * 0.65));  // shoots 30-95% up the screen
    const size = 5 + Math.floor(Math.random() * 9);
    const isCircle = Math.random() > 0.5;

    el.style.cssText = [
      `left:${startX}px`,
      `top:${vh}px`,
      `--tx:${tx}px`,
      `--ty:${ty}px`,
      `--rot:${Math.round((Math.random() - 0.5) * 800)}deg`,
      `--size:${size}px`,
      `--brad:${isCircle ? "50%" : "2px"}`,
      `--color:${COLORS[Math.floor(Math.random() * COLORS.length)]}`,
      `--dur:${(0.9 + Math.random() * 0.9).toFixed(2)}s`,
      `--delay:${Math.floor(Math.random() * 200)}ms`
    ].join(";");

    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  // Doves fly upward from the bottom.
  const doveCount = 7;
  for (let i = 0; i < doveCount; i += 1) {
    const el = document.createElement("span");
    el.className = "dove";
    el.textContent = "🕊️";

    const startX = vw * 0.1 + Math.random() * vw * 0.8;
    const tx = (Math.random() - 0.5) * 320;
    const ty = -(vh * (0.5 + Math.random() * 0.45));  // fly 50-95% up

    el.style.cssText = [
      `left:${startX}px`,
      `top:${vh}px`,
      `--tx:${tx}px`,
      `--ty:${ty}px`,
      `--fs:${(1.4 + Math.random() * 0.8).toFixed(1)}rem`,
      `--dur:${(1.1 + Math.random() * 0.7).toFixed(2)}s`,
      `--delay:${i * 90}ms`
    ].join(";");

    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }
}

// ── Mode selection ────────────────────────────────────────────────────────

function showModeScreen() {
  clearInterval(challengeTimerInterval);
  document.getElementById("screen-mode").classList.remove("hidden");
  document.querySelector(".app").classList.add("hidden");
  document.getElementById("screen-results").classList.add("hidden");
}

function startEndlessMode() {
  gameMode = "endless";
  document.getElementById("screen-mode").classList.add("hidden");
  document.querySelector(".app").classList.remove("hidden");
  document.getElementById("challenge-header").classList.add("hidden");
  newGameBtn.classList.remove("hidden");
  document.getElementById("nextPuzzleBtn").classList.add("hidden");
  if (typeof instructionsDialog.showModal === "function") {
    instructionsDialog.showModal();
  }
  startNewGame();
}

function startChallengeMode() {
  gameMode = "challenge";
  challengePuzzleIndex = 0;
  challengeResults = [];
  document.getElementById("screen-mode").classList.add("hidden");
  document.querySelector(".app").classList.remove("hidden");
  document.getElementById("challenge-header").classList.remove("hidden");
  newGameBtn.classList.add("hidden");
  document.getElementById("nextPuzzleBtn").classList.add("hidden");
  startChallengePuzzle(0);
}

// ── Challenge puzzles ─────────────────────────────────────────────────────

function startChallengePuzzle(index) {
  targetWord = CHALLENGE_WORDS[index];
  rowIndex = 0;
  colIndex = 0;
  gameOver = false;
  animating = false;
  keyStates.clear();

  boardState = Array.from({ length: MAX_GUESSES }, () =>
    Array.from({ length: WORD_LENGTH }, () => "")
  );

  document.querySelectorAll(".tile").forEach((t) => { t.textContent = ""; t.className = "tile"; });
  document.querySelectorAll(".key").forEach((k) => k.classList.remove("correct", "present", "absent"));

  document.getElementById("puzzleNum").textContent = index + 1;
  document.getElementById("puzzleTotalNum").textContent = CHALLENGE_WORDS.length;
  updateProgressDots(index);

  statusEl.textContent = `Puzzle ${index + 1} of ${CHALLENGE_WORDS.length} — guess the word!`;
  sizeTiles();

  challengeElapsed = 0;
  updateTimerDisplay(0);
  clearInterval(challengeTimerInterval);
  challengeTimerInterval = setInterval(() => {
    challengeElapsed = Math.round((challengeElapsed + 0.1) * 10) / 10;
    updateTimerDisplay(challengeElapsed);
  }, 100);
}

function updateTimerDisplay(s) {
  const m   = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const t   = Math.floor((s * 10) % 10);
  document.getElementById("timerDisplay").textContent =
    `${m}:${String(sec).padStart(2, "0")}.${t}`;
}

function updateProgressDots(currentIndex) {
  const container = document.getElementById("progressDots");
  container.innerHTML = "";
  CHALLENGE_WORDS.forEach((_, i) => {
    const dot = document.createElement("span");
    dot.className = "progress-dot";
    if (i < currentIndex) {
      dot.classList.add(challengeResults[i].failed ? "dot-failed" : "dot-done");
    } else if (i === currentIndex) {
      dot.classList.add("dot-active");
    }
    container.appendChild(dot);
  });
}

function finishChallengePuzzle(failed) {
  clearInterval(challengeTimerInterval);
  const time = Math.round(challengeElapsed * 10) / 10;
  challengeResults.push({ guesses: failed ? 6 : rowIndex + 1, time, failed });

  const isLast = challengePuzzleIndex === CHALLENGE_WORDS.length - 1;
  if (isLast) {
    setTimeout(showResultsScreen, 1800);
  } else {
    document.getElementById("nextPuzzleBtn").classList.remove("hidden");
  }
}

function advanceChallengePuzzle() {
  document.getElementById("nextPuzzleBtn").classList.add("hidden");
  challengePuzzleIndex += 1;
  startChallengePuzzle(challengePuzzleIndex);
}

// ── Results & leaderboard ─────────────────────────────────────────────────

function showResultsScreen() {
  document.querySelector(".app").classList.add("hidden");
  document.getElementById("screen-results").classList.remove("hidden");

  const hasFails     = challengeResults.some((r) => r.failed);
  const totalGuesses = challengeResults.reduce((s, r) => s + (r.failed ? 7 : r.guesses), 0);
  const totalTime    = challengeResults.reduce((s, r) => s + r.time, 0);

  let html = `<table class="results-table"><thead><tr>
    <th>#</th><th>Word</th><th>Guesses</th><th>Time</th>
  </tr></thead><tbody>`;
  challengeResults.forEach((r, i) => {
    html += `<tr>
      <td>${i + 1}</td>
      <td>${CHALLENGE_WORDS[i].toUpperCase()}</td>
      <td class="${r.failed ? "cell-fail" : ""}">${r.failed ? "FAIL" : r.guesses}</td>
      <td>${r.failed ? "\u2014" : r.time.toFixed(1) + "s"}</td>
    </tr>`;
  });
  html += `<tr class="results-total">
    <td colspan="2"><strong>Total</strong></td>
    <td class="${hasFails ? "cell-fail" : ""}"><strong>${hasFails ? "DNF" : totalGuesses}</strong></td>
    <td><strong>${totalTime.toFixed(1)}s</strong></td>
  </tr></tbody></table>`;

  const bd = document.getElementById("resultsBreakdown");
  bd.innerHTML = html;
  bd.dataset.totalGuesses = totalGuesses;
  bd.dataset.totalTime    = totalTime.toFixed(1);
  bd.dataset.hasFails     = hasFails;

  document.getElementById("submitSection").classList.remove("hidden");
  document.getElementById("submitScoreBtn").disabled = false;
  document.getElementById("submitScoreBtn").textContent = "Submit";
  document.getElementById("leaderboardStatus").textContent = "";
  document.getElementById("playerName").value = "";
  loadLeaderboard();
}

async function submitScore() {
  const nameEl = document.getElementById("playerName");
  const name   = nameEl.value.trim();
  if (!name) { nameEl.focus(); return; }
  if (!supabaseClient) {
    document.getElementById("leaderboardStatus").textContent = "Leaderboard unavailable offline.";
    return;
  }

  const bd          = document.getElementById("resultsBreakdown");
  const totalGuesses = parseInt(bd.dataset.totalGuesses);
  const totalTime    = parseFloat(bd.dataset.totalTime);
  const hasFails     = bd.dataset.hasFails === "true";

  const btn = document.getElementById("submitScoreBtn");
  btn.disabled = true;
  btn.textContent = "Submitting\u2026";

  try {
    const { error } = await supabaseClient
      .from("challenge_scores")
      .insert({
        player_name:   escHtml(name),
        scores:        challengeResults,
        total_guesses: totalGuesses,
        total_time:    totalTime,
        has_fails:     hasFails
      });
    if (error) throw error;
    btn.textContent = "Submitted \u2713";
    document.getElementById("submitSection").classList.add("hidden");
    loadLeaderboard();
  } catch {
    btn.disabled = false;
    btn.textContent = "Submit";
    document.getElementById("leaderboardStatus").textContent = "Submission failed — please try again.";
  }
}

async function loadLeaderboard() {
  const container = document.getElementById("leaderboardContainer");
  if (!supabaseClient) {
    container.innerHTML = "<p class='lb-loading'>Leaderboard requires an internet connection.</p>";
    return;
  }
  container.innerHTML = "<p class='lb-loading'>Loading\u2026</p>";
  try {
    const { data, error } = await supabaseClient
      .from("challenge_scores")
      .select("*")
      .order("has_fails",      { ascending: true })
      .order("total_guesses",  { ascending: true })
      .order("total_time",     { ascending: true })
      .limit(20);
    if (error) throw error;
    if (!data.length) { container.innerHTML = "<p class='lb-loading'>No scores yet \u2014 be first!</p>"; return; }
    renderLeaderboard(data);
  } catch {
    container.innerHTML = "<p class='lb-loading'>Could not load leaderboard.</p>";
  }
}

function renderLeaderboard(rows) {
  const n = CHALLENGE_WORDS.length;
  let html = `<table class="leaderboard-table"><thead><tr>
    <th>#</th><th>Name</th>`;
  for (let i = 1; i <= n; i++) html += `<th>P${i}</th>`;
  html += `<th>Total</th></tr></thead><tbody>`;

  rows.forEach((row, rank) => {
    const scores = Array.isArray(row.scores) ? row.scores : [];
    html += `<tr${rank === 0 ? " class=\"lb-top\"" : ""}>
      <td>${rank + 1}</td>
      <td class="lb-name">${escHtml(row.player_name)}</td>`;
    for (let i = 0; i < n; i++) {
      const s = scores[i];
      if (!s) html += `<td>\u2014</td>`;
      else if (s.failed) html += `<td class="cell-fail">FAIL</td>`;
      else html += `<td>${s.guesses}G<br><span class="lb-time">${Number(s.time).toFixed(1)}s</span></td>`;
    }
    const total = row.has_fails
      ? `<span class="cell-fail">DNF</span>`
      : `${row.total_guesses}G\u00a0/\u00a0${Number(row.total_time).toFixed(1)}s`;
    html += `<td>${total}</td></tr>`;
  });

  html += `</tbody></table>`;
  document.getElementById("leaderboardContainer").innerHTML = html;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
