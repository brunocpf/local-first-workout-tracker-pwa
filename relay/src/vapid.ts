// VAPID (RFC 8292) for an empty-body push: no payload means no RFC 8291 encryption is needed, and the service
// worker shows a fixed "Rest over" notification. Keys are base64url raw P-256 values from scripts/generate-vapid.mjs.

const enc = new TextEncoder();

export const toB64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes = typeof data === "string" ? enc.encode(data) : new Uint8Array(data);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function importSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const raw = fromB64url(publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: toB64url(raw.slice(1, 33)), y: toB64url(raw.slice(33)), d: privateKey },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** `Authorization` header value for a push to `endpoint`. The JWT audience is the endpoint's origin. */
export async function vapidAuthorization(
  endpoint: string,
  key: CryptoKey,
  publicKey: string,
  subject: string,
  now = Date.now(),
): Promise<string> {
  const header = toB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = toB64url(
    JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 60 * 60, sub: subject }),
  );
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${toB64url(signature)}, k=${publicKey}`;
}
