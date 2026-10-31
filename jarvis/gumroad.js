// Real sales numbers from Gumroad (a shop for digital products). Read-only:
// Gumroad's API cannot create products, so uploading stays a step for the
// user; Jarvis reads products, sales counts and revenue to show real income.
// Setup: gumroad.com → Settings → Advanced → Applications → create an app →
// "Generate access token" → GUMROAD_ACCESS_TOKEN at Render.
const API = 'https://api.gumroad.com/v2';
const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, value: null };

export function gumroadConfigured() {
  return Boolean(process.env.GUMROAD_ACCESS_TOKEN?.trim());
}

export async function gumroadProducts({ fetchImpl = fetch, fresh = false } = {}) {
  if (!gumroadConfigured()) return null;
  if (!fresh && cache.value && Date.now() - cache.at < CACHE_MS) return cache.value;
  const url = `${API}/products?access_token=${encodeURIComponent(process.env.GUMROAD_ACCESS_TOKEN.trim())}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || data.success === false) throw new Error(`Gumroad lehnt den Zugang ab${data.message ? ` (${data.message})` : ''}. Bitte GUMROAD_ACCESS_TOKEN prüfen.`);
  if (!response.ok) throw new Error(`Gumroad: HTTP ${response.status}`);
  const products = (data.products || []).map((product) => ({
    id: String(product.id || ''),
    name: String(product.name || '').slice(0, 120),
    url: /^https:\/\//.test(product.short_url || '') ? product.short_url : '',
    published: product.published === true,
    price: String(product.formatted_price || '').slice(0, 20),
    sales: Number(product.sales_count) || 0,
    revenueUsd: Math.round(Number(product.sales_usd_cents) || 0) / 100
  }));
  const value = {
    products,
    totalUsd: Math.round(products.reduce((sum, p) => sum + p.revenueUsd, 0) * 100) / 100,
    totalSales: products.reduce((sum, p) => sum + p.sales, 0),
    checkedAt: new Date().toISOString()
  };
  cache = { at: Date.now(), value };
  return value;
}
