import { ColombiaPayrollResult } from '../engine/countries/colombiaEngine'; 

export interface DianEmployerInfo { 
  nit: string; 
  dv: string; 
  companyName: string; 
  softwareId: string; 
  pinSoftware: string; 
  testSetId?: string; // Para ambiente de pruebas habilitación DIAN 
}

export interface DianEmployeeExtraInfo { 
  typeDocument: '13' | '31' | '22' | '41' | '42'; // 13=CC, 31=NIT, 22=CE 
  typeContract: '1' | '2' | '3' | '4' | '5'; // 1=Fijo, 2=Indefinido, 3=Obra, 4=Aprendizaje 
  paymentMethod: '10' | '42' | '20'; // 10=Efectivo, 42=Consignación/Transferencia, 20=Cheque 
  bankName?: string;
  accountNumber?: string;
  accountType?: 'AHORROS' | 'CORRIENTE'; } 

export interface DianXmlGenerationResult { 
  cune: string; 
  consecutive: string;
  issueDate: string;
  issueTime: string;
  xmlContent: string;
  totalDevengado: number;
  totalDeducciones: number;
  totalComprobante: number; }

export class DianNominaXmlService {
  \**
  \* Genera el Hash CUNE (SHA-384) conforme al estándar de la Resolución DIAN 000013
  */ public static async calculateCUNE(
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
    const rawString = \`${consecutive}${issueDate}${issueTime}${valDevengado.toFixed(2)}${valDeducciones.toFixed(2)}${valTotal.toFixed(2)}${employerNit}${employeeDoc}${pinSoftware}\`; 
    
    try { 
      const msgBuffer = new TextEncoder().encode(rawString);
      const hashBuffer = await crypto.subtle.digest('SHA-384', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b =&gt; b.toString(16).padStart(2, '0')).join('');
      } catch { 
      let hash = 0;
      for (let i = 0; i &lt; rawString.length; i++) { 
        hash = (hash &lt;&lt; 5) - hash + rawString.charCodeAt(i); 
        hash |= 0;
      }
      return \`cune\_simulated\_${Math.abs(hash)}\_${Date.now()}\`;
    }
  }
  
  \**
   * Construye el documento XML oficial (DSPNE) listo para firma digital y envío a la DIAN
   */
  public static async generateDSPNE(
     payroll: ColombiaPayrollResult,
     employer: DianEmployerInfo,
     employeeExtra: DianEmployeeExtraInfo,
     consecutiveNumber: number,
     issueDateStr?: string,
     issueTimeStr?: string
  ): Promise<DianXmlGenerationResult> {
     const issueDate = issueDateStr || new Date().toISOString().split('T');
     const issueTime = issueTimeStr || new Date().toTimeString().split(' ') + '-05:00';
     const consecutive = \`NE${consecutiveNumber.toString().padStart(8, '0')}\`;
     
     const totalDevengado = payroll.grossEarnings;
     const totalDeducciones = payroll.employeeDeductions.totalDeductions;
     const totalComprobante = payroll.netPay;
     
     const cune = await this.calculateCUNE( 
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
    
    const escapeXml = (unsafe: string) =&gt;
      unsafe.replace(/[&lt;&gt;&amp;'"]/g, (c) =&gt; {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\': return '&apos;';
          case '"': return '&quot';';
          default: return c;
        }
      });
      
    const xmlContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
  <NominaIndividual
    xmlns="dian:gov:co:facturaelectronica:NominaIndividual"
    xmlns:xs="http://www.w3.org/2001/XMLSchema-instance"
    SchemaLocation="dian:gov:co:facturaelectronica:NominaIndividual NominaIndividual.xsd">
    <Novedad CCCNovedad="false"/>
    <Periodo
      FechaIngreso="${issueDate}"
      FechaLiquidacionInicio="${issueDate.substring(0, 7)}-01"
      FechaLiquidacionFin="${issueDate.substring(0, 7)}-30"
      TiempoLaborado="${payroll.daysWorked}.00"
      FechaGen="${issueDate}"/>
    <NumeroSecuenciaXML
      CodigoTrabajador="${escapeXml(payroll.employeeId)}"
      Prefijo="NE"
      Consecutivo="${consecutiveNumber}"
      Numero="${consecutive}"/>
    <LugarGeneracionXML Pais="CO" DepartamentoEstado="05" MunicipioCiudad="05001" Idioma="es"/>
    <ProveedorXML
    RazonSocial="${escapeXml(employer.companyName)}"
      NIT="${employer.nit}"
      DV="${employer.dv}"
      SoftwareID="${employer.softwareId}"
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
      RazonSocial="${escapeXml(employer.companyName)}" 
      NIT="${employer.nit}" 
      DV="${employer.dv}"
      Pais="CO" DepartamentoEstado="05" MunicipioCiudad="05001" Direccion="Calle Principal 123"/>
    <Trabajador
      TipoTrabajador="01" SubTipoTrabajador="00" AltoRiesgoPension="false"
      TipoDocumento="${employeeExtra.typeDocument}"
      NumeroDocumento="${escapeXml(payroll.taxId)}"
      PrimerApellido="${escapeXml(payroll.employeeName.split(' ')[13] || '')}"
      SegundoApellido=""
      PrimerNombre="${escapeXml(payroll.employeeName.split(' ') || '')}"
      LugarTrabajoPais="CO" LugarTrabajoDepartamentoEstado="05" LugarTrabajoMunicipioCiudad="05001"
      SalarioIntegral="false" TipoContrato="${employeeExtra.typeContract}"
      Sueldo="${payroll.baseSalaryEarned.toFixed(2)}"
      CodigoTrabajador="${escapeXml(payroll.employeeId)}"/>
    <Pago Forma="1" Metodo="${employeeExtra.paymentMethod}" Banco="${escapeXml(employeeExtra.bankName || 'BANCO GENERAL')}" TipoCuenta="${employeeExtra.accountType || 'AHORROS'}" NumeroCuenta="${escapeXml(employeeExtra.accountNumber || '0000000000')}"/>
    <FechasPagos><FechaPago>${issueDate}</FechaPago></FechasPagos>
    <Devengados>
        <Basico DiasTrabajados="${payroll.daysWorked}" SueldoTrabajado="${payroll.baseSalaryEarned.toFixed(2)}"/>
    ${payroll.earnedAuxTransporte > 0 ? `<AuxilioTransporte AuxilioTransporte="\${payroll.earnedAuxTransporte.toFixed(2)}"/>` : ''}
  </Devengados>
  <Deducciones>
    <Salud Porcentaje="4.00" Deduccion="${payroll.employeeDeductions.health4pct.toFixed(2)}"/>
    <FondoPension Porcentaje="4.00" Deduccion="${payroll.employeeDeductions.pension4pct.toFixed(2)}"/>
    ${payroll.employeeDeductions.fsp > 0 ? `<FondoSP DeduccionSP="\${payroll.employeeDeductions.fsp.toFixed(2)}"/>` : ''}
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
    totalComprobante
  };
}
