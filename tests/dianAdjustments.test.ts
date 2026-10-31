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

jest.setTimeout(30000);

const ZIP_KEY = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendTestSetAsyncResponse xmlns="http://wcf.dian.colombia">
<SendTestSetAsyncResult xmlns:b="http://schemas.datacontract.org/2004/07/UploadDocumentResponse"><b:ErrorMessageList/><b:ZipKey>zip-123</b:ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`;

const ACCEPTED = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
<GetStatusZipResponse xmlns="http://wcf.dian.colombia"><GetStatusZipResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
<b:DianResponse><b:ErrorMessage></b:ErrorMessage><b:IsValid>true</b:IsValid>
<b:StatusCode>00</b:StatusCode><b:StatusDescription>Procesado Correctamente.</b:StatusDescription></b:DianResponse>
</GetStatusZipResult></GetStatusZipResponse></s:Body></s:Envelope>`;

let fetchMock: jest.Mock<(url: string, init: RequestInit) => Promise<Response>>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetDb();
  Object.assign(env, { DIAN_CONFIG_KEY: 'llave-de-prueba-de-32-caracteres!!' });
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function habilitar(companyId: string) {
  const res = await call(SUPER, 'PUT', `/api/companies/${companyId}/dian-config`, {
    softwareId: 'software-real', pin: '24680', testSetId: 'set-abc', environment: '2',
    certificateP12Base64: testP12().p12Base64, certificatePassword: testP12().password,
  });
  expect(res.status).toBe(200);
}

/** Envía un documento (nómina o nota) y deja que la DIAN lo acepte. */
async function sendAndAccept(path: string) {
  fetchMock.mockResolvedValueOnce(new Response(ZIP_KEY));
  expect((await call(SUPER, 'POST', `${path}/dian/send`)).json.data.dianSubmissionStatus).toBe('SENT');
  fetchMock.mockResolvedValueOnce(new Response(ACCEPTED));
  expect((await call(SUPER, 'POST', `${path}/dian/status`)).json.data.dianSubmissionStatus).toBe('ACCEPTED');
}

