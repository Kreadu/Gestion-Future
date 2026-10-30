import { describe, test, expect } from '@jest/globals';

import { BankDisbursementService } from '../src/services/bankDisbursement';
import type { ColombiaPayrollResult } from '../src/types/payroll';

function payroll(overrides: Partial<ColombiaPayrollResult>): ColombiaPayrollResult {
  return {
    employeeId: 'EMP-1',
    employeeName: 'Ana Gómez',
    taxId: '1012345678',
    netPay: 2009384.6,
    ...overrides,
  } as ColombiaPayrollResult;
}

describe('Archivo de dispersión bancaria', () => {
  test('incluye documento, banco, tipo y número de cuenta, y el neto', () => {
    const csv = BankDisbursementService.generateCSV(
      [payroll({})],
      new Map([['EMP-1', {
        bankCode: 'Bancolombia',
        bankAccountType: 'AHORROS',
        bankAccount: '12345678901',
        taxId: '1012345678',
      }]])
    );

    const [header, row] = csv.split('\n');

    expect(header).toBe('DOCUMENTO,NOMBRE,BANCO,TIPO_CUENTA,NUMERO_CUENTA,VALOR_NETO');
    expect(row).toBe('"1012345678","Ana Gómez","Bancolombia","AHORROS","12345678901",2009384.60');
  });

  test('escapa comillas y neutraliza fórmulas de hoja de cálculo', () => {
    const csv = BankDisbursementService.generateCSV(
      [payroll({ employeeName: 'Ana "La Jefa" =HYPERLINK("x")' })],
      new Map([['EMP-1', { bankCode: '=cmd', bankAccount: '1', taxId: '1' }]])
    );

    const row = csv.split('\n')[1];

    expect(row).toContain('"Ana ""La Jefa"" =HYPERLINK(""x"")"');
    expect(row).toContain(`"'=cmd"`);
  });
});
