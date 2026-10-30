import type {
  ColombiaPayrollResult,
  DianEmployerInfo,
  DianEmployeeExtraInfo,
  DianXmlGenerationResult,
} from '../types/payroll';

/** 1 = producción, 2 = pruebas (habilitación). */
export type DianEnvironment = '1' | '2';

export interface DianNominaOptions {
  periodStart?: string;
  periodEnd?: string;
  environment?: DianEnvironment;
}

export const NOMINA_INDIVIDUAL_TIPO_XML = '102';

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

    const consecutive =
      `NE${consecutiveNumber
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
        NOMINA_INDIVIDUAL_TIPO_XML,
        employer.pinSoftware,
        ambiente
      );

    const softwareSC =
      await this.calculateSoftwareSC(
        employer.softwareId,
        employer.pinSoftware,
        consecutive
      );

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

    const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<NominaIndividual
  xmlns="dian:gov:co:facturaelectronica:NominaIndividual"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"
  xmlns:xades141="http://uri.etsi.org/01903/v1.4.1#"
  xmlns:xs="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  SchemaLocation=""
  xsi:schemaLocation="dian:gov:co:facturaelectronica:NominaIndividual NominaIndividualElectronicaXSD.xsd">

  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>

  <Periodo
    FechaIngreso="${this.escapeXml(startDate)}"
    FechaLiquidacionInicio="${this.escapeXml(periodStart)}"
    FechaLiquidacionFin="${this.escapeXml(periodEnd)}"
    TiempoLaborado="${tiempoLaborado}"
    FechaGen="${issueDate}"/>

  <NumeroSecuenciaXML
    CodigoTrabajador="${this.escapeXml(payroll.employeeId)}"
    Prefijo="NE"
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
    Version="V1.0: Documento Soporte de Pago de Nómina Electrónica"
    Ambiente="${ambiente}"
    TipoXML="${NOMINA_INDIVIDUAL_TIPO_XML}"
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

    <Basico
      DiasTrabajados="${payroll.daysWorked}"
      SueldoTrabajado="${payroll.baseSalaryEarned.toFixed(2)}"/>

    ${
      payroll.earnedAuxTransporte > 0
        ? `
    <AuxilioTransporte
      AuxilioTransporte="${payroll.earnedAuxTransporte.toFixed(2)}"/>`
        : ''
    }

    ${
      payroll.extraDiurnaValue > 0
        ? `
    <HorasExtrasDiurnas
      Valor="${payroll.extraDiurnaValue.toFixed(2)}"/>`
        : ''
    }

    ${
      payroll.extraNocturnaValue > 0
        ? `
    <HorasExtrasNocturnas
      Valor="${payroll.extraNocturnaValue.toFixed(2)}"/>`
        : ''
    }

    ${
      payroll.recargoNocturnoValue > 0
        ? `
    <RecargoNocturno
      Valor="${payroll.recargoNocturnoValue.toFixed(2)}"/>`
        : ''
    }

  </Devengados>

  <Deducciones>

    <Salud
      Porcentaje="4.00"
      ValorBase="${payroll.ibcSecuritySocial.toFixed(2)}"
      Deduccion="${payroll.employeeDeductions.health4pct.toFixed(2)}"/>

    <FondoPension
      Porcentaje="4.00"
      ValorBase="${payroll.ibcSecuritySocial.toFixed(2)}"
      Deduccion="${payroll.employeeDeductions.pension4pct.toFixed(2)}"/>

    ${
      payroll.employeeDeductions.fspValue > 0
        ? `
    <FondoSP
      DeduccionSP="${payroll.employeeDeductions.fspValue.toFixed(2)}"/>`
        : ''
    }

  </Deducciones>

  <DevengadosTotal>${totalDevengado.toFixed(2)}</DevengadosTotal>

  <DeduccionesTotal>${totalDeducciones.toFixed(2)}</DeduccionesTotal>

  <ComprobanteTotal>${totalComprobante.toFixed(2)}</ComprobanteTotal>

</NominaIndividual>`.trim();

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
}

export default DianNominaXmlService;
