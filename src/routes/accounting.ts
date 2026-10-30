/**
 * Comprobante contable de nómina de un periodo:
 *
 *   GET /api/payroll-periods/:id/accounting → { fileName, content, totals, lines, warnings }
 *
 * El asiento lo arma src/services/payrollAccounting.ts.
 */

import { sendJson } from '../http';
import { requireRole, requireCompanyAccess, type AuthUser } from '../auth/authz';
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

  const [company, settlements] = await Promise.all([
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
  ]);

  const rows = settlements.results || [];

  if (rows.length === 0) {
    return sendJson(
      { success: false, error: 'El periodo no tiene liquidaciones: calcula la nómina antes de contabilizarla.' },
      400
    );
  }

  const warnings: string[] = [];

  if (period.status !== 'CLOSED') {
    warnings.push('El periodo sigue en borrador: los valores pueden cambiar hasta que lo cierres.');
  }

  const entries = [];

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

  const journal = buildPayrollJournal({
    periodStart: String(period.periodStart),
    periodEnd: String(period.periodEnd),
    companyArlCode: company?.arlCode || null,
    settlements: entries,
  });

  warnings.push(...journal.warnings);
  warnings.push('Cuentas PUC de uso general y administradoras por su código PILA: confírmalas con tu contador antes de importar.');

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
