import type {
  ColombiaPayrollResult,
  DianEmployerInfo,
  DianEmployeeExtraInfo,
  DianXmlGenerationResult,
} from '../types/payroll';
import { CONSTANTS_2026 } from '../engine/countries/constants2026';

/** 1 = producción, 2 = pruebas (habilitación). */
export type DianEnvironment = '1' | '2';

export interface DianNominaOptions {
  periodStart?: string;
  periodEnd?: string;
  environment?: DianEnvironment;
  /** Nota de ajuste que reemplaza este documento ya aceptado por la DIAN. */
  replaces?: DianPredecessor;
}

/** Documento aceptado por la DIAN al que se refiere una nota de ajuste. */
export interface DianPredecessor {
  number: string;
  cune: string;
  issueDate: string;
}

export const NOMINA_INDIVIDUAL_TIPO_XML = '102';
export const NOMINA_AJUSTE_TIPO_XML = '103';
export const NOMINA_PREFIX = 'NE';
export const NOMINA_AJUSTE_PREFIX = 'NA';

export const NOMINA_NAMESPACE = 'dian:gov:co:facturaelectronica:NominaIndividual';
export const NOMINA_AJUSTE_NAMESPACE = 'dian:gov:co:facturaelectronica:NominaIndividualDeAjuste';

function rootOpening(rootName: string, namespace: string, xsd: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${rootName}
  xmlns="${namespace}"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xs="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  SchemaLocation=""
  xsi:schemaLocation="${namespace} ${xsd}">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>`;
}

async function sha384Hex(value: string): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-384', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Fecha y hora actuales de Colombia (UTC-5, sin horario de verano). */
function colombiaNow(): { date: string; time: string } {
  const iso = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: `${iso.slice(11, 19)}-05:00` };
}

function lastDayOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${isoDate.substring(0, 7)}-${String(day).padStart(2, '0')}`;
}

/** Días calendario entre dos fechas ISO, ambos inclusive. */
function daysBetweenInclusive(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.floor(ms / 86400000) + 1;
}

// ------------------------------------------------------------
// DEVENGADOS Y DEDUCCIONES DETALLADOS (anexo técnico, Devengados)
// ------------------------------------------------------------

const N = CONSTANTS_2026.RECARGO_NOCTURNO_FACTOR;
const D = CONSTANTS_2026.DOMINICAL_FESTIVO_SURCHARGE;
const ED = CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER;
const EN = CONSTANTS_2026.EXTRA_NOCTURNA_MULTIPLIER;

/**
 * Horas extra y recargos en el orden del esquema. `factor` es lo que se
 * paga sobre el valor hora (los recargos sobre horas ordinarias, cuyo
 * básico ya está en <Basico>, pagan sólo el recargo); `pct` es el
 * Porcentaje del anexo. En domingo/festivo los recargos se suman, como
 * en el motor (dominical 90 % desde el 1-jul-2026, Ley 2466 de 2025).
 */
const SURCHARGE_ITEMS = [
  { group: 'HEDs', tag: 'HED', hours: 'extraDay', factor: ED, pct: ED - 1 },
  { group: 'HENs', tag: 'HEN', hours: 'extraNight', factor: EN, pct: EN - 1 },
  { group: 'HRNs', tag: 'HRN', hours: 'night', factor: N, pct: N },
  { group: 'HEDDFs', tag: 'HEDDF', hours: 'extraSundayDay', factor: ED + D, pct: ED - 1 + D },
  { group: 'HRDDFs', tag: 'HRDDF', hours: 'sunday', factor: D, pct: D },
  { group: 'HENDFs', tag: 'HENDF', hours: 'extraSundayNight', factor: EN + D, pct: EN - 1 + D },
  { group: 'HRNDFs', tag: 'HRNDF', hours: 'sundayNight', factor: N + D, pct: N + D },
] as const;

const cents = (value: number) => Math.round(value * 100) / 100;
const money = (value: number) => cents(value).toFixed(2);

export class DianXmlBalanceError extends Error {}

/**
 * Cantidad de horas de cada tipo. Las liquidaciones guardadas antes del
 * desglose sólo traen valores: se deducen las horas del valor y la tarifa.
 */
