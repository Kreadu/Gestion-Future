/**
 * Cliente del servicio web de la DIAN (WcfDianCustomerServices) para la
 * nómina electrónica, sin APIs de Node (corre en Cloudflare Workers).
 *
 *   - Habilitación (ambiente 2): SendTestSetAsync con el TestSetId; la DIAN
 *     devuelve un ZipKey y el resultado se consulta con GetStatusZip.
 *   - Producción (ambiente 1): SendNominaSync responde en la misma llamada.
 *
 * El XML firmado viaja dentro de un .zip en base64. El sobre SOAP 1.2 se
 * firma con WS-Security (certificado X.509, exc-c14n, RSA-SHA256) sobre
 * el encabezado wsa:To, como exige la DIAN.
 */
import { canonicalize, findById, parseXml, walk, textContent, type XmlElement } from './xmlC14n';
import { signWithKey, type DianCertificate } from './dianSigner';
import type { DianEnvironment } from './dianNominaXmlService';

export const DIAN_ENDPOINTS: Record<DianEnvironment, string> = {
  '1': 'https://vpfe.dian.gov.co/WcfDianCustomerServices.svc',
  '2': 'https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc',
};

const ACTION_BASE = 'http://wcf.dian.colombia/IWcfDianCustomerServices/';
const WSU = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
const WSSE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const X509V3 = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-x509-token-profile-1.0#X509v3';
const BASE64_BINARY = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';

// ------------------------------------------------------------
// ZIP (un solo archivo, deflate)
// ------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** .zip con un único archivo comprimido (método 8, deflate). */
export async function zipSingleFile(fileName: string, content: string, date: Date = new Date()): Promise<Uint8Array> {
  const name = new TextEncoder().encode(fileName);
  const raw = new TextEncoder().encode(content);
  const compressed = await deflateRaw(raw);
  const crc = crc32(raw);

  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const dosDate = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();

  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0x0800, true); // nombres en UTF-8
  local.setUint16(8, 8, true);
  local.setUint16(10, dosTime, true);
  local.setUint16(12, dosDate, true);
  local.setUint32(14, crc, true);
  local.setUint32(18, compressed.length, true);
  local.setUint32(22, raw.length, true);
  local.setUint16(26, name.length, true);
  local.setUint16(28, 0, true);

  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(4, 20, true);
  central.setUint16(6, 20, true);
  central.setUint16(8, 0x0800, true);
  central.setUint16(10, 8, true);
  central.setUint16(12, dosTime, true);
  central.setUint16(14, dosDate, true);
  central.setUint32(16, crc, true);
  central.setUint32(20, compressed.length, true);
  central.setUint32(24, raw.length, true);
  central.setUint16(28, name.length, true);
  // extra, comentario, disco, atributos y desplazamiento (0): ya en cero.

  const centralOffset = 30 + name.length + compressed.length;
  const centralSize = 46 + name.length;

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, 1, true);
  end.setUint16(10, 1, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);

  const parts = [new Uint8Array(local.buffer), name, compressed, new Uint8Array(central.buffer), name, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Nombres de archivo del anexo: nie + NIT (10 dígitos) + código del
 * proveedor (000 = software propio) + año (2 dígitos) + consecutivo
 * en hexadecimal (8 dígitos); el .zip empieza por "z".
 */
export function dianFileNames(
  nit: string,
  year: number,
  sequence: number,
  /** nie = nómina individual; nia = nota de ajuste; ds = documento soporte. */
  prefix: 'nie' | 'nia' | 'ds' = 'nie'
): { xml: string; zip: string } {
  const base =
    nit.replace(/\D/g, '').padStart(10, '0').slice(-10) +
    '000' +
    String(year % 100).padStart(2, '0') +
    sequence.toString(16).padStart(8, '0');
  return { xml: `${prefix}${base}.xml`, zip: `z${base}.zip` };
}

// ------------------------------------------------------------
// SOBRE SOAP FIRMADO
// ------------------------------------------------------------

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sha256Base64(data: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)));
  return bytesToBase64(digest);
}

