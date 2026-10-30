import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { TENANT_A, resetDb, db, env, call, createCompany, createEmployee, insertUser } from './helpers/api';
import { testP12 } from './helpers/dianCert';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

const ADMIN_B = 'admin@empresa-b.com';

const ZIP_KEY = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><SendTestSetAsyncResponse xmlns="http://wcf.dian.colombia">
<SendTestSetAsyncResult xmlns:b="http://schemas.datacontract.org/2004/07/UploadDocumentResponse"><b:ErrorMessageList/><b:ZipKey>zip-123</b:ZipKey></SendTestSetAsyncResult></SendTestSetAsyncResponse></s:Body></s:Envelope>`;

const status = (valid: boolean, code: string, errors: string[] = []) => `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body>
<GetStatusZipResponse xmlns="http://wcf.dian.colombia"><GetStatusZipResult xmlns:b="http://schemas.datacontract.org/2004/07/DianResponse" xmlns:c="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
<b:DianResponse><b:ErrorMessage>${errors.map(e => `<c:string>${e}</c:string>`).join('')}</b:ErrorMessage><b:IsValid>${valid}</b:IsValid>
<b:StatusCode>${code}</b:StatusCode><b:StatusDescription>${valid ? 'Procesado Correctamente.' : 'Documento con errores'}</b:StatusDescription></b:DianResponse>
</GetStatusZipResult></GetStatusZipResponse></s:Body></s:Envelope>`;

const SECRETS = {
  DIAN_CERT_P12: testP12().p12Base64,
  DIAN_CERT_PASSWORD: testP12().password,
  DIAN_SOFTWARE_ID: 'software-real',
  DIAN_SOFTWARE_PIN: '24680',
  DIAN_TEST_SET_ID: 'set-abc',
};

let fetchMock: jest.Mock<(url: string, init: RequestInit) => Promise<Response>>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  resetDb();
  fetchMock = jest.fn();
  globalThis.fetch = fetchMock as any;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function generatedSettlement(secrets: Record<string, string> = SECRETS) {
  Object.assign(env, secrets);
  const a = await createCompany();
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
  return { id, periodId };
}

const settlement = async (periodId: string) =>
  (await call(TENANT_A, 'GET', `/api/payroll-settlements?periodId=${periodId}`)).json.data[0];

describe('envío de la nómina electrónica a la DIAN', () => {
  test('sin certificado ni datos de habilitación explica qué falta', async () => {
    const { id } = await generatedSettlement({});
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('DIAN_CERT_P12, DIAN_CERT_PASSWORD, DIAN_SOFTWARE_ID, DIAN_SOFTWARE_PIN, DIAN_TEST_SET_ID');
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
    const { id } = await generatedSettlement();
    Object.assign(env, { DIAN_SOFTWARE_PIN: '99999' });
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('Vuelve a generarlo');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('una contraseña de certificado errada se informa sin llamar a la DIAN', async () => {
    const { id } = await generatedSettlement();
    Object.assign(env, { DIAN_CERT_PASSWORD: 'mala' });
    const res = await call(TENANT_A, 'POST', `/api/payroll-settlements/${id}/dian/send`);
    expect(res.status).toBe(409);
    expect(res.json.error).toContain('contraseña incorrecta');
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
});
