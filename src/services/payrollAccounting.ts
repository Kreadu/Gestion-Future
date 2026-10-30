/**
 * Comprobante contable de nómina de un periodo, con cuentas del PUC
 * (Decreto 2650 de 1993), listo para importar en el software contable
 * (Siigo, Alegra, World Office…) o revisar en Excel.
 *
 * Una línea por empleado y concepto. En el gasto, salarios por pagar
 * y retención el tercero es el empleado; en los pasivos con
 * administradoras (EPS, AFP, ARL, CCF, ICBF, SENA) el tercero es la
 * administradora (su código PILA: el contador lo asocia a su NIT).
 *
 * - Vacaciones disfrutadas: se pagan contra la provisión (261015), no
 *   como gasto nuevo, porque el gasto ya se causó mes a mes.
 * - Incapacidades/licencias recobrables: cuenta por cobrar a la EPS o
 *   ARL (138095), no gasto de la empresa.
 * - Sueldos (510506) se arma con sus componentes; sólo absorbe hasta
 *   MAX_ROUNDING pesos de redondeo. Una diferencia mayor entre
 *   devengados y neto + deducciones se informa en `warnings`.
 * Contratistas independientes: honorarios (5110) o servicios (5135)
 * contra retención (2365) y cuenta por pagar (2335).
 * Las cuentas son las de uso general; el contador debe validarlas
 * (issue #9).
 */

import { csvCell } from './bankDisbursement';

export interface JournalEmployee {
  taxId: string;
  name: string;
  epsCode?: string | null;
  afpCode?: string | null;
  ccfCode?: string | null;
}

/** Contratista independiente (personal por horas, Documento Soporte). */
export interface JournalContractor {
  professional: { taxId: string; name: string };
  concept: 'HONORARIOS' | 'SERVICIOS' | string;
  grossAmount: number;
  retentionAmount: number;
  netAmount: number;
}

export interface JournalInput {
  periodStart: string;
  periodEnd: string;
  companyArlCode: string | null;
  /** Nómina mensual y personal por horas en jornada parcial (mismo resultado del motor). */
  settlements: { employee: JournalEmployee; result: any }[];
  contractors?: JournalContractor[];
}

export interface JournalLine {
  account: string;
  accountName: string;
  thirdPartyId: string;
  thirdPartyName: string;
  entity: string;
  detail: string;
  debit: number;
  credit: number;
}

export const PUC_ACCOUNTS: Record<string, string> = {
  '510506': 'Sueldos',
  '510515': 'Horas extras y recargos',
  '510527': 'Auxilio de transporte',
  '510530': 'Cesantías',
  '510533': 'Intereses sobre cesantías',
  '510536': 'Prima de servicios',
  '510539': 'Vacaciones',
  '510568': 'Aportes a administradoras de riesgos laborales',
  '510569': 'Aportes a entidades promotoras de salud',
  '510570': 'Aportes a fondos de pensiones',
  '510572': 'Aportes cajas de compensación familiar',
  '510575': 'Aportes ICBF',
  '510578': 'SENA',
  '511095': 'Honorarios - otros',
  '513595': 'Servicios - otros',
  '138095': 'Incapacidades y licencias por cobrar (EPS/ARL)',
  '233525': 'Honorarios por pagar',
  '233595': 'Otros costos y gastos por pagar',
  '236505': 'Retención en la fuente - salarios',
  '236515': 'Retención en la fuente - honorarios',
  '236525': 'Retención en la fuente - servicios',
  '237005': 'Aportes a EPS',
  '237006': 'Aportes a ARL',
  '237010': 'Aportes parafiscales (CCF, ICBF, SENA)',
  '238030': 'Fondos de pensiones',
  '250505': 'Salarios por pagar',
  '261005': 'Provisión cesantías',
  '261010': 'Provisión intereses sobre cesantías',
  '261015': 'Provisión vacaciones',
  '261020': 'Provisión prima de servicios',
};

const n = (v: unknown) => Math.round(Number(v || 0));

/** Pesos de redondeo del motor que puede absorber la cuenta de sueldos. */
export const MAX_ROUNDING = 2;

