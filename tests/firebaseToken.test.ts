import { describe, test, expect } from '@jest/globals';
import {
  generateKeyPair,
  exportJWK,
  SignJWT,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type KeyLike,
} from 'jose';

import {
  verifyFirebaseIdToken,
  TokenVerificationError,
} from '../src/auth/firebaseToken';

const PROJECT_ID = 'gestion-future-test';
const KID = 'test-key-1';

async function buildKeySet() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = KID;
  jwk.alg = 'RS256';

  const keySet: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });

  return { privateKey, keySet };
}

async function signToken(
  privateKey: KeyLike,
  overrides: {
    issuer?: string;
    audience?: string;
    subject?: string;
    expiresIn?: string;
    emailVerified?: boolean;
    email?: string;
  } = {}
): Promise<string> {
  return new SignJWT({
    email: overrides.email ?? 'admin@empresa.com',
    email_verified: overrides.emailVerified ?? true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(
      overrides.issuer ?? `https://securetoken.google.com/${PROJECT_ID}`
    )
    .setAudience(overrides.audience ?? PROJECT_ID)
    .setSubject(overrides.subject ?? 'firebase-uid-123')
    .setExpirationTime(overrides.expiresIn ?? '1h')
    .sign(privateKey);
}

describe('verifyFirebaseIdToken', () => {
  test('acepta un token válido y devuelve uid/email', async () => {
    const { privateKey, keySet } = await buildKeySet();
    const token = await signToken(privateKey);

    const result = await verifyFirebaseIdToken(token, PROJECT_ID, keySet);

    expect(result.uid).toBe('firebase-uid-123');
    expect(result.email).toBe('admin@empresa.com');
    expect(result.emailVerified).toBe(true);
  });

  test('rechaza un audience incorrecto', async () => {
    const { privateKey, keySet } = await buildKeySet();
    const token = await signToken(privateKey, { audience: 'otro-proyecto' });

    await expect(
      verifyFirebaseIdToken(token, PROJECT_ID, keySet)
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  test('rechaza un issuer incorrecto', async () => {
    const { privateKey, keySet } = await buildKeySet();
    const token = await signToken(privateKey, {
      issuer: 'https://securetoken.google.com/otro-proyecto',
    });

    await expect(
      verifyFirebaseIdToken(token, PROJECT_ID, keySet)
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  test('rechaza un token expirado', async () => {
    const { privateKey, keySet } = await buildKeySet();
    const token = await signToken(privateKey, { expiresIn: '-1h' });

    await expect(
      verifyFirebaseIdToken(token, PROJECT_ID, keySet)
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  test('rechaza un token firmado con otra clave', async () => {
    const { keySet } = await buildKeySet();
    const other = await generateKeyPair('RS256');
    const token = await signToken(other.privateKey);

    await expect(
      verifyFirebaseIdToken(token, PROJECT_ID, keySet)
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });

  test('rechaza un token vacío sin llamar al keySet', async () => {
    await expect(
      verifyFirebaseIdToken('', PROJECT_ID, (() => {
        throw new Error('no debería consultarse el keySet');
      }) as unknown as JWTVerifyGetKey)
    ).rejects.toBeInstanceOf(TokenVerificationError);
  });
});
