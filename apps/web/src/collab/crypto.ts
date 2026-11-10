/**
 * End-to-end encryption for live sessions: AES-GCM with a random 128-bit key that lives
 * only in the share link's #fragment. The relay server only ever sees ciphertext.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export interface RoomSecret {
  /** Public room id the relay routes on. */
  readonly roomId: string;
  /** Base64url AES key; never sent to the server. */
  readonly key: string;
}

export function newRoomSecret(): RoomSecret {
  return {
    roomId: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    key: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  };
}

export function importRoomKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64Url(key), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypts JSON as [12-byte IV][ciphertext]. */
export async function seal(key: CryptoKey, message: unknown): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(message));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const out = new Uint8Array(iv.length + cipher.length);
  out.set(iv);
  out.set(cipher, iv.length);
  return out;
}

/** Decrypts a sealed frame; returns null if it was tampered with or uses another key. */
export async function open(key: CryptoKey, frame: ArrayBuffer | Uint8Array): Promise<unknown> {
  const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  if (bytes.length < 13) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as unknown;
  } catch {
    return null;
  }
}

export function liveLink(origin: string, secret: RoomSecret): string {
  return `${origin}/live#room=${secret.roomId}&key=${secret.key}`;
}

/** Reads `room` and `key` from a URL fragment. */
export function parseRoomSecret(hash: string): RoomSecret | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const roomId = params.get("room") ?? "";
  const key = params.get("key") ?? "";
  return /^[A-Za-z0-9_-]{16,64}$/.test(roomId) && /^[A-Za-z0-9_-]{22}$/.test(key) ? { roomId, key } : null;
}
