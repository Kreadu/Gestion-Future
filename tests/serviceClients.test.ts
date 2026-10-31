import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, resetDb, db, call, createCompany, insertUser } from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

async function setup() {
  const company = await createCompany({ name: 'Mi Temporal S.A.S.', nit: '901000111' });
  db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-1', 'Iván', 'Lara', '1061000777', 'Camarero')`).run();
  return company;
}

const client = (companyId: string, extra: Record<string, unknown> = {}) =>
  call(SUPER, 'POST', '/api/service-clients', {
    companyId, name: 'Hotel Andino', nit: '800111222', figure: 'SERVICIO', billingMode: 'COST_PLUS', adminFeePct: 12, arlRiskClass: 2, ...extra,
  });

const engagement = (companyId: string, extra: Record<string, unknown> = {}) =>
  call(SUPER, 'POST', '/api/engagements', {
    companyId, professionalId: 'PRO-1', vinculationType: 'PART_TIME_EMPLOYEE', hourlyRate: 10000,
    startDate: '2026-10-01', weeklyHours: 42, contractType: '2', ...extra,
  });

describe('clientes del personal por horas', () => {
  test('crea, lista y edita clientes con su figura, forma de cobro y riesgo ARL', async () => {
    const company = await setup();
    const created = await client(company.id);
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ figure: 'SERVICIO', billingMode: 'COST_PLUS', adminFeePct: 12, arlRiskClass: 2 });

    expect((await client(company.id, { figure: 'OTRA' })).status).toBe(400);
    expect((await client(company.id, { arlRiskClass: 7 })).status).toBe(400);

    const edited = await call(SUPER, 'PUT', `/api/service-clients/${created.json.data.id}`, { adminFeePct: 15 });
    expect(edited.json.data.adminFeePct).toBe(15);

    const list = await call(SUPER, 'GET', `/api/service-clients?companyId=${company.id}`);
    expect(list.json.data).toHaveLength(1);
  });

  test('otra empresa no ve ni usa los clientes ajenos', async () => {
    const company = await setup();
    const other = await createCompany({ name: 'Otra', nit: '900555444' });
    insertUser('admin@otra.co', 'TENANT_ADMIN', other.id);
    const c = await client(company.id);
    expect((await call('admin@otra.co', 'GET', `/api/service-clients?companyId=${company.id}`)).status).toBe(403);
    expect((await call('admin@otra.co', 'PUT', `/api/service-clients/${c.json.data.id}`, { name: 'x' })).status).toBe(403);

    db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-2', 'Ana', 'Paz', '1061000666', 'Aseo')`).run();
    const res = await call(SUPER, 'POST', '/api/engagements', {
      companyId: other.id, professionalId: 'PRO-2', vinculationType: 'PART_TIME_EMPLOYEE', hourlyRate: 10000,
      startDate: '2026-10-01', weeklyHours: 42, clientId: c.json.data.id,
    });
    expect(res.status).toBe(404);
  });

  test('servicio (aseo, meseros): el trabajador se asigna al cliente y liquida con su riesgo ARL', async () => {
    const company = await setup();
    const c = await client(company.id, { arlRiskClass: 3 });
    const e = await engagement(company.id, { clientId: c.json.data.id, position: 'Camarero' });
    expect(e.status).toBe(201);
    expect(e.json.data).toMatchObject({ clientId: c.json.data.id, position: 'Camarero' });

    expect((await call(SUPER, 'POST', '/api/time-entries', {
      engagementId: e.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11', hoursByType: { ordinary: 40 },
    })).status).toBe(201);
    const s = await call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: e.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    expect(s.status).toBe(201);
    expect(s.json.data.calculation.employerContributions.arlValue).toBeCloseTo(400000 * 0.02436, 2);
  });

  test('cobro por hora exige tarifa de cobro en la asignación', async () => {
    const company = await setup();
    const c = await client(company.id, { billingMode: 'HOURLY_RATE' });
    expect((await engagement(company.id, { clientId: c.json.data.id })).status).toBe(400);
    const ok = await engagement(company.id, { clientId: c.json.data.id, billRate: 22000 });
    expect(ok.status).toBe(201);
    expect(ok.json.data.billRate).toBe(22000);
  });

  test('un contratista independiente no se asigna a clientes', async () => {
    const company = await setup();
    const c = await client(company.id);
    const res = await engagement(company.id, {
      vinculationType: 'INDEPENDENT_SERVICES', retentionConcept: 'SERVICIOS', deliverableDescription: 'x', clientId: c.json.data.id,
    });
    expect(res.status).toBe(400);
  });
});

