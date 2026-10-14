/**
 * unit.encryption.service.test.js
 *
 * Unit tests for services/encryption.service.js (AES-256-GCM symmetric encryption).
 */
import { describe, test, expect, beforeEach, afterAll } from '@jest/globals';
import { encrypt, decrypt } from '../services/encryption.service.js';

const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

describe('encryption.service', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = '134e147fa64d0465f2387d0ed03d96e2cf0800754057bb9817276152e02c3ab6';
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  describe('encrypt', () => {
    test('encrypts plaintext into 3-part colon-delimited format (iv:tag:ciphertext)', () => {
      const ciphertext = encrypt('mySecretPassword123!');
      expect(typeof ciphertext).toBe('string');

      const parts = ciphertext.split(':');
      expect(parts).toHaveLength(3);

      const [ivHex, tagHex, dataHex] = parts;
      // 12 bytes IV = 24 hex chars
      expect(ivHex).toHaveLength(24);
      // 16 bytes auth tag = 32 hex chars
      expect(tagHex).toHaveLength(32);
      expect(dataHex.length).toBeGreaterThan(0);
    });

    test('generates different ciphertexts for the same plaintext due to random IV', () => {
      const c1 = encrypt('samePassword');
      const c2 = encrypt('samePassword');
      expect(c1).not.toBe(c2);
    });

    test('throws error if input is empty or non-string', () => {
      expect(() => encrypt('')).toThrow('Cannot encrypt empty or non-string text.');
      expect(() => encrypt(null)).toThrow('Cannot encrypt empty or non-string text.');
      expect(() => encrypt(12345)).toThrow('Cannot encrypt empty or non-string text.');
    });

    test('throws error when ENCRYPTION_KEY is unset', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is not defined.');
    });
  });

  describe('decrypt', () => {
    test('successfully decrypts encrypted ciphertext back to plaintext', () => {
      const original = 'Student@2026_SecurePassword!';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    test('handles special characters and unicode in password', () => {
      const original = 'P@$$w0rd!#%^&*()_+~`|}{[]:;?><,./-= 🚀 🔐';
      const encrypted = encrypt(original);
      expect(decrypt(encrypted)).toBe(original);
    });

    test('throws error if ciphertext is tampered (integrity verification via GCM auth tag)', () => {
      const encrypted = encrypt('sensitiveData');
      const parts = encrypted.split(':');
      // Corrupt the ciphertext payload
      const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;
      expect(() => decrypt(tampered)).toThrow();
    });

    test('throws error if auth tag is tampered', () => {
      const encrypted = encrypt('sensitiveData');
      const parts = encrypted.split(':');
      // Corrupt the auth tag
      const alteredTag = parts[1].replace(/./, (c) => (c === '0' ? '1' : '0'));
      const tampered = `${parts[0]}:${alteredTag}:${parts[2]}`;
      expect(() => decrypt(tampered)).toThrow();
    });

    test('throws error if format is invalid', () => {
      expect(() => decrypt('not-colon-delimited')).toThrow('Invalid ciphertext format.');
      expect(() => decrypt('part1:part2')).toThrow('Invalid ciphertext structure.');
      expect(() => decrypt(null)).toThrow('Invalid ciphertext format.');
    });
  });
});

