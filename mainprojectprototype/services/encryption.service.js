import crypto from 'crypto';
import 'dotenv/config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derives a valid 32-byte Buffer key from the ENCRYPTION_KEY environment variable.
 */
function getMasterKey() {
  const keyEnv = process.env.ENCRYPTION_KEY;
  if (!keyEnv) {
    throw new Error('ENCRYPTION_KEY environment variable is not defined.');
  }

  // 64-char hex string (32 bytes)
  if (keyEnv.length === 64 && /^[0-9a-fA-F]+$/.test(keyEnv)) {
    return Buffer.from(keyEnv, 'hex');
  }

  // Raw 32-byte string
  if (Buffer.byteLength(keyEnv, 'utf8') === 32) {
    return Buffer.from(keyEnv, 'utf8');
  }

  // Safe fallback: derive 32 bytes via SHA-256
  return crypto.createHash('sha256').update(keyEnv).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext
 * @returns {string} Formatted as `${ivHex}:${authTagHex}:${encryptedHex}`
 */
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Cannot encrypt empty or non-string text.');
  }

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a ciphertext string using AES-256-GCM.
 * @param {string} ciphertext Formatted as `${ivHex}:${authTagHex}:${encryptedHex}`
 * @returns {string} Original plaintext
 */
export function decrypt(ciphertext) {
  if (typeof ciphertext !== 'string' || !ciphertext.includes(':')) {
    throw new Error('Invalid ciphertext format. Expected iv:authTag:encrypted');
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext structure. Expected 3 segments separated by colons.');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

