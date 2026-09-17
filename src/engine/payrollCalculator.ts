```
import { Employee, PayrollRecord, PayrollDetailConcept } from '../types/payroll';

export class PayrollCalculator {
  static calculateMonthlyPayroll(
    employee: Employee,
    daysWorked: number = 30,
    overtimeAmount: number = 0,
    bonusesAmount: number = 0,
    taxRate: number = 0.10,
    socialSecurityRate: number = 0.05
  ): PayrollRecord {
    const baseSalaryEarned = (employee.baseSalaryMonthly / 30) * daysWorked;
    const grossEarnings = baseSalaryEarned + overtimeAmount + bonusesAmount;

    const taxDeduction = grossEarnings * taxRate;
    const socialSecurityDeduction = grossEarnings * socialSecurityRate;
    const totalDeductions = taxDeduction + socialSecurityDeduction;

    const netPay = grossEarnings - totalDeductions;
    const employerContributions = grossEarnings * 0.15;

    const details: PayrollDetailConcept[] = [
      { concept: 'Salario Base', conceptType: 'earning', amount: baseSalaryEarned, taxable: true },
      ...(overtimeAmount &gt; 0 ? [{ concept: 'Horas Extra', conceptType: 'earning' as const, amount: overtimeAmount, taxable: true }] : []),
      ...(bonusesAmount &gt; 0 ? [{ concept: 'Bonos y Comisiones', conceptType: 'earning' as const, amount: bonusesAmount, taxable: true }] : []),
      { concept: 'Retención de Impuestos', conceptType: 'deduction', amount: taxDeduction, taxable: false },
      { concept: 'Seguridad Social (Empleado)', conceptType: 'deduction', amount: socialSecurityDeduction, taxable: false }
    ];

    return {
      payrollId: `PAY-${Date.now()}-${employee.id}`,
      employeeId: employee.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      daysWorked,
      baseSalaryEarned,
      totalEarnings: grossEarnings,
      totalDeductions,
      netPay,
      employerContributions,
      details
    };
  }
}

```
