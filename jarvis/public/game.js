// Jarvis game engine: six original mini-game types driven by a config that
// Jarvis designs (title, emojis, colors, difficulty, quiz questions).
// Works with touch (iPhone) and keyboard/mouse (PC).
import { decodeGame, sanitizeGame } from './game-config.js';

const game = decodeGame(location.hash) || sanitizeGame({ type: 'fangen' });
const $ = (id) => document.getElementById(id);
const canvas = $('stage');
const ctx = canvas.getContext('2d');
const ui = {
  hud: $('hud'), score: $('hud-score'), extra: $('hud-extra'), pause: $('pause'),
  screen: $('screen'), kicker: $('screen-kicker'), emoji: $('screen-emoji'), title: $('screen-title'),
  text: $('screen-text'), best: $('screen-best'), hint: $('screen-hint'), start: $('start'), share: $('share'),
  quiz: $('quiz'), quizProgress: $('quiz-progress'), quizBar: $('quiz-timer-bar'), quizQuestion: $('quiz-question'), quizAnswers: $('quiz-answers')
};

const root = document.documentElement.style;
root.setProperty('--bg1', game.colors.bg1);
root.setProperty('--bg2', game.colors.bg2);
root.setProperty('--accent', game.colors.accent);
document.title = `${game.title} – Jarvis-Spiel`;

const level = { leicht: 0.75, mittel: 1, schwer: 1.35 }[game.difficulty];
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const MAX_DT = 1 / 20;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const rand = (min, max) => min + Math.random() * (max - min);

// --- Storage (best score per game) ----------------------------------------

const bestKey = `jarvis-game-best:${location.hash.slice(1, 120)}`;
function loadBest() {
  try {
    return Number(localStorage.getItem(bestKey)) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    localStorage.setItem(bestKey, String(value));
  } catch {
    // storage unavailable
  }
}

// --- Sound -----------------------------------------------------------------

let audio = null;
function beep(frequency, duration = 0.12, type = 'sine', volume = 0.12) {
  if (!audio) return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}
const sfx = {
  good: () => beep(880, 0.1, 'triangle'),
  bonus: () => { beep(988, 0.08, 'triangle'); setTimeout(() => beep(1319, 0.12, 'triangle'), 70); },
  bad: () => beep(140, 0.25, 'sawtooth', 0.1),
  jump: () => beep(520, 0.09, 'square', 0.06),
  over: () => { beep(392, 0.2); setTimeout(() => beep(262, 0.35), 180); }
};

// --- Canvas ----------------------------------------------------------------

let W = 0;
let H = 0;
let unit = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  unit = Math.min(W, H);
  current?.resize?.();
}
window.addEventListener('resize', resize);

function drawEmoji(emoji, x, y, size, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y);
  ctx.globalAlpha = 1;
}

