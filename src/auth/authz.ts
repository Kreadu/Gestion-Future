/**
 * Autenticación y autorización multi-tenant.
 *
 * Cada request a `/api/*` pasa por `authenticate()`, que verifica el
 * ID token de Firebase del header `Authorization: Bearer` y resuelve
 * el usuario de la aplicación (rol + empresa) desde D1. El rol y la
 * empresa NO viven en custom claims de Firebase: viven en la tabla
 * `users`, para poder gestionarlos sin tocar Firebase Admin (que no
 * corre en Workers).
 */

import { verifyFirebaseIdToken } from './firebaseToken';

export type UserRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'EMPLOYEE';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  employeeId: string | null;
}

/**
 * Subconjunto de `Env` que necesita este módulo. Se define aquí (en
 * vez de importar `Env` de `index.ts`) para evitar una dependencia
 * circular; el `Env` real del Worker lo satisface estructuralmente.
 */
export interface AuthEnv {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
}

/**
 * Error HTTP con status explícito. El handler global de `index.ts`
 * lo traduce directamente a la respuesta JSON con ese código.
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface UserRow {
  id: string;
  email: string;
  firebaseUid: string | null;
  role: UserRole;
  companyId: string | null;
  employeeId: string | null;
  active: number;
}

async function findUserRow(
  env: AuthEnv,
  firebaseUid: string,
  email: string
): Promise<UserRow | null> {
  const byUid = await env.DB.prepare(
    `SELECT id, email, firebaseUid, role, companyId, employeeId, active
     FROM users
     WHERE firebaseUid = ?1`
  )
    .bind(firebaseUid)
    .first<UserRow>();

  if (byUid) {
    return byUid;
  }

  const byEmail = await env.DB.prepare(
    `SELECT id, email, firebaseUid, role, companyId, employeeId, active
     FROM users
     WHERE email = ?1`
  )
    .bind(email)
    .first<UserRow>();

  if (byEmail && !byEmail.firebaseUid) {
    // Primer login: enlazamos la cuenta de Firebase con el usuario
    // que el administrador dio de alta por correo.
    await env.DB.prepare(
      `UPDATE users SET firebaseUid = ?1 WHERE id = ?2`
    )
      .bind(firebaseUid, byEmail.id)
      .run();
  }

  return byEmail;
}

/**
 * Autentica la request: verifica el token de Firebase y resuelve el
 * usuario de la aplicación. Lanza HttpError (401/403) si algo falla.
 */
export async function authenticate(
  request: Request,
  env: AuthEnv
): Promise<AuthUser> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new HttpError(
      401,
      'Encabezado de autorización ausente o inválido.'
    );
  }

  const token = authHeader.substring('Bearer '.length).trim();

  if (!token) {
    throw new HttpError(401, 'Token de autenticación ausente.');
  }

  if (!env.FIREBASE_PROJECT_ID) {
    throw new HttpError(
      500,
      'La autenticación no está configurada en el servidor.'
    );
  }

  let firebaseUser;

  try {
    firebaseUser = await verifyFirebaseIdToken(
      token,
      env.FIREBASE_PROJECT_ID
    );
  } catch {
    throw new HttpError(401, 'Token de autenticación inválido o expirado.');
  }

  if (!firebaseUser.email || !firebaseUser.emailVerified) {
    throw new HttpError(
      403,
      'El correo de la cuenta debe estar verificado.'
    );
  }

  const email = firebaseUser.email.trim().toLowerCase();

  const row = await findUserRow(env, firebaseUser.uid, email);

  if (!row || !row.active) {
    throw new HttpError(
      403,
      'Tu cuenta no está habilitada. Contacta a tu administrador.'
    );
  }

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    companyId: row.companyId ?? null,
    employeeId: row.employeeId ?? null,
  };
}

/**
 * ¿Puede `user` operar sobre la empresa `companyId`?
 * SUPER_ADMIN tiene acceso global; el resto sólo a su propia empresa.
 */
export function canAccessCompany(
  user: AuthUser,
  companyId: string | null | undefined
): boolean {
  if (!companyId) {
    return false;
  }

  if (user.role === 'SUPER_ADMIN') {
    return true;
  }

  return user.companyId === companyId;
}

/** Lanza 403 si `user.role` no está en `roles` (SUPER_ADMIN siempre pasa). */
export function requireRole(user: AuthUser, roles: UserRole[]): void {
  if (user.role === 'SUPER_ADMIN') {
    return;
  }

  if (!roles.includes(user.role)) {
    throw new HttpError(
      403,
      'No tienes permisos para realizar esta acción.'
    );
  }
}

/** Lanza 403 si `user` no tiene acceso a la empresa `companyId`. */
export function requireCompanyAccess(
  user: AuthUser,
  companyId: string | null | undefined
): void {
  if (!canAccessCompany(user, companyId)) {
    throw new HttpError(403, 'No tienes acceso a esta empresa.');
  }
}

/**
 * Registra una acción en `audit_log`. Nunca lanza: un fallo al
 * auditar no debe tumbar la operación que se está auditando.
 */
export async function audit(
  env: AuthEnv,
  user: AuthUser,
  action: string,
  entity: string,
  entityId: string | null,
  companyId: string | null
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, at, userId, email, action, entity, entityId, companyId)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
      .bind(
        `AUD-${crypto.randomUUID()}`,
        new Date().toISOString(),
        user.id,
        user.email,
        action,
        entity,
        entityId,
        companyId
      )
      .run();
  } catch (error) {
    console.error('No se pudo escribir en audit_log:', error);
  }
}
