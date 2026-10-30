import forge from 'node-forge';

// tsconfig no incluye los tipos de Node (igual que tests/helpers/api.ts).
declare const require: (id: string) => any;
const { generateKeyPairSync } = require('crypto');

export interface TestCertificate {
  p12Base64: string;
  password: string;
  certPem: string;
}

/**
 * Certificado fijo de tests/fixtures (sólo para pruebas, autofirmado). Generar
 * el .p12 dentro de Jest tarda varios segundos (RSA de node-forge en JS puro);
 * para regenerarlo, compilar este archivo y guardar el resultado de makeTestP12().
 */
export function testP12(): TestCertificate {
  return require('../fixtures/dian-test-cert.json');
}

/** Certificado autofirmado empaquetado en .p12, como el que entrega una entidad certificadora. */
export function makeTestP12(password = 'clave-prueba'): TestCertificate {
  const { privateKey: keyPem } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const key = forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey;

  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  cert.serialNumber = '0a1b2c3d';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2028-01-01T00:00:00Z');
  const attrs = [
    { shortName: 'C', value: 'CO' },
    { shortName: 'O', value: 'Entidad, Prueba' },
    { shortName: 'CN', value: 'Empresa de prueba' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(key, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(key, [cert], password, { algorithm: '3des' });
  return {
    p12Base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()),
    password,
    certPem: forge.pki.certificateToPem(cert),
  };
}
