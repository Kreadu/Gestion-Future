import { describe, test, expect } from '@jest/globals';
import { ColombiaPayrollEngine } from '../src/engine/countries/colombiaEngine';
import { DianNominaXmlService } from '../src/services/dianNominaXmlService';

/**
 * Utilidades de aserción para la suite de pruebas
 */
function assertEquals<T>(
  actual: T,
  expected: T,
  testName: string
): void {
  if (actual !== expected) {
    throw new Error(
      `❌ [FAIL] ${testName}\n` +
      `   Esperado: ${expected} | Obtenido: ${actual}`
    );
  }

  console.log(`✅ [PASS] ${testName}`);
}

function assertTrue(
  condition: boolean,
  testName: string
): void {
  if (!condition) {
    throw new Error(`❌ [FAIL] ${testName}`);
  }

  console.log(`✅ [PASS] ${testName}`);
}

/**
 * Suite completa de pruebas de Nómina Colombia + DIAN
 */
async function runPayrollAndDianTests(): Promise<void> {
  console.log('===========================================================');
  console.log('=== PRUEBAS AUTOMATIZADAS: NÓMINA COLOMBIA Y DIAN 2026 ===');
  console.log('===========================================================\n');

  // =========================================================
  // TEST 1: Liquidación SMMLV + Auxilio de Transporte
  // =========================================================

  console.log(
    '--- Suite 1: Liquidación SMMLV 2026 (1 SMMLV + Aux. Transporte) ---'
  );

  const emp1 = ColombiaPayrollEngine.calculate({
    employeeId: 'EMP-001',
    firstName: 'Juan',
    lastName: 'Pérez',
    taxId: '123456789',
    baseSalaryMonthly: 1750905,
    daysWorked: 30,
    isExempt114_1: false
  });

  assertEquals(
    emp1.baseSalaryEarned,
    1750905,
    'Salario base devengado ($1.750.905)'
  );

  assertEquals(
    emp1.earnedAuxTransporte,
    249095,
    'Auxilio de transporte ($249.095)'
  );

  assertEquals(
    emp1.grossEarnings,
    2000000,
    'Total devengado bruto ($2.000.000)'
  );

  assertEquals(
    emp1.ibcSecuritySocial,
    1750905,
    'IBC excluye auxilio de transporte'
  );

  assertEquals(
    emp1.employeeDeductions.health4pct,
    70036.2,
    'Deducción Salud Empleado (4%)'
  );

  assertEquals(
    emp1.employeeDeductions.pension4pct,
    70036.2,
    'Deducción Pensión Empleado (4%)'
  );

  assertEquals(
    emp1.netPay,
    1859927.6,
    'Neto a pagar ($1.859.927,60)'
  );

  // =========================================================
  // TEST 2: Horas Extras y Recargo Nocturno
  // =========================================================

  console.log(
    '\n--- Suite 2: Horas Extras (Jornada 42h/sem) y Recargo Nocturno (7:00 p.m.) ---'
  );

  const emp2 = ColombiaPayrollEngine.calculate({
    employeeId: 'EMP-002',
    firstName: 'María',
    lastName: 'Gómez',
    taxId: '987654321',
    baseSalaryMonthly: 1750905,
    daysWorked: 30,
    overtimeHours: {
      extraDiurna: 10,
      recargoNocturno: 10
    }
  });

  assertEquals(
    emp2.hourlyRate,
    8337.64,
    'Valor hora ordinaria basada en 210h/mes'
  );

  assertTrue(
    emp2.overtimeTotal > 0,
    'Cálculo de total de recargos y horas extras'
  );

  // =========================================================
  // TEST 3: Exoneración Art. 114-1 ET
  // =========================================================

  console.log(
    '\n--- Suite 3: Exoneración de Aportes Patronales (Art. 114-1 ET) ---'
  );

  const empExempt = ColombiaPayrollEngine.calculate({
    employeeId: 'EMP-003',
    firstName: 'Carlos',
    lastName: 'Ríos',
    taxId: '555555555',
    baseSalaryMonthly: 1750905,
    daysWorked: 30,
    isExempt114_1: true
  });

  assertEquals(
    empExempt.employerContributions.health8_5pct,
    0,
    'Aporte Salud Empleador Exento ($0,00)'
  );

  assertEquals(
    empExempt.employerContributions.sena2pct,
    0,
    'Aporte SENA Exento ($0,00)'
  );

  assertEquals(
    empExempt.employerContributions.icbf3pct,
    0,
    'Aporte ICBF Exento ($0,00)'
  );

  // =========================================================
  // TEST 4: XML + CUNE DIAN
  // =========================================================

  console.log(
    '\n--- Suite 4: Estructura XML y Firma CUNE (Resolución DIAN 000013) ---'
  );

  const dianEmployer = {
    nit: '900123456',
    dv: '7',
    companyName: 'Kreadu Outsourcing S.A.S.',
    softwareId: 'SOFT-ID-12345',
    pinSoftware: '12345'
  };

  const dianEmployee = {
    typeDocument: '13' as const,
    typeContract: '1' as const,
    paymentMethod: '42' as const,
    bankName: 'BANCOLOMBIA',
    accountNumber: '123456789'
  };

  const dianResult = await DianNominaXmlService.generateDSPNE(
    emp1,
    dianEmployer,
    dianEmployee,
    101,
    '2026-09-30',
    '10:00:00-05:00'
  );

  assertTrue(
    dianResult.cune.length >= 40,
    'CUNE generado en formato Hash SHA-384'
  );

  assertTrue(
    dianResult.xmlContent.includes('NominaIndividual'),
    'Etiqueta raíz NominaIndividual presente'
  );

  assertTrue(
    dianResult.xmlContent.includes('CUNE='),
    'Atributo CUNE asignado correctamente'
  );

  assertEquals(
    dianResult.totalComprobante,
    emp1.netPay,
    'Monto del comprobante concuerda con el neto a pagar'
  );

  console.log('\n===========================================================');
  console.log('✅ TODAS LAS PRUEBAS COMPLETADAS CON ÉXITO');
  console.log('===========================================================');
}

/**
 * TEST REAL DE JEST
 *
 * Esto es lo que faltaba en el archivo original.
 * Jest espera correctamente la función async.
 */
describe('Nómina Colombia y DIAN 2026', () => {
  test(
    'debe completar correctamente todas las pruebas de nómina y DIAN',
    async () => {
      await runPayrollAndDianTests();
    }
  );
});