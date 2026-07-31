"use strict";

const BOARD_SIZE = 12;
const COMMANDER_ORDER = ["gold", "blue", "red"];
const BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"];
const STORAGE_KEY = "trichess-conquered-armies-v1";

const boardElement = document.getElementById("board");
const turnText = document.getElementById("turnText");
const turnDot = document.getElementById("turnDot");
const statusMessage = document.getElementById("statusMessage");
const newGameButton = document.getElementById("newGameButton");
const undoButton = document.getElementById("undoButton");
const rotateButton = document.getElementById("rotateButton");
const soundButton = document.getElementById("soundButton");
const installButton = document.getElementById("installButton");

let deferredInstallPrompt = null;
let selectedPieceId = null;
let legalTargets = [];
let history = [];
let soundEnabled = true;
let boardRotation = 0;
let state = loadState() ?? createInitialState();

function createInitialState() {
  const pieces = [];
  let nextId = 1;

  function addArmy(army, backPositions, pawnPositions) {
    BACK_RANK.forEach((type, index) => {
      const [row, col] = backPositions[index];
      pieces.push(makePiece(nextId++, type, army, row, col));
    });
    pawnPositions.forEach(([row, col]) => {
      pieces.push(makePiece(nextId++, "P", army, row, col));
    });
  }

  addArmy(
    "blue",
    Array.from({ length: 8 }, (_, i) => [0, i + 2]),
    Array.from({ length: 8 }, (_, i) => [1, i + 2])
  );

  addArmy(
    "gold",
    Array.from({ length: 8 }, (_, i) => [11, i + 2]),
    Array.from({ length: 8 }, (_, i) => [10, i + 2])
  );

  addArmy(
    "red",
    Array.from({ length: 8 }, (_, i) => [i + 2, 0]),
    Array.from({ length: 8 }, (_, i) => [i + 2, 1])
  );

  return {
    pieces,
    currentCommander: "gold",
    activeCommanders: [...COMMANDER_ORDER],
    winner: null,
    lastMove: null,
    moveNumber: 1
  };
}

function makePiece(id, type, army, row, col) {
  return { id, type, army, controller: army, row, col, moved: false };
}

function cloneState(value = state) {
  return JSON.parse(JSON.stringify(value));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.pieces) || !saved.currentCommander) return null;
    return saved;
  } catch {
    return null;
  }
}

function resetSelection() {
  selectedPieceId = null;
  legalTargets = [];
}

function render() {
  boardElement.innerHTML = "";
  boardElement.style.setProperty("--board-rotation", `${boardRotation}deg`);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const square = document.createElement("button");
      square.type = "button";
      square.className = `square ${(row + col) % 2 ? "dark" : "light"}`;
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.setAttribute("role", "gridcell");

      if (isDecorativeCorner(row, col)) square.classList.add("corner");

      const piece = getPieceAt(row, col);
      const isSelected = piece?.id === selectedPieceId;
      const legalTarget = legalTargets.find((move) => move.row === row && move.col === col);

      if (isSelected) square.classList.add("selected");
      if (legalTarget) square.classList.add(piece ? "capture" : "legal");
      if (state.lastMove &&
          ((state.lastMove.from.row === row && state.lastMove.from.col === col) ||
           (state.lastMove.to.row === row && state.lastMove.to.col === col))) {
        square.classList.add("last-move");
      }

      if (piece) {
        const token = document.createElement("span");
        token.className = `piece ${piece.army}`;
        if (piece.controller !== piece.army) token.classList.add("conquered");
        token.textContent = piece.type;
        token.title = `${capitalize(piece.controller)} controls ${capitalize(piece.army)} ${pieceName(piece.type)}`;
        token.setAttribute("aria-hidden", "true");
        square.appendChild(token);
        square.setAttribute("aria-label", token.title);
      } else {
        square.setAttribute("aria-label", `Empty square ${row + 1}, ${col + 1}`);
      }

      square.addEventListener("click", () => handleSquareClick(row, col));
      boardElement.appendChild(square);
    }
  }

  updateStatusPanels();
  undoButton.disabled = history.length === 0;
}

