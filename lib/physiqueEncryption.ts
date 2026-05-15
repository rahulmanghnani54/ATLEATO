import * as SecureStore from 'expo-secure-store';
import * as ImageManipulator from 'expo-image-manipulator';

export interface EncryptedBlob {
  iv: Uint8Array;       // 12-byte GCM nonce
  ciphertext: Uint8Array;
}

const SECURE_KEY_PREFIX = 'physique_enc_key_';

/**
 * Load the AES-256-GCM key for this user from SecureStore.
 * Generates and persists a new key on first call.
 * The key never leaves the device.
 */
export async function getPhysiqueKey(userId: string): Promise<CryptoKey> {
  const storeKey = `${SECURE_KEY_PREFIX}${userId}`;
  const stored = await SecureStore.getItemAsync(storeKey);

  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  // First use — generate a random 256-bit key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
  await SecureStore.setItemAsync(storeKey, b64);

  // Re-import as non-extractable for runtime use
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * AES-256-GCM encrypt. Returns iv (12 bytes) + ciphertext.
 */
export async function encryptPhoto(key: CryptoKey, jpegBytes: Uint8Array): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Ensure we pass a plain ArrayBuffer to satisfy TypeScript's BufferSource constraint
  const data = jpegBytes.buffer.slice(jpegBytes.byteOffset, jpegBytes.byteOffset + jpegBytes.byteLength) as ArrayBuffer;
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { iv, ciphertext: new Uint8Array(cipherBuf) };
}

/**
 * AES-256-GCM decrypt. Throws if key or iv is wrong (authentication failure).
 */
export async function decryptPhoto(key: CryptoKey, blob: EncryptedBlob): Promise<Uint8Array> {
  const iv = blob.iv.buffer.slice(blob.iv.byteOffset, blob.iv.byteOffset + blob.iv.byteLength) as ArrayBuffer;
  const ciphertext = blob.ciphertext.buffer.slice(blob.ciphertext.byteOffset, blob.ciphertext.byteOffset + blob.ciphertext.byteLength) as ArrayBuffer;
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plainBuf);
}

/**
 * Compress and resize a photo URI to a Uint8Array for encryption.
 * maxSize: max dimension in px. quality: 0–1.
 */
export async function preparePhoto(uri: string, maxSize: number, quality: number): Promise<Uint8Array> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxSize, height: maxSize } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!result.base64) throw new Error('preparePhoto: image manipulation returned no base64');
  return Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
}

/**
 * Pack iv + ciphertext into a single Uint8Array for upload.
 * Format: [12 bytes IV][N bytes ciphertext]
 */
export function packEncryptedBlob(blob: EncryptedBlob): Uint8Array {
  const packed = new Uint8Array(blob.iv.length + blob.ciphertext.length);
  packed.set(blob.iv, 0);
  packed.set(blob.ciphertext, blob.iv.length);
  return packed;
}

/**
 * Unpack a stored blob back into iv + ciphertext.
 */
export function unpackEncryptedBlob(packed: Uint8Array): EncryptedBlob {
  return {
    iv: packed.slice(0, 12),
    ciphertext: packed.slice(12),
  };
}

/**
 * Encode a Uint8Array to base64 string (for sending to edge function).
 */
export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
