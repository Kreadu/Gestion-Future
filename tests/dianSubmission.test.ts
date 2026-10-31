import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { SUPER, TENANT_A, resetDb, db, env, call, createCompany, createEmployee, insertUser } from './helpers/api';
import { testP12 } from './helpers/dianCert';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

// Firmar con RSA y abrir el .p12 es lento cuando Jest corre suites en paralelo.
jest.setTimeout(30000);

const ADMIN_B = 'admin@empresa-b.com';

const ZIP_KEY = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendTestSetAsyncResponse xmlns="http://wcf.dian.colombia">
<SendTestSetAsyncResult xmlns:b="http://schemas.datacontract.org/2004/07/UploadDocumentResponse"><b:ErrorMessageList/><b:ZipKey>zip-123</b:ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`;

const status = (valid: boolean, code: string, errors: string[] = []) => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
<GetStatusZipResponse xmlns="http://wcf.dian.colombia"><GetStatusZipResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
<b:DianResponse><b:ErrorMessage>${errors.map(e => `<c:string>${e}</c:string>`).join('')}</b:ErrorMessage><b:IsValid>${valid}</b:IsValid>
<b:StatusCode>${code}</b:StatusCode><b:StatusDescription>${valid ? 'Procesado Correctamente.' : 'Documento con errores'}</b:StatusDescription></b:DianResponse>
</GetStatusZipResult></GetStatusZipResponse></s:Body></s:Envelope>`;

const CONFIG_KEY = 'llave-de-prueba-de-32-caracteres!!';

const HABILITACION = {
  softwareId: 'software-real',
  pin: '24680',
  testSetId: 'set-abc',
  environment: '2',
  certificateP12Base64: testP12().p12Base64,
  certificatePassword: testP12().password,
};

/** Carga la habilitación DIAN de la empresa por la API, como lo haría el dashboard. */
async function habilitar(companyId: string, as = SUPER, extra: Record<string, unknown> = {}) {
  const res = await call(as, 'PUT', `/api/companies/${companyId}/dian-config`, { ...HABILITACION, ...extra });
  expect(res.status).toBe(200);
  return res.json.data;
}

