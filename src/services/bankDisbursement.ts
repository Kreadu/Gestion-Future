import type { ColombiaPayrollResult } from '../types/payroll';

export interface EmployeeBankDetails {
  bankCode?: string;
  bankAccountType?: string;
  bankAccount?: string;
  taxId?: string;
}

/**
 * Celda CSV entre comillas. Duplica las comillas internas y antepone
 * un apóstrofo a lo que empieza por = + - @ para que Excel no lo
 * interprete como fórmula (inyección CSV).
 */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');

  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

export class BankDisbursementService {
  /**
   * Genera el archivo CSV con la información requerida para el pago masivo o dispersión bancaria
   */
  static generateCSV(
    payrolls: ColombiaPayrollResult[],
    employeesMap: Map<string, EmployeeBankDetails>
  ): string {
    const headers = ['DOCUMENTO', 'NOMBRE', 'BANCO', 'TIPO_CUENTA', 'NUMERO_CUENTA', 'VALOR_NETO'];

    const rows = payrolls.map(p => {
      const emp = employeesMap.get(p.employeeId);
      return [
        csvCell(emp?.taxId || p.taxId || 'N/A'),
        csvCell(p.employeeName),
        csvCell(emp?.bankCode || 'N/A'),
        csvCell(emp?.bankAccountType || 'N/A'),
        csvCell(emp?.bankAccount || 'N/A'),
        p.netPay.toFixed(2)
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

export default BankDisbursementService;
