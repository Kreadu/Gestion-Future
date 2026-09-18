export interface ColombiaEmployeeInput {
  employeeId: string;
  firstName: string;
  lastName: string;
  taxId: string; // Cédula o NIT
  baseSalaryMonthly: number;
  daysWorked: number; // Típicamente 30 días para liquidación mensual
  overtimeHours?: {
    extraDiurna?: number;          // +25% (x1.25)
    extraNocturna?: number;        // +75% (x1.75)
    extraDiurnaDominical?: number; // +115% (x2.15)
    extraNocturnaDominical?: number; // +165% (x2.65)
    recargoNocturno?: number;      // +35% (x0.35)
    recargoDominicalDiurno?: number; // +90% (x0.90)
    recargoDominicalNocturno?: number; // +125% (x1.25)
  };
  otherTaxableEarnings?: number;
  otherNonTaxableEarnings?: number;
  isExempt114_1?: boolean; // Exoneración de Salud (8.5%), SENA (2%) e ICBF (3%)
  arlRiskLevel?: 1 | 2 | 3 | 4 | 5; // Nivel de riesgo ARL I (0.522%) a V (6.960%)
}

export interface ColombiaPayrollResult {
  country: 'Colombia';
  year: number;
  employeeId: string;
  employeeName: string;
  taxId: string;
  daysWorked: number;
  
  // Devengados
  baseSalaryEarned: number;
  hourlyRate: number;
  qualifiesAuxTransporte: boolean;
  earnedAuxTransporte: number;
  overtimeTotal: number;
  overtimeBreakdown: Array&lt;{ type: string; hours: number; rateApplied: number; amount: number }&gt;;
  otherTaxableEarnings: number;
  otherNonTaxableEarnings: number;
  grossEarnings: number; // Total Devengado Bruto

  // IBC (Ingreso Base de Cotización)
  ibcSecuritySocial: number;

  // Deducciones del Empleado
  employeeDeductions: {
    health4pct: number;
    pension4pct: number;
    fsp: number; // Fondo de Solidaridad Pensional
    totalDeductions: number;
  };

  // Neto a Pagar
  netPay: number;

  // Cargas Patronales (Aportes y Parafiscales)
  employerContributions: {
    pension12pct: number;
    health8_5pct: number; // \$0 si aplica Art. 114-1 ET
    arl: number;
    cajaCompensacion4pct: number;
    sena2pct: number; // \$0 si aplica Art. 114-1 ET
    icbf3pct: number; // \$0 si aplica Art. 114-1 ET
    isExempt114_1: boolean;
    totalEmployerContributions: number;
  };

  // Provisiones para Prestaciones Sociales
  provisions: {
    cesantias: number;
    interesesCesantias: number;
    primaServicios: number;
    vacaciones: number;
    totalProvisions: number;
  };

  // Costo Total Empleador
  totalEmployerCost: number;
}

export class ColombiaPayrollEngine {
  // Parámetros Oficiales Colombia 2026
  public static readonly SMMLV_2026 = 1750905.0;
  public static readonly AUX_TRANSPORTE_2026 = 249095.0;
  public static readonly MONTHLY_HOURS = 210.0; // 42 horas semanales (Ley 2101)

  // Porcentajes ARL según Nivel de Riesgo
  public static readonly ARL_RATES: Record<number, number> = {
    1: 0.00522, // Riesgo I (Financiero / Administrativo)
    2: 0.01044, // Riesgo II 
    3: 0.02436, // Riesgo III 
    4: 0.04350, // Riesgo IV 
    5: 0.06960 // Riesgo V 
  };

