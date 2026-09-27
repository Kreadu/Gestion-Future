import { describe, test, expect } from '@jest/globals';

import {
  PartTimeEmployeeEngine,
  PartTimeEmployeeEngineError,
  MONTHLY_LEGAL_HOURS,
  MIN_HOURLY_WAGE,
} from '../src/engine/hourly/partTimeEmployeeEngine';

import {
  IndependentContractorEngine,
  IndependentContractorEngineError,
} from '../src/engine/hourly/independentContractorEngine';

import { CONSTANTS_2026 } from '../src/engine/countries/constants2026';

import { DianNominaXmlService } from '../src/services/dianNominaXmlService';
import { DocumentoSoporteService } from '../src/services/documentoSoporteService';

import type {
  PartTimeEmployeeInput,
  IndependentContractorInput,
  DocumentoSoportePayerInfo,
  DocumentoSoporteBeneficiaryInfo,
} from '../src/types/hourly';

function basePartTimeInput(
  overrides: Partial<PartTimeEmployeeInput> = {}
): PartTimeEmployeeInput {
  return {
    companyId: 'COMP-1',
    engagementId: 'ENG-1',
    professionalId: 'PRO-1',
    firstName: 'Ana',
    lastName: 'Gómez',
    taxId: '123456789',
    hourlyRate: MIN_HOURLY_WAGE,
    weeklyHours: 20,
    hoursWorked: 80,
    ...overrides,
  };
}

function baseIndependentInput(
  overrides: Partial<IndependentContractorInput> = {}
): IndependentContractorInput {
  return {
    companyId: 'COMP-1',
    engagementId: 'ENG-2',
    professionalId: 'PRO-2',
    firstName: 'Carlos',
    lastName: 'Ramírez',
    taxId: '987654321',
    hourlyRate: 50_000,
    hoursWorked: 40,
    retentionConcept: 'SERVICIOS',
    isIncomeTaxFiler: true,
    ...overrides,
  };
}

describe('PartTimeEmployeeEngine', () => {
  test('la jornada legal mensual se deriva de 42h/semana (Ley 2101 de 2021)', () => {
    expect(CONSTANTS_2026.LEGAL_WEEKLY_HOURS).toBe(42);
    expect(MONTHLY_LEGAL_HOURS).toBeCloseTo(42 * (30 / 7), 5);
  });

  test('rechaza más de 42 horas semanales (tope legal vigente)', () => {
    expect(() =>
      PartTimeEmployeeEngine.calculate(
        basePartTimeInput({ weeklyHours: 43 })
      )
    ).toThrow(PartTimeEmployeeEngineError);
  });

  test('acepta exactamente 42 horas semanales', () => {
    expect(() =>
      PartTimeEmployeeEngine.calculate(
        basePartTimeInput({ weeklyHours: 42 })
      )
    ).not.toThrow();
  });

  test('rechaza una tarifa por debajo del salario mínimo por hora', () => {
    expect(() =>
      PartTimeEmployeeEngine.calculate(
        basePartTimeInput({ hourlyRate: MIN_HOURLY_WAGE - 1 })
      )
    ).toThrow(PartTimeEmployeeEngineError);
  });

  test('calcula devengado, IBC y neto proporcional a las horas trabajadas', () => {
    const hourlyRate = 10_000;
    const hoursWorked = 80;

    const result = PartTimeEmployeeEngine.calculate(
      basePartTimeInput({ hourlyRate, hoursWorked })
    );

    const expectedBase = hourlyRate * hoursWorked;

    expect(result.baseSalaryEarned).toBeCloseTo(expectedBase, 2);
    expect(result.ibcSecuritySocial).toBeCloseTo(expectedBase, 2);
    expect(result.employeeDeductions.health4pct).toBeCloseTo(
      expectedBase * 0.04,
      2
    );
    expect(result.employeeDeductions.pension4pct).toBeCloseTo(
      expectedBase * 0.04,
      2
    );
    expect(result.netPay).toBeLessThan(result.grossEarnings);
    expect(result.employerContributions.arlValue).toBeGreaterThan(0);
  });

  test('el ARL no se prorratea: aplica sobre el 100% del IBC del periodo', () => {
    const result = PartTimeEmployeeEngine.calculate(
      basePartTimeInput({ hourlyRate: 10_000, hoursWorked: 80 })
    );

    expect(result.employerContributions.arlValue).toBeCloseTo(
      result.ibcSecuritySocial * 0.00522,
      2
    );
  });

  test('la exoneración art. 114-1 pone en cero salud/SENA/ICBF del empleador', () => {
    const result = PartTimeEmployeeEngine.calculate(
      basePartTimeInput({
        hourlyRate: 10_000,
        hoursWorked: 80,
        isExempt114_1: true,
      })
    );

    expect(result.employerContributions.health8_5pct).toBe(0);
    expect(result.employerContributions.sena2pct).toBe(0);
    expect(result.employerContributions.icbf3pct).toBe(0);
    // Pensión y ARL nunca se exoneran.
    expect(result.employerContributions.pension12pct).toBeGreaterThan(0);
    expect(result.employerContributions.arlValue).toBeGreaterThan(0);
  });
});

