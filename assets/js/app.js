(() => {
  'use strict';

  // Demo helper: visiting `?reset` clears all saved portal state, then reloads clean.
  if (new URLSearchParams(location.search).has('reset')) {
    [localStorage, sessionStorage].forEach((store) => {
      Object.keys(store).filter((key) => key.startsWith('gameportal.')).forEach((key) => store.removeItem(key));
    });
    location.replace(location.pathname + location.hash);
    return;
  }

  const API_KEY = 'gameportal.apiBaseUrl';
  const BUILDER_KEY = 'gameportal.builderUrl';
  const MATCHES_KEY = 'gameportal.matches';
  const PENDING_MOVES_KEY = 'gameportal.pendingMoves';
  const HIDDEN_MATCHES_KEY = 'gameportal.hiddenMatches';
  const TOKEN_KEY = 'gameportal.accessToken';
  const DEMO_PROFILE_KEY = 'gameportal.demoProfile';
  const PROFILE_SETTINGS_KEY = 'gameportal.profileSettings';
  const MOCK_MESSAGES_KEY = 'gameportal.mockMessages';
  const LANGUAGE_KEY = 'gameportal.language';
  const gameCatalog = [
    { id: 'ttt', title: 'Tic-Tac-Toe', description: 'Three in a row. A tiny game with room for rematches.', category: 'quick', players: '2 players', duration: '3 min', offline: true, art: 'board', tone: 'tone-green', playable: true, allowedPlayers: [2] },
    { id: 'poker', title: 'Poker', description: 'Read the table, make your move, and see it through.', category: 'cards', players: '2-10 players', duration: '15 min', offline: false, art: 'cards', tone: 'tone-coral', playable: false, allowedPlayers: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
    { id: 'checkers', title: 'Chinese checkers', description: 'Cross the board. Plan a few jumps ahead.', category: 'strategy', players: '2, 3 or 6', duration: '20 min', offline: false, art: 'checkers', tone: 'tone-blue', playable: false, allowedPlayers: [2, 3, 6] },
    { id: 'dots', title: 'Dots & boxes', description: 'Claim a square, then keep the chain going.', category: 'quick', players: '2 players', duration: '5 min', offline: true, art: 'board', tone: 'tone-gold', playable: true, allowedPlayers: [2] },
    { id: 'connect-four', title: 'Connect Four', description: 'Drop a disc. Set up the next four.', category: 'strategy', players: '2 players', duration: '5 min', offline: true, art: 'checkers', tone: 'tone-green', playable: true, allowedPlayers: [2] },
    { id: 'memory', title: 'Memory match', description: 'Find the pairs before the other player does.', category: 'cards', players: '2 players', duration: '7 min', offline: false, art: 'cards', tone: 'tone-blue', playable: false, allowedPlayers: [2] },
  ];

  const state = {
    apiBaseUrl: localStorage.getItem(API_KEY) || '',
    builderUrl: localStorage.getItem(BUILDER_KEY) || 'https://github.com/marcelle-r/gamebuilder',
    authToken: sessionStorage.getItem(TOKEN_KEY) || '',
    currentUser: null,
    demoProfile: readDemoProfile(),
    language: localStorage.getItem(LANGUAGE_KEY) || 'en',
    profileSettings: null,
    mockMessages: readMockMessages(),
    selectedConversationId: '',
    demoLobby: null,
    mockPhone: '',
    games: [...gameCatalog],
    matches: readMatches(),
    pendingMoves: readPendingMoves(),
    hiddenMatchIds: readHiddenMatches(),
    currentFilter: 'all',
    currentMatchFilter: 'active',
    search: '',
    currentMatch: null,
    gameFrame: null,
    matchPollInFlight: false,
    matchPollTimer: null,
    lastPollErrorAt: 0,
    toastTimer: null,
  };

  state.profileSettings = readProfileSettings(profileSettingsIdentity(null, state.demoProfile), state.demoProfile.displayName);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const safeText = (value, fallback = '') => typeof value === 'string' && value.trim() ? value.trim() : fallback;
  function profileSettingsIdentity(user, demoProfile) {
    return user
      ? `user:${String(user.id || user.email || user.displayName)}`
      : `demo:${String(demoProfile.displayName || 'Guest player').toLowerCase()}`;
  }

  function profileSettingsStorageKey(identity) {
    return `${PROFILE_SETTINGS_KEY}:${encodeURIComponent(identity)}`;
  }
  const avatarPresetMarks = { initials: '', sun: '✷', orbit: '◉', grid: '▦' };

  function renderUserAvatar(element, name) {
    const settings = state.profileSettings;
    element.replaceChildren();
    element.classList.remove('has-photo', 'avatar-art-initials', 'avatar-art-sun', 'avatar-art-orbit', 'avatar-art-grid');
    element.setAttribute('aria-label', `${name} profile picture`);
    if (settings.avatarDataUrl) {
      const image = makeElement('img', 'avatar-photo');
      image.src = settings.avatarDataUrl;
      image.alt = '';
      element.classList.add('has-photo');
      element.append(image);
      return;
    }
    const preset = avatarPresetMarks[settings.avatarPreset] === undefined ? 'initials' : settings.avatarPreset;
    element.classList.add(`avatar-art-${preset}`);
    element.textContent = preset === 'initials' ? name.charAt(0).toUpperCase() : avatarPresetMarks[preset];
  }

  function renderContactAvatar(element, name) {
    const presets = {
      Alex: ['peer-avatar-blue', 'A'],
      Mina: ['peer-avatar-coral', 'M'],
      Jordan: ['peer-avatar-lime', 'J'],
      Riley: ['peer-avatar-gold', 'R'],
      GamePortal: ['peer-avatar-brand', 'G'],
    };
    const [className, mark] = presets[name] || ['peer-avatar-neutral', name.charAt(0).toUpperCase()];
    element.classList.add(className);
    element.textContent = mark;
  }

  function readMatches() {
    try {
      const saved = JSON.parse(localStorage.getItem(MATCHES_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function readDemoProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) || 'null');
      if (!saved || typeof saved.displayName !== 'string') return { displayName: 'Guest player', provider: 'Guest', signedIn: false };
      return { ...saved, signedIn: typeof saved.signedIn === 'boolean' ? saved.signedIn : saved.displayName !== 'Guest player' || saved.provider !== 'Guest' };
    } catch {
      return { displayName: 'Guest player', provider: 'Guest', signedIn: false };
    }
  }

  function readProfileSettings(identity, profileName) {
    const username = profileName.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'player';
    const defaults = {
      username,
      email: `${username}@example.test`,
      phone: '',
      avatarDataUrl: '',
      avatarPreset: 'initials',
      theme: 'light',
      hasSamplePayment: true,
      socials: { google: false, facebook: false },
      notifications: { matchUpdates: true, invitations: true, productNews: false },
    };
    try {
      const scopedKey = profileSettingsStorageKey(identity);
      let serializedSettings = localStorage.getItem(scopedKey);
      if (!serializedSettings) {
        serializedSettings = localStorage.getItem(PROFILE_SETTINGS_KEY);
        if (serializedSettings) {
          localStorage.setItem(scopedKey, serializedSettings);
          localStorage.removeItem(PROFILE_SETTINGS_KEY);
        }
      }
      const saved = JSON.parse(serializedSettings || 'null');
      if (!saved || typeof saved !== 'object') return defaults;
      return {
        ...defaults,
        ...saved,
        avatarDataUrl: typeof saved.avatarDataUrl === 'string' && saved.avatarDataUrl.startsWith('data:image/') ? saved.avatarDataUrl : '',
        avatarPreset: ['initials', 'sun', 'orbit', 'grid'].includes(saved.avatarPreset) ? saved.avatarPreset : 'initials',
        theme: saved.theme === 'dark' ? 'dark' : 'light',
        socials: { ...defaults.socials, ...(saved.socials || {}) },
        notifications: { ...defaults.notifications, ...(saved.notifications || {}) },
      };
    } catch {
      return defaults;
    }
  }

  function createDemoMessages() {
    return [
      { id: 'message-rematch', from: 'Alex', subject: 'Rematch this weekend?', body: 'I am free Saturday afternoon if you want another quick round.', received: '12 min ago', unread: true, thread: [{ sender: 'Alex', body: 'Want to run another Tic-Tac-Toe match?', time: 'Yesterday' }, { sender: 'You', body: 'Definitely. I am free this weekend.', time: 'Yesterday' }, { sender: 'Alex', body: 'I am free Saturday afternoon if you want another quick round.', time: '12 min ago' }] },
      { id: 'message-lobby', from: 'Mina', subject: 'Open table invite', body: 'I left a Tic-Tac-Toe lobby open if you would like to join.', received: '1 hr ago', unread: true, thread: [{ sender: 'Mina', body: 'I have one open seat at my table.', time: '2 hr ago' }, { sender: 'You', body: 'Which game are you playing?', time: '1 hr ago' }, { sender: 'Mina', body: 'I left a Tic-Tac-Toe lobby open if you would like to join.', time: '1 hr ago' }] },
      { id: 'message-welcome', from: 'GamePortal', subject: 'Welcome to your player space', body: 'Your profile and preferences are saved locally in this demo.', received: 'Yesterday', unread: false, thread: [{ sender: 'GamePortal', body: 'Your profile and preferences are saved locally in this demo.', time: 'Yesterday' }] },
    ];
  }

  function readMockMessages() {
    const defaults = createDemoMessages();
    try {
      const saved = JSON.parse(localStorage.getItem(MOCK_MESSAGES_KEY) || 'null');
      if (!Array.isArray(saved)) return defaults;
      const savedById = new Map(saved.map((message) => [message.id, message]));
      const defaultIds = new Set(defaults.map((message) => message.id));
      return [
        ...defaults.map((message) => ({ ...message, ...(savedById.get(message.id) || {}) })),
        ...saved.filter((message) => !defaultIds.has(message.id)),
      ];
    } catch {
      return defaults;
    }
  }

  function persistProfileSettings() {
    const identity = profileSettingsIdentity(state.currentUser, state.demoProfile);
    localStorage.setItem(profileSettingsStorageKey(identity), JSON.stringify(state.profileSettings));
  }

  function persistMockMessages() {
    localStorage.setItem(MOCK_MESSAGES_KEY, JSON.stringify(state.mockMessages));
  }

  async function avatarImageData(file) {
    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!acceptedTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
    const bitmap = await createImageBitmap(file);
    const size = 256;
    const cropSize = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.round((bitmap.width - cropSize) / 2);
    const sourceY = Math.round((bitmap.height - cropSize) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      throw new Error('This browser could not process the image.');
    }
    context.drawImage(bitmap, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function createDemoMatches() {
    const connectFourState = window.portalGames['connect-four'].createState();
    [0, 3, 1, 4, 2, 5].forEach((column) => window.portalGames['connect-four'].applyMove(connectFourState, column));
    const dotsState = window.portalGames.dots.createState();
    [
      { orientation: 'h', row: 0, column: 0 },
      { orientation: 'v', row: 0, column: 0 },
      { orientation: 'h', row: 1, column: 1 },
      { orientation: 'v', row: 1, column: 2 },
      { orientation: 'h', row: 0, column: 2 },
    ].forEach((move) => window.portalGames.dots.applyMove(dotsState, move));
    return [
      { id: 'sample-match-42', title: 'Tic-Tac-Toe', gameId: 'ttt', status: 'active', mode: 'PING_PONG', opponent: 'Alex', version: 18, state: { board: ['X', null, 'O', null, null, null, null, null, null] }, turnPlayerIndex: 0, myPlayerIndex: 0, remote: true, isMock: true, isCurrentUserPlayer: true, gameEngineKey: 'tic-tac-toe', previewText: 'Your turn · Match #42 · Last update just now', createdAt: new Date().toISOString() },
      { id: 'sample-poker-friday', title: 'Poker · Friday table', gameId: 'poker', status: 'active', mode: 'PING_PONG', opponent: 'Riley', version: 31, state: null, turnPlayerIndex: 1, myPlayerIndex: 0, remote: true, isMock: true, isCurrentUserPlayer: true, gameEngineKey: '', previewText: 'Riley is thinking… · Your move follows', createdAt: new Date().toISOString() },
      { id: 'sample-ttt-finished', title: 'Tic-Tac-Toe', gameId: 'ttt', status: 'finished', mode: 'PING_PONG', opponent: 'Sam', version: 9, state: { board: ['X', 'X', 'X', 'O', 'O', null, null, null, null], winner: 0 }, turnPlayerIndex: null, myPlayerIndex: 0, remote: true, isMock: true, isCurrentUserPlayer: true, gameEngineKey: 'tic-tac-toe', previewText: 'Ended yesterday · You won', createdAt: new Date().toISOString() },
      { id: 'sample-poker-local', title: 'Poker · Pass-and-play · 3 players', gameId: 'poker', status: 'finished', mode: 'PASS_AND_PLAY', opponent: '2 players', version: 12, state: null, turnPlayerIndex: null, myPlayerIndex: 0, remote: false, isMock: true, previewText: 'Finished on this device', createdAt: new Date().toISOString() },
      { id: 'sample-lobby-ttt-open', title: 'Tic-Tac-Toe · Open table', gameId: 'ttt', status: 'lobby', mode: 'PING_PONG', opponent: 'Mina', version: 0, state: null, turnPlayerIndex: null, myPlayerIndex: null, remote: true, isMock: true, isCurrentUserPlayer: false, previewText: 'Open ping-pong table · 1 of 2 players · Join policy: OPEN', createdAt: new Date().toISOString() },
      { id: 'sample-lobby-checkers', title: 'Chinese checkers · Open table', gameId: 'checkers', status: 'lobby', mode: 'REAL_TIME', opponent: 'Kai', version: 0, state: null, turnPlayerIndex: null, myPlayerIndex: null, remote: true, isMock: true, isCurrentUserPlayer: false, previewText: 'Open real-time table · 2 of 6 players · Waiting for more players', createdAt: new Date().toISOString() },
      { id: 'sample-watch-connect-four', title: 'Connect Four · Public table', gameId: 'connect-four', status: 'active', mode: 'REAL_TIME', opponent: 'Mina vs. Alex', version: 6, state: connectFourState, turnPlayerIndex: connectFourState.turn, myPlayerIndex: null, remote: true, isMock: true, isDemoPublic: true, isCurrentUserPlayer: false, isSpectator: true, capabilities: { spectators: true }, gameEngineKey: 'connect-four', raw: { id: 'sample-watch-connect-four', players: [{ userId: 'demo-mina', playerIndex: 0, displayName: 'Mina' }, { userId: 'demo-alex', playerIndex: 1, displayName: 'Alex' }], publicView: connectFourState }, previewText: 'Real-time public demo · 2 players · Watch only', createdAt: new Date().toISOString() },
      { id: 'sample-watch-dots', title: 'Dots & Boxes · Public table', gameId: 'dots', status: 'active', mode: 'PING_PONG', opponent: 'Jordan vs. Riley', version: 5, state: dotsState, turnPlayerIndex: dotsState.turn, myPlayerIndex: null, remote: true, isMock: true, isDemoPublic: true, isCurrentUserPlayer: false, isSpectator: true, capabilities: { spectators: true }, gameEngineKey: 'dots', raw: { id: 'sample-watch-dots', players: [{ userId: 'demo-jordan', playerIndex: 0, displayName: 'Jordan' }, { userId: 'demo-riley', playerIndex: 1, displayName: 'Riley' }], publicView: dotsState }, previewText: 'Ping-pong public demo · 2 players · Watch only', createdAt: new Date().toISOString() },
    ];
  }

  function ensureDemoMatches() {
    if (state.authToken) return;
    const existingIds = new Set(state.matches.map((match) => match.id));
    state.matches = [...createDemoMatches().filter((match) => !existingIds.has(match.id)), ...state.matches];
    persistMatches();
  }

  function readHiddenMatches() {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_MATCHES_KEY) || '[]');
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  }

  function readPendingMoves() {
    try {
      const saved = JSON.parse(localStorage.getItem(PENDING_MOVES_KEY) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function hiddenMatchKey(matchId) {
    return `${state.currentUser ? state.currentUser.id : 'guest'}:${matchId}`;
  }

  function persistMatches() {
    localStorage.setItem(MATCHES_KEY, JSON.stringify(state.matches));
    $('#match-count').textContent = String(state.matches.filter((match) => match.status !== 'finished').length);
  }

  function currentPendingMoves() {
    return state.pendingMoves.filter((move) => move.userId === (state.currentUser && state.currentUser.id));
  }

  function persistPendingMoves() {
    localStorage.setItem(PENDING_MOVES_KEY, JSON.stringify(state.pendingMoves));
    const moves = currentPendingMoves();
    $('#pending-moves-count').textContent = `${moves.length} pending`;
    $('#pending-moves-button').hidden = moves.length === 0;
    renderPendingMoves();
  }

  function renderPendingMoves() {
    const list = $('#pending-move-list');
    if (!list) return;
    list.replaceChildren();
    const moves = currentPendingMoves();
    $('#offline-state').textContent = navigator.onLine ? 'Online. Queued moves will be submitted when you retry.' : 'Offline. Queued remote moves are not confirmed yet.';
    $('#retry-pending-button').disabled = !navigator.onLine || !state.authToken || !moves.some((move) => move.status === 'queued');
    $('#discard-pending-button').disabled = !moves.some((move) => move.status === 'needs-review');
    for (const move of moves) {
      const row = makeElement('div', 'pending-move');
      const copy = makeElement('div');
      copy.append(makeElement('strong', '', `${move.title} · Place X in cell ${move.cell + 1}`), makeElement('small', '', `Match #${move.matchId} · expected version ${move.expectedVersion}`));
      row.append(copy, makeElement('span', 'pending-badge', move.status === 'needs-review' ? 'Needs review' : 'Queued'));
      list.append(row);
    }
    if (moves.length === 0) list.append(makeElement('p', 'empty-state', 'No pending moves.'));
  }

  function normalizedBase() {
    return state.apiBaseUrl.trim().replace(/\/+$/, '');
  }

  async function apiRequest(path, options = {}) {
    const base = normalizedBase();
    if (!base) throw new Error('Add the backend API URL in connection settings first.');
    const { authenticated = true, ...requestOptions } = options;
    const headers = {
      Accept: 'application/json',
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(authenticated && state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
      ...requestOptions.headers,
    };
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...requestOptions,
        headers,
      });
    } catch (error) {
      if (error instanceof TypeError) throw new Error('Could not reach the API. Check the URL, server, and CORS settings.');
      throw error;
    }
    const raw = await response.text();
    let payload = null;
    if (raw) {
      try { payload = JSON.parse(raw); } catch { payload = { message: raw }; }
    }
    if (response.status === 401 && authenticated && state.authToken) clearSession();
    if (!response.ok) {
      const detail = payload && (payload.message || payload.error);
      throw new Error(detail ? `${response.status}: ${Array.isArray(detail) ? detail.join(', ') : detail}` : `API request failed (${response.status}).`);
    }
    return payload;
  }

  function unwrapList(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of keys) if (Array.isArray(payload[key])) return payload[key];
    if (payload.data && payload.data !== payload) return unwrapList(payload.data, keys);
    return [];
  }

  function normalizeGame(raw) {
    const id = safeText(raw.id || raw.game_id || raw.gameId);
    if (!id) return null;
    const title = safeText(raw.title || raw.name || raw.slug);
    const base = gameCatalog.find((game) => game.id === id || game.title.toLowerCase() === title.toLowerCase());
    const versions = Array.isArray(raw.versions) ? raw.versions : [];
    const publishedVersion = versions
      .filter((version) => String(version.status).toUpperCase() === 'PUBLISHED')
      .sort((left, right) => (right.versionNumber || 0) - (left.versionNumber || 0))[0];
    const version = raw.gameVersion || raw.latestVersion || publishedVersion || null;
    const manifest = version && version.manifest && typeof version.manifest === 'object' ? version.manifest : {};
    const manifestPlayers = manifest.players && typeof manifest.players === 'object' ? manifest.players : {};
    const allowed = raw.allowedPlayers || raw.allowed_players || manifestPlayers.allowedCounts;
    const gameVersionId = raw.gameVersionId || raw.game_version_id || (version && version.id) || '';
    const packageUrl = raw.packageUrl || raw.package_url || raw.artifactUrl || raw.artifact_url || '';
    const engineKey = (version && version.engineKey) || (manifest.engine && manifest.engine.key) || manifest.gameKey || '';
    const playable = Boolean(packageUrl || (gameVersionId && engineKey === 'tic-tac-toe'));
    return {
      ...(base || {}),
      id,
      title: safeText(raw.title || raw.name, base ? base.title : 'Untitled game'),
      description: safeText(raw.description, base ? base.description : 'A game from the shared catalog.'),
      category: base ? base.category : 'all',
      players: Array.isArray(allowed) ? `${allowed.join(', ')} players` : (base ? base.players : 'Players vary'),
      offline: Boolean((version && version.capabilities && version.capabilities.offline) || raw.offlineReady || raw.offline_ready),
      playable,
      published: Boolean(version && String(version.status).toUpperCase() === 'PUBLISHED'),
      packageUrl,
      gameVersionId,
      engineKey,
      version: version ? version.versionNumber || version.version : '',
      tone: base ? base.tone : 'tone-gold',
      art: base ? base.art : 'board',
      allowedPlayers: Array.isArray(allowed) ? allowed : (base ? base.allowedPlayers : [2]),
      raw,
    };
  }

  function normalizeMatch(raw) {
    const rawVersion = raw.gameVersion || raw.game_version || {};
    const gameId = raw.gameId || raw.game_id || rawVersion.gameId || rawVersion.game_id || (raw.game && (raw.game.id || raw.game.gameId)) || '';
    const game = state.games.find((item) => item.id === gameId) || state.games.find((item) => item.title === (raw.game && raw.game.title)) || null;
    const statusText = String(raw.status || raw.state || 'ONGOING').toUpperCase();
    const status = ['OVER', 'FINISHED', 'COMPLETE', 'CANCELLED'].includes(statusText) ? 'finished' : statusText === 'LOBBY' || statusText === 'WAITING' ? 'lobby' : 'active';
    const id = raw.id || raw.matchId || raw.match_id;
    if (!id) return null;
    const players = Array.isArray(raw.players) ? raw.players : [];
    const myPlayer = players.find((player) => state.currentUser && player.userId === state.currentUser.id);
    const gameVersion = rawVersion;
    const capabilities = gameVersion.capabilities || {};
    return {
      id: String(id),
      title: safeText(raw.title || (raw.game && (raw.game.title || raw.game.name)) || (gameVersion.game && gameVersion.game.name), game ? game.title : 'Match'),
      gameId,
      status,
      mode: raw.mode || raw.playMode || raw.play_mode || 'remote',
      opponent: raw.opponentName || raw.opponent_name || players.filter((player) => state.currentUser && player.userId !== state.currentUser.id).map((player) => player.displayName || player.name).join(', ') || 'Waiting for players',
      version: raw.version || raw.currentVersion || raw.current_version || 0,
      state: raw.playerView || raw.player_view || raw.state || raw.currentState || raw.current_state || null,
      turnPlayerIndex: raw.turnPlayerIndex ?? raw.turn_player_index ?? raw.turn ?? null,
      myPlayerIndex: raw.myPlayerIndex ?? raw.my_player_index ?? (myPlayer && myPlayer.playerIndex) ?? 0,
      isCurrentUserPlayer: Boolean(myPlayer),
      ownerUserId: raw.ownerUserId || raw.owner_user_id || '',
      packageUrl: raw.packageUrl || raw.package_url || (game && game.packageUrl) || '',
      gameVersionId: raw.gameVersionId || raw.game_version_id || raw.gameVersion?.id || (game && game.gameVersionId) || '',
      gameEngineKey: gameVersion.engineKey || (game && game.engineKey) || '',
      capabilities,
      remote: true,
      updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
      raw,
        capabilities,
    };
  }

  function setConnection(connected, label) {
    const pill = $('#connection-pill');
    pill.classList.toggle('connected', connected);
    $('span:last-child', pill).textContent = label;
  }

  function renderIdentity() {
    const displayName = state.currentUser ? state.currentUser.displayName : state.demoProfile.displayName;
    const displayRole = state.currentUser ? state.currentUser.role : `Demo · ${state.demoProfile.provider}`;
    const signedIn = Boolean(state.authToken || state.currentUser || state.demoProfile.signedIn);
    $('#profile-name').textContent = displayName;
    $('#profile-role').textContent = displayRole;
    renderUserAvatar($('.avatar'), displayName);
    $('#sign-out-button').hidden = !state.authToken;
    $('#connection-pill').hidden = signedIn;
    $('#top-profile-wrap').hidden = !signedIn;
    $('#top-profile-name').textContent = displayName;
    $('#top-profile-menu-name').textContent = displayName;
    $('#top-profile-menu-role').textContent = displayRole;
    $('#top-profile-switch').hidden = Boolean(state.authToken);
    renderUserAvatar($('#top-profile-avatar'), displayName);
    renderUserAvatar($('#profile-view-avatar'), displayName);
    renderUserAvatar($('#avatar-settings-preview'), displayName);
    $('#profile-view-name').textContent = displayName;
    $('#profile-view-handle').textContent = `@${state.profileSettings.username}`;
    $('#profile-table-count').textContent = String(state.matches.length);
    $('#profile-lobby-count').textContent = String(state.matches.filter((match) => match.status === 'lobby').length);
    renderProfile();
  }

  function renderProfile() {
    const settings = state.profileSettings;
    $('#profile-username').value = settings.username;
    $('#profile-email').value = settings.email;
    $('#profile-phone').value = settings.phone;
    $('#remove-profile-picture').hidden = !settings.avatarDataUrl;
    $$('[data-avatar-preset]').forEach((button) => {
      const selected = !settings.avatarDataUrl && button.dataset.avatarPreset === settings.avatarPreset;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $('#language-select').value = state.language;
    $$('[data-notification]').forEach((input) => { input.checked = Boolean(settings.notifications[input.dataset.notification]); });
    for (const provider of ['google', 'facebook']) {
      const connected = Boolean(settings.socials[provider]);
      $(`#${provider}-social-state`).textContent = connected ? 'Connected · demo' : 'Not connected';
      $(`[data-social-toggle="${provider}"]`).textContent = connected ? 'Disconnect' : 'Connect';
    }
    $('#payment-method-card').hidden = !settings.hasSamplePayment;
    $('#add-payment-button').hidden = settings.hasSamplePayment;
    document.body.dataset.theme = settings.theme;
    $$('[data-theme-option]').forEach((button) => {
      const selected = button.dataset.themeOption === settings.theme;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const topThemeToggle = $('#top-theme-toggle');
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    topThemeToggle.textContent = settings.theme === 'dark' ? '☼' : '☾';
    topThemeToggle.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    topThemeToggle.title = `Switch to ${nextTheme} mode`;
    renderProfileMessages();
  }

  function renderProfileMessages() {
    const list = $('#global-message-list');
    list.replaceChildren();
    const unread = state.mockMessages.filter((message) => message.unread).length;
    $('#message-count').textContent = String(unread);
    $('#message-count').hidden = unread === 0;
    $('#conversation-total').textContent = String(state.mockMessages.length);
    for (const message of state.mockMessages) {
      const item = makeElement('article', `profile-message${message.unread ? ' unread' : ''}${state.selectedConversationId === message.id ? ' selected' : ''}`);
      const avatar = makeElement('span', 'message-avatar');
      renderContactAvatar(avatar, message.from);
      const content = makeElement('div', 'profile-message-copy');
      const heading = makeElement('div', 'message-heading');
      heading.append(makeElement('strong', '', message.from), makeElement('small', '', message.received));
      content.append(heading, makeElement('h3', '', message.subject), makeElement('p', '', message.body));
      const open = makeElement('button', 'conversation-open');
      open.type = 'button';
      open.setAttribute('aria-label', `Open conversation with ${message.from}: ${message.subject}`);
      open.setAttribute('aria-current', String(state.selectedConversationId === message.id));
      open.addEventListener('click', () => openConversation(message));
      open.append(avatar, content);
      const actions = makeElement('div', 'message-actions');
      const markRead = makeElement('button', 'text-button', message.unread ? 'Mark read' : 'Read');
      markRead.type = 'button';
      markRead.disabled = !message.unread;
      markRead.addEventListener('click', () => {
        message.unread = false;
        persistMockMessages();
        renderProfileMessages();
      });
      const reply = makeElement('button', 'text-button', 'Reply');
      reply.type = 'button';
      reply.addEventListener('click', () => {
        openConversation(message);
        $('#message-reply-text').focus();
      });
      actions.append(markRead, reply);
      item.append(open, actions);
      list.append(item);
    }
  }

  function renderConversation(message) {
    const thread = $('#conversation-thread');
    thread.replaceChildren();
    $('#conversation-name').textContent = message.from;
    renderContactAvatar($('#conversation-avatar'), message.from);
    $('#conversation-context').textContent = message.from === 'GamePortal' ? 'GamePortal update' : 'Direct player conversation';
    $('#message-recipient').textContent = message.from;
    for (const entry of message.thread || [{ sender: message.from, body: message.body, time: message.received }]) {
      const bubble = makeElement('article', `conversation-bubble${entry.sender === 'You' ? ' own' : ''}`);
      bubble.append(makeElement('p', '', entry.body), makeElement('small', '', `${entry.sender} · ${entry.time}`));
      thread.append(bubble);
    }
    $('#inbox-empty').hidden = true;
    $('#conversation-content').hidden = false;
    $('.inbox-layout').classList.add('thread-open');
    thread.scrollTop = thread.scrollHeight;
  }

  function openConversation(message) {
    state.selectedConversationId = message.id;
    message.unread = false;
    persistMockMessages();
    renderProfileMessages();
    renderConversation(message);
  }

  function setProfileTab(name) {
    $$('[data-profile-tab]').forEach((tab) => {
      const selected = tab.dataset.profileTab === name;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-selected', String(selected));
      $(`#profile-panel-${tab.dataset.profileTab}`).hidden = !selected;
    });
  }

  function closeTopProfileMenu() {
    $('#top-profile-menu').hidden = true;
    $('#top-profile-trigger').setAttribute('aria-expanded', 'false');
    $('#top-profile-switch-options').hidden = true;
    $('#top-profile-switch').setAttribute('aria-expanded', 'false');
  }

  function startDemoProfile(displayName, provider) {
    if (state.authToken) clearSession();
    state.currentUser = null;
    state.demoProfile = { displayName, provider, signedIn: true };
    state.profileSettings = readProfileSettings(profileSettingsIdentity(null, state.demoProfile), displayName);
    localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(state.demoProfile));
    ensureDemoMatches();
    renderIdentity();
    renderMatches();
    $('#login-dialog').close();
    toast(`Playing as ${displayName} · demo profile`);
  }

  function clearSession() {
    state.authToken = '';
    state.currentUser = null;
    state.demoProfile = { displayName: 'Guest player', provider: 'Guest', signedIn: false };
    state.profileSettings = readProfileSettings(profileSettingsIdentity(null, state.demoProfile), state.demoProfile.displayName);
    localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(state.demoProfile));
    sessionStorage.removeItem(TOKEN_KEY);
    state.matches = state.matches.filter((match) => !match.remote);
    ensureDemoMatches();
    persistMatches();
    renderIdentity();
    setConnection(false, normalizedBase() ? 'Sign in' : 'Local demo');
  }

  async function loadRemoteData() {
    if (!normalizedBase() || !state.authToken) {
      if (state.matchPollTimer) window.clearInterval(state.matchPollTimer);
      state.matchPollTimer = null;
      if (!state.authToken) {
        state.matches = state.matches.filter((match) => !match.remote || match.isMock);
        ensureDemoMatches();
        persistMatches();
      }
      setConnection(false, normalizedBase() ? 'Sign in' : 'Local demo');
      renderGames();
      renderMatches();
      return;
    }
    state.matches = state.matches.filter((match) => !match.isMock);
    persistMatches();
    setConnection(false, 'Connecting');
    const gamesResult = await apiRequest('/games');
    const remoteGames = unwrapList(gamesResult, ['games', 'items', 'results']).map(normalizeGame).filter((game) => game && game.published);
    if (remoteGames.length) {
      const knownIds = new Set(remoteGames.map((game) => game.id));
      state.games = [...remoteGames, ...gameCatalog.filter((game) => !knownIds.has(game.id))];
      $('#game-source-note').textContent = 'Published versions visible to this account. The current API does not expose a global public catalog.';
    } else {
      state.games = [...gameCatalog];
      $('#game-source-note').textContent = 'No published versions are visible to this account. The shelf includes local examples.';
    }
    setConnection(true, 'API connected');
    try {
      await refreshRemoteMatches(true);
    } catch (error) {
      toast(`Games connected, matches unavailable: ${error.message}`);
    }
    startMatchRefresh();
    renderGames();
    renderMatches();
  }

  async function refreshRemoteMatches(initial = false) {
    if (!normalizedBase() || !state.authToken || state.matchPollInFlight) return;
    state.matchPollInFlight = true;
    try {
      const matchesResult = await apiRequest('/me/matches');
      const remoteMatches = unwrapList(matchesResult, ['matches', 'items', 'results']).map(normalizeMatch).filter(Boolean);
      const merged = new Map(state.matches.filter((match) => !match.remote || !state.hiddenMatchIds.has(hiddenMatchKey(match.id))).map((match) => [match.id, match]));
      state.matches.filter((match) => match.remote && !state.hiddenMatchIds.has(hiddenMatchKey(match.id))).forEach((match) => merged.set(match.id, match));
      remoteMatches.filter((match) => !state.hiddenMatchIds.has(hiddenMatchKey(match.id))).forEach((match) => merged.set(match.id, { ...merged.get(match.id), ...match }));
      state.matches = [...merged.values()];
      state.lastPollErrorAt = 0;
      setConnection(true, 'API connected');
      persistMatches();
      renderMatches();
      if (state.currentMatch && state.currentMatch.remote) {
        const latest = state.matches.find((match) => match.id === state.currentMatch.id);
        if (latest && latest.version !== state.currentMatch.version) renderPlay(latest);
      }
    } finally {
      state.matchPollInFlight = false;
    }
  }

  function startMatchRefresh() {
    if (!normalizedBase() || state.matchPollTimer) return;
    state.matchPollTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!state.matches.some((match) => match.remote && match.status !== 'finished')) return;
      refreshWithNotice();
    }, 5000);
  }

  function refreshWithNotice() {
    flushPendingMoves().then(() => refreshRemoteMatches()).catch((error) => {
      setConnection(false, 'Sync paused');
      if (Date.now() - state.lastPollErrorAt > 30000) {
        state.lastPollErrorAt = Date.now();
        toast(error.message);
      }
    });
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function drawGameMotif(game) {
    if (game.id === 'connect-four') {
      const board = makeElement('div', 'connect-four-art');
      const redDiscs = new Set(['4-1', '4-2', '5-1', '5-2', '5-3', '5-4']);
      const yellowDiscs = new Set(['3-2', '4-3', '4-4', '5-5']);
      for (let row = 0; row < 6; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const key = `${row}-${column}`;
          board.append(makeElement('span', `connect-four-art-cell${redDiscs.has(key) ? ' red' : yellowDiscs.has(key) ? ' yellow' : ''}`));
        }
      }
      return board;
    }
    if (game.id === 'dots') {
      const board = makeElement('div', 'dots-boxes-art');
      const claimedEdges = new Set(['0-1', '2-1', '2-3', '4-3', '6-3', '1-0', '3-0', '3-2', '5-2', '5-4']);
      const claimedBoxes = new Set(['1-1', '3-1', '3-3', '5-3']);
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const key = `${row}-${column}`;
          const isDot = row % 2 === 0 && column % 2 === 0;
          const isEdge = row % 2 === 0 ? column % 2 === 1 : column % 2 === 0;
          const isBox = row % 2 === 1 && column % 2 === 1;
          const claimedBox = isBox && claimedBoxes.has(key);
          const boxOwner = (Math.floor(row / 2) + Math.floor(column / 2)) % 2 === 0 ? 'red' : 'blue';
          const orientation = row % 2 === 0 ? 'horizontal' : 'vertical';
          board.append(makeElement('span', `dots-boxes-art-cell${isDot ? ' dot' : isEdge && claimedEdges.has(key) ? ` edge ${orientation}` : claimedBox ? ` box claimed ${boxOwner}` : ''}`));
        }
      }
      return board;
    }
    if (game.art === 'cards') {
      const pile = makeElement('div', 'cards-art');
      pile.append(makeElement('span', 'playing-card', 'A'), makeElement('span', 'playing-card', 'K'));
      return pile;
    } else if (game.art === 'checkers') {
      const board = makeElement('div', 'checker-art');
      for (let index = 0; index < 16; index += 1) board.append(makeElement('span'));
      return board;
    }
    const board = makeElement('div', 'mini-board');
    ['X', '', 'O', '', 'X', '', 'O', '', ''].forEach((value) => board.append(makeElement('span', '', value)));
    return board;
  }

  function drawCardArt(game) {
    const art = makeElement('div', `card-art ${game.tone || 'tone-gold'}`);
    art.append(makeElement('span', 'card-art-label', game.category === 'all' ? 'PUBLISHED' : String(game.category || 'GAME').toUpperCase()));
    art.append(drawGameMotif(game));
    return art;
  }

  function renderQuickStartArt() {
    $$('[data-quick-art]').forEach((slot) => {
      const game = gameCatalog.find((item) => item.id === slot.dataset.quickArt);
      if (game) slot.replaceChildren(drawGameMotif(game));
    });
  }

  function renderGameMockup(game) {
    const detail = $('#sample-match-detail');
    detail.replaceChildren(makeElement('strong', '', 'STATIC GAME CONCEPT'));
    if (game.id === 'poker') {
      const table = makeElement('div', 'mock-poker-table');
      table.append(makeElement('p', 'mock-game-caption', 'COMMUNITY CARDS · POT 240'));
      const community = makeElement('div', 'mock-playing-cards');
      ['A♠', '10♥', 'Q♣', '4♦', 'K♠'].forEach((card, index) => community.append(makeElement('span', `mock-playing-card${[1, 3].includes(index) ? ' warm' : ''}`, card)));
      table.append(community, makeElement('span', 'mock-table-seat', 'YOU · READY'));
      detail.append(table);
      return;
    }
    if (game.id === 'connect-four') {
      const board = makeElement('div', 'mock-connect-board');
      const pieces = new Map([[35, 'red'], [36, 'yellow'], [37, 'red'], [38, 'yellow'], [39, 'red'], [40, 'yellow'], [41, 'red'], [34, 'yellow'], [33, 'red'], [32, 'yellow'], [27, 'red']]);
      for (let index = 0; index < 42; index += 1) board.append(makeElement('span', `mock-connect-cell${pieces.has(index) ? ` ${pieces.get(index)}` : ''}`));
      detail.append(board, makeElement('p', 'mock-game-caption', '6 ROWS · 7 COLUMNS · SAMPLE POSITION'));
      return;
    }
    if (game.id === 'memory') {
      const board = makeElement('div', 'mock-memory-board');
      const cards = ['✦', '?', '●', '?', '?', '◆', '?', '✦', '?', '●', '?', '?', '◆', '?', '?', '?'];
      cards.forEach((value) => board.append(makeElement('span', `mock-memory-card${value === '?' ? '' : ' revealed'}`, value)));
      detail.append(board, makeElement('p', 'mock-game-caption', '2 MATCHED PAIRS · 12 CARDS HIDDEN'));
      return;
    }
    if (game.id === 'dots') {
      const board = makeElement('div', 'mock-dots-board');
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 7; column += 1) {
          const key = `${row}-${column}`;
          const isDot = row % 2 === 0 && column % 2 === 0;
          const isLine = row % 2 === 0 && column % 2 === 1 ? ['0-1', '2-1', '2-3', '4-3', '6-3'].includes(key) : row % 2 === 1 && column % 2 === 0 ? ['1-0', '3-0', '3-2', '5-2', '5-4'].includes(key) : false;
          const isBox = row % 2 === 1 && column % 2 === 1 && ['1-1', '3-1', '3-3', '5-3'].includes(key);
          board.append(makeElement('span', `mock-dot-cell${isDot ? ' dot' : isLine ? ` line ${row % 2 ? 'vertical' : 'horizontal'}` : isBox ? ' claimed' : ''}`));
        }
      }
      detail.append(board, makeElement('p', 'mock-game-caption', '3 × 3 BOXES · SAMPLE CLAIMS'));
      return;
    }
    const board = makeElement('div', 'mock-checkers-board');
    const rowSizes = [3, 4, 5, 6, 7, 6, 5];
    rowSizes.forEach((size, rowIndex) => {
      const row = makeElement('div', 'mock-checkers-row');
      for (let column = 0; column < size; column += 1) {
        const red = rowIndex < 2 && column < 3;
        const blue = rowIndex > 4 && column >= size - 3;
        row.append(makeElement('span', `mock-checker-marble${red ? ' red' : blue ? ' blue' : ''}`));
      }
      board.append(row);
    });
    detail.append(board, makeElement('p', 'mock-game-caption', 'STAR BOARD · RED VS. BLUE'));
  }

  function openGameMockup(game) {
    $('#sample-match-type').textContent = 'GAME MOCKUP · STATIC PREVIEW';
    $('#sample-match-title').textContent = game.title;
    $('#sample-match-copy').textContent = `${game.players} · ${game.duration} · ${game.description}`;
    renderGameMockup(game);
    $('#sample-match-note-title').textContent = 'Visual concept only';
    $('#sample-match-note-copy').textContent = 'This board illustrates a possible game screen. Controls, rules, and network play are not implemented.';
    $('#sample-match-dialog').showModal();
  }

  function renderGames() {
    const grid = $('#game-grid');
    grid.replaceChildren();
    const matches = state.games.filter((game) => {
      const query = state.search.trim().toLowerCase();
      const matchesText = !query || `${game.title} ${game.description}`.toLowerCase().includes(query);
      const matchesFilter = state.currentFilter === 'all' || (state.currentFilter === 'offline' ? game.offline : game.category === state.currentFilter);
      return matchesText && matchesFilter;
    });
    for (const [index, game] of matches.entries()) {
      const card = makeElement('article', 'game-card');
      card.style.animationDelay = `${index * 45}ms`;
      card.append(drawCardArt(game));
      const copy = makeElement('div', 'game-card-copy');
      const top = makeElement('div', 'game-card-top');
      top.append(makeElement('h3', '', game.title));
      if (game.offline) top.append(makeElement('span', 'offline-dot', '● OFFLINE'));
      copy.append(top, makeElement('p', 'game-description', game.description));
      const footer = makeElement('div', 'game-card-footer');
      footer.append(makeElement('span', 'game-meta', `${game.players} · ${game.duration || 'Play now'}`));
      const action = makeElement('button', 'play-card-button', game.playable ? 'Choose mode' : 'Preview');
      action.type = 'button';
      action.setAttribute('aria-label', `${game.playable ? 'Choose a mode for' : 'Preview'} ${game.title}`);
      action.addEventListener('click', () => game.playable ? openCreateDialog(game.id) : openGameMockup(game));
      footer.append(action);
      copy.append(footer);
      card.append(copy);
      grid.append(card);
    }
    $('#empty-games').hidden = matches.length !== 0;
  }

  function renderMatches() {
    const list = $('#match-list');
    list.replaceChildren();
    const filtered = state.matches.filter((match) => state.currentMatchFilter === 'local' ? !match.remote : match.status === state.currentMatchFilter);
    $('#active-count').textContent = String(state.matches.filter((match) => match.status === 'active').length);
    $('#match-count').textContent = String(state.matches.filter((match) => match.status !== 'finished').length);
    $('#empty-matches').hidden = filtered.length !== 0;
    list.hidden = filtered.length === 0;
    for (const match of filtered) {
      const row = makeElement('article', 'match-row');
      const thumb = makeElement('div', `match-thumb ${match.title.toLowerCase().includes('poker') ? 'coral' : match.title.toLowerCase().includes('check') ? 'blue' : ''}`, match.title.toLowerCase().includes('poker') ? 'A K' : match.title.toLowerCase().includes('check') ? '●' : 'X O');
      const main = makeElement('div', 'match-main');
      const modeLabel = match.isRealTimeDemo ? 'Real-time · Demo opponent' : match.remote || match.isDemoOnline ? (String(match.mode).toUpperCase() === 'REAL_TIME' ? 'Real-time' : 'Ping-pong') : ['PASS_AND_PLAY', 'pass-and-play'].includes(match.mode) ? 'Pass-and-play' : match.mode === 'computer' ? 'Vs. computer' : 'Sample match';
      main.append(makeElement('strong', '', match.title), makeElement('small', '', match.isRealTimeDemo ? `${modeLabel} · Local game` : match.isDemoOnline ? `${modeLabel} · Demo table` : `${match.isMock ? 'Design mockup' : modeLabel} · ${match.isMock ? 'Fictional data' : match.remote ? 'Synced to backend' : 'Saved on this device'}`));
      const opponent = makeElement('div', 'match-opponent');
      opponent.append(makeElement('strong', '', match.opponent || 'Your table'), makeElement('small', '', match.status === 'lobby' ? 'Waiting for players' : match.status === 'finished' ? 'Round complete' : 'Last update just now'));
      const isYourTurn = match.remote ? match.isCurrentUserPlayer && match.turnPlayerIndex === match.myPlayerIndex : match.isRealTimeDemo ? match.state && match.state.turn === 0 : match.mode === 'computer' ? true : match.mode === 'pass-and-play' && match.state && match.state.turn === 0;
      const activeLabel = currentPendingMoves().some((move) => move.matchId === match.id) ? 'QUEUED' : match.isSpectator ? 'WATCHING' : isYourTurn ? 'YOUR TURN' : 'WAITING';
      const statusLabel = makeElement('span', `match-status ${match.status === 'finished' ? 'finished' : match.status === 'lobby' ? 'lobby' : ''}`, match.status === 'active' ? activeLabel : match.status.toUpperCase());
      const isOwner = match.remote && state.currentUser && match.ownerUserId === state.currentUser.id;
      const rosterSize = Array.isArray(match.raw && match.raw.players) ? match.raw.players.filter((player) => String(player.status).toUpperCase() !== 'LEFT').length : 0;
      const game = state.games.find((item) => item.id === match.gameId);
      const requiredPlayers = game && game.allowedPlayers && game.allowedPlayers[0] ? game.allowedPlayers[0] : 2;
      const actionLabel = match.isDemoOnline ? match.status === 'lobby' ? 'View lobby' : 'Open' : match.isMock ? match.status === 'lobby' ? 'View lobby' : match.isSpectator ? 'Watch' : 'Preview' : match.status !== 'lobby' ? (match.status === 'finished' ? 'Review' : 'Open') : !match.remote ? 'Start' : !isOwner ? match.isCurrentUserPlayer ? 'Waiting' : 'Join' : rosterSize < requiredPlayers ? 'Copy invite' : 'Start';
      const action = makeElement('button', 'match-open', actionLabel);
      action.type = 'button';
      action.disabled = actionLabel === 'Waiting';
      action.addEventListener('click', () => {
        if (match.isDemoOnline) {
          if (match.status === 'lobby') openDemoLobby(match);
          else openMatch(match);
        } else if (match.isMock) {
          if (match.isSpectator) openMatch(match);
          else openMockMatch(match);
        } else if (actionLabel === 'Copy invite') copyInviteLink(match);
        else handleMatchAction(match);
      });
      const menu = makeElement('button', 'match-menu', '···');
      menu.type = 'button';
      menu.setAttribute('aria-label', 'Match actions');
      menu.title = 'Match actions';
      menu.addEventListener('click', () => openMatchActions(match));
      row.append(thumb, main, opponent, statusLabel, action, menu);
      list.append(row);
    }
  }

  function setView(name) {
    const views = { discover: $('#discover-view'), matches: $('#matches-view'), inbox: $('#inbox-view'), profile: $('#profile-view'), play: $('#play-view') };
    for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === (name === 'play' ? 'matches' : name)));
    $('#profile-button').classList.toggle('active', name === 'profile');
    $('#section-name').textContent = name === 'play' ? 'MATCH' : name === 'inbox' ? 'MESSAGES' : name.toUpperCase();
    if (name === 'matches') renderMatches();
    if (name === 'inbox') renderProfileMessages();
    if (name === 'profile') {
      renderIdentity();
      setProfileTab('account');
    }
  }

  function selectedMode() {
    return $('input[name="play-mode"]:checked').value;
  }

  function openCreateDialog(gameId = 'ttt') {
    const select = $('#create-game');
    select.replaceChildren();
    for (const game of state.games.filter((item) => item.playable)) {
      const option = makeElement('option', '', game.title);
      option.value = game.id;
      select.append(option);
    }
    select.value = state.games.some((game) => game.id === gameId && game.playable) ? gameId : 'ttt';
    $('input[name="play-mode"][value="computer"]').checked = true;
    $$('.mode-option').forEach((option) => option.classList.toggle('selected', $('input', option).value === 'computer'));
    $('input[name="invite-kind"][value="friend"]').checked = true;
    $('#create-feedback').textContent = '';
    updateCreateMode();
    $('#create-dialog').showModal();
  }

  function updateCreateMode() {
    const mode = selectedMode();
    const online = ['ping-pong', 'real-time'].includes(mode);
    const realTimeDemo = mode === 'real-time';
    const section = $('#online-invite-setup');
    section.hidden = !online;
    $('#create-submit-label').textContent = realTimeDemo ? 'Start real-time demo' : mode === 'ping-pong' ? 'Create lobby' : 'Create match';
    $('#invite-setup-eyebrow').textContent = realTimeDemo ? 'DEMO OPPONENT' : 'LOBBY SETUP';
    $('#invite-setup-title').textContent = realTimeDemo ? 'Choose a player identity' : 'Who can join?';
    const inviteKind = $('input[name="invite-kind"]:checked').value;
    const friendChoiceRow = $('#friend-choice-row');
    friendChoiceRow.hidden = inviteKind !== 'friend';
    $('#open-lobby-note').hidden = inviteKind !== 'open';
    $$('.invite-kind-option').forEach((option) => option.classList.toggle('selected', $('input', option).checked));
    const game = state.games.find((item) => item.id === $('#create-game').value);
    const backendReady = Boolean(mode === 'ping-pong' && normalizedBase() && state.authToken && game && game.gameVersionId && !game.isMock);
    $('#online-backend-note').hidden = mode !== 'ping-pong' || !backendReady;
    $('.invite-kind-options').hidden = backendReady;
    friendChoiceRow.hidden = backendReady || inviteKind !== 'friend';
    $('#open-lobby-note').hidden = backendReady || inviteKind !== 'open';
    $('#open-lobby-title').textContent = realTimeDemo ? 'Simulated opponent' : 'Public demo lobby';
    $('#open-lobby-description').textContent = realTimeDemo ? 'The game AI controls this demo seat; no stranger is connected.' : 'Anyone can appear as a simulated guest. No invitation is actually sent.';
  }

  function makeDemoOnlineLobby(game, mode) {
    const inviteKind = $('input[name="invite-kind"]:checked').value;
    const invitee = inviteKind === 'friend' ? $('#invite-friend').value : '';
    const modeName = mode === 'real-time' ? 'Real-time' : 'Ping-pong';
    const inviteCode = `GP-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    return {
      id: `demo-lobby-${Date.now().toString(36)}`,
      title: game.title,
      gameId: game.id,
      status: 'lobby',
      mode: mode === 'real-time' ? 'REAL_TIME' : 'PING_PONG',
      opponent: inviteKind === 'friend' ? invitee : 'Open to players',
      version: 0,
      state: null,
      turnPlayerIndex: null,
      myPlayerIndex: 0,
      remote: false,
      isMock: true,
      isDemoOnline: true,
      isCurrentUserPlayer: true,
      inviteKind,
      invitee,
      inviteCode,
      mockJoined: false,
      allowedPlayers: game.allowedPlayers || [2],
      previewText: `${modeName} · ${inviteKind === 'friend' ? `Invite for ${invitee}` : 'Open to strangers'} · Demo only`,
      createdAt: new Date().toISOString(),
    };
  }

  function makeLocalMatch(game, mode) {
    return {
      id: `local-${Date.now().toString(36)}`,
      title: game.title,
      gameId: game.id,
      status: mode === 'invite' ? 'lobby' : 'active',
      mode: mode === 'invite' ? 'remote' : mode,
      handoffPending: false,
      opponent: mode === 'computer' ? 'Computer' : mode === 'pass-and-play' ? 'Player 2' : 'Waiting for players',
      version: 0,
      state: game.id === 'ttt'
        ? { board: Array(9).fill(null), turn: 0, winner: null, winningLine: [] }
        : window.portalGames && window.portalGames[game.id] ? window.portalGames[game.id].createState() : null,
      turnPlayerIndex: 0,
      myPlayerIndex: 0,
      remote: false,
      updatedAt: new Date().toISOString(),
      packageUrl: game.packageUrl || '',
      gameVersionId: game.gameVersionId || '',
    };
  }

  async function createMatch() {
    const game = state.games.find((item) => item.id === $('#create-game').value) || gameCatalog[0];
    const mode = selectedMode();
    const submit = $('#create-submit');
    submit.disabled = true;
    $('#create-feedback').textContent = '';
    try {
      let match;
      if (mode === 'real-time') {
        if (!game.playable) throw new Error('This game does not have a local real-time demo yet.');
        const inviteKind = $('input[name="invite-kind"]:checked').value;
        const selectedName = inviteKind === 'friend' ? $('#invite-friend').value : 'Demo stranger';
        match = makeLocalMatch(game, 'computer');
        match.isRealTimeDemo = true;
        match.inviteKind = inviteKind;
        match.invitee = selectedName;
        match.opponent = `${selectedName} · Demo`;
        match.previewText = `Real-time demo · Computer-controlled ${selectedName} · Local only`;
      } else if (mode === 'ping-pong') {
        const backendReady = Boolean(normalizedBase() && state.authToken && game.gameVersionId && !game.isMock);
        if (!backendReady) {
          match = makeDemoOnlineLobby(game, mode);
        } else {
          const result = await apiRequest('/matches', {
            method: 'POST',
            body: JSON.stringify({ gameVersionId: game.gameVersionId, mode: 'PING_PONG', joinPolicy: 'OPEN' }),
          });
          match = normalizeMatch(result.match || result.data || result);
          if (!match) throw new Error('The API created a match but returned no match ID. Check the create-match response contract.');
          match.title = game.title;
          match.opponent = 'Waiting for players';
        }
      } else {
        if (!game.playable) throw new Error('This game needs a published package before it can be played here.');
        match = makeLocalMatch(game, mode);
      }
      state.matches.unshift(match);
      persistMatches();
      $('#create-dialog').close();
      renderMatches();
      if (match.status === 'active') openMatch(match);
      else {
        setView('matches');
        state.currentMatchFilter = 'lobby';
        $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.matchFilter === 'lobby'));
        renderMatches();
        if (match.isDemoOnline) openDemoLobby(match);
      }
    } catch (error) {
      $('#create-feedback').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  }

  function winInfo(board) {
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (const line of lines) if (board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) return { winner: board[line[0]] === 'X' ? 0 : 1, line };
    return null;
  }

  function localResult(match) {
    const win = winInfo(match.state.board);
    if (win) return { winner: win.winner, line: win.line };
    if (match.state.board.every(Boolean)) return { winner: null, line: [] };
    return null;
  }

  function computerChoice(board) {
    const available = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
    const findWinning = (symbol) => available.find((cell) => {
      const next = [...board];
      next[cell] = symbol;
      return winInfo(next);
    });
    return findWinning('O') ?? findWinning('X') ?? (available.includes(4) ? 4 : available.find((cell) => [0, 2, 6, 8].includes(cell)) ?? available[0]);
  }

  function usesLocalHandoff(match) {
    return match.mode === 'pass-and-play' || (match.isDemoOnline && match.status === 'active');
  }

  function playLocalBoardMove(match, gameModule, move) {
    const gameState = match.state;
    const previousTurn = gameState.turn;
    if (match.status !== 'active' || (match.mode === 'computer' && gameState.turn !== 0) || !gameModule.applyMove(gameState, move)) return;
    match.version += 1;
    match.updatedAt = new Date().toISOString();
    if (gameModule.isOver(gameState)) {
      match.status = 'finished';
      match.handoffPending = false;
    } else {
      match.handoffPending = usesLocalHandoff(match) && gameState.turn !== previousTurn;
    }
    persistMatches();
    renderPlay(match);
    if (match.status === 'active' && match.mode === 'computer' && gameState.turn === 1) {
      const playComputerTurn = () => {
        $('#board-hint').textContent = 'The computer is choosing a move…';
        window.setTimeout(() => {
          if (state.currentMatch !== match || match.status !== 'active') return;
          const computerMove = gameModule.chooseComputerMove(gameState);
          if (computerMove !== null && computerMove !== undefined) gameModule.applyMove(gameState, computerMove);
          match.version += 1;
          match.updatedAt = new Date().toISOString();
          if (gameModule.isOver(gameState)) match.status = 'finished';
          persistMatches();
          renderPlay(match);
          if (match.status === 'active' && match.mode === 'computer' && gameState.turn === 1) playComputerTurn();
        }, 380);
      };
      playComputerTurn();
    }
  }

  function playLocalMove(match, cell) {
    if (match.remote) {
      submitRemoteMove(match, cell);
      return;
    }
    const gameModule = window.portalGames && window.portalGames[match.gameId];
    if (gameModule) {
      playLocalBoardMove(match, gameModule, cell);
      return;
    }
    const gameState = match.state;
    if (match.status !== 'active' || (match.mode === 'computer' && gameState.turn !== 0) || gameState.board[cell]) return;
    const previousTurn = gameState.turn;
    const alternatesPlayers = usesLocalHandoff(match);
    const mark = alternatesPlayers && gameState.turn === 1 ? 'O' : 'X';
    gameState.board[cell] = mark;
    gameState.turn = alternatesPlayers ? 1 - gameState.turn : 1;
    match.version += 1;
    const firstResult = localResult(match);
    if (firstResult) finishLocalMatch(match, firstResult);
    match.handoffPending = match.status === 'active' && usesLocalHandoff(match) && gameState.turn !== previousTurn;
    renderPlay(match);
    if (match.status === 'active' && match.mode === 'computer') {
      $('#board-hint').textContent = 'The computer is choosing a move…';
      window.setTimeout(() => {
        if (state.currentMatch !== match || match.status !== 'active') return;
        const move = computerChoice(match.state.board);
        if (move !== undefined) match.state.board[move] = 'O';
        match.state.turn = 0;
        match.version += 1;
        const result = localResult(match);
        if (result) finishLocalMatch(match, result);
        persistMatches();
        renderPlay(match);
      }, 450);
    } else if (match.status === 'active') {
      renderPlay(match);
    }
    persistMatches();
  }

  function finishLocalMatch(match, result) {
    match.status = 'finished';
    match.state.winner = result.winner;
    match.state.winningLine = result.line;
    match.state.turn = null;
    match.updatedAt = new Date().toISOString();
  }

  function finishedResultLabel(match, gameState) {
    if (gameState.isDraw || gameState.winner === null || gameState.winner === undefined) return 'Draw game';
    const winner = gameState.winner === 'O' ? 1 : gameState.winner === 'X' ? 0 : Number(gameState.winner);
    if (match.remote) {
      if (winner === match.myPlayerIndex) return 'You win';
      const players = Array.isArray(match.raw && match.raw.players) ? match.raw.players : [];
      const player = players.find((item, index) => (item.playerIndex ?? item.player_index ?? index) === winner);
      return safeText(player && (player.displayName || player.display_name || player.name), match.opponent || `Player ${winner + 1}`) + ' wins';
    }
    if (winner === 0) return 'You win';
    if (match.isRealTimeDemo) return `${match.opponent} wins`;
    return match.mode === 'computer' ? 'Computer wins' : 'Player 2 wins';
  }

  function renderPlay(match) {
    state.currentMatch = match;
    const gameModule = (!match.remote || match.isMock) && window.portalGames && window.portalGames[match.gameId];
    const gameState = match.state || (gameModule ? gameModule.createState() : { board: Array(9).fill(null), turn: 0, winner: null, winningLine: [] });
    if (!match.state && gameModule) match.state = gameState;
    const board = $('#live-board');
    board.replaceChildren();
    board.setAttribute('aria-label', `${match.title} board`);
    const local = !match.remote;
    const isOver = match.status === 'finished';
    const finishLabel = isOver ? finishedResultLabel(match, gameState) : '';
    const current = gameState.turn ?? match.turnPlayerIndex ?? 0;
    const handoffPending = local && usesLocalHandoff(match) && match.handoffPending && !isOver;
    board.hidden = handoffPending;
    $('#turn-banner').hidden = handoffPending || isOver;
    $('#round-result').hidden = !isOver;
    if (isOver) $('#round-result-title').textContent = finishLabel;
    $('#handoff-panel').hidden = !handoffPending;
    $('#handoff-title').textContent = `Pass the device to Player ${current + 1}`;
    $('#handoff-button').textContent = `I am Player ${current + 1} · reveal board`;
    const remoteTicTacToe = match.remote && match.gameEngineKey === 'tic-tac-toe' && Array.isArray(gameState.board) && gameState.board.length === 9;
    const result = local && match.gameId === 'ttt' ? localResult(match) : null;
    const winningLine = gameState.winningLine || (result && result.line) || [];
    if (gameModule) {
      gameModule.renderBoard(board, gameState, (move) => playLocalMove(match, move));
      if (match.isSpectator || (match.mode === 'computer' && current !== 0)) board.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    } else {
      for (let index = 0; index < 9; index += 1) {
        const cell = makeElement('button', `board-cell ${gameState.board[index] ? gameState.board[index].toLowerCase() : ''}${winningLine.includes(index) ? ' winning' : ''}`, gameState.board[index] || '');
        cell.type = 'button';
        cell.disabled = (!local && !remoteTicTacToe) || match.isSpectator || isOver || Boolean(gameState.board[index]) || (match.remote && current !== match.myPlayerIndex) || (local && match.mode === 'computer' && current !== 0) || Boolean(match.pendingMove);
        const markToPlay = match.mode === 'pass-and-play' && current === 1 ? 'O' : 'X';
        cell.setAttribute('aria-label', gameState.board[index] ? `Cell ${index + 1}: ${gameState.board[index]}` : `Place ${markToPlay} in cell ${index + 1}`);
        cell.addEventListener('click', () => playLocalMove(match, index));
        board.append(cell);
      }
    }
    const mark = gameModule ? gameModule.getCurrentMark(gameState) : current === 1 ? 'O' : 'X';
    const banner = $('#turn-banner');
    $('.turn-mark', banner).textContent = isOver ? '✓' : mark;
    const myTurn = match.isSpectator ? false : match.remote ? current === match.myPlayerIndex : current === 0;
    $('small', banner).textContent = isOver ? 'ROUND COMPLETE' : match.isSpectator ? 'SPECTATOR' : myTurn ? 'UP TO YOU' : 'NEXT UP';
    $('strong', banner).textContent = isOver ? 'Game over' : match.isSpectator ? 'Watching players' : myTurn ? 'Your turn' : match.isRealTimeDemo ? `${match.opponent} turn` : match.mode === 'computer' ? 'Computer turn' : match.isDemoOnline ? 'Invitee turn' : match.remote ? 'Opponent turn' : 'Pass to Player 2';
    $('#play-title').textContent = match.title;
    $('#play-mode-label').textContent = match.isSpectator ? (match.isMock ? 'WATCHING · DEMO' : 'SPECTATOR VIEW') : match.isRealTimeDemo ? 'REAL-TIME · AI DEMO' : match.isDemoOnline ? `${String(match.mode).toUpperCase() === 'REAL_TIME' ? 'REAL-TIME' : 'PING-PONG'} · DEMO` : match.remote ? 'ONLINE MATCH' : match.mode === 'pass-and-play' ? 'PASS-AND-PLAY' : match.mode === 'computer' ? 'VS. COMPUTER' : 'LOCAL GAME';
    $('#play-match-id').textContent = match.isSpectator && match.isMock ? 'Public demo · read-only' : match.remote ? `Match #${match.id} · Version ${match.version}` : match.isRealTimeDemo ? `Local real-time demo · ${match.opponent}` : match.isDemoOnline ? `Demo table · ${match.opponent || 'Open seat'}` : `Local match · ${new Date(match.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    $('#play-privacy-copy').textContent = match.isSpectator ? match.isMock ? 'Public sample state only. No live players or network match are connected.' : 'Only the game version’s public spectator view is shown.' : match.isRealTimeDemo ? 'The named opponent is simulated by the local game AI; no player is connected.' : match.isDemoOnline ? 'Invitation demo is local to this device; no network player can see these moves.' : 'Moves are shared with this match. Your game state stays in sync.';
    const players = $('#player-list');
    players.replaceChildren();
    const localName = state.currentUser ? state.currentUser.displayName : state.demoProfile.displayName;
    const remotePlayers = Array.isArray(match.raw && match.raw.players)
      ? [...match.raw.players].sort((first, second) => (first.playerIndex ?? first.player_index ?? 0) - (second.playerIndex ?? second.player_index ?? 0))
      : [];
    const playerNames = match.remote && remotePlayers.length
      ? remotePlayers.map((player, index) => safeText(player.displayName || player.display_name || player.name, `Player ${index + 1}`))
      : match.remote
        ? [localName, match.opponent || 'Opponent']
        : [localName, match.isRealTimeDemo ? match.opponent : match.isDemoOnline ? match.opponent || 'Invitee' : match.mode === 'computer' ? 'Computer' : 'Player 2'];
    playerNames.forEach((name, index) => {
      const line = makeElement('div', 'player-line');
      const avatar = makeElement('span', `player-avatar${index === 1 ? ' o' : ''}`);
      const isCurrentPlayer = match.remote ? index === (match.myPlayerIndex ?? 0) : index === 0;
      if (isCurrentPlayer) renderUserAvatar(avatar, name);
      else renderContactAvatar(avatar, name);
      const mark = makeElement('span', `player-symbol ${index === 1 ? 'o' : ''}`, index === 0 ? 'X' : 'O');
      line.append(avatar, mark, makeElement('strong', '', name), makeElement('small', '', !isOver && current === index ? 'To play' : isOver ? 'Finished' : 'Waiting'));
      players.append(line);
    });
    $('#match-state-text').textContent = isOver ? finishLabel : match.isSpectator ? (match.isMock ? 'Watching a public demo · read-only' : 'Spectator view · public information') : match.remote ? currentPendingMoves().some((move) => move.matchId === match.id) ? 'Queued · not confirmed by the server' : current === match.myPlayerIndex ? `Your turn · Version ${match.version}` : 'Waiting for opponent' : match.isRealTimeDemo ? current === 0 ? 'Make a move to continue' : `${match.opponent} is thinking` : match.mode === 'computer' ? (current === 0 ? 'Make a move to continue' : 'Computer is thinking') : current === 0 ? 'Choose a move' : match.isDemoOnline ? 'Invitee turn' : 'Pass the device to Player 2';
    $('#board-hint').textContent = isOver ? `${finishLabel} · ${local ? 'The board is saved in My matches.' : 'The backend has saved the final state.'}` : match.isSpectator ? 'Watching the public game state. Moves are disabled.' : gameModule ? match.mode === 'computer' && current === 1 ? match.isRealTimeDemo ? `${match.opponent} is choosing a move…` : 'The computer is choosing a move…' : (match.mode === 'pass-and-play' || match.isDemoOnline) && current === 1 ? 'Player 2: take the device and make a move.' : gameModule.getTurnHint(gameState) : match.remote ? !remoteTicTacToe ? 'This backend engine has no portal view yet.' : match.pendingMove ? 'Submitting move to the backend…' : current === match.myPlayerIndex ? 'Choose an open square.' : 'Waiting for the other player.' : (match.mode === 'pass-and-play' || match.isDemoOnline) && current === 1 ? 'Pass the device to the invited player and reveal the board.' : current === 1 ? 'The computer is choosing a move…' : 'Choose an open square.';
    $('#rematch-button').hidden = !isOver;
    if (match.remote && match.packageUrl && !match.isSpectator) launchGamePackage(match);
    setView('play');
  }

  async function submitRemoteMove(match, cell) {
    if (match.pendingMove || match.status !== 'active' || match.gameEngineKey !== 'tic-tac-toe' || match.turnPlayerIndex !== match.myPlayerIndex) return;
    if (currentPendingMoves().some((move) => move.matchId === match.id)) {
      toast('A move for this match is already waiting to sync.');
      return;
    }
    const intent = {
      id: `move-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      matchId: match.id,
      title: match.title,
      cell,
      expectedVersion: match.version,
      userId: state.currentUser.id,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    if (!navigator.onLine) {
      queueRemoteMove(match, intent);
      return;
    }
    match.pendingMove = true;
    renderPlay(match);
    try {
      const response = await apiRequest(`/matches/${encodeURIComponent(match.id)}/moves`, {
        method: 'POST',
        body: JSON.stringify({ clientMoveId: intent.id, expectedVersion: intent.expectedVersion, move: { type: 'place', cell } }),
      });
      const updated = normalizeMatch(response.match || response);
      if (updated) Object.assign(match, updated);
      match.state = response.playerView || response.player_view || response.state || match.state;
      match.version = response.version ?? match.version + 1;
      match.turnPlayerIndex = response.turn ?? response.turnPlayerIndex ?? response.turn_player_index ?? match.turnPlayerIndex;
      if (response.status) match.status = ['OVER', 'FINISHED', 'COMPLETE'].includes(String(response.status).toUpperCase()) ? 'finished' : 'active';
      match.raw = { ...(match.raw || {}), ...(response.match || {}), playerView: match.state };
      match.pendingMove = false;
      match.updatedAt = new Date().toISOString();
      persistMatches();
      renderPlay(match);
    } catch (error) {
      match.pendingMove = false;
      if (error.message.startsWith('Could not reach the API')) {
        queueRemoteMove(match, intent);
        return;
      }
      renderPlay(match);
      toast(error.message);
    }
  }

  function queueRemoteMove(match, intent) {
    const board = Array.isArray(match.state && match.state.board) ? [...match.state.board] : null;
    if (!board || board[intent.cell] !== null) return toast('The current board no longer permits that move.');
    board[intent.cell] = match.myPlayerIndex === 0 ? 'X' : 'O';
    state.pendingMoves.push(intent);
    match.state = { ...match.state, board };
    match.pendingMove = true;
    persistPendingMoves();
    persistMatches();
    if (state.currentMatch === match) renderPlay(match);
    toast('Move queued. It is not confirmed until the server accepts it.');
  }

  async function flushPendingMoves() {
    if (!navigator.onLine || !state.authToken) return;
    for (const intent of currentPendingMoves()) {
      if (intent.status !== 'queued') continue;
      const match = state.matches.find((item) => item.id === intent.matchId);
      if (!match) {
        intent.status = 'needs-review';
        continue;
      }
      try {
        const response = await apiRequest(`/matches/${encodeURIComponent(intent.matchId)}/moves`, {
          method: 'POST',
          body: JSON.stringify({ clientMoveId: intent.id, expectedVersion: intent.expectedVersion, move: { type: 'place', cell: intent.cell } }),
        });
        match.state = response.playerView || response.player_view || response.state || match.state;
        match.version = response.version ?? match.version + 1;
        match.turnPlayerIndex = response.turn ?? match.turnPlayerIndex;
        if (response.status) match.status = String(response.status).toUpperCase() === 'OVER' ? 'finished' : 'active';
        match.pendingMove = false;
        state.pendingMoves = state.pendingMoves.filter((pending) => pending.id !== intent.id);
        persistPendingMoves();
        persistMatches();
        if (state.currentMatch === match) renderPlay(match);
      } catch (error) {
        if (/^409\b/.test(error.message)) {
          intent.status = 'needs-review';
          try {
            const latest = normalizeMatch(await apiRequest(`/matches/${encodeURIComponent(intent.matchId)}`));
            if (latest) Object.assign(match, latest);
          } catch { }
          match.pendingMove = false;
          persistPendingMoves();
          persistMatches();
          if (state.currentMatch === match) renderPlay(match);
          toast('A queued move conflicted with a newer match version. Review it before discarding.');
        }
        break;
      }
    }
    renderPendingMoves();
  }

  function discardPendingReviews() {
    const reviewIds = new Set(currentPendingMoves().filter((move) => move.status === 'needs-review').map((move) => move.id));
    state.pendingMoves = state.pendingMoves.filter((move) => !reviewIds.has(move.id));
    persistPendingMoves();
    persistMatches();
    renderMatches();
  }

  function openMatch(match) {
    if (!match) return;
    if (match.remote && match.status === 'lobby' && match.ownerUserId !== state.currentUser?.id && !match.isCurrentUserPlayer) {
      joinMatch(match);
      return;
    }
    if (match.remote && match.status === 'lobby') {
      setView('matches');
      state.currentMatchFilter = 'lobby';
      $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.matchFilter === 'lobby'));
      renderMatches();
      return;
    }
    if (match.remote && match.status === 'active' && !match.isCurrentUserPlayer) {
      if (!match.capabilities.spectators) {
        toast('This game version does not allow spectators.');
        return;
      }
      const publicView = match.raw && (match.raw.publicView || match.raw.public_view);
      if (!publicView) {
        toast('The backend did not provide a public spectator view for this match.');
        return;
      }
      match.isSpectator = true;
      match.state = publicView;
      match.myPlayerIndex = null;
    } else {
      match.isSpectator = false;
    }
    if (!match.remote && match.gameId !== 'ttt' && !(window.portalGames && window.portalGames[match.gameId])) {
      toast('This local game does not have a playable rules module yet.');
      return;
    }
    renderPlay(match);
  }

  async function copyInviteLink(match) {
    const invite = new URL(window.location.href);
    invite.search = '';
    invite.hash = '';
    invite.searchParams.set('match', match.id);
    try {
      await navigator.clipboard.writeText(invite.href);
      toast('Invite link copied. Send it to another signed-in player.');
    } catch {
      toast(`Invite link: ${invite.href}`);
    }
  }

  function openMockMatch(match) {
    if (match.status === 'lobby') {
      if (!match.isDemoOnline) {
        match.isDemoOnline = true;
        match.inviteKind = 'open';
        match.invitee = '';
        match.inviteCode = `GP-${String(match.id).slice(-6).toUpperCase()}`;
        match.mockJoined = false;
      }
      openDemoLobby(match);
      return;
    }
    const isDemoOnline = Boolean(match.isDemoOnline);
    $('#sample-match-title').textContent = match.title;
    $('#sample-match-type').textContent = isDemoOnline ? 'DEMO TABLE · LOCAL PREVIEW' : 'DESIGN MOCKUP · FICTIONAL DATA';
    $('#sample-match-copy').textContent = match.previewText || `${match.status.toUpperCase()} · ${match.opponent || 'Sample opponent'}`;
    $('#sample-match-note-title').textContent = isDemoOnline ? 'Preview only' : 'Sample only';
    $('#sample-match-note-copy').textContent = isDemoOnline
      ? 'The lobby flow and player response are simulated in this browser. Moves are not sent to another player or backend.'
      : 'This row demonstrates the match-list experience. It is not stored in or synchronized with the course backend.';
    const detail = $('#sample-match-detail');
    detail.replaceChildren();
    detail.append(makeElement('strong', '', match.status === 'finished' ? 'FINISHED' : match.status === 'lobby' ? 'OPEN LOBBY' : match.turnPlayerIndex === match.myPlayerIndex ? 'YOUR TURN' : 'WAITING'));
    if (Array.isArray(match.state && match.state.board)) {
      const board = makeElement('div', 'sample-board');
      match.state.board.forEach((cell) => board.append(makeElement('span', '', cell || '')));
      detail.append(board);
    }
    $('#sample-match-dialog').showModal();
  }

  function renderDemoLobby(match) {
    const modeName = String(match.mode).toUpperCase() === 'REAL_TIME' ? 'REAL-TIME' : 'PING-PONG';
    const isFriendInvite = match.inviteKind === 'friend';
    const otherPlayer = match.mockJoined ? isFriendInvite ? match.invitee : 'Jordan (demo stranger)' : isFriendInvite ? match.invitee : 'Open seat';
    $('#demo-lobby-title').textContent = `${match.title} lobby`;
    $('#demo-lobby-summary').textContent = match.mockJoined
      ? `${otherPlayer} joined the ${modeName.toLowerCase()} demo table.`
      : isFriendInvite ? `Invitation ready for ${match.invitee}. Waiting for them to accept.` : 'This table is open for another demo player to find.';
    $('#demo-lobby-mode').textContent = modeName;
    $('#demo-lobby-visibility').textContent = isFriendInvite ? 'FRIEND INVITE' : 'OPEN LOBBY';
    $('#demo-lobby-code').textContent = match.inviteCode;
    $('#demo-lobby-feedback').textContent = match.mockJoined ? 'Roster updated in this local demo.' : 'No player has joined yet.';
    const roster = $('#demo-lobby-roster');
    roster.replaceChildren();
    const players = [
      { name: state.demoProfile.displayName, status: 'Host · You', mark: state.demoProfile.displayName.charAt(0).toUpperCase(), host: true },
      { name: otherPlayer, status: match.mockJoined ? 'Joined · Demo' : isFriendInvite ? 'Invitation ready' : 'Open to strangers', mark: match.mockJoined ? otherPlayer.charAt(0).toUpperCase() : '＋', host: false },
    ];
    for (const player of players) {
      const row = makeElement('div', `lobby-player${player.host ? ' host' : ''}`);
      const avatar = makeElement('span', 'lobby-player-avatar');
      if (player.host) renderUserAvatar(avatar, player.name);
      else renderContactAvatar(avatar, player.name);
      row.append(avatar);
      const copy = makeElement('span', 'lobby-player-copy');
      copy.append(makeElement('strong', '', player.name), makeElement('small', '', player.status));
      row.append(copy);
      roster.append(row);
    }
    $('#simulate-lobby-response').hidden = match.mockJoined;
    $('#simulate-lobby-response').textContent = isFriendInvite ? `Simulate ${match.invitee} joining` : 'Simulate a stranger joining';
    $('#start-demo-lobby').disabled = !match.mockJoined;
  }

  function openDemoLobby(match) {
    state.demoLobby = match;
    renderDemoLobby(match);
    $('#demo-lobby-dialog').showModal();
  }

  function simulateDemoLobbyJoin() {
    const match = state.demoLobby;
    if (!match) return;
    match.mockJoined = true;
    match.opponent = match.inviteKind === 'friend' ? match.invitee : 'Jordan (demo stranger)';
    match.previewText = `${String(match.mode).toUpperCase() === 'REAL_TIME' ? 'Real-time' : 'Ping-pong'} · ${match.opponent} joined · Demo only`;
    persistMatches();
    renderMatches();
    renderDemoLobby(match);
  }

  function startDemoLobby() {
    const match = state.demoLobby;
    if (!match || !match.mockJoined) return;
    match.status = 'active';
    match.version += 1;
    match.turnPlayerIndex = 0;
    match.myPlayerIndex = 0;
    match.remote = false;
    match.isSpectator = false;
    const gameModule = window.portalGames && window.portalGames[match.gameId];
    if (gameModule) match.state = gameModule.createState();
    else if (match.gameId === 'ttt') match.state = { board: Array(9).fill(null), turn: 0, winner: null, winningLine: [] };
    match.previewText = `Demo table with ${match.opponent} · No online game is connected`;
    persistMatches();
    $('#demo-lobby-dialog').close();
    state.currentMatchFilter = 'active';
    $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.matchFilter === 'active'));
    setView('matches');
    openMatch(match);
  }

  async function openSharedMatchIfPresent() {
    const matchId = new URLSearchParams(window.location.search).get('match');
    if (!matchId) return;
    if (!state.authToken) {
      toast('Sign in to open this match link.');
      openSettings();
      return;
    }
    try {
      const result = await apiRequest(`/matches/${encodeURIComponent(matchId)}`);
      const match = normalizeMatch(result.match || result);
      if (!match) throw new Error('The match response did not include a match ID.');
      if (match.status === 'active' && !match.isCurrentUserPlayer && (!match.capabilities.spectators || !(match.raw.publicView || match.raw.public_view))) {
        toast('This match does not include a permitted public spectator view.');
        return;
      }
      state.matches = [match, ...state.matches.filter((item) => item.id !== match.id)];
      persistMatches();
      if (match.status === 'lobby' && match.ownerUserId === state.currentUser?.id) {
        setView('matches');
        state.currentMatchFilter = 'lobby';
        $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.matchFilter === 'lobby'));
        renderMatches();
      } else {
        openMatch(match);
      }
    } catch (error) {
      toast(`Could not open match: ${error.message}`);
    }
  }

  async function handleMatchAction(match) {
    if (match.status === 'lobby' && match.remote && match.ownerUserId !== state.currentUser?.id && !match.isCurrentUserPlayer) return joinMatch(match);
    if (match.status === 'lobby' && !match.remote) {
      toast('Local matches start immediately.');
      return;
    }
    if (match.status === 'lobby' && match.remote) {
      try {
        const result = await apiRequest(`/matches/${encodeURIComponent(match.id)}/start`, { method: 'POST' });
        const updated = normalizeMatch(result.match || result);
        if (updated) Object.assign(match, updated);
        else {
          match.status = 'active';
          match.raw = { ...(match.raw || {}), ...(result || {}) };
          match.state = result.state || match.state;
          match.turnPlayerIndex = result.turnPlayerIndex ?? result.turn_player_index ?? 0;
        }
        persistMatches();
        renderMatches();
      } catch (error) { toast(error.message); return; }
    }
    openMatch(match);
  }

  async function joinMatch(match) {
    try {
      await apiRequest(`/matches/${encodeURIComponent(match.id)}/join`, { method: 'POST' });
      const result = await apiRequest(`/matches/${encodeURIComponent(match.id)}`);
      const updated = normalizeMatch(result.match || result);
      if (updated) Object.assign(match, updated);
      persistMatches();
      renderMatches();
      openMatch(match);
    } catch (error) { toast(error.message); }
  }

  function launchGamePackage(match) {
    if (!match.packageUrl || !match.remote || !match.state) return;
    const dialog = $('#package-dialog');
    const frame = $('#game-frame');
    if (state.gameFrame === match.id) return;
    state.gameFrame = match.id;
    $('#package-title').textContent = match.title;
    $('#package-status').textContent = `Match #${match.id} · Version ${match.version}`;
    frame.src = match.packageUrl;
    dialog.showModal();
    frame.onload = () => sendStateChange(match);
  }

  function sendStateChange(match) {
    const frame = $('#game-frame');
    if (!frame.contentWindow || !match.state) return;
    const players = Array.isArray(match.raw && match.raw.players) ? match.raw.players : [];
    const myIndex = match.myPlayerIndex ?? 0;
    const turn = match.turnPlayerIndex;
    frame.contentWindow.postMessage({
      message_kind: 'state_change',
      state: match.state,
      turn_of_user: turn === null ? null : { player_index: turn, kind: 'human' },
      my_user: { player_index: myIndex, kind: 'human' },
      players: players.length ? players.map((player, index) => ({ player_index: player.playerIndex ?? player.player_index ?? index, kind: player.kind || 'human' })) : [{ player_index: myIndex, kind: 'human' }],
    }, '*');
  }

  async function handlePackageMessage(event) {
    const frame = $('#game-frame');
    if (event.source !== frame.contentWindow || !event.data || event.data.message_kind !== 'make_move') return;
    const match = state.matches.find((item) => item.remote && item.id === state.gameFrame);
    if (!match) return;
    if (!event.data.move || typeof event.data.move !== 'object') {
      $('#package-status').textContent = 'The game package sent a move without a move payload.';
      return;
    }
    $('#package-status').textContent = 'Submitting move…';
    try {
      const result = await apiRequest(`/matches/${encodeURIComponent(match.id)}/moves`, {
        method: 'POST',
        body: JSON.stringify({ clientMoveId: `move-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`, expectedVersion: match.version, move: event.data.move }),
      });
      const updated = normalizeMatch(result.match || result.data || result);
      if (updated) Object.assign(match, updated);
      match.version = result.version ?? match.version + 1;
      match.state = result.playerView || result.player_view || result.state || match.state;
      match.turnPlayerIndex = result.turn ?? result.turnPlayerIndex ?? match.turnPlayerIndex;
      match.raw = { ...(match.raw || {}), ...(result.match || {}), playerView: match.state };
      $('#package-status').textContent = `Move accepted · Version ${match.version}`;
      persistMatches();
      sendStateChange(match);
    } catch (error) {
      $('#package-status').textContent = `Move not accepted: ${error.message}`;
    }
  }

  function openMatchActions(match) {
    state.actionMatch = match;
    const isOwner = match.remote && state.currentUser && match.ownerUserId === state.currentUser.id;
    const shareable = match.remote && (match.status === 'lobby' || match.capabilities.spectators === true);
    $('#match-actions-title').textContent = match.title;
    $('#match-actions-note').textContent = !match.remote
      ? 'Hiding removes this local match from this device only.'
      : match.status === 'lobby'
        ? 'Leave removes your seat. Cancel ends the shared lobby for everyone.'
        : match.status === 'active'
          ? 'Leaving an ongoing match is disabled because the backend does not reassign an abandoned turn. The owner can cancel the whole match.'
          : 'Hiding removes this match from your list only.';
    $('#share-match-button').hidden = !shareable;
    $('#leave-match-button').hidden = !match.remote || !match.isCurrentUserPlayer;
    $('#leave-match-button').disabled = match.status !== 'lobby';
    $('#leave-match-button').textContent = match.status === 'lobby' ? 'Leave lobby' : 'Leave unavailable during ongoing match';
    $('#cancel-match-button').hidden = !isOwner || !['lobby', 'active'].includes(match.status);
    $('#match-actions-dialog').showModal();
  }

  async function leaveRemoteMatch(match) {
    if (!match.remote || match.status !== 'lobby') return;
    try {
      await apiRequest(`/matches/${encodeURIComponent(match.id)}/leave`, { method: 'POST' });
      state.matches = state.matches.filter((item) => item.id !== match.id);
      persistMatches();
      $('#match-actions-dialog').close();
      if (state.currentMatch && state.currentMatch.id === match.id) setView('matches');
      renderMatches();
      toast('You left the lobby. The match remains available to its other players.');
    } catch (error) { toast(error.message); }
  }

  async function cancelRemoteMatch(match) {
    if (!match.remote || match.ownerUserId !== state.currentUser?.id) return;
    try {
      const result = await apiRequest(`/matches/${encodeURIComponent(match.id)}/cancel`, { method: 'POST' });
      const updated = normalizeMatch(result.match || result);
      if (updated) Object.assign(match, updated);
      match.status = 'finished';
      state.actionMatch = null;
      persistMatches();
      $('#match-actions-dialog').close();
      if (state.currentMatch && state.currentMatch.id === match.id) setView('matches');
      renderMatches();
      toast('The shared match was cancelled.');
    } catch (error) { toast(error.message); }
  }

  function hideMatch(matchId) {
    const match = state.matches.find((item) => item.id === matchId);
    if (match && match.remote && !match.isMock) {
      state.hiddenMatchIds.add(hiddenMatchKey(matchId));
      localStorage.setItem(HIDDEN_MATCHES_KEY, JSON.stringify([...state.hiddenMatchIds]));
    }
    state.matches = state.matches.filter((match) => match.id !== matchId);
    persistMatches();
    $('#match-actions-dialog').close();
    if (state.currentMatch && state.currentMatch.id === matchId) setView('matches');
    renderMatches();
    toast('Match hidden from your list.');
  }

  function saveConnections() {
    const previousBase = normalizedBase();
    state.apiBaseUrl = $('#api-url').value.trim();
    state.builderUrl = $('#builder-url').value.trim() || 'https://github.com/marcelle-r/gamebuilder';
    localStorage.setItem(API_KEY, state.apiBaseUrl);
    localStorage.setItem(BUILDER_KEY, state.builderUrl);
    if (previousBase !== normalizedBase() && state.authToken) clearSession();
    $('#settings-dialog').close();
    loadRemoteData().catch((error) => {
      setConnection(false, 'API unavailable');
      toast(error.message);
      renderGames();
      renderMatches();
    });
  }

  async function testApi() {
    const field = $('#api-url');
    const url = field.value.trim().replace(/\/+$/, '');
    if (!url) {
      $('#settings-feedback').textContent = 'Enter the backend base URL first.';
      return;
    }
    $('#settings-feedback').textContent = 'Checking GET /health/ready…';
    try {
      const response = await fetch(`${url}/health/ready`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`GET /health/ready returned ${response.status}.`);
      if (state.authToken && url === normalizedBase()) {
        await apiRequest('/users/me');
        $('#settings-feedback').textContent = 'API and signed-in session are ready.';
      } else {
        $('#settings-feedback').textContent = 'API is reachable. Sign in to access games and matches.';
      }
    } catch (error) {
      $('#settings-feedback').textContent = error instanceof TypeError ? 'Could not reach the API. Check the URL, server, and CORS settings.' : error.message;
    }
  }

  async function signIn() {
    state.apiBaseUrl = $('#api-url').value.trim();
    localStorage.setItem(API_KEY, state.apiBaseUrl);
    const email = $('#login-email').value.trim();
    const developmentKey = $('#development-key').value;
    if (!email || !developmentKey) {
      $('#settings-feedback').textContent = 'Enter the local account email and development key.';
      return;
    }
    $('#sign-in-button').disabled = true;
    $('#settings-feedback').textContent = 'Signing in…';
    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        authenticated: false,
        body: JSON.stringify({ email, developmentKey }),
      });
      if (!result.accessToken || !result.user) throw new Error('The login response did not include an accessToken and user.');
      state.authToken = result.accessToken;
      state.currentUser = result.user;
      state.profileSettings = readProfileSettings(profileSettingsIdentity(result.user, state.demoProfile), result.user.displayName || result.user.name || result.user.email || 'Player');
      sessionStorage.setItem(TOKEN_KEY, result.accessToken);
      $('#development-key').value = '';
      renderIdentity();
      persistPendingMoves();
      await loadRemoteData();
      await flushPendingMoves();
      await openSharedMatchIfPresent();
      $('#settings-feedback').textContent = `Signed in as ${result.user.displayName}.`;
      $('#settings-dialog').close();
      toast(`Signed in as ${result.user.displayName}.`);
    } catch (error) {
      state.authToken = '';
      state.currentUser = null;
      state.profileSettings = readProfileSettings(profileSettingsIdentity(null, state.demoProfile), state.demoProfile.displayName);
      sessionStorage.removeItem(TOKEN_KEY);
      renderIdentity();
      $('#settings-feedback').textContent = error.message;
    } finally {
      $('#sign-in-button').disabled = false;
    }
  }

  function toast(message) {
    const target = $('#toast');
    target.textContent = message;
    target.classList.add('show');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => target.classList.remove('show'), 3400);
  }

  function bindEvents() {
    $('#home-link').addEventListener('click', (event) => {
      event.preventDefault();
      setView('discover');
      if (window.location.hash !== '#discover') history.replaceState(null, '', '#discover');
    });
    $$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    $$('[data-switch-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.switchView)));
    $$('[data-quick-game], [data-create-game]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.quickGame || button.dataset.createGame)));
    $('#new-match-button').addEventListener('click', () => openCreateDialog());
    $('#create-submit').addEventListener('click', createMatch);
    $('#game-search').addEventListener('input', (event) => { state.search = event.target.value; renderGames(); });
    $$('.filter-chip').forEach((button) => button.addEventListener('click', () => {
      state.currentFilter = button.dataset.filter;
      $$('.filter-chip').forEach((chip) => chip.classList.toggle('selected', chip === button));
      renderGames();
    }));
    $$('.match-tab').forEach((button) => button.addEventListener('click', () => {
      state.currentMatchFilter = button.dataset.matchFilter;
      $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab === button));
      renderMatches();
    }));
    $$('.mode-option').forEach((option) => option.addEventListener('click', () => {
      $$('.mode-option').forEach((item) => item.classList.toggle('selected', item === option));
      $('input', option).checked = true;
      updateCreateMode();
    }));
    $$('input[name="invite-kind"]').forEach((input) => input.addEventListener('change', updateCreateMode));
    $('#create-game').addEventListener('change', updateCreateMode);
    $('#copy-demo-invite').addEventListener('click', async () => {
      if (!state.demoLobby) return;
      try {
        await navigator.clipboard.writeText(state.demoLobby.inviteCode);
        $('#demo-lobby-feedback').textContent = 'Demo invite code copied. It is not shared with another device.';
      } catch {
        $('#demo-lobby-feedback').textContent = `Demo invite code: ${state.demoLobby.inviteCode}. It is not shared online.`;
      }
    });
    $('#simulate-lobby-response').addEventListener('click', simulateDemoLobbyJoin);
    $('#start-demo-lobby').addEventListener('click', startDemoLobby);
    $('#settings-button').addEventListener('click', openSettings);
    $('#top-settings-button').addEventListener('click', openSettings);
    $('#top-theme-toggle').addEventListener('click', () => {
      state.profileSettings.theme = state.profileSettings.theme === 'dark' ? 'light' : 'dark';
      persistProfileSettings();
      renderProfile();
    });
    $('#connection-pill').addEventListener('click', () => state.authToken ? openSettings() : openLogin());
    $('#profile-button').addEventListener('click', () => setView('profile'));
    $('#top-profile-trigger').addEventListener('click', () => {
      const menu = $('#top-profile-menu');
      menu.hidden = !menu.hidden;
      $('#top-profile-trigger').setAttribute('aria-expanded', String(!menu.hidden));
    });
    $('#top-profile-open').addEventListener('click', () => {
      closeTopProfileMenu();
      setView('profile');
    });
    $('#top-profile-switch').addEventListener('click', () => {
      const options = $('#top-profile-switch-options');
      options.hidden = !options.hidden;
      $('#top-profile-switch').setAttribute('aria-expanded', String(!options.hidden));
    });
    $$('[data-top-demo-profile]').forEach((button) => button.addEventListener('click', () => {
      startDemoProfile(button.dataset.topDemoProfile, button.dataset.topDemoProvider);
      closeTopProfileMenu();
    }));
    $('#top-profile-signout').addEventListener('click', () => {
      clearSession();
      closeTopProfileMenu();
      setConnection(false, normalizedBase() ? 'Sign in' : 'Local demo');
      setView('discover');
    });
    document.addEventListener('click', (event) => {
      if (!$('#top-profile-wrap').contains(event.target)) closeTopProfileMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeTopProfileMenu();
    });
    $('#language-select').addEventListener('change', (event) => {
      state.language = event.target.value;
      localStorage.setItem(LANGUAGE_KEY, state.language);
      $('#language-feedback').textContent = state.language === 'es' ? 'Preferencia guardada en este dispositivo.' : 'Preference saved on this device.';
    });
    $$('[data-profile-tab]').forEach((tab) => tab.addEventListener('click', () => setProfileTab(tab.dataset.profileTab)));
    $('#profile-account-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      state.profileSettings.username = $('#profile-username').value.trim();
      state.profileSettings.email = $('#profile-email').value.trim();
      state.profileSettings.phone = $('#profile-phone').value.trim();
      persistProfileSettings();
      renderIdentity();
      $('#profile-account-feedback').textContent = 'Profile saved on this device.';
    });
    $('#choose-profile-picture').addEventListener('click', () => $('#profile-picture-input').click());
    $('#profile-picture-input').addEventListener('change', async (event) => {
      const input = event.currentTarget;
      const file = input.files[0];
      if (!file) return;
      $('#profile-picture-feedback').textContent = 'Preparing photo…';
      try {
        state.profileSettings.avatarDataUrl = await avatarImageData(file);
        state.profileSettings.avatarPreset = 'initials';
        persistProfileSettings();
        renderIdentity();
        $('#profile-picture-feedback').textContent = 'Profile photo saved on this device.';
      } catch (error) {
        $('#profile-picture-feedback').textContent = error.message;
      } finally {
        input.value = '';
      }
    });
    $('#remove-profile-picture').addEventListener('click', () => {
      state.profileSettings.avatarDataUrl = '';
      state.profileSettings.avatarPreset = 'initials';
      persistProfileSettings();
      renderIdentity();
      $('#profile-picture-feedback').textContent = 'Photo removed. Using initials.';
    });
    $$('[data-avatar-preset]').forEach((button) => button.addEventListener('click', () => {
      state.profileSettings.avatarDataUrl = '';
      state.profileSettings.avatarPreset = button.dataset.avatarPreset;
      persistProfileSettings();
      renderIdentity();
      $('#profile-picture-feedback').textContent = 'Avatar saved on this device.';
    }));
    $$('[data-social-toggle]').forEach((button) => button.addEventListener('click', () => {
      const provider = button.dataset.socialToggle;
      state.profileSettings.socials[provider] = !state.profileSettings.socials[provider];
      persistProfileSettings();
      renderProfile();
    }));
    $$('[data-theme-option]').forEach((button) => button.addEventListener('click', () => {
      state.profileSettings.theme = button.dataset.themeOption;
      persistProfileSettings();
      renderProfile();
    }));
    $$('[data-notification]').forEach((input) => input.addEventListener('change', () => {
      state.profileSettings.notifications[input.dataset.notification] = input.checked;
      persistProfileSettings();
    }));
    $('#remove-payment-button').addEventListener('click', () => {
      state.profileSettings.hasSamplePayment = false;
      persistProfileSettings();
      renderProfile();
    });
    $('#add-payment-button').addEventListener('click', () => {
      state.profileSettings.hasSamplePayment = true;
      persistProfileSettings();
      renderProfile();
    });
    $('#mark-all-read-button').addEventListener('click', () => {
      state.mockMessages.forEach((message) => { message.unread = false; });
      persistMockMessages();
      renderProfileMessages();
    });
    $('#conversation-back').addEventListener('click', () => $('.inbox-layout').classList.remove('thread-open'));
    $('#message-reply-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      const message = state.mockMessages.find((item) => item.id === state.selectedConversationId);
      if (!message) return;
      const body = $('#message-reply-text').value.trim();
      message.thread = message.thread || [];
      message.thread.push({ sender: 'You', body, time: 'Just now' });
      message.body = body;
      message.received = 'Just now';
      persistMockMessages();
      renderProfileMessages();
      renderConversation(message);
      $('#message-feedback').textContent = 'Saved locally; no message was sent.';
      $('#message-reply-text').value = '';
    });
    $('#support-form').addEventListener('submit', (event) => {
      event.preventDefault();
      if (!event.currentTarget.reportValidity()) return;
      let requests = [];
      try {
        const savedRequests = JSON.parse(localStorage.getItem('gameportal.supportRequests') || '[]');
        requests = Array.isArray(savedRequests) ? savedRequests : [];
      } catch { requests = []; }
      requests.push({ topic: $('#support-topic').value, message: $('#support-message').value.trim(), createdAt: new Date().toISOString() });
      localStorage.setItem('gameportal.supportRequests', JSON.stringify(requests));
      $('#support-feedback').textContent = 'Demo request saved locally; no team was contacted.';
      $('#support-message').value = '';
    });
    $('#profile-lobbies-button').addEventListener('click', () => {
      state.currentMatchFilter = 'lobby';
      $$('.match-tab').forEach((tab) => tab.classList.toggle('selected', tab.dataset.matchFilter === 'lobby'));
      setView('matches');
    });
    $$('[data-demo-login]').forEach((button) => button.addEventListener('click', () => {
      const name = button.dataset.demoLogin;
      startDemoProfile(name, name === 'Guest player' ? 'Guest' : name === 'Alex' ? 'Google demo' : 'Facebook demo');
    }));
    $('#show-phone-login').addEventListener('click', () => {
      $('#phone-login').hidden = false;
      $('#mock-phone').focus();
    });
    $('#send-mock-code').addEventListener('click', () => {
      state.mockPhone = $('#mock-phone').value.trim();
      $('#login-feedback').textContent = state.mockPhone ? 'Demo verification code: 123456' : 'Enter a phone number first.';
    });
    $('#verify-mock-code').addEventListener('click', () => {
      if (!state.mockPhone) {
        $('#login-feedback').textContent = 'Enter a phone number and request a demo code first.';
        return;
      }
      if ($('#mock-code').value !== '123456') {
        $('#login-feedback').textContent = 'That demo code is not correct.';
        return;
      }
      startDemoProfile(`Mobile player · ${state.mockPhone.slice(-4)}`, 'Phone demo');
    });
    $('#save-settings-button').addEventListener('click', saveConnections);
    $('#test-api-button').addEventListener('click', testApi);
    $('#sign-in-button').addEventListener('click', signIn);
    $('#sign-out-button').addEventListener('click', () => {
      clearSession();
      $('#settings-feedback').textContent = 'Signed out. Local matches remain on this device.';
    });
    $('#builder-link').addEventListener('click', () => {
      const url = state.builderUrl;
      if (!url) { openSettings(); return; }
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    $('#handoff-button').addEventListener('click', () => {
      if (!state.currentMatch) return;
      state.currentMatch.handoffPending = false;
      renderPlay(state.currentMatch);
    });
    $('#share-match-button').addEventListener('click', () => {
      if (state.actionMatch) copyInviteLink(state.actionMatch);
    });
    $('#leave-match-button').addEventListener('click', () => {
      if (state.actionMatch) leaveRemoteMatch(state.actionMatch);
    });
    $('#cancel-match-button').addEventListener('click', () => {
      if (state.actionMatch) cancelRemoteMatch(state.actionMatch);
    });
    $('#hide-match-button').addEventListener('click', () => {
      if (state.actionMatch) hideMatch(state.actionMatch.id);
    });
    $('#match-actions-dialog').addEventListener('close', () => { state.actionMatch = null; });
    $('#pending-moves-button').addEventListener('click', () => {
      renderPendingMoves();
      $('#offline-dialog').showModal();
    });
    $('#retry-pending-button').addEventListener('click', () => flushPendingMoves().catch((error) => toast(error.message)));
    $('#discard-pending-button').addEventListener('click', discardPendingReviews);
    $('#rematch-button').addEventListener('click', () => {
      const previous = state.currentMatch;
      if (!previous || previous.remote) { toast('Remote rematches start from the match lobby.'); return; }
      const rematch = makeLocalMatch(gameCatalog.find((game) => game.id === previous.gameId) || gameCatalog[0], previous.mode);
      if (previous.isRealTimeDemo) {
        rematch.isRealTimeDemo = true;
        rematch.inviteKind = previous.inviteKind;
        rematch.invitee = previous.invitee;
        rematch.opponent = previous.opponent;
        rematch.previewText = previous.previewText;
      }
      state.matches.unshift(rematch);
      persistMatches();
      openMatch(rematch);
    });
    window.addEventListener('message', handlePackageMessage);
    window.addEventListener('focus', refreshWithNotice);
    window.addEventListener('online', refreshWithNotice);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshWithNotice();
    });
    $('#package-dialog').addEventListener('close', () => {
      state.gameFrame = null;
      $('#game-frame').src = 'about:blank';
    });
  }

  function openSettings() {
    $('#api-url').value = state.apiBaseUrl;
    $('#builder-url').value = state.builderUrl;
    $('#settings-feedback').textContent = '';
    renderIdentity();
    $('#settings-dialog').showModal();
  }

  function openLogin() {
    $('#login-feedback').textContent = '';
    $('#phone-login').hidden = true;
    $('#login-dialog').showModal();
  }

  bindEvents();
  ensureDemoMatches();
  renderIdentity();
  persistMatches();
  persistPendingMoves();
  renderQuickStartArt();
  renderGames();
  renderMatches();
  if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
  if (state.authToken) {
    apiRequest('/users/me').then((user) => {
      state.currentUser = user;
      state.profileSettings = readProfileSettings(profileSettingsIdentity(user, state.demoProfile), user.displayName || user.name || user.email || 'Player');
      renderIdentity();
      persistPendingMoves();
      return loadRemoteData().then(flushPendingMoves).then(openSharedMatchIfPresent);
    }).catch((error) => {
      clearSession();
      $('#game-source-note').textContent = 'Backend sign-in expired · showing local examples.';
      renderGames();
      renderMatches();
      if (normalizedBase()) toast(error.message);
    });
  } else {
    loadRemoteData().catch((error) => {
      setConnection(false, 'API unavailable');
      $('#game-source-note').textContent = 'Backend unavailable · showing local examples.';
      renderGames();
      renderMatches();
      if (normalizedBase()) toast(error.message);
    });
  }
})();