function hoursOf(payroll: ColombiaPayrollResult): Record<string, number> {
  if (payroll.hoursBreakdown) return payroll.hoursBreakdown;
  const rate = Number(payroll.hourlyRate) || 0;
  if (!rate) return {};
  const back = (value: number, factor: number) => Math.round((value / (rate * factor)) * 100) / 100;
  return {
    extraDay: back(Number(payroll.extraDiurnaValue) || 0, ED),
    extraNight: back(Number(payroll.extraNocturnaValue) || 0, EN),
    night: back(Number(payroll.recargoNocturnoValue) || 0, N),
    sunday: back(Number(payroll.dominicalFestivoValue) || 0, D),
  };
}

function buildDevengados(payroll: ColombiaPayrollResult): string {
  const rate = Number(payroll.hourlyRate) || 0;
  const hours = hoursOf(payroll);
  const lines: string[] = [];

  let basico = cents(payroll.baseSalaryEarned);
  const transporte = cents(payroll.earnedAuxTransporte);

  const surcharges = SURCHARGE_ITEMS
    .map(item => ({ ...item, qty: Number(hours[item.hours] || 0) }))
    .filter(item => item.qty > 0)
    .map(item => ({ ...item, pago: cents(item.qty * rate * item.factor) }));

  // El valor hora va redondeado a centavos: se cuadra contra lo que pagó el motor.
  const surchargeTarget = cents((Number(payroll.overtimeTotal) || 0) + (Number(payroll.dominicalFestivoValue) || 0));
  const surchargeSum = surcharges.reduce((sum, item) => sum + item.pago, 0);
  const surchargeTolerance = 1 + 0.01 * surcharges.reduce((sum, item) => sum + item.qty * item.factor, 0);
  const surchargeGap = cents(surchargeTarget - surchargeSum);
  if (Math.abs(surchargeGap) > surchargeTolerance || (surchargeGap !== 0 && surcharges.length === 0)) {
    throw new DianXmlBalanceError(
      'Los recargos y horas extra no cuadran con las horas registradas; revisa la liquidación antes de generar el XML.'
    );
  }
  if (surcharges.length) {
    const largest = surcharges.reduce((a, b) => (b.pago > a.pago ? b : a));
    largest.pago = cents(largest.pago + surchargeGap);
  }

  const leaves = payroll.leaveDetails || [];
  const leavesSum = cents(leaves.reduce((sum, leave) => sum + leave.value, 0));

  // Lo que quede (centavos de redondeo) va al básico; más de $1 es un error.
  const detailed = cents(basico + transporte + surchargeTarget + leavesSum);
  const gap = cents(payroll.grossEarnings - detailed);
  if (Math.abs(gap) > 1) {
    throw new DianXmlBalanceError(
      `Los devengados del XML no cuadran con el total pagado (diferencia de $${gap.toFixed(2)}): ` +
        'hay un concepto pagado que el XML no detalla.'
    );
  }
  basico = cents(basico + gap);

  lines.push(`    <Basico DiasTrabajados="${payroll.daysWorked}" SueldoTrabajado="${money(basico)}"/>`);
  if (transporte > 0) lines.push(`    <Transporte AuxilioTransporte="${money(transporte)}"/>`);
  for (const item of surcharges) {
    lines.push(
      `    <${item.group}><${item.tag} Cantidad="${item.qty}" Porcentaje="${(item.pct * 100).toFixed(2)}" Pago="${money(item.pago)}"/></${item.group}>`
    );
  }

  const leaveAttrs = (leave: (typeof leaves)[number]) =>
    (leave.startDate ? ` FechaInicio="${leave.startDate}"` : '') +
    (leave.endDate ? ` FechaFin="${leave.endDate}"` : '') +
    ` Cantidad="${leave.days}"`;
  const vacations = leaves.filter(l => l.type === 'VACATION');
  const incapacities = leaves.filter(l => l.type === 'GENERAL_INCAPACITY' || l.type === 'WORK_INCAPACITY');
  const licenses = leaves.filter(l => l.type === 'MATERNITY_LEAVE' || l.type === 'PATERNITY_LEAVE');

  if (vacations.length) {
    lines.push(`    <Vacaciones>${vacations.map(l => `<VacacionesComunes${leaveAttrs(l)} Pago="${money(l.value)}"/>`).join('')}</Vacaciones>`);
  }
  if (incapacities.length) {
    // Tipo: 1 = común, 3 = laboral (accidente o enfermedad de origen laboral).
    lines.push(`    <Incapacidades>${incapacities
      .map(l => `<Incapacidad${leaveAttrs(l)} Tipo="${l.type === 'WORK_INCAPACITY' ? '3' : '1'}" Pago="${money(l.value)}"/>`)
      .join('')}</Incapacidades>`);
  }
  if (licenses.length) {
    lines.push(`    <Licencias>${licenses.map(l => `<LicenciaMP${leaveAttrs(l)} Pago="${money(l.value)}"/>`).join('')}</Licencias>`);
  }

  return lines.join('\n');
}