// Floating background particles in the accent color.
const stars = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.5, 2), s: rand(0.01, 0.05) }));
function drawBackground(dt, speed = 1) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = game.colors.accent;
  for (const star of stars) {
    star.y += star.s * dt * speed;
    if (star.y > 1) star.y -= 1;
    ctx.globalAlpha = 0.25 + star.r / 6;
    ctx.beginPath();
    ctx.arc(star.x * W, star.y * H, star.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const popups = [];
function popup(text, x, y, color = game.colors.accent) {
  popups.push({ text, x, y, life: 0.8, color });
}
function drawPopups(dt) {
  for (let i = popups.length - 1; i >= 0; i -= 1) {
    const p = popups[i];
    p.life -= dt;
    p.y -= 40 * dt;
    if (p.life <= 0) {
      popups.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.font = `700 ${Math.round(unit * 0.05)}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

let shake = 0;
function applyShake(dt) {
  if (shake <= 0) return;
  shake -= dt;
  ctx.translate(rand(-6, 6), rand(-6, 6));
}

// --- Input -----------------------------------------------------------------

const input = { x: null, y: null, down: false, keys: new Set() };
canvas.addEventListener('pointerdown', (event) => {
  input.down = true;
  input.x = event.clientX;
  input.y = event.clientY;
  if (state === 'playing') current.tap?.(event.clientX, event.clientY);
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' || input.down) {
    input.x = event.clientX;
    input.y = event.clientY;
  }
});
window.addEventListener('pointerup', () => {
  input.down = false;
});
window.addEventListener('keydown', (event) => {
  input.keys.add(event.key);
  if (state === 'playing' && [' ', 'ArrowUp', 'w'].includes(event.key)) {
    event.preventDefault();
    current.jump?.();
  }
  if (event.key === 'Escape' || event.key === 'p') togglePause();
  if (event.key === 'Enter' && state !== 'playing') start();
});
window.addEventListener('keyup', (event) => input.keys.delete(event.key));

// Keyboard steering adds to touch steering for the free-moving games.
function steer(player, speed, dt, vertical = false) {
  let dx = 0;
  let dy = 0;
  if (input.keys.has('ArrowLeft') || input.keys.has('a')) dx -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('d')) dx += 1;
  if (vertical && (input.keys.has('ArrowUp') || input.keys.has('w'))) dy -= 1;
  if (vertical && (input.keys.has('ArrowDown') || input.keys.has('s'))) dy += 1;
  if (dx || dy) {
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    input.x = null;
  } else if (input.x !== null) {
    player.x += (input.x - player.x) * Math.min(1, dt * 14);
    if (vertical && input.y !== null) player.y += (input.y - player.y) * Math.min(1, dt * 14);
  }
}

// --- Game types --------------------------------------------------------------

const hit = (a, b, radius) => Math.hypot(a.x - b.x, a.y - b.y) < radius;

function makeFallingGame({ dodge }) {
  let player;
  let items;
  let spawnIn;
  let lives;
  let invulnerable;
  let elapsed;
  return {
    help: dodge
      ? 'Weiche allem aus, was herunterfällt! Sammle Bonus-Sachen für Extrapunkte. Steuern: Finger ziehen oder Pfeiltasten.'
      : 'Fang alles Gute auf und weiche dem Schlechten aus! Steuern: Finger ziehen oder Pfeiltasten.',
    reset() {
      player = { x: W / 2, y: H * (dodge ? 0.75 : 0.86) };
      items = [];
      spawnIn = 0.5;
      lives = 3;
      invulnerable = 0;
      elapsed = 0;
      score = 0;
    },
    resize() {
      if (player) player.y = Math.min(player.y, H * 0.9);
    },
    update(dt) {
      elapsed += dt;
      const speedUp = 1 + elapsed / 45;
      const size = unit * 0.09;
      steer(player, W * 0.9, dt, dodge);
      player.x = Math.max(size / 2, Math.min(W - size / 2, player.x));
      player.y = dodge ? Math.max(H * 0.25, Math.min(H - size, player.y)) : H * 0.86;
      if (dodge) score += dt * 10;
      invulnerable = Math.max(0, invulnerable - dt);

      spawnIn -= dt;
      if (spawnIn <= 0) {
        const badChance = dodge ? 0.82 : 0.28 * level;
        const bad = Math.random() < badChance;
        items.push({
          x: rand(size, W - size), y: -size,
          vy: H * rand(0.22, 0.34) * level * speedUp,
          emoji: pick(bad ? game.bad : game.good), bad,
          size: size * (bad && dodge ? rand(0.8, 1.4) : 0.85),
          spin: rand(-2, 2), angle: 0
        });
        spawnIn = Math.max(0.18, (dodge ? 0.55 : 0.75) / (level * speedUp));
      }

      for (let i = items.length - 1; i >= 0; i -= 1) {
        const item = items[i];
        item.y += item.vy * dt;
        item.angle += item.spin * dt;
        if (item.y > H + item.size) {
          items.splice(i, 1);
          continue;
        }
        if (!hit(item, player, (item.size + size) * 0.42)) continue;
        items.splice(i, 1);
        if (item.bad) {
          if (invulnerable > 0) continue;
          lives -= 1;
          invulnerable = 1;
          shake = 0.3;
          sfx.bad();
          popup('-1 ❤️', player.x, player.y - size, '#ff4d6a');
          if (lives <= 0) gameOver();
        } else {
          const points = dodge ? 25 : 1;
          score += points;
          sfx[dodge ? 'bonus' : 'good']();
          popup(`+${points}`, item.x, item.y);
        }
      }
      setHud(Math.floor(score), '❤️'.repeat(Math.max(0, lives)));
    },
    draw() {
      const size = unit * 0.09;
      for (const item of items) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.angle);
        drawEmoji(item.emoji, 0, 0, item.size);
        ctx.restore();
      }
      const blink = invulnerable > 0 && Math.floor(invulnerable * 10) % 2 === 0;
      drawEmoji(game.player, player.x, player.y, size * 1.1, blink ? 0.35 : 1);
    }
  };
}

function makeRunner() {
  let player;
  let obstacles;
  let coins;
  let spawnIn;
  let coinIn;
  let lives;
  let invulnerable;
  let speed;
  let jumps;
  const groundY = () => H * 0.78;
  return {
    help: 'Tippe auf den Bildschirm (oder Leertaste), um zu springen – zweimal tippen für einen Doppelsprung. Spring über Hindernisse und sammle Münzen!',
    reset() {
      player = { x: W * 0.22, y: groundY(), vy: 0 };
      obstacles = [];
      coins = [];
      spawnIn = 1.2;
      coinIn = 2;
      lives = 3;
      invulnerable = 0;
      speed = W * 0.38 * level;
      jumps = 0;
      score = 0;
    },
    resize() {
      if (!player) return;
      player.x = W * 0.22;
      player.y = Math.min(player.y, groundY());
    },
    jump() {
      if (jumps >= 2) return;
      player.vy = -unit * (jumps === 0 ? 1.55 : 1.3);
      jumps += 1;
      sfx.jump();
    },
    tap() {
      this.jump();
    },
    update(dt) {
      const size = unit * 0.1;
      speed += W * 0.012 * dt * level;
      score += dt * speed / 40;
      player.vy += unit * 4.2 * dt;
      player.y += player.vy * dt;
      if (player.y >= groundY()) {
        player.y = groundY();
        player.vy = 0;
        jumps = 0;
      }
      invulnerable = Math.max(0, invulnerable - dt);

      spawnIn -= dt;
      if (spawnIn <= 0) {
        obstacles.push({ x: W + size, y: groundY(), emoji: pick(game.bad), size: size * rand(0.85, 1.15) });
        spawnIn = rand(0.9, 1.8) / Math.sqrt(level * (speed / (W * 0.38)));
      }
      coinIn -= dt;
      if (coinIn <= 0) {
        coins.push({ x: W + size, y: groundY() - rand(size, size * 3), emoji: pick(game.good) });
        coinIn = rand(1.2, 2.6);
      }

      for (let i = obstacles.length - 1; i >= 0; i -= 1) {
        const ob = obstacles[i];
        ob.x -= speed * dt;
        if (ob.x < -size) obstacles.splice(i, 1);
        else if (invulnerable <= 0 && hit(ob, player, (ob.size + size) * 0.38)) {
          lives -= 1;
          invulnerable = 1.2;
          shake = 0.3;
          sfx.bad();
          popup('-1 ❤️', player.x, player.y - size, '#ff4d6a');
          if (lives <= 0) gameOver();
        }
      }
      for (let i = coins.length - 1; i >= 0; i -= 1) {
        const coin = coins[i];
        coin.x -= speed * dt;
        if (coin.x < -size) coins.splice(i, 1);
        else if (hit(coin, player, size * 0.8)) {
          coins.splice(i, 1);
          score += 20;
          sfx.bonus();
          popup('+20', coin.x, coin.y);
        }
      }
      setHud(Math.floor(score), '❤️'.repeat(Math.max(0, lives)));
    },
    draw() {
      const size = unit * 0.1;
      ctx.strokeStyle = game.colors.accent;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, groundY() + size * 0.5);
      ctx.lineTo(W, groundY() + size * 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      for (const coin of coins) drawEmoji(coin.emoji, coin.x, coin.y, size * 0.7);
      for (const ob of obstacles) drawEmoji(ob.emoji, ob.x, ob.y, ob.size);
      const blink = invulnerable > 0 && Math.floor(invulnerable * 10) % 2 === 0;
      drawEmoji(game.player, player.x, player.y, size * 1.1, blink ? 0.35 : 1);
    }
  };
}

function makeReaction() {
  const DURATION = 30;
  let targets;
  let spawnIn;
  let timeLeft;
  let combo;
  return {
    help: `Tippe so schnell wie möglich auf alles Gute, bevor es verschwindet – aber nicht auf ${game.bad.join(' ')}! Du hast ${DURATION} Sekunden.`,
    reset() {
      targets = [];
      spawnIn = 0.3;
      timeLeft = DURATION;
      combo = 0;
      score = 0;
    },
    tap(x, y) {
      for (let i = targets.length - 1; i >= 0; i -= 1) {
        const target = targets[i];
        if (!hit(target, { x, y }, target.size * 0.65)) continue;
        targets.splice(i, 1);
        if (target.bad) {
          score = Math.max(0, score - 3);
          combo = 0;
          shake = 0.25;
          sfx.bad();
          popup('-3', x, y, '#ff4d6a');
        } else {
          combo += 1;
          const points = 1 + Math.floor(combo / 5);
          score += points;
          sfx.good();
          popup(combo >= 5 ? `+${points} Combo ${combo}` : `+${points}`, x, y);
        }
        return;
      }
      combo = 0;
    },
    update(dt) {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        gameOver();
        return;
      }
      spawnIn -= dt;
      const progress = 1 - timeLeft / DURATION;
      if (spawnIn <= 0) {
        const size = unit * rand(0.11, 0.15);
        const bad = Math.random() < 0.2 * level;
        targets.push({ x: rand(size, W - size), y: rand(H * 0.18 + size, H - size), size, bad, emoji: pick(bad ? game.bad : game.good), life: (1.6 - progress * 0.7) / level, age: 0 });
        spawnIn = (0.65 - progress * 0.35) / level;
      }
      for (let i = targets.length - 1; i >= 0; i -= 1) {
        targets[i].age += dt;
        if (targets[i].age >= targets[i].life) {
          if (!targets[i].bad) combo = 0;
          targets.splice(i, 1);
        }
      }
      setHud(score, `⏱ ${Math.ceil(timeLeft)}`);
    },
    draw() {
      for (const target of targets) {
        const t = target.age / target.life;
        const scale = t < 0.15 ? t / 0.15 : 1 - Math.max(0, t - 0.8) / 0.2;
        ctx.strokeStyle = target.bad ? '#ff4d6a' : game.colors.accent;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.size * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - t));
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawEmoji(target.emoji, target.x, target.y, target.size * Math.max(0.1, scale));
      }
    }
  };
}

function makeMemory() {
  let cards;
  let open;
  let moves;
  let matched;
  let elapsed;
  let lockUntil;
  let layout;
  const pairs = { leicht: 6, mittel: 8, schwer: 10 }[game.difficulty];
  const fallback = ['🍎', '🚗', '🐶', '🎸', '⚽', '🌈', '🍕', '🦄', '🎁', '🌵', '🐙', '🎩'];
  function computeLayout() {
    const count = cards.length;
    let best = null;
    for (let cols = 2; cols <= count; cols += 1) {
      const rows = Math.ceil(count / cols);
      const size = Math.min((W - 24) / cols, (H - 120) / rows) - 10;
      if (!best || size > best.size) best = { cols, rows, size };
    }
    const gap = 10;
    const totalW = best.cols * (best.size + gap) - gap;
    const totalH = best.rows * (best.size + gap) - gap;
    layout = { ...best, gap, left: (W - totalW) / 2, top: Math.max(80, (H - totalH) / 2 + 20) };
  }
  function cardRect(index) {
    const col = index % layout.cols;
    const row = Math.floor(index / layout.cols);
    return { x: layout.left + col * (layout.size + layout.gap), y: layout.top + row * (layout.size + layout.gap), s: layout.size };
  }
  return {
    help: 'Finde alle Paare! Tippe zwei Karten an – passen sie zusammen, bleiben sie offen. Je weniger Züge, desto mehr Punkte.',
    reset() {
      const symbols = [...new Set([...game.good, ...game.bad, ...fallback])].slice(0, pairs);
      cards = [...symbols, ...symbols].map((emoji) => ({ emoji, open: false, done: false, flip: 0 }));
      for (let i = cards.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      open = [];
      moves = 0;
      matched = 0;
      elapsed = 0;
      lockUntil = 0;
      score = 0;
      computeLayout();
    },
    resize() {
      if (cards) computeLayout();
    },
    tap(x, y) {
      if (elapsed < lockUntil) return;
      const index = cards.findIndex((card, i) => {
        const r = cardRect(i);
        return x >= r.x && x <= r.x + r.s && y >= r.y && y <= r.y + r.s;
      });
      const card = cards[index];
      if (!card || card.open || card.done) return;
      card.open = true;
      open.push(card);
      beep(660, 0.05, 'triangle', 0.06);
      if (open.length < 2) return;
      moves += 1;
      const [a, b] = open;
      if (a.emoji === b.emoji) {
        a.done = b.done = true;
        matched += 1;
        sfx.bonus();
        open = [];
        if (matched === pairs) {
          score = Math.max(10, Math.round(1000 * level - moves * 15 - elapsed * 3));
          setTimeout(gameOver, 600);
        }
      } else {
        lockUntil = elapsed + 0.8;
        setTimeout(() => {
          a.open = b.open = false;
          open = [];
        }, 800);
      }
    },
    update(dt) {
      elapsed += dt;
      for (const card of cards) card.flip += ((card.open || card.done ? 1 : 0) - card.flip) * Math.min(1, dt * 12);
      setHud(`Züge ${moves}`, `${matched}/${pairs} · ${Math.floor(elapsed)} s`);
    },
    draw() {
      cards.forEach((card, i) => {
        const r = cardRect(i);
        const cx = r.x + r.s / 2;
        const showFace = card.flip > 0.5;
        const squeeze = Math.abs(Math.cos(card.flip * Math.PI));
        ctx.save();
        ctx.translate(cx, r.y + r.s / 2);
        ctx.scale(Math.max(0.05, squeeze), 1);
        ctx.fillStyle = showFace ? 'rgba(255,255,255,0.92)' : game.colors.accent;
        ctx.globalAlpha = card.done ? 0.55 : 1;
        roundRect(-r.s / 2, -r.s / 2, r.s, r.s, r.s * 0.16);
        ctx.fill();
        if (!showFace) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#000';
          ctx.font = `700 ${r.s * 0.4}px Orbitron, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, r.s * 0.04);
        }
        ctx.globalAlpha = 1;
        if (showFace) drawEmoji(card.emoji, 0, r.s * 0.03, r.s * 0.58, card.done ? 0.6 : 1);
        ctx.restore();
      });
    }
  };
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeQuiz() {
  const fallbackQuestions = [
    { q: 'Wie viele Kontinente gibt es?', a: ['5', '6', '7', '8'], c: 2 },
    { q: 'Welcher Planet ist der Sonne am nächsten?', a: ['Venus', 'Merkur', 'Mars', 'Erde'], c: 1 },
    { q: 'Wie viele Beine hat eine Spinne?', a: ['6', '8', '10', '12'], c: 1 },
    { q: 'Was ist die Hauptstadt von Italien?', a: ['Mailand', 'Neapel', 'Rom', 'Venedig'], c: 2 },
    { q: 'Wie viele Minuten hat eine Stunde?', a: ['30', '60', '90', '100'], c: 1 }
  ];
  const questions = game.questions?.length ? game.questions : fallbackQuestions;
  const seconds = { leicht: 20, mittel: 15, schwer: 10 }[game.difficulty];
  let index;
  let timeLeft;
  let answered;
  let correctCount;
  function show() {
    const item = questions[index];
    answered = false;
    timeLeft = seconds;
    ui.quizProgress.textContent = `Frage ${index + 1}/${questions.length}`;
    ui.quizQuestion.textContent = item.q;
    ui.quizAnswers.replaceChildren(...item.a.map((answer, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiz-answer';
      button.textContent = answer;
      button.addEventListener('click', () => choose(i));
      return button;
    }));
  }
  function choose(choice) {
    if (answered || state !== 'playing') return;
    answered = true;
    const item = questions[index];
    const buttons = [...ui.quizAnswers.children];
    buttons.forEach((button, i) => {
      button.disabled = true;
      if (i === item.c) button.classList.add('correct');
      else if (i === choice) button.classList.add('wrong');
    });
    if (choice === item.c) {
      correctCount += 1;
      score += 100 + Math.round((timeLeft / seconds) * 50);
      sfx.bonus();
    } else {
      sfx.bad();
    }
    setHud(score, `✔ ${correctCount}`);
    setTimeout(() => {
      if (state !== 'playing') return;
      index += 1;
      if (index >= questions.length) gameOver(`${correctCount} von ${questions.length} richtig!`);
      else show();
    }, 1300);
  }
  return {
    help: `${questions.length} Fragen, ${seconds} Sekunden pro Frage. Je schneller du richtig antwortest, desto mehr Punkte!`,
    usesDom: true,
    reset() {
      index = 0;
      correctCount = 0;
      score = 0;
      ui.quiz.hidden = false;
      setHud(0, '✔ 0');
      show();
    },
    update(dt) {
      if (answered) return;
      timeLeft -= dt;
      ui.quizBar.style.transform = `scaleX(${Math.max(0, timeLeft / seconds)})`;
      if (timeLeft <= 0) choose(-1);
    },
    draw() {}
  };
}

