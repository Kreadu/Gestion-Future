import { PayrollRecord, Employee } from '../types/payroll';

export class BankDisbursementService {
  static generateCSV(payrolls: PayrollRecord[], employeesMap: Map<string, Employee>): string {
    const headers = ['ID\_EMPLEADO', 'NOMBRE', 'BANCO', 'CUENTA', 'RFC\_NIF', 'MONTO\_NETO\_A\_PAGAR'];
    const rows = payrolls.map(p =&gt; {
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
