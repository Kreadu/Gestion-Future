import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';

/**
 * Roles disponibles en Fink Business.
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
   * Tenant al que pertenece el usuario.
   *
   * SUPER_ADMIN puede no tener tenantId
   * porque tiene acceso global.
   */
  tenantId?: string;

  /**
   * Nombre del tenant actualmente seleccionado.
   */
  tenantName?: string;
}

/**
 * API disponible a través del AuthContext.
 */
interface AuthContextType {
  user: AuthUser | null;

  /**
   * Login temporal.
   *
   * Esta función será reemplazada posteriormente
   * por Firebase Authentication.
   */
  login: (
    role: UserRole,
    tenantId?: string
  ) => void;

  logout: () => void;

  /**
   * Permite a un SUPER_ADMIN cambiar el tenant
   * que está administrando.
   */
  switchTenant: (
    tenantId: string,
    tenantName: string
  ) => void;
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
   * Esto es solamente para desarrollo/prototipo.
   * Posteriormente será sustituido por Firebase Authentication.
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
   * Login temporal.
   *
   * Actualmente no autentica realmente al usuario.
   * Solo crea un usuario simulado para probar
   * la interfaz y los permisos.
   */
  const login = (
    role: UserRole,
    tenantId?: string
  ) => {

    const isSuperAdmin =
      role === 'SUPER_ADMIN';

    setUser({
      uid: `usr-${Date.now()}`,

      email: isSuperAdmin
        ? 'admin@kreadu.com'
        : `${role.toLowerCase()}@gestionfuture.com`,

      displayName: isSuperAdmin
        ? 'SuperAdmin Kreadu'
        : 'Admin Cliente',

      role,

      /**
       * SUPER_ADMIN no necesita tenantId.
       */
      ...(tenantId && !isSuperAdmin
        ? { tenantId }
        : {}),

      /**
       * Nombre temporal del tenant.
       *
       * Posteriormente vendrá desde Firestore.
       */
      ...(tenantId && !isSuperAdmin
        ? {
            tenantName:
              'Empresa Alfa S.A.S.',
          }
        : {}),
    });
  };

  /**
   * Cierra la sesión.
   */
  const logout = () => {
    setUser(null);
  };

  /**
   * Cambia el tenant activo.
   *
   * Actualmente solo SUPER_ADMIN puede
   * cambiar de tenant.
   */
  const switchTenant = (
    tenantId: string,
    tenantName: string
  ) => {

    if (
      user &&
      user.role === 'SUPER_ADMIN'
    ) {
      setUser({
        ...user,
        tenantId,
        tenantName,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook para acceder al contexto de autenticación.
 */
export const useAuth = () => {

  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth debe usarse dentro de un AuthProvider'
    );
  }

  return context;
};
