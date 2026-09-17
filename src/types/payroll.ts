export interface Tenant { 
  id: string; 
  name: string; 
  taxId: string; 
  bankAccount: string; 
  createdAt: string; 
} 

export interface Employee { 
  id: string; 
  tenantId: string; 
  firstName: string; 
  lastName: string; 
  taxId: string; 
  jobTitle: string; 
  baseSalaryMonthly: number;
  bankAccount: string;
  bankCode: string; 
}

export interface PayrollDetailConcept { 
  concept: string; 
  conceptType: 'earning' | 'deduction';
  amount: number; 
  taxable: boolean;
} 

export interface PayrollRecord { 
  payrollId: string; 
  employeeId: string; 
  employeeName: string; 
  daysWorked: number; 
  baseSalaryEarned: number; 
  totalEarnings: number; 
  totalDeductions: number; 
  netPay: number; 
  employerContributions: number; 
  details: PayrollDetailConcept[]; 
}
