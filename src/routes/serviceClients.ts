/**
 * Clientes del personal por horas (empresa de servicios temporales y
 * servicios como aseo o meseros):
 *
 *   GET  /api/service-clients?companyId=   clientes de la empresa
 *   POST /api/service-clients              crear
 *   PUT  /api/service-clients/:id          editar (o desactivar con active=false)
 *   GET|PUT /api/companies/:id/est-authorization  autorización EST del Ministerio
 *
 * Cada vinculación por horas puede quedar asignada a un cliente
 * (resolveAssignment). Un trabajador en misión (EST_MISSION) exige que
 * la empresa tenga la autorización EST, que el cliente sea usuaria EST
 * y que la misión no pase de 6 meses prorrogables por otros 6 (art. 77
 * Ley 50 de 1990): fecha de fin obligatoria, máximo un año.
 */

import { sendJson } from '../http';
import { HttpError, audit, requireCompanyAccess, requireRole, type AuthEnv, type AuthUser } from '../auth/authz';
import { RiskClass } from '../types/payroll';
import { CONSTANTS_2026 } from '../engine/countries/constants2026';
import { HOUR_TYPES, type HourBreakdown } from '../types/hourly';

export const ARL_RATES: Record<number, RiskClass> = {
  1: RiskClass.CLASS_I,
  2: RiskClass.CLASS_II,
  3: RiskClass.CLASS_III,
  4: RiskClass.CLASS_IV,
  5: RiskClass.CLASS_V,
};

export interface ServiceClient {
  id: string;
  companyId: string;
  name: string;
  nit: string | null;
  address: string | null;
  city: string | null;
  figure: 'EST' | 'SERVICIO';
  billingMode: 'HOURLY_RATE' | 'COST_PLUS';
  adminFeePct: number;
  arlRiskClass: number;
  active: boolean;
}

export function normalizeServiceClient(row: any): ServiceClient {
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    name: String(row.name),
    nit: row.nit ?? null,
    address: row.address ?? null,
    city: row.city ?? null,
    figure: row.figure === 'EST' ? 'EST' : 'SERVICIO',
    billingMode: row.billingMode === 'HOURLY_RATE' ? 'HOURLY_RATE' : 'COST_PLUS',
    adminFeePct: Number(row.adminFeePct ?? 0),
    arlRiskClass: Number(row.arlRiskClass ?? 1),
    active: !!row.active,
  };
}

function parseClient(body: any, existing: any | null) {
  const pick = (key: string) => (body[key] === undefined ? existing?.[key] : body[key]);
  const name = String(pick('name') || '').trim();
  const figure = pick('figure');
  const billingMode = pick('billingMode') || 'COST_PLUS';
  const adminFeePct = Number(pick('adminFeePct') ?? 0);
  const arlRiskClass = Number(pick('arlRiskClass') ?? 1);

  if (!name) throw new HttpError(400, 'El nombre del cliente es obligatorio.');
  if (figure !== 'EST' && figure !== 'SERVICIO') {
    throw new HttpError(400, "La figura debe ser 'EST' (empresa usuaria) o 'SERVICIO' (prestación de servicio).");
  }
  if (billingMode !== 'HOURLY_RATE' && billingMode !== 'COST_PLUS') {
    throw new HttpError(400, "La forma de cobro debe ser 'HOURLY_RATE' o 'COST_PLUS'.");
  }
  if (!Number.isFinite(adminFeePct) || adminFeePct < 0 || adminFeePct > 100) {
    throw new HttpError(400, 'El porcentaje de administración debe estar entre 0 y 100.');
  }
  if (!ARL_RATES[arlRiskClass]) throw new HttpError(400, 'La clase de riesgo ARL debe ser de 1 a 5.');

  return {
    name,
    nit: String(pick('nit') || '').trim() || null,
    address: String(pick('address') || '').trim() || null,
    city: String(pick('city') || '').trim() || null,
    figure,
    billingMode,
    adminFeePct,
    arlRiskClass,
    active: body.active === undefined ? (existing ? existing.active : 1) : (body.active ? 1 : 0),
  };
}

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

export interface Assignment {
  clientId: string | null;
  position: string | null;
  billRate: number | null;
  arlRiskClass: number | null;
}

/**
 * Valida la asignación de una vinculación a un cliente y las reglas de
 * la EST. `body` trae clientId, position y billRate (crear o editar).
 */
