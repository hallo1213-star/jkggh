import { bestMove, initial, legal, make } from '../../public/chess.js';
const assert = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };
const perft = (s, d) => (d === 0 ? 1 : legal(s).reduce((n, m) => n + perft(make(s, m), d - 1), 0));
const s0 = initial();
assert(perft(s0, 1) === 20 && perft(s0, 2) === 400, 'perft 1–2 from the start position (20, 400)');
assert(perft(s0, 3) === 8902, 'perft 3 = 8902 (checks, captures, legality)');
// "Kiwipete" position tests castling, en passant, promotion: perft(1) = 48, perft(2) = 2039
const kiwi = 'r...k..r p.ppqpb. bn..pnp. ...PN... .p..P... ..N..Q.p PPPBBPPP R...K..R'.split(' ').join('').split('').map((c) => (c === '.' ? null : c));
const sk = { board: kiwi, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1 };
assert(perft(sk, 1) === 48 && perft(sk, 2) === 2039, 'Kiwipete perft 1–2 (48, 2039): castling, en passant, promotion');
// engine takes a free queen
const hang = { board: Array(64).fill(null), turn: 'b', castle: { K: false, Q: false, k: false, q: false }, ep: -1 };
hang.board[4] = 'k'; hang.board[60] = 'K'; hang.board[27] = 'Q'; hang.board[24] = 'r';
const m = bestMove(hang, 'mittel');
assert(m && m.to === 27, 'engine captures a hanging queen');
// mate in one for black is found
const mate = { board: Array(64).fill(null), turn: 'b', castle: { K: false, Q: false, k: false, q: false }, ep: -1 };
mate.board[0] = 'k'; mate.board[63] = 'K'; mate.board[54] = 'P'; mate.board[55] = 'P'; mate.board[8] = 'r';
const mm = bestMove(mate, 'mittel');
assert(mm && mm.to === 56, 'engine finds back-rank mate');
