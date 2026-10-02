(() => {
  'use strict';

  const boxRows = 4;
  const boxColumns = 4;

  function createState() {
    return {
      horizontal: Array.from({ length: boxRows + 1 }, () => Array(boxColumns).fill(null)),
      vertical: Array.from({ length: boxRows }, () => Array(boxColumns + 1).fill(null)),
      boxes: Array.from({ length: boxRows }, () => Array(boxColumns).fill(null)),
      scores: [0, 0],
      turn: 0,
      winner: null,
      isDraw: false,
      lastMove: null,
    };
  }

  function legalMoves(state) {
    const moves = [];
    state.horizontal.forEach((row, rowIndex) => row.forEach((owner, column) => {
      if (owner === null) moves.push({ orientation: 'h', row: rowIndex, column });
    }));
    state.vertical.forEach((row, rowIndex) => row.forEach((owner, column) => {
      if (owner === null) moves.push({ orientation: 'v', row: rowIndex, column });
    }));
    return moves;
  }

  function boxEdgesOwned(state, row, column) {
    return [
      state.horizontal[row][column],
      state.horizontal[row + 1][column],
      state.vertical[row][column],
      state.vertical[row][column + 1],
    ].filter((owner) => owner !== null).length;
  }

  function adjacentBoxes(move) {
    if (move.orientation === 'h') {
      return [move.row > 0 ? [move.row - 1, move.column] : null, move.row < boxRows ? [move.row, move.column] : null].filter(Boolean);
    }
    return [move.column > 0 ? [move.row, move.column - 1] : null, move.column < boxColumns ? [move.row, move.column] : null].filter(Boolean);
  }

  function applyMove(state, move) {
    if (state.winner !== null || state.isDraw || !move || !['h', 'v'].includes(move.orientation)) return false;
    const edges = move.orientation === 'h' ? state.horizontal : state.vertical;
    if (!Number.isInteger(move.row) || !Number.isInteger(move.column) || !edges[move.row] || edges[move.row][move.column] !== null) return false;
    const player = state.turn;
    edges[move.row][move.column] = player;
    state.lastMove = { ...move };
    let boxesClaimed = 0;
    for (const [row, column] of adjacentBoxes(move)) {
      if (state.boxes[row][column] === null && boxEdgesOwned(state, row, column) === 4) {
        state.boxes[row][column] = player;
        state.scores[player] += 1;
        boxesClaimed += 1;
      }
    }
    if (state.scores[0] + state.scores[1] === boxRows * boxColumns) {
      state.isDraw = state.scores[0] === state.scores[1];
      state.winner = state.isDraw ? null : state.scores[0] > state.scores[1] ? 0 : 1;
    } else if (boxesClaimed === 0) {
      state.turn = 1 - player;
    }
    return true;
  }

  function copyState(state) {
    return {
      ...state,
      horizontal: state.horizontal.map((row) => [...row]),
      vertical: state.vertical.map((row) => [...row]),
      boxes: state.boxes.map((row) => [...row]),
      scores: [...state.scores],
      lastMove: state.lastMove ? { ...state.lastMove } : null,
    };
  }

  function chooseComputerMove(state) {
    const moves = legalMoves(state);
    for (const move of moves) {
      const next = copyState(state);
      applyMove(next, move);
      if (next.scores[state.turn] > state.scores[state.turn]) return move;
    }
    const safeMoves = moves.filter((move) => adjacentBoxes(move).every(([row, column]) => state.boxes[row][column] !== null || boxEdgesOwned(state, row, column) < 2));
    return safeMoves[0] || moves[0];
  }

  function renderBoard(container, state, onMove) {
    container.classList.remove('connect-four-board');
    container.classList.add('dots-boxes-board');
    container.replaceChildren();
    for (let gridRow = 0; gridRow < boxRows * 2 + 1; gridRow += 1) {
      for (let gridColumn = 0; gridColumn < boxColumns * 2 + 1; gridColumn += 1) {
        const evenRow = gridRow % 2 === 0;
        const evenColumn = gridColumn % 2 === 0;
        if (evenRow && evenColumn) {
          const dot = document.createElement('span');
          dot.className = 'dots-boxes-dot';
          dot.setAttribute('aria-hidden', 'true');
          container.append(dot);
          continue;
        }
        if (!evenRow && !evenColumn) {
          const boxOwner = state.boxes[(gridRow - 1) / 2][(gridColumn - 1) / 2];
          const box = document.createElement('span');
          box.className = `dots-boxes-square${boxOwner === 0 ? ' red' : boxOwner === 1 ? ' blue' : ''}`;
          box.setAttribute('aria-label', boxOwner === null ? 'Unclaimed box' : `${boxOwner === 0 ? 'Player 1' : 'Player 2'} claimed box`);
          container.append(box);
          continue;
        }
        const horizontal = evenRow;
        const move = { orientation: horizontal ? 'h' : 'v', row: horizontal ? gridRow / 2 : (gridRow - 1) / 2, column: horizontal ? (gridColumn - 1) / 2 : gridColumn / 2 };
        const edges = horizontal ? state.horizontal : state.vertical;
        const owner = edges[move.row][move.column];
        const edge = document.createElement('button');
        edge.type = 'button';
        edge.className = `dots-boxes-edge ${horizontal ? 'horizontal' : 'vertical'}${owner === 0 ? ' red' : owner === 1 ? ' blue' : ''}`;
        edge.disabled = owner !== null || state.winner !== null || state.isDraw;
        edge.setAttribute('aria-label', owner === null ? `Claim ${horizontal ? 'horizontal' : 'vertical'} line ${move.row + 1}, ${move.column + 1}` : `${horizontal ? 'Horizontal' : 'Vertical'} line claimed`);
        edge.addEventListener('click', () => onMove(move));
        container.append(edge);
      }
    }
  }

  window.portalGames = window.portalGames || {};
  window.portalGames.dots = {
    createState,
    applyMove,
    chooseComputerMove,
    getLegalMoves: legalMoves,
    getCurrentMark: (state) => state.turn === 0 ? 'R' : 'B',
    getTurnHint: (state) => `Choose a line. Score ${state.scores[0]}–${state.scores[1]}.`,
    isOver: (state) => state.winner !== null || state.isDraw,
    renderBoard,
  };
})();
