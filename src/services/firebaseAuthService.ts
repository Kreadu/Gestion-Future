```ts
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';

/**
 * Inicialización de Firebase Admin.
 *
 * Se ejecuta una sola vez, evitando inicializaciones
 * duplicadas cuando el backend recarga módulos.
 */
if (!getApps().length) {
  initializeApp();
}

export const auth = getAuth();

/**
 * Roles disponibles dentro de Fink Business.
 */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'EMPLOYEE';

/**
 * Custom Claims almacenados en el token de Firebase.
 *
 * tenantId:
 * - Obligatorio para TENANT_ADMIN.
 * - Obligatorio para EMPLOYEE.
 * - No necesario para SUPER_ADMIN.
 */
export interface UserCustomClaims {
  role: UserRole;
  tenantId?: string;
}

/**
 * Servicio centralizado de autenticación y autorización
 * para Fink Business.
 *
 * Gestiona:
 * - Roles.
 * - Multi-Tenant.
 * - Firebase Custom Claims.
 * - Verificación de tokens.
 * - Permisos.
 */
export class FirebaseAuthService {

  /**
   * Asigna el rol y el tenant de un usuario
   * mediante Firebase Custom Claims.
   */
  static async setUserRoleAndTenant(
    uid: string,
    role: UserRole,
    tenantId?: string
  ): Promise<void> {

    if (!uid?.trim()) {
      throw new Error(
        'El UID del usuario es obligatorio.'
      );
    }

    const requiresTenant =
      role === 'TENANT_ADMIN' ||
      role === 'EMPLOYEE';

    if (requiresTenant && !tenantId?.trim()) {
      throw new Error(
        `El rol ${role} requiere especificar un tenantId de empresa cliente.`
      );
    }

    /**
     * Un SUPER_ADMIN tiene acceso global,
     * por lo que no debe quedar asociado a un tenant.
     */
    const customClaims: UserCustomClaims =
      role === 'SUPER_ADMIN'
        ? {
            role: 'SUPER_ADMIN',
          }
        : {
            role,
            tenantId: tenantId!.trim(),
          };

    await auth.setCustomUserClaims(
      uid,
      customClaims
    );
  }

  /**
   * Verifica el Token Bearer de una petición HTTP
   * y obtiene la identidad y permisos del usuario.
   */
  static async verifyRequestToken(
    authHeader: string | null
  ): Promise<{
    uid: string;
    email?: string;
    role: UserRole;
    tenantId?: string;
  }> {

    if (
      !authHeader ||
      !authHeader.startsWith('Bearer ')
    ) {
      throw new Error(
        'Encabezado de autorización ausente o inválido.'
      );
    }

    const idToken = authHeader
      .substring('Bearer '.length)
      .trim();

    if (!idToken) {
      throw new Error(
        'Token de autenticación ausente.'
      );
    }

    const decodedToken: DecodedIdToken =
      await auth.verifyIdToken(idToken);

    /**
     * Si el usuario no tiene un rol explícito,
     * se considera EMPLOYEE por compatibilidad.
     */
    const role =
      (decodedToken.role as UserRole) ||
      'EMPLOYEE';

    const tenantId =
      decodedToken.tenantId as string | undefined;

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
      tenantId,
    };
  }

  /**
   * Comprueba si un usuario tiene permiso
   * para realizar una determinada acción.
   *
   * Reglas:
   *
   * 1. SUPER_ADMIN tiene acceso global.
   * 2. Los demás usuarios deben tener uno de
   *    los roles requeridos.
   * 3. Si se especifica un targetTenantId,
   *    el usuario debe pertenecer a ese tenant.
   */
  static checkPermission(
    userRole: UserRole,
    userTenantId: string | undefined,
    requiredRoles: UserRole[],
    targetTenantId?: string
  ): boolean {

    /**
     * SUPER_ADMIN:
     * acceso global a todos los tenants.
     */
    if (userRole === 'SUPER_ADMIN') {
      return true;
    }

    /**
     * Verificar que el rol del usuario
     * esté autorizado para la operación.
     */
    if (!requiredRoles.includes(userRole)) {
      return false;
    }

    /**
     * Aislamiento Multi-Tenant estricto.
     *
     * Si la operación apunta a un tenant concreto,
     * el usuario debe pertenecer a ese mismo tenant.
     */
    if (
      targetTenantId &&
      userTenantId !== targetTenantId
    ) {
      return false;
    }

    return true;
  }

  /**
   * Comprueba si un usuario pertenece al tenant indicado.
   *
   * SUPER_ADMIN tiene acceso global.
   */
  static hasTenantAccess(
    userRole: UserRole,
    userTenantId: string | undefined,
    targetTenantId: string
  ): boolean {

    if (userRole === 'SUPER_ADMIN') {
      return true;
    }

    return (
      !!userTenantId &&
      userTenantId === targetTenantId
    );
  }

  /**
   * Comprueba si un usuario posee uno de los
   * roles especificados.
   */
  static hasRole(
    userRole: UserRole,
    requiredRoles: UserRole[]
  ): boolean {

    if (userRole === 'SUPER_ADMIN') {
      return true;
    }

    return requiredRoles.includes(userRole);
  }
}
```
