// Market overview for "Was macht der Aktienmarkt?": real prices from Yahoo
// Finance's public chart data (no key; delayed by about 15 minutes) plus the
// day's market headlines. Jarvis gives no investment advice.
import { searchNews } from './knowledge.js';

export const INSTRUMENTS = [
  { symbol: '^GDAXI', name: 'DAX', unit: 'Punkte' },
  { symbol: '^GSPC', name: 'S&P 500', unit: 'Punkte' },
  { symbol: '^IXIC', name: 'Nasdaq', unit: 'Punkte' },
  { symbol: 'BZ=F', name: 'Öl (Brent)', unit: '$' },
  { symbol: 'GC=F', name: 'Gold', unit: '$' },
  { symbol: 'EURUSD=X', name: 'Euro in Dollar', unit: '$' },
  { symbol: 'BTC-USD', name: 'Bitcoin', unit: '$' }
];

const CACHE_MS = 3 * 60 * 1000;
let cache = { at: 0, value: null };

async function quote(instrument, fetchImpl) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.symbol)}?range=5d&interval=1d`;
  const response = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (Jarvis-Assistant)', accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Status ${response.status}`);
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const meta = result?.meta || {};
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === 'number');
  const price = typeof meta.regularMarketPrice === 'number' ? meta.regularMarketPrice : closes.at(-1);
  if (typeof price !== 'number') throw new Error('keine Kursdaten');
  const previous = closes.length >= 2 ? closes.at(-2) : meta.previousClose;
  const weekStart = typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : closes[0];
  const pct = (from) => (typeof from === 'number' && from ? Math.round(((price - from) / from) * 1000) / 10 : null);
  const time = typeof meta.regularMarketTime === 'number' ? new Date(meta.regularMarketTime * 1000).toISOString() : null;
  return { name: instrument.name, symbol: instrument.symbol, unit: instrument.unit, kurs: Math.round(price * (price < 10 ? 10000 : 100)) / (price < 10 ? 10000 : 100), heuteProzent: pct(previous), wocheProzent: pct(weekStart), stand: time };
}

export async function getMarkets({ fetchImpl = fetch } = {}) {
  if (cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [quotes, news] = await Promise.all([
    Promise.allSettled(INSTRUMENTS.map((instrument) => quote(instrument, fetchImpl))),
    searchNews('Börse DAX Aktien', { fetchImpl, limit: 5, days: 1 }).catch(() => null)
  ]);
  const werte = quotes.filter((q) => q.status === 'fulfilled').map((q) => q.value);
  if (!werte.length) throw new Error('Die Börsendaten sind gerade nicht erreichbar.');
  const value = { werte, schlagzeilen: news?.meldungen || [], quelle: 'Yahoo Finance (ca. 15 Min. verzögert), Google News', abgerufen: new Date().toISOString() };
  cache = { at: Date.now(), value };
  return value;
}
