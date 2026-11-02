// Holo-Schach: full chess rules (castling, en passant, promotion, check, mate,
// stalemate), a small alpha-beta engine (leicht/mittel/schwer) and a red
// hologram board in 3D perspective with gliding pieces and capture bursts.
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const NAME = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0];
const isW = (p) => p && p === p.toUpperCase();
const col = (p) => (p ? (isW(p) ? 'w' : 'b') : null);
const low = (p) => p.toLowerCase();

export function initial() {
  const rows = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
  return { board: rows.join('').split('').map((c) => (c === '.' ? null : c)), turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1 };
}
const clone = (s) => ({ board: s.board.slice(), turn: s.turn, castle: { ...s.castle }, ep: s.ep });

function attacked(b, sq, by) {
  const r = Math.floor(sq / 8); const c = sq % 8;
  const at = (rr, cc) => (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 ? b[rr * 8 + cc] : undefined);
  const pawnDir = by === 'w' ? 1 : -1; // attacking pawn sits one row "below" for white
  for (const dc of [-1, 1]) { const p = at(r + pawnDir, c + dc); if (p && col(p) === by && low(p) === 'p') return true; }
  for (const [dr, dc] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const p = at(r + dr, c + dc); if (p && col(p) === by && low(p) === 'n') return true; }
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { if (!dr && !dc) continue; const p = at(r + dr, c + dc); if (p && col(p) === by && low(p) === 'k') return true; }
  for (const [dr, dc, kinds] of [[1, 0, 'rq'], [-1, 0, 'rq'], [0, 1, 'rq'], [0, -1, 'rq'], [1, 1, 'bq'], [1, -1, 'bq'], [-1, 1, 'bq'], [-1, -1, 'bq']]) {
    let rr = r + dr; let cc = c + dc;
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const p = b[rr * 8 + cc]; if (p) { if (col(p) === by && kinds.includes(low(p))) return true; break; } rr += dr; cc += dc; }
  }
  return false;
}
const kingSq = (b, c) => b.findIndex((p) => p === (c === 'w' ? 'K' : 'k'));
const inCheck = (s, c = s.turn) => attacked(s.board, kingSq(s.board, c), c === 'w' ? 'b' : 'w');

