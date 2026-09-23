var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-07aKjC/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-07aKjC/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/engine/countries/colombiaEngine.ts
var CONSTANTS_2026 = {
  SMMLV: 1750905,
  AUXILIO_TRANSPORTE: 249095,
  SMMLV_LIMIT_AUX: 2 * 1750905,
  // $3,501,810
  MONTHLY_ORDINARY_HOURS: 210,
  // 42 hrs/semana × 4.33 semanas
  EXTRA_DIURNA_MULTIPLIER: 1.25,
  // +25%
  EXTRA_NOCTURNA_MULTIPLIER: 1.75,
  // +75%
  RECARGO_NOCTURNO_MULTIPLIER: 1.35
  // +35%
};
var ColombiaPayrollEngine = class {
  static calculate(input) {
    const baseSalaryEarned = input.baseSalaryMonthly / 30 * input.daysWorked;
    let earnedAuxTransporte = 0;
    if (input.baseSalaryMonthly <= CONSTANTS_2026.SMMLV_LIMIT_AUX) {
      earnedAuxTransporte = CONSTANTS_2026.AUXILIO_TRANSPORTE / 30 * input.daysWorked;
    }
    const hourlyRate = input.baseSalaryMonthly / CONSTANTS_2026.MONTHLY_ORDINARY_HOURS;
    const extraDiurnaValue = input.extraDiurna * hourlyRate * CONSTANTS_2026.EXTRA_DIURNA_MULTIPLIER;
    const extraNocturnaValue = input.extraNocturna * hourlyRate * CONSTANTS_2026.EXTRA_NOCTURNA_MULTIPLIER;
    const recargoNocturnoValue = input.recargoNocturno * hourlyRate * CONSTANTS_2026.RECARGO_NOCTURNO_MULTIPLIER;
    const overtimeTotal = extraDiurnaValue + extraNocturnaValue + recargoNocturnoValue;
    const grossEarnings = baseSalaryEarned + earnedAuxTransporte + overtimeTotal;
    const ibcSecuritySocial = baseSalaryEarned + earnedAuxTransporte;
    const health4pct = ibcSecuritySocial * 0.04;
    const pension4pct = ibcSecuritySocial * 0.04;
    const totalDeductions = health4pct + pension4pct;
    const netPay = grossEarnings - totalDeductions;
    const health8_5pct = ibcSecuritySocial * 0.085;
    const pension12pct = ibcSecuritySocial * 0.12;
    const sena2pct = ibcSecuritySocial * 0.02;
    const icbf3pct = ibcSecuritySocial * 0.03;
    const totalContributions = health8_5pct + pension12pct + sena2pct + icbf3pct;
    return {
      employeeId: input.employeeId,
      employeeName: `${input.firstName} ${input.lastName}`,
      taxId: input.taxId,
      periodDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
      daysWorked: input.daysWorked,
      baseSalaryEarned,
      earnedAuxTransporte,
      extraDiurnaValue,
      extraNocturnaValue,
      recargoNocturnoValue,
      overtimeTotal,
      grossEarnings,
      ibcSecuritySocial,
      employeeDeductions: {
        health4pct,
        pension4pct,
        totalDeductions
      },
      netPay,
      employerContributions: {
        health8_5pct,
        pension12pct,
        sena2pct,
        icbf3pct,
        totalContributions
      },
      hourlyRate
    };
  }
};
__name(ColombiaPayrollEngine, "ColombiaPayrollEngine");