describe('trabajadores en misión (EST)', () => {
  test('exige la autorización del Ministerio, cliente usuaria EST y misión de máximo un año', async () => {
    const company = await setup();
    const usuaria = await client(company.id, { figure: 'EST', name: 'Fábrica Usuaria' });
    const est = { vinculationType: 'EST_MISSION', clientId: usuaria.json.data.id, endDate: '2027-03-31' };

    const sinAutorizacion = await engagement(company.id, est);
    expect(sinAutorizacion.status).toBe(400);
    expect(sinAutorizacion.json.error).toContain('Ministerio del Trabajo');

    expect((await call(SUPER, 'PUT', `/api/companies/${company.id}/est-authorization`, { resolution: '' })).status).toBe(400);
    const auth = await call(SUPER, 'PUT', `/api/companies/${company.id}/est-authorization`, {
      resolution: 'Res. 1234', resolutionDate: '2025-06-01', insurancePolicy: 'PÓL-99',
    });
    expect(auth.json.data).toMatchObject({ resolution: 'Res. 1234', insurancePolicy: 'PÓL-99' });

    expect((await engagement(company.id, { ...est, endDate: undefined })).status).toBe(400);
    const tooLong = await engagement(company.id, { ...est, endDate: '2027-10-02' });
    expect(tooLong.status).toBe(400);
    expect(tooLong.json.error).toContain('un año');

    const servicio = await client(company.id);
    expect((await engagement(company.id, { ...est, clientId: servicio.json.data.id })).status).toBe(400);
    // Un cliente EST no recibe personal por la figura de servicio.
    expect((await engagement(company.id, { clientId: usuaria.json.data.id })).status).toBe(400);

    const ok = await engagement(company.id, est);
    expect(ok.status).toBe(201);
    expect((await call(SUPER, 'PUT', `/api/engagements/${ok.json.data.id}`, { endDate: '2027-12-31' })).status).toBe(400);

    // La misión se liquida por horas, como cualquier empleado por horas.
    expect((await call(SUPER, 'POST', '/api/time-entries', {
      engagementId: ok.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11', hoursByType: { ordinary: 30, night: 6 },
    })).status).toBe(201);
    const s = await call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: ok.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    expect(s.status).toBe(201);
    expect(s.json.data.calculation.recargoNocturnoValue).toBeCloseTo(10000 * 0.35 * 6, 2);
    expect(s.json.data.dianDocument.xmlContent).toContain('<NominaIndividual');
  });

  test('no cambia la figura de un cliente con personal asignado', async () => {
    const company = await setup();
    const c = await client(company.id);
    await engagement(company.id, { clientId: c.json.data.id });
    expect((await call(SUPER, 'PUT', `/api/service-clients/${c.json.data.id}`, { figure: 'EST' })).status).toBe(409);
  });
});

describe('cobro al cliente', () => {
  async function liquidated(clientExtra: Record<string, unknown>, engagementExtra: Record<string, unknown> = {}) {
    const company = await setup();
    const c = await client(company.id, clientExtra);
    const e = await engagement(company.id, { clientId: c.json.data.id, position: 'Camarero', ...engagementExtra });
    await call(SUPER, 'POST', '/api/time-entries', {
      engagementId: e.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11',
      hoursByType: { ordinary: 30, night: 4, sunday: 6 },
    });
    const s = await call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: e.json.data.id, periodStart: '2026-10-05', periodEnd: '2026-10-11' });
    expect(s.status).toBe(201);
    return { clientId: c.json.data.id, engagementId: e.json.data.id, calc: s.json.data.calculation };
  }

  test('por hora: horas × tarifa de cobro con los mismos recargos', async () => {
    const { clientId, engagementId } = await liquidated({ billingMode: 'HOURLY_RATE' }, { billRate: 20000 });
    // Cambiar la tarifa después no altera lo ya liquidado.
    await call(SUPER, 'PUT', `/api/engagements/${engagementId}`, { billRate: 99999 });

    const res = await call(SUPER, 'GET', `/api/service-clients/${clientId}/billing?from=2026-10-01&to=2026-10-31`);
    expect(res.status).toBe(200);
    expect(res.json.data.lines).toHaveLength(1);
    expect(res.json.data.lines[0]).toMatchObject({ worker: 'Iván Lara', position: 'Camarero', hours: 40 });
    expect(res.json.data.totals.billed).toBeCloseTo(20000 * (30 + 4 * 1.35 + 6 * 1.9), 2);
  });

  test('costo + % administración: nómina, aportes y prestaciones más el porcentaje', async () => {
    const { clientId, calc } = await liquidated({ billingMode: 'COST_PLUS', adminFeePct: 12 });
    const cost = calc.grossEarnings + calc.employerContributions.totalContributions + calc.provisions.totalProvisions;
    const res = await call(SUPER, 'GET', `/api/service-clients/${clientId}/billing?from=2026-10-01&to=2026-10-31`);
    expect(res.json.data.totals.payrollCost).toBeCloseTo(cost, 1);
    expect(res.json.data.totals.billed).toBeCloseTo(cost * 1.12, 1);
    expect(res.json.data.totals.margin).toBeCloseTo(cost * 0.12, 1);

    const empty = await call(SUPER, 'GET', `/api/service-clients/${clientId}/billing?from=2026-11-01&to=2026-11-30`);
    expect(empty.json.data.lines).toHaveLength(0);
    expect((await call(SUPER, 'GET', `/api/service-clients/${clientId}/billing?from=x&to=y`)).status).toBe(400);
  });
});

