/**
 * Firma XAdES-EPES de los documentos DIAN (anexo técnico de nómina
 * electrónica, política de firma v2), sin APIs de Node: corre en
 * Cloudflare Workers.
 *
 *   - El certificado llega como PKCS#12 (.p12/.pfx) en base64; node-forge
 *     lo abre y la llave privada se importa en WebCrypto para firmar.
 *   - Firma "enveloped" dentro de ext:UBLExtensions/ext:ExtensionContent,
 *     con tres referencias: el documento, el KeyInfo y las
 *     SignedProperties. C14N 1.0 inclusivo, RSA-SHA256 y SHA-256.
 */
import forge from 'node-forge';
import { canonicalize, findById, parseXml, type XmlElement } from './xmlC14n';

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const RSA_SHA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

export const DIAN_POLICY_URL =
  'https://facturaelectronica.dian.gov.co/politicadefirma/v2/politicadefirmav2.pdf';
/** SHA-256 (base64) del PDF de la política de firma v2 de la DIAN. */
export const DIAN_POLICY_HASH = 'dMoMvtcG5aIzgYo0tIsSQeVJBDnUnfSOfBpxXrmor0Y=';

export interface DianCertificate {
  privateKey: CryptoKey;
  /** Certificado X.509 en DER, codificado en base64. */
  certificateBase64: string;
  issuerName: string;
  /** Número de serie en decimal. */
  serialNumber: string;
  notAfter: Date;
}

export class DianCertificateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DianCertificateError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function binaryStringToBytes(binary: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Base64(data: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

/** Nombre del emisor al estilo RFC 2253 (del atributo más específico al más general). */
function issuerNameOf(cert: forge.pki.Certificate): string {
  return cert.issuer.attributes
    .slice()
    .reverse()
    .map(attr => `${attr.shortName || attr.type}=${String(attr.value).replace(/([,+"\\<>;])/g, '\\$1')}`)
    .join(',');
}

/** Abre el .p12 y devuelve la llave lista para WebCrypto y los datos del certificado. */
export async function loadPkcs12(p12Base64: string, password: string): Promise<DianCertificate> {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.decode64(p12Base64.replace(/\s+/g, '')));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch {
    throw new DianCertificateError('No se pudo abrir el certificado .p12: archivo dañado o contraseña incorrecta.');
  }

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];
  const key = keyBags.find(bag => bag.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!key) throw new DianCertificateError('El .p12 no contiene una llave privada RSA.');

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map(bag => bag.cert)
    .filter((cert): cert is forge.pki.Certificate => Boolean(cert));
  // En la cadena puede venir la CA: el certificado firmante es el de la misma llave.
  const cert = certs.find(c => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(key.n));
  if (!cert) throw new DianCertificateError('El .p12 no contiene el certificado de su llave privada.');

  const pkcs8Der = forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key))).getBytes();
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryStringToBytes(pkcs8Der),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();

  return {
    privateKey,
    certificateBase64: forge.util.encode64(certDer),
    issuerName: issuerNameOf(cert),
    serialNumber: BigInt('0x' + cert.serialNumber).toString(10),
    notAfter: cert.validity.notAfter,
  };
}

export async function signWithKey(privateKey: CryptoKey, data: string): Promise<string> {
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(data));
  return bytesToBase64(new Uint8Array(signature));
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Hora de Colombia en formato xs:dateTime con zona. */
function colombiaDateTime(date: Date): string {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-05:00';
}

function requireById(root: XmlElement, id: string): XmlElement {
  const element = findById(root, id);
  if (!element) throw new Error(`No se encontró el nodo #${id} de la firma.`);
  return element;
}

/**
 * Firma un XML DIAN que ya trae `<ext:ExtensionContent></ext:ExtensionContent>`
 * vacío (lo genera DianNominaXmlService) y declara los prefijos ds y xades.
 */
