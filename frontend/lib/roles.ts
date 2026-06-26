/** Backend uses lowercase enum values (see app.core.security.Role). */
export function normalizeRole(role: string | undefined | null): string {
  return (role ?? '').trim().toLowerCase();
}

export function isAdminRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'admin';
}

export function isOperatorRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'operator';
}

export function isEnrolleeRole(role: string | undefined | null): boolean {
  return normalizeRole(role) === 'enrollee';
}

export function isSurveillanceRole(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'operator';
}