function isDecorativeCorner(row, col) {
  return (row < 2 && col < 2) ||
    (row < 2 && col > 9) ||
    (row > 9 && col < 2) ||
    (row > 9 && col > 9);
}

function handleSquareClick(row, col) {
  if (state.winner) return;

  const clickedPiece = getPieceAt(row, col);
  const selectedPiece = getPieceById(selectedPieceId);
  const chosenMove = legalTargets.find((move) => move.row === row && move.col === col);

  if (selectedPiece && chosenMove) {
    executeMove(selectedPiece, row, col);
    return;
  }

  if (clickedPiece && clickedPiece.controller === state.currentCommander) {
    selectedPieceId = clickedPiece.id;
    legalTargets = getLegalMoves(clickedPiece);
    const count = legalTargets.length;
    setMessage(`${pieceName(clickedPiece.type)} selected — ${count} legal move${count === 1 ? "" : "s"}.`);
    render();
    return;
  }

  resetSelection();
  setMessage(`Select a ${capitalize(state.currentCommander)} piece.`);
  render();
}

function executeMove(piece, toRow, toCol) {
  history.push(cloneState());
  if (history.length > 100) history.shift();

  const from = { row: piece.row, col: piece.col };
  const target = getPieceAt(toRow, toCol);
  let announcement = `${capitalize(piece.controller)} moved ${pieceName(piece.type)}.`;

  if (target) {
    removePiece(target.id);
    playTone(target.type === "K" ? 170 : 250, target.type === "K" ? 0.25 : 0.1);
    announcement = `${capitalize(piece.controller)} captured ${capitalize(target.army)} ${pieceName(target.type)}.`;

    if (target.type === "K") {
      conquerCommander(target.controller, piece.controller);
      announcement = `${capitalize(piece.controller)} defeated ${capitalize(target.controller)} and took command of the surviving army.`;
    }
  } else {
    playTone(420, 0.06);
  }

  piece.row = toRow;
  piece.col = toCol;
  piece.moved = true;

  if (piece.type === "P" && isPromotionSquare(piece)) {
    piece.type = "Q";
    announcement += " Pawn promoted to Queen.";
    playTone(620, 0.15);
  }

  state.lastMove = { from, to: { row: toRow, col: toCol } };
  state.moveNumber += 1;
  resetSelection();

  if (state.activeCommanders.length === 1) {
    state.winner = state.activeCommanders[0];
    state.currentCommander = state.winner;
    announcement = `${capitalize(state.winner)} wins and commands the entire field.`;
    playVictorySound();
  } else {
    state.currentCommander = getNextActiveCommander(state.currentCommander);
    if (isCommanderInCheck(state.currentCommander)) {
      announcement += ` ${capitalize(state.currentCommander)} is in check.`;
    }
  }

  setMessage(announcement);
  saveState();
  render();
}

function conquerCommander(defeated, conqueror) {
  state.activeCommanders = state.activeCommanders.filter((commander) => commander !== defeated);
  state.pieces.forEach((piece) => {
    if (piece.controller === defeated) piece.controller = conqueror;
  });
}

function getNextActiveCommander(current) {
  const startIndex = COMMANDER_ORDER.indexOf(current);
  for (let offset = 1; offset <= COMMANDER_ORDER.length; offset += 1) {
    const candidate = COMMANDER_ORDER[(startIndex + offset) % COMMANDER_ORDER.length];
    if (state.activeCommanders.includes(candidate)) return candidate;
  }
  return current;
}

function getLegalMoves(piece) {
  return getPseudoLegalMoves(piece).filter((move) => {
    const simulated = cloneState();
    const simulatedPiece = simulated.pieces.find((item) => item.id === piece.id);
    const captured = simulated.pieces.find((item) => item.row === move.row && item.col === move.col);

    if (captured) {
      simulated.pieces = simulated.pieces.filter((item) => item.id !== captured.id);
      if (captured.type === "K") {
        simulated.activeCommanders = simulated.activeCommanders.filter((commander) => commander !== captured.controller);
        simulated.pieces.forEach((item) => {
          if (item.controller === captured.controller) item.controller = simulatedPiece.controller;
        });
      }
    }

    simulatedPiece.row = move.row;
    simulatedPiece.col = move.col;
    return !isCommanderInCheck(piece.controller, simulated);
  });
}