describe('IndependentContractorEngine', () => {
  test('calcula el bruto como tarifa por hora × horas trabajadas', () => {
    const result = IndependentContractorEngine.calculate(
      baseIndependentInput({ hourlyRate: 50_000, hoursWorked: 40 })
    );

    expect(result.grossAmount).toBeCloseTo(2_000_000, 2);
  });

  test('concepto SERVICIOS declarante retiene 4% sobre la base', () => {
    const result = IndependentContractorEngine.calculate(
      baseIndependentInput({
        hourlyRate: 50_000,
        hoursWorked: 40,
        retentionConcept: 'SERVICIOS',
        isIncomeTaxFiler: true,
      })
    );

    expect(result.retentionRate).toBeCloseTo(0.04, 5);
    expect(result.retentionAmount).toBeCloseTo(2_000_000 * 0.04, 2);
    expect(result.netAmount).toBeCloseTo(
      2_000_000 - result.retentionAmount,
      2
    );
  });

  test('concepto SERVICIOS no declarante retiene 6% sobre la base', () => {
    const result = IndependentContractorEngine.calculate(
      baseIndependentInput({
        hourlyRate: 50_000,
        hoursWorked: 40,
        retentionConcept: 'SERVICIOS',
        isIncomeTaxFiler: false,
      })
    );

    expect(result.retentionRate).toBeCloseTo(0.06, 5);
  });

  test('SERVICIOS por debajo de la base mínima (2 UVT) no retiene', () => {
    const result = IndependentContractorEngine.calculate(
      baseIndependentInput({
        hourlyRate: 1_000,
        hoursWorked: 1,
        retentionConcept: 'SERVICIOS',
        isIncomeTaxFiler: true,
      })
    );

    expect(result.grossAmount).toBeLessThan(
      CONSTANTS_2026.RETENTION_SERVICIOS_MIN_BASE_UVT * CONSTANTS_2026.UVT
    );
    expect(result.retentionRate).toBe(0);
    expect(result.retentionAmount).toBe(0);
    expect(result.netAmount).toBeCloseTo(result.grossAmount, 2);
  });

  test('concepto HONORARIOS usa la tarifa plana configurada', () => {
    const result = IndependentContractorEngine.calculate(
      baseIndependentInput({
        hourlyRate: 80_000,
        hoursWorked: 40,
        retentionConcept: 'HONORARIOS',
      })
    );

    expect(result.retentionRate).toBeCloseTo(
      CONSTANTS_2026.RETENTION_HONORARIOS_FLAT_RATE,
      5
    );
  });

  test('el IBC mínimo sugerido es 40% del bruto, con piso de 1 SMMLV', () => {
    const lowResult = IndependentContractorEngine.calculate(
      baseIndependentInput({ hourlyRate: 1_000, hoursWorked: 1 })
    );

    expect(lowResult.suggestedMinimumIbc).toBeCloseTo(
      CONSTANTS_2026.SMMLV,
      2
    );

    const highResult = IndependentContractorEngine.calculate(
      baseIndependentInput({ hourlyRate: 100_000, hoursWorked: 100 })
    );

    expect(highResult.suggestedMinimumIbc).toBeCloseTo(
      10_000_000 * 0.4,
      2
    );
  });

  test('rechaza horas negativas', () => {
    expect(() =>
      IndependentContractorEngine.calculate(
        baseIndependentInput({ hoursWorked: -1 })
      )
    ).toThrow(IndependentContractorEngineError);
  });

  test('rechaza tarifa por hora en cero o negativa', () => {
    expect(() =>
      IndependentContractorEngine.calculate(
        baseIndependentInput({ hourlyRate: 0 })
      )
    ).toThrow(IndependentContractorEngineError);
  });
});

describe('Enrutado automático del documento DIAN según el tipo de vinculación', () => {
  test('PART_TIME_EMPLOYEE genera el XML de Nómina Electrónica (DianNominaXmlService)', async () => {
    const payrollResult = PartTimeEmployeeEngine.calculate(
      basePartTimeInput({ hourlyRate: 10_000, hoursWorked: 80 })
    );

    const xmlResult = await DianNominaXmlService.generateDSPNE(
      payrollResult,
      {
        nit: '900123456',
        dv: '7',
        companyName: 'Empresa Cliente S.A.S.',
        softwareId: 'SOFT-TEST',
        pinSoftware: '12345',
      },
      { typeDocument: '13', typeContract: '1', paymentMethod: '42' },
      1
    );

    expect(xmlResult.xmlContent).toContain('<NominaIndividual');
    expect(xmlResult.xmlContent).toContain('NominaIndividual');
    expect(xmlResult.cune).toBeTruthy();
    expect(xmlResult.totalComprobante).toBeCloseTo(payrollResult.netPay, 2);
  });

  test('INDEPENDENT_SERVICES genera el XML del documento soporte (DocumentoSoporteService)', async () => {
    const settlement = IndependentContractorEngine.calculate(
      baseIndependentInput({ hourlyRate: 50_000, hoursWorked: 40 })
    );

    const payer: DocumentoSoportePayerInfo = {
      nit: '900123456',
      dv: '7',
      companyName: 'Empresa Cliente S.A.S.',
      softwareId: 'SOFT-TEST',
      pinSoftware: '12345',
    };

    const beneficiary: DocumentoSoporteBeneficiaryInfo = {
      typeDocument: '13',
      concept: settlement.retentionConcept,
    };

    const docResult = await DocumentoSoporteService.generate(
      settlement,
      payer,
      beneficiary,
      1
    );

    expect(docResult.xmlContent).toContain('<DocumentoSoporte');
    expect(docResult.xmlContent).not.toContain('NominaIndividual');
    expect(docResult.documentKey).toBeTruthy();
    expect(docResult.netAmount).toBeCloseTo(settlement.netAmount, 2);
    expect(docResult.disclaimer.length).toBeGreaterThan(0);
  });
});
