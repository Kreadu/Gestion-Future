/**
 * Registro de incapacidades, licencias y vacaciones disfrutadas
 * (employee_leaves). Lo usan POST /api/employee-leaves (src/index.ts)
 * y la aprobación de solicitudes del portal (src/routes/requests.ts),
 * para que ambos validen igual.
 */

import { sendJson } from '../http';
import { requireRole, requireCompanyAccess, audit, type AuthUser } from '../auth/authz';
import { businessDaysBetween } from '../services/colombiaHolidays';
import type { EmployeeLeaveType } from '../types/payroll';

export const EMPLOYEE_LEAVE_TYPES: EmployeeLeaveType[] = [
  'GENERAL_INCAPACITY',
  'WORK_INCAPACITY',
  'MATERNITY_LEAVE',
  'PATERNITY_LEAVE',
  'VACATION',
];

// Vacaciones: días hábiles a descontar del saldo. Si no vienen,
// se cuentan de lunes a sábado sin festivos.
export const vacationBusinessDays = (
  leaveType: string,
  body: any,
  startDate: string,
  endDate: string
): number | null => {
  if (leaveType !== 'VACATION') return null;
  const given = Number(body.businessDays);
  return Number.isFinite(given) && given > 0
    ? given
    : businessDaysBetween(startDate, endDate);
};

/** AAAA-MM-DD de una fecha que existe (rechaza 2026-02-31). */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validación común de alta (POST) y edición (PUT) de una novedad:
 * fechas reales y en orden, sin cruzarse con otra novedad del empleado
 * (excludeLeaveId = la que se edita). Devuelve los valores derivados o
 * la respuesta 400.
 */
export async function validateLeaveInput(
  env: any,
  employeeId: string,
  body: any,
  excludeLeaveId: string | null
): Promise<{ error: Response } | { totalDays: number; accumulatedDaysBefore: number; businessDays: number | null }> {
  const leaveType = String(body.leaveType || '').trim();
  const startDate = String(body.startDate || '').trim();
  const endDate = String(body.endDate || '').trim();

  if (!isRealDate(startDate) || !isRealDate(endDate)) {
    return { error: sendJson({ success: false, error: 'startDate/endDate inválidas (formato AAAA-MM-DD).' }, 400) };
  }

  const totalDays =
    Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1;

  if (totalDays < 1) {
    return { error: sendJson({ success: false, error: 'endDate debe ser igual o posterior a startDate.' }, 400) };
  }

  // Un empleado no puede tener dos incapacidades/licencias
  // simultáneas (sí puede tener varias en el mismo MES, una
  // tras otra — eso el motor lo suma sin problema al liquidar).
  const overlappingExisting = await env.DB
    .prepare(`
      SELECT id
      FROM employee_leaves
      WHERE employeeId = ?1
        AND id != ?4
        AND startDate <= ?2
        AND endDate >= ?3
    `)
    .bind(employeeId, endDate, startDate, excludeLeaveId || '')
    .first();

  if (overlappingExisting) {
    return {
      error: sendJson(
        {
          success: false,
          error:
            'Ya existe una incapacidad/licencia registrada para ' +
            'este empleado que se solapa con estas fechas.',
        },
        400
      ),
    };
  }

  return {
    totalDays,
    // Sólo aplica (y sólo se persiste) para incapacidad general —
    // en el resto de tipos siempre es 0.
    accumulatedDaysBefore:
      leaveType === 'GENERAL_INCAPACITY'
        ? Math.max(0, Number(body.accumulatedDaysBefore) || 0)
        : 0,
    businessDays: vacationBusinessDays(leaveType, body, startDate, endDate),
  };
}

export async function createEmployeeLeave(env: any, user: AuthUser, body: any): Promise<Response> {
  const employeeId = String(body.employeeId || '').trim();
  const leaveType = String(body.leaveType || '').trim();
  const startDate = String(body.startDate || '').trim();
  const endDate = String(body.endDate || '').trim();

  if (!employeeId || !leaveType || !startDate || !endDate) {
    return sendJson(
      {
        success: false,
        error:
          'employeeId, leaveType, startDate y endDate son obligatorios.',
      },
      400
    );
  }

  if (
    !EMPLOYEE_LEAVE_TYPES.includes(leaveType as EmployeeLeaveType)
  ) {
    return sendJson(
      {
        success: false,
        error:
          'leaveType debe ser GENERAL_INCAPACITY, WORK_INCAPACITY, ' +
          'MATERNITY_LEAVE, PATERNITY_LEAVE o VACATION.',
      },
      400
    );
  }

  const employeeRow = await env.DB
    .prepare(`SELECT id, companyId FROM employees WHERE id = ?1 AND active = 1`)
    .bind(employeeId)
    .first();

  if (!employeeRow) {
    return sendJson(
      { success: false, error: 'Empleado no encontrado o inactivo.' },
      404
    );
  }

  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, String(employeeRow.companyId));

  const checked = await validateLeaveInput(env, employeeId, body, null);
  if ('error' in checked) return checked.error;
  const { totalDays, accumulatedDaysBefore, businessDays } = checked;

  const id = `LV-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  await env.DB
    .prepare(`
      INSERT INTO employee_leaves (
        id, employeeId, companyId, leaveType, startDate, endDate,
        totalDays, accumulatedDaysBefore, businessDays, notes, createdAt
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    `)
    .bind(
      id,
      employeeId,
      String(employeeRow.companyId),
      leaveType,
      startDate,
      endDate,
      totalDays,
      accumulatedDaysBefore,
      businessDays,
      body.notes || null,
      createdAt
    )
    .run();

  await audit(
    env,
    user,
    'CREATE',
    'employee_leave',
    id,
    String(employeeRow.companyId)
  );

  return sendJson(
    {
      success: true,
      data: {
        id,
        employeeId,
        companyId: String(employeeRow.companyId),
        leaveType,
        startDate,
        endDate,
        totalDays,
        accumulatedDaysBefore,
        businessDays,
        notes: body.notes || null,
        createdAt,
      },
    },
    201
  );
}
