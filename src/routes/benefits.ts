/**
 * Rutas de prestaciones sociales:
 *
 *   GET    /api/employees/:id/vacation-balance   saldo de vacaciones
 *   POST   /api/benefits/calculate                prima o cesantías del periodo
 *   GET    /api/benefit-payments                  pagos registrados
 *   DELETE /api/benefit-payments/:id              anular un pago registrado
 *   POST   /api/employees/:id/termination/preview liquidación definitiva (vista previa)
 *   POST   /api/employees/:id/termination         liquidación definitiva (guardar y retirar)
 *   GET    /api/employees/:id/termination         liquidación guardada
 */

import { sendJson } from '../http';
import {
  requireRole,
  requireCompanyAccess,
  audit,
  HttpError,
  type AuthUser,
} from '../auth/authz';
import {
  days360,
  benefitBase,
  prima,
  cesantias,
  interesesCesantias,
  vacationDaysAccrued,
  liquidacionDefinitiva,
  primaSemester,
  ColombiaBenefitsError,
  TERMINATION_REASONS,
  type ContractType,
  type TerminationReason,
} from '../engine/countries/colombiaBenefits';
import { employeeName } from './periodEmployees';

interface RouteEnv {
  DB: D1Database;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addOneDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const maxDate = (...dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort().pop()!;

const minDate = (...dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort()[0];

const round2 = (v: number) => Math.round(v * 100) / 100;


async function loadEmployee(env: RouteEnv, user: AuthUser, employeeId: string) {
  const row = await env.DB
    .prepare(`SELECT * FROM employees WHERE id = ?1`)
    .bind(employeeId)
    .first<any>();

  if (!row) {
    throw new HttpError(404, 'Empleado no encontrado.');
  }

  requireRole(user, ['TENANT_ADMIN']);
  requireCompanyAccess(user, String(row.companyId));

  return row;
}

/**
 * Promedio mensual de lo variable (horas extra, recargos,
 * dominicales) liquidado en nómina entre dos fechas.
 */
async function averageVariable(env: RouteEnv, employeeId: string, from: string, to: string) {
  const result = await env.DB
    .prepare(`
      SELECT s.resultJson
      FROM payroll_settlements s
      JOIN payroll_periods p ON p.id = s.periodId
      WHERE s.employeeId = ?1
        AND p.periodStart >= ?2
        AND p.periodEnd <= ?3
    `)
    .bind(employeeId, from, to)
    .all<any>();

  const rows = result.results || [];
  if (rows.length === 0) return 0;

  const total = rows.reduce((sum, row) => {
    const r = JSON.parse(String(row.resultJson));
    return sum + Number(r.overtimeTotal || 0) + Number(r.dominicalFestivoValue || 0);
  }, 0);

  return total / rows.length;
}

export async function vacationBalance(env: RouteEnv, employee: any, asOf: string) {
  if (!employee.hireDate) {
    throw new HttpError(400, 'El empleado no tiene fecha de ingreso.');
  }

  const end = minDate(asOf, employee.terminationDate);
  const accrued = vacationDaysAccrued(days360(employee.hireDate, end));

  const taken = await env.DB
    .prepare(`
      SELECT COALESCE(SUM(businessDays), 0) AS days
      FROM employee_leaves
      WHERE employeeId = ?1
        AND leaveType = 'VACATION'
        AND startDate <= ?2
    `)
    .bind(employee.id, end)
    .first<{ days: number }>();

  const takenDays = Number(taken?.days || 0) + Number(employee.vacationDaysTakenBefore || 0);

  return {
    asOf: end,
    accruedDays: round2(accrued),
    takenDays: round2(takenDays),
    pendingDays: round2(accrued - takenDays),
  };
}

async function lastPaymentEnd(env: RouteEnv, employeeId: string, type: string) {
  const row = await env.DB
    .prepare(`
      SELECT MAX(periodEnd) AS periodEnd
      FROM benefit_payments
      WHERE employeeId = ?1 AND benefitType = ?2
    `)
    .bind(employeeId, type)
    .first<{ periodEnd: string | null }>();

  return row?.periodEnd || null;
}

async function terminationInput(env: RouteEnv, employee: any, body: any) {
  const terminationDate = String(body.terminationDate || '').trim();
  const reason = String(body.reason || '').trim() as TerminationReason;

  if (!ISO_DATE.test(terminationDate)) {
    throw new HttpError(400, 'La fecha de retiro es obligatoria (AAAA-MM-DD).');
  }

  if (!TERMINATION_REASONS.includes(reason)) {
    throw new HttpError(400, 'Motivo de retiro inválido.');
  }

  if (!employee.hireDate) {
    throw new HttpError(400, 'El empleado no tiene fecha de ingreso.');
  }

  const year = terminationDate.slice(0, 4);
  const semesterStart = terminationDate.slice(5, 7) <= '06' ? `${year}-01-01` : `${year}-07-01`;

  const lastCesantias = await lastPaymentEnd(env, employee.id, 'CESANTIAS');
  const lastPrima = await lastPaymentEnd(env, employee.id, 'PRIMA');

  // Sin registros en la plataforma se asume que lo de años/semestres
  // anteriores ya se pagó.
  const cesantiasFrom = maxDate(
    employee.hireDate,
    lastCesantias ? addOneDay(lastCesantias) : `${year}-01-01`
  );
  const primaFrom = maxDate(
    employee.hireDate,
    lastPrima ? addOneDay(lastPrima) : semesterStart
  );

  const balance = await vacationBalance(env, employee, terminationDate);
  const vacationDaysPending =
    body.vacationDaysPending !== undefined && body.vacationDaysPending !== ''
      ? Math.max(0, Number(body.vacationDaysPending) || 0)
      : Math.max(0, balance.pendingDays);

  const oneYearBefore = `${Number(year) - 1}${terminationDate.slice(4)}`;

  return {
    monthlySalary: Number(employee.salary),
    averageVariable: await averageVariable(env, employee.id, maxDate(employee.hireDate, oneYearBefore), terminationDate),
    isIntegralSalary: !!employee.isIntegralSalary,
    contractType: (String(employee.contractType || '2') as ContractType),
    reason,
    hireDate: String(employee.hireDate),
    terminationDate,
    contractEndDate: body.contractEndDate || employee.contractEndDate || undefined,
    cesantiasFrom,
    primaFrom,
    vacationDaysPending,
  };
}

export async function handleBenefitRoutes(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  try {
    return await route(request, url, env, user);
  } catch (error) {
    if (error instanceof ColombiaBenefitsError) {
      return sendJson({ success: false, error: error.message }, 400);
    }
    throw error;
  }
}

async function route(
  request: Request,
  url: URL,
  env: RouteEnv,
  user: AuthUser
): Promise<Response | null> {
  const balanceMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/vacation-balance$/);

  if (balanceMatch && request.method === 'GET') {
    const employee = await loadEmployee(env, user, decodeURIComponent(balanceMatch[1]));
    const asOf = url.searchParams.get('asOf') || today();

    if (!ISO_DATE.test(asOf)) {
      return sendJson({ success: false, error: 'asOf inválida.' }, 400);
    }

    return sendJson({ success: true, data: await vacationBalance(env, employee, asOf) });
  }

  if (url.pathname === '/api/benefits/calculate' && request.method === 'POST') {
    requireRole(user, ['TENANT_ADMIN']);

    const body = await request.json() as any;
    const companyId = String(body.companyId || '');
    const benefitType = String(body.benefitType || '');
    const year = Number(body.year);

    requireCompanyAccess(user, companyId);

    if (benefitType !== 'PRIMA' && benefitType !== 'CESANTIAS') {
      return sendJson({ success: false, error: 'benefitType debe ser PRIMA o CESANTIAS.' }, 400);
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return sendJson({ success: false, error: 'Año inválido.' }, 400);
    }

    const semester = Number(body.semester) === 2 ? 2 : 1;
    const period = benefitType === 'PRIMA'
      ? primaSemester(year, semester)
      : { start: `${year}-01-01`, end: `${year}-12-31` };

    // Quien se retiró dentro del periodo ya recibió esto en su
    // liquidación definitiva.
    const employees = await env.DB
      .prepare(`
        SELECT *
        FROM employees
        WHERE companyId = ?1
          AND active = 1
          AND hireDate IS NOT NULL
          AND hireDate <= ?2
          AND isIntegralSalary = 0
        ORDER BY firstName, lastName
      `)
      .bind(companyId, period.end)
      .all<any>();

    const paid = await env.DB
      .prepare(`
        SELECT employeeId
        FROM benefit_payments
        WHERE companyId = ?1 AND benefitType = ?2 AND periodStart = ?3
      `)
      .bind(companyId, benefitType, period.start)
      .all<any>();

    const paidIds = new Set((paid.results || []).map(r => String(r.employeeId)));

    const rows = [];

    for (const emp of employees.results || []) {
      const from = maxDate(emp.hireDate, period.start);
      const days = days360(from, period.end);
      const variable = await averageVariable(env, emp.id, from, period.end);
      const base = benefitBase(Number(emp.salary), variable);
      const amount = benefitType === 'PRIMA' ? prima(base, days) : cesantias(base, days);

      rows.push({
        employeeId: emp.id,
        name: employeeName(emp),
        taxId: emp.taxId,
        from,
        to: period.end,
        days,
        averageVariable: round2(variable),
        base: round2(base),
        amount: round2(amount),
        interest: benefitType === 'CESANTIAS' ? round2(interesesCesantias(amount, days)) : 0,
        alreadyPaid: paidIds.has(String(emp.id)),
      });
    }

    if (body.save) {
      const now = new Date().toISOString();
      let saved = 0;

      for (const row of rows.filter(r => !r.alreadyPaid && r.amount > 0)) {
        const records: [string, number][] =
          benefitType === 'PRIMA'
            ? [['PRIMA', row.amount]]
            : [['CESANTIAS', row.amount], ['INTERESES_CESANTIAS', row.interest]];

        for (const [type, amount] of records) {
          await env.DB
            .prepare(`
              INSERT INTO benefit_payments (
                id, employeeId, companyId, benefitType, periodStart, periodEnd,
                days, base, amount, createdAt
              )
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            `)
            .bind(
              `BP-${crypto.randomUUID()}`,
              row.employeeId,
              companyId,
              type,
              period.start,
              period.end,
              row.days,
              row.base,
              amount,
              now
            )
            .run();
        }

        row.alreadyPaid = true;
        saved++;
      }

      await audit(env as any, user, 'CREATE', 'benefit_payment', `${benefitType}-${period.start}`, companyId);

      return sendJson({ success: true, data: { period, rows, saved } });
    }

    return sendJson({ success: true, data: { period, rows } });
  }

  if (url.pathname === '/api/benefit-payments' && request.method === 'GET') {
    requireRole(user, ['TENANT_ADMIN']);

    const companyId = url.searchParams.get('companyId') || '';
    requireCompanyAccess(user, companyId);

    const result = await env.DB
      .prepare(`
        SELECT b.*, e.firstName, e.firstName2, e.lastName, e.lastName2, e.taxId
        FROM benefit_payments b
        JOIN employees e ON e.id = b.employeeId
        WHERE b.companyId = ?1
        ORDER BY b.periodStart DESC, e.firstName
      `)
      .bind(companyId)
      .all<any>();

    return sendJson({
      success: true,
      data: (result.results || []).map(r => ({
        id: r.id,
        employeeId: r.employeeId,
        name: employeeName(r),
        taxId: r.taxId,
        benefitType: r.benefitType,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        days: r.days,
        base: r.base,
        amount: r.amount,
        createdAt: r.createdAt,
      })),
    });
  }

  const paymentMatch = url.pathname.match(/^\/api\/benefit-payments\/([^/]+)$/);

  if (paymentMatch && request.method === 'DELETE') {
    requireRole(user, ['TENANT_ADMIN']);

    const id = decodeURIComponent(paymentMatch[1]);
    const row = await env.DB
      .prepare(`SELECT companyId FROM benefit_payments WHERE id = ?1`)
      .bind(id)
      .first<any>();

    if (!row) {
      return sendJson({ success: false, error: 'Pago no encontrado.' }, 404);
    }

    requireCompanyAccess(user, String(row.companyId));

    await env.DB.prepare(`DELETE FROM benefit_payments WHERE id = ?1`).bind(id).run();
    await audit(env as any, user, 'DELETE', 'benefit_payment', id, String(row.companyId));

    return sendJson({ success: true });
  }

  const terminationMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/termination(\/preview)?$/);

  if (terminationMatch && request.method === 'GET' && !terminationMatch[2]) {
    const employee = await loadEmployee(env, user, decodeURIComponent(terminationMatch[1]));

    const row = await env.DB
      .prepare(`SELECT * FROM employee_terminations WHERE employeeId = ?1`)
      .bind(employee.id)
      .first<any>();

    return sendJson({
      success: true,
      data: row
        ? {
            id: row.id,
            terminationDate: row.terminationDate,
            reason: row.reason,
            total: row.total,
            result: JSON.parse(String(row.resultJson)),
            createdAt: row.createdAt,
          }
        : null,
    });
  }

  if (terminationMatch && request.method === 'POST') {
    const employee = await loadEmployee(env, user, decodeURIComponent(terminationMatch[1]));
    const body = await request.json() as any;
    const input = await terminationInput(env, employee, body);
    const result = liquidacionDefinitiva(input);
    const data = { input, result };

    if (terminationMatch[2]) {
      return sendJson({ success: true, data });
    }

    if (!employee.active) {
      return sendJson({ success: false, error: 'El empleado ya está retirado.' }, 400);
    }

    const id = `TER-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    await env.DB
      .prepare(`
        INSERT INTO employee_terminations (
          id, employeeId, companyId, terminationDate, reason, total, resultJson, createdAt
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      `)
      .bind(
        id,
        employee.id,
        employee.companyId,
        input.terminationDate,
        input.reason,
        result.total,
        JSON.stringify(data),
        now
      )
      .run();

    await env.DB
      .prepare(`UPDATE employees SET active = 0, terminationDate = ?2 WHERE id = ?1`)
      .bind(employee.id, input.terminationDate)
      .run();

    await audit(env as any, user, 'CREATE', 'employee_termination', id, String(employee.companyId));

    return sendJson({ success: true, data: { id, ...data } }, 201);
  }

  return null;
}
