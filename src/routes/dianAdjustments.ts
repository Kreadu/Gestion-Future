/**
 * Notas de ajuste de la nómina electrónica (TipoXML 103), para corregir
 * lo que la DIAN ya aceptó:
 *
 *   GET  /api/payroll-settlements/:id/dian/adjustments   notas de la liquidación
 *   POST /api/payroll-settlements/:id/dian/adjustments   crear { type, reason, ...corrección }
 *
 * y lo mismo bajo /api/hourly/settlements/:id/... (jornada parcial).
 *
 *   type = 'REPLACE' reemplaza el documento con la nómina corregida:
 *          mensual  { daysWorked, overtimeHours, horasDominicalFestivo, horasExtraDominicalFestivo, isIntegralSalary }
 *          por horas { hoursByType }
 *   type = 'DELETE'  elimina el documento ante la DIAN.
 *
 * La nota se firma y envía como la nómina: /api/dian-adjustments/:id/dian/send|status|signed-xml
 * (routes/dian.ts). Cuando la DIAN acepta un reemplazo, la liquidación
 * queda con los valores corregidos (applyAcceptedAdjustment).
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthUser } from '../auth/authz';
import {
  DianNominaXmlService,
  NOMINA_AJUSTE_NAMESPACE,
  NOMINA_NAMESPACE,
  type DianEnvironment,
  type DianPredecessor,
} from '../services/dianNominaXmlService';
import { getNextDianConsecutive } from '../services/dianCounters';
import { findElements, getAttribute, parseXml } from '../services/xmlC14n';
import { dianSoftwareFor, type DianConfigEnv } from './dianConfig';
import type { ColombiaPayrollResult, DianEmployeeExtraInfo } from '../types/payroll';

export type AdjustmentSourceTable = 'payroll_settlements' | 'settlements';

/** Nómina corregida de una liquidación, lista para el XML de reemplazo. */
export interface CorrectedPayroll {
  payroll: ColombiaPayrollResult;
  employeeExtra: DianEmployeeExtraInfo;
  periodStart: string;
  periodEnd: string;
  /** Lo que se recalculó, para dejarlo en la liquidación cuando la DIAN acepte. */
  inputs: Record<string, unknown>;
}

export interface AdjustmentDeps {
  /** Recalcula la nómina con la corrección del body; lanza HttpError si no es válida. */
  correctedPayroll(table: AdjustmentSourceTable, sourceRow: any, body: any): Promise<CorrectedPayroll>;
}

export function normalizeAdjustment(row: any) {
  let errors: string[] = [];
  try {
    const response = row.dianResponseJson ? JSON.parse(String(row.dianResponseJson)) : null;
    errors = Array.isArray(response?.errors) ? response.errors : [];
  } catch {
    errors = [];
  }
  return {
    id: String(row.id),
    noteType: row.noteType as 'REPLACE' | 'DELETE',
    reason: row.reason ?? null,
    predecessorNumber: String(row.predecessorNumber),
    dianNumber: String(row.dianNumber),
    dianConsecutive: Number(row.dianConsecutive),
    totalDevengado: Number(row.totalDevengado || 0),
    totalDeducciones: Number(row.totalDeducciones || 0),
    totalComprobante: Number(row.totalComprobante || 0),
    dianSubmissionStatus: row.dianSubmissionStatus ?? null,
    dianSentAt: row.dianSentAt ?? null,
    dianErrors: errors,
    createdAt: row.createdAt ?? null,
  };
}

/** Número, CUNE y fecha de un XML de nómina o de nota de ajuste. */
export function predecessorFromXml(xml: string): DianPredecessor {
  const root = parseXml(xml);
  const namespace = root.localName === 'NominaIndividualDeAjuste' ? NOMINA_AJUSTE_NAMESPACE : NOMINA_NAMESPACE;
  const number = findElements(root, namespace, 'NumeroSecuenciaXML')[0];
  const info = findElements(root, namespace, 'InformacionGeneral')[0];
  const predecessor = {
    number: String((number && getAttribute(number, 'Numero')) || ''),
    cune: String((info && getAttribute(info, 'CUNE')) || ''),
    issueDate: String((info && getAttribute(info, 'FechaGen')) || ''),
  };
  if (!predecessor.number || !predecessor.cune || !predecessor.issueDate) {
    throw new HttpError(409, 'No se encontró el número, CUNE o fecha del documento aceptado.');
  }
  return predecessor;
}

/** XML que la DIAN aceptó de la liquidación (el firmado si está guardado). */
function acceptedSourceXml(table: AdjustmentSourceTable, row: any): string | null {
  if (row.dianSignedXml) return String(row.dianSignedXml);
  if (table === 'payroll_settlements') return row.dianXmlContent ? String(row.dianXmlContent) : null;
  const document = JSON.parse(String(row.resultJson || '{}')).dianDocument;
  return document && typeof document.xmlContent === 'string' ? document.xmlContent : null;
}