export async function buildSignedEnvelope(
  operation: string,
  bodyXml: string,
  endpoint: string,
  certificate: DianCertificate,
  now: Date = new Date()
): Promise<string> {
  const uid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  const created = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const expires = new Date(now.getTime() + 60 * 60 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');

  const envelope =
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:wcf="http://wcf.dian.colombia">` +
      `<soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">` +
        `<wsse:Security xmlns:wsse="${WSSE}" xmlns:wsu="${WSU}">` +
          `<wsu:Timestamp wsu:Id="TS-${uid}"><wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires></wsu:Timestamp>` +
          `<wsse:BinarySecurityToken EncodingType="${BASE64_BINARY}" ValueType="${X509V3}" wsu:Id="X509-${uid}">${certificate.certificateBase64}</wsse:BinarySecurityToken>` +
          `<ds:Signature Id="SIG-${uid}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
            `<ds:SignedInfo>` +
              `<ds:CanonicalizationMethod Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces PrefixList="wsa soap wcf" xmlns:ec="${EXC_C14N}"/></ds:CanonicalizationMethod>` +
              `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
              `<ds:Reference URI="#id-${uid}">` +
                `<ds:Transforms><ds:Transform Algorithm="${EXC_C14N}"><ec:InclusiveNamespaces PrefixList="soap wcf" xmlns:ec="${EXC_C14N}"/></ds:Transform></ds:Transforms>` +
                `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
                `<ds:DigestValue>@@DIGEST@@</ds:DigestValue>` +
              `</ds:Reference>` +
            `</ds:SignedInfo>` +
            `<ds:SignatureValue>@@SIGNATURE@@</ds:SignatureValue>` +
            `<ds:KeyInfo Id="KI-${uid}"><wsse:SecurityTokenReference wsu:Id="STR-${uid}"><wsse:Reference URI="#X509-${uid}" ValueType="${X509V3}"/></wsse:SecurityTokenReference></ds:KeyInfo>` +
          `</ds:Signature>` +
        `</wsse:Security>` +
        `<wsa:Action>${ACTION_BASE}${operation}</wsa:Action>` +
        `<wsa:To wsu:Id="id-${uid}" xmlns:wsu="${WSU}">${escapeXml(endpoint)}</wsa:To>` +
      `</soap:Header>` +
      `<soap:Body>${bodyXml}</soap:Body>` +
    `</soap:Envelope>`;

  const draft = parseXml(envelope);
  const to = findById(draft, `id-${uid}`)!;
  const digest = await sha256Base64(canonicalize(to, { exclusive: true, inclusivePrefixes: ['soap', 'wcf'] }));

  const withDigest = envelope.replace('@@DIGEST@@', digest);
  const signedInfo = [...walk(parseXml(withDigest))].find(el => el.localName === 'SignedInfo')!;
  const signature = await signWithKey(
    certificate.privateKey,
    canonicalize(signedInfo, { exclusive: true, inclusivePrefixes: ['wsa', 'soap', 'wcf'] })
  );
  return withDigest.replace('@@SIGNATURE@@', signature);
}

// ------------------------------------------------------------
// RESPUESTAS
// ------------------------------------------------------------

export interface DianResult {
  /** true = la DIAN validó el documento; null = aún en proceso o sin dato. */
  isValid: boolean | null;
  statusCode: string | null;
  statusDescription: string | null;
  statusMessage: string | null;
  errors: string[];
  zipKey: string | null;
  documentKey: string | null;
}

function childText(element: XmlElement, localName: string): string | null {
  for (const el of walk(element)) {
    if (el !== element && el.localName === localName) {
      const value = textContent(el).trim();
      return value || null;
    }
  }
  return null;
}

export class DianServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'DianServiceError';
  }
}

export function parseDianResponse(xml: string): DianResult {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch {
    throw new DianServiceError('La DIAN respondió algo que no es XML.');
  }

  const all = [...walk(root)];
  const fault = all.find(el => el.localName === 'Fault');
  if (fault) {
    const reason = childText(fault, 'Text') || childText(fault, 'faultstring') || 'Error SOAP sin descripción.';
    throw new DianServiceError(`La DIAN rechazó la solicitud: ${reason}`);
  }

  // GetStatusZip devuelve una lista de DianResponse; los envíos, un *Result.
  const scope =
    all.find(el => el.localName === 'DianResponse') ||
    all.find(el => el.localName.endsWith('Result')) ||
    root;

  const errors: string[] = [];
  for (const el of walk(scope)) {
    if (el.localName === 'ErrorMessage' || el.localName === 'ErrorMessageList') {
      for (const item of walk(el)) {
        if (item === el) continue;
        if (item.localName === 'string' || item.localName === 'ProcessedMessage') {
          const value = textContent(item).trim();
          if (value) errors.push(value);
        }
      }
    }
  }

  const isValidText = childText(scope, 'IsValid');
  return {
    isValid: isValidText === null ? null : isValidText.toLowerCase() === 'true',
    statusCode: childText(scope, 'StatusCode'),
    statusDescription: childText(scope, 'StatusDescription'),
    statusMessage: childText(scope, 'StatusMessage'),
    errors,
    zipKey: childText(root, 'ZipKey'),
    documentKey: childText(scope, 'XmlDocumentKey'),
  };
}

// ------------------------------------------------------------
// OPERACIONES
// ------------------------------------------------------------

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

async function callDian(
  environment: DianEnvironment,
  operation: string,
  bodyXml: string,
  certificate: DianCertificate,
  fetchImpl: FetchLike
): Promise<DianResult> {
  const endpoint = DIAN_ENDPOINTS[environment];
  const envelope = await buildSignedEnvelope(operation, bodyXml, endpoint, certificate);

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml;charset=UTF-8;action="${ACTION_BASE}${operation}"`,
      },
      body: envelope,
    });
  } catch (error) {
    throw new DianServiceError(`No se pudo conectar con la DIAN: ${(error as Error).message}`);
  }

  const text = await response.text();
  if (!response.ok && !text.includes('Fault')) {
    throw new DianServiceError(`La DIAN respondió HTTP ${response.status}.`, response.status);
  }
  return parseDianResponse(text);
}