function getPseudoLegalMoves(piece, sourceState = state) {
  const moves = [];

  if (piece.type === "P") return getPawnMoves(piece, sourceState);
  if (piece.type === "N") return getJumpMoves(piece, [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]], sourceState);
  if (piece.type === "K") return getJumpMoves(piece, [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]], sourceState);

  const directions = [];
  if (["R", "Q"].includes(piece.type)) directions.push([-1,0],[1,0],[0,-1],[0,1]);
  if (["B", "Q"].includes(piece.type)) directions.push([-1,-1],[-1,1],[1,-1],[1,1]);

  directions.forEach(([dr, dc]) => {
    let row = piece.row + dr;
    let col = piece.col + dc;
    while (inBounds(row, col)) {
      const occupant = getPieceAt(row, col, sourceState);
      if (!occupant) {
        moves.push({ row, col });
      } else {
        if (occupant.controller !== piece.controller) moves.push({ row, col });
        break;
      }
      row += dr;
      col += dc;
    }
  });

  return moves;
}

function getJumpMoves(piece, offsets, sourceState) {
  return offsets
    .map(([dr, dc]) => ({ row: piece.row + dr, col: piece.col + dc }))
    .filter(({ row, col }) => {
      if (!inBounds(row, col)) return false;
      const occupant = getPieceAt(row, col, sourceState);
      return !occupant || occupant.controller !== piece.controller;
    });
}

function getPawnMoves(piece, sourceState) {
  const moves = [];
  const [dr, dc] = pawnForward(piece.army);
  const oneRow = piece.row + dr;
  const oneCol = piece.col + dc;

  if (inBounds(oneRow, oneCol) && !getPieceAt(oneRow, oneCol, sourceState)) {
    moves.push({ row: oneRow, col: oneCol });
    const twoRow = piece.row + dr * 2;
    const twoCol = piece.col + dc * 2;
    if (!piece.moved && inBounds(twoRow, twoCol) && !getPieceAt(twoRow, twoCol, sourceState)) {
      moves.push({ row: twoRow, col: twoCol });
    }
  }

  pawnCaptureOffsets(piece.army).forEach(([captureDr, captureDc]) => {
    const row = piece.row + captureDr;
    const col = piece.col + captureDc;
    if (!inBounds(row, col)) return;
    const occupant = getPieceAt(row, col, sourceState);
    if (occupant && occupant.controller !== piece.controller) moves.push({ row, col });
  });

  return moves;
}

function pawnForward(army) {
  if (army === "blue") return [1, 0];
  if (army === "gold") return [-1, 0];
  return [0, 1];
}

function pawnCaptureOffsets(army) {
  if (army === "blue") return [[1, -1], [1, 1]];
  if (army === "gold") return [[-1, -1], [-1, 1]];
  return [[-1, 1], [1, 1]];
}

function isPromotionSquare(piece) {
  if (piece.army === "blue") return piece.row === BOARD_SIZE - 1;
  if (piece.army === "gold") return piece.row === 0;
  return piece.col === BOARD_SIZE - 1;
}

function isCommanderInCheck(commander, sourceState = state) {
  if (!sourceState.activeCommanders.includes(commander)) return false;
  const king = sourceState.pieces.find((piece) => piece.type === "K" && piece.army === commander);
  if (!king) return false;

  return sourceState.pieces.some((enemy) => {
    if (enemy.controller === commander) return false;
    return pieceAttacksSquare(enemy, king.row, king.col, sourceState);
  });
}

