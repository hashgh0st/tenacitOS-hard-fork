/**
 * Password hashing with Argon2id (primary) and PBKDF2 (fallback)
 *
 * Security requirements:
 * - Argon2id: memoryCost=65536, timeCost=3, parallelism=4
 * - PBKDF2 fallback: iterations=600000, keyLen=64, sha512
 * - Timing-safe comparison for verification
 */
import { randomBytes, pbkdf2 as pbkdf2Callback, timingSafeEqual } from 'crypto';

// Lazy-loaded argon2 module — may fail if native addon isn't available
let argon2Module: typeof import('argon2') | null = null;
let argon2LoadAttempted = false;

async function getArgon2(): Promise<typeof import('argon2') | null> {
  if (argon2LoadAttempted) return argon2Module;
  argon2LoadAttempted = true;

  try {
    argon2Module = await import('argon2');
    return argon2Module;
  } catch {
    console.warn('[auth/password] argon2 native addon not available, using PBKDF2 fallback');
    return null;
  }
}

/**
 * Hash a password using Argon2id (preferred) or PBKDF2 (fallback).
 * The returned hash string indicates which algorithm was used.
 */
export async function hashPassword(password: string): Promise<string> {
  const argon2 = await getArgon2();

  if (argon2) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  // PBKDF2 fallback
  return hashWithPbkdf2(password);
}

/**
 * Verify a password against a hash. Detects algorithm from hash format.
 * Uses timing-safe comparison for PBKDF2 hashes.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (hash.startsWith('$argon2')) {
    const argon2 = await getArgon2();
    if (!argon2) {
      throw new Error('Password was hashed with argon2 but argon2 addon is not available');
    }
    return argon2.verify(hash, password);
  }

  if (hash.startsWith('pbkdf2$')) {
    return verifyWithPbkdf2(hash, password);
  }

  throw new Error('Unknown password hash format');
}

// ---- PBKDF2 fallback implementation ----

const PBKDF2_ITERATIONS = 600000;
const PBKDF2_KEY_LEN = 64;
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_SALT_LEN = 32;

function pbkdf2Async(password: string, salt: Buffer, iterations: number, keyLen: number, digest: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2Callback(password, salt, iterations, keyLen, digest, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function hashWithPbkdf2(password: string): Promise<string> {
  const salt = randomBytes(PBKDF2_SALT_LEN);
  const derived = await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyWithPbkdf2(hash: string, password: string): Promise<boolean> {
  const parts = hash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false;
  }

  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'hex');
  const storedHash = Buffer.from(parts[3], 'hex');

  const derived = await pbkdf2Async(password, salt, iterations, PBKDF2_KEY_LEN, PBKDF2_DIGEST);

  // Timing-safe comparison (lengths should always match with fixed key length)
  if (derived.length !== storedHash.length) return false;
  return timingSafeEqual(derived, storedHash);
}

/**
 * For testing: reset the argon2 module cache to simulate load failure.
 */
export function _resetArgon2Cache(): void {
  argon2Module = null;
  argon2LoadAttempted = false;
}

/**
 * For testing: force the argon2 fallback path.
 */
export function _forceArgon2Unavailable(): void {
  argon2Module = null;
  argon2LoadAttempted = true;
}
