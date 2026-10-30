import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, TENANT_A, resetDb, db, call, createCompany, createEmployee, insertUser } from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

const ANA = 'ana@empresa-a.com';
const CARLA = 'carla@empresa-b.com';
const ADMIN_B = 'admin@empresa-b.com';

// Fechas lejanas: las solicitudes no pueden empezar en el pasado.
const VACATION = { requestType: 'VACATION', startDate: '2099-03-02', endDate: '2099-03-06', reason: 'Viaje familiar' };

async function scenario() {
  const a = await createCompany();
  const b = await createCompany({ name: 'Empresa B', nit: '900999888' });
  const ana = await createEmployee(a.id, { hireDate: '2025-01-01' });
  const carla = await createEmployee(b.id, { firstName: 'Carla', lastName: 'Díaz', taxId: '3000333', hireDate: '2024-01-01' });
  insertUser(ANA, 'EMPLOYEE', a.id, ana.id);
  insertUser(CARLA, 'EMPLOYEE', b.id, carla.id);
  insertUser(TENANT_A, 'TENANT_ADMIN', a.id);
  insertUser(ADMIN_B, 'TENANT_ADMIN', b.id);
  return { a, b, ana, carla };
}

describe('Solicitudes desde el portal del empleado', () => {
  test('el empleado crea, lista y cancela su solicitud', async () => {
    await scenario();

    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    expect(created.status).toBe(201);
    expect(created.json.data).toMatchObject({ status: 'PENDING', requestType: 'VACATION', businessDays: 5 });

    const list = await call(ANA, 'GET', '/api/portal/requests');
    expect(list.json.data).toHaveLength(1);

    const cancel = await call(ANA, 'POST', `/api/portal/requests/${created.json.data.id}/cancel`);
    expect(cancel.status).toBe(200);
    expect((await call(ANA, 'GET', '/api/portal/requests')).json.data[0].status).toBe('CANCELLED');

    // Ya no está pendiente: no se puede cancelar otra vez.
    expect((await call(ANA, 'POST', `/api/portal/requests/${created.json.data.id}/cancel`)).status).toBe(409);
  });

  test('valida fechas, tipo, motivo del permiso y cruces con otras solicitudes', async () => {
    await scenario();

    const past = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2020-01-01', endDate: '2020-01-03' });
    expect(past.status).toBe(400);

    const reversed = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-03-06', endDate: '2099-03-02' });
    expect(reversed.status).toBe(400);

    const badType = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, requestType: 'MATERNITY_LEAVE' });
    expect(badType.status).toBe(400);

    const noReason = await call(ANA, 'POST', '/api/portal/requests', { requestType: 'PERMISSION', startDate: '2099-04-01', endDate: '2099-04-01' });
    expect(noReason.status).toBe(400);

    expect((await call(ANA, 'POST', '/api/portal/requests', VACATION)).status).toBe(201);
    const overlap = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-03-05', endDate: '2099-03-10' });
    expect(overlap.status).toBe(400);
  });

  test('rechaza fechas imposibles, rangos de más de 120 días, solicitudes sin días hábiles y las que pasan del retiro', async () => {
    const { ana } = await scenario();

    expect((await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-02-30', endDate: '2099-02-31' })).status).toBe(400);
    expect((await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-01-01', endDate: '2099-12-31' })).status).toBe(400);
    // 2099-03-01 es domingo.
    const sunday = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-03-01', endDate: '2099-03-01' });
    expect(sunday.status).toBe(400);
    expect(sunday.json.error).toMatch(/días hábiles/);

    db.prepare(`UPDATE employees SET terminationDate = '2099-03-04' WHERE id = ?`).run(ana.id);
    const pastTermination = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    expect(pastTermination.status).toBe(400);
    expect(pastTermination.json.error).toMatch(/retiro/);
  });

  test('el saldo disponible descuenta las otras solicitudes pendientes', async () => {
    await scenario();
    const first = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    const second = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-04-06', endDate: '2099-04-10' });

    expect(second.json.data.pendingDays).toBe(first.json.data.pendingDays - 5);
  });

  test('marca si las vacaciones pedidas superan el saldo acumulado', async () => {
    await scenario();

    const long = await call(ANA, 'POST', '/api/portal/requests', { ...VACATION, startDate: '2099-03-02', endDate: '2099-05-29' });
    expect(long.status).toBe(201);
    expect(long.json.data.pendingDays).toBeGreaterThan(0);
    expect(long.json.data.exceedsBalance).toBe(true);
  });

  test('un empleado no ve ni cancela solicitudes de otro', async () => {
    await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);

    expect((await call(CARLA, 'GET', '/api/portal/requests')).json.data).toHaveLength(0);
    expect((await call(CARLA, 'POST', `/api/portal/requests/${created.json.data.id}/cancel`)).status).toBe(404);
  });
});

describe('Aprobación por el administrador', () => {
  test('aprobar vacaciones registra la novedad y la descuenta del saldo', async () => {
    const { a, ana } = await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);

    const pending = await call(TENANT_A, 'GET', `/api/employee-requests?companyId=${a.id}&status=PENDING`);
    expect(pending.status).toBe(200);
    expect(pending.json.data).toHaveLength(1);
    expect(pending.json.data[0]).toMatchObject({ employeeName: 'Ana Gómez', businessDays: 5 });

    const approve = await call(TENANT_A, 'POST', `/api/employee-requests/${created.json.data.id}/approve`, { notes: 'Disfrútalas' });
    expect(approve.status).toBe(200);
    expect(approve.json.data).toMatchObject({ status: 'APPROVED', decisionNotes: 'Disfrútalas' });
    expect(approve.json.data.leaveId).toMatch(/^LV-/);

    const leaves = await call(TENANT_A, 'GET', `/api/employee-leaves?employeeId=${ana.id}`);
    expect(leaves.json.data.map((l: any) => l.leaveType)).toEqual(['VACATION']);

    // No se aprueba dos veces.
    expect((await call(TENANT_A, 'POST', `/api/employee-requests/${created.json.data.id}/approve`)).status).toBe(409);

    // El empleado ve la decisión.
    const mine = await call(ANA, 'GET', '/api/portal/requests');
    expect(mine.json.data[0]).toMatchObject({ status: 'APPROVED', decisionNotes: 'Disfrútalas' });
  });

  test('borrar la novedad de unas vacaciones aprobadas cancela la solicitud', async () => {
    await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    const approve = await call(TENANT_A, 'POST', `/api/employee-requests/${created.json.data.id}/approve`);

    const removed = await call(TENANT_A, 'DELETE', `/api/employee-leaves/${approve.json.data.leaveId}`);
    expect(removed.status).toBe(200);

    const mine = (await call(ANA, 'GET', '/api/portal/requests')).json.data[0];
    expect(mine).toMatchObject({ status: 'CANCELLED', leaveId: null });
    expect(mine.decisionNotes).toMatch(/eliminada/);
  });

  test('no se puede pedir sobre una novedad ya registrada', async () => {
    const { ana } = await scenario();
    await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: ana.id, leaveType: 'WORK_INCAPACITY', startDate: '2099-03-04', endDate: '2099-03-10',
    });
    const res = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/2099-03-04 al 2099-03-10/);
  });

  test('editar la novedad actualiza la solicitud; cambiarla de tipo la cancela', async () => {
    await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);
    const approve = await call(TENANT_A, 'POST', `/api/employee-requests/${created.json.data.id}/approve`);
    const leaveId = approve.json.data.leaveId;

    const moved = await call(TENANT_A, 'PUT', `/api/employee-leaves/${leaveId}`, { leaveType: 'VACATION', startDate: '2099-03-09', endDate: '2099-03-13' });
    expect(moved.status).toBe(200);
    expect((await call(ANA, 'GET', '/api/portal/requests')).json.data[0]).toMatchObject({ status: 'APPROVED', startDate: '2099-03-09', endDate: '2099-03-13' });

    await call(TENANT_A, 'PUT', `/api/employee-leaves/${leaveId}`, { leaveType: 'GENERAL_INCAPACITY', startDate: '2099-03-09', endDate: '2099-03-13' });
    expect((await call(ANA, 'GET', '/api/portal/requests')).json.data[0]).toMatchObject({ status: 'CANCELLED', leaveId: null });
  });

  test('si la novedad no se puede registrar, la solicitud sigue pendiente', async () => {
    const { ana } = await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);

    // El administrador ya registró una incapacidad en esas fechas.
    const leave = await call(SUPER, 'POST', '/api/employee-leaves', {
      employeeId: ana.id, leaveType: 'GENERAL_INCAPACITY', startDate: '2099-03-03', endDate: '2099-03-04',
    });
    expect(leave.status).toBe(201);

    const approve = await call(TENANT_A, 'POST', `/api/employee-requests/${created.json.data.id}/approve`);
    expect(approve.status).toBe(400);
    expect(approve.json.error).toMatch(/se solapa/);
    expect((await call(ANA, 'GET', '/api/portal/requests')).json.data[0].status).toBe('PENDING');
  });

  test('aprobar un permiso no crea novedad; rechazar guarda el motivo', async () => {
    await scenario();
    const permission = await call(ANA, 'POST', '/api/portal/requests', {
      requestType: 'PERMISSION', startDate: '2099-04-01', endDate: '2099-04-01', reason: 'Cita médica',
    });
    const vacation = await call(ANA, 'POST', '/api/portal/requests', VACATION);

    const approved = await call(TENANT_A, 'POST', `/api/employee-requests/${permission.json.data.id}/approve`);
    expect(approved.json.data).toMatchObject({ status: 'APPROVED', leaveId: null });

    const rejected = await call(TENANT_A, 'POST', `/api/employee-requests/${vacation.json.data.id}/reject`, { notes: 'Temporada alta' });
    expect(rejected.json.data).toMatchObject({ status: 'REJECTED', decisionNotes: 'Temporada alta' });
  });

  test('aislamiento: el administrador de otra empresa no ve ni decide', async () => {
    const { a } = await scenario();
    const created = await call(ANA, 'POST', '/api/portal/requests', VACATION);

    expect((await call(ADMIN_B, 'GET', `/api/employee-requests?companyId=${a.id}`)).status).toBe(403);
    expect((await call(ADMIN_B, 'POST', `/api/employee-requests/${created.json.data.id}/approve`)).status).toBe(403);
    // Un empleado tampoco puede aprobar.
    expect((await call(ANA, 'POST', `/api/employee-requests/${created.json.data.id}/approve`)).status).toBe(403);
  });
});
