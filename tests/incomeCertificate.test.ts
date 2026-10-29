import { describe, test, expect } from '@jest/globals';
import {
  computeIncomeCertificate,
  certificatePeriod,
  contractTypeLabel,
  INCOME_CERTIFICATE_BOXES,
} from '../src/services/incomeCertificate';

function settlement(periodStart: string, periodEnd: string, extra: Record<string, any> = {}) {
  return {
    periodStart,
    periodEnd,
    result: {
      baseSalaryEarned: 2_000_000,
      earnedAuxTransporte: 200_000,
      overtimeTotal: 0,
      dominicalFestivoValue: 0,
      leaveValue: 0,
      leaveDetails: [],
      grossEarnings: 2_200_000,
      employeeDeductions: {
        health4pct: 80_000,
        pension4pct: 80_000,
        fspValue: 0,
        retencionFuente: 0,
      },
      ...extra,
    },
  };
}

const box = (cert: any, key: string) => cert.boxes.find((b: any) => b.key === key).value;

describe('computeIncomeCertificate', () => {
  test('suma las nóminas del año y separa salario y auxilio de transporte', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [
        settlement('2026-01-01', '2026-01-31'),
        settlement('2026-02-01', '2026-02-28', { overtimeTotal: 100_000, dominicalFestivoValue: 50_000 }),
        // Fuera del año: no cuenta.
        settlement('2025-12-01', '2025-12-31'),
      ],
      benefitPayments: [],
      termination: null,
    });

    expect(cert.settlementsCount).toBe(2);
    expect(cert.detail.salarioBasico).toBe(4_000_000);
    expect(cert.detail.horasExtraRecargos).toBe(150_000);
    expect(cert.detail.auxilioTransporte).toBe(400_000);
    expect(box(cert, 'salarios')).toBe(4_150_000);
    expect(box(cert, 'otrosPagos')).toBe(400_000);
    expect(box(cert, 'totalIngresosBrutos')).toBe(4_550_000);
    expect(box(cert, 'aportesSalud')).toBe(160_000);
    expect(box(cert, 'aportesPensionFsp')).toBe(160_000);
    expect(box(cert, 'retencionFuente')).toBe(0);
  });

  test('vacaciones disfrutadas van a salarios e incapacidades también; FSP y retención suman', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [
        settlement('2026-10-01', '2026-10-31', {
          baseSalaryEarned: 6_000_000,
          earnedAuxTransporte: 0,
          leaveValue: 3_500_000,
          leaveDetails: [
            { type: 'VACATION', value: 3_000_000 },
            { type: 'GENERAL_INCAPACITY', value: 500_000 },
          ],
          employeeDeductions: {
            health4pct: 380_000,
            pension4pct: 380_000,
            fspValue: 95_000,
            retencionFuente: 120_000,
          },
        }),
      ],
      benefitPayments: [],
      termination: null,
    });

    expect(cert.detail.vacacionesDisfrutadas).toBe(3_000_000);
    expect(cert.detail.incapacidadesLicencias).toBe(500_000);
    expect(box(cert, 'salarios')).toBe(9_500_000);
    expect(box(cert, 'aportesPensionFsp')).toBe(475_000);
    expect(cert.totals.aportesPension).toBe(380_000);
    expect(cert.totals.aportesFsp).toBe(95_000);
    expect(box(cert, 'retencionFuente')).toBe(120_000);
  });

  test('prima del año; cesantías e intereses del año anterior (se pagan en enero/febrero)', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [],
      benefitPayments: [
        { benefitType: 'PRIMA', periodStart: '2026-01-01', periodEnd: '2026-06-30', amount: 1_100_000 },
        { benefitType: 'PRIMA', periodStart: '2026-07-01', periodEnd: '2026-12-31', amount: 1_100_000 },
        { benefitType: 'PRIMA', periodStart: '2025-07-01', periodEnd: '2025-12-31', amount: 999 },
        { benefitType: 'CESANTIAS', periodStart: '2025-01-01', periodEnd: '2025-12-31', amount: 2_000_000 },
        { benefitType: 'INTERESES_CESANTIAS', periodStart: '2025-01-01', periodEnd: '2025-12-31', amount: 240_000 },
        // Las del propio año van en el certificado del siguiente.
        { benefitType: 'CESANTIAS', periodStart: '2026-01-01', periodEnd: '2026-12-31', amount: 7 },
      ],
      termination: null,
    });

    expect(box(cert, 'prestacionesSociales')).toBe(2_200_000);
    expect(box(cert, 'cesantiasConsignadas')).toBe(2_000_000);
    expect(box(cert, 'cesantiasPagadas')).toBe(240_000);
    expect(box(cert, 'totalIngresosBrutos')).toBe(4_440_000);
  });

  test('liquidación definitiva del año: cesantías, prima, vacaciones compensadas e indemnización', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [],
      benefitPayments: [],
      termination: {
        terminationDate: '2026-12-31',
        result: {
          lines: [
            { concept: 'Cesantías', amount: 1_000_000 },
            { concept: 'Intereses sobre cesantías', amount: 120_000 },
            { concept: 'Prima de servicios', amount: 500_000 },
            { concept: 'Vacaciones compensadas en dinero', amount: 300_000 },
            { concept: 'Indemnización por despido sin justa causa (art. 64 CST)', amount: 4_000_000 },
          ],
          retencionIndemnizacion: 800_000,
        },
      },
    });

    expect(cert.detail.indemnizacion).toBe(4_000_000);
    expect(cert.detail.vacacionesCompensadas).toBe(300_000);
    expect(box(cert, 'cesantiasPagadas')).toBe(1_120_000);
    expect(box(cert, 'prestacionesSociales')).toBe(500_000);
    expect(box(cert, 'salarios')).toBe(300_000);
    expect(box(cert, 'otrosPagos')).toBe(4_000_000);
    expect(box(cert, 'retencionFuente')).toBe(800_000);
    expect(box(cert, 'totalIngresosBrutos')).toBe(5_920_000);
  });

  test('la liquidación de otro año no cuenta', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [],
      benefitPayments: [],
      termination: {
        terminationDate: '2025-06-30',
        result: { lines: [{ concept: 'Cesantías', amount: 1 }], retencionIndemnizacion: 0 },
      },
    });
    expect(box(cert, 'totalIngresosBrutos')).toBe(0);
  });

  test('redondea a pesos y el total es la suma de las casillas de ingresos', () => {
    const cert = computeIncomeCertificate({
      year: 2026,
      settlements: [settlement('2026-01-01', '2026-01-31', { baseSalaryEarned: 1000.6, earnedAuxTransporte: 0.4 })],
      benefitPayments: [],
      termination: null,
    });
    const incomeKeys = INCOME_CERTIFICATE_BOXES.filter(b => b.section === 'INGRESOS' && !b.total).map(b => b.key);
    const sum = incomeKeys.reduce((s, k) => s + box(cert, k), 0);
    expect(box(cert, 'salarios')).toBe(1001);
    expect(box(cert, 'totalIngresosBrutos')).toBe(sum);
    expect(cert.boxes.every((b: any) => Number.isInteger(b.value))).toBe(true);
  });
});

describe('certificatePeriod', () => {
  test('acota al año, a la fecha de ingreso y a la de retiro', () => {
    expect(certificatePeriod(2026, '2020-01-01', null)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(certificatePeriod(2026, '2026-03-15', '2026-11-30')).toEqual({ from: '2026-03-15', to: '2026-11-30' });
  });
});

describe('contractTypeLabel', () => {
  test('usa la tabla de la DIAN', () => {
    expect(contractTypeLabel('1')).toBe('Término fijo');
    expect(contractTypeLabel('2')).toBe('Término indefinido');
    expect(contractTypeLabel('3')).toBe('Obra o labor');
  });
});