let fetchMock: jest.Mock<(url: string, init: RequestInit) => Promise<Response>>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetDb();
  Object.assign(env, { DIAN_CONFIG_KEY: CONFIG_KEY });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function generatedSettlement(configured = true) {
  const a = await createCompany();
  if (configured) await habilitar(a.id);
  await createCompany({ name: 'Empresa B', nit: '900999888' });
  const b = db.prepare(`SELECT id FROM companies WHERE nit = '900999888'`).get();
  const ana = await createEmployee(a.id, { hireDate: '2026-01-05' });
  insertUser(TENANT_A, 'TENANT_ADMIN', a.id);
  insertUser(ADMIN_B, 'TENANT_ADMIN', b.id);

  const period = await call(TENANT_A, 'POST', '/api/payroll-periods', { companyId: a.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  const periodId = period.json.data.id;
  const calc = await call(TENANT_A, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId: ana.id, daysWorked: 30 });
  const id = calc.json.data.id ?? calc.json.data.settlement?.id;
  expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/generate-xml`)).status).toBe(200);
  return { id, periodId, companyId: a.id };
}

const settlement = async (periodId: string) =>
  (await call(TENANT_A, 'GET', `/api/payroll-settlements?periodId=${periodId}`)).json.data[0];

describe('envío de la nómina electrónica a la DIAN', () => {
  test('sin certificado ni datos de habilitación explica qué falta', async () => {
    const { id } = await generatedSettlement(false);
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('Falta la habilitación DIAN de esta empresa (Software ID y PIN, certificado digital, TestSetId de habilitación)');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('firma, envía a habilitación y sigue el resultado hasta la aceptación', async () => {
    const { id, periodId } = await generatedSettlement();
    fetchMock.mockResolvedValueOnce(new Response(ZIP_KEY));

    const sent = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(sent.status).toBe(200);
    expect(sent.json.data.dianSubmissionStatus).toBe('SENT');
    expect(fetchMock.mock.calls[0][0]).toBe('https://vpfe-hab.dian.gov.co/WcfDianCustomerServices.svc');
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('<wcf:testSetId>set-abc</wcf:testSetId>');

    const row = db.prepare(`SELECT dianTrackId, dianSignedXml FROM payroll_settlements WHERE id = ?`).get(id);
    expect(row.dianTrackId).toBe('zip-123');
    expect(row.dianSignedXml).toContain('<ds:SignatureValue');
    expect((await settlement(periodId)).dianSubmissionStatus).toBe('SENT');

    // Mientras está en la DIAN no se reenvía ni se regenera.
    expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`)).status).toBe(409);
    expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/generate-xml`)).status).toBe(400);

    fetchMock.mockResolvedValueOnce(new Response(status(false, '99', ['Regla: NIE024, Rechazo: CUNE'])));
    const rejected = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/status`);
    expect(rejected.json.data).toMatchObject({ dianSubmissionStatus: 'REJECTED', errors: ['Regla: NIE024, Rechazo: CUNE'] });
    expect((await settlement(periodId)).dianErrors).toEqual(['Regla: NIE024, Rechazo: CUNE']);

    // Tras el rechazo se regenera con el mismo número y se reenvía.
    const before = db.prepare(`SELECT dianConsecutive FROM payroll_settlements WHERE id = ?`).get(id).dianConsecutive;
    expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/generate-xml`)).status).toBe(200);
    const after = db.prepare(`SELECT dianConsecutive, dianSubmissionStatus FROM payroll_settlements WHERE id = ?`).get(id);
    expect(after).toEqual({ dianConsecutive: before, dianSubmissionStatus: null });

    fetchMock.mockResolvedValueOnce(new Response(ZIP_KEY));
    expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`)).status).toBe(200);
    fetchMock.mockResolvedValueOnce(new Response(status(true, '00')));
    const accepted = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/status`);
    expect(accepted.json.data.dianSubmissionStatus).toBe('ACCEPTED');
    expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`)).status).toBe(409);

    const download = await call(TENANT_A, 'GET', `/api/payroll-settlements/${id}/dian/signed-xml`);
    expect(download.status).toBe(200);
    expect(download.json).toContain('<ds:Signature');

    const audits = db.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'SEND_DIAN' AND entityId = ?`).get(id);
    expect(audits.n).toBe(2);
  });

  test('no envía un XML generado con otras credenciales de software', async () => {
    const { id, companyId } = await generatedSettlement();
    await habilitar(companyId, SUPER, { pin: '99999', certificateP12Base64: '' });
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('Vuelve a generarlo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('si la DIAN no responde devuelve 502 y no cambia el estado', async () => {
    const { id } = await generatedSettlement();
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(502);
    expect(db.prepare(`SELECT dianSubmissionStatus FROM payroll_settlements WHERE id = ?`).get(id).dianSubmissionStatus).toBeNull();
  });

  test('el administrador de otra empresa no puede enviar ni descargar', async () => {
    const { id } = await generatedSettlement();
    expect((await call(ADMIN_B, 'POST', `/api/payroll-settlements/${id}/dian/send`)).status).toBe(403);
    expect((await call(ADMIN_B, 'GET', `/api/payroll-settlements/${id}/dian/signed-xml`)).status).toBe(403);
  });

  test('la nómina de jornada parcial del personal por horas también se envía, y no se anula si la DIAN la tiene', async () => {
    const company = await createCompany();
    await habilitar(company.id);
    db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-1', 'Marta', 'Ruiz', '1061000888', 'Contadora')`).run();
    db.prepare(`INSERT INTO engagements (id, professionalId, companyId, vinculationType, hourlyRate, startDate, weeklyHours, contractType)
                VALUES ('ENG-1', 'PRO-1', ?, 'PART_TIME_EMPLOYEE', 20000, '2026-01-01', 20, '2')`).run(company.id);
    db.prepare(`INSERT INTO time_entries (id, engagementId, periodStart, periodEnd, hours, createdAt)
                VALUES ('TE-1', 'ENG-1', '2026-10-01', '2026-10-31', 80, '2026-10-31')`).run();
    const liquidation = await call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: 'ENG-1', periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    expect(liquidation.status).toBe(201);
    const id = liquidation.json.data.id;

    fetchMock.mockResolvedValueOnce(new Response(ZIP_KEY));
    const sent = await call(SUPER, 'POST', `/api/hourly/settlements/${id}/dian/send`);
    expect(sent.status).toBe(200);
    expect(sent.json.data.dianSubmissionStatus).toBe('SENT');
    expect(sent.json.data.dianSentAt).toBeTruthy();
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('<wcf:fileName>z0900123456000260000000' + '1.zip</wcf:fileName>');

    expect((await call(SUPER, 'DELETE', `/api/hourly/settlements/${id}`)).status).toBe(409);

    fetchMock.mockResolvedValueOnce(new Response(status(true, '00')));
    expect((await call(SUPER, 'POST', `/api/hourly/settlements/${id}/dian/status`)).json.data.dianSubmissionStatus).toBe('ACCEPTED');
    const del = await call(SUPER, 'DELETE', `/api/hourly/settlements/${id}`);
    expect(del.status).toBe(409);
    expect(del.json.error).toContain('ya aceptó');
    expect((await call(SUPER, 'GET', `/api/hourly/settlements/${id}/dian/signed-xml`)).json).toContain('<ds:Signature');
  });

  test('un contratista independiente (documento soporte) no se envía como nómina', async () => {
    const company = await createCompany();
    await habilitar(company.id);
    db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-x', 'Luis', 'Paz', '1061000999', 'Diseñador')`).run();
    db.prepare(`INSERT INTO engagements (id, professionalId, companyId, vinculationType, hourlyRate, startDate)
                VALUES ('ENG-x', 'PRO-x', ?, 'INDEPENDENT_SERVICES', 1, '2026-01-01')`).run(company.id);
    db.prepare(`INSERT INTO settlements (id, engagementId, periodStart, periodEnd, totalHours, grossAmount, netAmount, resultJson)
                VALUES ('SET-x', 'ENG-x', '2026-10-01', '2026-10-31', 1, 1, 1, '{"dianDocument":{"xmlContent":"<Invoice/>"}}')`).run();
    const res = await call(SUPER, 'POST', '/api/hourly/settlements/SET-x/dian/send');
    expect(res.status).toBe(400);
  });
});

