import type {
  ColombiaPayrollResult,
  DianEmployerInfo,
  DianEmployeeExtraInfo,
  DianXmlGenerationResult,
} from '../types/payroll';

export class DianNominaXmlService {

  public static async calculateCUNE(
    consecutive: string,
    issueDate: string,
    issueTime: string,
    valDevengado: number,
    valDeducciones: number,
    valTotal: number,
    employerNit: string,
    employeeDoc: string,
    pinSoftware: string
  ): Promise<string> {

    const rawString =
      `${consecutive}` +
      `${issueDate}` +
      `${issueTime}` +
      `${valDevengado.toFixed(2)}` +
      `${valDeducciones.toFixed(2)}` +
      `${valTotal.toFixed(2)}` +
      `${employerNit}` +
      `${employeeDoc}` +
      `${pinSoftware}`;

    try {
      const msgBuffer = new TextEncoder().encode(rawString);

      const hashBuffer = await crypto.subtle.digest(
        'SHA-384',
        msgBuffer
      );

      const hashArray = Array.from(
        new Uint8Array(hashBuffer)
      );

      return hashArray
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

    } catch {
      let hash = 0;

      for (let i = 0; i < rawString.length; i++) {
        hash =
          (hash << 5) -
          hash +
          rawString.charCodeAt(i);

        hash |= 0;
      }

      return `cune_simulated_${Math.abs(hash)}_${Date.now()}`;
    }
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
    issueTimeStr?: string
  ): Promise<DianXmlGenerationResult> {

    const issueDate =
      issueDateStr ||
      new Date().toISOString().split('T')[0];

    const issueTime =
      issueTimeStr ||
      `${new Date().toTimeString().split(' ')[0]}-05:00`;

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
        employer.pinSoftware
      );

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
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="dian:gov:co:facturaelectronica:NominaIndividual NominaIndividual.xsd">

  <Novedad CCCNovedad="false"/>

  <Periodo
    FechaIngreso="${this.escapeXml(employeeExtra.startDate || issueDate)}"
    FechaLiquidacionInicio="${issueDate.substring(0, 7)}-01"
    FechaLiquidacionFin="${issueDate.substring(0, 7)}-30"
    TiempoLaborado="${payroll.daysWorked}.00"
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
    SoftwareSC="${cune.substring(0, 40)}"/>

  <CodigoQR>https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cune}</CodigoQR>

  <InformacionGeneral
    Version="V1.0: Documento Soporte de Pago de Nómina Electrónica"
    Ambiente="${employer.testSetId ? '2' : '1'}"
    TipoXML="102"
    CUNE="${cune}"
    EncripCUNE="SHA-384"
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

  <DevengadosTotal>
    ${totalDevengado.toFixed(2)}
  </DevengadosTotal>

  <DeduccionesTotal>
    ${totalDeducciones.toFixed(2)}
  </DeduccionesTotal>

  <ComprobanteTotal>
    ${totalComprobante.toFixed(2)}
  </ComprobanteTotal>

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