  public static calculate(input: ColombiaEmployeeInput): ColombiaPayrollResult { 
    const daysWorked = Math.min(Math.max(input.daysWorked, 0), 30); 
    const baseSalaryMonthly = input.baseSalaryMonthly; 
    
    // 1\. Valor Hora Ordinaria 
    const hourlyRate = baseSalaryMonthly / this.MONTHLY\_HOURS;
    
    // 2\. Salario Proporcional Devengado 
    const baseSalaryEarned = (baseSalaryMonthly / 30.0) \* daysWorked;
    
    // 3\. Auxilio de Transporte (Aplica hasta 2 SMMLV = \\$3.501.810 COP)
    const qualifiesAuxTransporte = baseSalaryMonthly &lt;= (this.SMMLV\_2026 \* 2.0); 
    const earnedAuxTransporte = qualifiesAuxTransporte ? (this.AUX\_TRANSPORTE\_2026 / 30.0) \* daysWorked : 0.0; 
    
    // 4\. Cálculo de Horas Extras y Recargos 
    const ot = input.overtimeHours || {};
    const overtimeBreakdown = [ 
      { type: 'Extra Diurna (+25%)', hours: ot.extraDiurna || 0, rateApplied: 1.25 }, 
      { type: 'Extra Nocturna (+75%)', hours: ot.extraNocturna || 0, rateApplied: 1.75 }, 
      { type: 'Extra Diurna Dominical (+115%)', hours: ot.extraDiurnaDominical || 0, rateApplied: 2.15 }, 
      { type: 'Extra Nocturna Dominical (+165%)', hours: ot.extraNocturnaDominical || 0, rateApplied: 2.65 },
      { type: 'Recargo Nocturno (+35%)', hours: ot.recargoNocturno || 0, rateApplied: 0.35 }, 
      { type: 'Recargo Dominical Diurno (+90%)', hours: ot.recargoDominicalDiurno || 0, rateApplied: 0.90 },
      { type: 'Recargo Dominical Nocturno (+125%)', hours: ot.recargoDominicalNocturno || 0, rateApplied: 1.25 }
    ].map(item =&gt; ({
      type: item.type,
      hours: item.hours,
      rateApplied: item.rateApplied,
      amount: Math.round(item.hours * hourlyRate * item.rateApplied * 100) / 100
    })).filter(item =&gt; item.hours &gt; 0);

    const overtimeTotal = overtimeBreakdown.reduce((sum, item) =&gt; sum + item.amount, 0);

    const otherTaxable = input.otherTaxableEarnings || 0;
    const otherNonTaxable = input.otherNonTaxableEarnings || 0;

    // Total Devengado Bruto
    const grossEarnings = baseSalaryEarned + earnedAuxTransporte + overtimeTotal + otherTaxable + otherNonTaxable;

    // 5. IBC (Excluye el Auxilio de Transporte)
    const ibcSecuritySocial = baseSalaryEarned + overtimeTotal + otherTaxable;

    // 6. Deducciones del Empleado (Salud 4%, Pensión 4%)
    const health4pct = Math.round(ibcSecuritySocial * 0.04 * 100) / 100;
    const pension4pct = Math.round(ibcSecuritySocial * 0.04 * 100) / 100;

    // Fondo de Solidaridad Pensional (FSP)
    let fspRate = 0.0;
    if (ibcSecuritySocial &gt;= (this.SMMLV_2026 * 4.0)) {
      if (ibcSecuritySocial &lt; (this.SMMLV_2026 * 16.0)) fspRate = 0.01;
      else if (ibcSecuritySocial &lt; (this.SMMLV_2026 * 17.0)) fspRate = 0.012;
      else if (ibcSecuritySocial &lt; (this.SMMLV_2026 * 18.0)) fspRate = 0.014;
      else if (ibcSecuritySocial &lt; (this.SMMLV_2026 * 19.0)) fspRate = 0.016;
      else if (ibcSecuritySocial &lt; (this.SMMLV_2026 * 20.0)) fspRate = 0.018;
      else fspRate = 0.02;
    }
    const fsp = Math.round(ibcSecuritySocial * fspRate * 100) / 100;

    const totalDeductions = health4pct + pension4pct + fsp;

    // 7. Neto a Pagar al Trabajador
    const netPay = grossEarnings - totalDeductions;

    // 8. Cargas Patronales
    const isExempt = input.isExempt114_1 ?? true;
    const pension12pct = Math.round(ibcSecuritySocial * 0.12 * 100) / 100;
    const health8_5pct = isExempt ? 0 : Math.round(ibcSecuritySocial * 0.085 * 100) / 100;

    const arlRate = this.ARL_RATES[input.arlRiskLevel || 1];
    const arl = Math.round(ibcSecuritySocial * arlRate * 100) / 100;

    const cajaCompensacion4pct = Math.round(ibcSecuritySocial * 0.04 * 100) / 100;
    const sena2pct = isExempt ? 0 : Math.round(ibcSecuritySocial * 0.02 * 100) / 100;
    const icbf3pct = isExempt ? 0 : Math.round(ibcSecuritySocial * 0.03 * 100) / 100;

    const totalEmployerContributions = pension12pct + health8_5pct + arl + cajaCompensacion4pct + sena2pct + icbf3pct;

    // 9. Provisiones de Prestaciones Sociales
    const baseCesantiasPrima = ibcSecuritySocial + earnedAuxTransporte;
    const cesantias = Math.round(baseCesantiasPrima * 0.0833 * 100) / 100;
    const interesesCesantias = Math.round(cesantias * 0.12 * (daysWorked / 30.0) * 100) / 100;
    const primaServicios = Math.round(baseCesantiasPrima * 0.0833 * 100) / 100;

    // Vacaciones: Base IBC sin auxilio de transporte
    const vacaciones = Math.round(ibcSecuritySocial * 0.0417 * 100) / 100;

    const totalProvisions = cesantias + interesesCesantias + primaServicios + vacaciones;

    // Costo Total Empleador
    const totalEmployerCost = grossEarnings + totalEmployerContributions + totalProvisions;

    return {
      country: 'Colombia',
      year: 2026,
      employeeId: input.employeeId,
      employeeName: `${input.firstName} ${input.lastName}`,
      taxId: input.taxId,
      daysWorked,
      baseSalaryEarned: Math.round(baseSalaryEarned * 100) / 100,
      hourlyRate: Math.round(hourlyRate * 100) / 100,
      qualifiesAuxTransporte,
      earnedAuxTransporte: Math.round(earnedAuxTransporte * 100) / 100,
      overtimeTotal,
      overtimeBreakdown,
      otherTaxableEarnings: otherTaxable,
      otherNonTaxableEarnings: otherNonTaxable,
      grossEarnings: Math.round(grossEarnings * 100) / 100,
      ibcSecuritySocial: Math.round(ibcSecuritySocial * 100) / 100,
      employeeDeductions: {
        health4pct,
        pension4pct,
        fsp,
        totalDeductions: Math.round(totalDeductions * 100) / 100
      },
      netPay: Math.round(netPay * 100) / 100,
      employerContributions: {
        pension12pct,
        health8_5pct,
        arl,
        cajaCompensacion4pct,
        sena2pct,
        icbf3pct,
        isExempt114_1: isExempt,
        totalEmployerContributions: Math.round(totalEmployerContributions * 100) / 100
      },
      provisions: {
        cesantias,
        interesesCesantias,
        primaServicios,
        vacaciones,
        totalProvisions: Math.round(totalProvisions * 100) / 100
      },
      totalEmployerCost: Math.round(totalEmployerCost * 100) / 100
    };
  }
}

```
