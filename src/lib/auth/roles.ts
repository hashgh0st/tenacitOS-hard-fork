/**
 * Role-Based Access Control (RBAC) definitions
 *
 * Role hierarchy: admin > operator > viewer
 */

export type Role = 'admin' | 'operator' | 'viewer';

const ROLE_LEVELS: Record<Role, number> = {
  admin: 3,
  operator: 2,
  viewer: 1,
};

/**
 * Check if a user's role meets or exceeds the required role level.
 *
 * Examples:
 *   hasPermission('admin', 'operator')  => true  (admin >= operator)
 *   hasPermission('viewer', 'operator') => false (viewer < operator)
 *   hasPermission('operator', 'viewer') => true  (operator >= viewer)
 */
export function hasPermission(userRole: Role, requiredRole: Role): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole];
}

/**
 * All valid roles in descending order of privilege.
 */
export const ALL_ROLES: readonly Role[] = ['admin', 'operator', 'viewer'] as const;

/**
 * Validate that a string is a valid role.
 */
export function isValidRole(role: string): role is Role {
  return role === 'admin' || role === 'operator' || role === 'viewer';
}