describe('liquidación del mes por cliente', () => {
  test('liquida el mes de todos los trabajadores con planilla y avisa quién no la tiene', async () => {
    const company = await setup();
    db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-2', 'Ana', 'Paz', '1061000666', 'Mesera')`).run();
    const c = await client(company.id);
    const clientId = c.json.data.id;
    const ivan = await engagement(company.id, { clientId, position: 'Camarero' });
    const ana = await engagement(company.id, { clientId, professionalId: 'PRO-2', position: 'Mesera' });

    // Dos planillas semanales de Iván en octubre; Ana no entregó la suya.
    for (const [start, end] of [['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18']]) {
      expect((await call(SUPER, 'POST', '/api/time-entries', {
        engagementId: ivan.json.data.id, periodStart: start, periodEnd: end, hoursByType: { ordinary: 20 },
      })).status).toBe(201);
    }

    const res = await call(SUPER, 'POST', `/api/service-clients/${clientId}/settle-month`, { month: '2026-10' });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(res.json.data.settled).toHaveLength(1);
    expect(res.json.data.settled[0]).toMatchObject({ worker: 'Iván Lara', totalHours: 40 });
    expect(res.json.data.missingTimesheet).toEqual([{ engagementId: ana.json.data.id, worker: 'Ana Paz', position: 'Mesera' }]);

    // Cuando el cliente llena la planilla de Ana, se liquida sólo ella.
    await call(SUPER, 'POST', '/api/time-entries', {
      engagementId: ana.json.data.id, periodStart: '2026-10-01', periodEnd: '2026-10-31', hoursByType: { ordinary: 60 },
    });
    const again = await call(SUPER, 'POST', `/api/service-clients/${clientId}/settle-month`, { month: '2026-10' });
    expect(again.json.data.settled.map((s: any) => s.worker)).toEqual(['Ana Paz']);
    expect(again.json.data.alreadySettled.map((s: any) => s.worker)).toEqual(['Iván Lara']);

    const billing = await call(SUPER, 'GET', `/api/service-clients/${clientId}/billing?from=2026-10-01&to=2026-10-31`);
    expect(billing.json.data.lines).toHaveLength(2);

    expect((await call(SUPER, 'POST', `/api/service-clients/${clientId}/settle-month`, { month: '2026-13' })).status).toBe(400);
  });

  test('otra empresa no liquida el mes de un cliente ajeno', async () => {
    const company = await setup();
    const other = await createCompany({ name: 'Otra', nit: '900555444' });
    insertUser('admin@otra.co', 'TENANT_ADMIN', other.id);
    const c = await client(company.id);
    expect((await call('admin@otra.co', 'POST', `/api/service-clients/${c.json.data.id}/settle-month`, { month: '2026-10' })).status).toBe(403);
  });

  test('una planilla no puede cruzar de un mes a otro', async () => {
    const company = await setup();
    const e = await engagement(company.id);
    const res = await call(SUPER, 'POST', '/api/time-entries', {
      engagementId: e.json.data.id, periodStart: '2026-10-26', periodEnd: '2026-11-01', hoursByType: { ordinary: 40 },
    });
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('mismo mes');
  });
});