async function monthlySettlement() {
  const company = await createCompany();
  await habilitar(company.id);
  const ana = await createEmployee(company.id, { hireDate: '2026-01-05' });
  insertUser(TENANT_A, 'TENANT_ADMIN', company.id);
  const period = await call(TENANT_A, 'POST', '/api/payroll-periods', { companyId: company.id, periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  const calc = await call(TENANT_A, 'POST', '/api/payroll-settlements/calculate', { periodId: period.json.data.id, employeeId: ana.id, daysWorked: 30 });
  const id = calc.json.data.id;
  expect((await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/generate-xml`)).status).toBe(200);
  return { id, companyId: company.id };
}

const adjust = (path: string, body: Record<string, unknown>, as = SUPER) => call(as, 'POST', `${path}/dian/adjustments`, body);

describe('notas de ajuste de la nómina electrónica', () => {
  test('reemplaza la nómina mensual aceptada y la liquidación queda corregida', async () => {
    const { id } = await monthlySettlement();
    const path = `/api/payroll-settlements/${id}`;

    // Antes de que la DIAN la acepte se corrige regenerando, no con nota.
    expect((await adjust(path, { type: 'REPLACE', daysWorked: 20 })).status).toBe(409);
    await sendAndAccept(path);

    const original = db.prepare(`SELECT dianCune, netPay FROM payroll_settlements WHERE id = ?`).get(id);
    const note = await adjust(path, { type: 'REPLACE', daysWorked: 20, reason: 'Ingresó el día 11' });
    expect(note.status).toBe(201);
    expect(note.json.data).toMatchObject({ noteType: 'REPLACE', dianNumber: 'NA00000001', predecessorNumber: 'NE00000001', dianSubmissionStatus: null });
    expect(note.json.data.totalComprobante).toBeLessThan(original.netPay);

    const xml = db.prepare(`SELECT dianXmlContent FROM dian_adjustments WHERE id = ?`).get(note.json.data.id).dianXmlContent;
    expect(xml).toContain('<NominaIndividualDeAjuste');
    expect(xml).toContain('<TipoNota>1</TipoNota>');
    expect(xml).toContain(`CUNEPred="${original.dianCune}"`);
    expect(xml).toContain('TipoXML="103"');
    expect(xml).toContain('Prefijo="NA"');
    expect(xml).toContain('</Reemplazar>');

    // Hasta que la DIAN acepte la nota, la liquidación conserva sus valores.
    await sendAndAccept(`/api/dian-adjustments/${note.json.data.id}`);
    const corrected = db.prepare(`SELECT daysWorked, netPay FROM payroll_settlements WHERE id = ?`).get(id);
    expect(corrected).toEqual({ daysWorked: 20, netPay: note.json.data.totalComprobante });
    expect(String(fetchMock.mock.calls[2][1].body)).toContain('z0900123456000260000000' + '1.zip');

    // Una segunda corrección ajusta el último documento aceptado (la nota NA00000001).
    const second = await adjust(path, { type: 'DELETE' });
    expect(second.json.data).toMatchObject({ noteType: 'DELETE', dianNumber: 'NA00000002', predecessorNumber: 'NA00000001' });
    const deletion = db.prepare(`SELECT dianXmlContent FROM dian_adjustments WHERE id = ?`).get(second.json.data.id).dianXmlContent;
    expect(deletion).toContain('<TipoNota>2</TipoNota>');
    expect(deletion).toContain('<EliminandoPredecesor');
    expect(deletion).not.toContain('<Trabajador');

    const list = await call(SUPER, 'GET', `${path}/dian/adjustments`);
    expect(list.json.data.map((a: any) => a.dianNumber)).toEqual(['NA00000001', 'NA00000002']);
  });

  test('una nota sin enviar se rehace con el mismo número', async () => {
    const { id } = await monthlySettlement();
    const path = `/api/payroll-settlements/${id}`;
    await sendAndAccept(path);
    const first = await adjust(path, { type: 'REPLACE', daysWorked: 25 });
    const again = await adjust(path, { type: 'REPLACE', daysWorked: 24 });
    expect(again.json.data).toMatchObject({ id: first.json.data.id, dianNumber: 'NA00000001' });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM dian_adjustments`).get().n).toBe(1);
    expect((await adjust(path, { type: 'OTRA' })).status).toBe(400);
    expect((await adjust(path, { type: 'REPLACE', daysWorked: 40 })).status).toBe(400);
  });

  test('por horas: eliminada ante la DIAN, la liquidación ya se puede anular', async () => {
    const company = await createCompany();
    await habilitar(company.id);
    db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES ('PRO-1', 'Marta', 'Ruiz', '1061000888', 'Mesera')`).run();
    db.prepare(`INSERT INTO engagements (id, professionalId, companyId, vinculationType, hourlyRate, startDate, weeklyHours, contractType)
                VALUES ('ENG-1', 'PRO-1', ?, 'PART_TIME_EMPLOYEE', 20000, '2026-01-01', 20, '2')`).run(company.id);
    db.prepare(`INSERT INTO time_entries (id, engagementId, periodStart, periodEnd, hours, createdAt)
                VALUES ('TE-1', 'ENG-1', '2026-10-01', '2026-10-31', 80, '2026-10-31')`).run();
    const liquidation = await call(SUPER, 'POST', '/api/hourly/settlements/calculate', { engagementId: 'ENG-1', periodStart: '2026-10-01', periodEnd: '2026-10-31' });
    const path = `/api/hourly/settlements/${liquidation.json.data.id}`;
    await sendAndAccept(path);

    // Reemplazo con las horas corregidas.
    const replace = await adjust(path, { type: 'REPLACE', hoursByType: { ordinary: 70, night: 10 } });
    expect(replace.status).toBe(201);
    await sendAndAccept(`/api/dian-adjustments/${replace.json.data.id}`);
    const row = db.prepare(`SELECT totalHours, resultJson FROM settlements WHERE id = ?`).get(liquidation.json.data.id);
    expect(row.totalHours).toBe(80);
    expect(JSON.parse(row.resultJson).calculation.recargoNocturnoValue).toBeGreaterThan(0);

    expect((await call(SUPER, 'DELETE', path)).status).toBe(409);
    const del = await adjust(path, { type: 'DELETE', reason: 'No trabajó para nosotros' });
    await sendAndAccept(`/api/dian-adjustments/${del.json.data.id}`);
    expect((await adjust(path, { type: 'DELETE' })).status).toBe(409);
    expect((await call(SUPER, 'DELETE', path)).status).toBe(200);
  });

  test('el administrador de otra empresa no crea ni envía notas ajenas', async () => {
    const { id } = await monthlySettlement();
    await sendAndAccept(`/api/payroll-settlements/${id}`);
    const note = await adjust(`/api/payroll-settlements/${id}`, { type: 'DELETE' });
    const other = await createCompany({ name: 'Otra', nit: '900555444' });
    insertUser('admin@otra.co', 'TENANT_ADMIN', other.id);
    expect((await adjust(`/api/payroll-settlements/${id}`, { type: 'DELETE' }, 'admin@otra.co')).status).toBe(403);
    expect((await call('admin@otra.co', 'POST', `/api/dian-adjustments/${note.json.data.id}/dian/send`)).status).toBe(403);
  });
});