export function buildPayrollJournal(input: JournalInput) {
  const lines: JournalLine[] = [];
  const warnings: string[] = [];
  const period = `${input.periodStart} a ${input.periodEnd}`;

  for (const { employee, result } of input.settlements) {
    const who = `${employee.name} (${employee.taxId})`;

    /** entity = código de la administradora: si viene, es el tercero de la línea. */
    const add = (account: string, side: 'debit' | 'credit', value: number, entity = '') => {
      if (value === 0) return;
      // Un valor negativo (p. ej. un ajuste) va al lado contrario.
      const amount = Math.abs(value);
      const flipped = value < 0 ? (side === 'debit' ? 'credit' : 'debit') : side;
      lines.push({
        account,
        accountName: PUC_ACCOUNTS[account],
        thirdPartyId: entity || employee.taxId,
        thirdPartyName: entity || employee.name,
        entity,
        detail: entity ? `Nómina ${period} · ${who}` : `Nómina ${period}`,
        debit: flipped === 'debit' ? amount : 0,
        credit: flipped === 'credit' ? amount : 0,
      });
    };

    const ded = result.employeeDeductions || {};
    const emp = result.employerContributions || {};
    const prov = result.provisions || {};
    const leaves: any[] = result.leaveDetails || [];

    const netPay = n(result.netPay);
    const totalDeductions = n(ded.totalDeductions);
    const aux = n(result.earnedAuxTransporte);
    const overtime = n(result.overtimeTotal) + n(result.dominicalFestivoValue);
    const leaveValue = n(result.leaveValue);
    const vacationPaid = n(leaves.filter(l => l.type === 'VACATION').reduce((t, l) => t + Number(l.value || 0), 0));
    const reimbursable = n(result.reimbursableAmount);
    const health = n(ded.health4pct);
    const withholding = n(ded.retencionFuente);

    // Lo recobrable de incapacidades de origen laboral lo paga la ARL;
    // el resto, la EPS.
    const recoverable = leaves.filter(l => l.type !== 'VACATION');
    const reimburser = recoverable.length > 0 && recoverable.every(l => l.type === 'WORK_INCAPACITY')
      ? input.companyArlCode
      : employee.epsCode;

    let salaries = n(result.baseSalaryEarned) + leaveValue - vacationPaid - reimbursable;
    const difference = netPay + totalDeductions - (salaries + vacationPaid + reimbursable + aux + overtime);

    if (Math.abs(difference) > MAX_ROUNDING) {
      warnings.push(`${who}: los devengados no coinciden con neto + deducciones (diferencia ${difference}); se llevó a sueldos. Revisa la liquidación.`);
    }
    salaries += difference;

    // Devengados = neto + deducciones.
    add('510506', 'debit', salaries);
    add('510515', 'debit', overtime);
    add('510527', 'debit', aux);
    add('261015', 'debit', vacationPaid);
    add('138095', 'debit', reimbursable, reimburser || '');

    add('250505', 'credit', netPay);
    add('237005', 'credit', health, employee.epsCode || '');
    add('236505', 'credit', withholding);
    // Pensión + Fondo de Solidaridad Pensional.
    add('238030', 'credit', totalDeductions - health - withholding, employee.afpCode || '');

    // Aportes del empleador: gasto (tercero empleado) contra el pasivo
    // con la administradora.
    const contributions: [string, string, number, string][] = [
      ['510569', '237005', n(emp.health8_5pct), employee.epsCode || ''],
      ['510570', '238030', n(emp.pension12pct), employee.afpCode || ''],
      ['510568', '237006', n(emp.arlValue), input.companyArlCode || ''],
      ['510572', '237010', n(emp.ccf4pct), employee.ccfCode || ''],
      ['510575', '237010', n(emp.icbf3pct), 'ICBF'],
      ['510578', '237010', n(emp.sena2pct), 'SENA'],
    ];

    // Provisiones de prestaciones: gasto contra obligaciones laborales estimadas.
    const provisions: [string, string, number][] = [
      ['510530', '261005', n(prov.cesantias)],
      ['510533', '261010', n(prov.interesesCesantias)],
      ['510536', '261020', n(prov.primaServicios)],
      ['510539', '261015', n(prov.vacaciones)],
    ];

    for (const [expense, liability, value, entity] of contributions) {
      add(expense, 'debit', value);
      add(liability, 'credit', value, entity);
    }

    for (const [expense, liability, value] of provisions) {
      add(expense, 'debit', value);
      add(liability, 'credit', value);
    }
  }

  // Contratistas: gasto por honorarios (5110) o servicios (5135) contra
  // la retención practicada y la cuenta por pagar al contratista.
  const CONTRACTOR_ACCOUNTS: Record<string, [string, string, string]> = {
    HONORARIOS: ['511095', '236515', '233525'],
    SERVICIOS: ['513595', '236525', '233595'],
  };

  for (const c of input.contractors || []) {
    const [expense, retention, payable] = CONTRACTOR_ACCOUNTS[c.concept] || CONTRACTOR_ACCOUNTS.SERVICIOS;
    const who = `${c.professional.name} (${c.professional.taxId})`;
    const gross = n(c.grossAmount);
    const withheld = n(c.retentionAmount);
    let net = n(c.netAmount);
    const difference = gross - withheld - net;

    if (Math.abs(difference) > MAX_ROUNDING) {
      warnings.push(`${who}: el neto no coincide con bruto − retención (diferencia ${difference}); se llevó a la cuenta por pagar. Revisa la liquidación.`);
    }
    net += difference;

    const line = (account: string, debit: number, credit: number) => {
      if (debit === 0 && credit === 0) return;
      lines.push({
        account,
        accountName: PUC_ACCOUNTS[account],
        thirdPartyId: c.professional.taxId,
        thirdPartyName: c.professional.name,
        entity: '',
        detail: `Contratista ${period}`,
        debit,
        credit,
      });
    };

    line(expense, gross, 0);
    line(retention, 0, withheld);
    line(payable, 0, net);
  }

  const totals = {
    debit: lines.reduce((t, l) => t + l.debit, 0),
    credit: lines.reduce((t, l) => t + l.credit, 0),
  };

  const header = 'CUENTA,NOMBRE_CUENTA,TERCERO_DOCUMENTO,TERCERO_NOMBRE,ENTIDAD,DETALLE,DEBITO,CREDITO';
  const csv = [
    header,
    ...lines.map(l => [
      csvCell(l.account),
      csvCell(l.accountName),
      csvCell(l.thirdPartyId),
      csvCell(l.thirdPartyName),
      csvCell(l.entity),
      csvCell(l.detail),
      l.debit.toFixed(2),
      l.credit.toFixed(2),
    ].join(',')),
  ].join('\n');

  return { lines, totals, csv, warnings };
}