function buildDeducciones(payroll: ColombiaPayrollResult): string {
  const d = payroll.employeeDeductions;
  const fsp = cents(d.fspValue || 0);
  const retencion = cents(d.retencionFuente || 0);
  let salud = cents(d.health4pct);
  const pension = cents(d.pension4pct);

  const gap = cents(d.totalDeductions - (salud + pension + fsp + retencion));
  if (Math.abs(gap) > 1) {
    throw new DianXmlBalanceError(
      `Las deducciones del XML no cuadran con el total descontado (diferencia de $${gap.toFixed(2)}).`
    );
  }
  salud = cents(salud + gap);

  const lines = [
    `    <Salud Porcentaje="4.00" ValorBase="${money(payroll.ibcSecuritySocial)}" Deduccion="${money(salud)}"/>`,
    `    <FondoPension Porcentaje="4.00" ValorBase="${money(payroll.ibcSecuritySocial)}" Deduccion="${money(pension)}"/>`,
  ];
  if (fsp > 0) {
    lines.push(`    <FondoSP Porcentaje="${((d.fspPct || 0) * 100).toFixed(2)}" DeduccionSP="${money(fsp)}"/>`);
  }
  if (retencion > 0) lines.push(`    <RetencionFuente>${money(retencion)}</RetencionFuente>`);
  return lines.join('\n');
}

export class DianNominaXmlService {

  /**
   * CUNE según el anexo técnico de nómina electrónica (Res. 000013 de 2021):
   * SHA-384(NumNE + FecNE + HorNE + ValDev + ValDed + ValTolNE + NitNE +
   * DocEmp + TipoXML + SoftwarePin + TipAmb). Si no hay SHA-384 disponible
   * se lanza el error: un CUNE inventado sería rechazado por la DIAN.
   */
  public static async calculateCUNE(
    consecutive: string,
    issueDate: string,
    issueTime: string,
    valDevengado: number,
    valDeducciones: number,
    valTotal: number,
    employerNit: string,
    employeeDoc: string,
    tipoXml: string,
    pinSoftware: string,
    ambiente: DianEnvironment
  ): Promise<string> {
    return sha384Hex(
      `${consecutive}` +
      `${issueDate}` +
      `${issueTime}` +
      `${valDevengado.toFixed(2)}` +
      `${valDeducciones.toFixed(2)}` +
      `${valTotal.toFixed(2)}` +
      `${employerNit}` +
      `${employeeDoc}` +
      `${tipoXml}` +
      `${pinSoftware}` +
      `${ambiente}`
    );
  }

  /** Huella del software: SHA-384(SoftwareID + PIN + número del documento). */
  public static async calculateSoftwareSC(
    softwareId: string,
    pinSoftware: string,
    documentNumber: string
  ): Promise<string> {
    return sha384Hex(`${softwareId}${pinSoftware}${documentNumber}`);
  }

