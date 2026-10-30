import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { verifyFirebaseIdToken } from '../src/auth/firebaseToken';
import { buildPayrollJournal } from '../src/services/payrollAccounting';
import {
  SUPER,
  TENANT_A,
  resetDb,
  db,
  call,
  createCompany,
  createEmployee,
  insertUser,
} from './helpers/api';

jest.mock('../src/auth/firebaseToken');

jest.mocked(verifyFirebaseIdToken).mockImplementation(async token => ({
  uid: `uid-${token}`,
  email: token,
  emailVerified: true,
}));

beforeEach(resetDb);

// Liquidación con todos los conceptos y un peso de redondeo:
// 2.000.000 + 200.000 + 150.000 + 50.000 + 100.000 = 2.500.000
// devengado, pero neto + deducciones = 2.500.001.
const RESULT = {
  baseSalaryEarned: 2_000_000,
  earnedAuxTransporte: 200_000,
  overtimeTotal: 150_000,
  dominicalFestivoValue: 50_000,
  leaveValue: 100_000,
  grossEarnings: 2_500_000,
  employeeDeductions: { health4pct: 80_000, pension4pct: 80_000, fspValue: 20_000, retencionFuente: 30_000, totalDeductions: 210_000 },
  netPay: 2_290_001,
  employerContributions: { health8_5pct: 0, pension12pct: 240_000, arlValue: 10_440, sena2pct: 0, icbf3pct: 0, ccf4pct: 80_000, totalContributions: 330_440 },
  provisions: { cesantias: 183_333, interesesCesantias: 1_833, primaServicios: 183_333, vacaciones: 83_333, totalProvisions: 451_832 },
};

const EMPLOYEE = { taxId: '1061000111', name: 'Ana Gómez', epsCode: 'EPS037', afpCode: '230301', ccfCode: 'CCF22' };

const sum = (lines: any[], account: string, side: 'debit' | 'credit') =>
  lines.filter(l => l.account === account).reduce((t, l) => t + l[side], 0);

