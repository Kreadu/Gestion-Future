/**
 * Comprobante contable de nómina de un periodo:
 *
 *   GET /api/payroll-periods/:id/accounting → { fileName, content, totals, lines, warnings }
 *
 * Incluye la nómina del periodo y las liquidaciones del personal por
 * horas (jornada parcial y contratistas) cuyo tramo termina dentro de él.
 * El asiento lo arma src/services/payrollAccounting.ts.
 */

import { sendJson } from '../http';
import { requireRole, requireCompanyAccess, audit, type AuthUser } from '../auth/authz';
import { buildPayrollJournal } from '../services/payrollAccounting';
import { employeeName } from './periodEmployees';

interface RouteEnv {
  DB: D1Database;
}

export async function handleAccountingRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const match = url.pathname.match(/^\/api\/payroll-periods\/([^/]+)\/accounting$/);

  if (!match || request.method !== 'GET') {
    return null;
  }

  requireRole(user, ['TENANT_ADMIN']);

  const period = await env.DB
    .prepare(`SELECT * FROM payroll_periods WHERE id = ?1`)
    .bind(decodeURIComponent(match[1]))
    .first<any>();

  if (!period) {
    return sendJson({ success: false, error: 'Periodo no encontrado.' }, 404);
  }

  requireCompanyAccess(user, String(period.companyId));

  const [company, settlements, hourly] = await Promise.all([
    env.DB
      .prepare(`SELECT nit, arlCode FROM companies WHERE id = ?1`)
      .bind(period.companyId)
      .first<any>(),
    env.DB
      .prepare(`
        SELECT s.resultJson, e.firstName, e.firstName2, e.lastName, e.lastName2,
               e.taxId, e.epsCode, e.afpCode, e.ccfCode
        FROM payroll_settlements s
        JOIN employees e ON e.id = s.employeeId
        WHERE s.periodId = ?1
        ORDER BY e.lastName, e.firstName
      `)
      .bind(period.id)
      .all<any>(),
    // Personal por horas: cada liquidación va al periodo donde termina
    // su tramo (así una que cruza el borde entra una sola vez).
    env.DB
      .prepare(`
        SELECT s.engagementId, s.periodStart, s.periodEnd, s.resultJson,
               g.vinculationType, p.firstName, p.firstName2, p.lastName, p.lastName2, p.taxId
        FROM settlements s
        JOIN engagements g ON g.id = s.engagementId
        JOIN professionals p ON p.id = g.professionalId
        WHERE g.companyId = ?1 AND s.periodEnd >= ?2 AND s.periodEnd <= ?3
        ORDER BY s.createdAt
      `)
      .bind(period.companyId, period.periodStart, period.periodEnd)
      .all<any>(),
  ]);

  const rows = settlements.results || [];

  // Una vinculación puede haberse liquidado varias veces para el mismo
  // periodo: vale la última.
  const hourlyByKey = new Map<string, { row: any; count: number }>();
  for (const row of hourly.results || []) {
    const key = `${row.engagementId}|${row.periodStart}|${row.periodEnd}`;
    hourlyByKey.set(key, { row, count: (hourlyByKey.get(key)?.count || 0) + 1 });
  }

  if (rows.length === 0 && hourlyByKey.size === 0) {
    return sendJson(
      { success: false, error: 'El periodo no tiene liquidaciones (ni de nómina ni por horas): calcúlalas antes de contabilizar.' },
      400
    );
  }

  const warnings: string[] = [];

  if (period.status !== 'CLOSED') {
    warnings.push('El periodo sigue en borrador: los valores pueden cambiar hasta que lo cierres.');
  }

  const entries: { employee: any; result: any }[] = [];

  for (const row of rows) {
    const employee = {
      taxId: String(row.taxId || ''),
      name: employeeName(row),
      epsCode: row.epsCode,
      afpCode: row.afpCode,
      ccfCode: row.ccfCode,
    };

    try {
      entries.push({ employee, result: JSON.parse(String(row.resultJson)) });
    } catch {
      warnings.push(`${employee.name} (${employee.taxId}): la liquidación guardada está dañada y no se incluyó; recalcúlala.`);
    }
  }

  const contractors = [];

  for (const { row, count } of hourlyByKey.values()) {
    const name = employeeName(row);
    const who = `${name} (${row.taxId})`;

    if (count > 1) {
      warnings.push(`${who}: tiene ${count} liquidaciones por horas del ${row.periodStart} al ${row.periodEnd}; se contabilizó la más reciente.`);
    }

    let calculation: any;
    try {
      calculation = JSON.parse(String(row.resultJson)).calculation;
    } catch {
      // Se avisa abajo.
    }

    if (!calculation) {
      warnings.push(`${who}: la liquidación por horas guardada está dañada y no se incluyó.`);
    } else if (row.vinculationType === 'INDEPENDENT_SERVICES') {
      contractors.push({
        professional: { taxId: String(row.taxId || ''), name },
        concept: calculation.retentionConcept,
        grossAmount: calculation.grossAmount,
        retentionAmount: calculation.retentionAmount,
        netAmount: calculation.netAmount,
      });
    } else {
      entries.push({ employee: { taxId: String(row.taxId || ''), name }, result: calculation });
    }
  }

  const journal = buildPayrollJournal({
    periodStart: String(period.periodStart),
    periodEnd: String(period.periodEnd),
    companyArlCode: company?.arlCode || null,
    settlements: entries,
    contractors,
  });

  warnings.push(...journal.warnings);
  warnings.push('Cuentas PUC de uso general y administradoras por su código PILA: confírmalas con tu contador antes de importar.');

  // La vista previa también usa esta ruta: sólo la descarga (?download=1) queda registrada.
  if (url.searchParams.get('download') === '1') {
    await audit(env as any, user, 'EXPORT', 'accounting', String(period.id), String(period.companyId));
  }

  return sendJson({
    success: true,
    data: {
      fileName: `COMPROBANTE_NOMINA_${company?.nit || 'empresa'}_${period.periodStart}_${period.periodEnd}.csv`,
      content: journal.csv,
      totals: journal.totals,
      lines: journal.lines.length,
      warnings,
    },
  });
}
