(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const icon = (name) => `<i data-lucide="${name}"></i>`;
  const fail = (message) => ({ error: message });
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const cleanName = (value) => String(value ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const normaliseCode = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 5);
  const normaliseRating = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(Math.round(n), 100, 5000) : 500;
  };

  const GAME_META = {
    connect4: { label: 'Connect 4', tagline: 'Four in a row', players: 2, maxPlayers: 2, help: 'Drop a disc. Four in a row wins.' },
    battleship: { label: 'Battleship', tagline: 'Find the fleet', players: 2, maxPlayers: 2, help: 'Ready your fleet, then take one shot at a time.' },
    uno: { label: 'Uno', tagline: 'Match colour or number', players: 4, maxPlayers: 4, help: 'Play a matching colour or number. Wilds choose a colour.' },
    chess: { label: 'Chess', tagline: 'The quiet classic', players: 2, maxPlayers: 2, help: 'White moves first. Click a piece, then a highlighted square.' },
    checkers: { label: 'Checkers', tagline: 'Take the whole board', players: 2, maxPlayers: 2, help: 'Move diagonally. Captures are mandatory; reach the far side to crown a king.' },
    reversi: { label: 'Reversi', tagline: 'Flip the tide', players: 2, maxPlayers: 2, help: 'Bracket a line of discs to flip it to your colour. Most discs wins.' },
    dominoes: { label: 'Dominoes', tagline: 'Match the open ends', players: 4, maxPlayers: 4, help: 'Match a tile to either open end. Play your whole hand or finish with the lowest pip count.' },
    blackjack: { label: 'Blackjack', tagline: 'Beat the house', players: 4, maxPlayers: 4, help: 'Get closer to 21 than the dealer without going bust. Aces count 1 or 11; face cards count 10.' },
    eights: { label: 'Crazy Eights', tagline: 'Match suit or rank', players: 4, maxPlayers: 4, help: 'Play a card matching the suit or rank. Eights are wild — play one and call the next suit.' },
    memory: { label: 'Memory', tagline: 'Pair the deck', players: 4, maxPlayers: 4, help: 'Flip two cards. A matching rank keeps your turn and scores a pair; most pairs wins.' },
    tictactoe: { label: 'Tic-Tac-Toe', tagline: 'Three in a row', players: 2, maxPlayers: 2, help: 'Claim three cells in a row, column, or diagonal. X moves first.' },
    mancala: { label: 'Mancala', tagline: 'Sow the stones', players: 2, maxPlayers: 2, help: 'Scoop one of your pits and sow the stones. Land in your store for a free turn; finish in an empty pit to capture.' },
    gofish: { label: 'Go Fish', tagline: 'Ask, draw, collect', players: 4, maxPlayers: 4, help: 'Ask a player for a rank you hold. Collect all four cards of a rank to make a book; most books wins.' },
    dots: { label: 'Dots & Boxes', tagline: 'Claim every square', players: 2, maxPlayers: 2, help: 'Draw one line between two dots. Complete the fourth side of a box to claim it and take another turn.' },
    nim: { label: 'Nim', tagline: 'Leave the last stone', players: 2, maxPlayers: 2, help: 'Take one to three stones from a single pile. Take the last stone to win.' }
  };
  const GAME_KEYS = Object.keys(GAME_META);

  const GAME_ART = {
    connect4: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="7" y="8" width="50" height="48" rx="12" fill="#15213f"/><g fill="#0a1020"><circle cx="19" cy="21" r="5.2"/><circle cx="32" cy="21" r="5.2"/><circle cx="45" cy="21" r="5.2"/><circle cx="19" cy="34" r="5.2"/><circle cx="32" cy="34" r="5.2"/><circle cx="45" cy="34" r="5.2"/><circle cx="19" cy="47" r="5.2"/><circle cx="32" cy="47" r="5.2"/><circle cx="45" cy="47" r="5.2"/></g><circle cx="32" cy="34" r="5.2" fill="#f36f5f"/><circle cx="19" cy="47" r="5.2" fill="#f1c453"/><circle cx="45" cy="21" r="5.2" fill="#f36f5f"/></svg>`,
    battleship: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M4 47c7-4 12 4 19 0s12 4 19 0 12 4 18 0v9H4z" fill="#2a6f8f" opacity=".65"/><path d="M4 39c6-3 11 3 18 0s12 3 18 0 12 3 20 0" fill="none" stroke="#77c6d8" stroke-width="2" stroke-linecap="round" opacity=".65"/><path d="M19 35h25l8 8H12z" fill="#dce7f3"/><path d="M26 23h11v12H26z" fill="#aebfd2"/><path d="M31 15v9M25 24h17" fill="none" stroke="#dce7f3" stroke-width="2.5" stroke-linecap="round"/><circle cx="43" cy="16" r="8" fill="none" stroke="#f36f5f" stroke-width="2"/><path d="M43 8v16M35 16h16" stroke="#f36f5f" stroke-width="2" stroke-linecap="round"/></svg>`,
    uno: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g transform="rotate(-16 32 34)"><rect x="15" y="14" width="25" height="38" rx="6" fill="#d94a4a" stroke="#fff" stroke-opacity=".35"/><text x="27.5" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="#fff">7</text></g><g transform="rotate(15 32 34)"><rect x="27" y="12" width="25" height="38" rx="6" fill="#2f7fbf" stroke="#fff" stroke-opacity=".35"/><text x="39.5" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="800" fill="#fff">4</text></g><g transform="rotate(1 32 33)"><rect x="21" y="18" width="25" height="38" rx="6" fill="#171b29" stroke="#f1c453" stroke-width="2"/><path d="M25 47h17l-3-11 6-7-6-1-3-5-4 5-6 1 4 7z" fill="#f1c453"/><text x="33.5" y="34" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="800" fill="#171b29">UNO</text></g></svg>`,
    chess: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="#d9c7a5" opacity=".9"><rect x="12" y="12" width="10" height="10"/><rect x="32" y="12" width="10" height="10"/><rect x="22" y="22" width="10" height="10"/><rect x="42" y="22" width="10" height="10"/><rect x="12" y="32" width="10" height="10"/><rect x="32" y="32" width="10" height="10"/></g><g fill="#768095" opacity=".55"><rect x="22" y="12" width="10" height="10"/><rect x="42" y="12" width="10" height="10"/><rect x="12" y="22" width="10" height="10"/><rect x="32" y="22" width="10" height="10"/><rect x="22" y="32" width="10" height="10"/><rect x="42" y="32" width="10" height="10"/></g><path d="M24 49h22v-5l-5-2-1-9c-1-7-5-10-10-14l3-6-4-2-5 6-5 1 3 5-7 2 4 5-2 4 7 3 1 6-4 2v4z" fill="#f3f0e7"/><circle cx="30" cy="18" r="1.4" fill="#171a21"/></svg>`,
    checkers: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="#d9c7a5"><rect x="9" y="9" width="12" height="12"/><rect x="33" y="9" width="12" height="12"/><rect x="21" y="21" width="12" height="12"/><rect x="45" y="21" width="12" height="12"/><rect x="9" y="33" width="12" height="12"/><rect x="33" y="33" width="12" height="12"/><rect x="21" y="45" width="12" height="12"/><rect x="45" y="45" width="12" height="12"/></g><g fill="#687083" opacity=".75"><rect x="21" y="9" width="12" height="12"/><rect x="45" y="9" width="12" height="12"/><rect x="9" y="21" width="12" height="12"/><rect x="33" y="21" width="12" height="12"/><rect x="21" y="33" width="12" height="12"/><rect x="45" y="33" width="12" height="12"/><rect x="9" y="45" width="12" height="12"/><rect x="33" y="45" width="12" height="12"/></g><circle cx="39" cy="27" r="10" fill="#d84949" stroke="#f6b3b3" stroke-width="2"/><circle cx="25" cy="39" r="10" fill="#202430" stroke="#8e96a8" stroke-width="2"/><path d="M22 43h6l-1-4 2-2-2-1-1-2-2 2-2 1 1 2z" fill="#f1c453"/></svg>`,
    reversi: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="7" y="7" width="50" height="50" rx="11" fill="#1e5c49"/><g fill="#2d745b" stroke="#174535"><rect x="13" y="13" width="11" height="11"/><rect x="35" y="13" width="11" height="11"/><rect x="24" y="24" width="11" height="11"/><rect x="46" y="24" width="11" height="11"/><rect x="13" y="35" width="11" height="11"/><rect x="35" y="35" width="11" height="11"/><rect x="24" y="46" width="11" height="11"/><rect x="46" y="46" width="11" height="11"/></g><circle cx="29" cy="29" r="8.5" fill="#161a22"/><circle cx="40" cy="40" r="8.5" fill="#f4efe3"/></svg>`,
    dominoes: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g transform="rotate(-12 25 32)"><rect x="11" y="8" width="27" height="48" rx="7" fill="#f2ead9" stroke="#c5b79b"/><path d="M12 32h25" stroke="#b8aa90" stroke-width="2"/><g fill="#2b3040"><circle cx="20" cy="18" r="2.3"/><circle cx="29" cy="18" r="2.3"/><circle cx="20" cy="42" r="2.3"/><circle cx="25" cy="47" r="2.3"/></g></g><g transform="rotate(13 42 34)"><rect x="29" y="12" width="27" height="48" rx="7" fill="#e86d58" stroke="#f5a99b"/><path d="M30 36h25" stroke="#f5a99b" stroke-width="2"/><g fill="#fff6ee"><circle cx="38" cy="23" r="2.4"/><circle cx="47" cy="23" r="2.4"/><circle cx="38" cy="29" r="2.4"/><circle cx="47" cy="29" r="2.4"/><circle cx="43" cy="44" r="2.4"/></g></g></svg>`,
    blackjack: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="19" y="7" width="31" height="45" rx="5" fill="#f4efe3" stroke="#cfc3ab" transform="rotate(-8 34 29)"/><text x="27" y="21" font-family="Georgia,serif" font-size="13" font-weight="700" fill="#171a21">A</text><path d="M30 31c-4-3-6-5-6-8 0-2 2-4 4-4 1 0 2 .4 3 1.3C32 19.4 33 19 34 19c2 0 4 2 4 4 0 3-2 5-6 8l-1 .7z" fill="#171a21"/><rect x="16" y="19" width="31" height="45" rx="5" fill="#f4efe3" stroke="#cfc3ab" transform="rotate(7 31 41)"/><text x="25" y="33" font-family="Georgia,serif" font-size="13" font-weight="700" fill="#c74444">K</text><path d="M29 42c-3-3-4-5-4-7 0-2 1.5-3.5 3.5-3.5 1 0 1.7.4 2.5 1.2.8-.8 1.5-1.2 2.5-1.2 2 0 3.5 1.5 3.5 3.5 0 2-1 4-4 7l-2 1.7z" fill="#c74444"/><circle cx="49" cy="50" r="9" fill="#ff5c35" stroke="#ffb59c" stroke-width="2"/><circle cx="49" cy="50" r="4.5" fill="none" stroke="#2a120c" stroke-width="1.5"/></svg>`,
    eights: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g transform="rotate(-17 25 34)"><rect x="7" y="13" width="25" height="38" rx="5" fill="#f4efe3" stroke="#cfc3ab"/><text x="19.5" y="38" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="700" fill="#171a21">8</text><text x="12" y="24" font-family="Arial,sans-serif" font-size="10" fill="#171a21">♠</text></g><g transform="rotate(14 41 32)"><rect x="31" y="11" width="25" height="38" rx="5" fill="#f4efe3" stroke="#cfc3ab"/><text x="43.5" y="36" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="700" fill="#c74444">8</text><text x="36" y="22" font-family="Arial,sans-serif" font-size="10" fill="#c74444">♥</text></g><g transform="rotate(1 32 34)"><rect x="20" y="20" width="26" height="38" rx="5" fill="#171a22" stroke="#ff5c35" stroke-width="2"/><text x="33" y="45" text-anchor="middle" font-family="Georgia,serif" font-size="23" font-weight="700" fill="#ff5c35">8</text><path d="M27 30h12" stroke="#ff5c35" stroke-width="2" stroke-linecap="round"/><text x="33" y="25" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#f4efe3">WILD</text></g></svg>`,
    memory: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="8" y="9" width="22" height="31" rx="5" fill="#f4efe3" stroke="#cfc3ab" transform="rotate(-7 19 24)"/><text x="19" y="30" text-anchor="middle" font-family="Georgia,serif" font-size="16" font-weight="700" fill="#171a21">Q</text><rect x="34" y="9" width="22" height="31" rx="5" fill="#171a22" stroke="#ff5c35" stroke-width="2" transform="rotate(8 45 24)"/><path d="M42 20l8 8m0-8l-8 8" stroke="#ff5c35" stroke-width="2" stroke-linecap="round"/><rect x="8" y="32" width="22" height="24" rx="5" fill="#c8f04a" stroke="#a9d12f" transform="rotate(4 19 44)"/><text x="19" y="49" text-anchor="middle" font-family="Georgia,serif" font-size="14" font-weight="700" fill="#171a21">7</text><rect x="36" y="35" width="20" height="26" rx="5" fill="#20231f" stroke="#4b5346" transform="rotate(-5 46 48)"/><path d="M41 42h10M41 48h10M41 54h7" stroke="#73806d" stroke-width="2" stroke-linecap="round"/></svg>`,
    tictactoe: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="7" y="7" width="50" height="50" rx="4" fill="#121411" stroke="#ff5c35" stroke-width="2"/><path d="M22 8v48M42 8v48M8 22h48M8 42h48" stroke="#ff5c35" stroke-width="1.5" opacity=".62"/><path d="M13 13l12 12m0-12L13 25" stroke="#f4efe3" stroke-width="3" stroke-linecap="square"/><circle cx="32" cy="32" r="6.5" fill="none" stroke="#c8f04a" stroke-width="3"/><path d="M39 39l12 12m0-12L39 51" stroke="#f4efe3" stroke-width="3" stroke-linecap="square"/></svg>`,
    mancala: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="4" y="14" width="56" height="38" rx="16" fill="#4a2f22" stroke="#8b654f" stroke-width="2"/><g fill="#171a15"><ellipse cx="13" cy="33" rx="5" ry="9"/><ellipse cx="51" cy="33" rx="5" ry="9"/></g><g fill="#b88a63"><circle cx="23" cy="25" r="3.2"/><circle cx="29" cy="25" r="3.2"/><circle cx="35" cy="25" r="3.2"/><circle cx="41" cy="25" r="3.2"/><circle cx="23" cy="41" r="3.2"/><circle cx="29" cy="41" r="3.2"/><circle cx="35" cy="41" r="3.2"/><circle cx="41" cy="41" r="3.2"/></g><g fill="#ff5c35"><circle cx="14" cy="31" r="2.4"/><circle cx="14" cy="37" r="2.4"/><circle cx="50" cy="31" r="2.4"/><circle cx="50" cy="37" r="2.4"/></g></svg>`,
    gofish: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g transform="rotate(-16 24 34)"><rect x="8" y="16" width="25" height="37" rx="5" fill="#f4efe3" stroke="#cfc3ab"/><text x="20.5" y="39" text-anchor="middle" font-family="Georgia,serif" font-size="18" font-weight="700" fill="#171a21">A</text><text x="11" y="26" font-family="Arial,sans-serif" font-size="9" fill="#171a21">♠</text></g><g transform="rotate(13 43 33)"><rect x="31" y="13" width="25" height="38" rx="5" fill="#f4efe3" stroke="#cfc3ab"/><text x="43.5" y="37" text-anchor="middle" font-family="Georgia,serif" font-size="18" font-weight="700" fill="#c74444">K</text><text x="34" y="23" font-family="Arial,sans-serif" font-size="9" fill="#c74444">♥</text></g><path d="M9 42c9-14 22-13 29-4 2-5 8-7 12-3 5-2 9 2 9 7 0 7-7 12-14 10-5 5-14 3-17-2-5 1-9-1-10-4-4-1-6-2-9-4z" fill="#2f8f9f" opacity=".9"/><circle cx="44" cy="40" r="1.8" fill="#f4efe3"/><path d="M9 42c5 0 8-2 11-5" fill="none" stroke="#8edce4" stroke-width="2" stroke-linecap="round"/></svg>`,
    dots: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="7" y="7" width="50" height="50" rx="11" fill="#171b29"/><g fill="#dce7f3"><circle cx="16" cy="16" r="2.6"/><circle cx="32" cy="16" r="2.6"/><circle cx="48" cy="16" r="2.6"/><circle cx="16" cy="32" r="2.6"/><circle cx="32" cy="32" r="2.6"/><circle cx="48" cy="32" r="2.6"/><circle cx="16" cy="48" r="2.6"/><circle cx="32" cy="48" r="2.6"/><circle cx="48" cy="48" r="2.6"/></g><g stroke="#ff5c35" stroke-width="2.4" stroke-linecap="round"><path d="M16 16h16M32 16h16M16 16v16M48 16v16M16 32v16M16 48h16M32 32v16M32 48h16"/></g><rect x="34" y="34" width="11" height="11" rx="2" fill="#ff5c35" opacity=".35"/><path d="M48 48h-6v-6" stroke="#ffb39e" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
    nim: `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="6" y="8" width="52" height="48" rx="10" fill="#171b18" stroke="#3c4439"/><g fill="#8b957f"><circle cx="18" cy="44" r="5"/><circle cx="18" cy="33" r="5"/><circle cx="18" cy="22" r="5"/><circle cx="32" cy="44" r="5"/><circle cx="32" cy="33" r="5"/><circle cx="32" cy="22" r="5"/><circle cx="32" cy="11" r="5"/><circle cx="46" cy="44" r="5"/><circle cx="46" cy="33" r="5"/><circle cx="46" cy="22" r="5"/><circle cx="46" cy="11" r="5"/></g><g fill="#ff5c35"><circle cx="18" cy="22" r="5"/><circle cx="46" cy="44" r="5"/></g><path d="M14 54h36" stroke="#ff5c35" stroke-width="2" stroke-linecap="round"/></svg>`
  };

  function gameArt(key, extra = '') {
    return `<span class="qq-art qq-art-${esc(key)}${extra ? ` ${extra}` : ''}" aria-hidden="true">${GAME_ART[key] || GAME_ART.connect4}</span>`;
  }
  function playerCountLabel(key) {
    const meta = GAME_META[key];
    return meta.maxPlayers > 2 ? `2–${meta.maxPlayers} players` : '2 players';
  }
  function gameArtName(key) { return GAME_META[key]?.label || 'QuickQ'; }
  const RATING_KEY = 'quickq.rating.v1';
  const NAME_KEY = 'quickq.name.v1';
  const STATS_KEY = 'quickq.stats.v1';
  const ROOM_PREFIX = 'quickq-v1-';
  const BOT_RATING = 500;
  const K_FACTOR = 24;

  function toast(title, message, type = 'info') {
    if (window.FlashUI?.toast) return window.FlashUI.toast(title, message, type);
    const stack = document.getElementById('toastStack');
    if (!stack) return;
    const node = document.createElement('article');
    node.className = 'toast show';
    node.innerHTML = `<div><strong>${esc(title)}</strong><p>${esc(message)}</p></div>`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function refreshIcons(root = document.getElementById('quickqView')) {
    if (!root) return;
    requestAnimationFrame(() => {
      try { window.lucide?.createIcons?.({ root, attrs: { 'stroke-width': 1.5, width: 18, height: 18 } }); } catch {}
    });
  }

  function loadStats() {
    try {
      const value = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
      return { wins: Number(value.wins) || 0, losses: Number(value.losses) || 0, draws: Number(value.draws) || 0 };
    } catch { return { wins: 0, losses: 0, draws: 0 }; }
  }

  function loadRating() {
    try { return normaliseRating(JSON.parse(localStorage.getItem(RATING_KEY) || '500')); }
    catch { return 500; }
  }

  function saveRating() { try { localStorage.setItem(RATING_KEY, JSON.stringify(S.rating)); } catch {} }
  function saveStats() { try { localStorage.setItem(STATS_KEY, JSON.stringify(S.stats)); } catch {} }

  const initialAuthName = (() => {
    try {
      const user = window.__flashFirebase?.auth?.currentUser;
      return cleanName(user?.displayName || user?.email?.split('@')[0] || '');
    } catch { return ''; }
  })();
  const S = {
    view: 'lobby',
    game: GAME_KEYS.includes(localStorage.getItem('quickq.game')) ? localStorage.getItem('quickq.game') : 'connect4',
    name: cleanName(localStorage.getItem(NAME_KEY) || initialAuthName) || 'Guest',
    rating: loadRating(),
    stats: loadStats(),
    ranked: localStorage.getItem('quickq.ranked') !== '0',
    tableSize: 2,
    busy: '',
    error: '',
    joinCode: '',
    mode: null,
    room: null,
    peer: null,
    conn: null,
    match: null,
    pendingWild: null,
    chessFrom: null,
    checkersFrom: null,
    dominoPick: null,
    fishRank: null,
    fishTarget: null,
    chat: [],
    chatUnread: 0,
    spectators: [],
    isSpectator: false,
    voice: { stream: null, enabled: false, listening: false, calls: [], audios: [] },
    watchers: 0,
    info: '',
    botTimer: 0,
    session: 0,
    leaving: false
  };

  function tableSizeFor(game, requested = S.tableSize) {
    const max = GAME_META[game]?.maxPlayers || 2;
    return clamp(Number(requested) || 2, 2, max);
  }

  /* ======================= Connect 4 ======================= */

  function c4Drop(board, col, actor) {
    if (!Number.isInteger(col) || col < 0 || col > 6) return null;
    for (let row = 5; row >= 0; row -= 1) {
      const index = row * 7 + col;
      if (!board[index]) {
        const next = board.slice();
        next[index] = actor;
        return { board: next, index };
      }
    }
    return null;
  }

  function c4Line(board, index, actor) {
    const row = Math.floor(index / 7), col = index % 7;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of directions) {
      const line = [index];
      for (const sign of [-1, 1]) {
        let r = row + dr * sign, c = col + dc * sign;
        while (r >= 0 && r < 6 && c >= 0 && c < 7) {
          const cell = r * 7 + c;
          if (board[cell] !== actor) break;
          line.push(cell);
          r += dr * sign;
          c += dc * sign;
        }
      }
      if (line.length >= 4) return line;
    }
    return [];
  }

  function c4Initial() {
    return { game: 'connect4', board: Array(42).fill(0), turn: 1, winner: 0, draw: false, winLine: [] };
  }

  function c4Apply(state, action, actor) {
    if (!state || state.winner || state.draw) return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    if (action?.type !== 'drop') return fail('Choose a column.');
    const col = Number(action.col);
    if (!Number.isInteger(col) || col < 0 || col > 6) return fail('Choose a valid column.');
    const dropped = c4Drop(state.board, col, actor);
    if (!dropped) return fail('That column is full.');
    const next = { ...state, board: dropped.board, winLine: c4Line(dropped.board, dropped.index, actor) };
    if (next.winLine.length >= 4) {
      next.winner = actor;
      next.turn = 0;
    } else if (next.board.every(Boolean)) {
      next.draw = true;
      next.turn = 0;
    } else {
      next.turn = actor === 1 ? 2 : 1;
    }
    return { state: next };
  }

  function c4WouldWin(board, col, actor) {
    const dropped = c4Drop(board, col, actor);
    return !!dropped && c4Line(dropped.board, dropped.index, actor).length >= 4;
  }

  function c4Bot(state) {
    const open = [0, 1, 2, 3, 4, 5, 6].filter((col) => c4Drop(state.board, col, 2));
    if (!open.length) return null;
    const win = open.find((col) => c4WouldWin(state.board, col, 2));
    if (win != null) return { type: 'drop', col: win };
    const block = open.find((col) => c4WouldWin(state.board, col, 1));
    if (block != null) return { type: 'drop', col: block };
    const preferred = [3, 2, 4, 1, 5, 0, 6].filter((col) => open.includes(col));
    return { type: 'drop', col: preferred[Math.floor(Math.random() * preferred.length)] };
  }

  function c4Outcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return state.draw ? 'draw' : null;
  }

  /* ======================= Battleship ======================= */

  const BS_SIZES = [5, 4, 3, 3, 2];

  function randInt(max) { return Math.floor(Math.random() * max); }

  function bsFleet() {
    const occupied = new Set();
    const cells = [];
    for (const size of BS_SIZES) {
      let placed = false;
      for (let attempt = 0; attempt < 500 && !placed; attempt += 1) {
        const horizontal = Math.random() < 0.5;
        const row = randInt(horizontal ? 8 : 8 - size);
        const col = randInt(horizontal ? 8 - size : 8);
        const next = [];
        let ok = true;
        for (let i = 0; i < size; i += 1) {
          const r = row + (horizontal ? 0 : i);
          const c = col + (horizontal ? i : 0);
          const index = r * 8 + c;
          if (occupied.has(index)) { ok = false; break; }
          next.push(index);
        }
        if (!ok) continue;
        next.forEach((index) => occupied.add(index));
        cells.push(...next);
        placed = true;
      }
      if (!placed) {
        // Extremely unlikely fallback: scan for the first fit.
        for (let row = 0; row < 8 && !placed; row += 1) {
          for (let col = 0; col < 8 && !placed; col += 1) {
            for (const horizontal of [true, false]) {
              const next = [];
              let ok = true;
              for (let i = 0; i < size; i += 1) {
                const r = row + (horizontal ? 0 : i);
                const c = col + (horizontal ? i : 0);
                if (r > 7 || c > 7 || occupied.has(r * 8 + c)) { ok = false; break; }
                next.push(r * 8 + c);
              }
              if (!ok) continue;
              next.forEach((index) => occupied.add(index));
              cells.push(...next);
              placed = true;
              break;
            }
          }
        }
      }
    }
    return cells;
  }

  function bsInitial({ bot = false } = {}) {
    return {
      game: 'battleship',
      phase: 'placing',
      fleets: { 1: bsFleet(), 2: bsFleet() },
      shots: { 1: [], 2: [] },
      ready: { 1: false, 2: !!bot },
      turn: 1,
      winner: 0
    };
  }

  function bsApply(state, action, actor) {
    if (!state || state.winner) return fail('This match is already finished.');
    const other = actor === 1 ? 2 : 1;
    if (state.phase === 'placing') {
      if (state.ready[actor]) return fail('Your fleet is already ready.');
      if (action?.type === 'redeploy') {
        return { state: { ...state, fleets: { ...state.fleets, [actor]: bsFleet() } } };
      }
      if (action?.type !== 'ready') return fail('Ready your fleet first.');
      const next = { ...state, ready: { ...state.ready, [actor]: true } };
      if (next.ready[1] && next.ready[2]) { next.phase = 'battle'; next.turn = 1; }
      return { state: next };
    }
    if (state.turn !== actor) return fail('It is not your turn.');
    if (action?.type !== 'shot') return fail('Choose a square to fire at.');
    const cell = Number(action.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell > 63) return fail('Choose a valid square.');
    if (state.shots[actor].includes(cell)) return fail('That square has already been fired at.');
    const next = { ...state, shots: { ...state.shots, [actor]: [...state.shots[actor], cell] } };
    const fleet = next.fleets[other];
    if (fleet.every((index) => next.shots[actor].includes(index))) {
      next.winner = actor;
      next.turn = 0;
    } else {
      next.turn = other;
    }
    return { state: next };
  }

  function bsBot(state) {
    if (!state || state.phase !== 'battle' || state.turn !== 2 || state.winner) return null;
    const fired = new Set(state.shots[2]);
    const hits = state.shots[2].filter((cell) => state.fleets[1].includes(cell));
    const adjacent = [];
    for (const hit of hits) {
      const row = Math.floor(hit / 8), col = hit % 8;
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8) {
          const cell = r * 8 + c;
          if (!fired.has(cell)) adjacent.push(cell);
        }
      }
    }
    const pool = adjacent.length ? adjacent : [...Array(64).keys()].filter((cell) => !fired.has(cell));
    if (!pool.length) return null;
    return { type: 'shot', cell: pool[randInt(pool.length)] };
  }

  function bsOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return null;
  }

  /* ======================= Uno ======================= */

  const UNO_COLORS = ['r', 'y', 'g', 'b'];
  const UNO_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'draw2'];

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = randInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function unoDeck() {
    const deck = [];
    for (const color of UNO_COLORS) {
      deck.push({ c: color, v: '0' });
      for (const value of UNO_VALUES.slice(1)) {
        deck.push({ c: color, v: value }, { c: color, v: value });
      }
    }
    for (let i = 0; i < 4; i += 1) deck.push({ c: 'w', v: 'wild' }, { c: 'w', v: 'wild4' });
    return shuffle(deck);
  }

  function unoInitial({ players = 2 } = {}) {
    const count = clamp(Number(players) || 2, 2, 4);
    const deck = unoDeck();
    const hands = {};
    for (let actor = 1; actor <= count; actor += 1) hands[actor] = [];
    for (let round = 0; round < 7; round += 1) {
      for (let actor = 1; actor <= count; actor += 1) hands[actor].push(deck.pop());
    }
    let first = deck.pop();
    while (first.c === 'w' && deck.length) {
      deck.unshift(first);
      first = deck.pop();
    }
    return {
      game: 'uno',
      players: count,
      deck,
      hands,
      discard: [first],
      color: first.c === 'w' ? 'r' : first.c,
      turn: 1,
      direction: 1,
      winner: 0,
      drawn: false,
      lastAction: ''
    };
  }

  function unoNext(state, actor, step = 1) {
    const count = state.players || 2;
    const direction = state.direction || 1;
    let next = actor;
    for (let i = 0; i < step; i += 1) next = ((next - 1 + direction + count) % count) + 1;
    return next;
  }

  function unoPlayable(card, top, color) {
    return !!card && (card.c === 'w' || card.c === color || card.v === top.v);
  }

  function unoReshuffle(state) {
    if (state.discard.length <= 1) return false;
    const top = state.discard.pop();
    state.deck = shuffle(state.discard);
    state.discard = [top];
    return state.deck.length > 0;
  }

  function unoDrawTo(state, who, count) {
    const drawn = [];
    for (let i = 0; i < count; i += 1) {
      if (!state.deck.length && !unoReshuffle(state)) break;
      const card = state.deck.pop();
      if (!card) break;
      state.hands[who].push(card);
      drawn.push(card);
    }
    return drawn;
  }

  function unoApply(state, action, actor) {
    if (!state || state.winner) return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const nextActor = unoNext(state, actor);
    const top = state.discard[state.discard.length - 1];
    if (action?.type === 'play') {
      const index = Number(action.index);
      const card = state.hands[actor][index];
      if (!Number.isInteger(index) || !card) return fail('That card is not in your hand.');
      if (!unoPlayable(card, top, state.color)) return fail('That card does not match.');
      const color = card.c === 'w' ? String(action.color || '') : card.c;
      if (card.c === 'w' && !UNO_COLORS.includes(color)) return fail('Choose a colour for the wild card.');
      const hands = {};
      Object.keys(state.hands).forEach((key) => { hands[key] = state.hands[key].slice(); });
      const next = {
        ...state,
        deck: state.deck.slice(),
        discard: [...state.discard, card],
        hands,
        color,
        drawn: false,
        lastAction: ''
      };
      next.hands[actor].splice(index, 1);
      if (!next.hands[actor].length) {
        next.winner = actor;
        next.turn = 0;
        next.lastAction = 'Uno!';
        return { state: next };
      }
      if (card.v === 'draw2') {
        unoDrawTo(next, nextActor, 2);
        next.turn = unoNext(next, actor, 2);
        next.lastAction = 'draw2';
      } else if (card.v === 'wild4') {
        unoDrawTo(next, nextActor, 4);
        next.turn = unoNext(next, actor, 2);
        next.lastAction = 'wild4';
      } else if (card.v === 'skip') {
        next.turn = unoNext(next, actor, 2);
        next.lastAction = 'skip';
      } else if (card.v === 'rev') {
        next.direction = -(state.direction || 1);
        next.turn = (next.players || 2) === 2 ? actor : unoNext(next, actor);
        next.lastAction = 'reverse';
      } else {
        next.turn = nextActor;
      }
      return { state: next };
    }
    if (action?.type === 'draw') {
      if (state.drawn) return fail('You already drew a card. Play it or pass.');
      const hands = {};
      Object.keys(state.hands).forEach((key) => { hands[key] = state.hands[key].slice(); });
      const next = {
        ...state,
        deck: state.deck.slice(),
        discard: state.discard.slice(),
        hands,
        drawn: true,
        lastAction: 'drew'
      };
      const drawn = unoDrawTo(next, actor, 1);
      if (!drawn.length) {
        next.drawn = false;
        next.turn = nextActor;
      } else if (!unoPlayable(drawn[0], next.discard[next.discard.length - 1], next.color)) {
        next.drawn = false;
        next.turn = nextActor;
      }
      return { state: next };
    }
    if (action?.type === 'pass') {
      if (!state.drawn) return fail('Draw a card before passing.');
      return { state: { ...state, turn: nextActor, drawn: false, lastAction: 'passed' } };
    }
    return fail('Choose a card to play or draw.');
  }

  function unoColorForBot(hand) {
    const counts = { r: 0, y: 0, g: 0, b: 0 };
    hand.forEach((card) => { if (card.c !== 'w') counts[card.c] += 1; });
    return UNO_COLORS.slice().sort((a, b) => counts[b] - counts[a])[0] || 'r';
  }

  function unoBot(state, actor = 2) {
    if (!state || state.winner || state.turn !== actor) return null;
    const hand = state.hands[actor] || [];
    const top = state.discard[state.discard.length - 1];
    const playable = hand.map((card, index) => ({ card, index })).filter(({ card }) => unoPlayable(card, top, state.color));
    if (playable.length) {
      playable.sort((a, b) => {
        const score = (card) => card.v === 'wild4' ? 2 : card.v === 'wild' ? 1 : card.c === state.color ? 8 : 5;
        return score(a.card) - score(b.card);
      });
      const pick = playable[playable.length - 1];
      return { type: 'play', index: pick.index, color: pick.card.c === 'w' ? unoColorForBot(hand) : undefined };
    }
    return state.drawn ? { type: 'pass' } : { type: 'draw' };
  }

  function unoOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return null;
  }

  function unoLabel(card) {
    if (!card) return '';
    if (card.v === 'skip') return 'Ø';
    if (card.v === 'rev') return '↺';
    if (card.v === 'draw2') return '+2';
    if (card.v === 'wild') return 'W';
    if (card.v === 'wild4') return '+4';
    return card.v;
  }

  /* ======================= Chess ======================= */

  const CHESS_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const CHESS_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
  const CHESS_KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const CHESS_ORTH = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  const CHESS_DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function chessColor(piece) { return piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null; }
  function chessOther(color) { return color === 'w' ? 'b' : 'w'; }
  function chessInside(row, col) { return row >= 0 && row < 8 && col >= 0 && col < 8; }
  function chessIndex(row, col) { return row * 8 + col; }
  function chessSquareName(index) { return `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`; }

  function chessInitial() {
    const board = Array(64).fill(null);
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let col = 0; col < 8; col += 1) {
      board[col] = back[col];
      board[8 + col] = 'p';
      board[48 + col] = 'P';
      board[56 + col] = back[col].toUpperCase();
    }
    return {
      game: 'chess',
      board,
      turn: 'w',
      castling: { wk: true, wq: true, bk: true, bq: true },
      ep: null,
      status: 'active',
      winner: null,
      check: false,
      last: null
    };
  }

  function chessFindKing(board, color) {
    const king = color === 'w' ? 'K' : 'k';
    return board.indexOf(king);
  }

  function chessAttacked(state, target, byColor) {
    if (target < 0) return false;
    const board = state.board;
    const row = Math.floor(target / 8), col = target % 8;
    const pawn = byColor === 'w' ? 'P' : 'p';
    const pawnRow = row + (byColor === 'w' ? 1 : -1);
    if (pawnRow >= 0 && pawnRow < 8) {
      if (col > 0 && board[pawnRow * 8 + col - 1] === pawn) return true;
      if (col < 7 && board[pawnRow * 8 + col + 1] === pawn) return true;
    }
    const knight = byColor === 'w' ? 'N' : 'n';
    for (const [dr, dc] of CHESS_KNIGHT) {
      const r = row + dr, c = col + dc;
      if (chessInside(r, c) && board[chessIndex(r, c)] === knight) return true;
    }
    const king = byColor === 'w' ? 'K' : 'k';
    for (const [dr, dc] of [...CHESS_ORTH, ...CHESS_DIAG]) {
      const r = row + dr, c = col + dc;
      if (chessInside(r, c) && board[chessIndex(r, c)] === king) return true;
    }
    for (const [dr, dc] of CHESS_ORTH) {
      let r = row + dr, c = col + dc;
      while (chessInside(r, c)) {
        const piece = board[chessIndex(r, c)];
        if (piece) {
          if (chessColor(piece) === byColor && /[rq]/.test(piece.toLowerCase())) return true;
          break;
        }
        r += dr; c += dc;
      }
    }
    for (const [dr, dc] of CHESS_DIAG) {
      let r = row + dr, c = col + dc;
      while (chessInside(r, c)) {
        const piece = board[chessIndex(r, c)];
        if (piece) {
          if (chessColor(piece) === byColor && /[bq]/.test(piece.toLowerCase())) return true;
          break;
        }
        r += dr; c += dc;
      }
    }
    return false;
  }

  function chessApplyRaw(board, move, ep) {
    const piece = board[move.from];
    board[move.from] = null;
    if (move.ep) {
      const row = Math.floor(move.from / 8);
      board[row * 8 + (move.to % 8)] = null;
    }
    if (move.castle) {
      const row = piece === 'K' ? 7 : 0;
      const rookFrom = move.castle === 'k' ? row * 8 + 7 : row * 8;
      const rookTo = move.castle === 'k' ? row * 8 + 5 : row * 8 + 3;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = null;
    }
    board[move.to] = move.promo || piece;
  }

  function chessMoves(state, from, legal = true) {
    const piece = state.board[from];
    if (!piece) return [];
    const color = chessColor(piece);
    const opponent = chessOther(color);
    const board = state.board;
    const row = Math.floor(from / 8), col = from % 8;
    const moves = [];
    const add = (to, extra = {}) => {
      const target = board[to];
      if (target && chessColor(target) === color) return;
      moves.push({ from, to, piece, capture: target || null, ...extra });
    };

    if (piece.toLowerCase() === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promotionRow = color === 'w' ? 0 : 7;
      const one = chessIndex(row + dir, col);
      if (chessInside(row + dir, col) && !board[one]) {
        add(one, { promo: row + dir === promotionRow ? (color === 'w' ? 'Q' : 'q') : null });
        const two = chessIndex(row + dir * 2, col);
        if (row === startRow && !board[two]) add(two);
      }
      for (const dc of [-1, 1]) {
        const nr = row + dir, nc = col + dc;
        if (!chessInside(nr, nc)) continue;
        const to = chessIndex(nr, nc);
        if (board[to] && chessColor(board[to]) === opponent) {
          add(to, { promo: nr === promotionRow ? (color === 'w' ? 'Q' : 'q') : null });
        } else if (state.ep === to) {
          add(to, { ep: true });
        }
      }
    } else if (piece.toLowerCase() === 'n') {
      for (const [dr, dc] of CHESS_KNIGHT) {
        const r = row + dr, c = col + dc;
        if (chessInside(r, c)) add(chessIndex(r, c));
      }
    } else if (piece.toLowerCase() === 'b' || piece.toLowerCase() === 'r' || piece.toLowerCase() === 'q') {
      const dirs = piece.toLowerCase() === 'b' ? CHESS_DIAG : piece.toLowerCase() === 'r' ? CHESS_ORTH : [...CHESS_ORTH, ...CHESS_DIAG];
      for (const [dr, dc] of dirs) {
        let r = row + dr, c = col + dc;
        while (chessInside(r, c)) {
          const to = chessIndex(r, c);
          const target = board[to];
          if (!target) add(to);
          else {
            if (chessColor(target) === opponent) add(to);
            break;
          }
          r += dr; c += dc;
        }
      }
    } else if (piece.toLowerCase() === 'k') {
      for (const [dr, dc] of [...CHESS_ORTH, ...CHESS_DIAG]) {
        const r = row + dr, c = col + dc;
        if (chessInside(r, c)) add(chessIndex(r, c));
      }
      const home = color === 'w' ? 60 : 4;
      const rights = state.castling || {};
      if (from === home && !chessAttacked(state, from, opponent)) {
        const rook = color === 'w' ? 'R' : 'r';
        const kingSideRook = home + 3;
        const queenSideRook = home - 4;
        if (rights[color + 'k'] && board[kingSideRook] === rook && !board[home + 1] && !board[home + 2] && !chessAttacked(state, home + 1, opponent) && !chessAttacked(state, home + 2, opponent)) {
          moves.push({ from, to: home + 2, piece, capture: null, castle: 'k' });
        }
        if (rights[color + 'q'] && board[queenSideRook] === rook && !board[home - 1] && !board[home - 2] && !board[home - 3] && !chessAttacked(state, home - 1, opponent) && !chessAttacked(state, home - 2, opponent)) {
          moves.push({ from, to: home - 2, piece, capture: null, castle: 'q' });
        }
      }
    }

    if (!legal) return moves;
    return moves.filter((move) => {
      const nextBoard = state.board.slice();
      chessApplyRaw(nextBoard, move, state.ep);
      const king = chessFindKing(nextBoard, color);
      return king >= 0 && !chessAttacked({ board: nextBoard, ep: null }, king, opponent);
    });
  }

  function chessAllMoves(state) {
    const color = state.turn;
    const moves = [];
    state.board.forEach((piece, index) => {
      if (piece && chessColor(piece) === color) moves.push(...chessMoves(state, index, true));
    });
    return moves;
  }

  function chessInsufficient(board) {
    const pieces = board.filter(Boolean);
    if (pieces.some((piece) => /[prq]/i.test(piece))) return false;
    if (pieces.length <= 2) return true;
    if (pieces.length === 3 && pieces.some((piece) => /[bn]/i.test(piece))) return true;
    return false;
  }

  function chessTransition(state, move) {
    const color = chessColor(move.piece);
    const board = state.board.slice();
    chessApplyRaw(board, move, state.ep);
    const castling = { ...state.castling };
    if (move.piece === 'K') { castling.wk = false; castling.wq = false; }
    if (move.piece === 'k') { castling.bk = false; castling.bq = false; }
    if (move.from === 63 || move.to === 63) castling.wk = false;
    if (move.from === 56 || move.to === 56) castling.wq = false;
    if (move.from === 7 || move.to === 7) castling.bk = false;
    if (move.from === 0 || move.to === 0) castling.bq = false;
    const ep = move.piece.toLowerCase() === 'p' && Math.abs(move.to - move.from) === 16 ? (move.from + move.to) / 2 : null;
    const turn = chessOther(color);
    const next = { ...state, board, turn, castling, ep, last: { from: move.from, to: move.to, piece: move.piece }, status: 'active', winner: null, check: false };
    const king = chessFindKing(board, turn);
    next.check = king >= 0 && chessAttacked(next, king, color);
    const replies = chessAllMoves(next);
    if (!replies.length) {
      if (next.check) { next.status = 'checkmate'; next.winner = color; }
      else next.status = 'stalemate';
    } else if (chessInsufficient(board)) {
      next.status = 'draw';
    }
    return next;
  }

  function chessApply(state, action, actor) {
    if (!state || state.status !== 'active') return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const from = Number(action?.from), to = Number(action?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return fail('Choose a piece and a square.');
    if (chessColor(state.board[from]) !== actor) return fail('That piece is not yours.');
    const move = chessMoves(state, from, true).find((candidate) => candidate.to === to);
    if (!move) return fail('That move is not legal.');
    return { state: chessTransition(state, move) };
  }

  function chessEval(board, color) {
    let score = 0;
    for (let i = 0; i < 64; i += 1) {
      const piece = board[i];
      if (!piece) continue;
      const sign = chessColor(piece) === color ? 1 : -1;
      const row = Math.floor(i / 8), col = i % 8;
      const centre = 3 - (Math.abs(3.5 - row) + Math.abs(3.5 - col));
      score += sign * ((CHESS_VALUE[piece.toLowerCase()] || 0) + Math.max(0, centre) * 3);
    }
    return score;
  }

  function chessBot(state) {
    if (!state || state.status !== 'active' || state.turn !== 'b') return null;
    const moves = chessAllMoves(state);
    if (!moves.length) return null;
    let best = -Infinity;
    let choices = [];
    for (const move of moves) {
      const next = chessTransition(state, move);
      let score;
      if (next.status === 'checkmate') score = next.winner === 'b' ? 1000000 : -1000000;
      else if (next.status === 'stalemate' || next.status === 'draw') score = 0;
      else {
        score = chessEval(next.board, 'b');
        if (next.check) score += 14;
        if (move.capture) score += 8;
        if (chessAttacked(next, move.to, 'w')) score -= (CHESS_VALUE[move.piece.toLowerCase()] || 0) * 0.55;
        const replies = chessAllMoves(next);
        const hanging = replies.filter((reply) => reply.capture).reduce((max, reply) => Math.max(max, CHESS_VALUE[reply.capture.toLowerCase()] || 0), 0);
        score -= hanging * 0.62;
      }
      if (score > best + 4) { best = score; choices = [move]; }
      else if (Math.abs(score - best) <= 4) choices.push(move);
    }
    const pick = choices[randInt(choices.length)] || moves[0];
    return { type: 'move', from: pick.from, to: pick.to };
  }

  function chessOutcome(state, actor) {
    if (state.status === 'checkmate') return state.winner === actor ? 'win' : 'loss';
    if (state.status === 'stalemate' || state.status === 'draw') return 'draw';
    return null;
  }

  /* ======================= Checkers ======================= */

  const CHECKERS_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function checkersInitial() {
    const board = Array(64).fill(0);
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 8; col += 1) if ((row + col) % 2 === 1) board[row * 8 + col] = 2;
    }
    for (let row = 5; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) if ((row + col) % 2 === 1) board[row * 8 + col] = 1;
    }
    return { game: 'checkers', board, turn: 1, chain: null, winner: 0, draw: false, last: null, noCapture: 0 };
  }

  function checkersActor(piece) { return !piece ? 0 : piece <= 2 ? piece : piece - 2; }
  function checkersKing(piece) { return piece > 2; }
  function checkersOther(actor) { return actor === 1 ? 2 : 1; }

  function checkersPieceMoves(state, from) {
    const piece = state.board[from];
    const actor = checkersActor(piece);
    if (!actor) return { moves: [], captures: [] };
    const row = Math.floor(from / 8), col = from % 8;
    const directions = checkersKing(piece) ? CHECKERS_DIRS : (actor === 1 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]]);
    const moves = [], captures = [];
    for (const [dr, dc] of directions) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const to = r * 8 + c;
      if (!state.board[to]) {
        moves.push({ from, to, capture: null });
        continue;
      }
      if (checkersActor(state.board[to]) === actor) continue;
      const lr = row + dr * 2, lc = col + dc * 2;
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
      const landing = lr * 8 + lc;
      if (!state.board[landing]) captures.push({ from, to: landing, capture: to });
    }
    return { moves, captures };
  }

  function checkersLegalMoves(state, actor) {
    if (!state || state.winner || state.draw) return [];
    if (state.chain != null) {
      const piece = state.board[state.chain];
      if (checkersActor(piece) === actor) return checkersPieceMoves(state, state.chain).captures;
      return [];
    }
    let captures = [], moves = [];
    state.board.forEach((piece, from) => {
      if (checkersActor(piece) !== actor) return;
      const found = checkersPieceMoves(state, from);
      captures.push(...found.captures);
      moves.push(...found.moves);
    });
    return captures.length ? captures : moves;
  }

  function checkersApply(state, action, actor) {
    if (!state || state.winner || state.draw) return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const from = Number(action?.from), to = Number(action?.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return fail('Choose a piece and a square.');
    const move = checkersLegalMoves(state, actor).find((candidate) => candidate.from === from && candidate.to === to);
    if (!move) return fail('That move is not legal.');
    const board = state.board.slice();
    let piece = board[from];
    board[from] = 0;
    if (move.capture != null) board[move.capture] = 0;
    const row = Math.floor(to / 8);
    if (actor === 1 && row === 0) piece = 3;
    if (actor === 2 && row === 7) piece = 4;
    board[to] = piece;
    const next = {
      ...state,
      board,
      last: { from, to },
      noCapture: move.capture == null ? state.noCapture + 1 : 0,
      chain: null
    };
    if (move.capture != null) {
      const probe = { ...next, chain: to };
      if (checkersPieceMoves(probe, to).captures.length) {
        next.chain = to;
        next.turn = actor;
        return { state: next };
      }
    }
    next.turn = checkersOther(actor);
    if (next.noCapture >= 70) {
      next.draw = true;
      next.turn = 0;
      return { state: next };
    }
    if (!checkersLegalMoves(next, next.turn).length) {
      next.winner = actor;
      next.turn = 0;
    }
    return { state: next };
  }

  function checkersBot(state, actor = 2) {
    if (!state || state.winner || state.draw || state.turn !== actor) return null;
    const moves = checkersLegalMoves(state, actor);
    if (!moves.length) return null;
    const scored = moves.map((move) => {
      const piece = state.board[move.from];
      let score = move.capture != null ? 20 : 0;
      const row = Math.floor(move.to / 8);
      if (actor === 1 && row === 0) score += 16;
      if (actor === 2 && row === 7) score += 16;
      if (checkersKing(piece)) score += 3;
      if (row >= 2 && row <= 5) score += 1;
      return { move, score };
    });
    const best = Math.max(...scored.map((entry) => entry.score));
    const choices = scored.filter((entry) => entry.score === best).map((entry) => entry.move);
    return { type: 'move', ...choices[randInt(choices.length)] };
  }

  function checkersOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return state.draw ? 'draw' : null;
  }

  /* ======================= Reversi ======================= */

  const REVERSI_DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

  function reversiInitial() {
    const board = Array(64).fill(0);
    board[27] = 2; board[28] = 1; board[35] = 1; board[36] = 2;
    return { game: 'reversi', board, turn: 1, winner: 0, draw: false, last: null, passed: false, passName: '' };
  }

  function reversiFlips(state, index, actor) {
    if (!Number.isInteger(index) || index < 0 || index > 63 || state.board[index]) return [];
    const opponent = actor === 1 ? 2 : 1;
    const row = Math.floor(index / 8), col = index % 8;
    const flips = [];
    for (const [dr, dc] of REVERSI_DIRS) {
      let r = row + dr, c = col + dc;
      const line = [];
      while (r >= 0 && r < 8 && c >= 0 && c < 8 && state.board[r * 8 + c] === opponent) {
        line.push(r * 8 + c);
        r += dr; c += dc;
      }
      if (!line.length || r < 0 || r > 7 || c < 0 || c > 7 || state.board[r * 8 + c] !== actor) continue;
      flips.push(...line);
    }
    return flips;
  }

  function reversiMoves(state, actor) {
    const moves = [];
    for (let index = 0; index < 64; index += 1) {
      if (state.board[index]) continue;
      const flips = reversiFlips(state, index, actor);
      if (flips.length) moves.push({ index, flips });
    }
    return moves;
  }

  function reversiScores(board) {
    let one = 0, two = 0;
    board.forEach((cell) => { if (cell === 1) one += 1; else if (cell === 2) two += 1; });
    return { one, two };
  }

  function reversiApply(state, action, actor) {
    if (!state || state.winner || state.draw) return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const index = Number(action?.index);
    const flips = reversiFlips(state, index, actor);
    if (!flips.length) return fail('That square does not flip any discs.');
    const board = state.board.slice();
    board[index] = actor;
    flips.forEach((cell) => { board[cell] = actor; });
    const next = { ...state, board, last: { index, flips }, passed: false, passName: '' };
    const other = actor === 1 ? 2 : 1;
    const otherMoves = reversiMoves(next, other);
    if (otherMoves.length) {
      next.turn = other;
      return { state: next };
    }
    const ownMoves = reversiMoves(next, actor);
    if (ownMoves.length) {
      next.turn = actor;
      next.passed = true;
      next.passName = other === 1 ? 'Violet' : 'Ivory';
      return { state: next };
    }
    const scores = reversiScores(board);
    next.turn = 0;
    if (scores.one === scores.two) next.draw = true;
    else next.winner = scores.one > scores.two ? 1 : 2;
    return { state: next };
  }

  function reversiBot(state, actor = 2) {
    if (!state || state.winner || state.draw || state.turn !== actor) return null;
    const moves = reversiMoves(state, actor);
    if (!moves.length) return null;
    const corners = new Set([0, 7, 56, 63]);
    const risky = new Set([1, 6, 8, 9, 14, 15, 48, 49, 54, 55, 57, 62]);
    const scored = moves.map((move) => {
      const board = state.board.slice();
      board[move.index] = actor;
      move.flips.forEach((cell) => { board[cell] = actor; });
      const scores = reversiScores(board);
      let score = (scores[actor === 1 ? 'one' : 'two'] - scores[actor === 1 ? 'two' : 'one']) * 2;
      if (corners.has(move.index)) score += 60;
      if (risky.has(move.index)) score -= 24;
      if (move.flips.length >= 5) score += 5;
      return { move, score };
    });
    const best = Math.max(...scored.map((entry) => entry.score));
    const choices = scored.filter((entry) => entry.score === best).map((entry) => entry.move);
    return { type: 'move', index: choices[randInt(choices.length)].index };
  }

  function reversiOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return state.draw ? 'draw' : null;
  }

  /* ======================= Dominoes ======================= */

  const DOMINO_PIPS = {
    0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]
  };

  function dominoSet() {
    const tiles = [];
    for (let a = 0; a <= 6; a += 1) for (let b = a; b <= 6; b += 1) tiles.push([a, b]);
    return shuffle(tiles);
  }

  function dominoInitial({ players = 2 } = {}) {
    const count = clamp(Number(players) || 2, 2, 4);
    const set = dominoSet();
    const hands = {};
    for (let actor = 1; actor <= count; actor += 1) hands[actor] = set.splice(0, 7);
    return {
      game: 'dominoes',
      players: count,
      hands,
      boneyard: set,
      board: [],
      ends: { left: null, right: null },
      turn: 1,
      winner: 0,
      draw: false,
      drawn: false,
      lastAction: ''
    };
  }

  function dominoOther(state, actor) { return (actor % (state.players || 2)) + 1; }
  function dominoPips(tile) { return (tile?.[0] || 0) + (tile?.[1] || 0); }
  function dominoHandPips(hand) { return hand.reduce((total, tile) => total + dominoPips(tile), 0); }

  function dominoSides(state, tile) {
    if (!state.board.length) return ['right'];
    const { left, right } = state.ends;
    const sides = [];
    if (tile[0] === left || tile[1] === left) sides.push('left');
    if (tile[0] === right || tile[1] === right) sides.push('right');
    return sides;
  }

  function dominoLegalMoves(state, actor) {
    return (state.hands[actor] || []).map((tile, index) => {
      const sides = dominoSides(state, tile);
      return sides.length ? { index, sides } : null;
    }).filter(Boolean);
  }

  function dominoFinish(state) {
    const seats = Object.keys(state.hands).map(Number);
    const scores = seats.map((actor) => ({ actor, pips: dominoHandPips(state.hands[actor]) }));
    const low = Math.min(...scores.map((entry) => entry.pips));
    const winners = scores.filter((entry) => entry.pips === low);
    state.turn = 0;
    state.lastAction = 'blocked';
    if (winners.length === 1) state.winner = winners[0].actor;
    else state.draw = true;
    return state;
  }

  function dominoCheckBlocked(state) {
    if (state.winner || state.draw || state.boneyard.length) return state;
    const seats = Object.keys(state.hands).map(Number);
    const canPlay = seats.some((actor) => dominoLegalMoves(state, actor).length);
    if (!canPlay) dominoFinish(state);
    return state;
  }

  function dominoApply(state, action, actor) {
    if (!state || state.winner || state.draw) return fail('This match is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const hands = {};
    Object.keys(state.hands).forEach((key) => { hands[key] = state.hands[key].map((tile) => tile.slice()); });
    const next = { ...state, hands, board: state.board.map((tile) => tile.slice()), ends: { ...state.ends } };
    if (action?.type === 'draw') {
      if (!state.boneyard.length) return fail('The boneyard is empty.');
      if (dominoLegalMoves(state, actor).length) return fail('Play one of your tiles first.');
      const tile = next.boneyard.pop();
      if (!tile) return fail('There are no tiles left to draw.');
      next.hands[actor].push(tile);
      next.lastAction = 'drew';
      next.drawn = true;
      if (!dominoSides(next, tile).length) {
        next.drawn = false;
        next.turn = dominoOther(next, actor);
      }
      return { state: dominoCheckBlocked(next) };
    }
    if (action?.type === 'pass') {
      if (next.boneyard.length) return fail('Draw from the boneyard first.');
      if (dominoLegalMoves(next, actor).length) return fail('You still have a playable tile.');
      next.lastAction = 'passed';
      next.turn = dominoOther(next, actor);
      return { state: dominoCheckBlocked(next) };
    }
    if (action?.type !== 'play') return fail('Choose a tile to play.');
    const index = Number(action.index);
    const tile = next.hands[actor]?.[index];
    if (!Number.isInteger(index) || !tile) return fail('That tile is not in your hand.');
    const sides = dominoSides(next, tile);
    if (!sides.length) return fail('That tile does not match either end.');
    let side = next.board.length ? String(action.side || '') : 'right';
    if (!sides.includes(side)) side = sides[0];
    if (next.board.length && side === 'left' && !sides.includes('left')) return fail('That tile does not fit the left end.');
    if (next.board.length && side === 'right' && !sides.includes('right')) return fail('That tile does not fit the right end.');
    let oriented;
    if (!next.board.length) {
      oriented = [tile[0], tile[1]];
      next.ends = { left: tile[0], right: tile[1] };
    } else if (side === 'left') {
      const end = next.ends.left;
      oriented = tile[1] === end ? [tile[0], tile[1]] : [tile[1], tile[0]];
      next.ends.left = oriented[0];
    } else {
      const end = next.ends.right;
      oriented = tile[0] === end ? [tile[0], tile[1]] : [tile[1], tile[0]];
      next.ends.right = oriented[1];
    }
    next.hands[actor].splice(index, 1);
    if (side === 'left' && next.board.length) next.board.unshift(oriented);
    else next.board.push(oriented);
    next.drawn = false;
    next.lastAction = 'played';
    if (!next.hands[actor].length) {
      next.winner = actor;
      next.turn = 0;
      return { state: next };
    }
    next.turn = dominoOther(next, actor);
    return { state: dominoCheckBlocked(next) };
  }

  function dominoBot(state, actor = 2) {
    if (!state || state.winner || state.draw || state.turn !== actor) return null;
    const moves = dominoLegalMoves(state, actor);
    if (moves.length) {
      const scored = moves.map((move) => {
        const tile = state.hands[actor][move.index];
        let score = dominoPips(tile);
        if (tile[0] === tile[1]) score += 4;
        if (move.sides.length === 1) score += 1;
        return { move, score };
      });
      const best = Math.max(...scored.map((entry) => entry.score));
      const choices = scored.filter((entry) => entry.score === best).map((entry) => entry.move);
      const pick = choices[randInt(choices.length)];
      return { type: 'play', index: pick.index, side: pick.sides[randInt(pick.sides.length)] };
    }
    return state.boneyard.length ? { type: 'draw' } : { type: 'pass' };
  }

  function dominoOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return state.draw ? 'draw' : null;
  }

  /* ======================= shared card table ======================= */

  const CARD_SUITS = [
    { key: 'S', glyph: '♠', label: 'Spades', red: false },
    { key: 'H', glyph: '♥', label: 'Hearts', red: true },
    { key: 'D', glyph: '♦', label: 'Diamonds', red: true },
    { key: 'C', glyph: '♣', label: 'Clubs', red: false }
  ];
  const CARD_SUIT_MAP = Object.fromEntries(CARD_SUITS.map((suit) => [suit.key, suit]));
  const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function cardDeck() {
    return CARD_RANKS.flatMap((rank) => CARD_SUITS.map((suit) => ({ r: rank, s: suit.key })));
  }

  function shuffleDeck(cards) {
    const deck = cards.slice();
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swap = randInt(index + 1);
      [deck[index], deck[swap]] = [deck[swap], deck[index]];
    }
    return deck;
  }

  function cardName(card) {
    const suit = CARD_SUIT_MAP[card?.s];
    return card ? `${card.r}${suit?.glyph || ''}` : '';
  }

  function cardValue(card) {
    if (card?.r === 'A') return 11;
    if (['K', 'Q', 'J', '10'].includes(card?.r)) return 10;
    return Number(card?.r) || 0;
  }

  function cardActors(players) {
    return Array.from({ length: players || 2 }, (_, index) => index + 1);
  }

  /* ======================= Blackjack ======================= */

  function bjValue(hand) {
    let total = 0, aces = 0;
    for (const card of hand || []) {
      if (card.r === 'A') aces += 1;
      total += cardValue(card);
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
    return total;
  }

  function bjClone(state) {
    return {
      ...state,
      deck: state.deck.slice(),
      dealer: state.dealer.slice(),
      hands: Object.fromEntries(Object.entries(state.hands).map(([key, hand]) => [key, hand.slice()])),
      done: { ...state.done },
      results: { ...state.results }
    };
  }

  function bjInitial({ players = 2 } = {}) {
    const deck = shuffleDeck(cardDeck());
    const hands = {};
    const done = {};
    cardActors(players).forEach((actor) => {
      hands[actor] = [deck.pop(), deck.pop()];
      done[actor] = false;
    });
    return { game: 'blackjack', players, deck, dealer: [deck.pop(), deck.pop()], hands, done, results: {}, turn: 1, status: 'active', dealerRevealed: false, last: null };
  }

  function bjSettle(state) {
    while (bjValue(state.dealer) < 17 && state.deck.length) state.dealer.push(state.deck.pop());
    const dealer = bjValue(state.dealer);
    state.dealerRevealed = true;
    state.status = 'done';
    state.turn = 0;
    for (const key of Object.keys(state.hands)) {
      const score = bjValue(state.hands[key]);
      state.results[Number(key)] = score > 21 ? 'loss' : dealer > 21 || score > dealer ? 'win' : score < dealer ? 'loss' : 'draw';
    }
  }

  function bjAdvance(state) {
    const actors = cardActors(state.players);
    const start = actors.indexOf(state.turn);
    for (let offset = 1; offset <= actors.length; offset += 1) {
      const actor = actors[(start + offset) % actors.length];
      if (!state.done[actor]) { state.turn = actor; return state; }
    }
    bjSettle(state);
    return state;
  }

  function bjApply(state, action, actor) {
    if (state.status === 'done') return fail('This table is already settled.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const next = bjClone(state);
    if (action?.type === 'hit') {
      if (!next.deck.length) return fail('The shoe is empty.');
      const card = next.deck.pop();
      next.hands[actor].push(card);
      next.last = { actor, type: 'hit', card };
      if (bjValue(next.hands[actor]) >= 21) { next.done[actor] = true; bjAdvance(next); }
      return { state: next };
    }
    if (action?.type === 'stand') {
      next.done[actor] = true;
      next.last = { actor, type: 'stand' };
      bjAdvance(next);
      return { state: next };
    }
    return fail('Choose hit or stand.');
  }

  function bjBot(state, actor) {
    if (state.status === 'done' || state.turn !== actor) return null;
    return bjValue(state.hands[actor]) < 17 ? { type: 'hit' } : { type: 'stand' };
  }

  function bjOutcome(state, actor) {
    return state.results[actor] || null;
  }

  /* ======================= Crazy Eights ======================= */

  function eightsClone(state) {
    return { ...state, deck: state.deck.slice(), discard: state.discard.slice(), hands: Object.fromEntries(Object.entries(state.hands).map(([key, hand]) => [key, hand.slice()])) };
  }

  function eightsTop(state) { return state.discard[state.discard.length - 1]; }

  function eightsPlayable(card, state) {
    if (!card) return false;
    if (card.r === '8') return true;
    const top = eightsTop(state);
    return card.s === state.suit || card.r === top.r;
  }

  function eightsMoves(state, actor) {
    return (state.hands[actor] || []).map((card, index) => eightsPlayable(card, state) ? index : -1).filter((index) => index >= 0);
  }

  function eightsInitial({ players = 2 } = {}) {
    const deck = shuffleDeck(cardDeck());
    const hands = {};
    cardActors(players).forEach((actor) => { hands[actor] = Array.from({ length: 5 }, () => deck.pop()); });
    const top = deck.pop();
    return { game: 'eights', players, deck, discard: [top], hands, suit: top.s, turn: 1, winner: 0, drawn: false, last: null };
  }

  function eightsAdvance(state) {
    state.turn = (state.turn % state.players) + 1;
    state.drawn = false;
    state.last = null;
  }

  function eightsApply(state, action, actor) {
    if (state.winner) return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const next = eightsClone(state);
    if (action?.type === 'play') {
      const index = Number(action.index);
      const card = next.hands[actor]?.[index];
      if (!Number.isInteger(index) || !card) return fail('That card is not in your hand.');
      if (!eightsPlayable(card, next)) return fail('That card does not match the table.');
      if (card.r === '8' && !CARD_SUIT_MAP[action.suit]) return fail('Call a suit for the eight.');
      next.hands[actor].splice(index, 1);
      next.discard.push(card);
      next.suit = card.r === '8' ? action.suit : card.s;
      next.last = { actor, type: 'play', card };
      if (!next.hands[actor].length) { next.winner = actor; next.turn = 0; next.drawn = false; return { state: next }; }
      eightsAdvance(next);
      return { state: next };
    }
    if (action?.type === 'draw') {
      if (!next.deck.length) return fail('The deck is empty. Pass.');
      const card = next.deck.pop();
      next.hands[actor].push(card);
      next.drawn = true;
      next.last = { actor, type: 'draw', card };
      if (!eightsPlayable(card, next)) eightsAdvance(next);
      return { state: next };
    }
    if (action?.type === 'pass') {
      if (eightsMoves(next, actor).length) return fail('You still have a playable card.');
      if (next.deck.length) return fail('Draw a card first.');
      eightsAdvance(next);
      return { state: next };
    }
    return fail('Play a card or draw.');
  }

  function eightsBot(state, actor) {
    if (state.winner || state.turn !== actor) return null;
    const moves = eightsMoves(state, actor);
    if (!moves.length) return state.deck.length ? { type: 'draw' } : { type: 'pass' };
    const top = eightsTop(state);
    const scored = moves.map((index) => {
      const card = state.hands[actor][index];
      return { index, card, score: (card.s === state.suit ? 2 : 0) + (card.r === top.r ? 2 : 0) + (card.r === '8' ? -1 : 0) };
    }).sort((a, b) => b.score - a.score);
    const card = scored[0].card;
    if (card.r !== '8') return { type: 'play', index: scored[0].index };
    const counts = {};
    for (const item of state.hands[actor]) if (item.r !== '8') counts[item.s] = (counts[item.s] || 0) + 1;
    const suit = CARD_SUITS.map((item) => item.key).sort((a, b) => (counts[b] || 0) - (counts[a] || 0))[0];
    return { type: 'play', index: scored[0].index, suit };
  }

  function eightsOutcome(state, actor) {
    if (!state.winner) return null;
    return state.winner === actor ? 'win' : 'loss';
  }

  /* ======================= Memory ======================= */

  function mmClone(state) {
    return { ...state, cards: state.cards.map((card) => ({ ...card })), matched: state.matched.slice(), open: state.open.slice(), preview: state.preview.slice(), seen: state.seen.slice(), scores: { ...state.scores } };
  }

  function mmInitial({ players = 2 } = {}) {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8'];
    const cards = ranks.flatMap((rank) => shuffleDeck(CARD_SUITS).slice(0, 2).map((suit) => ({ r: rank, s: suit.key })));
    const scores = Object.fromEntries(cardActors(players).map((actor) => [actor, 0]));
    return { game: 'memory', players, cards: shuffleDeck(cards), matched: Array(16).fill(false), open: [], preview: [], seen: Array(16).fill(false), scores, turn: 1, winner: 0, status: 'active', last: null };
  }

  function mmFinish(state) {
    state.status = 'done';
    state.turn = 0;
    const scores = cardActors(state.players).map((actor) => [actor, state.scores[actor] || 0]);
    const best = Math.max(...scores.map(([, score]) => score));
    const leaders = scores.filter(([, score]) => score === best).map(([actor]) => actor);
    state.winner = leaders.length === 1 ? leaders[0] : 0;
  }

  function mmApply(state, action, actor) {
    if (state.status === 'done') return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const index = Number(action?.index);
    if (!Number.isInteger(index) || index < 0 || index >= state.cards.length) return fail('Choose a card.');
    if (state.matched[index] || state.open.includes(index)) return fail('That card is already face up.');
    const next = mmClone(state);
    next.last = { actor, index };
    next.seen[index] = true;
    if (!next.open.length) {
      next.preview = [];
      next.open = [index];
      return { state: next };
    }
    const first = next.open[0];
    next.open = [];
    if (next.cards[first].r === next.cards[index].r) {
      next.matched[first] = true;
      next.matched[index] = true;
      next.scores[actor] = (next.scores[actor] || 0) + 1;
      next.preview = [first, index];
      if (next.matched.every(Boolean)) mmFinish(next);
      return { state: next };
    }
    next.preview = [first, index];
    next.turn = (actor % state.players) + 1;
    return { state: next };
  }

  function mmBot(state, actor) {
    if (state.status === 'done' || state.turn !== actor) return null;
    const unmatched = state.cards.map((_, index) => index).filter((index) => !state.matched[index] && !state.open.includes(index));
    if (!unmatched.length) return null;
    if (state.open.length) {
      const rank = state.cards[state.open[0]].r;
      const known = unmatched.find((index) => state.seen[index] && state.cards[index].r === rank);
      return { type: 'flip', index: known ?? unmatched[randInt(unmatched.length)] };
    }
    const groups = {};
    unmatched.forEach((index) => {
      if (!state.seen[index]) return;
      const rank = state.cards[index].r;
      if (!groups[rank]) groups[rank] = [];
      groups[rank].push(index);
    });
    const pair = Object.values(groups).find((group) => group.length > 1);
    return { type: 'flip', index: pair ? pair[0] : unmatched[randInt(unmatched.length)] };
  }

  function mmOutcome(state, actor) {
    if (state.status !== 'done') return null;
    if (!state.winner) return 'draw';
    return state.winner === actor ? 'win' : 'loss';
  }

  /* ======================= Tic-Tac-Toe ======================= */

  const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

  function tttLine(board) { return TTT_LINES.find((line) => board[line[0]] && board[line[0]] === board[line[1]] && board[line[1]] === board[line[2]]) || null; }

  function tttInitial() { return { game: 'tictactoe', players: 2, board: Array(9).fill(0), turn: 1, winner: 0, draw: false, winLine: [] }; }

  function tttApply(state, action, actor) {
    if (state.winner || state.draw) return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const index = Number(action?.index);
    if (!Number.isInteger(index) || index < 0 || index > 8 || state.board[index]) return fail('Choose an empty square.');
    const next = { ...state, board: state.board.slice() };
    next.board[index] = actor;
    const line = tttLine(next.board);
    if (line) { next.winner = actor; next.winLine = line; next.turn = 0; }
    else if (next.board.every(Boolean)) { next.draw = true; next.turn = 0; }
    else next.turn = actor === 1 ? 2 : 1;
    return { state: next };
  }

  function tttBot(state, actor) {
    if (state.winner || state.draw || state.turn !== actor) return null;
    const empty = state.board.map((cell, index) => cell ? -1 : index).filter((index) => index >= 0);
    const canWin = (who) => empty.find((index) => { const board = state.board.slice(); board[index] = who; return tttLine(board); });
    const win = canWin(actor);
    if (win != null) return { type: 'mark', index: win };
    const block = canWin(1);
    if (block != null) return { type: 'mark', index: block };
    if (!state.board[4]) return { type: 'mark', index: 4 };
    const corner = [0, 2, 6, 8].find((index) => !state.board[index]);
    return { type: 'mark', index: corner ?? empty[0] };
  }

  function tttOutcome(state, actor) {
    if (state.winner) return state.winner === actor ? 'win' : 'loss';
    return state.draw ? 'draw' : null;
  }

  /* ======================= Mancala ======================= */

  function mancalaPits(actor) { return actor === 1 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]; }
  function mancalaStore(actor) { return actor === 1 ? 6 : 13; }

  function mancalaSow(board, actor, pit) {
    let stones = board[pit];
    board[pit] = 0;
    let index = pit;
    const skip = actor === 1 ? 13 : 6;
    while (stones > 0) {
      index = (index + 1) % 14;
      if (index === skip) continue;
      board[index] += 1;
      stones -= 1;
    }
    return index;
  }

  function mancalaFinish(state) {
    const oneEmpty = mancalaPits(1).every((pit) => state.board[pit] === 0);
    const twoEmpty = mancalaPits(2).every((pit) => state.board[pit] === 0);
    if (!oneEmpty && !twoEmpty) return false;
    if (oneEmpty) for (const pit of mancalaPits(2)) { state.board[13] += state.board[pit]; state.board[pit] = 0; }
    if (twoEmpty) for (const pit of mancalaPits(1)) { state.board[6] += state.board[pit]; state.board[pit] = 0; }
    state.status = 'done';
    state.turn = 0;
    state.winner = state.board[6] === state.board[13] ? 0 : state.board[6] > state.board[13] ? 1 : 2;
    return true;
  }

  function mancalaInitial() {
    return { game: 'mancala', players: 2, board: [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], turn: 1, winner: 0, status: 'active', last: null };
  }

  function mancalaApply(state, action, actor) {
    if (state.status === 'done') return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const pit = Number(action?.pit);
    if (!mancalaPits(actor).includes(pit) || !state.board[pit]) return fail('Choose one of your non-empty pits.');
    const next = { ...state, board: state.board.slice() };
    const last = mancalaSow(next.board, actor, pit);
    next.last = { actor, pit, last };
    if (last !== mancalaStore(actor) && mancalaPits(actor).includes(last)) {
      const opposite = 12 - last;
      if (next.board[last] === 1 && next.board[opposite]) {
        next.board[mancalaStore(actor)] += 1 + next.board[opposite];
        next.board[last] = 0;
        next.board[opposite] = 0;
      }
    }
    if (!mancalaFinish(next)) next.turn = last === mancalaStore(actor) ? actor : actor === 1 ? 2 : 1;
    return { state: next };
  }

  function mancalaBot(state, actor) {
    if (state.status === 'done' || state.turn !== actor) return null;
    const choices = mancalaPits(actor).filter((pit) => state.board[pit] > 0).map((pit) => {
      const board = state.board.slice();
      const last = mancalaSow(board, actor, pit);
      const capture = last !== mancalaStore(actor) && last >= (actor === 1 ? 0 : 7) && last <= (actor === 1 ? 5 : 12) && board[last] === 1;
      return { pit, score: (last === mancalaStore(actor) ? 100 : 0) + (capture ? 60 + board[12 - last] : 0) };
    }).sort((a, b) => b.score - a.score || state.board[b.pit] - state.board[a.pit]);
    return choices.length ? { type: 'sow', pit: choices[0].pit } : null;
  }

  function mancalaOutcome(state, actor) {
    if (state.status !== 'done') return null;
    if (!state.winner) return 'draw';
    return state.winner === actor ? 'win' : 'loss';
  }

  /* ======================= Go Fish ======================= */

  function fishClone(state) {
    return {
      ...state,
      deck: state.deck.slice(),
      hands: Object.fromEntries(Object.entries(state.hands).map(([key, hand]) => [key, hand.slice()])),
      books: { ...state.books }
    };
  }

  function fishBookCards(state, actor) {
    let changed = false;
    for (const rank of CARD_RANKS) {
      const hand = state.hands[actor] || [];
      const cards = hand.filter((card) => card.r === rank);
      const books = Math.floor(cards.length / 4);
      if (!books) continue;
      const keep = cards.length % 4;
      let kept = 0;
      state.hands[actor] = hand.filter((card) => {
        if (card.r !== rank) return true;
        if (kept < keep) { kept += 1; return true; }
        return false;
      });
      state.books[actor] = (state.books[actor] || 0) + books;
      changed = true;
    }
    return changed;
  }

  function fishFinish(state) {
    if (state.status === 'done') return true;
    if (state.deck.length) return false;
    if (Object.values(state.hands).some((hand) => hand.length)) return false;
    state.status = 'done';
    state.turn = 0;
    const scores = cardActors(state.players).map((actor) => [actor, state.books[actor] || 0]);
    const best = Math.max(...scores.map(([, score]) => score));
    const leaders = scores.filter(([, score]) => score === best).map(([actor]) => actor);
    state.winner = leaders.length === 1 ? leaders[0] : 0;
    state.draw = leaders.length > 1;
    return true;
  }

  function fishNext(state, actor) {
    for (let step = 0; step < state.players; step += 1) {
      const next = (actor + step) % state.players + 1;
      if (state.hands[next]?.length) return next;
    }
    fishFinish(state);
    return 0;
  }

  function fishInitial({ players = 2 } = {}) {
    const count = clamp(Number(players) || 2, 2, 4);
    const deck = shuffleDeck(cardDeck());
    const hands = {};
    const books = {};
    for (let actor = 1; actor <= count; actor += 1) {
      hands[actor] = deck.splice(0, 5);
      books[actor] = 0;
    }
    return { game: 'gofish', players: count, deck, hands, books, turn: 1, status: 'active', winner: 0, draw: false, last: null };
  }

  function fishApply(state, action, actor) {
    if (!state || state.status === 'done') return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    if (action?.type !== 'ask') return fail('Ask for a rank.');
    const target = Number(action.target);
    const rank = String(action.rank || '');
    const hand = state.hands[actor] || [];
    if (!CARD_RANKS.includes(rank)) return fail('Choose a rank from your hand.');
    if (!hand.some((card) => card.r === rank)) return fail('You can only ask for a rank you hold.');
    if (!Number.isInteger(target) || target === actor || target < 1 || target > state.players || !state.hands[target]) return fail('Choose another player at the table.');
    if (!state.hands[target].length) return fail('That player has no cards to ask for.');
    const next = fishClone(state);
    const taken = next.hands[target].filter((card) => card.r === rank);
    if (taken.length) {
      next.hands[target] = next.hands[target].filter((card) => card.r !== rank);
      next.hands[actor].push(...taken);
      fishBookCards(next, actor);
      if (!next.hands[target].length && next.deck.length) next.hands[target].push(next.deck.pop());
      if (!next.hands[actor].length && next.deck.length) next.hands[actor].push(next.deck.pop());
      next.last = { actor, target, rank, got: taken.length, drew: false };
      if (!next.hands[actor].length) next.turn = fishNext(next, actor);
      fishFinish(next);
      return { state: next };
    }
    if (next.deck.length) {
      const drawn = next.deck.pop();
      next.hands[actor].push(drawn);
      fishBookCards(next, actor);
      next.last = { actor, target, rank, got: 0, drew: true, card: drawn };
    } else {
      next.last = { actor, target, rank, got: 0, drew: false };
    }
    next.turn = fishNext(next, actor);
    fishFinish(next);
    return { state: next };
  }

  function fishBot(state, actor) {
    if (!state || state.status === 'done' || state.turn !== actor) return null;
    const ranks = [...new Set((state.hands[actor] || []).map((card) => card.r))];
    if (!ranks.length) return null;
    const target = cardActors(state.players).find((candidate) => candidate !== actor && state.hands[candidate]?.length);
    if (!target) return null;
    return { type: 'ask', rank: ranks[randInt(ranks.length)], target };
  }

  function fishOutcome(state, actor) {
    if (state.status !== 'done') return null;
    if (!state.winner) return 'draw';
    return state.winner === actor ? 'win' : 'loss';
  }

  /* ======================= Dots & Boxes ======================= */

  const DOTS_SIZE = 4;

  function dotsEdges(state, type, index) { return type === 'h' ? state.h[index] : state.v[index]; }

  function dotsBoxComplete(state, row, col) {
    return !!state.h[row * DOTS_SIZE + col] && !!state.h[(row + 1) * DOTS_SIZE + col] && !!state.v[row * (DOTS_SIZE + 1) + col] && !!state.v[row * (DOTS_SIZE + 1) + col + 1];
  }

  function dotsScores(state) {
    const scores = { 1: 0, 2: 0 };
    for (let row = 0; row < DOTS_SIZE; row += 1) for (let col = 0; col < DOTS_SIZE; col += 1) {
      const owner = state.boxes[row * DOTS_SIZE + col];
      if (owner) scores[owner] += 1;
    }
    return scores;
  }

  function dotsInitial() {
    return { game: 'dots', players: 2, h: Array((DOTS_SIZE + 1) * DOTS_SIZE).fill(0), v: Array(DOTS_SIZE * (DOTS_SIZE + 1)).fill(0), boxes: Array(DOTS_SIZE * DOTS_SIZE).fill(0), turn: 1, status: 'active', winner: 0, draw: false, last: null };
  }

  function dotsFinish(state) {
    if (state.boxes.every(Boolean)) {
      state.status = 'done';
      state.turn = 0;
      const scores = dotsScores(state);
      state.winner = scores[1] === scores[2] ? 0 : scores[1] > scores[2] ? 1 : 2;
      state.draw = scores[1] === scores[2];
    }
  }

  function dotsApply(state, action, actor) {
    if (!state || state.status === 'done') return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const orientation = action?.orientation === 'v' ? 'v' : action?.orientation === 'h' ? 'h' : '';
    const index = Number(action?.index);
    if (!orientation) return fail('Choose a line.');
    const limit = orientation === 'h' ? (DOTS_SIZE + 1) * DOTS_SIZE : DOTS_SIZE * (DOTS_SIZE + 1);
    if (!Number.isInteger(index) || index < 0 || index >= limit) return fail('Choose a valid line.');
    if (dotsEdges(state, orientation, index)) return fail('That line is already drawn.');
    const next = { ...state, h: state.h.slice(), v: state.v.slice(), boxes: state.boxes.slice() };
    if (orientation === 'h') next.h[index] = actor; else next.v[index] = actor;
    const touched = [];
    if (orientation === 'h') {
      const row = Math.floor(index / DOTS_SIZE), col = index % DOTS_SIZE;
      if (row > 0) touched.push([row - 1, col]);
      if (row < DOTS_SIZE) touched.push([row, col]);
    } else {
      const row = Math.floor(index / (DOTS_SIZE + 1)), col = index % (DOTS_SIZE + 1);
      if (col > 0) touched.push([row, col - 1]);
      if (col < DOTS_SIZE) touched.push([row, col]);
    }
    let claimed = 0;
    touched.forEach(([row, col]) => {
      const at = row * DOTS_SIZE + col;
      if (!next.boxes[at] && dotsBoxComplete(next, row, col)) { next.boxes[at] = actor; claimed += 1; }
    });
    next.last = { actor, orientation, index, claimed };
    dotsFinish(next);
    if (next.status !== 'done' && !claimed) next.turn = actor === 1 ? 2 : 1;
    return { state: next };
  }

  function dotsCandidates(state) {
    const moves = [];
    state.h.forEach((line, index) => { if (!line) moves.push({ orientation: 'h', index }); });
    state.v.forEach((line, index) => { if (!line) moves.push({ orientation: 'v', index }); });
    return moves;
  }

  function dotsBot(state, actor) {
    if (!state || state.status === 'done' || state.turn !== actor) return null;
    const scored = dotsCandidates(state).map((move) => {
      const trial = { ...state, h: state.h.slice(), v: state.v.slice(), boxes: state.boxes.slice() };
      if (move.orientation === 'h') trial.h[move.index] = actor; else trial.v[move.index] = actor;
      let claims = 0;
      let gifts = 0;
      for (let row = 0; row < DOTS_SIZE; row += 1) for (let col = 0; col < DOTS_SIZE; col += 1) {
        const at = row * DOTS_SIZE + col;
        if (trial.boxes[at]) continue;
        const edges = Number(!!trial.h[row * DOTS_SIZE + col]) + Number(!!trial.h[(row + 1) * DOTS_SIZE + col]) + Number(!!trial.v[row * (DOTS_SIZE + 1) + col]) + Number(!!trial.v[row * (DOTS_SIZE + 1) + col + 1]);
        if (edges === 4) claims += 1;
        else if (edges === 3) gifts += 1;
      }
      return { move, score: claims * 100 - gifts * 15 + Math.random() };
    }).sort((a, b) => b.score - a.score);
    return scored.length ? { type: 'line', ...scored[0].move } : null;
  }

  function dotsOutcome(state, actor) {
    if (state.status !== 'done') return null;
    if (!state.winner) return 'draw';
    return state.winner === actor ? 'win' : 'loss';
  }

  /* ======================= Nim ======================= */

  function nimInitial() {
    return { game: 'nim', players: 2, piles: [3, 4, 5], turn: 1, winner: 0, status: 'active', last: null };
  }

  function nimApply(state, action, actor) {
    if (!state || state.status === 'done') return fail('This table is already finished.');
    if (state.turn !== actor) return fail('It is not your turn.');
    const pile = Number(action?.pile);
    const count = Number(action?.count);
    if (!Number.isInteger(pile) || pile < 0 || pile > 2) return fail('Choose a pile.');
    if (!Number.isInteger(count) || count < 1 || count > 3) return fail('Take one to three stones.');
    if ((state.piles[pile] || 0) < count) return fail('That pile does not have that many stones.');
    const next = { ...state, piles: state.piles.slice() };
    next.piles[pile] -= count;
    next.last = { actor, pile, count };
    if (next.piles.every((stones) => !stones)) {
      next.status = 'done';
      next.winner = actor;
      next.turn = 0;
    } else next.turn = actor === 1 ? 2 : 1;
    return { state: next };
  }

  function nimBot(state, actor) {
    if (!state || state.status === 'done' || state.turn !== actor) return null;
    const options = [];
    state.piles.forEach((stones, pile) => {
      for (let count = 1; count <= Math.min(3, stones); count += 1) options.push({ pile, count });
    });
    const winning = options.find((option) => {
      const piles = state.piles.slice();
      piles[option.pile] -= option.count;
      return piles.reduce((xor, stones) => xor ^ stones, 0) === 0;
    });
    return winning || options[randInt(options.length)] || null;
  }

  function nimOutcome(state, actor) {
    if (state.status !== 'done') return null;
    return state.winner === actor ? 'win' : 'loss';
  }

  const GAMES = {
    connect4: { init: c4Initial, apply: c4Apply, bot: c4Bot, outcome: c4Outcome, ended: (s) => !!s.winner || !!s.draw, actor: () => 1, opponent: () => 2, botActor: 2 },
    battleship: { init: bsInitial, apply: bsApply, bot: bsBot, outcome: bsOutcome, ended: (s) => !!s.winner, actor: () => 1, opponent: () => 2, botActor: 2 },
    uno: { init: unoInitial, apply: unoApply, bot: unoBot, outcome: unoOutcome, ended: (s) => !!s.winner, actor: () => 1, opponent: () => 2, botActor: 2 },
    chess: { init: chessInitial, apply: chessApply, bot: chessBot, outcome: chessOutcome, ended: (s) => s.status !== 'active', actor: () => 'w', opponent: () => 'b', botActor: 'b' },
    checkers: { init: checkersInitial, apply: checkersApply, bot: checkersBot, outcome: checkersOutcome, ended: (s) => !!s.winner || !!s.draw, actor: () => 1, opponent: () => 2, botActor: 2 },
    reversi: { init: reversiInitial, apply: reversiApply, bot: reversiBot, outcome: reversiOutcome, ended: (s) => !!s.winner || !!s.draw, actor: () => 1, opponent: () => 2, botActor: 2 },
    dominoes: { init: dominoInitial, apply: dominoApply, bot: dominoBot, outcome: dominoOutcome, ended: (s) => !!s.winner || !!s.draw, actor: () => 1, opponent: () => 2, botActor: 2 },
    blackjack: { init: bjInitial, apply: bjApply, bot: bjBot, outcome: bjOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 },
    eights: { init: eightsInitial, apply: eightsApply, bot: eightsBot, outcome: eightsOutcome, ended: (s) => !!s.winner, actor: () => 1, opponent: () => 2, botActor: 2 },
    memory: { init: mmInitial, apply: mmApply, bot: mmBot, outcome: mmOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 },
    tictactoe: { init: tttInitial, apply: tttApply, bot: tttBot, outcome: tttOutcome, ended: (s) => !!s.winner || !!s.draw, actor: () => 1, opponent: () => 2, botActor: 2 },
    mancala: { init: mancalaInitial, apply: mancalaApply, bot: mancalaBot, outcome: mancalaOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 },
    gofish: { init: fishInitial, apply: fishApply, bot: fishBot, outcome: fishOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 },
    dots: { init: dotsInitial, apply: dotsApply, bot: dotsBot, outcome: dotsOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 },
    nim: { init: nimInitial, apply: nimApply, bot: nimBot, outcome: nimOutcome, ended: (s) => s.status === 'done', actor: () => 1, opponent: () => 2, botActor: 2 }
  };

  /* ======================= session helpers ======================= */

  function actorFor(side) {
    const game = S.match?.state?.game || S.room?.game || S.game;
    if (game === 'chess') return side === 'guest' ? 'b' : 'w';
    return side === 'guest' ? 2 : 1;
  }
  function localSide() { return S.mode === 'guest' ? 'guest' : 'host'; }
  function localActor() { return actorFor(localSide()); }
  function opponentActor() { return actorFor(localSide() === 'host' ? 'guest' : 'host'); }
  function actorName(actor) {
    const hostActor = actorFor('host');
    const guestActor = actorFor('guest');
    if (actor === hostActor) return S.mode === 'bot' ? S.name : (S.room?.hostName || S.name);
    if (actor === guestActor) return S.mode === 'bot' ? 'QuickQ Bot' : (S.room?.guestName || 'Opponent');
    if (typeof actor === 'number' && actor > 2) return S.mode === 'bot' ? `QuickQ Bot ${actor - 1}` : `Bot ${actor - 1}`;
    return 'Opponent';
  }
  function actorRating(actor) {
    if (actor === actorFor('host')) return S.room?.hostRating || S.rating;
    if (actor === actorFor('guest') && S.mode !== 'bot') return S.room?.guestRating || 500;
    return BOT_RATING;
  }
  function actorsFor(state = S.match?.state) {
    if (!state) return [1, 2];
    if (state.game === 'chess') return ['w', 'b'];
    return Array.from({ length: state.players || 2 }, (_, index) => index + 1);
  }
  function isBotSeat(actor) {
    if (!S.match) return false;
    if (S.mode === 'bot') return actor !== localActor();
    if (S.mode === 'host') return typeof actor === 'number' && actor > 2;
    return false;
  }
  function isEnded(state = S.match?.state) {
    if (!state) return false;
    return GAMES[state.game].ended(state);
  }
  function currentTurn() { return S.match?.state ? S.match.state.turn : null; }
  function myTurn() {
    if (S.isSpectator || !S.match?.state || S.match.aborted || isEnded()) return false;
    if (S.match.state.game === 'battleship' && S.match.state.phase === 'placing') return true;
    return currentTurn() === localActor();
  }
  function gameLabel() { return GAME_META[S.room?.game || S.game]?.label || 'QuickQ'; }
  function roomCode() { return S.room?.code || S.joinCode || ''; }
  function initial(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }
  function resetTurnUi() {
    S.pendingWild = null;
    S.pendingEights = null;
    S.chessFrom = null;
    S.checkersFrom = null;
    S.dominoPick = null;
    S.fishRank = null;
    S.fishTarget = null;
  }

  function resetSession() {
    destroyPeer();
    S.mode = null;
    S.room = null;
    S.match = null;
    S.spectators = [];
    S.isSpectator = false;
    S.chat = [];
    S.chatUnread = 0;
    S.watchers = 0;
    S.view = 'lobby';
    S.busy = '';
    S.error = '';
    S.info = '';
    S.joinCode = '';
    resetTurnUi();
    render();
  }

  function destroyPeer() {
    clearTimeout(S.botTimer);
    S.botTimer = 0;
    stopVoice();
    S.session += 1;
    S.leaving = true;
    (S.spectators || []).forEach((spectator) => { try { spectator.conn?.close(); } catch {} });
    S.spectators = [];
    try { S.conn?.close(); } catch {}
    try { S.peer?.destroy(); } catch {}
    S.conn = null;
    S.peer = null;
    S.isSpectator = false;
    S.chat = [];
    S.chatUnread = 0;
    S.watchers = 0;
    setTimeout(() => { S.leaving = false; }, 0);
  }

  function send(payload) {
    const conn = S.conn;
    if (!conn || !conn.open) return false;
    try { conn.send(payload); return true; } catch { return false; }
  }

  function sendGuest(payload) { if (S.mode === 'host') send(payload); }

  function broadcast(payload) {
    send(payload);
    (S.spectators || []).forEach((spectator) => {
      try { if (spectator.conn?.open) spectator.conn.send(payload); } catch {}
    });
  }

  function cleanChat(value) { return String(value ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240); }

  function pushChat(message) {
    const entry = message.system
      ? { system: true, name: 'Table', text: cleanChat(message.text), at: Date.now() }
      : { name: cleanName(message.name) || 'Guest', text: cleanChat(message.text), at: Number(message.at) || Date.now() };
    if (!entry.text) return;
    S.chat.push(entry);
    if (S.chat.length > 80) S.chat.splice(0, S.chat.length - 80);
  }

  function chatLogHTML() {
    if (!S.chat.length) return `<div class="qq-chat-empty">${icon('message-circle')}<span>Table talk starts here. Say hello when your opponent joins.</span></div>`;
    return S.chat.map((message) => message.system
      ? `<div class="qq-chat-system">${esc(message.text)}</div>`
      : `<div class="qq-chat-msg${message.name === S.name ? ' mine' : ''}"><span class="qq-chat-author">${esc(message.name)}</span><p>${esc(message.text)}</p></div>`).join('');
  }

  function paintChatLog() {
    const log = document.querySelector('[data-qq-chat-log]');
    if (!log) return;
    log.innerHTML = chatLogHTML();
    log.scrollTop = log.scrollHeight;
  }

  function sendChat(value) {
    const text = cleanChat(value);
    if (!text || !roomCode() || S.mode === 'bot') return;
    if (S.mode === 'host') {
      const message = { name: S.name, text, at: Date.now() };
      pushChat(message);
      broadcast({ t: 'chat', message });
      paintChatLog();
    } else {
      send({ t: 'chat', text });
    }
  }

  function attachRemoteAudio(stream) {
    if (!stream) return;
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.srcObject = stream;
    audio.hidden = true;
    document.body.appendChild(audio);
    S.voice.audios.push(audio);
    audio.play?.().catch(() => {});
  }

  function receiveVoiceCall(call) {
    if (!call) return;
    S.voice.listening = true;
    S.voice.calls.push(call);
    try { call.answer(S.voice.stream || undefined); } catch {}
    call.on('stream', (stream) => { attachRemoteAudio(stream); render(); });
    call.on('close', () => { S.voice.calls = S.voice.calls.filter((entry) => entry !== call); });
    render();
  }

  function stopVoice() {
    const voice = S.voice;
    if (!voice) return;
    (voice.calls || []).forEach((call) => { try { call.close(); } catch {} });
    (voice.audios || []).forEach((audio) => { try { audio.pause(); audio.srcObject = null; audio.remove(); } catch {} });
    try { (voice.stream?.getTracks?.() || []).forEach((track) => track.stop()); } catch {}
    S.voice = { stream: null, enabled: false, listening: false, calls: [], audios: [] };
  }

  async function toggleVoice() {
    if (S.voice.enabled) { stopVoice(); render(); return; }
    if (!roomCode() || S.mode === 'bot') { toast('Voice is for friend rooms', 'Join a friend room to use voice chat.', 'info'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast('Microphone unavailable', 'This browser does not expose microphone capture.', 'error'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      stopVoice();
      S.voice.stream = stream;
      S.voice.enabled = true;
      const targets = S.mode === 'host'
        ? [...new Set([S.conn?.peer, ...S.spectators.map((spectator) => spectator.conn.peer)].filter(Boolean))]
        : [peerId(S.room?.code)];
      targets.forEach((id) => {
        try {
          const call = S.peer?.call(id, stream);
          if (!call) return;
          S.voice.calls.push(call);
          call.on('stream', attachRemoteAudio);
          call.on('close', () => { S.voice.calls = S.voice.calls.filter((entry) => entry !== call); });
        } catch {}
      });
      render();
    } catch (error) {
      toast('Could not start voice', error?.name === 'NotAllowedError' ? 'Microphone permission was blocked.' : 'Check your microphone and try again.', 'error');
    }
  }

  /* ======================= PeerJS ======================= */

  let peerLibPromise = null;
  function loadPeerLib() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLibPromise) return peerLibPromise;
    peerLibPromise = (async () => {
      const sources = [
        'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
        'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
      ];
      for (const src of sources) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('script load failed'));
            document.head.appendChild(script);
          });
          if (window.Peer) return window.Peer;
        } catch {}
      }
      throw new Error('PeerJS could not be loaded. Check your connection and try again.');
    })().catch((error) => { peerLibPromise = null; throw error; });
    return peerLibPromise;
  }

  function peerId(code) { return `${ROOM_PREFIX}${String(code).toLowerCase()}`; }

  function makeRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i += 1) code += alphabet[randInt(alphabet.length)];
    return code;
  }

  function peerMessage(error) {
    const type = String(error?.type || '');
    if (type === 'peer-unavailable') return 'That room code was not found. Check the code and try again.';
    if (type === 'unavailable-id') return 'That room code is already open. Try creating another room.';
    if (type === 'network' || type === 'server-error' || type === 'socket-error') return 'The PeerJS room service could not be reached. Check your connection and try again.';
    if (type === 'browser-incompatible') return 'This browser does not support the WebRTC connection PeerJS needs.';
    return error?.message || 'The peer connection failed.';
  }

  function openPeer(options, timeout = 16000) {
    return new Promise((resolve, reject) => {
      let peer;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { peer?.destroy(); } catch {}
        reject(new Error('The room service took too long to respond. Try again.'));
      }, timeout);
      try { peer = options?.id ? new window.Peer(options.id, options) : new window.Peer(options); }
      catch (error) { clearTimeout(timer); reject(error); return; }
      peer.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(peer);
      });
      peer.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { peer.destroy(); } catch {}
        reject(new Error(peerMessage(error)));
      });
    });
  }

  async function createRoom() {
    if (S.busy) return;
    destroyPeer();
    const session = ++S.session;
    S.busy = 'create';
    S.error = '';
    S.view = 'setup';
    render();
    try {
      await loadPeerLib();
      const code = makeRoomCode();
      const peer = await openPeer({ id: peerId(code), debug: 0 });
      if (session !== S.session) { try { peer.destroy(); } catch {} return; }
      S.peer = peer;
      S.mode = 'host';
      S.room = {
        code,
        game: S.game,
        players: tableSizeFor(S.game),
        ranked: !!S.ranked,
        hostName: S.name,
        hostRating: S.rating,
        guestName: '',
        guestRating: 500
      };
      S.match = null;
      S.spectators = [];
      S.chat = [];
      S.isSpectator = false;
      S.view = 'waiting';
      S.busy = '';
      peer.on('connection', (conn) => acceptConnection(conn, session));
      peer.on('call', receiveVoiceCall);
      peer.on('error', (error) => {
        if (S.leaving || session !== S.session || S.peer !== peer) return;
        if (S.view === 'waiting') { S.error = peerMessage(error); render(); }
        else toast('QuickQ connection issue', peerMessage(error), 'error');
      });
      render();
    } catch (error) {
      if (session !== S.session) return;
      destroyPeer();
      S.busy = '';
      S.mode = null;
      S.room = null;
      S.view = 'setup';
      S.error = error.message || 'Could not create the room.';
      render();
    }
  }

  function acceptConnection(conn, session) {
    if (session !== S.session || S.leaving) { try { conn.close(); } catch {} return; }
    conn.on('data', (data) => hostMessage(data, session, conn));
    conn.on('close', () => {
      if (session !== S.session || S.leaving) return;
      if (S.conn === conn) {
        S.conn = null;
        if (S.match && !isEnded()) {
          S.match.aborted = true;
          S.error = 'Your opponent left the match. No rating was changed.';
          render();
        } else if (S.view === 'waiting') {
          S.error = 'That player disconnected before the match started.';
          render();
        } else if (S.match) render();
        return;
      }
      const spectator = S.spectators.find((entry) => entry.conn === conn);
      if (spectator) {
        removeSpectator(conn);
        pushChat({ name: 'Table', text: `${spectator.name} stopped watching.`, system: true });
        broadcast({ t: 'chat', message: S.chat[S.chat.length - 1] });
        broadcast({ t: 'watchers', count: S.spectators.length });
        render();
        paintChatLog();
      }
    });
    conn.on('error', () => {
      if (session === S.session && !S.leaving && S.view === 'waiting') { S.error = 'The incoming connection failed.'; render(); }
    });
  }

  function sendWelcome(conn) {
    if (!conn?.open || !S.room) return;
    try {
      conn.send({
        t: 'welcome',
        game: S.room.game,
        players: S.room.players,
        ranked: S.room.ranked,
        code: S.room.code,
        hostName: S.name,
        hostRating: S.rating,
        chat: S.chat
      });
    } catch {}
  }

  function addSpectator(conn, name) {
    if (!S.match || !S.room) return;
    if (S.spectators.some((entry) => entry.conn === conn)) return;
    if (S.spectators.length >= 8) { try { conn.send({ t: 'full' }); conn.close(); } catch {} return; }
    const spectator = { conn, name: cleanName(name) || 'Watcher' };
    S.spectators.push(spectator);
    S.watchers = S.spectators.length;
    try { conn.send({ t: 'spectate', room: { ...S.room }, state: S.match.state, chat: S.chat, hostName: S.name }); } catch {}
    pushChat({ name: 'Table', text: `${spectator.name} is watching.`, system: true });
    broadcast({ t: 'chat', message: S.chat[S.chat.length - 1] });
    broadcast({ t: 'watchers', count: S.spectators.length });
    render();
  }

  function removeSpectator(conn) {
    S.spectators = S.spectators.filter((entry) => entry.conn !== conn);
    S.watchers = S.spectators.length;
  }

  function hostMessage(data, session, conn) {
    if (!data || typeof data !== 'object' || S.leaving || session !== S.session) return;
    const isGuest = S.conn === conn;
    const spectator = S.spectators.find((entry) => entry.conn === conn);
    if (data.t === 'hello') {
      if (!S.conn && !S.match) {
        S.conn = conn;
        S.room.guestName = cleanName(data.name) || 'Guest';
        S.room.guestRating = normaliseRating(data.rating);
        sendWelcome(conn);
        startHostMatch();
      } else if (S.match) {
        addSpectator(conn, data.name);
      } else {
        try { conn.send({ t: 'full' }); } catch {}
        try { conn.close(); } catch {}
      }
      return;
    }
    if (data.t === 'spectate') { addSpectator(conn, data.name); return; }
    if (data.t === 'chat') {
      if (!isGuest && !spectator) return;
      const text = String(data.text || '').replace(/[<>]/g, '').trim().slice(0, 240);
      if (!text) return;
      const name = isGuest ? (S.room.guestName || 'Guest') : spectator.name;
      const message = { name, text, at: Date.now() };
      pushChat(message);
      broadcast({ t: 'chat', message });
      paintChatLog();
      return;
    }
    if (isGuest && data.t === 'action') {
      if (!S.match || S.match.aborted) return;
      hostAction(data.a, opponentActor());
      return;
    }
    if (isGuest && data.t === 'leave') { try { S.conn?.close(); } catch {} }
  }

  function startHostMatch() {
    if (!S.room || S.match) return;
    S.room.players = tableSizeFor(S.room.game, S.room.players);
    const state = GAMES[S.room.game].init({ bot: false, players: S.room.players });
    S.match = {
      state,
      ranked: !!S.room.ranked,
      ratingApplied: false,
      result: null,
      aborted: false
    };
    S.view = 'game';
    S.error = '';
    resetTurnUi();
    send({ t: 'start', room: { ...S.room }, state });
      S.watchers = S.spectators.length;
      render();
    checkFinished();
    scheduleBot();
  }

  async function joinRoom() {
    if (S.busy) return;
    const input = $('#qqJoinCode');
    const code = normaliseCode(input?.value || S.joinCode);
    if (code.length !== 5) {
      S.error = 'Room codes are five characters.';
      render();
      return;
    }
    destroyPeer();
    const session = ++S.session;
    S.busy = 'join';
    S.error = '';
    S.joinCode = code;
    S.view = 'joining';
    S.mode = 'guest';
    S.room = { code, game: S.game, players: 2, ranked: false, hostName: 'Host', hostRating: 500 };
    S.match = null;
    S.spectators = [];
    S.chat = [];
    S.isSpectator = false;
    render();
    try {
      await loadPeerLib();
      const peer = await openPeer({ debug: 0 });
      if (session !== S.session) { try { peer.destroy(); } catch {} return; }
      S.peer = peer;
      peer.on('call', receiveVoiceCall);
      const conn = peer.connect(peerId(code), { reliable: true, serialization: 'json' });
      if (!conn) throw new Error('The room connection could not be opened.');
      S.conn = conn;
      let welcomeTimer = setTimeout(() => {
        if (session === S.session && S.view === 'joining' && !S.leaving) failJoin('The host did not answer. Check the room code and try again.', session);
      }, 18000);
      const clearWelcome = () => { clearTimeout(welcomeTimer); welcomeTimer = 0; };
      conn.on('open', () => {
        if (session !== S.session || S.conn !== conn || S.leaving) return;
        send({ t: 'hello', name: S.name, rating: S.rating });
        render();
      });
      conn.on('data', (data) => {
        if (session !== S.session || S.conn !== conn || !data || typeof data !== 'object' || S.leaving) return;
        if (data.t === 'welcome') {
          clearWelcome();
          S.room = {
            code,
            game: GAMES[data.game] ? data.game : 'connect4',
            players: clamp(Number(data.players) || 2, 2, 4),
            ranked: !!data.ranked,
            hostName: cleanName(data.hostName) || 'Host',
            hostRating: normaliseRating(data.hostRating),
            guestName: S.name,
            guestRating: S.rating
          };
          S.chat = Array.isArray(data.chat) ? data.chat.slice(-80) : [];
          S.game = S.room.game;
          S.tableSize = S.room.players;
          render();
        } else if (data.t === 'spectate') {
          clearWelcome();
          S.isSpectator = true;
          S.room = { ...(data.room || {}), code, guestName: S.name };
          if (!GAMES[S.room.game]) S.room.game = 'connect4';
          S.game = S.room.game;
          S.tableSize = S.room.players || 2;
          S.chat = Array.isArray(data.chat) ? data.chat.slice(-80) : [];
          S.match = data.state ? { state: data.state, ranked: !!S.room.ranked, ratingApplied: false, result: null, aborted: false } : null;
          S.view = 'game';
          S.error = '';
          resetTurnUi();
          render();
        } else if (data.t === 'start') {
          clearWelcome();
          S.room = { ...S.room, ...(data.room || {}), code };
          if (!GAMES[S.room.game]) S.room.game = 'connect4';
          S.match = {
            state: data.state,
            ranked: !!S.room.ranked,
            ratingApplied: false,
            result: null,
            aborted: false
          };
          S.view = 'game';
          S.error = '';
          resetTurnUi();
          render();
          checkFinished();
        } else if (data.t === 'state') {
          if (!S.match || !data.state) return;
          S.match.state = data.state;
          S.watchers = Number(data.watchers) || S.watchers;
          S.error = '';
          resetTurnUi();
          render();
          checkFinished();
        } else if (data.t === 'chat') {
          if (!data.message) return;
          pushChat(data.message);
          paintChatLog();
        } else if (data.t === 'watchers') {
          S.watchers = Number(data.count) || 0;
          render();
        } else if (data.t === 'notice') {
          if (data.message) { S.error = String(data.message).slice(0, 180); render(); }
        } else if (data.t === 'full') {
          failJoin('That room has no spectator seats left.');
        }
      });
      conn.on('close', () => {
        if (session !== S.session || S.conn !== conn) return;
        clearWelcome();
        if (S.leaving) return;
        S.conn = null;
        if (S.isSpectator) {
          S.error = 'The host ended the room. This replay stays on screen.';
          render();
        } else if (S.match && !isEnded()) {
          S.match.aborted = true;
          S.error = 'The host left the match. No rating was changed.';
          render();
        } else if (S.view === 'joining') {
          failJoin('The host closed the room before the match started.', session);
        } else {
          render();
        }
      });
      conn.on('error', (error) => {
        if (session !== S.session || S.conn !== conn) return;
        clearWelcome();
        if (!S.leaving) failJoin(error?.message || 'The room connection failed.', session);
      });
      peer.on('error', (error) => {
        if (session !== S.session || S.peer !== peer) return;
        clearWelcome();
        if (!S.leaving && (S.view === 'joining' || S.match)) failJoin(peerMessage(error), session);
      });
      S.busy = '';
      render();
    } catch (error) {
      if (session !== S.session) return;
      failJoin(error.message || 'Could not join that room.', session);
    }
  }

  function failJoin(message, session) {
    if (session != null && session !== S.session) return;
    if (S.leaving) return;
    destroyPeer();
    S.mode = null;
    S.room = null;
    S.match = null;
    S.view = 'setup';
    S.busy = '';
    S.error = message;
    render();
  }

  function hostAction(action, actor) {
    if (!S.match || S.match.aborted) return;
    const state = S.match.state;
    if (!state || isEnded(state)) return;
    const result = GAMES[state.game].apply(state, action, actor);
    if (result?.error) {
      if (actor === localActor()) S.error = result.error;
      else send({ t: 'notice', message: result.error });
      render();
      return;
    }
    S.match.state = result.state;
    S.match.result = null;
    S.error = '';
    resetTurnUi();
    S.watchers = S.spectators.length;
    broadcast({ t: 'state', state: result.state, watchers: S.watchers });
    render();
    checkFinished();
    scheduleBot();
  }

  function submitAction(action) {
    if (S.isSpectator || !S.match || S.match.aborted || isEnded()) return;
    if (S.mode === 'guest') {
      if (!send({ t: 'action', a: action })) {
        S.error = 'The host is not reachable right now.';
        render();
      }
      return;
    }
    hostAction(action, localActor());
  }

  function playBot() {
    destroyPeer();
    S.mode = 'bot';
    S.tableSize = tableSizeFor(S.game);
    S.room = {
      code: '',
      game: S.game,
      players: S.tableSize,
      ranked: !!S.ranked,
      hostName: S.name,
      hostRating: S.rating,
      guestName: S.tableSize > 2 ? 'QuickQ Bots' : 'QuickQ Bot',
      guestRating: BOT_RATING
    };
    const state = GAMES[S.game].init({ bot: true, players: S.tableSize });
    S.match = { state, ranked: !!S.ranked, ratingApplied: false, result: null, aborted: false };
    S.view = 'game';
    S.error = '';
    resetTurnUi();
    render();
    scheduleBot();
  }

  function scheduleBot() {
    clearTimeout(S.botTimer);
    S.botTimer = 0;
    if ((S.mode !== 'bot' && S.mode !== 'host') || !S.match || S.match.aborted || isEnded()) return;
    const state = S.match.state;
    if (state.game === 'battleship' && state.phase !== 'battle') return;
    if (!isBotSeat(state.turn)) return;
    S.botTimer = setTimeout(() => {
      S.botTimer = 0;
      if (!S.match || S.match.aborted) return;
      const current = S.match.state;
      if (!isBotSeat(current.turn)) return;
      const actor = current.turn;
      const action = GAMES[current.game].bot(current, actor);
      if (!action) return;
      hostAction(action, actor);
    }, 520);
  }

  function checkFinished() {
    if (!S.match || !S.match.state || S.match.ratingApplied || S.match.aborted) return;
    if (!isEnded()) return;
    const state = S.match.state;
    S.match.ratingApplied = true;
    const outcome = GAMES[state.game].outcome(state, localActor());
    if (!outcome) return;
    const previous = S.rating;
    let delta = 0;
    if (S.match.ranked) {
      const opponentRating = S.mode === 'bot' ? BOT_RATING : S.mode === 'guest' ? (S.room?.hostRating || 500) : (S.room?.guestRating || 500);
      const expected = 1 / (1 + (10 ** ((opponentRating - S.rating) / 400)));
      const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
      delta = Math.round(K_FACTOR * (score - expected));
      if (outcome === 'win' && delta < 1) delta = 1;
      if (outcome === 'loss' && delta > -1) delta = -1;
      if (outcome === 'draw') delta = 0;
      S.rating = Math.max(100, S.rating + delta);
      saveRating();
    }
    S.stats[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws'] += 1;
    saveStats();
    S.match.result = { outcome, delta, previous, rating: S.rating, ranked: !!S.match.ranked };
    render();
  }

  /* ======================= UI ======================= */

  function ratingMarkup() {
    const played = S.stats.wins + S.stats.losses + S.stats.draws;
    return `<div class="qq-rating"><span>Rating</span><strong>${S.rating}</strong><small>${S.stats.wins}W · ${S.stats.losses}L${S.stats.draws ? ` · ${S.stats.draws}D` : ''}${played ? '' : ' · starts at 500'}</small></div>`;
  }

  function gameTiles() {
    return GAME_KEYS.map((key) => {
      const meta = GAME_META[key];
      return `<button class="qq-game" type="button" data-qq-game="${key}" aria-label="Set up ${esc(meta.label)}">
        ${gameArt(key, 'qq-game-art')}
        <span class="qq-game-copy"><strong>${meta.label}</strong><small>${meta.tagline}</small><em>${playerCountLabel(key)}</em></span>
        <span class="qq-game-arrow" aria-hidden="true">${icon('arrow-up-right')}</span>
      </button>`;
    }).join('');
  }

  function lobbyView() {
    return `      <div class="qq-head"><div class="qq-heading"><span class="qq-kicker">${GAME_KEYS.length} tables · one room</span><h1>QuickQ</h1><p>Board classics and card-room favourites in one quiet place. Pick a table, set the stakes, then play bots or invite a friend.</p></div>${ratingMarkup()}</div>
      <section class="qq-card qq-game-library">
        <div class="qq-card-pad">
          <div class="qq-card-head"><div><h2>Choose a game</h2><p>Open a table to choose the mode, seats, and ranked setting.</p></div><span class="qq-badge casual">${icon('layout-grid')} ${GAME_KEYS.length} games</span></div>
          <div class="qq-games">${gameTiles()}</div>
          <p class="qq-fineprint qq-library-note">No room opens until you choose one. Solo tables have empty seats filled by bots.</p>
        </div>
      </section>`;
  }

  function setupView() {
    const meta = GAME_META[S.game];
    const table = tableSizeFor(S.game);
    const bots = table - 1;
    const guestBots = table - 2;
    const sizePicker = meta.maxPlayers > 2 ? `<div class="qq-size"><span class="qq-size-label">Table size</span><div class="qq-size-options" role="group" aria-label="Table size">${Array.from({ length: meta.maxPlayers - 1 }, (_, index) => index + 2).map((size) => `<button type="button" class="${size === table ? 'active' : ''}" data-qq-size="${size}" aria-pressed="${size === table}">${size}</button>`).join('')}</div><small>Empty seats are filled by bots.</small></div>` : `<div class="qq-size qq-size-fixed"><span class="qq-size-label">Table</span><strong>2 players</strong><small>One opponent.</small></div>`;
    return `<div class="qq-setup-nav"><button class="qq-back" type="button" data-qq-back>${icon('arrow-left')} <span>All games</span></button><span class="qq-badge casual">${icon('users')} ${playerCountLabel(S.game)}</span></div>
      <div class="qq-setup-hero">
        ${gameArt(S.game, 'qq-setup-art')}
        <div class="qq-setup-copy"><span class="qq-kicker">${meta.tagline}</span><h1>${meta.label}</h1><p>${meta.help}</p><div class="qq-meta-row"><span>${icon('gamepad-2')} ${playerCountLabel(S.game)}</span><span>${icon('radio')} Direct play</span><span>${icon('shield-check')} ${S.ranked ? 'Ranked' : 'Casual'}</span></div></div>
      </div>
      <div class="qq-setup-grid">
        <section class="qq-card qq-setup-panel qq-setup-settings">
          <div class="qq-setup-panel-head"><div><h2>Table settings</h2><p>These apply to both bots and friend rooms.</p></div></div>
          <div class="qq-settings-row">
            <label class="qq-name"><span>Playing as</span><input id="qqName" data-qq-name maxlength="24" autocomplete="nickname" spellcheck="false" value="${esc(S.name)}" aria-label="Your display name"></label>
            ${sizePicker}
            <label class="qq-toggle qq-toggle-compact"><span><strong>Ranked</strong><small>Update your overall rating.</small></span><input type="checkbox" data-qq-ranked ${S.ranked ? 'checked' : ''}></label>
          </div>
        </section>
        <section class="qq-card qq-setup-panel">
          <span class="qq-panel-icon">${icon('cpu')}</span>
          <h2>Play with bots</h2>
          <p class="qq-setup-note">You plus ${bots} bot${bots === 1 ? '' : 's'}${meta.maxPlayers > 2 ? ` at a ${table}-seat table` : ''}. Bots move automatically.</p>
          <button class="btn primary qq-setup-action" type="button" data-qq-bot>${icon('play')} Start ${S.ranked ? 'ranked' : 'casual'} table</button>
        </section>
        <section class="qq-card qq-setup-panel">
          <span class="qq-panel-icon">${icon('users')}</span>
          <h2>Friend room</h2>
          <p class="qq-setup-note">One friend can join directly.${guestBots > 0 ? ` ${guestBots} bot${guestBots === 1 ? '' : 's'} fill the other seat${guestBots === 1 ? '' : 's'}.` : ' The match starts when they join.'}</p>
          <button class="btn qq-setup-action" type="button" data-qq-create ${S.busy ? 'disabled' : ''}>${S.busy === 'create' ? '<span class="qq-spinner"></span> Opening room…' : `${icon('plus')} Create room`}</button>
          <div class="qq-join"><input id="qqJoinCode" data-qq-join-code maxlength="5" inputmode="text" autocomplete="off" spellcheck="false" placeholder="ROOM CODE" aria-label="Room code" value="${esc(S.joinCode)}"><button class="btn" type="button" data-qq-join ${S.busy ? 'disabled' : ''}>${S.busy === 'join' ? '<span class="qq-spinner"></span>' : 'Join'}</button></div>
          <p class="qq-fineprint qq-room-note">Room codes are temporary. Keep this tab open while you play.</p>
        </section>
      </div>
      ${S.error ? `<p class="qq-error">${esc(S.error)}</p>` : ''}`;
  }

  function waitingView() {
    const table = S.room?.players || 2;
    const bots = Math.max(0, table - 2);
    return `<div class="qq-card">
      <div class="qq-room-head">
        <div class="qq-room-id">${gameArt(S.room?.game || S.game, 'qq-room-art')}<div><strong>${esc(S.room?.code || '')}</strong><small>${esc(gameLabel())} · ${table} seats</small></div></div>
        <div class="qq-room-tools"><span class="qq-badge ${S.room?.ranked ? '' : 'casual'}">${S.room?.ranked ? 'Ranked' : 'Casual'}</span><button class="btn" type="button" data-qq-copy title="Copy room code">${icon('copy')}<span>Copy code</span></button><button class="btn" type="button" data-qq-leave>${icon('log-out')}<span>Leave</span></button></div>
      </div>
      <div class="qq-wait">
        <span class="qq-wait-icon">${icon('radio')}</span>
        <h2>Your room is open</h2>
        <p>Send this code to a friend.${bots ? ` ${bots} bot${bots === 1 ? '' : 's'} will fill the remaining seat${bots === 1 ? '' : 's'}.` : ` The ${esc(gameLabel())} match starts as soon as they join.`}</p>
        <div class="qq-wait-code">${esc(S.room?.code || '')}</div>
        <div class="qq-wait-actions"><button class="btn" type="button" data-qq-copy>${icon('copy')} Copy code</button><button class="btn primary" type="button" data-qq-leave>Back to lobby</button></div>
        ${S.error ? `<p class="qq-error">${esc(S.error)}</p>` : ''}
      </div>
    </div>`;
  }

  function joiningView() {
    return `<div class="qq-card"><div class="qq-joining"><span class="qq-spinner" aria-hidden="true"></span><h2>Joining room ${esc(S.joinCode || '')}</h2><p>${S.room?.hostName && S.room.hostName !== 'Host' ? `Connected to ${esc(S.room.hostName)}. Waiting for the match…` : 'Finding the host and opening a direct connection…'}</p>${S.error ? `<p class="qq-error">${esc(S.error)}</p>` : ''}<button class="btn" type="button" data-qq-leave>${icon('arrow-left')} Cancel</button></div></div>`;
  }

  function playerHTML(actor) {
    const name = actorName(actor);
    const active = !!S.match && S.match.state.turn === actor && !isEnded() && !S.match.aborted;
    const isLocal = !S.isSpectator && actor === localActor();
    return `<div class="qq-player${active ? ' active' : ''}"><span class="qq-avatar">${esc(initial(name))}</span><span class="qq-player-copy"><strong>${esc(name)}${isLocal ? ' (you)' : ''}</strong><small>${S.isSpectator ? 'player' : `${actorRating(actor)} rating`}</small></span></div>`;
  }

  function playersHTML(state) {
    const actors = actorsFor(state);
    if (S.isSpectator) return `<div class="qq-players qq-players-multi">${actors.map((actor) => playerHTML(actor)).join('')}</div>`;
    if (actors.length === 2) return `<div class="qq-players">${playerHTML(localActor())}<span class="qq-vs">VS</span>${playerHTML(actors.find((actor) => actor !== localActor()))}</div>`;
    const ordered = [localActor(), ...actors.filter((actor) => actor !== localActor())];
    return `<div class="qq-players qq-players-multi">${ordered.map((actor) => playerHTML(actor)).join('')}</div>`;
  }

  function roomChatMarkup() {
    if (!roomCode() || S.mode === 'bot') return '';
    const voiceLabel = S.voice.enabled ? 'Mic on' : S.voice.listening ? 'Listening' : 'Voice';
    const canSend = S.mode === 'host' || S.conn?.open;
    return `<section class="qq-room-talk" aria-label="Table chat">
      <div class="qq-talk-head"><div><span class="qq-talk-kicker">${S.isSpectator ? 'SPECTATING · TABLE TALK' : 'LIVE ROOM · TABLE TALK'}</span><h3>Chat at the table</h3></div><div class="qq-talk-actions"><button class="btn qq-voice-btn${S.voice.enabled ? ' on' : ''}" type="button" data-qq-voice aria-pressed="${S.voice.enabled}">${icon(S.voice.enabled ? 'mic' : 'mic-off')} ${voiceLabel}</button></div></div>
      ${S.isSpectator ? `<p class="qq-spectator-note">${icon('eye')} You are watching live. Play controls are read-only; chat and voice stay open.</p>` : ''}
      <div class="qq-chat-log" data-qq-chat-log aria-live="polite">${chatLogHTML()}</div>
      <form class="qq-chat-form" data-qq-chat-form><input data-qq-chat-input maxlength="240" autocomplete="off" placeholder="Message the table…" aria-label="Message the table" ${canSend ? '' : 'disabled'}><button class="btn primary" type="submit" ${canSend ? '' : 'disabled'} aria-label="Send message">${icon('send')}</button></form>
      ${S.error ? `<p class="qq-error qq-chat-error">${esc(S.error)}</p>` : ''}
    </section>`;
  }

  function statusHTML() {
    if (!S.match) return '';
    if (S.isSpectator) {
      if (S.match.aborted) return `<strong>Spectating · match abandoned</strong><span class="qq-rating-mini">The table is still open</span>`;
      if (isEnded()) return `<strong>Match complete</strong><span class="qq-rating-mini">Spectating · ${esc(gameLabel())}</span>`;
      return `<strong>Spectating live</strong><span class="qq-rating-mini">${esc(actorName(S.match.state.turn))}'s turn · ${esc(gameLabel())}</span>`;
    }
    if (S.match.aborted) return `<strong>Match abandoned</strong><span class="qq-rating-mini">No rating change</span>`;
    if (S.match.result) return `<strong>${S.match.result.outcome === 'win' ? 'You win' : S.match.result.outcome === 'loss' ? 'You lose' : 'Draw'}</strong><span class="qq-rating-mini">${S.match.result.ranked ? `${S.match.result.previous} → ${S.match.result.rating}` : 'Casual match'}</span>`;
    if (S.match.state.game === 'battleship' && S.match.state.phase === 'placing') {
      return `<strong>${S.match.state.ready[localActor()] ? 'Fleet ready' : 'Ready your fleet'}</strong><span class="qq-rating-mini">${S.match.state.ready[opponentActor()] ? 'Opponent ready' : 'Waiting for opponent'}</span>`;
    }
    if (myTurn()) return `<strong>Your turn</strong><span class="qq-rating-mini">${gameLabel()}</span>`;
    return `<strong>${esc(actorName(S.match.state.turn))}'s turn</strong><span class="qq-rating-mini">Waiting</span>`;
  }

  function resultHTML() {
    if (!S.match?.result) return '';
    const { outcome, delta, ranked, previous, rating } = S.match.result;
    const detail = ranked ? `${previous} → ${rating}${delta ? ` (${delta > 0 ? '+' : ''}${delta})` : ' · draw'}` : 'Casual match — rating unchanged.';
    return `<div class="qq-result"><div class="qq-result-copy"><strong>${outcome === 'win' ? 'You win' : outcome === 'loss' ? 'You lose' : 'Draw'}</strong><small>${detail}</small></div><div class="qq-result-actions">${S.mode === 'bot' ? `<button class="btn" type="button" data-qq-again>${icon('refresh-cw')} Play again</button>` : ''}<button class="btn" type="button" data-qq-leave>Back to lobby</button></div></div>`;
  }

  function chessView(state) {
    const local = localActor();
    const myMove = state.turn === local && state.status === 'active' && !S.match.aborted;
    const selected = S.chessFrom;
    const targets = selected != null ? chessMoves(state, selected, true) : [];
    const order = local === 'b' ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
    const cells = order.map((index) => {
      const piece = state.board[index];
      const row = Math.floor(index / 8), col = index % 8;
      const light = (row + col) % 2 === 0;
      const target = targets.find((move) => move.to === index);
      const last = state.last && (state.last.from === index || state.last.to === index);
      return `<button type="button" class="qq-chess-sq ${light ? 'light' : 'dark'}${selected === index ? ' selected' : ''}${last ? ' last' : ''}" data-qq-square="${index}" ${(!myMove || (!piece && !target)) ? 'disabled' : ''} aria-label="${piece ? `${CHESS_GLYPH[piece]} ${chessSquareName(index)}` : chessSquareName(index)}">${piece ? `<span class="piece ${chessColor(piece) === 'w' ? 'white' : 'black'}">${CHESS_GLYPH[piece]}</span>` : ''}${target ? `<span class="target${piece ? ' capture' : ''}"></span>` : ''}</button>`;
    }).join('');
    const status = state.status === 'checkmate' ? `Checkmate · ${state.winner === 'w' ? 'White' : 'Black'} wins` : state.status === 'stalemate' ? 'Stalemate' : state.status === 'draw' ? 'Draw' : state.check ? `${state.turn === 'w' ? 'White' : 'Black'} is in check` : `${state.turn === 'w' ? 'White' : 'Black'} to move`;
    return `<div class="qq-chess-board">${cells}</div><div class="qq-chess-status"><strong>${status}</strong><span>${local === 'w' ? 'You are White' : 'You are Black'}</span></div><p class="qq-board-help">${GAME_META.chess.help}</p>`;
  }

  function connect4View(state) {
    const local = localActor();
    const canAct = state.turn === local && !state.winner && !state.draw && !S.match.aborted;
    let cells = '';
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        const index = row * 7 + col;
        const owner = state.board[index];
        const full = state.board[col] !== 0;
        cells += `<button type="button" class="qq-c4-slot${owner ? ` p${owner}` : ''}${state.winLine.includes(index) ? ' win' : ''}" data-qq-c4="${col}" ${(!canAct || full || owner) ? 'disabled' : ''} aria-label="Column ${col + 1}"></button>`;
      }
    }
    return `<div class="qq-c4">${cells}</div><p class="qq-board-help">You are ${local === 1 ? 'violet' : 'gold'}. ${GAME_META.connect4.help}</p>`;
  }

  function battleshipGrid(state, who, enemy) {
    const local = localActor();
    const other = opponentActor();
    const fleet = state.fleets[enemy ? other : local] || [];
    const incoming = state.shots[enemy ? local : other] || [];
    const outgoing = state.shots[local] || [];
    let cells = '';
    for (let index = 0; index < 64; index += 1) {
      if (enemy) {
        const shot = outgoing.includes(index);
        const hit = shot && fleet.includes(index);
        const miss = shot && !hit;
        const reveal = isEnded() && fleet.includes(index);
        const canShoot = state.phase === 'battle' && state.turn === local && !state.winner && !shot && !S.match.aborted;
        cells += `<button type="button" class="qq-bs-cell${hit || reveal ? ' ship' : ''}${hit ? ' hit' : ''}${miss ? ' miss' : ''}" data-qq-bs-shot="${index}" ${canShoot ? '' : 'disabled'} aria-label="${chessSquareName(index)}${hit ? ' hit' : miss ? ' miss' : ''}"></button>`;
      } else {
        const ship = fleet.includes(index);
        const shot = incoming.includes(index);
        const hit = shot && ship;
        const miss = shot && !ship;
        cells += `<span class="qq-bs-cell${ship ? ' ship' : ''}${hit ? ' hit' : ''}${miss ? ' miss' : ''}" aria-label="${chessSquareName(index)}${ship ? ' ship' : ''}${hit ? ' hit' : ''}${miss ? ' miss' : ''}"></span>`;
      }
    }
    return `<div class="qq-bs-grid">${cells}</div>`;
  }

  function battleshipView(state) {
    const local = localActor();
    const placing = state.phase === 'placing';
    const ready = state.ready[local];
    const otherReady = state.ready[opponentActor()];
    return `<div class="qq-fleets">
      <section class="qq-fleet"><h4>Your fleet <small>${placing ? 'Deploy, then ready up' : 'Your waters'}</small></h4>${battleshipGrid(state, local, false)}</section>
      ${placing ? `<section class="qq-fleet"><h4>Opponent <small>${otherReady ? 'Ready' : 'Waiting…'}</small></h4><div class="qq-empty" style="min-height:190px"><span>${icon('radar')}</span><p>Opponent waters stay hidden until the battle begins.</p></div></section>` : `<section class="qq-fleet"><h4>${esc(actorName(opponentActor()))}'s waters <small>${state.shots[local].length} shots</small></h4>${battleshipGrid(state, local, true)}</section>`}
    </div>
    ${placing ? `<div class="qq-bs-actions">${!ready ? `<button class="btn" type="button" data-qq-bs-redeploy>${icon('refresh-cw')} Redeploy</button><button class="btn primary" type="button" data-qq-bs-ready>${icon('check')} Ready</button>` : `<button class="btn" type="button" disabled>${icon('check')} Fleet ready</button>`}</div>` : ''}
    <p class="qq-board-help">${placing ? 'Your ships are placed randomly. Redeploy if you want a different layout.' : GAME_META.battleship.help}</p>`;
  }

  function unoView(state) {
    const local = localActor();
    const hand = state.hands[local] || [];
    const top = state.discard[state.discard.length - 1];
    const canAct = state.turn === local && !state.winner && !S.match.aborted;
    const wildIndex = S.pendingWild;
    const opponents = actorsFor(state).filter((actor) => actor !== local).map((actor) => `<div class="qq-uno-opponent${state.turn === actor ? ' active' : ''}"><span class="qq-uno-mini-back">${state.hands[actor].length}</span><small>${esc(actorName(actor))}</small></div>`).join('');
    const colorPicker = wildIndex != null ? `<div class="qq-color-picker"><span>Choose a colour:</span>${UNO_COLORS.map((color) => `<button class="qq-color ${color}" type="button" data-qq-wild-color="${color}" aria-label="${color === 'r' ? 'Red' : color === 'y' ? 'Yellow' : color === 'g' ? 'Green' : 'Blue'}"></button>`).join('')}<button class="btn" type="button" data-qq-wild-cancel>Cancel</button></div>` : '';
    const cards = hand.map((card, index) => {
      const playable = canAct && wildIndex == null && unoPlayable(card, top, state.color);
      return `<button type="button" class="qq-uno-card ${card.c === 'w' ? 'wild' : card.c === 'r' ? 'red' : card.c === 'y' ? 'yellow' : card.c === 'g' ? 'green' : 'blue'}" data-qq-uno="${index}" ${playable ? '' : 'disabled'} aria-label="${esc(unoLabel(card))} ${card.c === 'w' ? 'wild' : card.c}"> <span>${esc(unoLabel(card))}</span></button>`;
    }).join('');
    return `<div class="qq-uno-opponents">${opponents}</div>
      <div class="qq-uno-table">
        <div class="qq-uno-pile"><div class="qq-uno-card ${top.c === 'w' ? 'wild' : top.c === 'r' ? 'red' : top.c === 'y' ? 'yellow' : top.c === 'g' ? 'green' : 'blue'}"><span>${esc(unoLabel(top))}</span></div><small>Discard · ${state.color.toUpperCase()}</small></div>
        <button type="button" class="qq-uno-pile" data-qq-draw ${(!canAct || state.drawn) ? 'disabled' : ''}><span class="qq-uno-card back"><span>${state.deck.length}</span></span><small>Draw</small></button>
      </div>
      ${colorPicker}
      <div class="qq-uno-hand">${cards}</div>
      <div class="qq-uno-meta">${state.drawn && canAct ? `<button class="btn" type="button" data-qq-pass>${icon('arrow-right')} Pass</button>` : `<span class="qq-fineprint">${canAct ? 'Choose a card from your hand.' : `Waiting for ${esc(actorName(state.turn))}.`}</span>`}</div>
      <p class="qq-board-help">${GAME_META.uno.help} ${state.players > 2 ? 'The table runs clockwise until someone empties their hand.' : ''}</p>`;
  }

  function checkersView(state) {
    const local = localActor();
    const myMove = state.turn === local && !state.winner && !state.draw && !S.match.aborted;
    const legal = myMove ? checkersLegalMoves(state, local) : [];
    const movable = new Set(legal.map((move) => move.from));
    const selected = S.checkersFrom;
    const targets = selected != null ? legal.filter((move) => move.from === selected) : [];
    const order = local === 2 ? [...Array(64).keys()].reverse() : [...Array(64).keys()];
    const cells = order.map((index) => {
      const piece = state.board[index];
      const row = Math.floor(index / 8), col = index % 8;
      const light = (row + col) % 2 === 0;
      const target = targets.find((move) => move.to === index);
      const last = state.last && (state.last.from === index || state.last.to === index);
      const canPick = piece && checkersActor(piece) === local && movable.has(index);
      const disabled = !myMove || (!target && !canPick);
      return `<button type="button" class="qq-checkers-sq ${light ? 'light' : 'dark'}${selected === index ? ' selected' : ''}${last ? ' last' : ''}" data-qq-checkers-square="${index}" ${disabled ? 'disabled' : ''} aria-label="${piece ? `piece on ${chessSquareName(index)}` : chessSquareName(index)}">${piece ? `<span class="qq-checkers-disc p${checkersActor(piece)}${checkersKing(piece) ? ' king' : ''}">${checkersKing(piece) ? '♛' : ''}</span>` : ''}${target ? '<span class="qq-checkers-target"></span>' : ''}</button>`;
    }).join('');
    const red = state.board.filter((piece) => checkersActor(piece) === 1).length;
    const black = state.board.filter((piece) => checkersActor(piece) === 2).length;
    return `<div class="qq-checkers-board">${cells}</div><div class="qq-board-score"><span>Red ${red}</span><span>Black ${black}</span><span>${local === 1 ? 'You are Red' : 'You are Black'}</span></div><p class="qq-board-help">${GAME_META.checkers.help}</p>`;
  }

  function reversiView(state) {
    const local = localActor();
    const myMove = state.turn === local && !state.winner && !state.draw && !S.match.aborted;
    const moves = myMove ? reversiMoves(state, local) : [];
    const playable = new Map(moves.map((move) => [move.index, move]));
    const scores = reversiScores(state.board);
    const mine = local === 1 ? scores.one : scores.two;
    const theirs = local === 1 ? scores.two : scores.one;
    const cells = Array.from({ length: 64 }, (_, index) => {
      const owner = state.board[index];
      const move = playable.get(index);
      const last = state.last && (state.last.index === index || state.last.flips?.includes(index));
      return `<button type="button" class="qq-reversi-sq${owner ? ` owned p${owner}` : ''}${move ? ' playable' : ''}${last ? ' last' : ''}" data-qq-reversi-square="${index}" ${move ? '' : 'disabled'} aria-label="${owner ? (owner === 1 ? 'Violet' : 'Ivory') + ' disc' : move ? 'Play here' : 'Empty square'}">${owner ? `<span class="qq-reversi-disc p${owner}"></span>` : ''}</button>`;
    }).join('');
    const passNote = state.passed ? `<p class="qq-board-help">${esc(state.passName)} had no legal move and passes.</p>` : '';
    return `<div class="qq-board-score"><span>You ${mine}</span><span>${esc(actorName(opponentActor()))} ${theirs}</span><span>${state.turn === 0 ? 'Final count' : `${mine + theirs} discs on the board`}</span></div>
      <div class="qq-reversi-board">${cells}</div>${passNote}<p class="qq-board-help">${GAME_META.reversi.help}</p>`;
  }

  function dominoPipsMarkup(value) {
    const active = new Set(DOMINO_PIPS[value] || []);
    return `<span class="qq-domino-half">${Array.from({ length: 9 }, (_, index) => `<i class="${active.has(index) ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  function dominoTileMarkup(tile, extra = '') {
    return `<span class="qq-domino-tile ${extra}">${dominoPipsMarkup(tile[0])}<span class="qq-domino-spine"></span>${dominoPipsMarkup(tile[1])}</span>`;
  }

  function dominoView(state) {
    const local = localActor();
    const hand = state.hands[local] || [];
    const moves = dominoLegalMoves(state, local);
    const playable = new Map(moves.map((move) => [move.index, move.sides]));
    const canAct = state.turn === local && !state.winner && !state.draw && !S.match.aborted;
    const board = state.board.length ? state.board.map((tile) => dominoTileMarkup(tile)).join('') : '<span class="qq-domino-empty">Match a tile to open the line.</span>';
    const opponents = actorsFor(state).filter((actor) => actor !== local).map((actor) => `<span class="qq-domino-opponent${state.turn === actor ? ' active' : ''}"><strong>${state.hands[actor].length}</strong><small>${esc(actorName(actor))}</small></span>`).join('');
    const pick = S.dominoPick && playable.get(S.dominoPick.index) ? S.dominoPick : null;
    const sidePicker = pick && pick.sides.length > 1 && canAct ? `<div class="qq-domino-sides"><span>Place it on</span><button class="btn" type="button" data-qq-domino-side="left">Left ${state.ends.left}</button><button class="btn" type="button" data-qq-domino-side="right">Right ${state.ends.right}</button><button class="btn" type="button" data-qq-domino-cancel>Cancel</button></div>` : '';
    const cards = hand.map((tile, index) => {
      const sides = playable.get(index);
      return `<button type="button" class="qq-domino-btn ${sides ? 'playable' : ''}" data-qq-domino="${index}" ${canAct && sides ? '' : 'disabled'} aria-label="Domino ${tile[0]} ${tile[1]}">${dominoTileMarkup(tile)}</button>`;
    }).join('');
    const noMove = canAct && !moves.length ? `<div class="qq-domino-sides">${state.boneyard.length ? `<button class="btn" type="button" data-qq-domino-draw>${icon('plus')} Draw a tile</button>` : `<button class="btn" type="button" data-qq-domino-pass>${icon('arrow-right')} Pass</button>`}</div>` : '';
    return `<div class="qq-domino-opponents">${opponents}</div>
      <div class="qq-domino-board">${board}</div>
      <div class="qq-domino-meta"><span>Open ends <strong>${state.ends.left ?? '–'}</strong> and <strong>${state.ends.right ?? '–'}</strong></span><span>Boneyard ${state.boneyard.length}</span></div>
      ${sidePicker}${noMove}
      <div class="qq-domino-hand">${cards}</div>
      <div class="qq-uno-meta">${canAct ? `<span class="qq-fineprint">${moves.length ? 'Choose a playable tile.' : 'No playable tile — draw or pass.'}</span>` : `<span class="qq-fineprint">Waiting for ${esc(actorName(state.turn))}.</span>`}</div>
      <p class="qq-board-help">${GAME_META.dominoes.help}</p>`;
  }

  function cardMarkup(card, extra = '') {
    const suit = CARD_SUIT_MAP[card.s] || CARD_SUITS[0];
    return `<span class="qq-playing-card ${suit.red ? 'red' : 'black'}${extra ? ` ${extra}` : ''}"><b>${esc(card.r)}</b><i>${suit.glyph}</i></span>`;
  }

  function cardBackMarkup(extra = '') {
    return `<span class="qq-playing-card back${extra ? ` ${extra}` : ''}"><i>✦</i></span>`;
  }

  function blackjackView(state) {
    const local = localActor();
    const reveal = state.status === 'done';
    const localResult = state.results[local];
    const dealerCards = state.dealer.map((card, index) => index === 1 && !reveal ? cardBackMarkup('hole') : cardMarkup(card)).join('');
    const seats = actorsFor(state).map((actor) => {
      const hand = state.hands[actor] || [];
      const score = bjValue(hand);
      const result = state.results[actor];
      const active = state.turn === actor && state.status !== 'done';
      const tag = state.done[actor] ? score > 21 ? 'Bust' : 'Stood' : active ? 'Playing' : 'Waiting';
      return `<section class="qq-bj-seat${actor === local ? ' local' : ''}${active ? ' active' : ''}${result ? ` ${result}` : ''}">
        <div class="qq-bj-seat-head"><strong>${esc(actorName(actor))}${actor === local ? ' (you)' : ''}</strong><span>${score} · ${tag}${result ? ` · ${result === 'draw' ? 'push' : result}` : ''}</span></div>
        <div class="qq-card-row">${hand.map((card) => cardMarkup(card)).join('')}</div>
      </section>`;
    }).join('');
    const actions = state.status === 'active' && state.turn === local
      ? `<div class="qq-bj-actions"><button class="btn" type="button" data-qq-bj-hit>${icon('plus')} Hit</button><button class="btn primary" type="button" data-qq-bj-stand>${icon('check')} Stand</button></div>`
      : state.status === 'active' ? `<p class="qq-turn-note">Waiting for ${esc(actorName(state.turn))}.</p>` : '';
    return `<div class="qq-blackjack">
      <div class="qq-bj-dealer"><div class="qq-bj-dealer-label"><span>Dealer</span><strong>${reveal ? bjValue(state.dealer) : `${bjValue([state.dealer[0]])} + ?`}</strong></div><div class="qq-card-row">${dealerCards}</div></div>
      <div class="qq-bj-seats">${seats}</div>
      ${actions}
      ${state.status === 'done' ? `<div class="qq-bj-outcome ${localResult || 'draw'}"><strong>${localResult === 'win' ? 'You beat the house' : localResult === 'loss' ? 'The house takes it' : 'Push — your stake returns'}</strong><span>Dealer ${bjValue(state.dealer)}</span></div>` : ''}
      <p class="qq-board-help">${GAME_META.blackjack.help}</p>
    </div>`;
  }

  function eightsView(state) {
    const local = localActor();
    const hand = state.hands[local] || [];
    const top = eightsTop(state);
    const canAct = myTurn() && !state.winner;
    const moves = canAct ? eightsMoves(state, local) : [];
    const pending = S.pendingEights != null;
    const opponents = actorsFor(state).filter((actor) => actor !== local).map((actor) => `<span class="qq-eights-opponent${state.turn === actor ? ' active' : ''}"><b>${(state.hands[actor] || []).length}</b><small>${esc(actorName(actor))}</small></span>`).join('');
    const cards = hand.map((card, index) => {
      const playable = moves.includes(index);
      return `<button class="qq-eights-hand-card${playable ? ' playable' : ''}" type="button" data-qq-eights="${index}" ${canAct && !pending && playable ? '' : 'disabled'} aria-label="${esc(cardName(card))}${playable ? ', playable' : ''}">${cardMarkup(card)}</button>`;
    }).join('');
    const suits = pending ? `<div class="qq-eights-suits"><span>Eight played — call the suit</span><div>${CARD_SUITS.map((suit) => `<button type="button" class="qq-suit-${suit.key.toLowerCase()}" data-qq-eights-suit="${suit.key}" aria-label="${suit.label}">${suit.glyph}</button>`).join('')}</div><button class="btn" type="button" data-qq-eights-cancel>Cancel</button></div>` : '';
    const emptyDeck = !state.deck.length;
    return `<div class="qq-eights">
      <div class="qq-eights-opponents">${opponents}</div>
      <div class="qq-eights-table">
        <div class="qq-eights-pile"><span class="qq-pile-label">Table · ${CARD_SUIT_MAP[state.suit].label}</span>${cardMarkup(top, 'large')}</div>
        <button class="qq-eights-draw" type="button" data-qq-eights-draw ${canAct && !pending ? '' : 'disabled'}><span class="qq-playing-card back"><i>✦</i></span><small>Draw · ${state.deck.length}</small></button>
      </div>
      ${suits}
      <div class="qq-eights-hand">${cards}</div>
      <div class="qq-eights-meta">${canAct && !moves.length && emptyDeck ? `<button class="btn" type="button" data-qq-eights-pass>${icon('arrow-right')} Pass</button>` : `<span>${canAct ? pending ? 'Choose a suit.' : moves.length ? 'Play a card or draw.' : 'No match — draw a card.' : `Waiting for ${esc(actorName(state.turn))}.`}</span>`}</div>
      <p class="qq-board-help">${GAME_META.eights.help}</p>
    </div>`;
  }

  function memoryView(state) {
    const local = localActor();
    const canAct = myTurn() && state.status !== 'done';
    const scores = actorsFor(state).map((actor) => `<span class="${state.turn === actor && state.status !== 'done' ? 'active' : ''}"><b>${state.scores[actor] || 0}</b><small>${esc(actorName(actor))}</small></span>`).join('');
    const cards = state.cards.map((card, index) => {
      const face = state.open.includes(index) || state.matched[index] || state.preview.includes(index);
      const matched = state.matched[index];
      const miss = !matched && state.preview.includes(index) && state.preview.length === 2;
      const disabled = !canAct || matched || state.open.includes(index);
      return `<button class="qq-memory-card${face ? ' face-up' : ''}${matched ? ' matched' : ''}${miss ? ' miss' : ''}" type="button" data-qq-memory="${index}" ${disabled ? 'disabled' : ''} aria-label="${face ? esc(cardName(card)) : 'Face-down card'}">${face ? cardMarkup(card) : '<span class="qq-memory-back">✦</span>'}</button>`;
    }).join('');
    return `<div class="qq-memory"><div class="qq-memory-scores">${scores}</div><div class="qq-memory-grid">${cards}</div><div class="qq-memory-meta">${canAct ? `<span>Find a matching rank. A pair keeps your turn.</span>` : `<span>Waiting for ${esc(actorName(state.turn))}.</span>`}</div><p class="qq-board-help">${GAME_META.memory.help}</p></div>`;
  }

  function tictactoeView(state) {
    const local = localActor();
    const canAct = myTurn() && !state.winner && !state.draw;
    const marks = state.board.map((mark, index) => {
      const disabled = !canAct || !!mark;
      return `<button class="qq-ttt-cell${mark ? ` mark-${mark}` : ''}${state.winLine.includes(index) ? ' win' : ''}" type="button" data-qq-ttt="${index}" ${disabled ? 'disabled' : ''} aria-label="Cell ${index + 1}${mark ? `, ${mark === 1 ? 'X' : 'O'}` : ''}">${mark ? (mark === 1 ? 'X' : 'O') : ''}</button>`;
    }).join('');
    return `<div class="qq-ttt"><div class="qq-ttt-board">${marks}</div><div class="qq-ttt-meta"><span>You are <strong>${local === 1 ? 'X' : 'O'}</strong></span><span>${state.winner ? `${state.winner === local ? 'You win' : 'You lose'}` : state.draw ? 'Draw' : canAct ? 'Your move' : `Waiting for ${esc(actorName(state.turn))}`}</span></div><p class="qq-board-help">${GAME_META.tictactoe.help}</p></div>`;
  }

  function mancalaView(state) {
    const local = localActor();
    const canAct = myTurn() && state.status !== 'done';
    const storeOne = state.board[6], storeTwo = state.board[13];
    const pits = (actor) => mancalaPits(actor).map((pit) => `<button class="qq-mancala-pit${state.last?.last === pit ? ' last' : ''}" type="button" data-qq-mancala="${pit}" ${canAct && actor === local && state.board[pit] ? '' : 'disabled'} aria-label="${actor === local ? 'Your' : 'Opponent'} pit ${mancalaPits(actor).indexOf(pit) + 1}, ${state.board[pit]} stones"><b>${state.board[pit]}</b><small>${actor === local ? 'you' : actorName(actor)}</small></button>`).join('');
    return `<div class="qq-mancala"><div class="qq-mancala-board"><div class="qq-mancala-store ${local === 2 ? 'mine' : ''}"><span>${esc(actorName(2))}</span><b>${storeTwo}</b></div><div class="qq-mancala-field"><div class="qq-mancala-row">${mancalaPits(2).slice().reverse().map((pit) => `<button class="qq-mancala-pit${state.last?.last === pit ? ' last' : ''}" type="button" data-qq-mancala="${pit}" ${canAct && local === 2 && state.board[pit] ? '' : 'disabled'} aria-label="${local === 2 ? 'Your' : 'Opponent'} pit, ${state.board[pit]} stones"><b>${state.board[pit]}</b>${local === 2 ? '<small>you</small>' : ''}</button>`).join('')}</div><div class="qq-mancala-row">${mancalaPits(1).map((pit) => `<button class="qq-mancala-pit${state.last?.last === pit ? ' last' : ''}" type="button" data-qq-mancala="${pit}" ${canAct && local === 1 && state.board[pit] ? '' : 'disabled'} aria-label="Your pit ${pit + 1}, ${state.board[pit]} stones"><b>${state.board[pit]}</b><small>${local === 1 ? 'you' : esc(actorName(1))}</small></button>`).join('')}</div></div><div class="qq-mancala-store ${local === 1 ? 'mine' : ''}"><span>${esc(actorName(1))}</span><b>${storeOne}</b></div></div><div class="qq-mancala-meta"><span>${state.status === 'done' ? state.winner ? `${state.winner === local ? 'You win' : 'You lose'} · ${storeOne}–${storeTwo}` : `Draw · ${storeOne}–${storeTwo}` : canAct ? 'Choose one of your pits.' : `Waiting for ${esc(actorName(state.turn))}.`}</span></div><p class="qq-board-help">${GAME_META.mancala.help}</p></div>`;
  }

  function gofishView(state) {
    const local = localActor();
    const hand = state.hands[local] || [];
    const canAct = myTurn() && state.status !== 'done';
    const ranks = CARD_RANKS.filter((rank) => hand.some((card) => card.r === rank));
    const selected = ranks.includes(S.fishRank) ? S.fishRank : '';
    const target = cardActors(state.players).includes(Number(S.fishTarget)) ? Number(S.fishTarget) : 0;
    const opponents = cardActors(state.players).filter((actor) => actor !== local).map((actor) => `<button type="button" class="qq-fish-opponent${target === actor ? ' selected' : ''}${state.turn === actor ? ' active' : ''}" data-qq-fish-target="${actor}" ${canAct ? '' : 'disabled'}><span class="qq-avatar">${esc(initial(actorName(actor)))}</span><span><strong>${esc(actorName(actor))}</strong><small>${state.hands[actor]?.length || 0} cards · ${state.books[actor] || 0} books</small></span></button>`).join('');
    const rankButtons = ranks.map((rank) => {
      const count = hand.filter((card) => card.r === rank).length;
      return `<button type="button" class="qq-fish-rank${selected === rank ? ' selected' : ''}" data-qq-fish-rank="${rank}" ${canAct ? '' : 'disabled'}><b>${rank}</b><small>${count}</small></button>`;
    }).join('');
    const needTarget = selected && !target;
    const last = state.last ? (state.last.got ? `${actorName(state.last.actor)} took ${state.last.got} ${state.last.rank}${state.last.got === 1 ? '' : 's'} from ${actorName(state.last.target)}.` : `${actorName(state.last.actor)} asked ${actorName(state.last.target)} for ${state.last.rank}${state.last.drew ? ' and went fishing.' : '.'}`) : 'Choose a rank you hold, then choose who to ask.';
    return `<div class="qq-fish">
      <div class="qq-fish-score"><span>Your books <b>${state.books[local] || 0}</b></span><span>Deck <b>${state.deck.length}</b></span><span>${canAct ? 'Your turn' : state.status === 'done' ? 'Final books' : `Waiting for ${esc(actorName(state.turn))}`}</span></div>
      <div class="qq-fish-opponents">${opponents}</div>
      <div class="qq-fish-panel"><span class="qq-fish-label">Ask for a rank</span><div class="qq-fish-hand">${rankButtons || '<span class="qq-fish-none">No cards in hand.</span>'}</div></div>
      <div class="qq-fish-ask"><span>${selected ? `Ask for <strong>${selected}</strong>` : 'Pick a rank first'} ${target ? `from <strong>${esc(actorName(target))}</strong>` : needTarget ? '— now pick a player' : ''}</span><button class="btn primary" type="button" data-qq-fish-ask ${canAct && selected && target ? '' : 'disabled'}>${icon('send')} Ask</button></div>
      <div class="qq-fish-last">${esc(last)}</div>
      <p class="qq-board-help">${GAME_META.gofish.help}</p>
    </div>`;
  }

  function dotsView(state) {
    const local = localActor();
    const canAct = myTurn() && state.status !== 'done';
    const scores = dotsScores(state);
    const cells = [];
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        if (row % 2 === 0 && col % 2 === 0) {
          cells.push('<span class="qq-dots-node" aria-hidden="true"></span>');
        } else if (row % 2 === 0) {
          const index = (row / 2) * DOTS_SIZE + (col - 1) / 2;
          const owner = state.h[index];
          cells.push(`<button type="button" class="qq-dots-line h${owner ? ` p${owner}` : ''}" data-qq-dots-h="${index}" ${canAct && !owner ? '' : 'disabled'} aria-label="Horizontal line ${index + 1}"></button>`);
        } else if (col % 2 === 0) {
          const index = ((row - 1) / 2) * (DOTS_SIZE + 1) + col / 2;
          const owner = state.v[index];
          cells.push(`<button type="button" class="qq-dots-line v${owner ? ` p${owner}` : ''}" data-qq-dots-v="${index}" ${canAct && !owner ? '' : 'disabled'} aria-label="Vertical line ${index + 1}"></button>`);
        } else {
          const boxRow = (row - 1) / 2;
          const boxCol = (col - 1) / 2;
          const owner = state.boxes[boxRow * DOTS_SIZE + boxCol];
          cells.push(`<span class="qq-dots-box${owner ? ` p${owner}` : ''}" aria-hidden="true">${owner ? `<i>${owner === local ? 'you' : '•'}</i>` : ''}</span>`);
        }
      }
    }
    const last = state.last ? `${state.last.claimed ? `${esc(actorName(state.last.actor))} completed ${state.last.claimed} box${state.last.claimed === 1 ? '' : 'es'} and keeps the turn.` : `${esc(actorName(state.last.actor))} drew a line.`}` : 'Draw a line between two dots.';
    return `<div class="qq-dots">
      <div class="qq-board-score"><span class="p1">You ${scores[local] || 0}</span><span class="p2">${esc(actorName(opponentActor()))} ${scores[local === 1 ? 2 : 1] || 0}</span><span>${canAct ? 'Click a line' : state.status === 'done' ? 'Final count' : `Waiting for ${esc(actorName(state.turn))}`}</span></div>
      <div class="qq-dots-board" style="--dots-size:${DOTS_SIZE}">${cells.join('')}</div>
      <div class="qq-dots-last">${last}</div>
      <p class="qq-board-help">${GAME_META.dots.help}</p>
    </div>`;
  }

  function nimView(state) {
    const local = localActor();
    const canAct = myTurn() && state.status !== 'done';
    const piles = state.piles.map((stones, index) => `<section class="qq-nim-pile${state.last?.pile === index ? ' last' : ''}"><div class="qq-nim-stones">${Array.from({ length: stones }, (_, stone) => `<span class="qq-nim-stone" style="--i:${stone}"></span>`).join('') || '<span class="qq-nim-empty">empty</span>'}</div><div class="qq-nim-pile-meta"><strong>Pile ${index + 1}</strong><span>${stones} left</span></div><div class="qq-nim-actions">${[1, 2, 3].map((count) => `<button type="button" class="btn${count === 1 ? ' primary' : ''}" data-qq-nim-pile="${index}" data-qq-nim-take="${count}" ${canAct && stones >= count ? '' : 'disabled'}>−${count}</button>`).join('')}</div></section>`).join('');
    const last = state.last ? `${esc(actorName(state.last.actor))} took ${state.last.count} stone${state.last.count === 1 ? '' : 's'} from pile ${state.last.pile + 1}.` : 'Take one to three stones from a single pile.';
    return `<div class="qq-nim">
      <div class="qq-board-score"><span>Your turn: take the last stone</span><span>${canAct ? 'Your move' : state.status === 'done' ? (state.winner === local ? 'You win' : 'You lose') : `Waiting for ${esc(actorName(state.turn))}`}</span></div>
      <div class="qq-nim-piles">${piles}</div>
      <div class="qq-nim-last">${last}</div>
      <p class="qq-board-help">${GAME_META.nim.help}</p>
    </div>`;
  }

  function gameView() {
    const state = S.match?.state;
    if (!state) return `<div class="qq-card"><div class="qq-empty">${icon('loader-circle')}<h2>Setting up the table</h2><p>Waiting for the first hand.</p></div></div>`;
    let board = '';
    if (state.game === 'connect4') board = connect4View(state);
    if (state.game === 'battleship') board = battleshipView(state);
    if (state.game === 'uno') board = unoView(state);
    if (state.game === 'chess') board = chessView(state);
    if (state.game === 'checkers') board = checkersView(state);
    if (state.game === 'reversi') board = reversiView(state);
    if (state.game === 'dominoes') board = dominoView(state);
    if (state.game === 'blackjack') board = blackjackView(state);
    if (state.game === 'eights') board = eightsView(state);
    if (state.game === 'memory') board = memoryView(state);
    if (state.game === 'tictactoe') board = tictactoeView(state);
    if (state.game === 'mancala') board = mancalaView(state);
    if (state.game === 'gofish') board = gofishView(state);
    if (state.game === 'dots') board = dotsView(state);
    if (state.game === 'nim') board = nimView(state);
    return `<div class="qq-card">
      <div class="qq-room-head">
        <div class="qq-room-id">${gameArt(state.game, 'qq-room-art')}<div><strong>${esc(roomCode() || 'Practice')}</strong><small>${esc(gameLabel())}</small></div></div>
        <div class="qq-room-tools">${S.isSpectator ? `<span class="qq-badge spectator">${icon('eye')} Spectating</span>` : `<span class="qq-badge ${S.match.ranked ? '' : 'casual'}">${S.match.ranked ? 'Ranked' : 'Casual'}</span>`}<span class="qq-badge casual">${state.players || 2} seats</span>${(S.watchers || (S.mode === 'host' ? S.spectators.length : 0)) ? `<span class="qq-badge casual">${icon('eye')} ${S.mode === 'host' ? S.spectators.length : S.watchers}</span>` : ''}${roomCode() ? `<button class="btn" type="button" data-qq-copy title="Copy room code">${icon('copy')}<span>Code</span></button>` : ''}<button class="btn" type="button" data-qq-leave>${icon('log-out')}<span>Leave</span></button></div>
      </div>
      ${playersHTML(state)}
      <div class="qq-game-body">
        <div class="qq-status">${statusHTML()}</div>
        ${S.error ? `<p class="qq-error">${esc(S.error)}</p>` : ''}
        ${resultHTML()}
        ${board}
        ${roomChatMarkup()}
      </div>
    </div>`;
  }

  function render() {
    const view = document.getElementById('quickqView');
    if (!view) return;
    let body;
    if (!S.view || S.view === 'lobby') body = lobbyView();
    else if (S.view === 'setup') body = setupView();
    else if (S.view === 'waiting') body = waitingView();
    else if (S.view === 'joining') body = joiningView();
    else body = gameView();
    view.innerHTML = `<div class="qq-shell">${body}</div>`;
    refreshIcons(view);
    requestAnimationFrame(() => { const log = view.querySelector('[data-qq-chat-log]'); if (log) log.scrollTop = log.scrollHeight; });
  }

  /* ======================= interactions ======================= */

  function handleGameClick(event) {
    const target = event.target;
    const game = target.closest('[data-qq-game]');
    if (game && S.view === 'lobby') {
      S.game = game.dataset.qqGame;
      S.tableSize = tableSizeFor(S.game, 2);
      S.error = '';
      S.joinCode = '';
      S.view = 'setup';
      resetTurnUi();
      try { localStorage.setItem('quickq.game', S.game); } catch {}
      render();
      return;
    }
    if (target.closest('[data-qq-back]')) { resetSession(); return; }
    const size = target.closest('[data-qq-size]');
    if (size) {
      S.tableSize = tableSizeFor(S.game, Number(size.dataset.qqSize));
      render();
      return;
    }
    if (target.closest('[data-qq-bot]')) { playBot(); return; }
    if (target.closest('[data-qq-create]')) { createRoom(); return; }
    if (target.closest('[data-qq-join]')) { joinRoom(); return; }
    if (target.closest('[data-qq-copy]')) {
      const code = roomCode();
      if (!code) return;
      const done = () => toast('Room code copied', 'Send it to the friend you want to play.', 'success');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => {});
      else done();
      return;
    }
    if (target.closest('[data-qq-leave]')) { resetSession(); return; }
    if (target.closest('[data-qq-again]')) { playBot(); return; }
    if (target.closest('[data-qq-voice]')) { toggleVoice(); return; }

    if (S.view !== 'game' || !S.match || S.match.aborted || isEnded()) return;
    if (target.closest('[data-qq-bs-ready]')) { submitAction({ type: 'ready' }); return; }
    if (target.closest('[data-qq-bs-redeploy]')) { submitAction({ type: 'redeploy' }); return; }
    const bsShot = target.closest('[data-qq-bs-shot]');
    if (bsShot) {
      if (!myTurn()) return;
      submitAction({ type: 'shot', cell: Number(bsShot.dataset.qqBsShot) });
      return;
    }
    const c4 = target.closest('[data-qq-c4]');
    if (c4) {
      if (!myTurn()) return;
      submitAction({ type: 'drop', col: Number(c4.dataset.qqC4) });
      return;
    }
    const uno = target.closest('[data-qq-uno]');
    if (uno) {
      if (!myTurn() || S.pendingWild != null) return;
      const index = Number(uno.dataset.qqUno);
      const card = S.match.state.hands[localActor()][index];
      if (!card) return;
      if (card.c === 'w') { S.pendingWild = index; render(); return; }
      submitAction({ type: 'play', index });
      return;
    }
    const wildColor = target.closest('[data-qq-wild-color]');
    if (wildColor && S.pendingWild != null) {
      const index = S.pendingWild;
      S.pendingWild = null;
      submitAction({ type: 'play', index, color: wildColor.dataset.qqWildColor });
      return;
    }
    if (target.closest('[data-qq-wild-cancel]')) { S.pendingWild = null; render(); return; }
    if (target.closest('[data-qq-draw]')) {
      if (!myTurn() || S.match.state.drawn) return;
      submitAction({ type: 'draw' });
      return;
    }
    if (target.closest('[data-qq-pass]')) {
      if (!myTurn() || !S.match.state.drawn) return;
      submitAction({ type: 'pass' });
      return;
    }
    const checkersSquare = target.closest('[data-qq-checkers-square]');
    if (checkersSquare) {
      const state = S.match.state;
      if (state.game !== 'checkers' || !myTurn()) return;
      const index = Number(checkersSquare.dataset.qqCheckersSquare);
      if (S.checkersFrom != null) {
        const move = checkersLegalMoves(state, localActor()).find((candidate) => candidate.from === S.checkersFrom && candidate.to === index);
        if (move) {
          S.checkersFrom = null;
          submitAction({ type: 'move', from: move.from, to: move.to });
          return;
        }
      }
      const piece = state.board[index];
      S.checkersFrom = piece && checkersActor(piece) === localActor() ? index : null;
      render();
      return;
    }
    const reversiSquare = target.closest('[data-qq-reversi-square]');
    if (reversiSquare) {
      if (!myTurn() || S.match.state.game !== 'reversi') return;
      submitAction({ type: 'move', index: Number(reversiSquare.dataset.qqReversiSquare) });
      return;
    }
    const dominoTile = target.closest('[data-qq-domino]');
    if (dominoTile) {
      if (!myTurn() || S.match.state.game !== 'dominoes') return;
      const index = Number(dominoTile.dataset.qqDomino);
      const move = dominoLegalMoves(S.match.state, localActor()).find((candidate) => candidate.index === index);
      if (!move) return;
      if (move.sides.length > 1) { S.dominoPick = { index, sides: move.sides }; render(); return; }
      S.dominoPick = null;
      submitAction({ type: 'play', index, side: move.sides[0] });
      return;
    }
    const dominoSide = target.closest('[data-qq-domino-side]');
    if (dominoSide && S.dominoPick) {
      const index = S.dominoPick.index;
      const side = dominoSide.dataset.qqDominoSide;
      S.dominoPick = null;
      submitAction({ type: 'play', index, side });
      return;
    }
    if (target.closest('[data-qq-domino-cancel]')) { S.dominoPick = null; render(); return; }
    if (target.closest('[data-qq-domino-draw]')) {
      if (!myTurn()) return;
      S.dominoPick = null;
      submitAction({ type: 'draw' });
      return;
    }
    if (target.closest('[data-qq-domino-pass]')) {
      if (!myTurn()) return;
      S.dominoPick = null;
      submitAction({ type: 'pass' });
      return;
    }
    if (target.closest('[data-qq-bj-hit]')) { if (myTurn()) submitAction({ type: 'hit' }); return; }
    if (target.closest('[data-qq-bj-stand]')) { if (myTurn()) submitAction({ type: 'stand' }); return; }
    const eightsCard = target.closest('[data-qq-eights]');
    if (eightsCard) {
      if (!myTurn() || S.pendingEights != null) return;
      const index = Number(eightsCard.dataset.qqEights);
      const card = S.match.state.hands[localActor()]?.[index];
      if (!card) return;
      if (card.r === '8') { S.pendingEights = index; render(); return; }
      submitAction({ type: 'play', index });
      return;
    }
    const eightsSuit = target.closest('[data-qq-eights-suit]');
    if (eightsSuit && S.pendingEights != null) {
      const index = S.pendingEights;
      S.pendingEights = null;
      submitAction({ type: 'play', index, suit: eightsSuit.dataset.qqEightsSuit });
      return;
    }
    if (target.closest('[data-qq-eights-cancel]')) { S.pendingEights = null; render(); return; }
    if (target.closest('[data-qq-eights-draw]')) { if (myTurn()) submitAction({ type: 'draw' }); return; }
    if (target.closest('[data-qq-eights-pass]')) { if (myTurn()) submitAction({ type: 'pass' }); return; }
    const memoryCard = target.closest('[data-qq-memory]');
    if (memoryCard) { if (myTurn()) submitAction({ type: 'flip', index: Number(memoryCard.dataset.qqMemory) }); return; }
    const tttCell = target.closest('[data-qq-ttt]');
    if (tttCell) { if (myTurn()) submitAction({ type: 'mark', index: Number(tttCell.dataset.qqTtt) }); return; }
    const mancalaPit = target.closest('[data-qq-mancala]');
    if (mancalaPit) { if (myTurn()) submitAction({ type: 'sow', pit: Number(mancalaPit.dataset.qqMancala) }); return; }
    const fishRank = target.closest('[data-qq-fish-rank]');
    if (fishRank) { if (myTurn()) { S.fishRank = fishRank.dataset.qqFishRank; render(); } return; }
    const fishTarget = target.closest('[data-qq-fish-target]');
    if (fishTarget) { if (myTurn()) { S.fishTarget = Number(fishTarget.dataset.qqFishTarget); render(); } return; }
    if (target.closest('[data-qq-fish-ask]')) {
      if (myTurn() && S.fishRank && S.fishTarget) {
        const ask = { type: 'ask', rank: S.fishRank, target: S.fishTarget };
        S.fishRank = null; S.fishTarget = null;
        submitAction(ask);
      }
      return;
    }
    const dotsH = target.closest('[data-qq-dots-h]');
    if (dotsH) { if (myTurn()) submitAction({ type: 'line', orientation: 'h', index: Number(dotsH.dataset.qqDotsH) }); return; }
    const dotsV = target.closest('[data-qq-dots-v]');
    if (dotsV) { if (myTurn()) submitAction({ type: 'line', orientation: 'v', index: Number(dotsV.dataset.qqDotsV) }); return; }
    const nim = target.closest('[data-qq-nim-pile]');
    if (nim) { if (myTurn()) submitAction({ type: 'take', pile: Number(nim.dataset.qqNimPile), count: Number(nim.dataset.qqNimTake) }); return; }
    const square = target.closest('[data-qq-square]');
    if (square) {
      const state = S.match.state;
      if (state.game !== 'chess' || !myTurn()) return;
      const index = Number(square.dataset.qqSquare);
      if (S.chessFrom != null) {
        const move = chessMoves(state, S.chessFrom, true).find((candidate) => candidate.to === index);
        if (move) {
          S.chessFrom = null;
          submitAction({ type: 'move', from: move.from, to: move.to });
          return;
        }
      }
      const piece = state.board[index];
      if (piece && chessColor(piece) === state.turn) S.chessFrom = index;
      else S.chessFrom = null;
      render();
    }
  }

  function handleChange(event) {
    const name = event.target.closest('[data-qq-name]');
    if (name) {
      S.name = cleanName(name.value) || 'Guest';
      try { localStorage.setItem(NAME_KEY, S.name); } catch {}
      render();
      return;
    }
    if (event.target.closest('[data-qq-ranked]')) {
      S.ranked = !!event.target.checked;
      try { localStorage.setItem('quickq.ranked', S.ranked ? '1' : '0'); } catch {}
      render();
    }
  }

  function handleInput(event) {
    const join = event.target.closest('[data-qq-join-code]');
    if (!join) return;
    const next = normaliseCode(join.value);
    if (join.value !== next) join.value = next;
    S.joinCode = next;
  }

  function handleSubmit(event) {
    const form = event.target.closest('[data-qq-chat-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('[data-qq-chat-input]');
    const text = input?.value || '';
    if (!cleanChat(text)) return;
    sendChat(text);
    if (input) input.value = '';
  }

  function bind() {
    const view = document.getElementById('quickqView');
    if (!view) return;
    view.addEventListener('click', handleGameClick);
    view.addEventListener('change', handleChange);
    view.addEventListener('input', handleInput);
    view.addEventListener('submit', handleSubmit);
  }

  bind();
  window.QuickQ = { render, engines: GAMES, state: () => S };
})();