export async function resolveAssignment(
  env: AuthEnv,
  companyId: string,
  vinculationType: string,
  startDate: string,
  endDate: string | null,
  body: any,
  existing: any | null = null
): Promise<Assignment> {
  const clientId = String((body.clientId === undefined ? existing?.clientId : body.clientId) || '').trim() || null;
  const position = String((body.position === undefined ? existing?.position : body.position) || '').trim() || null;
  const rawRate = body.billRate === undefined ? existing?.billRate : body.billRate;
  const billRate = rawRate === null || rawRate === undefined || rawRate === '' ? null : Number(rawRate);

  if (billRate !== null && (!Number.isFinite(billRate) || billRate <= 0)) {
    throw new HttpError(400, 'La tarifa de cobro por hora debe ser mayor que cero.');
  }

  let client: any = null;
  if (clientId) {
    if (vinculationType === 'INDEPENDENT_SERVICES') {
      throw new HttpError(400, 'Un contratista independiente no se asigna a clientes: no es personal de la empresa.');
    }
    client = await env.DB
      .prepare(`SELECT * FROM service_clients WHERE id = ?1 AND companyId = ?2 AND active = 1`)
      .bind(clientId, companyId)
      .first<any>();
    if (!client) throw new HttpError(404, 'El cliente no existe, está inactivo o es de otra empresa.');
    if (client.billingMode === 'HOURLY_RATE' && billRate === null) {
      throw new HttpError(400, 'Este cliente se cobra por hora: indica la tarifa de cobro por hora de la asignación.');
    }
  }

  if (vinculationType === 'EST_MISSION') {
    const authorization = await env.DB
      .prepare(`SELECT resolution FROM company_est_authorization WHERE companyId = ?1`)
      .bind(companyId)
      .first<any>();
    if (!authorization) {
      throw new HttpError(
        400,
        'Para enviar trabajadores en misión, registra primero la resolución del Ministerio del Trabajo que autoriza a la empresa como EST.'
      );
    }
    if (!client || client.figure !== 'EST') {
      throw new HttpError(400, 'Un trabajador en misión debe asignarse a un cliente con figura EST (empresa usuaria).');
    }
    if (!endDate) {
      throw new HttpError(400, 'La misión necesita fecha de fin: máximo 6 meses, prorrogables hasta un año (art. 77 Ley 50 de 1990).');
    }
    if (endDate > addMonths(startDate, 12)) {
      throw new HttpError(
        400,
        'La misión no puede pasar de un año (6 meses prorrogables por 6 más, art. 77 Ley 50 de 1990).'
      );
    }
  } else if (client && client.figure === 'EST') {
    throw new HttpError(400, 'Para un cliente usuario EST usa la modalidad "Trabajador en misión (EST)".');
  }

  return { clientId, position, billRate, arlRiskClass: client ? Number(client.arlRiskClass) : null };
}