export async function signDianXml(
  xml: string,
  certificate: DianCertificate,
  signingTime: Date = new Date()
): Promise<string> {
  const slot = '<ext:ExtensionContent></ext:ExtensionContent>';
  if (xml.split(slot).length !== 2) {
    throw new Error('El XML no tiene un único ext:ExtensionContent vacío para la firma.');
  }

  const id = `xmldsig-${crypto.randomUUID()}`;
  const certDigest = await sha256Base64(binaryStringToBytes(atob(certificate.certificateBase64)));

  const signature =
    `<ds:Signature Id="${id}">` +
      `<ds:SignedInfo>` +
        `<ds:CanonicalizationMethod Algorithm="${C14N}"/>` +
        `<ds:SignatureMethod Algorithm="${RSA_SHA256}"/>` +
        `<ds:Reference Id="${id}-ref0" URI="">` +
          `<ds:Transforms><ds:Transform Algorithm="${ENVELOPED}"/></ds:Transforms>` +
          `<ds:DigestMethod Algorithm="${SHA256}"/>` +
          `<ds:DigestValue>@@DOC@@</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference URI="#${id}-keyinfo">` +
          `<ds:DigestMethod Algorithm="${SHA256}"/>` +
          `<ds:DigestValue>@@KEYINFO@@</ds:DigestValue>` +
        `</ds:Reference>` +
        `<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${id}-signedprops">` +
          `<ds:DigestMethod Algorithm="${SHA256}"/>` +
          `<ds:DigestValue>@@PROPS@@</ds:DigestValue>` +
        `</ds:Reference>` +
      `</ds:SignedInfo>` +
      `<ds:SignatureValue Id="${id}-sigvalue">@@SIGNATURE@@</ds:SignatureValue>` +
      `<ds:KeyInfo Id="${id}-keyinfo">` +
        `<ds:X509Data><ds:X509Certificate>${certificate.certificateBase64}</ds:X509Certificate></ds:X509Data>` +
      `</ds:KeyInfo>` +
      `<ds:Object>` +
        `<xades:QualifyingProperties Target="#${id}">` +
          `<xades:SignedProperties Id="${id}-signedprops">` +
            `<xades:SignedSignatureProperties>` +
              `<xades:SigningTime>${colombiaDateTime(signingTime)}</xades:SigningTime>` +
              `<xades:SigningCertificate><xades:Cert>` +
                `<xades:CertDigest><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${certDigest}</ds:DigestValue></xades:CertDigest>` +
                `<xades:IssuerSerial>` +
                  `<ds:X509IssuerName>${escapeXml(certificate.issuerName)}</ds:X509IssuerName>` +
                  `<ds:X509SerialNumber>${certificate.serialNumber}</ds:X509SerialNumber>` +
                `</xades:IssuerSerial>` +
              `</xades:Cert></xades:SigningCertificate>` +
              `<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId>` +
                `<xades:SigPolicyId><xades:Identifier>${DIAN_POLICY_URL}</xades:Identifier></xades:SigPolicyId>` +
                `<xades:SigPolicyHash><ds:DigestMethod Algorithm="${SHA256}"/><ds:DigestValue>${DIAN_POLICY_HASH}</ds:DigestValue></xades:SigPolicyHash>` +
              `</xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>` +
              `<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>supplier</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>` +
            `</xades:SignedSignatureProperties>` +
          `</xades:SignedProperties>` +
        `</xades:QualifyingProperties>` +
      `</ds:Object>` +
    `</ds:Signature>`;

  let signed = xml.replace(slot, `<ext:ExtensionContent>${signature}</ext:ExtensionContent>`);

  const draft = parseXml(signed);
  const signatureElement = requireById(draft, id);
  const docDigest = await sha256Base64(canonicalize(draft, { exclude: el => el === signatureElement }));
  const keyInfoDigest = await sha256Base64(canonicalize(requireById(draft, `${id}-keyinfo`)));
  const propsDigest = await sha256Base64(canonicalize(requireById(draft, `${id}-signedprops`)));

  signed = signed
    .replace('@@DOC@@', docDigest)
    .replace('@@KEYINFO@@', keyInfoDigest)
    .replace('@@PROPS@@', propsDigest);

  const signedInfo = parseXml(signed);
  const signedInfoElement = requireById(signedInfo, id).children
    .find((child): child is XmlElement => child.type === 'element' && child.localName === 'SignedInfo');
  if (!signedInfoElement) throw new Error('Falta ds:SignedInfo.');

  const signatureValue = await signWithKey(certificate.privateKey, canonicalize(signedInfoElement));
  return signed.replace('@@SIGNATURE@@', signatureValue);
}
