// Packs a JSON value into a URL-safe string for a link's #fragment and back.
// Used by games and websites so they need no storage and can be shared.
export function encodeJson(value) {
  let binary = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeJson(fragment) {
  try {
    const base64 = String(fragment).replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
  } catch {
    return null;
  }
}