  private static escapeXml(value: string): string {
    return String(value).replace(
      /[<>&'"]/g,
      character => {
        switch (character) {
          case '<':
            return '&lt;';
          case '>':
            return '&gt;';
          case '&':
            return '&amp;';
          case '\'':
            return '&apos;';
          case '"':
            return '&quot;';
          default:
            return character;
        }
      }
    );
  }

  public static async generateDSPNE(
    payroll: ColombiaPayrollResult,
    employer: DianEmployerInfo,
    employeeExtra: DianEmployeeExtraInfo,
    consecutiveNumber: number,
    issueDateStr?: string,
    issueTimeStr?: string,
    options: DianNominaOptions = {}
  ): Promise<DianXmlGenerationResult> {

    const now = colombiaNow();
    const issueDate = issueDateStr || now.date;
    const issueTime = issueTimeStr || now.time;
    const ambiente: DianEnvironment = options.environment || '2';

    const periodStart = options.periodStart || `${issueDate.substring(0, 7)}-01`;
    const periodEnd = options.periodEnd || lastDayOfMonth(periodStart);
    const startDate = employeeExtra.startDate || periodStart;
    const tiempoLaborado = Math.max(1, daysBetweenInclusive(startDate, periodEnd));

    // Nota de ajuste tipo 1 (Reemplazar): el mismo contenido de la
    // nómina, con su propia serie NA y la referencia al documento aceptado.
    const replaces = options.replaces;
    const tipoXml = replaces ? NOMINA_AJUSTE_TIPO_XML : NOMINA_INDIVIDUAL_TIPO_XML;
    const prefix = replaces ? NOMINA_AJUSTE_PREFIX : NOMINA_PREFIX;

    const consecutive =
      `${prefix}${consecutiveNumber
        .toString()
        .padStart(8, '0')}`;

    const totalDevengado =
      payroll.grossEarnings;

    const totalDeducciones =
      payroll.employeeDeductions.totalDeductions;

    const totalComprobante =
      payroll.netPay;

    const cune =
      await this.calculateCUNE(
        consecutive,
        issueDate,
        issueTime,
        totalDevengado,
        totalDeducciones,
        totalComprobante,
        employer.nit,
        payroll.taxId,
        tipoXml,
        employer.pinSoftware,
        ambiente
      );

    const softwareSC =
      await this.calculateSoftwareSC(
        employer.softwareId,
        employer.pinSoftware,
        consecutive
      );

    const devengadosXml = buildDevengados(payroll);
    const deduccionesXml = buildDeducciones(payroll);

    const qrBase = ambiente === '1'
      ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='
      : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=';

    const primerNombre =
      payroll.firstName || '';

    const segundoNombre =
      payroll.firstName2 || '';

    const primerApellido =
      payroll.lastName || '';

    const segundoApellido =
      payroll.lastName2 || '';

    const departmentCode =
      employeeExtra.departmentCode || '05';

    const municipalityCode =
      employeeExtra.municipalityCode || '001';

    const fullMunicipalityCode =
      `${departmentCode}${municipalityCode}`;

    const opening = replaces
      ? `${rootOpening('NominaIndividualDeAjuste', NOMINA_AJUSTE_NAMESPACE, 'NominaIndividualDeAjusteElectronicaXSD.xsd')}

  <TipoNota>1</TipoNota>

  <Reemplazar>

  <ReemplazandoPredecesor
    NumeroPred="${this.escapeXml(replaces.number)}"
    CUNEPred="${this.escapeXml(replaces.cune)}"
    FechaGenPred="${this.escapeXml(replaces.issueDate)}"/>`
      : rootOpening('NominaIndividual', NOMINA_NAMESPACE, 'NominaIndividualElectronicaXSD.xsd');
    const closing = replaces ? '  </Reemplazar>\n\n</NominaIndividualDeAjuste>' : '</NominaIndividual>';

    const xmlContent = `${opening}

  <Periodo
    FechaIngreso="${this.escapeXml(startDate)}"
    FechaLiquidacionInicio="${this.escapeXml(periodStart)}"
    FechaLiquidacionFin="${this.escapeXml(periodEnd)}"
    TiempoLaborado="${tiempoLaborado}"
    FechaGen="${issueDate}"/>

  <NumeroSecuenciaXML
    CodigoTrabajador="${this.escapeXml(payroll.employeeId)}"
    Prefijo="${prefix}"
    Consecutivo="${consecutiveNumber}"
    Numero="${consecutive}"/>

  <LugarGeneracionXML
    Pais="CO"
    DepartamentoEstado="${this.escapeXml(departmentCode)}"
    MunicipioCiudad="${this.escapeXml(fullMunicipalityCode)}"
    Idioma="es"/>

  <ProveedorXML
    RazonSocial="${this.escapeXml(employer.companyName)}"
    NIT="${this.escapeXml(employer.nit)}"
    DV="${this.escapeXml(employer.dv)}"
    SoftwareID="${this.escapeXml(employer.softwareId)}"
    SoftwareSC="${softwareSC}"/>

  <CodigoQR>${qrBase}${cune}</CodigoQR>

  <InformacionGeneral
    Version="${replaces
      ? 'V1.0: Nota de Ajuste de Documento Soporte de Pago de Nómina Electrónica'
      : 'V1.0: Documento Soporte de Pago de Nómina Electrónica'}"
    Ambiente="${ambiente}"
    TipoXML="${tipoXml}"
    CUNE="${cune}"
    EncripCUNE="CUNE-SHA384"
    FechaGen="${issueDate}"
    HoraGen="${issueTime}"
    PeriodoNomina="5"
    TipoMoneda="COP"/>

  <Empleador
    RazonSocial="${this.escapeXml(employer.companyName)}"
    NIT="${this.escapeXml(employer.nit)}"
    DV="${this.escapeXml(employer.dv)}"
    Pais="${this.escapeXml(employer.country || 'CO')}"
    DepartamentoEstado="${this.escapeXml(employer.department || departmentCode)}"
    MunicipioCiudad="${this.escapeXml(fullMunicipalityCode)}"
    Direccion="${this.escapeXml(employer.address || 'Dirección registrada')}"/>

  <Trabajador
    TipoTrabajador="01"
    SubTipoTrabajador="00"
    AltoRiesgoPension="false"
    TipoDocumento="${this.escapeXml(employeeExtra.typeDocument)}"
    NumeroDocumento="${this.escapeXml(payroll.taxId)}"
    PrimerApellido="${this.escapeXml(primerApellido)}"
    SegundoApellido="${this.escapeXml(segundoApellido)}"
    PrimerNombre="${this.escapeXml(primerNombre)}"
    SegundoNombre="${this.escapeXml(segundoNombre)}"
    LugarTrabajoPais="CO"
    LugarTrabajoDepartamentoEstado="${this.escapeXml(departmentCode)}"
    LugarTrabajoMunicipioCiudad="${this.escapeXml(fullMunicipalityCode)}"
    SalarioIntegral="false"
    TipoContrato="${this.escapeXml(employeeExtra.typeContract)}"
    Sueldo="${payroll.baseSalaryEarned.toFixed(2)}"
    CodigoTrabajador="${this.escapeXml(payroll.employeeId)}"/>

  <Pago
    Forma="1"
    Metodo="${this.escapeXml(employeeExtra.paymentMethod)}"
    Banco="${this.escapeXml(employeeExtra.bankName || 'BANCO GENERAL')}"
    TipoCuenta="${this.escapeXml(employeeExtra.accountType || 'AHORROS')}"
    NumeroCuenta="${this.escapeXml(employeeExtra.accountNumber || '0000000000')}"/>

  <FechasPagos>
    <FechaPago>${issueDate}</FechaPago>
  </FechasPagos>

  <Devengados>
${devengadosXml}
  </Devengados>

  <Deducciones>
${deduccionesXml}
  </Deducciones>

  <DevengadosTotal>${totalDevengado.toFixed(2)}</DevengadosTotal>

  <DeduccionesTotal>${totalDeducciones.toFixed(2)}</DeduccionesTotal>

  <ComprobanteTotal>${totalComprobante.toFixed(2)}</ComprobanteTotal>

${closing}`.trim();

    return {
      cune,
      consecutive,
      issueDate,
      issueTime,
      xmlContent,
      totalDevengado,
      totalDeducciones,
      totalComprobante,
    };
  }

  /**
   * Nota de ajuste tipo 2 (Eliminar): anula ante la DIAN un documento
   * ya aceptado. No lleva trabajador ni valores; en el CUNE los valores
   * van en 0.00 y el documento del trabajador en 0 (confirmar en
   * habilitación).
   */
  public static async generateDeletion(
    predecessor: DianPredecessor,
    employer: DianEmployerInfo,
    consecutiveNumber: number,
    options: { environment?: DianEnvironment; departmentCode?: string; municipalityCode?: string } = {},
    issueDateStr?: string,
    issueTimeStr?: string
  ): Promise<DianXmlGenerationResult> {
    const now = colombiaNow();
    const issueDate = issueDateStr || now.date;
    const issueTime = issueTimeStr || now.time;
    const ambiente: DianEnvironment = options.environment || '2';
    const consecutive = `${NOMINA_AJUSTE_PREFIX}${consecutiveNumber.toString().padStart(8, '0')}`;

    const cune = await this.calculateCUNE(
      consecutive, issueDate, issueTime, 0, 0, 0,
      employer.nit, '0', NOMINA_AJUSTE_TIPO_XML, employer.pinSoftware, ambiente
    );
    const softwareSC = await this.calculateSoftwareSC(employer.softwareId, employer.pinSoftware, consecutive);

    const departmentCode = options.departmentCode || '05';
    const fullMunicipalityCode = `${departmentCode}${options.municipalityCode || '001'}`;
    const qrBase = ambiente === '1'
      ? 'https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey='
      : 'https://catalogo-vpfe-hab.dian.gov.co/document/searchqr?documentkey=';

    const xmlContent = `${rootOpening('NominaIndividualDeAjuste', NOMINA_AJUSTE_NAMESPACE, 'NominaIndividualDeAjusteElectronicaXSD.xsd')}

  <TipoNota>2</TipoNota>

  <Eliminar>

  <EliminandoPredecesor
    NumeroPred="${this.escapeXml(predecessor.number)}"
    CUNEPred="${this.escapeXml(predecessor.cune)}"
    FechaGenPred="${this.escapeXml(predecessor.issueDate)}"/>

  <NumeroSecuenciaXML
    Prefijo="${NOMINA_AJUSTE_PREFIX}"
    Consecutivo="${consecutiveNumber}"
    Numero="${consecutive}"/>

  <LugarGeneracionXML
    Pais="CO"
    DepartamentoEstado="${this.escapeXml(departmentCode)}"
    MunicipioCiudad="${this.escapeXml(fullMunicipalityCode)}"
    Idioma="es"/>

  <ProveedorXML
    RazonSocial="${this.escapeXml(employer.companyName)}"
    NIT="${this.escapeXml(employer.nit)}"
    DV="${this.escapeXml(employer.dv)}"
    SoftwareID="${this.escapeXml(employer.softwareId)}"
    SoftwareSC="${softwareSC}"/>

  <CodigoQR>${qrBase}${cune}</CodigoQR>

  <InformacionGeneral
    Version="V1.0: Nota de Ajuste de Documento Soporte de Pago de Nómina Electrónica"
    Ambiente="${ambiente}"
    TipoXML="${NOMINA_AJUSTE_TIPO_XML}"
    CUNE="${cune}"
    EncripCUNE="CUNE-SHA384"
    FechaGen="${issueDate}"
    HoraGen="${issueTime}"/>

  <Empleador
    RazonSocial="${this.escapeXml(employer.companyName)}"
    NIT="${this.escapeXml(employer.nit)}"
    DV="${this.escapeXml(employer.dv)}"
    Pais="${this.escapeXml(employer.country || 'CO')}"
    DepartamentoEstado="${this.escapeXml(employer.department || departmentCode)}"
    MunicipioCiudad="${this.escapeXml(fullMunicipalityCode)}"
    Direccion="${this.escapeXml(employer.address || 'Dirección registrada')}"/>

  </Eliminar>

</NominaIndividualDeAjuste>`.trim();

    return {
      cune,
      consecutive,
      issueDate,
      issueTime,
      xmlContent,
      totalDevengado: 0,
      totalDeducciones: 0,
      totalComprobante: 0,
    };
  }
}

export default DianNominaXmlService;