async function loadSettlement(env: DianConfigEnv, user: AuthUser, table: AdjustmentSourceTable, id: string) {
  const row = table === 'payroll_settlements'
    ? await env.DB.prepare(`SELECT * FROM payroll_settlements WHERE id = ?1`).bind(id).first<any>()
    : await env.DB
      .prepare(`
        SELECT s.*, g.companyId
        FROM settlements s
        JOIN engagements g ON g.id = s.engagementId
        WHERE s.id = ?1
      `)
      .bind(id)
      .first<any>();
  if (!row) throw new HttpError(404, 'Liquidación no encontrada.');
  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, String(row.companyId));
  return row;
}

async function adjustmentsOf(env: DianConfigEnv, table: AdjustmentSourceTable, id: string): Promise<any[]> {
  const rows = await env.DB
    .prepare(`SELECT * FROM dian_adjustments WHERE sourceTable = ?1 AND sourceId = ?2 ORDER BY dianConsecutive ASC`)
    .bind(table, id)
    .all<any>();
  return rows.results || [];
}

/** ¿La DIAN ya aceptó la eliminación del documento de esta liquidación? */
export async function isDeletedAtDian(env: DianConfigEnv, table: AdjustmentSourceTable, id: string): Promise<boolean> {
  const row = await env.DB
    .prepare(`
      SELECT 1 FROM dian_adjustments
      WHERE sourceTable = ?1 AND sourceId = ?2 AND noteType = 'DELETE' AND dianSubmissionStatus = 'ACCEPTED'
      LIMIT 1
    `)
    .bind(table, id)
    .first();
  return !!row;
}

/** La DIAN aceptó la nota: un reemplazo deja la liquidación con los valores corregidos. */
export async function applyAcceptedAdjustment(env: DianConfigEnv, adjustmentId: string): Promise<void> {
  const adjustment = await env.DB
    .prepare(`SELECT * FROM dian_adjustments WHERE id = ?1`)
    .bind(adjustmentId)
    .first<any>();
  if (!adjustment || adjustment.noteType !== 'REPLACE' || adjustment.dianSubmissionStatus !== 'ACCEPTED') return;

  const calculation = JSON.parse(String(adjustment.calculationJson));
  const inputs = JSON.parse(String(adjustment.inputJson || '{}'));
  const now = new Date().toISOString();

  if (adjustment.sourceTable === 'payroll_settlements') {
    await env.DB
      .prepare(`
        UPDATE payroll_settlements
        SET daysWorked = ?1, extraDiurna = ?2, extraNocturna = ?3, recargoNocturno = ?4,
            grossEarnings = ?5, totalDeductions = ?6, netPay = ?7, resultJson = ?8, updatedAt = ?9
        WHERE id = ?10
      `)
      .bind(
        Number(inputs.daysWorked), Number(inputs.extraDiurna), Number(inputs.extraNocturna), Number(inputs.recargoNocturno),
        adjustment.totalDevengado, adjustment.totalDeducciones, adjustment.totalComprobante,
        JSON.stringify(calculation), now, adjustment.sourceId
      )
      .run();
    return;
  }

  const row = await env.DB
    .prepare(`SELECT resultJson FROM settlements WHERE id = ?1`)
    .bind(adjustment.sourceId)
    .first<any>();
  if (!row) return;
  const result = JSON.parse(String(row.resultJson || '{}'));
  result.calculation = calculation;
  if (result.assignment) result.assignment.hours = inputs.hoursByType;
  await env.DB
    .prepare(`
      UPDATE settlements
      SET totalHours = ?1, grossAmount = ?2, retentionAmount = ?3, netAmount = ?4, resultJson = ?5
      WHERE id = ?6
    `)
    .bind(
      Number(inputs.totalHours), adjustment.totalDevengado, adjustment.totalDeducciones, adjustment.totalComprobante,
      JSON.stringify(result), adjustment.sourceId
    )
    .run();
}