const factories = {
  fangen: () => makeFallingGame({ dodge: false }),
  ausweichen: () => makeFallingGame({ dodge: true }),
  springen: makeRunner,
  reaktion: makeReaction,
  memory: makeMemory,
  quiz: makeQuiz
};

// --- Game loop & screens -------------------------------------------------------

let current = factories[game.type]();
let state = 'menu';
let score = 0;
let last = 0;

function setHud(main, extra) {
  ui.score.textContent = String(main);
  ui.extra.textContent = extra || '';
}

function showScreen({ kicker, title, text, button, hint }) {
  ui.kicker.textContent = kicker;
  ui.emoji.textContent = game.player;
  ui.title.textContent = title;
  ui.text.textContent = text;
  const best = loadBest();
  ui.best.textContent = best ? `🏆 Bestwert: ${best}` : '';
  ui.start.textContent = button;
  ui.hint.textContent = hint || '';
  ui.screen.hidden = false;
  ui.hud.hidden = state !== 'paused';
  ui.start.focus();
}

function start() {
  if (state === 'paused') {
    state = 'playing';
    ui.screen.hidden = true;
    last = performance.now();
    return;
  }
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      audio = null;
    }
  }
  audio?.resume();
  popups.length = 0;
  state = 'playing';
  ui.screen.hidden = true;
  ui.hud.hidden = false;
  ui.quiz.hidden = true;
  current.reset();
  last = performance.now();
}