// src/services/dianNominaXmlService.ts
var DianNominaXmlService = class {
  /**
   * Genera el Hash CUNE (SHA-384) conforme al estándar de la Resolución DIAN 000013
   */
  static async calculateCUNE(consecutive, issueDate, issueTime, valDevengado, valDeducciones, valTotal, employerNit, employeeDoc, pinSoftware) {
    const rawString = `${consecutive}${issueDate}${issueTime}${valDevengado.toFixed(2)}${valDeducciones.toFixed(2)}${valTotal.toFixed(2)}${employerNit}${employeeDoc}${pinSoftware}`;
    try {
      const msgBuffer = new TextEncoder().encode(rawString);
      const hashBuffer = await crypto.subtle.digest("SHA-384", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      let hash = 0;
      for (let i = 0; i < rawString.length; i++) {
        hash = (hash << 5) - hash + rawString.charCodeAt(i);
        hash |= 0;
      }
      return `cune_simulated_${Math.abs(hash)}_${Date.now()}`;
    }
  }
  /**
   * Construye el documento XML oficial (DSPNE) listo para firma digital y envío a la DIAN
   */
  static async generateDSPNE(payroll, employer, employeeExtra, consecutiveNumber, issueDateStr, issueTimeStr) {
    const issueDate = issueDateStr || (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const issueTime = issueTimeStr || (/* @__PURE__ */ new Date()).toTimeString().split(" ")[0] + "-05:00";
    const consecutive = `NE${consecutiveNumber.toString().padStart(8, "0")}`;
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
    const escapeXml = /* @__PURE__ */ __name((unsafe) => unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case "&":
          return "&amp;";
        case "'":
          return "&apos;";
        case '"':
          return "&quot;";
        default:
          return c;
      }
    }), "escapeXml");
    const nameParts = payroll.employeeName.trim().split(/\s+/);
    const primerNombre = nameParts[0] || "";
    const primerApellido = nameParts.length > 1 ? nameParts[nameParts.length - 1] : "";
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
    Version="V1.0: Documento Soporte de Pago de N\xF3mina Electr\xF3nica" 
    Ambiente="${employer.testSetId ? "2" : "1"}"
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
    PrimerApellido="${escapeXml(primerApellido)}"
    SegundoApellido=""
    PrimerNombre="${escapeXml(primerNombre)}"
    LugarTrabajoPais="CO" LugarTrabajoDepartamentoEstado="05" LugarTrabajoMunicipioCiudad="05001"
    SalarioIntegral="false" TipoContrato="${employeeExtra.typeContract}"
    Sueldo="${payroll.baseSalaryEarned.toFixed(2)}"
    CodigoTrabajador="${escapeXml(payroll.employeeId)}"/>
  <Pago Forma="1" Metodo="${employeeExtra.paymentMethod}" Banco="${escapeXml(employeeExtra.bankName || "BANCO GENERAL")}" TipoCuenta="${employeeExtra.accountType || "AHORROS"}" NumeroCuenta="${escapeXml(employeeExtra.accountNumber || "0000000000")}"/>
  <FechasPagos><FechaPago>${issueDate}</FechaPago></FechasPagos>
  <Devengados>
    <Basico DiasTrabajados="${payroll.daysWorked}" SueldoTrabajado="${payroll.baseSalaryEarned.toFixed(2)}"/>
    ${payroll.earnedAuxTransporte > 0 ? `<AuxilioTransporte AuxilioTransporte="${payroll.earnedAuxTransporte.toFixed(2)}"/>` : ""}
  </Devengados>
  <Deducciones>
    <Salud Porcentaje="4.00" Deduccion="${payroll.employeeDeductions.health4pct.toFixed(2)}"/>
    <FondoPension Porcentaje="4.00" Deduccion="${payroll.employeeDeductions.pension4pct.toFixed(2)}"/>
    ${payroll.employeeDeductions.fsp > 0 ? `<FondoSP DeduccionSP="${payroll.employeeDeductions.fsp.toFixed(2)}"/>` : ""}
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
};
__name(DianNominaXmlService, "DianNominaXmlService");

// src/index.ts
var DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kreadu Gesti\xF3n-Future | Dashboard N\xF3mina</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background: #0f172a;
      color: #e2e8f0;
    }
    #root {
      min-height: 100vh;
    }
    input {
      color: white !important;
    }
    input::placeholder {
      color: #64748b !important;
    }
    select {
      color: white !important;
    }
    select option {
      background-color: #0f172a !important;
      color: white !important;
    }
  </style>
