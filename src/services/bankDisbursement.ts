import { PayrollRecord, Employee } from '../types/payroll';

export class BankDisbursementService {
  static generateCSV(payrolls: PayrollRecord[], employeesMap: Map<string, Employee>): string {
    const headers = ['ID_EMPLEADO', 'NOMBRE', 'BANCO', 'CUENTA', 'RFC_NIF', 'MONTO_NETO_A_PAGAR'];
    const rows = payrolls.map(p => {
      const emp = employeesMap.get(p.employeeId);
      return [
        `"${p.employeeId}"`,
        `"${p.employeeName}"`,
        `"${emp?.bankCode || 'N/A'}"`,
        `"${emp?.bankAccount || 'N/A'}"`,
        `"${emp?.taxId || 'N/A'}"`,
        p.netPay.toFixed(2)
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
