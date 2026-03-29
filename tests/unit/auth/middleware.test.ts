/**
 * Tests for src/middleware.ts
 *
 * Validates Edge-compatible middleware behavior:
 * - Public routes pass through
 * - Missing session cookie → redirect (pages) or 401 (API)
 * - Present session cookie → pass through
 */
import { describe, it, expect } from 'vitest';
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

function makeRequest(pathname: string, cookies?: Record<string, string>): NextRequest {
  const url = new URL(pathname, 'http://localhost:3000');
  const request = new NextRequest(url);

  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      request.cookies.set(name, value);
    }
  }

  return request;
}

describe('middleware', () => {
  describe('public routes', () => {
    it('allows /login without session', () => {
      const response = middleware(makeRequest('/login'));
      // NextResponse.next() has no redirect
      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /setup without session', () => {
      const response = middleware(makeRequest('/setup'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /register without session', () => {
      const response = middleware(makeRequest('/register'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /api/auth/login without session', () => {
      const response = middleware(makeRequest('/api/auth/login'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /api/auth/register without session', () => {
      const response = middleware(makeRequest('/api/auth/register'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /api/auth/totp/verify without session', () => {
      const response = middleware(makeRequest('/api/auth/totp/verify'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /api/health without session', () => {
      const response = middleware(makeRequest('/api/health'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('allows /api/collector/ingest without session', () => {
      const response = middleware(makeRequest('/api/collector/ingest'));
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });
  });

  describe('protected page routes (no session)', () => {
    it('redirects / to /login', () => {
      const response = middleware(makeRequest('/'));
      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain('from=%2F');
    });

    it('redirects /dashboard to /login with from param', () => {
      const response = middleware(makeRequest('/dashboard'));
      expect(response.status).toBe(307);
      const location = response.headers.get('location');
      expect(location).toContain('/login');
      expect(location).toContain('from=%2Fdashboard');
    });
  });

  describe('protected API routes (no session)', () => {
    it('returns 401 for /api/auth/me', async () => {
      const response = middleware(makeRequest('/api/auth/me'));
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 401 for /api/auth/invite', async () => {
      const response = middleware(makeRequest('/api/auth/invite'));
      expect(response.status).toBe(401);
    });

    it('returns 401 for /api/system', async () => {
      const response = middleware(makeRequest('/api/system'));
      expect(response.status).toBe(401);
    });
  });

  describe('authenticated requests', () => {
    it('passes through page routes with session cookie', () => {
      const response = middleware(
        makeRequest('/', { tenacitos_session: 'some-token-value' }),
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('passes through API routes with session cookie', () => {
      const response = middleware(
        makeRequest('/api/auth/me', { tenacitos_session: 'some-token-value' }),
      );
      expect(response.headers.get('x-middleware-next')).toBe('1');
    });

    it('does not pass through with empty session cookie value', async () => {
      const response = middleware(
        makeRequest('/api/auth/me', { tenacitos_session: '' }),
      );
      // Empty cookie value should be treated as no cookie
      expect(response.status).toBe(401);
    });
  });
});
