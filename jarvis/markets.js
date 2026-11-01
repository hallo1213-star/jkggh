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

// --- Price charts ("Zeig mir den Bitcoin-Chart") -------------------------------------
const ALIASES = {
  dax: '^GDAXI', 'S&P 500': '^GSPC', 'sp500': '^GSPC', 's&p': '^GSPC', nasdaq: '^IXIC', 'dow jones': '^DJI', dow: '^DJI',
  bitcoin: 'BTC-USD', btc: 'BTC-USD', ethereum: 'ETH-USD', eth: 'ETH-USD', solana: 'SOL-USD', gold: 'GC=F', silber: 'SI=F', öl: 'BZ=F', oel: 'BZ=F', brent: 'BZ=F',
  euro: 'EURUSD=X', 'euro dollar': 'EURUSD=X', apple: 'AAPL', tesla: 'TSLA', nvidia: 'NVDA', microsoft: 'MSFT', amazon: 'AMZN', google: 'GOOGL', alphabet: 'GOOGL', meta: 'META', sap: 'SAP.DE', siemens: 'SIE.DE', allianz: 'ALV.DE', bmw: 'BMW.DE', mercedes: 'MBG.DE', volkswagen: 'VOW3.DE', adidas: 'ADS.DE'
};
export const RANGES = { '1d': '5m', '5d': '30m', '1mo': '1d', '6mo': '1d', '1y': '1wk', '5y': '1mo' };

export function resolveSymbol(asset) {
  const wanted = String(asset ?? '').trim();
  const alias = ALIASES[wanted.toLowerCase()];
  if (alias) return alias;
  if (/^[\^A-Za-z0-9.=-]{1,15}$/.test(wanted)) return wanted.toUpperCase();
  throw new Error(`Für „${wanted}“ kenne ich kein Kürzel. Sag z. B. Bitcoin, DAX, Apple oder ein Börsenkürzel wie TSLA.`);
}

export async function getChart(asset, range = '1mo', { fetchImpl = fetch } = {}) {
  const symbol = resolveSymbol(asset);
  const span = RANGES[range] ? range : '1mo';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${span}&interval=${RANGES[span]}`;
  const response = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (Jarvis-Assistant)', accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Kursdaten nicht erreichbar (Status ${response.status}).`);
  const data = await response.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`Zu „${asset}“ gibt es keine Kursdaten.`);
  const times = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const points = times.map((t, i) => [t * 1000, closes[i]]).filter(([, v]) => typeof v === 'number');
  if (points.length < 2) throw new Error('Zu wenige Kursdaten für einen Chart.');
  const first = points[0][1];
  const last = points.at(-1)[1];
  return {
    symbol,
    name: result.meta?.longName || result.meta?.shortName || symbol,
    currency: result.meta?.currency || '',
    range: span,
    points: points.slice(-400).map(([t, v]) => [t, Math.round(v * 10000) / 10000]),
    last: Math.round(last * (last < 10 ? 10000 : 100)) / (last < 10 ? 10000 : 100),
    changePct: Math.round(((last - first) / first) * 1000) / 10,
    high: Math.round(Math.max(...points.map((p) => p[1])) * 100) / 100,
    low: Math.round(Math.min(...points.map((p) => p[1])) * 100) / 100
  };
}
