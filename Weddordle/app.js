const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

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

const keyStateOrder = { unknown: 0, absent: 1, present: 2, correct: 3 };
const keyStates = new Map();

init();

async function init() {
  buildBoard();
  buildKeyboard();
  sizeTiles();
  window.addEventListener("resize", sizeTiles);
  wireEvents();

  // Start a game immediately with fallback words so the board is ready.
  startNewGame();

  // Show instructions after the board is set up.
  if (typeof instructionsDialog.showModal === "function") {
    instructionsDialog.showModal();
  }

  // Load word lists in the background; updates dictionary/answers for
  // subsequent games without touching the already-started game.
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
      return;
    }

    if (rowIndex === MAX_GUESSES - 1) {
      gameOver = true;
      animating = false;
      statusEl.textContent = `Out of tries. The word was ${targetWord.toUpperCase()}.`;
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