async function createAdjustment(
  env: DianConfigEnv,
  user: AuthUser,
  table: AdjustmentSourceTable,
  settlementId: string,
  body: any,
  deps: AdjustmentDeps
) {
  const source = await loadSettlement(env, user, table, settlementId);
  const companyId = String(source.companyId);

  const type = String(body.type || '');
  if (type !== 'REPLACE' && type !== 'DELETE') {
    throw new HttpError(400, 'Indica si la nota de ajuste reemplaza (REPLACE) o elimina (DELETE) el documento.');
  }
  const reason = String(body.reason || '').trim().slice(0, 500) || null;

  if (source.dianSubmissionStatus !== 'ACCEPTED') {
    throw new HttpError(409, 'Sólo se ajusta una nómina que la DIAN ya aceptó; mientras tanto, corrígela y vuelve a generarla.');
  }

  const previous = await adjustmentsOf(env, table, settlementId);
  if (previous.some(a => a.noteType === 'DELETE' && a.dianSubmissionStatus === 'ACCEPTED')) {
    throw new HttpError(409, 'La DIAN ya eliminó el documento de esta liquidación.');
  }
  if (previous.some(a => a.dianSubmissionStatus === 'SENT')) {
    throw new HttpError(409, 'Hay una nota de ajuste en proceso en la DIAN: consulta su estado primero.');
  }

  // Se ajusta siempre el último documento aceptado: el original o el último reemplazo.
  const lastReplacement = previous.filter(a => a.noteType === 'REPLACE' && a.dianSubmissionStatus === 'ACCEPTED').pop();
  const predecessorXml = lastReplacement ? String(lastReplacement.dianXmlContent) : acceptedSourceXml(table, source);
  if (!predecessorXml) throw new HttpError(409, 'No se encontró el XML aceptado de esta liquidación.');
  const predecessor = predecessorFromXml(predecessorXml);

  // Una nota sin enviar o rechazada se rehace con el mismo número (sin huecos en la serie NA).
  const draft = previous.find(a => a.dianSubmissionStatus === null || a.dianSubmissionStatus === 'REJECTED');

  const company = await env.DB
    .prepare(`SELECT nit, dv, name FROM companies WHERE id = ?1`)
    .bind(companyId)
    .first<any>();
  if (!company?.nit || !company?.name) throw new HttpError(400, 'La empresa no tiene NIT o razón social configurados.');
  const software = await dianSoftwareFor(env, companyId);
  const environment: DianEnvironment = software.environment;
  const employer = {
    nit: String(company.nit),
    dv: String(company.dv || '0'),
    companyName: String(company.name),
    softwareId: software.softwareId,
    pinSoftware: software.pin,
  };

  let corrected: CorrectedPayroll | null = null;
  if (type === 'REPLACE') corrected = await deps.correctedPayroll(table, source, body);

  const consecutive = draft ? Number(draft.dianConsecutive) : await getNextDianConsecutive(env.DB, companyId, 'NOMINA_AJUSTE');
  const xml = corrected
    ? await DianNominaXmlService.generateDSPNE(
      corrected.payroll, employer, corrected.employeeExtra, consecutive, undefined, undefined,
      { periodStart: corrected.periodStart, periodEnd: corrected.periodEnd, environment, replaces: predecessor }
    )
    : await DianNominaXmlService.generateDeletion(predecessor, employer, consecutive, { environment });

  const id = draft ? String(draft.id) : `ADJ-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  if (draft) await env.DB.prepare(`DELETE FROM dian_adjustments WHERE id = ?1`).bind(id).run();
  await env.DB
    .prepare(`
      INSERT INTO dian_adjustments (
        id, companyId, sourceTable, sourceId, noteType, reason,
        predecessorNumber, predecessorCune, predecessorDate,
        dianConsecutive, dianNumber, dianCune, dianXmlContent,
        inputJson, calculationJson, totalDevengado, totalDeducciones, totalComprobante, createdAt, updatedAt
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)
    `)
    .bind(
      id, companyId, table, settlementId, type, reason,
      predecessor.number, predecessor.cune, predecessor.issueDate,
      consecutive, xml.consecutive, xml.cune, xml.xmlContent,
      corrected ? JSON.stringify(corrected.inputs) : null,
      corrected ? JSON.stringify(corrected.payroll) : null,
      xml.totalDevengado, xml.totalDeducciones, xml.totalComprobante, now
    )
    .run();
  await audit(env, user, draft ? 'UPDATE' : 'CREATE', 'dian_adjustment', id, companyId);

  const row = await env.DB.prepare(`SELECT * FROM dian_adjustments WHERE id = ?1`).bind(id).first<any>();
  return normalizeAdjustment(row);
}

export async function handleDianAdjustmentRoutes(
  request: Request,
  url: URL,
  env: DianConfigEnv,
  user: AuthUser,
  deps: AdjustmentDeps
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/(payroll-settlements|hourly\/settlements)\/([^/]+)\/dian\/adjustments$/);
  if (!match) return null;

  const table: AdjustmentSourceTable = match[1] === 'payroll-settlements' ? 'payroll_settlements' : 'settlements';
  const settlementId = decodeURIComponent(match[2]);

  if (request.method === 'GET') {
    await loadSettlement(env, user, table, settlementId);
    const rows = await adjustmentsOf(env, table, settlementId);
    return sendJson({ success: true, data: rows.map(normalizeAdjustment) });
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({})) as any;
    const data = await createAdjustment(env, user, table, settlementId, body, deps);
    return sendJson({ success: true, data }, 201);
  }

  return null;
}
