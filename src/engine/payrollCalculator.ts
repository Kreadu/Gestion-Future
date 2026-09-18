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
    // Redondear a 2 decimales para evitar imprecisiones de coma flotante
    const round = (val: number) => Math.round(val * 100) / 100;

    const baseSalaryEarned = round((employee.baseSalaryMonthly / 30) * daysWorked);
    const grossEarnings = round(baseSalaryEarned + overtimeAmount + bonusesAmount);

    const taxDeduction = round(grossEarnings * taxRate);
    const socialSecurityDeduction = round(grossEarnings * socialSecurityRate);
    const totalDeductions = round(taxDeduction + socialSecurityDeduction);

    const netPay = round(grossEarnings - totalDeductions);
    const employerContributions = round(grossEarnings * 0.15);

    const details: PayrollDetailConcept[] = [
      { concept: 'Salario Base', conceptType: 'earning', amount: baseSalaryEarned, taxable: true },
      ...(overtimeAmount > 0 ? [{ concept: 'Horas Extra', conceptType: 'earning' as const, amount: overtimeAmount, taxable: true }] : []),
      ...(bonusesAmount > 0 ? [{ concept: 'Bonos y Comisiones', conceptType: 'earning' as const, amount: bonusesAmount, taxable: true }] : []),
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