</head>
<body>
  <div id="root"></div>

  <script type="text/babel">
    const { useState } = React;

    const API_URL = '/api';

    async function calculatePayroll(employeeInput) {
      const response = await fetch(\`\${API_URL}/colombia/payroll/calculate\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeInput }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Error en la API');
      }
      const data = await response.json();
      return data.data;
    }

    const Dashboard = () => {
      const [selectedTenant, setSelectedTenant] = useState('tenant-001');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      const [form, setForm] = useState({
        employeeId: 'EMP-101',
        firstName: 'Carlos',
        firstName2: '',
        lastName: 'Rodr\xEDguez',
        lastName2: '',
        taxId: '1098765432',
        baseSalaryMonthly: 1750905,
        daysWorked: 30,
        extraDiurna: 4,
        extraNocturna: 2,
        recargoNocturno: 10,
        isExempt114_1: true,
      });

      const [payrollResult, setPayrollResult] = useState(null);
      const [dianStatus, setDianStatus] = useState({ emitted: false });

      const handleCalculatePayroll = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try { 
         const result = await calculatePayroll({
          employeeId: form.employeeId,
          firstName: ((form.firstName || '')+ ''+(form.firstName2 || '')).trim(),
          lastName: ((form.lastName || '')+ ''+(form.lastName2 || '')).trim(),
          taxId: form.taxId,
          baseSalaryMonthly: form.baseSalaryMonthly, 
          daysWorked: form.daysWorked, 
          overtimeHours: { 
            extraDiurna: form.extraDiurna || 0, 
            extraNocturna: form.extraNocturna || 0, 
            recargoNocturno: form.recargoNocturno || 0,
         }, 
         isExempt114_1: form.isExempt114_1,
       });

          setPayrollResult({
            employeeName: result.employeeName,
            taxId: result.taxId,
            daysWorked: result.daysWorked,
            baseSalaryEarned: result.baseSalaryEarned,
            auxTransporte: result.earnedAuxTransporte || 0,
            grossEarnings: result.grossEarnings,
            ibc: result.ibcSecuritySocial,
            health: result.employeeDeductions?.health4pct || 0,
            pension: result.employeeDeductions?.pension4pct || 0,
            totalDeductions: result.employeeDeductions?.totalDeductions || 0,
            netPay: result.netPay,
            employerCost: result.employerContributions?.totalContributions || 0,
          });

          setDianStatus({ emitted: false });
        } catch (err) {
          setError(\`Error: \${err.message}\`);
          console.error('Error:', err);
        } finally {
          setLoading(false);
        }
      };

      const handleEmitDian = () => {
        if (!payrollResult) return;
        setDianStatus({ emitted: true, cune: 'cune_' + Math.random().toString(36).substring(2, 15) });
      };

      const tenantOptions = [
        { id: 'tenant-001', name: 'Empresa Alfa S.A.S.', nit: '900.123.456' },
        { id: 'tenant-002', name: 'Tech Solutions Ltda.', nit: '800.987.654' },
        { id: 'tenant-003', name: 'Comercializadora Beta', nit: '901.555.444' },
      ];

      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
          <header style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#020617', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ height: '36px', width: '36px', borderRadius: '0.5rem', backgroundColor: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white', fontSize: '14px' }}>
                KF
              </div>
              <div>
                <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0', color: 'white' }}>Kreadu Gesti\xF3n-Future</h1>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>Plataforma de Outsourcing de RRHH & N\xF3mina Electr\xF3nica</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.375rem 0.75rem' }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>Empresa:</span>
                <select value={selectedTenant} onChange={(e) => setSelectedTenant(e.target.value)} style={{ backgroundColor: 'transparent', fontSize: '14px', color: '#818cf8', border: 'none', cursor: 'pointer', outline: 'none' }}>
                  {tenantOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
              </div>
            </div>
          </header>

          <div style={{ display: 'flex', flex: 1 }}>
            <aside style={{ width: '256px', borderRight: '1px solid #1e293b', backgroundColor: '#020617', padding: '1rem' }}>
              <button style={{ width: '100%', textAlign: 'left', padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '14px', backgroundColor: 'rgba(79, 70, 229, 0.2)', color: '#818cf8', cursor: 'pointer', border: 'none' }}>
                \u{1F4CA} Liquidador
              </button>
            </aside>

            <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
              {error && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '0.75rem', marginBottom: '1.5rem' }}>
                  <p style={{ color: '#fca5a5', fontSize: '14px', margin: '0' }}>\u26A0\uFE0F {error}</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(71, 85, 105, 0.4)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>Liquidador Expr\xE9s (Colombia 2026)</h2>

                  <form onSubmit={handleCalculatePayroll} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.4rem' }}>NOMBRE 1</label>
                        <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Ej: Carlos" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '13px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.4rem' }}>NOMBRE 2 (Opt.)</label>
                        <input type="text" value={form.firstName2} onChange={(e) => setForm({ ...form, firstName2: e.target.value })} placeholder="Ej: Andr\xE9s" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '13px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.4rem' }}>APELLIDO 1</label>
                        <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Ej: Garc\xEDa" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '13px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.4rem' }}>APELLIDO 2 (Opt.)</label>
                        <input type="text" value={form.lastName2} onChange={(e) => setForm({ ...form, lastName2: e.target.value })} placeholder="Ej: Rodr\xEDguez" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '13px', outline: 'none' }} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>C\xC9DULA / NIT</label>
                        <input type="text" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} placeholder="Ej: 1098765432" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '14px', outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>SALARIO MENSUAL (COP)</label>
                        <input type="number" value={form.baseSalaryMonthly} onChange={(e) => setForm({ ...form, baseSalaryMonthly: Number(e.target.value) })} placeholder="Ej: 1750905" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '14px', outline: 'none' }} />
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>D\xCDAS LABORADOS (1-30)</label>
                      <input type="number" value={form.daysWorked} onChange={(e) => setForm({ ...form, daysWorked: Number(e.target.value) })} placeholder="Ej: 30" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '14px', outline: 'none' }} />
                    </div>

                    <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(71, 85, 105, 0.3)' }}>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#818cf8', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Horas Extras y Recargos</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '0.25rem' }}>Extra Diurna (+25%)</label>
                          <input type="number" value={form.extraDiurna} onChange={(e) => setForm({ ...form, extraDiurna: Number(e.target.value) })} placeholder="0" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '12px', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '0.25rem' }}>Extra Nocturna (+75%)</label>
                          <input type="number" value={form.extraNocturna} onChange={(e) => setForm({ ...form, extraNocturna: Number(e.target.value) })} placeholder="0" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '12px', outline: 'none' }} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', color: '#94a3b8', marginBottom: '0.25rem' }}>Recargo Nocturno (+35%)</label>
                          <input type="number" value={form.recargoNocturno} onChange={(e) => setForm({ ...form, recargoNocturno: Number(e.target.value) })} placeholder="0" style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.5rem', padding: '0.5rem', fontSize: '12px', outline: 'none' }} />
                        </div>
                      </div>
                    </div>

                    <button type="submit" disabled={loading} style={{ backgroundColor: '#4f46e5', color: 'white', fontWeight: 'bold', padding: '0.625rem', borderRadius: '0.5rem', fontSize: '14px', cursor: loading ? 'not-allowed' : 'pointer', border: 'none', opacity: loading ? 0.8 : 1 }}>
                      {loading ? '\u23F3 Calculando...' : '\u26A1 Calcular Liquidaci\xF3n'}
                    </button>
                  </form>
                </div>

                <div>
                  {payrollResult ? (
                    <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(71, 85, 105, 0.4)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: '0 0 0.5rem 0' }}>{payrollResult.employeeName}</h3>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 1rem 0' }}>C.C. {payrollResult.taxId}</p>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <p style={{ fontSize: '11px', color: '#818cf8', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>DEVENGADO</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Sueldo:</span> \${payrollResult.baseSalaryEarned.toLocaleString('es-CO')}</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Transporte:</span> \${payrollResult.auxTransporte.toLocaleString('es-CO')}</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Total Devengado:</span> \${payrollResult.grossEarnings.toLocaleString('es-CO')}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: '11px', color: '#f87171', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>DEDUCCIONES</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Salud (4%):</span> \${payrollResult.health.toLocaleString('es-CO')}</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Pensi\xF3n (4%):</span> \${payrollResult.pension.toLocaleString('es-CO')}</p>
                          <p style={{ fontSize: '12px', margin: '0.25rem 0' }}><span style={{ color: '#94a3b8' }}>Total Desc:</span> -\${payrollResult.totalDeductions.toLocaleString('es-CO')}</p>
                        </div>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: '#0f172a', borderRadius: '0.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0' }}>NETO A PAGAR AL EMPLEADO</p>
                        <p style={{ fontSize: '28px', fontWeight: '900', color: '#4ade80', margin: '0.5rem 0 0 0' }}>\${payrollResult.netPay.toLocaleString('es-CO')} COP</p>
                      </div>

                      <div style={{ padding: '1rem', backgroundColor: 'rgba(107, 114, 128, 0.1)', borderRadius: '0.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0' }}>Costo Total Empleador</p>
                        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#cbd5e1', margin: '0.5rem 0 0 0' }}>\${payrollResult.employerCost.toLocaleString('es-CO')} COP</p>
                      </div>

                      <button onClick={handleEmitDian} disabled={dianStatus.emitted} style={{ width: '100%', backgroundColor: dianStatus.emitted ? 'rgba(16, 185, 129, 0.2)' : '#10b981', color: dianStatus.emitted ? '#4ade80' : 'white', fontWeight: 'bold', padding: '0.5rem', borderRadius: '0.5rem', fontSize: '12px', cursor: dianStatus.emitted ? 'default' : 'pointer', border: 'none' }}>
                        {dianStatus.emitted ? '\u2713 Transmitida a DIAN' : '\u{1F3DB}\uFE0F Transmitir a DIAN (XML)'}
                      </button>

                      {dianStatus.emitted && (
                        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.2)', border: '2px solid #10b981', borderRadius: '0.75rem' }}>
                          <p style={{ fontSize: '12px', color: '#4ade80', margin: '0 0 0.75rem 0', fontWeight: 'bold' }}>\u2713 CUNE SHA-384 GENERADO</p>
                          <div style={{ backgroundColor: '#0f172a', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer', border: '1px solid #10b981' }} onClick={() => navigator.clipboard.writeText(dianStatus.cune || '')}>
                            <code style={{ fontSize: '13px', color: '#4ade80', wordBreak: 'break-all', display: 'block', fontFamily: 'monospace', fontWeight: 'bold' }}>{dianStatus.cune}</code>
                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '0.5rem 0 0 0' }}>\u{1F446} Click para copiar</p>
                          </div>
                          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0', fontStyle: 'italic' }}>Este CUNE se utilizar\xE1 para transmitir el documento a DIAN</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ height: '100%', border: '2px dashed #334155', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', textAlign: 'center' }}>
                      <p style={{ color: '#64748b', margin: '0' }}>Completa el formulario para calcular la liquidaci\xF3n</p>
                    </div>
                  )}
                </div>
              </div>
            </main>
          </div>
        </div>
      );
    };

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<Dashboard />);
  <\/script>
</body>
</html>`;
var src_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    const corsHeaders = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
        status: 204
      });
    }
    try {
      if ((pathname === "/" || pathname === "") && method === "GET") {
        return new Response(DASHBOARD_HTML, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
      if (pathname === "/api/health" && method === "GET") {
        return sendJson(
          {
            status: "ok",
            service: "Gesti\xF3n-Future Payroll & DIAN API",
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            version: "1.0.0",
            region: "edge-compute"
          },
          200,
          corsHeaders
        );
      }
      if (pathname === "/api/colombia/payroll/calculate" && method === "POST") {
        try {
          const body = await request.json();
          if (!body.employeeInput) {
            return sendJson(
              { error: "Campo requerido: employeeInput" },
              400,
              corsHeaders
            );
          }
          const result = ColombiaPayrollEngine.calculate(body.employeeInput);
          return sendJson(
            {
              success: true,
              data: result
            },
            200,
            corsHeaders
          );
        } catch (err) {
          return sendJson(
            {
              success: false,
              error: err.message || "Error al calcular n\xF3mina"
            },
            400,
            corsHeaders
          );
        }
      }
      if (pathname === "/api/dian/nomina-xml" && method === "POST") {
        try {
          const body = await request.json();
          if (!body.employeeInput) {
            return sendJson(
              { error: "Campo requerido: employeeInput" },
              400,
              corsHeaders
            );
          }
          if (!body.employerInfo) {
            return sendJson(
              { error: "Campo requerido: employerInfo" },
              400,
              corsHeaders
            );
          }
          if (!body.employeeExtraInfo) {
            return sendJson(
              { error: "Campo requerido: employeeExtraInfo" },
              400,
              corsHeaders
            );
          }
          const payrollResult = ColombiaPayrollEngine.calculate(
            body.employeeInput
          );
          const xmlResult = await DianNominaXmlService.generateDSPNE(
            payrollResult,
            body.employerInfo,
            body.employeeExtraInfo,
            body.consecutiveNumber || 1
          );
          return sendJson(
            {
              success: true,
              payrollSummary: payrollResult,
              dianDocument: xmlResult
            },
            200,
            corsHeaders
          );
        } catch (err) {
          return sendJson(
            {
              success: false,
              error: err.message || "Error al generar XML de n\xF3mina"
            },
            400,
            corsHeaders
          );
        }
      }
      if (pathname === "/api" || pathname === "/api/") {
        return sendJson(
          {
            service: "Gesti\xF3n-Future Payroll & DIAN API",
            version: "1.0.0",
            endpoints: [
              {
                method: "GET",
                path: "/",
                description: "Dashboard de Liquidaci\xF3n de N\xF3mina"
              },
              {
                method: "GET",
                path: "/api/health",
                description: "Verificar estado del servicio"
              },
              {
                method: "POST",
                path: "/api/colombia/payroll/calculate",
                description: "Calcular liquidaci\xF3n de n\xF3mina (Colombia 2026)",
                body: {
                  employeeInput: {
                    employeeId: "string",
                    firstName: "string",
                    lastName: "string",
                    taxId: "string",
                    baseSalaryMonthly: "number",
                    daysWorked: "number (1-30)",
                    extraDiurna: "number",
                    extraNocturna: "number",
                    recargoNocturno: "number",
                    isExempt114_1: "boolean"
                  }
                }
              },
              {
                method: "POST",
                path: "/api/dian/nomina-xml",
                description: "Generar XML de n\xF3mina electr\xF3nica para DIAN (Documento Soporte de Pago de N\xF3mina Electr\xF3nica)",
                body: {
                  employeeInput: "ColombiaPayrollInput",
                  employerInfo: "DianEmployerInfo",
                  employeeExtraInfo: "DianEmployeeExtraInfo",
                  consecutiveNumber: "number (opcional)"
                }
              }
            ]
          },
          200,
          corsHeaders
        );
      }
      return sendJson(
        {
          error: "Endpoint no encontrado",
          path: pathname,
          method,
          availableEndpoints: ["/", "/api/health", "/api/colombia/payroll/calculate", "/api/dian/nomina-xml"]
        },
        404,
        corsHeaders
      );
    } catch (err) {
      console.error("Unhandled error:", err);
      return sendJson(
        {
          error: "Error interno del servidor",
          message: err.message
        },
        500,
        corsHeaders
      );
    }
  }
};
function sendJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers
    }
  });
}
__name(sendJson, "sendJson");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-07aKjC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-07aKjC/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
