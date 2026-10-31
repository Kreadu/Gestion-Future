/**
 * Envío de la nómina electrónica a la DIAN:
 *
 *   POST /api/payroll-settlements/:id/dian/send    → firma el XML generado y lo envía
 *   POST /api/payroll-settlements/:id/dian/status  → consulta el resultado (habilitación)
 *   GET  /api/payroll-settlements/:id/dian/signed-xml → descarga el XML firmado enviado
 *
 * Las mismas tres rutas existen bajo /api/hourly/settlements/:id/dian/...
 * para la nómina de jornada parcial del personal por horas (los
 * contratistas independientes llevan documento soporte, que no se envía
 * por aquí).
 *
 * Configuración del Worker (secretos): DIAN_CERT_P12 (.p12 en base64),
 * DIAN_CERT_PASSWORD, DIAN_SOFTWARE_ID, DIAN_SOFTWARE_PIN y, en
 * habilitación (DIAN_AMBIENTE distinto de '1'), DIAN_TEST_SET_ID.
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthEnv, type AuthUser } from '../auth/authz';
import { DianNominaXmlService, type DianEnvironment } from '../services/dianNominaXmlService';
import { DianCertificateError, loadPkcs12, signDianXml, type DianCertificate } from '../services/dianSigner';
import { DianServiceError, dianFileNames, getStatusZip, sendNomina, type DianResult } from '../services/dianWebService';
import { findElements, getAttribute, parseXml } from '../services/xmlC14n';

export interface DianRouteEnv extends AuthEnv {
  DIAN_SOFTWARE_ID?: string;
  DIAN_SOFTWARE_PIN?: string;
  DIAN_AMBIENTE?: string;
  DIAN_CERT_P12?: string;
  DIAN_CERT_PASSWORD?: string;
  DIAN_TEST_SET_ID?: string;
}

const NOMINA_NS = 'dian:gov:co:facturaelectronica:NominaIndividual';

export function dianEnvironment(env: DianRouteEnv): DianEnvironment {
  return env.DIAN_AMBIENTE === '1' ? '1' : '2';
}

/** Secretos que faltan para poder enviar en el ambiente configurado. */
export function missingDianSecrets(env: DianRouteEnv): string[] {
  const required: (keyof DianRouteEnv)[] = ['DIAN_CERT_P12', 'DIAN_CERT_PASSWORD', 'DIAN_SOFTWARE_ID', 'DIAN_SOFTWARE_PIN'];
  if (dianEnvironment(env) === '2') required.push('DIAN_TEST_SET_ID');
  return required.filter(name => !env[name]);
}

type SubmissionStatus = 'SENT' | 'ACCEPTED' | 'REJECTED';

/** Estado que se guarda según la respuesta de la DIAN. */
export function submissionStatusFor(result: DianResult, environment: DianEnvironment, sending: boolean): SubmissionStatus {
  if (result.isValid === true) return 'ACCEPTED';
  // Habilitación: el envío sólo devuelve el ZipKey; el resultado llega después.
  if (sending && environment === '2') return result.zipKey ? 'SENT' : 'REJECTED';
  const status = `${result.statusDescription || ''} ${result.statusMessage || ''}`.toLowerCase();
  if (result.statusCode === '98' || status.includes('en proceso')) return 'SENT';
  return result.isValid === false || result.errors.length ? 'REJECTED' : 'SENT';
}

// Abrir el .p12 (PBKDF + 3DES en JS) tarda cientos de ms: se reutiliza
// mientras el isolate siga vivo y no cambien el archivo o la contraseña.
let certificateCache: { key: string; value: Promise<DianCertificate> } | null = null;

function cachedCertificate(p12Base64: string, password: string): Promise<DianCertificate> {
  const key = `${password}\u0000${p12Base64}`;
  if (certificateCache?.key !== key) {
    const value = loadPkcs12(p12Base64, password);
    certificateCache = { key, value };
    // Un fallo (contraseña errada) no se queda en caché.
    value.catch(() => {
      if (certificateCache?.value === value) certificateCache = null;
    });
  }
  return certificateCache.value;
}

