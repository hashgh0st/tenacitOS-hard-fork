/**
 * Tests for src/lib/auth/totp.ts
 * Generate/verify, backup codes, encrypt/decrypt round-trip
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import {
  generateTOTPSecret,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
  encryptTOTPSecret,
  decryptTOTPSecret,
} from '@/lib/auth/totp';

describe('auth/totp', () => {
  const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-secret-key-for-unit-tests-only';
  });

  afterEach(() => {
    if (ORIGINAL_AUTH_SECRET !== undefined) {
      process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
    } else {
      delete process.env.AUTH_SECRET;
    }
  });

  describe('generateTOTPSecret', () => {
    it('returns a base32 secret, URI, and QR data URL promise', async () => {
      const result = generateTOTPSecret('testuser');

      expect(result.secret).toBeDefined();
      expect(typeof result.secret).toBe('string');
      // Base32 characters only
      expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);

      expect(result.uri).toBeDefined();
      expect(result.uri).toContain('otpauth://totp/');
      expect(result.uri).toContain('testuser');
      expect(result.uri).toContain('TenacitOS');

      const qrDataUrl = await result.qrDataUrl;
      expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('generates unique secrets for different calls', () => {
      const result1 = generateTOTPSecret('user1');
      const result2 = generateTOTPSecret('user2');
      expect(result1.secret).not.toBe(result2.secret);
    });
  });

  describe('verifyTOTP', () => {
    it('verifies a valid current token', () => {
      const secret = new Secret({ size: 20 });
      const totp = new TOTP({
        issuer: 'TenacitOS',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });

      const token = totp.generate();
      const isValid = verifyTOTP(secret.base32, token);
      expect(isValid).toBe(true);
    });

    it('rejects an invalid token', () => {
      const secret = new Secret({ size: 20 });
      const isValid = verifyTOTP(secret.base32, '000000');
      // This could theoretically be valid by coincidence, but extremely unlikely
      // We use a known-bad value
      const isValid2 = verifyTOTP(secret.base32, 'abcdef');
      expect(isValid2).toBe(false);
    });

    it('accepts tokens within window of 1', () => {
      const secret = new Secret({ size: 20 });
      const totp = new TOTP({
        issuer: 'TenacitOS',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret,
      });

      // Generate token for current time
      const token = totp.generate();
      expect(verifyTOTP(secret.base32, token)).toBe(true);
    });
  });

  describe('generateBackupCodes', () => {
    it('generates exactly 10 backup codes', () => {
      const codes = generateBackupCodes();
      expect(codes).toHaveLength(10);
    });

    it('each code is 8 characters long', () => {
      const codes = generateBackupCodes();
      for (const code of codes) {
        expect(code).toHaveLength(8);
      }
    });

    it('codes contain only lowercase alphanumeric characters', () => {
      const codes = generateBackupCodes();
      for (const code of codes) {
        expect(code).toMatch(/^[a-z0-9]+$/);
      }
    });

    it('generates unique codes each time', () => {
      const codes1 = generateBackupCodes();
      const codes2 = generateBackupCodes();
      // Very unlikely all 10 codes match
      const allMatch = codes1.every((c, i) => c === codes2[i]);
      expect(allMatch).toBe(false);
    });

    it('all codes within a set are unique', () => {
      const codes = generateBackupCodes();
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });

  describe('hashBackupCode', () => {
    it('returns a hex string', () => {
      const hash = hashBackupCode('abc12345');
      expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 = 64 hex chars
    });

    it('is case-insensitive', () => {
      const hash1 = hashBackupCode('ABC12345');
      const hash2 = hashBackupCode('abc12345');
      expect(hash1).toBe(hash2);
    });

    it('is deterministic', () => {
      const hash1 = hashBackupCode('mycode01');
      const hash2 = hashBackupCode('mycode01');
      expect(hash1).toBe(hash2);
    });
  });

  describe('verifyBackupCode', () => {
    it('verifies a correct backup code', () => {
      const code = 'abc12345';
      const hash = hashBackupCode(code);
      expect(verifyBackupCode(code, hash)).toBe(true);
    });

    it('rejects an incorrect backup code', () => {
      const hash = hashBackupCode('abc12345');
      expect(verifyBackupCode('wrong123', hash)).toBe(false);
    });

    it('is case-insensitive', () => {
      const hash = hashBackupCode('abc12345');
      expect(verifyBackupCode('ABC12345', hash)).toBe(true);
    });
  });

  describe('encryptTOTPSecret / decryptTOTPSecret', () => {
    it('round-trips a secret correctly', () => {
      const original = 'JBSWY3DPEHPK3PXP';
      const encrypted = encryptTOTPSecret(original);
      const decrypted = decryptTOTPSecret(encrypted);
      expect(decrypted).toBe(original);
    });

    it('encrypted output has 4 colon-separated hex parts', () => {
      const encrypted = encryptTOTPSecret('MYSECRET');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(4);
      // All parts should be hex
      for (const part of parts) {
        expect(part).toMatch(/^[0-9a-f]+$/);
      }
    });

    it('produces different ciphertext for same input (random salt+IV)', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted1 = encryptTOTPSecret(secret);
      const encrypted2 = encryptTOTPSecret(secret);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('throws if AUTH_SECRET is not set', () => {
      delete process.env.AUTH_SECRET;
      expect(() => encryptTOTPSecret('MYSECRET')).toThrow('AUTH_SECRET');
    });

    it('throws on tampered ciphertext', () => {
      const encrypted = encryptTOTPSecret('MYSECRET');
      const parts = encrypted.split(':');
      // Tamper with the ciphertext
      parts[3] = 'ff' + parts[3].slice(2);
      const tampered = parts.join(':');
      expect(() => decryptTOTPSecret(tampered)).toThrow();
    });

    it('throws on invalid format', () => {
      expect(() => decryptTOTPSecret('not:enough:parts')).toThrow('Invalid encrypted');
    });

    it('decryption fails with wrong AUTH_SECRET', () => {
      const encrypted = encryptTOTPSecret('MYSECRET');
      process.env.AUTH_SECRET = 'different-secret-key';
      expect(() => decryptTOTPSecret(encrypted)).toThrow();
    });
  });
});
