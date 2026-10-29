/**
 * Certificado de ingresos y retenciones por rentas de trabajo
 * (Formulario 220 de la DIAN) y datos del certificado laboral.
 *
 * Lógica pura: recibe las filas ya leídas de la base (nóminas,
 * pagos de prestaciones y liquidación definitiva) y arma las
 * casillas. No toca D1, así que se prueba sin base de datos.
 *
 * NOTA DE VALIDACIÓN: la numeración de las casillas del formulario
 * 220 cambia según la resolución DIAN que lo prescribe para cada año
 * gravable. Aquí cada casilla se identifica por su concepto (nombre
 * del renglón), no por su número. Antes de usarlo como formulario
 * oficial, un contador debe verificar el formato prescrito vigente.
 */

export type BenefitType = 'PRIMA' | 'CESANTIAS' | 'INTERESES_CESANTIAS';

export interface CertificateSettlementRow {
  periodStart: string;
  periodEnd: string;
  /** Periodo cerrado (pagado). Los borradores no se certifican. */
  closed?: boolean;
  /** resultJson de payroll_settlements ya parseado. */
  result: any;
}

export interface CertificateBenefitRow {
  benefitType: BenefitType | string;
  periodStart: string;
  periodEnd: string;
  amount: number;
}

export interface CertificateTerminationRow {
  terminationDate: string;
  /** `result` de la liquidación definitiva (lines + retencionIndemnizacion). */
  result: {
    lines?: { concept: string; amount: number }[];
    retencionIndemnizacion?: number;
  };
}

export interface IncomeCertificateInput {
  year: number;
  settlements: CertificateSettlementRow[];
  benefitPayments: CertificateBenefitRow[];
  termination: CertificateTerminationRow | null;
}

export type BoxKey =
  | 'salarios'
  | 'bonos'
  | 'honorarios'
  | 'servicios'
  | 'comisiones'
  | 'prestacionesSociales'
  | 'viaticos'
  | 'gastosRepresentacion'
  | 'trabajoAsociado'
  | 'otrosPagos'
  | 'cesantiasPagadas'
  | 'cesantiasConsignadas'
  | 'pensiones'
  | 'totalIngresosBrutos'
  | 'aportesSalud'
  | 'aportesPensionFsp'
  | 'aportesVoluntariosRais'
  | 'aportesVoluntariosPension'
  | 'aportesAfc'
  | 'aportesAvc'
  | 'retencionFuente';

export interface BoxDefinition {
  key: BoxKey;
  section: 'INGRESOS' | 'APORTES' | 'RETENCION';
  label: string;
  total?: boolean;
}

/** Renglones del formulario 220, en el orden del formulario. */
export const INCOME_CERTIFICATE_BOXES: BoxDefinition[] = [
  { key: 'salarios', section: 'INGRESOS', label: 'Pagos por salarios o emolumentos eclesiásticos' },
  { key: 'bonos', section: 'INGRESOS', label: 'Pagos realizados con bonos electrónicos o de papel de servicio, cheques, tarjetas, vales, etc.' },
  { key: 'honorarios', section: 'INGRESOS', label: 'Pagos por honorarios' },
  { key: 'servicios', section: 'INGRESOS', label: 'Pagos por servicios' },
  { key: 'comisiones', section: 'INGRESOS', label: 'Pagos por comisiones' },
  { key: 'prestacionesSociales', section: 'INGRESOS', label: 'Pagos por prestaciones sociales' },
  { key: 'viaticos', section: 'INGRESOS', label: 'Pagos por viáticos' },
  { key: 'gastosRepresentacion', section: 'INGRESOS', label: 'Pagos por gastos de representación' },
  { key: 'trabajoAsociado', section: 'INGRESOS', label: 'Pagos por compensaciones por el trabajo asociado cooperativo' },
  { key: 'otrosPagos', section: 'INGRESOS', label: 'Otros pagos' },
  { key: 'cesantiasPagadas', section: 'INGRESOS', label: 'Cesantías e intereses de cesantías efectivamente pagadas al empleado' },
  { key: 'cesantiasConsignadas', section: 'INGRESOS', label: 'Cesantías consignadas al fondo de cesantías' },
  { key: 'pensiones', section: 'INGRESOS', label: 'Pensiones de jubilación, vejez o invalidez' },
  { key: 'totalIngresosBrutos', section: 'INGRESOS', label: 'Total de ingresos brutos', total: true },
  { key: 'aportesSalud', section: 'APORTES', label: 'Aportes obligatorios por salud a cargo del trabajador' },
  { key: 'aportesPensionFsp', section: 'APORTES', label: 'Aportes obligatorios a fondos de pensiones y solidaridad pensional a cargo del trabajador' },
  { key: 'aportesVoluntariosRais', section: 'APORTES', label: 'Aportes voluntarios al régimen de ahorro individual con solidaridad (RAIS)' },
  { key: 'aportesVoluntariosPension', section: 'APORTES', label: 'Aportes voluntarios a fondos de pensiones' },
  { key: 'aportesAfc', section: 'APORTES', label: 'Aportes a cuentas AFC' },
  { key: 'aportesAvc', section: 'APORTES', label: 'Aportes a cuentas AVC' },
  { key: 'retencionFuente', section: 'RETENCION', label: 'Valor de la retención en la fuente por ingresos laborales y de pensiones' },
];