export async function handleServiceClientRoutes(
  request: Request,
  url: URL,
  env: AuthEnv,
  user: AuthUser
): Promise<Response | null> {
  const estMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/est-authorization$/);
  if (estMatch && (request.method === 'GET' || request.method === 'PUT')) {
    const companyId = decodeURIComponent(estMatch[1]);
    requireRole(user, ['TENANT_ADMIN']);
    requireCompanyAccess(user, companyId);

    if (request.method === 'PUT') {
      const body = (await request.json().catch(() => ({}))) as any;
      const resolution = String(body.resolution || '').trim();
      const resolutionDate = String(body.resolutionDate || '').trim();
      if (!resolution || !/^\d{4}-\d{2}-\d{2}$/.test(resolutionDate)) {
        throw new HttpError(400, 'Indica el número y la fecha de la resolución del Ministerio del Trabajo.');
      }
      await env.DB
        .prepare(`
          INSERT INTO company_est_authorization (companyId, resolution, resolutionDate, insurancePolicy, updatedAt)
          VALUES (?1, ?2, ?3, ?4, ?5)
          ON CONFLICT(companyId) DO UPDATE SET
            resolution = excluded.resolution,
            resolutionDate = excluded.resolutionDate,
            insurancePolicy = excluded.insurancePolicy,
            updatedAt = excluded.updatedAt
        `)
        .bind(companyId, resolution, resolutionDate, String(body.insurancePolicy || '').trim() || null, new Date().toISOString())
        .run();
      await audit(env, user, 'UPDATE', 'est_authorization', companyId, companyId);
    }

    const row = await env.DB
      .prepare(`SELECT resolution, resolutionDate, insurancePolicy, updatedAt FROM company_est_authorization WHERE companyId = ?1`)
      .bind(companyId)
      .first<any>();
    return sendJson({ success: true, data: row || null });
  }

  if (url.pathname === '/api/service-clients' && request.method === 'GET') {
    requireRole(user, ['TENANT_ADMIN']);
    const companyId = url.searchParams.get('companyId') || '';
    requireCompanyAccess(user, companyId);
    const rows = await env.DB
      .prepare(`SELECT * FROM service_clients WHERE companyId = ?1 ORDER BY active DESC, name ASC`)
      .bind(companyId)
      .all<any>();
    return sendJson({ success: true, data: (rows.results || []).map(normalizeServiceClient) });
  }

  if (url.pathname === '/api/service-clients' && request.method === 'POST') {
    requireRole(user, ['TENANT_ADMIN']);
    const body = (await request.json().catch(() => ({}))) as any;
    const companyId = String(body.companyId || '');
    requireCompanyAccess(user, companyId);
    const company = await env.DB.prepare(`SELECT id FROM companies WHERE id = ?1 AND active = 1`).bind(companyId).first();
    if (!company) throw new HttpError(404, 'La empresa no existe o está inactiva.');

    const client = parseClient(body, null);
    const id = `CLI-${crypto.randomUUID()}`;
    await env.DB
      .prepare(`
        INSERT INTO service_clients (id, companyId, name, nit, address, city, figure, billingMode, adminFeePct, arlRiskClass, active, createdAt)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)
      `)
      .bind(id, companyId, client.name, client.nit, client.address, client.city, client.figure, client.billingMode,
        client.adminFeePct, client.arlRiskClass, new Date().toISOString())
      .run();
    await audit(env, user, 'CREATE', 'service_client', id, companyId);
    const row = await env.DB.prepare(`SELECT * FROM service_clients WHERE id = ?1`).bind(id).first();
    return sendJson({ success: true, data: normalizeServiceClient(row) }, 201);
  }

  const billingMatch = url.pathname.match(/^\/api\/service-clients\/([^/]+)\/billing$/);
  if (billingMatch && request.method === 'GET') {
    const data = await clientBilling(
      env, user, decodeURIComponent(billingMatch[1]),
      url.searchParams.get('from') || '', url.searchParams.get('to') || ''
    );
    return sendJson({ success: true, data });
  }

  const match = url.pathname.match(/^\/api\/service-clients\/([^/]+)$/);
  if (match && request.method === 'PUT') {
    requireRole(user, ['TENANT_ADMIN']);
    const id = decodeURIComponent(match[1]);
    const existing = await env.DB.prepare(`SELECT * FROM service_clients WHERE id = ?1`).bind(id).first<any>();
    if (!existing) throw new HttpError(404, 'Cliente no encontrado.');
    requireCompanyAccess(user, String(existing.companyId));

    const body = (await request.json().catch(() => ({}))) as any;
    const client = parseClient(body, existing);
    if (client.figure !== existing.figure) {
      const assigned = await env.DB
        .prepare(`SELECT COUNT(*) AS n FROM engagements WHERE clientId = ?1 AND active = 1`)
        .bind(id)
        .first<any>();
      if (Number(assigned?.n) > 0) {
        throw new HttpError(409, 'No se puede cambiar la figura de un cliente con personal asignado.');
      }
    }
    await env.DB
      .prepare(`
        UPDATE service_clients
        SET name = ?1, nit = ?2, address = ?3, city = ?4, figure = ?5, billingMode = ?6,
            adminFeePct = ?7, arlRiskClass = ?8, active = ?9
        WHERE id = ?10
      `)
      .bind(client.name, client.nit, client.address, client.city, client.figure, client.billingMode,
        client.adminFeePct, client.arlRiskClass, client.active, id)
      .run();
    await audit(env, user, 'UPDATE', 'service_client', id, String(existing.companyId));
    const row = await env.DB.prepare(`SELECT * FROM service_clients WHERE id = ?1`).bind(id).first();
    return sendJson({ success: true, data: normalizeServiceClient(row) });
  }

  return null;
}

// ------------------------------------------------------------
// COBRO AL CLIENTE
// ------------------------------------------------------------


const N = CONSTANTS_2026.RECARGO_NOCTURNO_FACTOR;
const D = CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;

