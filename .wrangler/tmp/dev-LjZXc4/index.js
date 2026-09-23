var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-nybzzI/checked-fetch.js
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

// .wrangler/tmp/bundle-nybzzI/strip-cf-connecting-ip-header.js
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
    ${payroll.employeeDeductions.fspValue > 0 ? `<FondoSP DeduccionSP="${payroll.employeeDeductions.fspValue.toFixed(2)}"/>` : ""}
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

// src/services/bankDisbursement.ts
var BankDisbursementService = class {
  /**
   * Genera el archivo CSV con la información requerida para el pago masivo o dispersión bancaria
   */
  static generateCSV(payrolls, employeesMap) {
    const headers = ["ID_EMPLEADO", "NOMBRE", "BANCO", "CUENTA", "RFC_NIF", "MONTO_NETO_A_PAGAR"];
    const rows = payrolls.map((p) => {
      const emp = employeesMap.get(p.employeeId);
      return [
        `"${p.employeeId}"`,
        `"${p.employeeName}"`,
        `"${emp?.bankCode || "N/A"}"`,
        `"${emp?.bankAccount || "N/A"}"`,
        `"${emp?.taxId || p.taxId || "N/A"}"`,
        p.netPay.toFixed(2)
      ].join(",");
    });
    return [headers.join(","), ...rows].join("\n");
  }
};
__name(BankDisbursementService, "BankDisbursementService");

