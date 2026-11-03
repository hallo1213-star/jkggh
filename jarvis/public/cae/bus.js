// Command Animation Engine – event bus + state. Events come only from real
// Jarvis messages (server status, transcripts, function calls, job progress).
export const EV = Object.freeze({
  COMMAND_RECEIVED: 'COMMAND_RECEIVED',     // user said something (real transcript)
  COMMAND_CLASSIFIED: 'COMMAND_CLASSIFIED', // Jarvis chose a real function
  ACTION_STARTED: 'ACTION_STARTED',
  ACTION_PROGRESS: 'ACTION_PROGRESS',
  ACTION_COMPLETED: 'ACTION_COMPLETED',     // only after the function really finished
  ACTION_FAILED: 'ACTION_FAILED',
  AGENT_STATE: 'AGENT_STATE'                // listening | thinking | speaking | offline | error
});

const listeners = new Map();
export const state = { phase: 'offline', lastCommand: '', actions: new Map(), log: [] };

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type)?.delete(fn);
}
export function emit(type, payload = {}) {
  const event = { type, at: Date.now(), ...payload };
  state.log.push({ type, tool: payload.tool, id: payload.id, at: event.at });
  if (state.log.length > 60) state.log.shift();
  for (const fn of [...(listeners.get(type) || []), ...(listeners.get('*') || [])]) {
    try { fn(event); } catch (error) { console.warn('[Animation] Listener-Fehler', error); }
  }
  return event;
}
export function snapshot() {
  return { phase: state.phase, lastCommand: state.lastCommand, actions: [...state.actions.values()].map((a) => ({ id: a.id, tool: a.tool, status: a.status, progress: a.progress, module: a.module })), log: state.log.slice(-20) };
}
