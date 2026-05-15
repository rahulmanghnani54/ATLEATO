// Node 18+ has globalThis.crypto.subtle — no polyfill needed in Jest node env
import {
  encryptPhoto,
  decryptPhoto,
  packEncryptedBlob,
  unpackEncryptedBlob,
  type EncryptedBlob,
} from '@/lib/physiqueEncryption';

// Mock expo-secure-store and expo-image-manipulator — not needed for crypto tests
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({}));

async function makeTestKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

describe('physiqueEncryption', () => {
  describe('encryptPhoto + decryptPhoto', () => {
    it('roundtrip produces original bytes', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
      const blob = await encryptPhoto(key, original);
      const decrypted = await decryptPhoto(key, blob);
      expect(decrypted).toEqual(original);
    });

    it('ciphertext differs from plaintext', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array(32).fill(0xAB);
      const blob = await encryptPhoto(key, original);
      expect(blob.ciphertext).not.toEqual(original);
    });

    it('iv is 12 bytes', async () => {
      const key = await makeTestKey();
      const blob = await encryptPhoto(key, new Uint8Array(8));
      expect(blob.iv.length).toBe(12);
    });

    it('two encryptions of same data produce different ciphertexts (random IV)', async () => {
      const key = await makeTestKey();
      const data = new Uint8Array(16).fill(0x42);
      const blob1 = await encryptPhoto(key, data);
      const blob2 = await encryptPhoto(key, data);
      expect(blob1.ciphertext).not.toEqual(blob2.ciphertext);
    });

    it('decryption with wrong key throws', async () => {
      const key1 = await makeTestKey();
      const key2 = await makeTestKey();
      const blob = await encryptPhoto(key1, new Uint8Array([10, 20, 30]));
      await expect(decryptPhoto(key2, blob)).rejects.toThrow();
    });
  });

  describe('packEncryptedBlob + unpackEncryptedBlob', () => {
    it('roundtrip preserves iv and ciphertext', async () => {
      const key = await makeTestKey();
      const original = new Uint8Array([7, 8, 9]);
      const blob = await encryptPhoto(key, original);
      const packed = packEncryptedBlob(blob);
      const unpacked = unpackEncryptedBlob(packed);
      expect(unpacked.iv).toEqual(blob.iv);
      expect(unpacked.ciphertext).toEqual(blob.ciphertext);
    });

    it('packed length = iv (12) + ciphertext length', async () => {
      const key = await makeTestKey();
      const blob = await encryptPhoto(key, new Uint8Array(50));
      const packed = packEncryptedBlob(blob);
      expect(packed.length).toBe(12 + blob.ciphertext.length);
    });
  });
});