function gameOver(summary) {
  if (state !== 'playing') return;
  state = 'over';
  sfx.over();
  ui.quiz.hidden = true;
  const final = Math.floor(score);
  const best = loadBest();
  const record = final > best;
  if (record) saveBest(final);
  showScreen({
    kicker: record ? 'Neuer Rekord!' : 'Spiel vorbei',
    title: `${final} Punkte`,
    text: summary || (record ? 'Stark! Das ist dein bester Lauf bisher.' : 'Versuch es gleich noch einmal!'),
    button: 'Nochmal',
    hint: game.title
  });
}

function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showScreen({ kicker: 'Pause', title: game.title, text: current.help, button: 'Weiter' });
  } else if (state === 'paused') {
    start();
  }
}

function loop(now) {
  const dt = Math.min(MAX_DT, (now - last) / 1000 || 0);
  last = now;
  if (state === 'playing') current.update(dt);
  if (!current.usesDom || state !== 'playing') {
    ctx.save();
    applyShake(dt);
    drawBackground(dt, state === 'playing' ? 1 : 0.3);
    if (state !== 'menu' && !current.usesDom) current.draw();
    drawPopups(dt);
    ctx.restore();
  } else {
    drawBackground(dt, 0.3);
  }
  requestAnimationFrame(loop);
}

ui.start.addEventListener('click', start);
ui.pause.addEventListener('click', togglePause);
ui.share.addEventListener('click', async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: game.title, text: `Spiel „${game.title}“ – gebaut von Jarvis`, url });
    else {
      await navigator.clipboard.writeText(url);
      ui.hint.textContent = 'Link kopiert – schick ihn deinen Freunden!';
    }
  } catch {
    // share sheet closed
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause();
});

// A new version (e.g. Jarvis applied a change) only changes the #fragment, which
// browsers don't reload on their own.
window.addEventListener('hashchange', () => location.reload());

resize();
showScreen({ kicker: 'Ein Jarvis-Spiel', title: game.title, text: current.help, button: 'Spielen' });
requestAnimationFrame((now) => {
  last = now;
  loop(now);
});