/** Liquidación con XML de nómina, venga de la nómina mensual o del personal por horas. */
interface DianSource {
  table: 'payroll_settlements' | 'settlements';
  id: string;
  companyId: string;
  companyNit: string;
  /** XML sin firmar; null si no hay nómina electrónica generada. */
  xml: string | null;
  consecutive: number;
  submissionStatus: SubmissionStatus | null;
  trackId: string | null;
  signedXml: string | null;
  regenerateHint: string;
}

async function loadSource(env: DianRouteEnv, user: AuthUser, kind: 'payroll' | 'hourly', id: string): Promise<DianSource> {
  const row = kind === 'payroll'
    ? await env.DB
      .prepare(`
        SELECT s.*, c.nit AS companyNit
        FROM payroll_settlements s
        JOIN companies c ON c.id = s.companyId
        WHERE s.id = ?1
      `)
      .bind(id)
      .first<any>()
    : await env.DB
      .prepare(`
        SELECT s.*, g.companyId, c.nit AS companyNit
        FROM settlements s
        JOIN engagements g ON g.id = s.engagementId
        JOIN companies c ON c.id = g.companyId
        WHERE s.id = ?1
      `)
      .bind(id)
      .first<any>();
  if (!row) throw new HttpError(404, 'Liquidación no encontrada.');
  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, String(row.companyId));

  let xml: string | null = null;
  let consecutive = Number(row.dianConsecutive || 0);
  if (kind === 'payroll') {
    xml = row.dianStatus === 'GENERATED' && row.dianXmlContent ? String(row.dianXmlContent) : null;
  } else {
    const document = JSON.parse(String(row.resultJson || '{}')).dianDocument;
    // Sólo la nómina de jornada parcial; el documento soporte es otro tipo de documento.
    if (document && typeof document.xmlContent === 'string' && document.xmlContent.includes('<NominaIndividual')) {
      xml = document.xmlContent;
      consecutive = Number(String(document.consecutive || '').replace(/\D/g, '')) || 0;
    }
  }

  return {
    table: kind === 'payroll' ? 'payroll_settlements' : 'settlements',
    id,
    companyId: String(row.companyId),
    companyNit: String(row.companyNit || ''),
    xml,
    consecutive,
    submissionStatus: row.dianSubmissionStatus ?? null,
    trackId: row.dianTrackId ?? null,
    signedXml: row.dianSignedXml ?? null,
    regenerateHint: kind === 'payroll'
      ? 'Vuelve a generarlo antes de enviarlo.'
      : 'Anula la liquidación y vuelve a liquidar el periodo antes de enviarla.',
  };
}

function dianError(error: unknown): never {
  if (error instanceof DianCertificateError) throw new HttpError(409, error.message);
  if (error instanceof DianServiceError) throw new HttpError(502, error.message);
  throw error;
}

async function saveResult(
  env: DianRouteEnv,
  source: DianSource,
  status: SubmissionStatus,
  result: DianResult,
  extra: { signedXml?: string; trackId?: string | null } = {}
): Promise<string | null> {
  const now = new Date().toISOString();
  // payroll_settlements tiene updatedAt; settlements (por horas), no.
  const touch = source.table === 'payroll_settlements' ? ', updatedAt = ?5' : '';
  await env.DB
    .prepare(`
      UPDATE ${source.table}
      SET dianSubmissionStatus = ?1,
          dianResponseJson = ?2,
          dianTrackId = COALESCE(?3, dianTrackId),
          dianSignedXml = COALESCE(?4, dianSignedXml),
          dianSentAt = CASE WHEN ?4 IS NULL THEN dianSentAt ELSE ?5 END${touch}
      WHERE id = ?6
    `)
    .bind(status, JSON.stringify(result), extra.trackId ?? null, extra.signedXml ?? null, now, source.id)
    .run();
  const row = await env.DB
    .prepare(`SELECT dianSentAt FROM ${source.table} WHERE id = ?1`)
    .bind(source.id)
    .first<any>();
  return row?.dianSentAt ?? null;
}

function describe(status: SubmissionStatus, result: DianResult, dianSentAt: string | null) {
  return {
    dianSubmissionStatus: status,
    dianSentAt,
    statusCode: result.statusCode,
    statusDescription: result.statusDescription,
    errors: result.errors,
  };
}