export interface IncomeCertificateDetail {
  salarioBasico: number;
  horasExtraRecargos: number;
  incapacidadesLicencias: number;
  vacacionesDisfrutadas: number;
  vacacionesCompensadas: number;
  auxilioTransporte: number;
  prima: number;
  cesantiasPagadas: number;
  interesesCesantias: number;
  cesantiasConsignadas: number;
  indemnizacion: number;
}

export interface IncomeCertificateBox extends BoxDefinition {
  value: number;
}

export interface IncomeCertificateResult {
  year: number;
  settlementsCount: number;
  detail: IncomeCertificateDetail;
  boxes: IncomeCertificateBox[];
  totals: {
    ingresosBrutos: number;
    aportesSalud: number;
    aportesPension: number;
    aportesFsp: number;
    aportesPensionFsp: number;
    retencionFuente: number;
    retencionNomina: number;
    retencionIndemnizacion: number;
  };
  notes: string[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const peso = (v: number) => Math.round(v);

const inYear = (iso: string | null | undefined, year: number) =>
  !!iso && String(iso).slice(0, 4) === String(year);

/**
 * Agrega los conceptos del año gravable `year`:
 *
 * - Nóminas: las de los periodos que terminan en el año.
 * - Prima: los semestres que terminan en el año (se pagan en junio
 *   y diciembre).
 * - Cesantías e intereses: los del año ANTERIOR, porque se consignan
 *   (14 de febrero) y pagan (31 de enero) en el año gravable
 *   (realización del ingreso, art. 27 ET).
 * - Liquidación definitiva: si el retiro fue en el año.
 */
export function computeIncomeCertificate(input: IncomeCertificateInput): IncomeCertificateResult {
  const { year } = input;

  const d: IncomeCertificateDetail = {
    salarioBasico: 0,
    horasExtraRecargos: 0,
    incapacidadesLicencias: 0,
    vacacionesDisfrutadas: 0,
    vacacionesCompensadas: 0,
    auxilioTransporte: 0,
    prima: 0,
    cesantiasPagadas: 0,
    interesesCesantias: 0,
    cesantiasConsignadas: 0,
    indemnizacion: 0,
  };

  let aportesSalud = 0;
  let aportesPension = 0;
  let aportesFsp = 0;
  let retencionNomina = 0;
  let retencionIndemnizacion = 0;
  let settlementsCount = 0;
  let draftCount = 0;

  for (const s of input.settlements) {
    if (!inYear(s.periodEnd, year)) continue;
    if (s.closed === false) {
      draftCount++;
      continue;
    }
    settlementsCount++;

    const r = s.result || {};
    const leaveValue = num(r.leaveValue);
    const vacation = (Array.isArray(r.leaveDetails) ? r.leaveDetails : [])
      .filter((l: any) => l && l.type === 'VACATION')
      .reduce((sum: number, l: any) => sum + num(l.value), 0);

    d.salarioBasico += num(r.baseSalaryEarned);
    d.horasExtraRecargos += num(r.overtimeTotal) + num(r.dominicalFestivoValue);
    d.vacacionesDisfrutadas += Math.min(vacation, leaveValue);
    d.incapacidadesLicencias += Math.max(0, leaveValue - vacation);
    d.auxilioTransporte += num(r.earnedAuxTransporte);

    const ded = r.employeeDeductions || {};
    aportesSalud += num(ded.health4pct);
    aportesPension += num(ded.pension4pct);
    aportesFsp += num(ded.fspValue ?? ded.fsp);
    retencionNomina += num(ded.retencionFuente);
  }

  for (const p of input.benefitPayments) {
    const amount = num(p.amount);

    if (p.benefitType === 'PRIMA' && inYear(p.periodEnd, year)) {
      d.prima += amount;
    } else if (p.benefitType === 'CESANTIAS' && inYear(p.periodEnd, year - 1)) {
      d.cesantiasConsignadas += amount;
    } else if (p.benefitType === 'INTERESES_CESANTIAS' && inYear(p.periodEnd, year - 1)) {
      d.interesesCesantias += amount;
    }
  }

  const t = input.termination;

  if (t && inYear(t.terminationDate, year)) {
    for (const line of t.result?.lines || []) {
      const concept = String(line.concept || '');
      const amount = num(line.amount);

      if (concept === 'Cesantías') d.cesantiasPagadas += amount;
      else if (concept.startsWith('Intereses sobre cesantías')) d.interesesCesantias += amount;
      else if (concept.startsWith('Prima')) d.prima += amount;
      else if (concept.startsWith('Vacaciones')) d.vacacionesCompensadas += amount;
      else if (concept.startsWith('Indemnización')) d.indemnizacion += amount;
    }

    retencionIndemnizacion += num(t.result?.retencionIndemnizacion);
  }

  for (const k of Object.keys(d) as (keyof IncomeCertificateDetail)[]) {
    d[k] = peso(d[k]);
  }

  const values: Record<BoxKey, number> = {
    salarios:
      d.salarioBasico +
      d.horasExtraRecargos +
      d.incapacidadesLicencias +
      d.vacacionesDisfrutadas +
      d.vacacionesCompensadas,
    bonos: 0,
    honorarios: 0,
    servicios: 0,
    comisiones: 0,
    prestacionesSociales: d.prima,
    viaticos: 0,
    gastosRepresentacion: 0,
    trabajoAsociado: 0,
    otrosPagos: d.auxilioTransporte + d.indemnizacion,
    cesantiasPagadas: d.cesantiasPagadas + d.interesesCesantias,
    cesantiasConsignadas: d.cesantiasConsignadas,
    pensiones: 0,
    totalIngresosBrutos: 0,
    aportesSalud: peso(aportesSalud),
    aportesPensionFsp: peso(aportesPension) + peso(aportesFsp),
    aportesVoluntariosRais: 0,
    aportesVoluntariosPension: 0,
    aportesAfc: 0,
    aportesAvc: 0,
    retencionFuente: peso(retencionNomina) + peso(retencionIndemnizacion),
  };

  values.totalIngresosBrutos = INCOME_CERTIFICATE_BOXES
    .filter(b => b.section === 'INGRESOS' && !b.total)
    .reduce((sum, b) => sum + values[b.key], 0);

  const notes = [
    'Validar con el contador: la numeración de las casillas depende del formulario 220 prescrito por la DIAN para el año gravable; aquí se identifican por concepto.',
    'Salarios incluye salario básico, horas extra y recargos, incapacidades y licencias pagadas por el empleador y vacaciones (disfrutadas y compensadas).',
    'Otros pagos incluye el auxilio de transporte y la indemnización por despido.',
    `Cesantías e intereses: se certifican los del año ${year - 1}, consignados o pagados en ${year}. Los de ${year} van en el certificado de ${year + 1}, salvo los pagados en la liquidación definitiva.`,
  ];

  if (draftCount > 0) {
    notes.push(`Hay ${draftCount} nómina(s) de ${year} en periodos sin cerrar; no se incluyen hasta cerrar el periodo.`);
  }

  if (settlementsCount === 0) {
    notes.push(`No hay nóminas liquidadas en la plataforma para ${year}.`);
  }

  return {
    year,
    settlementsCount,
    detail: d,
    boxes: INCOME_CERTIFICATE_BOXES.map(b => ({ ...b, value: values[b.key] })),
    totals: {
      ingresosBrutos: values.totalIngresosBrutos,
      aportesSalud: values.aportesSalud,
      aportesPension: peso(aportesPension),
      aportesFsp: peso(aportesFsp),
      aportesPensionFsp: values.aportesPensionFsp,
      retencionFuente: values.retencionFuente,
      retencionNomina: peso(retencionNomina),
      retencionIndemnizacion: peso(retencionIndemnizacion),
    },
    notes,
  };
}

/** Periodo certificado: el año, acotado por la fecha de ingreso y la de retiro. */
export function certificatePeriod(
  year: number,
  hireDate?: string | null,
  terminationDate?: string | null
): { from: string; to: string } {
  let from = `${year}-01-01`;
  let to = `${year}-12-31`;

  if (hireDate && hireDate > from && hireDate <= to) from = hireDate;
  if (terminationDate && terminationDate < to && terminationDate >= from) to = terminationDate;

  return { from, to };
}

/** Tipo de contrato según la tabla de la DIAN (nómina electrónica). */
export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  '1': 'Término fijo',
  '2': 'Término indefinido',
  '3': 'Obra o labor',
  '4': 'Aprendizaje',
  '5': 'Prácticas o pasantías',
};

export function contractTypeLabel(code: string | null | undefined): string {
  return CONTRACT_TYPE_LABELS[String(code || '')] || 'No especificado';
}
