import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';

/**
 * Roles disponibles en Gestion-Future.
 *
 * SUPER_ADMIN:
 * Administrador global del sistema.
 *
 * TENANT_ADMIN:
 * Administrador de una empresa cliente.
 *
 * EMPLOYEE:
 * Empleado perteneciente a una empresa cliente.
 */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'EMPLOYEE';

/**
 * Información del usuario autenticado.
 */
export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;

  role: UserRole;

  /**
   * Empresa/tenant al que pertenece el usuario.
   *
   * SUPER_ADMIN no necesita tenantId.
   */
  tenantId?: string;

  /**
   * Nombre de la empresa actualmente seleccionada.
   *
   * Principalmente utilizado por SUPER_ADMIN
   * cuando cambia de empresa desde el panel.
   */
  tenantName?: string;
}

/**
 * Contexto global de autenticación.
 */
interface AuthContextType {
  user: AuthUser | null;

  /**
   * Login temporal para desarrollo.
   *
   * Será reemplazado por Firebase Authentication.
   */
  login: (
    role: UserRole,
    tenantId?: string,
    tenantName?: string
  ) => void;

  /**
   * Cierra la sesión actual.
   */
  logout: () => void;

  /**
   * Permite al SUPER_ADMIN seleccionar
   * la empresa que desea administrar.
   */
  switchTenant: (
    tenantId: string,
    tenantName: string
  ) => void;

  /**
   * Indica si existe una sesión activa.
   */
  isAuthenticated: boolean;
}

/**
 * Contexto de autenticación.
 */
const AuthContext = createContext<
  AuthContextType | undefined
>(undefined);

/**
 * Proveedor global de autenticación.
 */
export const AuthProvider: React.FC<{
  children: ReactNode;
}> = ({ children }) => {

  /**
   * Usuario inicial temporal.
   *
   * IMPORTANTE:
   * Este usuario solamente existe para desarrollo.
   * No representa autenticación real.
   *
   * Cuando conectemos Firebase Authentication,
   * esta información será obtenida desde Firebase.
   */
  const [user, setUser] =
    useState<AuthUser | null>({
      uid: 'usr-admin-001',
      email: 'admin@kreadu.com',
      displayName:
        'Administrador Kreadu Outsourcing',
      role: 'SUPER_ADMIN',
    });

  /**
   * Autenticación temporal.
   *
   * Más adelante será sustituida por:
   *
   * Firebase Authentication
   *        ↓
   * ID Token
   *        ↓
   * Custom Claims
   *        ↓
   * role + tenantId
   */
  const login = (
    role: UserRole,
    tenantId?: string,
    tenantName?: string
  ): void => {

    const isSuperAdmin =
      role === 'SUPER_ADMIN';

    /**
     * Los usuarios normales necesitan
     * pertenecer a un tenant.
     */
    if (
      !isSuperAdmin &&
      !tenantId
    ) {
      throw new Error(
        `${role} requiere un tenantId.`
      );
    }

    setUser({
      uid: `usr-${Date.now()}`,

      email: isSuperAdmin
        ? 'admin@kreadu.com'
        : `${role.toLowerCase()}@gestionfuture.com`,

      displayName: isSuperAdmin
        ? 'SuperAdmin Kreadu'
        : role === 'TENANT_ADMIN'
          ? 'Administrador de Empresa'
          : 'Empleado',

      role,

      ...(tenantId
        ? {
            tenantId,
            tenantName:
              tenantName ??
              'Empresa Cliente',
          }
        : {}),
    });
  };

  /**
   * Cierra la sesión.
   */
  const logout = (): void => {
    setUser(null);
  };

  /**
   * Cambia la empresa activa.
   *
   * Solamente SUPER_ADMIN puede cambiar
   * entre empresas.
   *
   * IMPORTANTE:
   * Esto no cambia la pertenencia real del usuario.
   * Solo cambia el tenant que está administrando
   * temporalmente desde el panel.
   */
  const switchTenant = (
    tenantId: string,
    tenantName: string
  ): void => {

    if (!user) {
      return;
    }

    if (user.role !== 'SUPER_ADMIN') {
      return;
    }

    if (!tenantId.trim()) {
      throw new Error(
        'El tenantId es obligatorio.'
      );
    }

    if (!tenantName.trim()) {
      throw new Error(
        'El nombre del tenant es obligatorio.'
      );
    }

    setUser({
      ...user,
      tenantId: tenantId.trim(),
      tenantName: tenantName.trim(),
    });
  };

  /**
   * Estado derivado de autenticación.
   */
  const isAuthenticated =
    user !== null;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        switchTenant,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook para acceder al usuario y
 * las funciones de autenticación.
 */
export const useAuth = (): AuthContextType => {

  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth debe utilizarse dentro de un AuthProvider.'
    );
  }

  return context;
};