// src/index.ts
function sendJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}
__name(sendJson, "sendJson");
var companies = [
  {
    id: "tenant-001",
    name: "Empresa Alfa S.A.S.",
    nit: "900123456",
    dv: "7",
    address: "Calle 5 # 10-20",
    city: "Popay\xE1n",
    department: "Cauca",
    postalCode: "190001",
    phone: "3101234567",
    whatsapp: "3201234567",
    email: "contacto@alfa.com",
    contactName: "Juan P\xE9rez Garc\xEDa",
    legalRepresentative: "Carlos L\xF3pez Rodr\xEDguez",
    taxRegime: "Com\xFAn",
    economicActivity: "4120 - Construcci\xF3n de carreteras y v\xEDas",
    active: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var employees = [
  {
    id: "EMP-001",
    companyId: "tenant-001",
    firstName: "Adriana",
    firstName2: "Mar\xEDa",
    lastName: "Vargas",
    lastName2: "G\xF3mez",
    taxId: "1098765435",
    position: "Analista Senior",
    contractType: "Indefinido",
    salary: 25e5,
    address: "Carrera 8 # 12-34",
    city: "Popay\xE1n",
    country: "Colombia",
    phone: "3101234567",
    whatsapp: "3101234567",
    hireDate: "2024-01-15",
    active: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var getDashboardHtml = /* @__PURE__ */ __name(() => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kreadu Gesti\xF3n-Future | Dashboard N\xF3mina</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #e2e8f0; min-height: 100vh; }
    input, select { color: #fff !important; background: #0f172a !important; border: 1px solid #334155 !important; border-radius: 0.5rem; padding: 0.6rem; font-size: 13px; width: 100%; height: 38px; outline: none; }
    input:focus, select:focus { border-color: #6366f1 !important; }
    label { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.35rem; display: block; }
    .btn { background: #6366f1; color: #fff; border: none; padding: 0.65rem 1.1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; font-size: 13px; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }
    .btn:hover { background: #4f46e5; }
    .btn-secondary { background: #1e293b; color: #cbd5e1; border: 1px solid #334155; }
    .btn-secondary:hover { background: #334155; }
    .btn-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444; }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.3); }
    .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 0.75rem; padding: 1.25rem; }
    .badge { padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 999; overflow-y: auto; }
    .modal-content { background: #0f172a; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; width: 100%; max-width: 700px; margin: auto; }
    pre { background: #020617; border: 1px solid #1e293b; border-radius: 0.5rem; padding: 1rem; overflow-x: auto; font-family: monospace; font-size: 12px; color: #a7f3d0; max-height: 250px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    const DEPARTAMENTOS = [
      'Amazonas', 'Antioquia', 'Arauca', 'Atl\xE1ntico', 'Bol\xEDvar', 'Boyac\xE1', 'Caldas', 
      'Caquet\xE1', 'Casanare', 'Cauca', 'Cesar', 'Choc\xF3', 'C\xF3rdoba', 'Cundinamarca',
      'Guain\xEDa', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nari\xF1o',
      'Norte de Santander', 'Putumayo', 'Quind\xEDo', 'Risaralda', 'Santander', 'Sucre',
      'Tolima', 'Valle del Cauca', 'Vaup\xE9s', 'Vichada'
    ];

    const REGIMENES = ['Com\xFAn', 'Simplificado', 'Contribuyente Especial'];

    const formatCurrency = (val) => {
      if (!val && val !== 0) return '';
      const num = String(val).replace(/\\D/g, '');
      return num ? new Intl.NumberFormat('es-CO').format(parseInt(num, 10)) : '';
    };

    const parseCurrency = (val) => {
      if (!val) return 0;
      return parseInt(String(val).replace(/\\D/g, ''), 10) || 0;
    };

    const Dashboard = () => {
      const [companiesList, setCompaniesList] = useState([]);
      const [selectedCompanyId, setSelectedCompanyId] = useState('');
      const [employeesList, setEmployeesList] = useState([]);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      const [showCompanyModal, setShowCompanyModal] = useState(false);
      const [editingCompany, setEditingCompany] = useState(null);
      const [showEmployeeModal, setShowEmployeeModal] = useState(false);
      const [editingEmployee, setEditingEmployee] = useState(null);

      const [companyForm, setCompanyForm] = useState({
        name: '', nit: '', dv: '', address: '', city: '', department: '',
        postalCode: '', phone: '', whatsapp: '', email: '', contactName: '',
        legalRepresentative: '', taxRegime: 'Com\xFAn', economicActivity: '',
      });

      const [newEmp, setNewEmp] = useState({
        firstName: '', firstName2: '', lastName: '', lastName2: '',
        taxId: '', position: '', address: '', city: '', country: 'Colombia',
        phone: '', whatsapp: '', salaryFormatted: '',
      });

      const [form, setForm] = useState({
        employeeId: 'EMP-001',
        firstName: 'Adriana',
        firstName2: 'Mar\xEDa',
        lastName: 'Vargas',
        lastName2: 'G\xF3mez',
        taxId: '1098765435',
        baseSalaryMonthlyFormatted: '2.500.000',
        daysWorked: 30,
        extraDiurna: 4,
        extraNocturna: 2,
        recargoNocturno: 5,
      });

      const [payrollResult, setPayrollResult] = useState(null);
      const [dianXmlResult, setDianXmlResult] = useState(null);
      const [disbursementResult, setDisbursementResult] = useState(null);

      const fetchCompanies = async () => {
        const res = await fetch('/api/companies');
        const data = await res.json();
        if (data.success) {
          setCompaniesList(data.data);
          if (data.data.length > 0 && !selectedCompanyId) {
            setSelectedCompanyId(data.data[0].id);
          }
        }
      };

      const fetchEmployees = async (companyId) => {
        if (!companyId) return;
        const res = await fetch(\`/api/employees?companyId=\${companyId}\`);
        const data = await res.json();
        if (data.success) setEmployeesList(data.data);
      };

      useEffect(() => { fetchCompanies(); }, []);
      useEffect(() => { if (selectedCompanyId) fetchEmployees(selectedCompanyId); }, [selectedCompanyId]);

      const activeCompany = companiesList.find(c => c.id === selectedCompanyId) || {};

      const handleOpenCreateCompany = () => {
        setEditingCompany(null);
        setCompanyForm({
          name: '', nit: '', dv: '', address: '', city: '', department: '',
          postalCode: '', phone: '', whatsapp: '', email: '', contactName: '',
          legalRepresentative: '', taxRegime: 'Com\xFAn', economicActivity: '',
        });
        setShowCompanyModal(true);
      };

      const handleOpenEditCompany = () => {
        if (!activeCompany.id) return;
        setEditingCompany(activeCompany);
        setCompanyForm({
          name: activeCompany.name || '',
          nit: activeCompany.nit || '',
          dv: activeCompany.dv || '',
          address: activeCompany.address || '',
          city: activeCompany.city || '',
          department: activeCompany.department || '',
          postalCode: activeCompany.postalCode || '',
          phone: activeCompany.phone || '',
          whatsapp: activeCompany.whatsapp || '',
          email: activeCompany.email || '',
          contactName: activeCompany.contactName || '',
          legalRepresentative: activeCompany.legalRepresentative || '',
          taxRegime: activeCompany.taxRegime || 'Com\xFAn',
          economicActivity: activeCompany.economicActivity || '',
        });
        setShowCompanyModal(true);
      };

      const handleSaveCompany = async (e) => {
        e.preventDefault();
        const isEdit = !!editingCompany;
        const url = isEdit ? \`/api/companies/\${editingCompany.id}\` : '/api/companies';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(companyForm),
        });
        const data = await res.json();
        if (res.ok) {
          setShowCompanyModal(false);
          await fetchCompanies();
          if (!isEdit) setSelectedCompanyId(data.data.id);
        }
      };

      const handleDeleteCompany = async () => {
        if (!editingCompany) return;
        if (!confirm(\`\xBFEst\xE1s seguro de eliminar la empresa "\${editingCompany.name}"?\`)) return;

        const res = await fetch(\`/api/companies/\${editingCompany.id}\`, { method: 'DELETE' });
        if (res.ok) {
          setShowCompanyModal(false);
          setSelectedCompanyId('');
          await fetchCompanies();
        }
      };

      const handleOpenCreateEmployee = () => {
        setEditingEmployee(null);
        setNewEmp({
          firstName: '', firstName2: '', lastName: '', lastName2: '',
          taxId: '', position: '', address: '', city: '', country: 'Colombia',
          phone: '', whatsapp: '', salaryFormatted: ''
        });
        setShowEmployeeModal(true);
      };

      const handleOpenEditEmployee = (emp, e) => {
        if (e) e.stopPropagation();
        setEditingEmployee(emp);
        setNewEmp({
          firstName: emp.firstName || '',
          firstName2: emp.firstName2 || '',
          lastName: emp.lastName || '',
          lastName2: emp.lastName2 || '',
          taxId: emp.taxId || '',
          position: emp.position || '',
          address: emp.address || '',
          city: emp.city || '',
          country: emp.country || 'Colombia',
          phone: emp.phone || '',
          whatsapp: emp.whatsapp || '',
          salaryFormatted: formatCurrency(emp.salary || 0)
        });
        setShowEmployeeModal(true);
      };

      const handleSaveEmployee = async (e) => {
        e.preventDefault();
        const isEdit = !!editingEmployee;
        const url = isEdit ? \`/api/employees/\${editingEmployee.id}\` : '/api/employees';
        const method = isEdit ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            ...newEmp, 
            companyId: selectedCompanyId, 
            salary: parseCurrency(newEmp.salaryFormatted) 
          }),
        });
        if (res.ok) {
          setShowEmployeeModal(false);
          setEditingEmployee(null);
          setNewEmp({
            firstName: '', firstName2: '', lastName: '', lastName2: '',
            taxId: '', position: '', address: '', city: '', country: 'Colombia',
            phone: '', whatsapp: '', salaryFormatted: ''
          });
          await fetchEmployees(selectedCompanyId);
        }
      };

      const selectEmployeeForPayroll = (emp) => {
        setForm({
          employeeId: emp.id,
          firstName: emp.firstName || '',
          firstName2: emp.firstName2 || '',
          lastName: emp.lastName || '',
          lastName2: emp.lastName2 || '',
          taxId: emp.taxId || '',
          baseSalaryMonthlyFormatted: formatCurrency(emp.salary || 0),
          daysWorked: 30,
          extraDiurna: 0,
          extraNocturna: 0,
          recargoNocturno: 0,
        });
      };

      const handleCalculatePayroll = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/colombia/payroll/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeInput: {
                employeeId: form.employeeId,
                firstName: form.firstName,
                firstName2: form.firstName2,
                lastName: form.lastName,
                lastName2: form.lastName2,
                taxId: form.taxId,
                baseSalaryMonthly: parseCurrency(form.baseSalaryMonthlyFormatted),
                daysWorked: Number(form.daysWorked) || 30,
                overtimeHours: {
                  extraDiurna: Number(form.extraDiurna) || 0,
                  extraNocturna: Number(form.extraNocturna) || 0,
                  recargoNocturno: Number(form.recargoNocturno) || 0,
                },
              }
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setPayrollResult(data.data);
          setDianXmlResult(null);
          setDisbursementResult(null);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      const handleGenerateDianXml = async () => {
        if (!payrollResult) return;
        setLoading(true);
        try {
          const employerInfo = {
            companyName: activeCompany.name || 'Empresa Alfa S.A.S.',
            nit: activeCompany.nit || '900123456',
            dv: activeCompany.dv || '7',
            cityCode: '19001',
            address: activeCompany.address || 'Calle 5 # 10-20',
          };
          const employeeExtra = {
            typeDocument: '13',
            typeContract: '1',
            highRiskPension: false,
            integralSalary: false,
            payrollPeriod: '5',
            bankName: 'Bancolombia',
            accountType: 'Ahorros',
            accountNumber: '12345678901',
          };

          const res = await fetch('/api/colombia/dian/xml', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employerInfo, payrollData: payrollResult, employeeExtra }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setDianXmlResult(data.data);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      const handleGenerateDisbursement = async () => {
        if (!payrollResult) return;
        setLoading(true);
        try {
          const res = await fetch('/api/colombia/bank-disbursement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyInfo: {
                accountType: 'S',
                accountNumber: '98765432101',
                companyNit: activeCompany.nit || '900123456',
                companyName: activeCompany.name || 'Empresa Alfa S.A.S.',
              },
              records: [
                {
                  employeeId: payrollResult.employeeId,
                  employeeName: \`\${form.firstName} \${form.lastName}\`,
                  employeeTaxId: form.taxId,
                  bankCode: '007',
                  accountType: '47',
                  accountNumber: '12345678901',
                  amount: payrollResult.netPay,
                }
              ]
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setDisbursementResult(data.data);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <header style={{ borderBottom: '1px solid #1e293b', background: '#020617', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <h1 style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>
                Kreadu <span style={{ color: '#6366f1' }}>Gesti\xF3n-Future</span>
              </h1>
              <span className="badge badge-success">Motor Colombia 2026</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ margin: 0 }}>Empresa Activa:</label>
                <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} style={{ width: '220px' }}>
                  {companiesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selectedCompanyId && (
                  <button className="btn btn-secondary" style={{ padding: '0.5rem 0.65rem' }} title="Editar Empresa Activa" onClick={handleOpenEditCompany}>
                    \u270F\uFE0F
                  </button>
                )}
              </div>

              <button className="btn btn-secondary" onClick={handleOpenCreateCompany}>
                \u{1F3E2} + Crear Empresa
              </button>
            </div>
          </header>

          <main style={{ padding: '1.5rem 2rem', flex: 1, display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
            
            {/* EMPLEADOS */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700' }}>\u{1F465} Empleados ({employeesList.length})</h3>
                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '11px' }} onClick={handleOpenCreateEmployee}>
                  + Agregar
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {employeesList.map(emp => (
                  <div key={emp.id} onClick={() => selectEmployeeForPayroll(emp)} style={{ padding: '0.75rem', background: form.employeeId === emp.id ? '#1e1b4b' : '#020617', border: '1px solid #1e293b', borderRadius: '0.5rem', cursor: 'pointer', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: '700', fontSize: '13px' }}>{emp.firstName} {emp.firstName2 || ''} {emp.lastName} {emp.lastName2 || ''}</div>
                      <button className="btn btn-secondary" style={{ padding: '0.2rem 0.4rem', fontSize: '10px', height: 'auto' }} title="Editar Empleado" onClick={(e) => handleOpenEditEmployee(emp, e)}>
                        \u270F\uFE0F
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '0.2rem' }}>CC: {emp.taxId} | \${formatCurrency(emp.salary)}</div>
                    {(emp.city || emp.phone || emp.whatsapp) && (
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '0.25rem' }}>
                        {emp.city ? '\u{1F4CD} ' + emp.city : ''}
                        {emp.phone ? ' | \u260E\uFE0F ' + emp.phone : ''}
                        {emp.whatsapp ? ' | \u{1F4AC} ' + emp.whatsapp : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* FORMULARIO */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '1rem' }}>\u{1F4CB} Datos para Liquidaci\xF3n de N\xF3mina</h3>
              {error && <div style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</div>}
              <form onSubmit={handleCalculatePayroll} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div><label>Primer Nombre *</label><input type="text" value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} required /></div>
                <div><label>Segundo Nombre</label><input type="text" value={form.firstName2} onChange={e => setForm({...form, firstName2: e.target.value})} /></div>
                <div><label>Primer Apellido *</label><input type="text" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} required /></div>
                <div><label>Segundo Apellido</label><input type="text" value={form.lastName2} onChange={e => setForm({...form, lastName2: e.target.value})} /></div>
                <div><label>C\xE9dula *</label><input type="text" value={form.taxId} onChange={e => setForm({...form, taxId: e.target.value})} required /></div>
                <div><label>Salario Mensual (COP) *</label><input type="text" value={form.baseSalaryMonthlyFormatted} onChange={e => setForm({...form, baseSalaryMonthlyFormatted: formatCurrency(e.target.value)})} required /></div>
                <div><label>D\xEDas Trabajados *</label><input type="number" min="1" max="30" value={form.daysWorked} onChange={e => setForm({...form, daysWorked: e.target.value})} required /></div>
                <div><label>Horas Extra Diurnas</label><input type="number" value={form.extraDiurna} onChange={e => setForm({...form, extraDiurna: e.target.value})} /></div>
                <div><label>Horas Extra Nocturnas</label><input type="number" value={form.extraNocturna} onChange={e => setForm({...form, extraNocturna: e.target.value})} /></div>
                <div><label>Recargos Nocturnos (Horas)</label><input type="number" value={form.recargoNocturno} onChange={e => setForm({...form, recargoNocturno: e.target.value})} /></div>

                <div style={{ gridColumn: 'span 2', marginTop: '0.5rem' }}>
                  <button type="submit" className="btn" style={{ width: '100%' }} disabled={loading}>
                    \u26A1 Calcular Liquidaci\xF3n Mensual
                  </button>
                </div>
              </form>
            </div>

            {/* RESULTADOS DETALLADOS */}
            <div className="card">
              <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '1rem' }}>\u{1F4B0} Resultado de Liquidaci\xF3n</h3>
              {payrollResult ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#020617', padding: '0.75rem', borderRadius: '0.5rem' }}>
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>DEVENGADO TOTAL</span>
                      <strong style={{ color: '#38bdf8', fontSize: '14px', display: 'block' }}>\${formatCurrency(payrollResult.grossEarnings)} COP</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>DEDUCCIONES TOTAL</span>
                      <strong style={{ color: '#f87171', fontSize: '14px', display: 'block' }}>-\${formatCurrency(payrollResult.employeeDeductions?.totalDeductions || 0)} COP</strong>
                    </div>
                  </div>

                  {/* DESGLOSE DETALLADO EN PANTALLA */}
                  <div style={{ background: '#020617', padding: '0.85rem', borderRadius: '0.5rem', fontSize: '12px' }}>
                    <div style={{ fontWeight: '700', color: '#6366f1', marginBottom: '0.4rem', textTransform: 'uppercase', fontSize: '11px' }}>\u{1F4CA} Desglose de Devengados</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                      <span style={{ color: '#94a3b8' }}>Salario B\xE1sico ({form.daysWorked} d\xEDas):</span>
                      <span style={{ fontWeight: '600' }}>\${formatCurrency(payrollResult.basicSalaryEarned || 0)}</span>
                    </div>

                    {payrollResult.transportAllowance > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                        <span style={{ color: '#94a3b8' }}>Aux. Transporte / Movilizaci\xF3n:</span>
                        <span style={{ fontWeight: '600' }}>\${formatCurrency(payrollResult.transportAllowance)}</span>
                      </div>
                    )}

                    {payrollResult.overtimeBreakdown && (
                      <>
                        {payrollResult.overtimeBreakdown.extraDiurnaAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                            <span style={{ color: '#94a3b8' }}>H. Extra Diurnas ({form.extraDiurna}h):</span>
                            <span style={{ fontWeight: '600' }}>\${formatCurrency(payrollResult.overtimeBreakdown.extraDiurnaAmount)}</span>
                          </div>
                        )}
                        {payrollResult.overtimeBreakdown.extraNocturnaAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                            <span style={{ color: '#94a3b8' }}>H. Extra Nocturnas ({form.extraNocturna}h):</span>
                            <span style={{ fontWeight: '600' }}>\${formatCurrency(payrollResult.overtimeBreakdown.extraNocturnaAmount)}</span>
                          </div>
                        )}
                        {payrollResult.overtimeBreakdown.recargoNocturnoAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                            <span style={{ color: '#94a3b8' }}>Recargo Nocturno ({form.recargoNocturno}h):</span>
                            <span style={{ fontWeight: '600' }}>\${formatCurrency(payrollResult.overtimeBreakdown.recargoNocturnoAmount)}</span>
                          </div>
                        )}
                      </>
                    )}

                    <div style={{ fontWeight: '700', color: '#6366f1', marginTop: '0.6rem', marginBottom: '0.4rem', textTransform: 'uppercase', fontSize: '11px' }}>\u{1F4C9} Desglose de Deducciones</div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                      <span style={{ color: '#94a3b8' }}>Salud (4%):</span>
                      <span style={{ fontWeight: '600', color: '#f87171' }}>-\${formatCurrency(payrollResult.employeeDeductions?.health || 0)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                      <span style={{ color: '#94a3b8' }}>Pensi\xF3n (4%):</span>
                      <span style={{ fontWeight: '600', color: '#f87171' }}>-\${formatCurrency(payrollResult.employeeDeductions?.pension || 0)}</span>
                    </div>

                    {payrollResult.employeeDeductions?.solidarityFund > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid #1e293b' }}>
                        <span style={{ color: '#94a3b8' }}>Fondo de Solidaridad Pensional:</span>
                        <span style={{ fontWeight: '600', color: '#f87171' }}>-\${formatCurrency(payrollResult.employeeDeductions.solidarityFund)}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ background: '#020617', padding: '0.85rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>NETO A PAGAR AL TRABAJADOR</span>
                    <div style={{ fontSize: '24px', fontWeight: '800', color: '#4ade80', marginTop: '0.15rem' }}>
                      \${formatCurrency(payrollResult.netPay)} COP
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '11px' }} onClick={handleGenerateDianXml} disabled={loading}>
                      \u{1F4C4} Generar XML DIAN
                    </button>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '11px' }} onClick={handleGenerateDisbursement} disabled={loading}>
                      \u{1F3E6} Dispersi\xF3n Bancaria
                    </button>
                  </div>

                  {dianXmlResult && (
                    <div>
                      <label>XML N\xF3mina Electr\xF3nica (CUNE: \${dianXmlResult.cune?.substring(0, 15)}...)</label>
                      <pre>{dianXmlResult.xmlContent}</pre>
                    </div>
                  )}

                  {disbursementResult && (
                    <div>
                      <label>Archivo Dispersi\xF3n Bancolombia (PAB)</label>
                      <pre>{disbursementResult.fileContent}</pre>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Haz clic en "Calcular Liquidaci\xF3n" para ver el resultado detallado.</div>
              )}
            </div>
          </main>

          {/* MODAL CREAR / EDITAR EMPRESA */}
          {showCompanyModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                    \u{1F3E2} \${editingCompany ? 'Editar Empresa' : 'Crear Nueva Empresa'}
                  </h3>
                  <button onClick={() => setShowCompanyModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>\u2715</button>
                </div>

                <form onSubmit={handleSaveCompany} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ gridColumn: 'span 2', marginBottom: '0.5rem' }}>
                    <label style={{ color: '#6366f1', fontWeight: '800', fontSize: '12px' }}>\u{1F4CD} INFORMACI\xD3N B\xC1SICA</label>
                  </div>
                  
                  <div style={{ gridColumn: 'span 2' }}>
                    <label>Nombre / Raz\xF3n Social *</label>
                    <input type="text" value={companyForm.name} onChange={e => setCompanyForm({...companyForm, name: e.target.value})} required />
                  </div>

                  <div>
                    <label>NIT *</label>
                    <input type="text" value={companyForm.nit} onChange={e => setCompanyForm({...companyForm, nit: e.target.value})} required />
                  </div>

                  <div>
                    <label>DV</label>
                    <input type="text" maxLength="1" value={companyForm.dv} onChange={e => setCompanyForm({...companyForm, dv: e.target.value})} />
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '1rem', marginBottom: '0.5rem' }}>
                    <label style={{ color: '#6366f1', fontWeight: '800', fontSize: '12px' }}>\u{1F5FA}\uFE0F UBICACI\xD3N</label>
                  </div>

                  <div>
                    <label>Departamento *</label>
                    <select value={companyForm.department} onChange={e => setCompanyForm({...companyForm, department: e.target.value})} required>
                      <option value="">Selecciona departamento</option>
                      {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <div>
                    <label>Ciudad *</label>
                    <input type="text" value={companyForm.city} onChange={e => setCompanyForm({...companyForm, city: e.target.value})} required />
                  </div>

                  <div>
                    <label>Direcci\xF3n</label>
                    <input type="text" value={companyForm.address} onChange={e => setCompanyForm({...companyForm, address: e.target.value})} />
                  </div>

                  <div>
                    <label>C\xF3digo Postal</label>
                    <input type="text" placeholder="ej: 190001" value={companyForm.postalCode} onChange={e => setCompanyForm({...companyForm, postalCode: e.target.value})} />
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '1rem', marginBottom: '0.5rem' }}>
                    <label style={{ color: '#6366f1', fontWeight: '800', fontSize: '12px' }}>\u{1F4DE} CONTACTO</label>
                  </div>

                  <div>
                    <label>Nombre de Contacto</label>
                    <input type="text" value={companyForm.contactName} onChange={e => setCompanyForm({...companyForm, contactName: e.target.value})} />
                  </div>

                  <div>
                    <label>Tel\xE9fono</label>
                    <input type="tel" placeholder="ej: 3101234567" value={companyForm.phone} onChange={e => setCompanyForm({...companyForm, phone: e.target.value})} />
                  </div>

                  <div>
                    <label>WhatsApp</label>
                    <input type="tel" placeholder="ej: 3201234567" value={companyForm.whatsapp} onChange={e => setCompanyForm({...companyForm, whatsapp: e.target.value})} />
                  </div>

                  <div>
                    <label>Email</label>
                    <input type="email" value={companyForm.email} onChange={e => setCompanyForm({...companyForm, email: e.target.value})} />
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '1rem', marginBottom: '0.5rem' }}>
                    <label style={{ color: '#6366f1', fontWeight: '800', fontSize: '12px' }}>\u{1F4CB} INFORMACI\xD3N FISCAL</label>
                  </div>

                  <div>
                    <label>Representante Legal</label>
                    <input type="text" value={companyForm.legalRepresentative} onChange={e => setCompanyForm({...companyForm, legalRepresentative: e.target.value})} />
                  </div>

                  <div>
                    <label>R\xE9gimen Tributario</label>
                    <select value={companyForm.taxRegime} onChange={e => setCompanyForm({...companyForm, taxRegime: e.target.value})}>
                      {REGIMENES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <label>Actividad Econ\xF3mica</label>
                    <input type="text" placeholder="ej: 4120 - Construcci\xF3n" value={companyForm.economicActivity} onChange={e => setCompanyForm({...companyForm, economicActivity: e.target.value})} />
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn" style={{ flex: 1 }}>
                      \${editingCompany ? '\u{1F4BE} Guardar Cambios' : '\u{1F680} Crear Empresa'}
                    </button>
                    {editingCompany && (
                      <button type="button" className="btn btn-danger" onClick={handleDeleteCompany}>
                        \u{1F5D1}\uFE0F Eliminar Empresa
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* MODAL CREAR / EDITAR EMPLEADO */}
          {showEmployeeModal && (
            <div className="modal-overlay">
              <div className="modal-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                    \u{1F464} \${editingEmployee ? 'Editar Empleado' : 'Agregar Nuevo Empleado'}
                  </h3>
                  <button onClick={() => setShowEmployeeModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>\u2715</button>
                </div>

                <form onSubmit={handleSaveEmployee} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label>Primer Nombre *</label>
                    <input type="text" value={newEmp.firstName} onChange={e => setNewEmp({...newEmp, firstName: e.target.value})} required />
                  </div>
                  <div>
                    <label>Segundo Nombre</label>
                    <input type="text" value={newEmp.firstName2} onChange={e => setNewEmp({...newEmp, firstName2: e.target.value})} />
                  </div>
                  <div>
                    <label>Primer Apellido *</label>
                    <input type="text" value={newEmp.lastName} onChange={e => setNewEmp({...newEmp, lastName: e.target.value})} required />
                  </div>
                  <div>
                    <label>Segundo Apellido</label>
                    <input type="text" value={newEmp.lastName2} onChange={e => setNewEmp({...newEmp, lastName2: e.target.value})} />
                  </div>
                  <div>
                    <label>C\xE9dula / Tax ID *</label>
                    <input type="text" value={newEmp.taxId} onChange={e => setNewEmp({...newEmp, taxId: e.target.value})} required />
                  </div>
                  <div>
                    <label>Cargo / Posici\xF3n</label>
                    <input type="text" value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                  </div>
                  <div>
                    <label>Salario Mensual (COP) *</label>
                    <input type="text" value={newEmp.salaryFormatted} onChange={e => setNewEmp({...newEmp, salaryFormatted: formatCurrency(e.target.value)})} required />
                  </div>
                  <div>
                    <label>Ciudad</label>
                    <input type="text" value={newEmp.city} onChange={e => setNewEmp({...newEmp, city: e.target.value})} />
                  </div>
                  <div>
                    <label>Tel\xE9fono</label>
                    <input type="tel" value={newEmp.phone} onChange={e => setNewEmp({...newEmp, phone: e.target.value})} />
                  </div>
                  <div>
                    <label>WhatsApp</label>
                    <input type="tel" value={newEmp.whatsapp} onChange={e => setNewEmp({...newEmp, whatsapp: e.target.value})} />
                  </div>

                  <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <button type="submit" className="btn" style={{ flex: 1 }}>
                      \${editingEmployee ? '\u{1F4BE} Guardar Cambios' : '\u2795 Agregar Empleado'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowEmployeeModal(false)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      );
    };

    ReactDOM.render(<Dashboard/>, document.getElementById('root'));
    <\/script>
</body>
</html>`, "getDashboardHtml");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/dashboard") {
      return new Response(getDashboardHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (url.pathname === "/api/companies" && request.method === "GET") {
      return sendJson({ success: true, data: companies });
    }
    if (url.pathname === "/api/companies" && request.method === "POST") {
      const body = await request.json();
      const newCompany = {
        id: `tenant-${Date.now()}`,
        name: body.name,
        nit: body.nit,
        dv: body.dv,
        address: body.address,
        city: body.city,
        department: body.department,
        postalCode: body.postalCode,
        phone: body.phone,
        whatsapp: body.whatsapp,
        email: body.email,
        contactName: body.contactName,
        legalRepresentative: body.legalRepresentative,
        taxRegime: body.taxRegime,
        economicActivity: body.economicActivity,
        active: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      companies.push(newCompany);
      return sendJson({ success: true, data: newCompany }, 201);
    }
    if (url.pathname.startsWith("/api/companies/") && request.method === "PUT") {
      const id = url.pathname.split("/")[3];
      const body = await request.json();
      const idx = companies.findIndex((c) => c.id === id);
      if (idx === -1)
        return sendJson({ success: false, error: "Empresa no encontrada" }, 404);
      companies[idx] = { ...companies[idx], ...body };
      return sendJson({ success: true, data: companies[idx] });
    }
    if (url.pathname.startsWith("/api/companies/") && request.method === "DELETE") {
      const id = url.pathname.split("/")[3];
      companies = companies.filter((c) => c.id !== id);
      employees = employees.filter((e) => e.companyId !== id);
      return sendJson({ success: true, message: "Empresa eliminada" });
    }
    if (url.pathname === "/api/employees" && request.method === "GET") {
      const companyId = url.searchParams.get("companyId");
      const filtered = companyId ? employees.filter((e) => e.companyId === companyId) : employees;
      return sendJson({ success: true, data: filtered });
    }
    if (url.pathname === "/api/employees" && request.method === "POST") {
      const body = await request.json();
      const newEmployee = {
        id: `EMP-${Date.now().toString().slice(-4)}`,
        companyId: body.companyId,
        firstName: body.firstName,
        firstName2: body.firstName2,
        lastName: body.lastName,
        lastName2: body.lastName2,
        taxId: body.taxId,
        position: body.position,
        salary: Number(body.salary) || 0,
        address: body.address,
        city: body.city,
        country: body.country || "Colombia",
        phone: body.phone,
        whatsapp: body.whatsapp,
        active: true,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      employees.push(newEmployee);
      return sendJson({ success: true, data: newEmployee }, 201);
    }
    if (url.pathname.startsWith("/api/employees/") && request.method === "PUT") {
      const id = url.pathname.split("/")[3];
      const body = await request.json();
      const idx = employees.findIndex((e) => e.id === id);
      if (idx === -1)
        return sendJson({ success: false, error: "Empleado no encontrado" }, 404);
      employees[idx] = { ...employees[idx], ...body };
      return sendJson({ success: true, data: employees[idx] });
    }
    if (url.pathname === "/api/colombia/payroll/calculate" && request.method === "POST") {
      try {
        const body = await request.json();
        const input = body.employeeInput;
        const baseMonthly = Number(input.baseSalaryMonthly) || 0;
        const daysWorked = Number(input.daysWorked) || 30;
        const hours = input.overtimeHours || {};
        const dailyRate = baseMonthly / 30;
        const basicSalaryEarned = Math.round(dailyRate * daysWorked);
        const hourlyRate = baseMonthly / 240;
        const extraDiurnaAmount = Math.round(hourlyRate * 1.25 * (Number(hours.extraDiurna) || 0));
        const extraNocturnaAmount = Math.round(hourlyRate * 1.75 * (Number(hours.extraNocturna) || 0));
        const recargoNocturnoAmount = Math.round(hourlyRate * 0.35 * (Number(hours.recargoNocturno) || 0));
        const transportAllowance = baseMonthly <= 2847e3 ? Math.round(2e5 / 30 * daysWorked) : 0;
        const grossEarnings = basicSalaryEarned + transportAllowance + extraDiurnaAmount + extraNocturnaAmount + recargoNocturnoAmount;
        const ibc = basicSalaryEarned + extraDiurnaAmount + extraNocturnaAmount + recargoNocturnoAmount;
        const health = Math.round(ibc * 0.04);
        const pension = Math.round(ibc * 0.04);
        const totalDeductions = health + pension;
        const netPay = grossEarnings - totalDeductions;
        const result = {
          employeeId: input.employeeId,
          basicSalaryEarned,
          transportAllowance,
          grossEarnings,
          overtimeBreakdown: {
            extraDiurnaAmount,
            extraNocturnaAmount,
            recargoNocturnoAmount
          },
          employeeDeductions: {
            health,
            pension,
            solidarityFund: 0,
            totalDeductions
          },
          netPay
        };
        return sendJson({ success: true, data: result });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 400);
      }
    }
    if (url.pathname === "/api/colombia/dian/xml" && request.method === "POST") {
      try {
        const body = await request.json();
        const xmlService = new DianNominaXmlService();
        const result = xmlService.generatePayrollXml(
          body.employerInfo,
          body.payrollData,
          body.employeeExtra
        );
        return sendJson({ success: true, data: result });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 400);
      }
    }
    if (url.pathname === "/api/colombia/bank-disbursement" && request.method === "POST") {
      try {
        const body = await request.json();
        const service = new BankDisbursementService();
        const fileContent = service.generateBancolombiaPabFile(
          body.companyInfo,
          body.records
        );
        return sendJson({ success: true, data: { fileContent } });
      } catch (err) {
        return sendJson({ success: false, error: err.message }, 400);
      }
    }
    return sendJson({ error: "Ruta no encontrada" }, 404);
  }
};

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

// .wrangler/tmp/bundle-nybzzI/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-nybzzI/middleware-loader.entry.ts
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