function pieceAttacksSquare(piece, targetRow, targetCol, sourceState) {
  if (piece.type === "P") {
    return pawnCaptureOffsets(piece.army).some(([dr, dc]) => piece.row + dr === targetRow && piece.col + dc === targetCol);
  }

  if (piece.type === "N") {
    return [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]
      .some(([dr, dc]) => piece.row + dr === targetRow && piece.col + dc === targetCol);
  }

  if (piece.type === "K") {
    return Math.max(Math.abs(piece.row - targetRow), Math.abs(piece.col - targetCol)) === 1;
  }

  const rowDelta = targetRow - piece.row;
  const colDelta = targetCol - piece.col;
  const absoluteRow = Math.abs(rowDelta);
  const absoluteCol = Math.abs(colDelta);

  const orthogonal = rowDelta === 0 || colDelta === 0;
  const diagonal = absoluteRow === absoluteCol;
  const validDirection = (piece.type === "R" && orthogonal) ||
    (piece.type === "B" && diagonal) ||
    (piece.type === "Q" && (orthogonal || diagonal));

  if (!validDirection) return false;

  const stepRow = Math.sign(rowDelta);
  const stepCol = Math.sign(colDelta);
  let row = piece.row + stepRow;
  let col = piece.col + stepCol;

  while (row !== targetRow || col !== targetCol) {
    if (getPieceAt(row, col, sourceState)) return false;
    row += stepRow;
    col += stepCol;
  }

  return true;
}

function getPieceAt(row, col, sourceState = state) {
  return sourceState.pieces.find((piece) => piece.row === row && piece.col === col);
}

function getPieceById(id, sourceState = state) {
  return sourceState.pieces.find((piece) => piece.id === id);
}

function removePiece(id) {
  state.pieces = state.pieces.filter((piece) => piece.id !== id);
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function updateStatusPanels() {
  const commander = state.currentCommander;
  turnText.textContent = state.winner ? `${capitalize(state.winner)} wins` : capitalize(commander);
  turnDot.className = `turn-dot ${commander}`;

  COMMANDER_ORDER.forEach((army) => {
    const row = document.getElementById(`army-${army}`);
    const status = document.getElementById(`${army}Status`);
    const armyPieces = state.pieces.filter((piece) => piece.army === army);
    const controller = armyPieces[0]?.controller;
    const active = state.activeCommanders.includes(army);

    row.classList.toggle("eliminated", !active);
    if (!active && controller) {
      status.textContent = `${armyPieces.length} pieces — commanded by ${capitalize(controller)}`;
    } else {
      status.textContent = `${armyPieces.length} piece${armyPieces.length === 1 ? "" : "s"}`;
    }
  });

  if (state.winner) statusMessage.textContent = `${capitalize(state.winner)} has conquered both opposing armies.`;
}

function setMessage(message) {
  statusMessage.textContent = message;
}

function pieceName(type) {
  return ({ K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" })[type] ?? type;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function newGame() {
  state = createInitialState();
  history = [];
  resetSelection();
  setMessage("New game started. Select a Gold piece.");
  saveState();
  render();
}

function undoMove() {
  const previous = history.pop();
  if (!previous) return;
  state = previous;
  resetSelection();
  setMessage("Previous move restored.");
  saveState();
  render();
}

function rotateBoard() {
  boardRotation = (boardRotation + 90) % 360;
  render();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  soundButton.textContent = `Sound: ${soundEnabled ? "On" : "Off"}`;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  if (soundEnabled) playTone(520, 0.07);
}

function playTone(frequency, duration) {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.06, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch {
    // Audio is optional and may be blocked by the browser.
  }
}

function playVictorySound() {
  [392, 523, 659, 784].forEach((frequency, index) => {
    window.setTimeout(() => playTone(frequency, 0.18), index * 130);
  });
}

newGameButton.addEventListener("click", newGame);
undoButton.addEventListener("click", undoMove);
rotateButton.addEventListener("click", rotateBoard);
soundButton.addEventListener("click", toggleSound);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  deferredInstallPrompt = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker registration failed:", error);
    });
  });
}

setMessage(state.winner
  ? `${capitalize(state.winner)} has conquered both opposing armies.`
  : `Select a ${capitalize(state.currentCommander)} piece.`);
render();
