/**
 * TOTP + QR code + backup codes + encryption
 *
 * Security requirements:
 * - TOTP: 6-digit, 30s window, SHA-1 (Google Authenticator compat)
 * - QR: data URL generated locally via qrcode package
 * - Backup codes: 10 codes, 8 alphanumeric chars each, stored as SHA-256 hashes
 * - Encryption: AES-256-GCM using AUTH_SECRET-derived key (PBKDF2)
 */
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  timingSafeEqual,
} from 'crypto';

const ISSUER = 'TenacitOS';
const BACKUP_CODE_LENGTH = 8;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Encryption constants
const ENCRYPTION_SALT_LEN = 16;
const ENCRYPTION_IV_LEN = 12; // GCM standard IV length
const ENCRYPTION_KEY_LEN = 32; // 256 bits
const ENCRYPTION_PBKDF2_ITERATIONS = 100000;

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable is required for TOTP encryption');
  }
  return secret;
}

/**
 * Generate a new TOTP secret for a user.
 * Returns the base32 secret, the otpauth URI, and a promise for the QR code data URL.
 */
export function generateTOTPSecret(username: string): {
  secret: string;
  uri: string;
  qrDataUrl: Promise<string>;
} {
  const secret = new Secret({ size: 20 });

  const totp = new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();

  return {
    secret: secret.base32,
    uri,
    qrDataUrl: QRCode.toDataURL(uri),
  };
}

/**
 * Verify a TOTP token against a base32-encoded secret.
 * Uses a window of 1 (allows +-1 period for clock skew).
 */
export function verifyTOTP(secret: string, token: string): boolean {
  const totp = new TOTP({
    issuer: ISSUER,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * Generate 10 random backup codes (8 alphanumeric chars each).
 */
export function generateBackupCodes(): string[] {
  const limit = 256 - (256 % BACKUP_CODE_CHARS.length); // rejection sampling threshold
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let code = '';
    for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
      let byte: number;
      do {
        byte = randomBytes(1)[0];
      } while (byte >= limit);
      code += BACKUP_CODE_CHARS[byte % BACKUP_CODE_CHARS.length];
    }
    codes.push(code);
  }
  return codes;
}

/**
 * Hash a backup code with SHA-256 for storage.
 */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(code.toLowerCase()).digest('hex');
}

/**
 * Verify a backup code against its stored hash using timing-safe comparison.
 */
export function verifyBackupCode(code: string, hash: string): boolean {
  const computedHash = hashBackupCode(code);
  // Use constant-time comparison
  if (computedHash.length !== hash.length) return false;
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Encrypt a TOTP secret using AES-256-GCM with a key derived from AUTH_SECRET.
 * Format: salt(hex):iv(hex):authTag(hex):ciphertext(hex)
 */
export function encryptTOTPSecret(secret: string): string {
  const authSecret = getAuthSecret();
  const salt = randomBytes(ENCRYPTION_SALT_LEN);
  const iv = randomBytes(ENCRYPTION_IV_LEN);

  // Derive key synchronously (encryption is not on hot path)
  const key = pbkdf2Sync(authSecret, salt, ENCRYPTION_PBKDF2_ITERATIONS, ENCRYPTION_KEY_LEN, 'sha256');

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a TOTP secret encrypted with encryptTOTPSecret.
 */
export function decryptTOTPSecret(encrypted: string): string {
  const authSecret = getAuthSecret();
  const parts = encrypted.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid encrypted TOTP secret format');
  }

  const [saltHex, ivHex, authTagHex, ciphertext] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const key = pbkdf2Sync(authSecret, salt, ENCRYPTION_PBKDF2_ITERATIONS, ENCRYPTION_KEY_LEN, 'sha256');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
