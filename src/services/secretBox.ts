/**
 * Cifrado de datos sensibles guardados en D1 (certificados DIAN, PIN,
 * contraseñas) con AES-256-GCM. La llave sale del secreto del Worker
 * DIAN_CONFIG_KEY (cualquier texto largo y aleatorio, p. ej.
 * `openssl rand -base64 32`); sin él no se puede guardar ni leer nada.
 *
 * Formato guardado: "v1:" + base64(iv de 12 bytes + texto cifrado).
 */

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretBoxError';
  }
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle
      .digest('SHA-256', new TextEncoder().encode(`gestion-future/dian-config/${secret}`))
      .then(raw => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
    keyCache.set(secret, key);
  }
  return key;
}

function requireSecret(secret: string | undefined): string {
  if (!secret || secret.length < 16) {
    throw new SecretBoxError(
      'Falta configurar en el servidor DIAN_CONFIG_KEY (llave para cifrar los certificados).'
    );
  }
  return secret;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function sealSecret(secret: string | undefined, plaintext: string): Promise<string> {
  const key = await keyFor(requireSecret(secret));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  );
  const out = new Uint8Array(iv.length + encrypted.length);
  out.set(iv);
  out.set(encrypted, iv.length);
  return 'v1:' + toBase64(out);
}

export async function openSecret(secret: string | undefined, sealed: string): Promise<string> {
  const key = await keyFor(requireSecret(secret));
  if (!sealed.startsWith('v1:')) throw new SecretBoxError('Dato cifrado con un formato desconocido.');
  const bytes = Uint8Array.from(atob(sealed.slice(3)), c => c.charCodeAt(0));
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12));
    return new TextDecoder().decode(plain);
  } catch {
    throw new SecretBoxError('No se pudo descifrar la configuración DIAN: ¿cambió DIAN_CONFIG_KEY?');
  }
}