export interface SendNominaInput {
  environment: DianEnvironment;
  signedXml: string;
  fileNames: { xml: string; zip: string };
  /** Obligatorio en habilitación (ambiente 2). */
  testSetId?: string;
  certificate: DianCertificate;
  fetchImpl?: FetchLike;
  /** Documento soporte: en producción va por SendBillSync, como la factura. */
  documentoSoporte?: boolean;
}

export async function sendNomina(input: SendNominaInput): Promise<DianResult> {
  const zip = bytesToBase64(await zipSingleFile(input.fileNames.xml, input.signedXml));
  const fetchImpl = input.fetchImpl || ((url, init) => fetch(url, init));

  if (input.environment === '2') {
    if (!input.testSetId) throw new DianServiceError('Falta el TestSetId de habilitación.');
    return callDian(
      '2',
      'SendTestSetAsync',
      `<wcf:SendTestSetAsync><wcf:fileName>${escapeXml(input.fileNames.zip)}</wcf:fileName>` +
        `<wcf:contentFile>${zip}</wcf:contentFile><wcf:testSetId>${escapeXml(input.testSetId)}</wcf:testSetId></wcf:SendTestSetAsync>`,
      input.certificate,
      fetchImpl
    );
  }

  if (input.documentoSoporte) {
    return callDian(
      '1',
      'SendBillSync',
      `<wcf:SendBillSync><wcf:fileName>${escapeXml(input.fileNames.zip)}</wcf:fileName>` +
        `<wcf:contentFile>${zip}</wcf:contentFile></wcf:SendBillSync>`,
      input.certificate,
      fetchImpl
    );
  }

  return callDian(
    '1',
    'SendNominaSync',
    `<wcf:SendNominaSync><wcf:contentFile>${zip}</wcf:contentFile></wcf:SendNominaSync>`,
    input.certificate,
    fetchImpl
  );
}

export async function getStatusZip(
  environment: DianEnvironment,
  trackId: string,
  certificate: DianCertificate,
  fetchImpl: FetchLike = (url, init) => fetch(url, init)
): Promise<DianResult> {
  return callDian(
    environment,
    'GetStatusZip',
    `<wcf:GetStatusZip><wcf:trackId>${escapeXml(trackId)}</wcf:trackId></wcf:GetStatusZip>`,
    certificate,
    fetchImpl
  );
}
