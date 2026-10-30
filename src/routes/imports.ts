/**
 * Importación masiva de empleados (desde Excel/CSV en el dashboard):
 *
 *   POST /api/employees/import   { companyId, rows: [...] }
 *                                → { created, errors: [{ row, error }] }
 *
 * Cada fila usa los mismos campos que POST /api/employees y se valida
 * en modo estricto (src/services/employeeValidation.ts). Se insertan
 * sólo las filas válidas; el resto se reporta con su número de fila
 * (`rowNumber` de la fila si viene, si no su posición 1-based).
 */

import { sendJson } from '../http';
import {
  requireRole,
  requireCompanyAccess,
  audit,
  type AuthUser,
} from '../auth/authz';
import {
  validateEmployeeInput,
  insertEmployee,
  taxIdKey,
} from '../services/employeeValidation';
import { parsePilaAffiliation, savePilaAffiliation } from './pila';

interface RouteEnv {
  DB: D1Database;
}

export const MAX_IMPORT_ROWS = 500;

export async function handleImportRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  if (url.pathname === '/api/employees/import' && request.method === 'POST') {
    return importEmployees(request, env, user);
  }

  return null;
}

async function importEmployees(request: Request, env: RouteEnv, user: AuthUser): Promise<Response> {
  requireRole(user, ['TENANT_ADMIN']);

  const body = await request.json().catch(() => null) as any;
  const companyId = String(body?.companyId || '').trim();
  const rows = body?.rows;

  if (!companyId) {
    return sendJson({ success: false, error: 'companyId es obligatorio.' }, 400);
  }

  requireCompanyAccess(user, companyId);

  if (!Array.isArray(rows) || rows.length === 0) {
    return sendJson({ success: false, error: 'No hay filas para importar.' }, 400);
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    return sendJson(
      { success: false, error: `Máximo ${MAX_IMPORT_ROWS} filas por importación.` },
      400
    );
  }

  const company = await env.DB
    .prepare(`SELECT id FROM companies WHERE id = ?1 AND active = 1`)
    .bind(companyId)
    .first();

  if (!company) {
    return sendJson({ success: false, error: 'La empresa no existe o está inactiva.' }, 404);
  }

  const existing = await env.DB
    .prepare(`SELECT taxId FROM employees WHERE companyId = ?1`)
    .bind(companyId)
    .all<{ taxId: string }>();

  const existingKeys = new Set((existing.results || []).map(r => taxIdKey(r.taxId)));
  const seenInFile = new Set<string>();
  const errors: { row: number; error: string }[] = [];
  let created = 0;

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i] && typeof rows[i] === 'object' ? rows[i] : {};
    const rowNumber = Number.isInteger(raw.rowNumber) && raw.rowNumber > 0 ? raw.rowNumber : i + 1;

    const result = validateEmployeeInput(raw, { strict: true });

    if (!result.ok) {
      errors.push({ row: rowNumber, error: result.error });
      continue;
    }

    let pilaFields: Record<string, string | null>;
    try {
      pilaFields = parsePilaAffiliation(raw, 'employee');
    } catch (error) {
      errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Datos PILA inválidos.',
      });
      continue;
    }

    const key = taxIdKey(result.value.taxId);

    if (existingKeys.has(key)) {
      errors.push({ row: rowNumber, error: `Ya existe un empleado con el documento ${result.value.taxId}.` });
      continue;
    }

    if (seenInFile.has(key)) {
      errors.push({ row: rowNumber, error: `Documento ${result.value.taxId} repetido en el archivo.` });
      continue;
    }

    seenInFile.add(key);
    const employeeId = await insertEmployee(env.DB, companyId, result.value);
    await savePilaAffiliation(env as any, 'employee', employeeId, pilaFields);
    created++;
  }

  if (created > 0) {
    await audit(env as any, user, 'IMPORT', 'employee', null, companyId);
  }

  return sendJson({ success: true, created, errors });
}
