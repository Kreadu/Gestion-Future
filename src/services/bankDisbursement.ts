```
import { PayrollRecord, Employee } from '../types/payroll';

export class BankDisbursementService {
  static generateCSV(payrolls: PayrollRecord[], employeesMap: Map