describe('buildPayrollJournal', () => {
  test('cuadra débitos y créditos aunque haya redondeo', () => {
    const journal = buildPayrollJournal({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      companyArlCode: '14-23',
      settlements: [{ employee: EMPLOYEE, result: RESULT }],
    });

    expect(journal.totals.debit).toBe(journal.totals.credit);
    expect(journal.lines.every(l => (l.debit === 0) !== (l.credit === 0))).toBe(true);
  });

  test('gasto de personal, aportes y provisiones en sus cuentas PUC', () => {
    const { lines } = buildPayrollJournal({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      companyArlCode: '14-23',
      settlements: [{ employee: EMPLOYEE, result: RESULT }],
    });

    // Débitos (gasto 5105)
    expect(sum(lines, '510527', 'debit')).toBe(200_000);
    expect(sum(lines, '510515', 'debit')).toBe(200_000); // extras + dominicales
    expect(sum(lines, '510506', 'debit')).toBe(2_100_001); // salario + incapacidad + redondeo
    expect(sum(lines, '510570', 'debit')).toBe(240_000);
    expect(sum(lines, '510568', 'debit')).toBe(10_440);
    expect(sum(lines, '510572', 'debit')).toBe(80_000);
    expect(sum(lines, '510569', 'debit')).toBe(0); // exonerado: no se genera la línea
    expect(lines.some(l => l.account === '510569')).toBe(false);
    expect(sum(lines, '510530', 'debit')).toBe(183_333);
    expect(sum(lines, '510539', 'debit')).toBe(83_333);

    // Créditos
    expect(sum(lines, '250505', 'credit')).toBe(2_290_001);
    expect(sum(lines, '237005', 'credit')).toBe(80_000);
    expect(sum(lines, '238030', 'credit')).toBe(80_000 + 20_000 + 240_000);
    expect(sum(lines, '236505', 'credit')).toBe(30_000);
    expect(sum(lines, '237006', 'credit')).toBe(10_440);
    expect(sum(lines, '237010', 'credit')).toBe(80_000);
    expect(sum(lines, '261005', 'credit')).toBe(183_333);
    expect(sum(lines, '261010', 'credit')).toBe(1_833);
    expect(sum(lines, '261015', 'credit')).toBe(83_333);
    expect(sum(lines, '261020', 'credit')).toBe(183_333);

    // Pasivos con administradoras: el tercero es la administradora.
    const eps = lines.find(l => l.account === '237005')!;
    expect(eps).toMatchObject({ thirdPartyId: 'EPS037', entity: 'EPS037' });
    expect(eps.detail).toMatch(/Ana Gómez/);
    expect(lines.find(l => l.account === '237006')!.thirdPartyId).toBe('14-23');
    // Gasto y salarios por pagar: el tercero es el empleado.
    expect(lines.find(l => l.account === '510570')!.thirdPartyId).toBe('1061000111');
    expect(lines.find(l => l.account === '250505')!.thirdPartyId).toBe('1061000111');
  });

  test('vacaciones disfrutadas contra la provisión e incapacidad recobrable como cuenta por cobrar', () => {
    const result = {
      ...RESULT,
      leaveValue: 600_000,
      baseSalaryEarned: 1_500_000,
      reimbursableAmount: 150_000,
      leaveDetails: [
        { type: 'VACATION', value: 400_000 },
        { type: 'GENERAL_INCAPACITY', value: 200_000 },
      ],
    };

    const journal = buildPayrollJournal({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      companyArlCode: '14-23',
      settlements: [{ employee: EMPLOYEE, result }],
    });
    const { lines } = journal;

    expect(sum(lines, '261015', 'debit')).toBe(400_000);
    expect(sum(lines, '138095', 'debit')).toBe(150_000);
    expect(lines.find(l => l.account === '138095')!.thirdPartyId).toBe('EPS037');
    // 1.500.000 + 600.000 − 400.000 − 150.000 + 1 de redondeo
    expect(sum(lines, '510506', 'debit')).toBe(1_550_001);
    expect(journal.totals.debit).toBe(journal.totals.credit);
    expect(journal.warnings).toEqual([]);
  });

  test('incapacidad laboral: el recobro es a la ARL', () => {
    const result = { ...RESULT, reimbursableAmount: 50_000, leaveDetails: [{ type: 'WORK_INCAPACITY', value: 100_000 }] };
    const { lines } = buildPayrollJournal({
      periodStart: '2026-10-01', periodEnd: '2026-10-31', companyArlCode: '14-23',
      settlements: [{ employee: EMPLOYEE, result }],
    });
    expect(lines.find(l => l.account === '138095')!.thirdPartyId).toBe('14-23');
  });

  test('una diferencia mayor al redondeo se avisa y el asiento sigue cuadrado', () => {
    const journal = buildPayrollJournal({
      periodStart: '2026-10-01', periodEnd: '2026-10-31', companyArlCode: '14-23',
      settlements: [{ employee: EMPLOYEE, result: { ...RESULT, netPay: 2_390_000 } }],
    });
    expect(journal.warnings).toHaveLength(1);
    expect(journal.warnings[0]).toMatch(/Ana Gómez.*diferencia 100000/);
    expect(journal.totals.debit).toBe(journal.totals.credit);
  });

  test('CSV con encabezado, celdas protegidas y separador de coma', () => {
    const journal = buildPayrollJournal({
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      companyArlCode: null,
      settlements: [{ employee: { ...EMPLOYEE, name: '=HYPERLINK("x")' }, result: RESULT }],
    });

    const [header, ...rows] = journal.csv.split('\n');
    expect(header).toBe('CUENTA,NOMBRE_CUENTA,TERCERO_DOCUMENTO,TERCERO_NOMBRE,ENTIDAD,DETALLE,DEBITO,CREDITO');
    expect(rows).toHaveLength(journal.lines.length);
    expect(journal.csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('buildPayrollJournal · contratistas', () => {
  const base = { periodStart: '2026-10-01', periodEnd: '2026-10-31', companyArlCode: '14-23', settlements: [] };
  const PRO = { taxId: '1061000999', name: 'Carlos Ruiz' };

  test('honorarios: gasto 5110, retención 236515 y honorarios por pagar 233525', () => {
    const journal = buildPayrollJournal({
      ...base,
      contractors: [{ professional: PRO, concept: 'HONORARIOS', grossAmount: 2_000_000, retentionAmount: 200_000, netAmount: 1_800_000 }],
    });
    const { lines } = journal;

    expect(sum(lines, '511095', 'debit')).toBe(2_000_000);
    expect(sum(lines, '236515', 'credit')).toBe(200_000);
    expect(sum(lines, '233525', 'credit')).toBe(1_800_000);
    expect(lines.every(l => l.thirdPartyId === '1061000999')).toBe(true);
    expect(journal.totals.debit).toBe(journal.totals.credit);
  });

  test('servicios: gasto 5135, retención 236525 y cuentas por pagar 233595', () => {
    const { lines, totals } = buildPayrollJournal({
      ...base,
      contractors: [{ professional: PRO, concept: 'SERVICIOS', grossAmount: 1_000_000, retentionAmount: 40_000, netAmount: 960_000 }],
    });

    expect(sum(lines, '513595', 'debit')).toBe(1_000_000);
    expect(sum(lines, '236525', 'credit')).toBe(40_000);
    expect(sum(lines, '233595', 'credit')).toBe(960_000);
    expect(totals.debit).toBe(totals.credit);
  });

  test('neto ≠ bruto − retención: se avisa y el asiento sigue cuadrado', () => {
    const journal = buildPayrollJournal({
      ...base,
      contractors: [{ professional: PRO, concept: 'SERVICIOS', grossAmount: 1_000_000, retentionAmount: 40_000, netAmount: 900_000 }],
    });

    expect(journal.warnings[0]).toMatch(/Carlos Ruiz.*diferencia/);
    expect(journal.totals.debit).toBe(journal.totals.credit);
  });
});

async function liquidated(companyExtra: Record<string, unknown> = { arlCode: '14-23' }) {
  const company = await createCompany(companyExtra);
  const emp = await createEmployee(company.id, { hireDate: '2026-01-05', epsCode: 'EPS037', afpCode: '230301', ccfCode: 'CCF22' });
  const period = await call(SUPER, 'POST', '/api/payroll-periods', {
    companyId: company.id,
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
  });
  const periodId = period.json.data.id as string;
  const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId: emp.id, daysWorked: 30 });
  expect(calc.status).toBe(201);
  return { company, emp, periodId, settlement: calc.json.data };
}

const accounting = (periodId: string, as = SUPER) =>
  call(as, 'GET', `/api/payroll-periods/${periodId}/accounting`);

describe('GET /api/payroll-periods/:id/accounting', () => {
  test('devuelve el comprobante cuadrado del periodo y avisa si sigue en borrador', async () => {
    const { periodId, settlement } = await liquidated();

    const res = await accounting(periodId);
    expect(res.status).toBe(200);
    expect(res.json.data.fileName).toBe('COMPROBANTE_NOMINA_900123456_2026-10-01_2026-10-31.csv');
    expect(res.json.data.totals.debit).toBe(res.json.data.totals.credit);
    expect(res.json.data.totals.debit).toBeGreaterThan(settlement.calculation.grossEarnings);
    expect(res.json.data.content.split('\n')[0]).toMatch(/^CUENTA,/);
    expect(res.json.data.warnings.join(' ')).toMatch(/borrador/);
  });

  test('una liquidación dañada se avisa sin tumbar el comprobante', async () => {
    const { company, periodId } = await liquidated();
    const emp2 = await createEmployee(company.id, { firstName: 'Luis', lastName: 'Pérez', taxId: '1061000222', hireDate: '2026-01-05' });
    const calc = await call(SUPER, 'POST', '/api/payroll-settlements/calculate', { periodId, employeeId: emp2.id, daysWorked: 30 });
    expect(calc.status).toBe(201);
    db.prepare(`UPDATE payroll_settlements SET resultJson = '{dañado' WHERE employeeId = ?`).run(emp2.id);

    const res = await accounting(periodId);
    expect(res.status).toBe(200);
    expect(res.json.data.warnings.join(' ')).toMatch(/Luis Pérez.*dañada/);
    expect(res.json.data.totals.debit).toBe(res.json.data.totals.credit);
  });

  test('incluye jornada parcial y contratistas del periodo; con varias liquidaciones usa la última y avisa', async () => {
    const { company, periodId } = await liquidated();

    const insertHourly = (kind: string, taxId: string, name: string) => {
      db.prepare(`INSERT INTO professionals (id, firstName, lastName, taxId, profession) VALUES (?, ?, 'Ruiz', ?, 'Ingeniero')`)
        .run('PRO-' + taxId, name, taxId);
      db.prepare(`INSERT INTO engagements (id, professionalId, companyId, vinculationType, hourlyRate, startDate, retentionConcept)
                  VALUES (?, ?, ?, ?, 50000, '2026-01-01', 'HONORARIOS')`)
        .run('ENG-' + taxId, 'PRO-' + taxId, company.id, kind);
    };
    const insertSettlement = (id: string, taxId: string, json: unknown, createdAt: string, start = '2026-10-01', end = '2026-10-31') =>
      db.prepare(`INSERT INTO settlements (id, engagementId, periodStart, periodEnd, totalHours, grossAmount, retentionAmount, netAmount, resultJson, createdAt)
                  VALUES (?, ?, ?, ?, 20, 0, 0, 0, ?, ?)`)
        .run(id, 'ENG-' + taxId, start, end, JSON.stringify(json), createdAt);

    insertHourly('INDEPENDENT_SERVICES', '1061000999', 'Carlos');
    const contractor = (gross: number) => ({ calculation: { grossAmount: gross, retentionConcept: 'HONORARIOS', retentionAmount: gross / 10, netAmount: gross * 0.9 } });
    insertSettlement('SET-1', '1061000999', contractor(1_000_000), '2026-10-31T10:00:00Z');
    insertSettlement('SET-2', '1061000999', contractor(2_000_000), '2026-10-31T11:00:00Z');
    // Termina en noviembre: no entra.
    insertSettlement('SET-3', '1061000999', contractor(9_000_000), '2026-11-30T10:00:00Z', '2026-10-20', '2026-11-19');
    // Empieza en septiembre y termina en octubre: entra en octubre.
    insertSettlement('SET-5', '1061000999', contractor(3_000_000), '2026-10-19T10:00:00Z', '2026-09-20', '2026-10-19');

    insertHourly('PART_TIME_EMPLOYEE', '1061000888', 'Marta');
    insertSettlement('SET-4', '1061000888', { calculation: { ...RESULT } }, '2026-10-31T10:00:00Z');

    const res = await accounting(periodId);
    expect(res.status).toBe(200);
    const csv: string = res.json.data.content;

    expect(csv).toContain('"511095","Honorarios - otros","1061000999","Carlos Ruiz"');
    expect(csv).toContain(',2000000.00,0.00');
    expect(csv).not.toContain('9000000.00');
    expect(csv).toContain(',3000000.00,0.00');
    // Marta (jornada parcial) no tiene códigos de administradora.
    expect(res.json.data.warnings.join(' ')).toMatch(/Marta Ruiz.*sin código de EPS/);
    expect(csv).toMatch(/"250505","Salarios por pagar","1061000888","Marta Ruiz"/);
    expect(res.json.data.warnings.join(' ')).toMatch(/Carlos Ruiz.*2 liquidaciones.*más reciente/);
    expect(res.json.data.totals.debit).toBe(res.json.data.totals.credit);
  });

  test('sin liquidaciones: 400', async () => {
    const company = await createCompany();
    const period = await call(SUPER, 'POST', '/api/payroll-periods', {
      companyId: company.id,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });

    const res = await accounting(period.json.data.id);
    expect(res.status).toBe(400);
  });

  test('aislamiento: un administrador de otra empresa recibe 403; inexistente 404', async () => {
    const { periodId } = await liquidated();
    const other = await createCompany({ name: 'Empresa B', nit: '900999888' });
    insertUser(TENANT_A, 'TENANT_ADMIN', other.id);

    expect((await accounting(periodId, TENANT_A)).status).toBe(403);
    expect((await accounting('NO-EXISTE')).status).toBe(404);
  });
});
