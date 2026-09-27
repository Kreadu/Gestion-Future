/**
 * Verificación de ID tokens de Firebase Authentication.
 *
 * No usamos `firebase-admin` porque no corre en el runtime de
 * Cloudflare Workers. En su lugar verificamos el JWT nosotros mismos
 * con `jose` contra las claves públicas (JWKS) que Google publica
 * para el proyecto de Firebase.
 */

import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks: JWTVerifyGetKey | null = null;

/**
 * El JWKS remoto se cachea a nivel de módulo (sobrevive entre
 * requests dentro de la misma instancia del Worker) para no
 * descargar las claves de Google en cada verificación.
 */
function getGoogleJwks(): JWTVerifyGetKey {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }

  return cachedJwks;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export class TokenVerificationError extends Error {}

/**
 * Verifica un ID token de Firebase emitido para `projectId`.
 *
 * `keySet` es inyectable para poder probar la función con un JWKS
 * local (ver tests/firebaseToken.test.ts); en producción siempre se
 * usa el JWKS remoto de Google.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  keySet: JWTVerifyGetKey = getGoogleJwks()
): Promise<VerifiedFirebaseUser> {
  if (!token) {
    throw new TokenVerificationError('Token vacío.');
  }

  if (!projectId) {
    throw new TokenVerificationError(
      'No hay un projectId de Firebase configurado.'
    );
  }

  let payload;

  try {
    const result = await jwtVerify(token, keySet, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });

    payload = result.payload;
  } catch (error) {
    throw new TokenVerificationError('Token inválido o expirado.');
  }

  const uid = typeof payload.sub === 'string' ? payload.sub : '';

  if (!uid) {
    throw new TokenVerificationError(
      'El token no tiene un identificador de usuario válido.'
    );
  }

  return {
    uid,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
  };
}
