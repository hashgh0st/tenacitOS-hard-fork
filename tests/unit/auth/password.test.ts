/**
 * Tests for src/lib/auth/password.ts
 * Hash/verify round-trip, invalid password fails, fallback detection
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, _resetArgon2Cache, _forceArgon2Unavailable } from '@/lib/auth/password';

describe('auth/password', () => {
  beforeEach(() => {
    _resetArgon2Cache();
  });

  describe('argon2id (primary)', () => {
    it('hashes a password with argon2id', async () => {
      const hash = await hashPassword('my-secure-password');
      expect(hash).toMatch(/^\$argon2id\$/);
    });

    it('produces different hashes for the same password (random salt)', async () => {
      const hash1 = await hashPassword('same-password');
      const hash2 = await hashPassword('same-password');
      expect(hash1).not.toBe(hash2);
    });

    it('verifies correct password', async () => {
      const hash = await hashPassword('correct-horse-battery-staple');
      const isValid = await verifyPassword(hash, 'correct-horse-battery-staple');
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password', async () => {
      const hash = await hashPassword('correct-horse-battery-staple');
      const isValid = await verifyPassword(hash, 'wrong-password');
      expect(isValid).toBe(false);
    });

    it('handles empty password', async () => {
      const hash = await hashPassword('');
      const isValid = await verifyPassword(hash, '');
      expect(isValid).toBe(true);
    });

    it('handles unicode passwords', async () => {
      const hash = await hashPassword('pässwörd-日本語');
      const isValid = await verifyPassword(hash, 'pässwörd-日本語');
      expect(isValid).toBe(true);
    });
  });

  describe('PBKDF2 (fallback)', () => {
    beforeEach(() => {
      _forceArgon2Unavailable();
    });

    it('hashes a password with PBKDF2 when argon2 is unavailable', async () => {
      const hash = await hashPassword('my-password');
      expect(hash).toMatch(/^pbkdf2\$/);
    });

    it('PBKDF2 hash has correct format: pbkdf2$iterations$salt$hash', async () => {
      const hash = await hashPassword('test');
      const parts = hash.split('$');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('pbkdf2');
      expect(parseInt(parts[1], 10)).toBe(600000);
      // salt is 32 bytes = 64 hex chars
      expect(parts[2]).toHaveLength(64);
      // hash is 64 bytes = 128 hex chars
      expect(parts[3]).toHaveLength(128);
    });

    it('verifies correct password with PBKDF2', async () => {
      const hash = await hashPassword('my-password');
      const isValid = await verifyPassword(hash, 'my-password');
      expect(isValid).toBe(true);
    });

    it('rejects incorrect password with PBKDF2', async () => {
      const hash = await hashPassword('my-password');
      const isValid = await verifyPassword(hash, 'wrong-password');
      expect(isValid).toBe(false);
    });

    it('produces different hashes for the same password (random salt)', async () => {
      const hash1 = await hashPassword('same-password');
      const hash2 = await hashPassword('same-password');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('cross-algorithm', () => {
    it('throws on unknown hash format', async () => {
      await expect(verifyPassword('unknown$format$hash', 'password')).rejects.toThrow(
        'Unknown password hash format',
      );
    });

    it('throws when argon2 hash encountered but argon2 unavailable', async () => {
      // First, hash with argon2
      const hash = await hashPassword('my-password');
      expect(hash).toMatch(/^\$argon2id\$/);

      // Now force argon2 unavailable
      _forceArgon2Unavailable();

      await expect(verifyPassword(hash, 'my-password')).rejects.toThrow(
        'argon2 addon is not available',
      );
    });
  });
});