function pseudo(s) {
  const b = s.board; const me = s.turn; const out = [];
  const add = (from, to, extra = {}) => out.push({ from, to, piece: b[from], capture: b[to] || extra.capture || null, ...extra });
  for (let sq = 0; sq < 64; sq += 1) {
    const p = b[sq]; if (!p || col(p) !== me) continue;
    const r = Math.floor(sq / 8); const c = sq % 8; const t = low(p);
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1; const start = me === 'w' ? 6 : 1; const last = me === 'w' ? 0 : 7;
      const one = sq + dir * 8;
      if (r + dir >= 0 && r + dir < 8 && !b[one]) {
        add(sq, one, r + dir === last ? { promo: me === 'w' ? 'Q' : 'q' } : {});
        if (r === start && !b[one + dir * 8]) add(sq, one + dir * 8, { double: true });
      }
      for (const dc of [-1, 1]) {
        const cc = c + dc; if (cc < 0 || cc > 7 || r + dir < 0 || r + dir > 7) continue;
        const to = (r + dir) * 8 + cc;
        if (b[to] && col(b[to]) !== me) add(sq, to, r + dir === last ? { promo: me === 'w' ? 'Q' : 'q' } : {});
        else if (to === s.ep) add(sq, to, { ep: true, capture: me === 'w' ? 'p' : 'P' });
      }
    } else if (t === 'n' || t === 'k') {
      const steps = t === 'n' ? [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of steps) { const rr = r + dr; const cc = c + dc; if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue; const to = rr * 8 + cc; if (!b[to] || col(b[to]) !== me) add(sq, to); }
      if (t === 'k') {
        const enemy = me === 'w' ? 'b' : 'w'; const row = me === 'w' ? 7 : 0;
        if (sq === row * 8 + 4 && !attacked(b, sq, enemy)) {
          if (s.castle[me === 'w' ? 'K' : 'k'] && !b[row * 8 + 5] && !b[row * 8 + 6] && !attacked(b, row * 8 + 5, enemy) && !attacked(b, row * 8 + 6, enemy)) add(sq, row * 8 + 6, { castle: 'k' });
          if (s.castle[me === 'w' ? 'Q' : 'q'] && !b[row * 8 + 3] && !b[row * 8 + 2] && !b[row * 8 + 1] && !attacked(b, row * 8 + 3, enemy) && !attacked(b, row * 8 + 2, enemy)) add(sq, row * 8 + 2, { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (const [dr, dc] of dirs) { let rr = r + dr; let cc = c + dc; while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) { const to = rr * 8 + cc; if (b[to]) { if (col(b[to]) !== me) add(sq, to); break; } add(sq, to); rr += dr; cc += dc; } }
    }
  }
  return out;
}

export function make(s, m) {
  const n = clone(s); const b = n.board; const me = s.turn;
  b[m.to] = m.promo || b[m.from]; b[m.from] = null;
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = null;
  if (m.castle) { const row = me === 'w' ? 7 : 0; if (m.castle === 'k') { b[row * 8 + 5] = b[row * 8 + 7]; b[row * 8 + 7] = null; } else { b[row * 8 + 3] = b[row * 8]; b[row * 8] = null; } }
  n.ep = m.double ? (m.from + m.to) / 2 : -1;
  if (low(m.piece) === 'k') { if (me === 'w') { n.castle.K = false; n.castle.Q = false; } else { n.castle.k = false; n.castle.q = false; } }
  for (const [sq, key] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) n.castle[key] = false;
  n.turn = me === 'w' ? 'b' : 'w';
  return n;
}
export function legal(s) { return pseudo(s).filter((m) => !inCheck(make(s, m), s.turn)); }

function evaluate(s) {
  let score = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    const p = s.board[sq]; if (!p) continue;
    const t = low(p); const r = Math.floor(sq / 8); const c = sq % 8;
    let v = VAL[t];
    if (t === 'n' || t === 'b') v += (CENTER[r] + CENTER[c]) * 6;
    if (t === 'p') v += (isW(p) ? 6 - r : r - 1) * 8 + (c > 1 && c < 6 ? CENTER[r] * 3 : 0);
    if (t === 'q') v += (CENTER[r] + CENTER[c]) * 2;
    score += isW(p) ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}
function search(s, depth, alpha, beta) {
  const moves = legal(s);
  if (!moves.length) return inCheck(s) ? -100000 - depth : 0;
  if (depth === 0) return evaluate(s);
  moves.sort((a, b) => (b.capture ? VAL[low(b.capture)] - VAL[low(b.piece)] / 10 : -1) - (a.capture ? VAL[low(a.capture)] - VAL[low(a.piece)] / 10 : -1));
  for (const m of moves) {
    const v = -search(make(s, m), depth - 1, -beta, -alpha);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
export function bestMove(s, level = 'mittel') {
  const depth = level === 'leicht' ? 1 : level === 'schwer' ? 3 : 2;
  const moves = legal(s); if (!moves.length) return null;
  let best = null; let bestV = -Infinity;
  for (const m of moves) {
    const v = -search(make(s, m), depth - 1, -Infinity, Infinity) + (level === 'leicht' ? Math.random() * 120 : Math.random() * 8);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

// --- UI ----------------------------------------------------------------------------------
let ui = null;
let audio = null;
function tone(f, d, type = 'triangle', v = 0.07, delay = 0) { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); const t = audio.currentTime + delay; const o = audio.createOscillator(); const g = audio.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g).connect(audio.destination); o.start(t); o.stop(t + d + 0.05); } catch { /* no audio */ } }

function sqName(sq) { return `${'abcdefgh'[sq % 8]}${8 - Math.floor(sq / 8)}`; }
function comment(text) { ui.say.textContent = text; ui.say.classList.remove('pop'); void ui.say.offsetWidth; ui.say.classList.add('pop'); }

function draw() {
  const s = ui.state;
  ui.board.querySelectorAll('.ch-sq').forEach((d, sq) => {
    d.classList.toggle('sel', ui.sel === sq);
    d.classList.toggle('target', ui.targets.includes(sq));
    d.classList.toggle('last', ui.last && (ui.last.from === sq || ui.last.to === sq));
    d.classList.toggle('check', inCheck(s) && s.board[sq] === (s.turn === 'w' ? 'K' : 'k'));
  });
  // pieces: keep elements by id so they glide
  const seen = new Set();
  s.board.forEach((p, sq) => {
    if (!p) return;
    let piece = ui.pieces.find((q) => q.sq === sq && !seen.has(q));
    if (!piece) { piece = { sq, node: el('span', 'ch-piece') }; ui.layer.append(piece.node); ui.pieces.push(piece); }
    seen.add(piece);
    piece.p = p;
    piece.node.textContent = GLYPH[low(p)];
    piece.node.className = `ch-piece ${isW(p) ? 'w' : 'b'}`;
    piece.node.style.left = `${(sq % 8) * 12.5}%`; piece.node.style.top = `${Math.floor(sq / 8) * 12.5}%`;
  });
  ui.pieces = ui.pieces.filter((q) => { if (!seen.has(q)) { q.node.remove(); return false; } return true; });
}

function burst(sq) {
  const b = el('div', 'ch-burst'); b.style.left = `${(sq % 8) * 12.5 + 6.25}%`; b.style.top = `${Math.floor(sq / 8) * 12.5 + 6.25}%`;
  for (let i = 0; i < 18; i += 1) { const s = el('i'); s.style.setProperty('--a', `${Math.random() * 360}deg`); s.style.setProperty('--d', `${20 + Math.random() * 40}px`); b.append(s); }
  ui.layer.append(b); setTimeout(() => b.remove(), 800);
}

function play(m) {
  const before = ui.state;
  ui.history.push(before);
  // move the existing piece node to its target square first (glide)
  const node = ui.pieces.find((q) => q.sq === m.from);
  const victimSq = m.ep ? m.to + (before.turn === 'w' ? 8 : -8) : m.capture ? m.to : -1;
  if (victimSq >= 0) { const v = ui.pieces.find((q) => q.sq === victimSq); if (v) { v.node.classList.add('dying'); burst(victimSq); ui.pieces = ui.pieces.filter((q) => q !== v); setTimeout(() => v.node.remove(), 450); } }
  if (node) node.sq = m.to;
  if (m.castle) { const row = before.turn === 'w' ? 7 : 0; const rook = ui.pieces.find((q) => q.sq === row * 8 + (m.castle === 'k' ? 7 : 0)); if (rook) rook.sq = row * 8 + (m.castle === 'k' ? 5 : 3); }
  ui.pieces.forEach((q) => { q.node.style.left = `${(q.sq % 8) * 12.5}%`; q.node.style.top = `${Math.floor(q.sq / 8) * 12.5}%`; });
  ui.state = make(before, m);
  ui.last = m; ui.sel = -1; ui.targets = [];
  tone(m.capture ? 220 : 660, 0.12, m.capture ? 'square' : 'triangle', 0.07);
  setTimeout(draw, 20);
  const next = legal(ui.state);
  const mover = before.turn === 'w' ? 'Du' : 'Jarvis';
  if (!next.length) {
    if (inCheck(ui.state)) { comment(before.turn === 'w' ? 'Schachmatt – du hast gewonnen! Respekt, Boss. 🏆' : 'Schachmatt. Diesmal gewinne ich. Revanche?'); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, 'triangle', 0.08, i * 0.1)); }
    else comment('Patt – unentschieden.');
    ui.over = true; return;
  }
  if (inCheck(ui.state)) { comment(before.turn === 'w' ? 'Schach! Nicht schlecht.' : 'Schach!'); tone(1200, 0.15, 'square', 0.06); }
  else if (m.capture) comment(before.turn === 'w' ? `Du nimmst meinen ${NAME[low(m.capture)]}. Autsch.` : `Ich nehme deinen ${NAME[low(m.capture)]}.`);
  else if (m.castle) comment(`${mover === 'Du' ? 'Du rochierst' : 'Ich rochiere'} – sicher ist sicher.`);
  else if (m.promo) comment(`${mover === 'Du' ? 'Dein' : 'Mein'} Bauer wird zur Dame!`);
  else if (before.turn === 'b') comment(`Ich ziehe ${NAME[low(m.piece)]} nach ${sqName(m.to)}. Du bist dran.`);
  if (ui.state.turn === 'b' && !ui.over) { ui.thinking = true; ui.root.classList.add('thinking'); setTimeout(() => { const reply = bestMove(ui.state, ui.level); ui.thinking = false; ui.root.classList.remove('thinking'); if (reply && ui) play(reply); }, 450); }
}

function tap(sq) {
  const s = ui.state;
  if (ui.over || ui.thinking || s.turn !== 'w') return;
  if (ui.sel >= 0 && ui.targets.includes(sq)) { const m = legal(s).find((x) => x.from === ui.sel && x.to === sq); if (m) { play(m); return; } }
  if (s.board[sq] && isW(s.board[sq])) { ui.sel = sq; ui.targets = legal(s).filter((m) => m.from === sq).map((m) => m.to); tone(880, 0.05, 'sine', 0.04); }
  else { ui.sel = -1; ui.targets = []; }
  draw();
}

export function openChess(level = 'mittel') {
  document.dispatchEvent(new CustomEvent('jarvis-overlay', { detail: 'chess' }));
  ui?.root.remove();
  const root = el('div', 'ch');
  root.innerHTML = `<header class="ch-top"><p>JARVIS · HOLO-SCHACH</p><div><select class="ch-level" aria-label="Stärke"><option value="leicht">Leicht</option><option value="mittel">Mittel</option><option value="schwer">Schwer</option></select><button type="button" class="ch-undo">↶ Zurück</button><button type="button" class="ch-new">Neu</button><button type="button" class="ch-x" aria-label="Schließen">✕</button></div></header>
    <div class="ch-stage"><div class="ch-holo"><div class="ch-board"></div><div class="ch-layer"></div></div><div class="ch-beam"></div></div>
    <p class="ch-say">Du spielst Weiß. Tippe eine Figur an, dann das Zielfeld.</p>`;
  document.body.append(root);
  const board = root.querySelector('.ch-board');
  for (let sq = 0; sq < 64; sq += 1) { const d = el('button', `ch-sq ${(Math.floor(sq / 8) + sq) % 2 ? 'dark' : 'light'}`); d.type = 'button'; d.setAttribute('aria-label', sqName(sq)); d.addEventListener('click', () => tap(sq)); board.append(d); }
  ui = { root, board, layer: root.querySelector('.ch-layer'), say: root.querySelector('.ch-say'), state: initial(), history: [], pieces: [], sel: -1, targets: [], last: null, over: false, thinking: false, level };
  root.querySelector('.ch-level').value = level;
  root.querySelector('.ch-level').addEventListener('change', (e) => { ui.level = e.target.value; comment(`Stärke: ${e.target.value}.`); });
  root.querySelector('.ch-new').addEventListener('click', () => openChess(ui.level));
  root.querySelector('.ch-undo').addEventListener('click', () => { if (ui.thinking || ui.history.length < 2) return; ui.history.pop(); ui.state = ui.history.pop(); ui.over = false; ui.last = null; ui.sel = -1; ui.targets = []; ui.pieces.forEach((q) => q.node.remove()); ui.pieces = []; draw(); comment('Zug zurückgenommen.'); });
  root.querySelector('.ch-x').addEventListener('click', closeChess);
  draw();
  tone(392, 0.3); tone(523, 0.4, 'triangle', 0.07, 0.12);
}
export function closeChess() { ui?.root.remove(); ui = null; }
if (typeof document !== 'undefined') document.addEventListener('jarvis-overlay', (e) => { if (e.detail !== 'chess') closeChess(); });
