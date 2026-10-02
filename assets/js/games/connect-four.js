(() => {
  'use strict';

  const rows = 6;
  const columns = 7;
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

  function createState() {
    return {
      board: Array.from({ length: rows }, () => Array(columns).fill(null)),
      turn: 0,
      winner: null,
      isDraw: false,
      winningCells: [],
      lastMove: null,
    };
  }

  function legalColumns(state) {
    return Array.from({ length: columns }, (_, column) => column).filter((column) => state.board[0][column] === null);
  }

  function landingRow(board, column) {
    for (let row = rows - 1; row >= 0; row -= 1) if (board[row][column] === null) return row;
    return -1;
  }

  function winningRun(board, row, column, player) {
    for (const [rowStep, columnStep] of directions) {
      const line = [[row, column]];
      for (const sign of [-1, 1]) {
        let nextRow = row + rowStep * sign;
        let nextColumn = column + columnStep * sign;
        while (nextRow >= 0 && nextRow < rows && nextColumn >= 0 && nextColumn < columns && board[nextRow][nextColumn] === player) {
          line.push([nextRow, nextColumn]);
          nextRow += rowStep * sign;
          nextColumn += columnStep * sign;
        }
      }
      if (line.length >= 4) return line;
    }
    return [];
  }

  function applyMove(state, column) {
    if (!Number.isInteger(column) || column < 0 || column >= columns || state.winner !== null || state.isDraw) return false;
    const row = landingRow(state.board, column);
    if (row < 0) return false;
    const player = state.turn;
    state.board[row][column] = player;
    state.lastMove = [row, column];
    const winningCells = winningRun(state.board, row, column, player);
    if (winningCells.length) {
      state.winner = player;
      state.winningCells = winningCells;
    } else if (state.board.every((boardRow) => boardRow.every((cell) => cell !== null))) {
      state.isDraw = true;
    } else {
      state.turn = 1 - player;
    }
    return true;
  }

  function cloneState(state) {
    return { ...state, board: state.board.map((row) => [...row]), winningCells: state.winningCells.map((cell) => [...cell]), lastMove: state.lastMove ? [...state.lastMove] : null };
  }

  function chooseComputerMove(state) {
    const options = legalColumns(state);
    for (const column of options) {
      const next = cloneState(state);
      applyMove(next, column);
      if (next.winner === state.turn) return column;
    }
    for (const column of options) {
      const next = cloneState(state);
      next.turn = 1 - state.turn;
      applyMove(next, column);
      if (next.winner === 1 - state.turn) return column;
    }
    const centerOrder = [3, 2, 4, 1, 5, 0, 6];
    return centerOrder.find((column) => options.includes(column)) ?? options[0];
  }

  function renderBoard(container, state, onMove) {
    container.classList.remove('dots-boxes-board');
    container.classList.add('connect-four-board');
    container.replaceChildren();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const player = state.board[row][column];
        const isWinningCell = state.winningCells.some(([winningRow, winningColumn]) => winningRow === row && winningColumn === column);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = `board-cell connect-four-cell${player === 0 ? ' red' : player === 1 ? ' yellow' : ''}${isWinningCell ? ' winning' : ''}`;
        cell.disabled = state.winner !== null || state.isDraw;
        cell.setAttribute('aria-label', player === null ? `Drop a disc in column ${column + 1}` : `Row ${row + 1}, column ${column + 1}: ${player === 0 ? 'red' : 'yellow'} disc`);
        cell.addEventListener('click', () => onMove(column));
        container.append(cell);
      }
    }
  }

  window.portalGames = window.portalGames || {};
  window.portalGames['connect-four'] = {
    createState,
    applyMove,
    chooseComputerMove,
    getLegalMoves: legalColumns,
    getCurrentMark: (state) => state.turn === 0 ? 'R' : 'Y',
    getTurnHint: (state) => state.turn === 0 ? 'Drop a red disc in a column.' : 'Drop a yellow disc in a column.',
    isOver: (state) => state.winner !== null || state.isDraw,
    renderBoard,
  };
})();
