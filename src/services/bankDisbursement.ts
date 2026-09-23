import type { ColombiaPayrollResult } from '../types/payroll';

export interface EmployeeBankDetails {
  bankCode?: string;
  bankAccount?: string;
  taxId?: string;
}

export class BankDisbursementService {
  /**
   * Genera el archivo CSV con la información requerida para el pago masivo o dispersión bancaria
   */
  static generateCSV(
    payrolls: ColombiaPayrollResult[],
    employeesMap: Map<string, EmployeeBankDetails>
  ): string {
    const headers = ['ID_EMPLEADO', 'NOMBRE', 'BANCO', 'CUENTA', 'RFC_NIF', 'MONTO_NETO_A_PAGAR'];
    
    const rows = payrolls.map(p => {
      const emp = employeesMap.get(p.employeeId);
      return [
        `"${p.employeeId}"`,
        `"${p.employeeName}"`,
        `"${emp?.bankCode || 'N/A'}"`,
        `"${emp?.bankAccount || 'N/A'}"`,
        `"${emp?.taxId || p.taxId || 'N/A'}"`,
        p.netPay.toFixed(2)
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

export default BankDisbursementService;