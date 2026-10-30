/**
 * Envío de la nómina electrónica a la DIAN:
 *
 *   POST /api/payroll-settlements/:id/dian/send    → firma el XML generado y lo envía
 *   POST /api/payroll-settlements/:id/dian/status  → consulta el resultado (habilitación)
 *   GET  /api/payroll-settlements/:id/dian/signed-xml → descarga el XML firmado enviado
 *
 * Configuración del Worker (secretos): DIAN_CERT_P12 (.p12 en base64),
 * DIAN_CERT_PASSWORD, DIAN_SOFTWARE_ID, DIAN_SOFTWARE_PIN y, en
 * habilitación (DIAN_AMBIENTE distinto de '1'), DIAN_TEST_SET_ID.
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthEnv, type AuthUser } from '../auth/authz';
import { DianNominaXmlService, type DianEnvironment } from '../services/dianNominaXmlService';
import { DianCertificateError, loadPkcs12, signDianXml } from '../services/dianSigner';
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

async function loadSettlement(env: DianRouteEnv, user: AuthUser, id: string): Promise<any> {
  const row = await env.DB
    .prepare(`
      SELECT s.*, c.nit AS companyNit
      FROM payroll_settlements s
      JOIN companies c ON c.id = s.companyId
      WHERE s.id = ?1
    `)
    .bind(id)
    .first<any>();
  if (!row) throw new HttpError(404, 'Liquidación no encontrada.');
  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, String(row.companyId));
  return row;
}

function dianError(error: unknown): never {
  if (error instanceof DianCertificateError) throw new HttpError(409, error.message);
  if (error instanceof DianServiceError) throw new HttpError(502, error.message);
  throw error;
}

async function saveResult(
  env: DianRouteEnv,
  id: string,
  status: SubmissionStatus,
  result: DianResult,
  extra: { signedXml?: string; trackId?: string | null } = {}
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB
    .prepare(`
      UPDATE payroll_settlements
      SET dianSubmissionStatus = ?1,
          dianResponseJson = ?2,
          dianTrackId = COALESCE(?3, dianTrackId),
          dianSignedXml = COALESCE(?4, dianSignedXml),
          dianSentAt = CASE WHEN ?4 IS NULL THEN dianSentAt ELSE ?5 END,
          updatedAt = ?5
      WHERE id = ?6
    `)
    .bind(status, JSON.stringify(result), extra.trackId ?? null, extra.signedXml ?? null, now, id)
    .run();
}

function describe(status: SubmissionStatus, result: DianResult) {
  return {
    dianSubmissionStatus: status,
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
  const match = url.pathname.match(/^\/api\/payroll-settlements\/([^/]+)\/dian\/(send|status|signed-xml)$/);
  if (!match) return null;

  const [, id, action] = match;
  const environment = dianEnvironment(env);

  if (action === 'signed-xml') {
    if (request.method !== 'GET') return null;
    const row = await loadSettlement(env, user, id);
    if (!row.dianSignedXml) throw new HttpError(404, 'Esta liquidación aún no se ha enviado a la DIAN.');
    return new Response(String(row.dianSignedXml), {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="nomina-${row.dianConsecutive}.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.method !== 'POST') return null;
  const row = await loadSettlement(env, user, id);

  if (row.dianStatus !== 'GENERATED' || !row.dianXmlContent) {
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
    certificate = await loadPkcs12(env.DIAN_CERT_P12!, env.DIAN_CERT_PASSWORD!);
  } catch (error) {
    dianError(error);
  }
  if (certificate.notAfter.getTime() < Date.now()) {
    throw new HttpError(409, 'El certificado digital está vencido.');
  }

  if (action === 'status') {
    if (row.dianSubmissionStatus !== 'SENT' || !row.dianTrackId) {
      throw new HttpError(400, 'No hay un envío en proceso para consultar.');
    }
    let result: DianResult;
    try {
      result = await getStatusZip(environment, String(row.dianTrackId), certificate);
    } catch (error) {
      dianError(error);
    }
    const status = submissionStatusFor(result, environment, false);
    await saveResult(env, id, status, result);
    return sendJson({ success: true, data: describe(status, result) });
  }

  // action === 'send'
  if (row.dianSubmissionStatus === 'ACCEPTED') {
    throw new HttpError(409, 'La DIAN ya aceptó este documento.');
  }
  if (row.dianSubmissionStatus === 'SENT') {
    throw new HttpError(409, 'El documento ya está en proceso en la DIAN: consulta su estado.');
  }

  // El XML lleva el SoftwareSC de las credenciales con que se generó; si
  // cambiaron (p. ej. se generó con las de prueba), la DIAN lo rechazaría.
  const xml = String(row.dianXmlContent);
  const root = parseXml(xml);
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
      'El XML se generó con otras credenciales de software o en otro ambiente. Vuelve a generarlo antes de enviarlo.'
    );
  }

  let signedXml: string;
  let result: DianResult;
  try {
    signedXml = await signDianXml(xml, certificate);
    const issueYear = Number(String(getAttribute(info, 'FechaGen') || '').slice(0, 4)) || new Date().getUTCFullYear();
    result = await sendNomina({
      environment,
      signedXml,
      fileNames: dianFileNames(String(row.companyNit || ''), issueYear, Number(row.dianConsecutive || 0)),
      testSetId: env.DIAN_TEST_SET_ID,
      certificate,
    });
  } catch (error) {
    dianError(error);
  }

  const status = submissionStatusFor(result, environment, true);
  await saveResult(env, id, status, result, { signedXml, trackId: result.zipKey });
  await audit(env, user, 'SEND_DIAN', 'payroll_settlement', id, String(row.companyId));

  return sendJson({ success: true, data: describe(status, result) });
}
