/**
 * Tests for src/lib/auth/roles.ts
 * All role combinations
 */
import { describe, it, expect } from 'vitest';
import { hasPermission, isValidRole, ALL_ROLES } from '@/lib/auth/roles';
import type { Role } from '@/lib/auth/roles';

describe('auth/roles', () => {
  describe('hasPermission', () => {
    it('admin has admin permission', () => {
      expect(hasPermission('admin', 'admin')).toBe(true);
    });

    it('admin has operator permission', () => {
      expect(hasPermission('admin', 'operator')).toBe(true);
    });

    it('admin has viewer permission', () => {
      expect(hasPermission('admin', 'viewer')).toBe(true);
    });

    it('operator does NOT have admin permission', () => {
      expect(hasPermission('operator', 'admin')).toBe(false);
    });

    it('operator has operator permission', () => {
      expect(hasPermission('operator', 'operator')).toBe(true);
    });

    it('operator has viewer permission', () => {
      expect(hasPermission('operator', 'viewer')).toBe(true);
    });

    it('viewer does NOT have admin permission', () => {
      expect(hasPermission('viewer', 'admin')).toBe(false);
    });

    it('viewer does NOT have operator permission', () => {
      expect(hasPermission('viewer', 'operator')).toBe(false);
    });

    it('viewer has viewer permission', () => {
      expect(hasPermission('viewer', 'viewer')).toBe(true);
    });

    // Exhaustive matrix test
    it('passes exhaustive role matrix', () => {
      const expected: Record<Role, Record<Role, boolean>> = {
        admin: { admin: true, operator: true, viewer: true },
        operator: { admin: false, operator: true, viewer: true },
        viewer: { admin: false, operator: false, viewer: true },
      };

      for (const userRole of ALL_ROLES) {
        for (const requiredRole of ALL_ROLES) {
          expect(hasPermission(userRole, requiredRole)).toBe(expected[userRole][requiredRole]);
        }
      }
    });
  });

  describe('isValidRole', () => {
    it('recognizes valid roles', () => {
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('operator')).toBe(true);
      expect(isValidRole('viewer')).toBe(true);
    });

    it('rejects invalid roles', () => {
      expect(isValidRole('superadmin')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('ADMIN')).toBe(false);
    });
  });

  describe('ALL_ROLES', () => {
    it('contains all three roles in descending privilege order', () => {
      expect(ALL_ROLES).toEqual(['admin', 'operator', 'viewer']);
    });
  });
});
