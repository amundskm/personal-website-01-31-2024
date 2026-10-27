/**
 * Permission groups. Each one is a Cognito user pool group (created by
 * `amplify/auth/resource.ts`); add a user to a group to grant that permission.
 *
 * `admin` can see everything. To add a role, add it here and to `groups` in
 * `amplify/auth/resource.ts`, and redeploy the backend. Members pages in the
 * admin offer every role here (except admin) as an audience.
 */
export const ROLES = ['admin', 'wife', 'neia-boiz', 'da-boiz', 'da-girls'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  wife: 'Wife',
  'neia-boiz': 'NEIA Boiz',
  'da-boiz': 'Da Boiz',
  'da-girls': 'Da Girls',
};

export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

/** Whether a user in `groups` may access something open to any of `allowed`. */
export function hasAnyRole(groups: readonly string[], allowed: readonly Role[]): boolean {
  return groups.includes('admin') || allowed.some((role) => groups.includes(role));
}
