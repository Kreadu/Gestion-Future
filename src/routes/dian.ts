/**
 * Envío de la nómina electrónica a la DIAN:
 *
 *   POST /api/payroll-settlements/:id/dian/send    → firma el XML generado y lo envía
 *   POST /api/payroll-settlements/:id/dian/status  → consulta el resultado (habilitación)
 *   GET  /api/payroll-settlements/:id/dian/signed-xml → descarga el XML firmado enviado
 *
 * Las mismas tres rutas existen bajo /api/hourly/settlements/:id/dian/...
 * para la nómina de jornada parcial del personal por horas y bajo /api/dian-adjustments/:id/dian/... para las notas de
 * ajuste (routes/dianAdjustments.ts). Los contratistas independientes
 * llevan documento soporte (UBL), que se envía por las mismas rutas de
 * /api/hourly/settlements con la habilitación de documento soporte.
 *
 * Cada empresa envía con su propia habilitación (certificado, Software
 * ID, PIN, TestSetId y ambiente): ver routes/dianConfig.ts.
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthUser } from '../auth/authz';
import {
  DianNominaXmlService,
  NOMINA_AJUSTE_NAMESPACE,
  NOMINA_NAMESPACE,
  type DianEnvironment,
} from '../services/dianNominaXmlService';
import { DianCertificateError, signDianXml } from '../services/dianSigner';
import { SecretBoxError } from '../services/secretBox';
import { dianCertificateFor, dianSoftwareFor, dsSoftwareFor, type DianConfigEnv } from './dianConfig';
import { DS_CBC_NAMESPACE, DS_STS_NAMESPACE, DocumentoSoporteService } from '../services/documentoSoporteService';
import { DianServiceError, dianFileNames, getStatusZip, sendNomina, type DianResult } from '../services/dianWebService';
import { findElements, getAttribute, parseXml, textContent } from '../services/xmlC14n';
import { applyAcceptedAdjustment } from './dianAdjustments';

export type DianRouteEnv = DianConfigEnv;

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

/** Liquidación con XML de nómina, venga de la nómina mensual o del personal por horas. */
interface DianSource {
  table: 'payroll_settlements' | 'settlements' | 'dian_adjustments';
  /** Documento soporte de un contratista (UBL) en vez de nómina. */
  documentoSoporte: boolean;
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

type SourceKind = 'payroll' | 'hourly' | 'adjustment';

async function loadSource(env: DianRouteEnv, user: AuthUser, kind: SourceKind, id: string): Promise<DianSource> {
  if (kind === 'adjustment') {
    const row = await env.DB
      .prepare(`
        SELECT a.*, c.nit AS companyNit
        FROM dian_adjustments a
        JOIN companies c ON c.id = a.companyId
        WHERE a.id = ?1
      `)
      .bind(id)
      .first<any>();
    if (!row) throw new HttpError(404, 'Nota de ajuste no encontrada.');
    requireRole(user, ['TENANT_ADMIN']);
    requireCompanyAccess(user, String(row.companyId));
    return {
      table: 'dian_adjustments',
      documentoSoporte: false,
      id,
      companyId: String(row.companyId),
      companyNit: String(row.companyNit || ''),
      xml: String(row.dianXmlContent),
      consecutive: Number(row.dianConsecutive),
      submissionStatus: row.dianSubmissionStatus ?? null,
      trackId: row.dianTrackId ?? null,
      signedXml: row.dianSignedXml ?? null,
      regenerateHint: 'Vuelve a crear la nota de ajuste antes de enviarla.',
    };
  }

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
  let documentoSoporte = false;
  let consecutive = Number(row.dianConsecutive || 0);
  if (kind === 'payroll') {
    xml = row.dianStatus === 'GENERATED' && row.dianXmlContent ? String(row.dianXmlContent) : null;
  } else {
    const document = JSON.parse(String(row.resultJson || '{}')).dianDocument;
    // Nómina de jornada parcial o documento soporte UBL (los generados
    // antes de este formato no se pueden enviar).
    if (document && typeof document.xmlContent === 'string' &&
      (document.xmlContent.includes('<NominaIndividual') || document.xmlContent.includes('<Invoice'))) {
      xml = document.xmlContent;
      documentoSoporte = document.xmlContent.includes('<Invoice');
      consecutive = Number(String(document.consecutive || '').replace(/\D/g, '')) || 0;
    }
  }

  return {
    table: kind === 'payroll' ? 'payroll_settlements' : 'settlements',
    documentoSoporte,
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
  if (error instanceof DianCertificateError || error instanceof SecretBoxError) throw new HttpError(409, error.message);
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
  // settlements (por horas) no tiene updatedAt.
  const touch = source.table === 'settlements' ? '' : ', updatedAt = ?5';
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
  if (source.table === 'dian_adjustments' && status === 'ACCEPTED') {
    await applyAcceptedAdjustment(env, source.id);
  }
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
    /^\/api\/(payroll-settlements|hourly\/settlements|dian-adjustments)\/([^/]+)\/dian\/(send|status|signed-xml)$/
  );
  if (!match) return null;

  const [, prefix, rawId, action] = match;
  const kind: SourceKind = prefix === 'payroll-settlements' ? 'payroll' : prefix === 'dian-adjustments' ? 'adjustment' : 'hourly';
  const id = decodeURIComponent(rawId);

  if (action === 'signed-xml') {
    if (request.method !== 'GET') return null;
    const source = await loadSource(env, user, kind, id);
    if (!source.signedXml) throw new HttpError(404, 'Este documento aún no se ha enviado a la DIAN.');
    return new Response(source.signedXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${kind === 'adjustment' ? 'nota-ajuste' : 'nomina'}-${source.consecutive}.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (request.method !== 'POST') return null;
  const source = await loadSource(env, user, kind, id);

  if (!source.xml) {
    throw new HttpError(400, 'Primero genera el XML DIAN de esta liquidación.');
  }

  let software;
  let certificate;
  try {
    software = source.documentoSoporte
      ? await dsSoftwareFor(env, source.companyId)
      : await dianSoftwareFor(env, source.companyId);
    certificate = await dianCertificateFor(env, source.companyId);
  } catch (error) {
    dianError(error);
  }
  const environment: DianEnvironment = software.environment;
  const missing = [
    !software.configured && 'Software ID y PIN',
    !certificate && 'certificado digital',
    environment === '2' && !software.testSetId && 'TestSetId de habilitación',
  ].filter(Boolean);
  if (missing.length || !certificate) {
    throw new HttpError(
      409,
      `Falta la habilitación DIAN ${source.documentoSoporte ? 'de documento soporte ' : ''}de esta empresa (${missing.join(', ')}). ` +
        'Cárgala en Empresas → DIAN.'
    );
  }
  if (certificate.notAfter.getTime() < Date.now()) {
    throw new HttpError(409, 'El certificado digital de esta empresa está vencido.');
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
  let credentialsMatch: boolean;
  let issueDate: string;
  if (source.documentoSoporte) {
    const text = (namespace: string, name: string) => {
      const element = findElements(root, namespace, name)[0];
      return element ? textContent(element).trim() : '';
    };
    const expected = await DocumentoSoporteService.calculateSoftwareSecurityCode(
      software.softwareId, software.pin, text(DS_CBC_NAMESPACE, 'ID')
    );
    credentialsMatch = text(DS_STS_NAMESPACE, 'SoftwareSecurityCode') === expected &&
      text(DS_CBC_NAMESPACE, 'ProfileExecutionID') === environment;
    issueDate = text(DS_CBC_NAMESPACE, 'IssueDate');
  } else {
    const NOMINA_NS = kind === 'adjustment' ? NOMINA_AJUSTE_NAMESPACE : NOMINA_NAMESPACE;
    const provider = findElements(root, NOMINA_NS, 'ProveedorXML')[0];
    const number = findElements(root, NOMINA_NS, 'NumeroSecuenciaXML')[0];
    const expectedSC = await DianNominaXmlService.calculateSoftwareSC(
      software.softwareId,
      software.pin,
      String(number && getAttribute(number, 'Numero'))
    );
    const info = findElements(root, NOMINA_NS, 'InformacionGeneral')[0];
    credentialsMatch = !!provider && getAttribute(provider, 'SoftwareSC') === expectedSC && getAttribute(info, 'Ambiente') === environment;
    issueDate = String(getAttribute(info, 'FechaGen') || '');
  }
  if (!credentialsMatch) {
    throw new HttpError(
      409,
      'El XML se generó con otras credenciales de software o en otro ambiente. ' + source.regenerateHint
    );
  }

  let signedXml: string;
  let result: DianResult;
  try {
    signedXml = await signDianXml(source.xml, certificate);
    const issueYear = Number(issueDate.slice(0, 4)) || new Date().getUTCFullYear();
    const filePrefix = source.documentoSoporte ? 'ds' : kind === 'adjustment' ? 'nia' : 'nie';
    result = await sendNomina({
      environment,
      signedXml,
      fileNames: dianFileNames(source.companyNit, issueYear, source.consecutive, filePrefix),
      testSetId: software.testSetId || undefined,
      certificate,
      documentoSoporte: source.documentoSoporte,
    });
  } catch (error) {
    dianError(error);
  }

  const status = submissionStatusFor(result, environment, true);
  const sentAt = await saveResult(env, source, status, result, { signedXml, trackId: result.zipKey });
  const entity = { payroll_settlements: 'payroll_settlement', settlements: 'settlement', dian_adjustments: 'dian_adjustment' }[source.table];
  await audit(env, user, 'SEND_DIAN', entity, id, source.companyId);

  return sendJson({ success: true, data: describe(status, result, sentAt) });
}