/** Factor sobre la tarifa por hora de cada tipo de hora (mismos recargos que la nómina). */
export const HOUR_FACTORS: Record<keyof HourBreakdown, number> = {
  ordinary: 1,
  night: 1 + N,
  sunday: 1 + D,
  sundayNight: 1 + D + N,
  extraDay: CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER,
  extraNight: CONSTANTS_2026.EXTRA_NOCTURNA_MULTIPLIER,
  extraSundayDay: CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER + D,
  extraSundayNight: CONSTANTS_2026.EXTRA_NOCTURNA_MULTIPLIER + D,
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface BillingLine {
  settlementId: string;
  worker: string;
  taxId: string;
  position: string | null;
  periodStart: string;
  periodEnd: string;
  hours: number;
  hoursByType: Record<string, number>;
  /** Devengado + aportes del empleador + provisiones de prestaciones. */
  payrollCost: number;
  billed: number;
}

/**
 * GET /api/service-clients/:id/billing?from=AAAA-MM-DD&to=AAAA-MM-DD
 * Liquidaciones del periodo asignadas al cliente y lo que hay que cobrarle.
 */
export async function clientBilling(env: AuthEnv, user: AuthUser, clientId: string, from: string, to: string) {
  requireRole(user, ['TENANT_ADMIN']);
  const client = await env.DB.prepare(`SELECT * FROM service_clients WHERE id = ?1`).bind(clientId).first<any>();
  if (!client) throw new HttpError(404, 'Cliente no encontrado.');
  requireCompanyAccess(user, String(client.companyId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    throw new HttpError(400, 'Indica el periodo (desde y hasta) en formato AAAA-MM-DD.');
  }

  const rows = await env.DB
    .prepare(`
      SELECT s.id, s.periodStart, s.periodEnd, s.resultJson,
             p.firstName, p.lastName, p.taxId
      FROM settlements s
      JOIN engagements e ON e.id = s.engagementId
      JOIN professionals p ON p.id = e.professionalId
      WHERE json_extract(s.resultJson, '$.assignment.clientId') = ?1
        AND s.periodStart >= ?2
        AND s.periodEnd <= ?3
      ORDER BY s.periodStart ASC, p.lastName ASC
    `)
    .bind(clientId, from, to)
    .all<any>();

  const lines: BillingLine[] = (rows.results || []).map(row => {
    const result = JSON.parse(String(row.resultJson));
    const calc = result.calculation || {};
    const assignment = result.assignment || {};
    const hoursByType: Record<string, number> = assignment.hours || calc.hoursBreakdown || {};
    const hours = HOUR_TYPES.reduce((sum, type) => sum + Number(hoursByType[type] || 0), 0);
    const payrollCost =
      Number(calc.grossEarnings || 0) +
      Number(calc.employerContributions?.totalContributions || 0) +
      Number(calc.provisions?.totalProvisions || 0);
    const billed = client.billingMode === 'HOURLY_RATE'
      ? HOUR_TYPES.reduce((sum, type) => sum + Number(hoursByType[type] || 0) * HOUR_FACTORS[type], 0) * Number(assignment.billRate || 0)
      : payrollCost * (1 + Number(client.adminFeePct || 0) / 100);
    return {
      settlementId: String(row.id),
      worker: `${row.firstName} ${row.lastName}`.trim(),
      taxId: String(row.taxId || ''),
      position: assignment.position ?? null,
      periodStart: String(row.periodStart),
      periodEnd: String(row.periodEnd),
      hours: round2(hours),
      hoursByType,
      payrollCost: round2(payrollCost),
      billed: round2(billed),
    };
  });

  const totals = lines.reduce(
    (acc, line) => ({ hours: acc.hours + line.hours, payrollCost: acc.payrollCost + line.payrollCost, billed: acc.billed + line.billed }),
    { hours: 0, payrollCost: 0, billed: 0 }
  );

  return {
    client: normalizeServiceClient(client),
    from,
    to,
    lines,
    totals: {
      hours: round2(totals.hours),
      payrollCost: round2(totals.payrollCost),
      billed: round2(totals.billed),
      margin: round2(totals.billed - totals.payrollCost),
    },
    warnings: client.billingMode === 'HOURLY_RATE' && lines.some(l => l.billed === 0)
      ? ['Hay liquidaciones sin tarifa de cobro por hora: revisa la asignación del trabajador.']
      : [],
  };
}