describe('habilitación DIAN por empresa', () => {
  test('guarda cifrado y nunca devuelve el PIN, el certificado ni la contraseña', async () => {
    const a = await createCompany();
    const saved = await habilitar(a.id);
    expect(saved).toMatchObject({ configured: true, softwareId: 'software-real', testSetId: 'set-abc', hasCertificate: true });
    expect(saved.certSubject).toContain('Empresa de prueba');
    // El certificado de prueba no menciona el NIT de la empresa.
    expect(saved.warnings[0]).toContain('NIT');

    const view = await call(SUPER, 'GET', `/api/companies/${a.id}/dian-config`);
    const text = JSON.stringify(view.json);
    expect(text).not.toContain('24680');
    expect(text).not.toContain(testP12().password);
    expect(text).not.toContain(testP12().p12Base64.slice(0, 40));

    const row = db.prepare(`SELECT pinSealed, certP12Sealed, certPasswordSealed FROM company_dian_config WHERE companyId = ?`).get(a.id);
    expect(row.pinSealed).toMatch(/^v1:/);
    expect(JSON.stringify(row)).not.toContain('24680');
    expect(JSON.stringify(row)).not.toContain(testP12().password);
  });

  test('cada empresa envía con su propia habilitación y su NIT', async () => {
    const own = await createCompany({ name: 'Mi temporal S.A.S.', nit: '901000111' });
    const client = await createCompany({ name: 'Cliente S.A.S.', nit: '800222333' });
    await habilitar(own.id, SUPER, { softwareId: 'soft-propia', testSetId: 'set-propia' });
    await habilitar(client.id, SUPER, { softwareId: 'soft-cliente', testSetId: 'set-cliente' });

    for (const company of [own, client]) {
      const emp = await createEmployee(company.id, { taxId: company.nit + '1' });
      const period = await call(SUPER, 'POST', '/api/payroll-periods', { companyId: company.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' });
      const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId: period.json.data.id, employeeId: emp.id, daysWorked: 30 });
      const id = calc.json.data.id ?? calc.json.data.settlement?.id;
      expect((await call(SUPER, 'POST', `/api/payroll-settlements/${id}/generate-xml`)).status).toBe(200);
      fetchMock.mockResolvedValueOnce(new Response(ZIP_KEY));
      expect((await call(SUPER, 'POST', `/api/payroll-settlements/${id}/dian/send`)).status).toBe(200);
    }

    const bodies = fetchMock.mock.calls.map(c => String(c[1].body));
    expect(bodies[0]).toContain('<wcf:testSetId>set-propia</wcf:testSetId>');
    expect(bodies[0]).toContain('z0901000111');
    expect(bodies[1]).toContain('<wcf:testSetId>set-cliente</wcf:testSetId>');
    expect(bodies[1]).toContain('z0800222333');
  });

  test('valida el certificado al cargarlo y conserva PIN y certificado si no se reenvían', async () => {
    const a = await createCompany();
    const bad = await call(SUPER, 'PUT', `/api/companies/${a.id}/dian-config`, { ...HABILITACION, certificatePassword: 'mala' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toContain('contraseña incorrecta');

    await habilitar(a.id);
    const update = await call(SUPER, 'PUT', `/api/companies/${a.id}/dian-config`, { softwareId: 'nuevo', environment: '1' });
    expect(update.status).toBe(200);
    expect(update.json.data).toMatchObject({ softwareId: 'nuevo', environment: '1', hasCertificate: true, testSetId: null });
  });

  test('sin DIAN_CONFIG_KEY no guarda nada y lo explica', async () => {
    const a = await createCompany();
    Object.assign(env, { DIAN_CONFIG_KEY: undefined });
    const res = await call(SUPER, 'PUT', `/api/companies/${a.id}/dian-config`, HABILITACION);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('DIAN_CONFIG_KEY');
  });

  test('el administrador de otra empresa no ve ni cambia la habilitación', async () => {
    const a = await createCompany();
    await createCompany({ name: 'Empresa B', nit: '900999888' });
    const b = db.prepare(`SELECT id FROM companies WHERE nit = '900999888'`).get();
    insertUser(ADMIN_B, 'TENANT_ADMIN', b.id);
    expect((await call(ADMIN_B, 'GET', `/api/companies/${a.id}/dian-config`)).status).toBe(403);
    expect((await call(ADMIN_B, 'PUT', `/api/companies/${a.id}/dian-config`, HABILITACION)).status).toBe(403);
  });
});

describe('XML que no cuadra', () => {
  test('la API responde 409 con la explicación, no un error 500', async () => {
    const { id } = await generatedSettlement();
    const row = db.prepare(`SELECT resultJson FROM payroll_settlements WHERE id = ?`).get(id);
    const result = JSON.parse(row.resultJson);
    result.grossEarnings += 50000;
    db.prepare(`UPDATE payroll_settlements SET resultJson = ? WHERE id = ?`).run(JSON.stringify(result), id);
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/generate-xml`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('no cuadran');
  });
});