export async function handleDianRoutes(
  request: Request,
  url: URL,
  env: DianRouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(
    /^\/api\/(payroll-settlements|hourly\/settlements)\/([^/]+)\/dian\/(send|status|signed-xml)$/
  );
  if (!match) return null;

  const [, prefix, rawId, action] = match;
  const kind = prefix === 'payroll-settlements' ? 'payroll' : 'hourly';
  const id = decodeURIComponent(rawId);
  const environment = dianEnvironment(env);

  if (action === 'signed-xml') {
    if (request.method !== 'GET') return null;
    const source = await loadSource(env, user, kind, id);
    if (!source.signedXml) throw new HttpError(404, 'Esta liquidación aún no se ha enviado a la DIAN.');
    return new Response(source.signedXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="nomina-${source.consecutive}.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.method !== 'POST') return null;
  const source = await loadSource(env, user, kind, id);

  if (!source.xml) {
    throw new HttpError(400, 'Primero genera el XML DIAN de esta liquidación.');
  }

  const missing = missingDianSecrets(env);
  if (missing.length) {
    throw new HttpError(
      409,
      `Falta configurar en el servidor: ${missing.join(', ')}. ` +
        'Se necesitan el certificado digital y los datos de habilitación de la DIAN.'
    );
  }

  let certificate;
  try {
    certificate = await cachedCertificate(env.DIAN_CERT_P12!, env.DIAN_CERT_PASSWORD!);
  } catch (error) {
    dianError(error);
  }
  if (certificate.notAfter.getTime() < Date.now()) {
    throw new HttpError(409, 'El certificado digital está vencido.');
  }

  if (action === 'status') {
    if (source.submissionStatus !== 'SENT' || !source.trackId) {
      throw new HttpError(400, 'No hay un envío en proceso para consultar.');
    }
    let result: DianResult;
    try {
      result = await getStatusZip(environment, source.trackId, certificate);
    } catch (error) {
      dianError(error);
    }
    const status = submissionStatusFor(result, environment, false);
    const sentAt = await saveResult(env, source, status, result);
    return sendJson({ success: true, data: describe(status, result, sentAt) });
  }

  // action === 'send'
  if (source.submissionStatus === 'ACCEPTED') {
    throw new HttpError(409, 'La DIAN ya aceptó este documento.');
  }
  if (source.submissionStatus === 'SENT') {
    throw new HttpError(409, 'El documento ya está en proceso en la DIAN: consulta su estado.');
  }

  // El XML lleva el SoftwareSC de las credenciales con que se generó; si
  // cambiaron (p. ej. se generó con las de prueba), la DIAN lo rechazaría.
  const root = parseXml(source.xml);
  const provider = findElements(root, NOMINA_NS, 'ProveedorXML')[0];
  const number = findElements(root, NOMINA_NS, 'NumeroSecuenciaXML')[0];
  const expectedSC = await DianNominaXmlService.calculateSoftwareSC(
    env.DIAN_SOFTWARE_ID!,
    env.DIAN_SOFTWARE_PIN!,
    String(number && getAttribute(number, 'Numero'))
  );
  const info = findElements(root, NOMINA_NS, 'InformacionGeneral')[0];
  if (!provider || getAttribute(provider, 'SoftwareSC') !== expectedSC || getAttribute(info, 'Ambiente') !== environment) {
    throw new HttpError(
      409,
      'El XML se generó con otras credenciales de software o en otro ambiente. ' + source.regenerateHint
    );
  }

  let signedXml: string;
  let result: DianResult;
  try {
    signedXml = await signDianXml(source.xml, certificate);
    const issueYear = Number(String(getAttribute(info, 'FechaGen') || '').slice(0, 4)) || new Date().getUTCFullYear();
    result = await sendNomina({
      environment,
      signedXml,
      fileNames: dianFileNames(source.companyNit, issueYear, source.consecutive),
      testSetId: env.DIAN_TEST_SET_ID,
      certificate,
    });
  } catch (error) {
    dianError(error);
  }

  const status = submissionStatusFor(result, environment, true);
  const sentAt = await saveResult(env, source, status, result, { signedXml, trackId: result.zipKey });
  await audit(env, user, 'SEND_DIAN', source.table === 'payroll_settlements' ? 'payroll_settlement' : 'settlement', id, source.companyId);

  return sendJson({ success: true, data: describe(status, result, sentAt) });
}
