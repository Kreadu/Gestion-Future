export interface DashboardFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
}

export function getDashboardHtml(
  firebaseConfig: DashboardFirebaseConfig
): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Kreadu Gestión-Future | Dashboard Nómina</title>

  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
  <script>
    window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig)};
  </script>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #07111f;
      color: #e5edf7;
    }

    button,
    input,
    select {
      font: inherit;
    }

    button {
      cursor: pointer;
    }

    .app {
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(30, 64, 175, .18), transparent 30%),
        radial-gradient(circle at bottom right, rgba(6, 182, 212, .10), transparent 28%),
        #07111f;
    }

    .header {
      min-height: 76px;
      padding: 14px 24px;
      border-bottom: 1px solid #1d3047;
      background: rgba(7, 17, 31, .96);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      position: sticky;
      top: 0;
      z-index: 20;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 13px;
      min-width: 250px;
    }

    .brand-logo {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #06b6d4);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      color: white;
    }

    .brand h1 {
      margin: 0;
      font-size: 18px;
    }

    .brand p {
      margin: 3px 0 0;
      color: #8193aa;
      font-size: 12px;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .badge {
      padding: 7px 11px;
      border: 1px solid #245174;
      background: rgba(8, 47, 73, .55);
      border-radius: 999px;
      color: #67e8f9;
      font-size: 12px;
      font-weight: 700;
    }

    .company-selector {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .company-selector select {
      min-width: 220px;
    }

    .layout {
      display: grid;
      grid-template-columns: 310px minmax(420px, 1fr) 390px;
      min-height: calc(100vh - 76px);
    }

    .panel {
      border-right: 1px solid #1d3047;
      min-width: 0;
    }

    .panel:last-child {
      border-right: none;
    }

    .panel-header {
      padding: 18px 18px 14px;
      border-bottom: 1px solid #1d3047;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .panel-header h2 {
      font-size: 14px;
      margin: 0;
    }

    .panel-header span {
      color: #6f839b;
      font-size: 12px;
    }

    .panel-body {
      padding: 18px;
    }

    .employee-list {
      padding: 10px;
    }

    .employee-card {
      padding: 13px;
      margin-bottom: 8px;
      border: 1px solid #1c3047;
      border-radius: 11px;
      background: #0b1829;
      transition: .15s ease;
      cursor: pointer;
    }

    .employee-card:hover,
    .employee-card.selected {
      border-color: #2563eb;
      background: #0e2036;
    }

    .employee-name {
      font-weight: 700;
      font-size: 13px;
    }

    .employee-meta {
      color: #7890a9;
      font-size: 11px;
      margin-top: 5px;
      line-height: 1.5;
    }

    .employee-salary {
      color: #67e8f9;
      font-size: 12px;
      font-weight: 700;
      margin-top: 8px;
    }

    .empty {
      color: #6f839b;
      text-align: center;
      padding: 40px 20px;
      font-size: 13px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 13px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group.full {
      grid-column: 1 / -1;
    }

    label {
      font-size: 11px;
      color: #8fa2b8;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .03em;
    }

    input,
    select {
      width: 100%;
      padding: 10px 11px;
      border: 1px solid #253a53;
      border-radius: 8px;
      background: #091625;
      color: #e5edf7;
      outline: none;
    }

    input:focus,
    select:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, .12);
    }

    input:disabled,
    select:disabled {
      opacity: .65;
    }

    .button-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 17px;
    }

    .btn {
      border: 1px solid #29415d;
      background: #102238;
      color: #dbeafe;
      border-radius: 8px;
      padding: 9px 13px;
      font-size: 12px;
      font-weight: 700;
    }

    .btn:hover {
      border-color: #3b82f6;
    }

    .btn-primary {
      background: #2563eb;
      border-color: #2563eb;
      color: white;
    }

    .btn-primary:hover {
      background: #1d4ed8;
    }

    .btn-success {
      background: #047857;
      border-color: #059669;
      color: white;
    }

    .btn-danger {
      background: rgba(127, 29, 29, .35);
      border-color: #7f1d1d;
      color: #fecaca;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 800;
      color: #c5d5e8;
      margin-bottom: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .info-box {
      border: 1px solid #203750;
      background: #0a1727;
      padding: 12px;
      border-radius: 9px;
      font-size: 12px;
      color: #94a9c0;
    }

    .selected-employee {
      border: 1px solid #164e63;
      background: rgba(8, 47, 73, .30);
      padding: 12px;
      border-radius: 9px;
      margin-bottom: 18px;
    }

    .selected-employee strong {
      color: #67e8f9;
    }

    .result-summary {
      padding: 18px;
      border-bottom: 1px solid #1d3047;
      background: linear-gradient(180deg, rgba(13, 39, 66, .55), rgba(7, 17, 31, 0));
    }

    .result-label {
      color: #7890a9;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
    }

    .net-pay {
      font-size: 29px;
      font-weight: 900;
      color: #67e8f9;
      margin-top: 4px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-top: 14px;
    }

    .summary-card {
      border: 1px solid #203750;
      border-radius: 9px;
      padding: 11px;
      background: #0a1727;
    }

    .summary-card span {
      display: block;
      color: #70869e;
      font-size: 10px;
      margin-bottom: 5px;
    }

    .summary-card strong {
      font-size: 13px;
    }

    .result-body {
      padding: 18px;
      overflow-y: auto;
      max-height: calc(100vh - 260px);
    }

    .result-row {
      display: flex;
      justify-content: space-between;
      gap: 15px;
      padding: 8px 0;
      border-bottom: 1px solid #15263a;
      font-size: 12px;
    }

    .result-row span:first-child {
      color: #8ca0b5;
    }

    .result-row strong {
      color: #dbeafe;
    }

    .result-section {
      margin-bottom: 18px;
    }

    .result-section h3 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #c7d8ea;
    }

    pre {
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 280px;
      overflow: auto;
      background: #050d17;
      border: 1px solid #1c3047;
      border-radius: 8px;
      padding: 10px;
      font-size: 10px;
      color: #9fb3c8;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, .68);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .modal {
      width: min(720px, 100%);
      max-height: 90vh;
      overflow-y: auto;
      border: 1px solid #29415d;
      border-radius: 14px;
      background: #091625;
      box-shadow: 0 25px 70px rgba(0, 0, 0, .45);
    }

    .modal-header {
      padding: 17px 19px;
      border-bottom: 1px solid #1d3047;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 15px;
    }

    .modal-body {
      padding: 19px;
    }

    .modal-footer {
      padding: 14px 19px;
      border-top: 1px solid #1d3047;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .alert {
      margin: 14px 18px;
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid #7f1d1d;
      background: rgba(127, 29, 29, .2);
      color: #fecaca;
      font-size: 12px;
    }

    .success {
      border-color: #065f46;
      background: rgba(6, 95, 70, .18);
      color: #a7f3d0;
    }

    @media (max-width: 1250px) {
      .layout {
        grid-template-columns: 280px minmax(400px, 1fr);
      }

      .layout > .panel:nth-child(3) {
        grid-column: 1 / -1;
        border-top: 1px solid #1d3047;
      }

      .result-body {
        max-height: none;
      }
    }

    @media (max-width: 850px) {
      .header {
        align-items: flex-start;
        flex-direction: column;
      }

      .header-right {
        width: 100%;
        justify-content: flex-start;
      }

      .layout {
        display: block;
      }

      .panel {
        border-right: none;
        border-bottom: 1px solid #1d3047;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .form-group.full {
        grid-column: auto;
      }
    }
  </style>
</head>

<body>
<div id="root"></div>

<script type="text/babel">
const { useEffect, useState } = React;

firebase.initializeApp(window.__FIREBASE_CONFIG__);

const ROLE_LABELS = {
  SUPER_ADMIN: 'Administrador Kreadu',
  TENANT_ADMIN: 'Administrador de empresa',
  EMPLOYEE: 'Empleado'
};

const VINCULATION_LABELS = {
  INDEPENDENT_SERVICES: 'Contratista independiente',
  PART_TIME_EMPLOYEE: 'Empleado jornada parcial',
  EST_MISSION: 'Trabajador en misión (EST)'
};

function formatCOP(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

async function api(url, options) {
  const opts = options ? { ...options } : {};
  const currentUser = firebase.auth().currentUser;

  if (currentUser) {
    const token = await currentUser.getIdToken();

    opts.headers = {
      ...(opts.headers || {}),
      Authorization: 'Bearer ' + token
    };
  }

  const response = await fetch(url, opts);
  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || 'Error en la solicitud');
  }

  return data;
}

function LoginScreen({ error, loading, onSignIn }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07111f',
        color: '#e5edf7',
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: '20px'
      }}
    >
      <div
        style={{
          width: 'min(380px, 100%)',
          border: '1px solid #1d3047',
          borderRadius: '14px',
          background: '#0b1829',
          padding: '32px 28px',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            margin: '0 auto 18px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '900',
            fontSize: '22px'
          }}
        >
          K
        </div>

        <h1 style={{ fontSize: '18px', margin: '0 0 6px' }}>
          Kreadu Gestión-Future
        </h1>

        <p style={{ color: '#8193aa', fontSize: '13px', margin: '0 0 24px' }}>
          Inicia sesión para gestionar la nómina de tu empresa.
        </p>

        {error && (
          <div
            style={{
              marginBottom: '18px',
              padding: '11px 13px',
              borderRadius: '8px',
              border: '1px solid #7f1d1d',
              background: 'rgba(127, 29, 29, .2)',
              color: '#fecaca',
              fontSize: '12px',
              textAlign: 'left'
            }}
          >
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onSignIn}
          disabled={loading}
        >
          {loading ? 'Conectando...' : '🔐 Iniciar sesión con Google'}
        </button>
      </div>
    </div>
  );
}

function Root() {
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState('');

  useEffect(function() {
    const unsubscribe = firebase.auth().onAuthStateChanged(async function(user) {
      setFirebaseUser(user);
      setAuthError('');

      if (!user) {
        setMe(null);
        setAuthLoading(false);
        return;
      }

      try {
        const result = await api('/api/me');
        setMe(result.data);
      } catch (err) {
        setMe(null);
        setAuthError(err.message);
      } finally {
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  async function signIn() {
    try {
      setAuthError('');
      setSigningIn(true);

      const provider = new firebase.auth.GoogleAuthProvider();
      await firebase.auth().signInWithPopup(provider);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    await firebase.auth().signOut();
    setMe(null);
  }

  if (authLoading) {
    return <LoginScreen loading={true} error="" onSignIn={signIn} />;
  }

  if (!firebaseUser || !me) {
    return (
      <LoginScreen
        loading={signingIn}
        error={authError}
        onSignIn={signIn}
      />
    );
  }

  return <App me={me} onSignOut={signOut} />;
}

function App({ me, onSignOut }) {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);

  const [companyModal, setCompanyModal] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(false);

  const [editingCompany, setEditingCompany] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [companyForm, setCompanyForm] = useState({
    logo: '',
    name: '',
    nit: '',
    dv: '',
    address: '',
    city: 'Popayán',
    department: 'Cauca',
    postalCode: '190001',
    phone: '',
    whatsapp: '',
    email: '',
    contactName: '',
    legalRepresentative: '',
    taxRegime: 'ORDINARIO',
    economicActivity: ''
  });

  const [employeeForm, setEmployeeForm] = useState({
    firstName: '',
    firstName2: '',
    lastName: '',
    lastName2: '',
    taxId: '',
    position: '',
    contractType: '1',
    salary: '',
    address: '',
    city: 'Popayán',
    country: 'Colombia',
    phone: '',
    whatsapp: '',
    hireDate: '',
    bankName: '',
    bankAccountType: 'AHORROS',
    bankAccountNumber: ''
  });

  const [payrollForm, setPayrollForm] = useState({
    employeeId: '',
    baseSalary: '',
    daysWorked: 30,
    extraDiurna: 0,
    extraNocturna: 0,
    recargoNocturno: 0
  });

  const [payrollResult, setPayrollResult] = useState(null);
  const [dianXmlResult, setDianXmlResult] = useState(null);
  const [showPayrollPreview, setShowPayrollPreview] = useState(false);
  const [disbursementResult, setDisbursementResult] = useState(null);
  const [currentSettlementId, setCurrentSettlementId] = useState('');
  const [currentSettlementStatus, setCurrentSettlementStatus] = useState('');

  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [settlements, setSettlements] = useState([]);
  const [periodModal, setPeriodModal] = useState(false);
  const [periodForm, setPeriodForm] = useState({ periodStart: '', periodEnd: '' });

  // ------------------------------------------------------------
  // PERSONAL POR HORAS (bolsa de talento)
  // ------------------------------------------------------------

  const [activeSection, setActiveSection] = useState('payroll');

  const [professionalQuery, setProfessionalQuery] = useState('');
  const [professionalResults, setProfessionalResults] = useState([]);
  const [searchingProfessionals, setSearchingProfessionals] = useState(false);

  const [engagements, setEngagements] = useState([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState('');

  const [professionalModal, setProfessionalModal] = useState(false);
  const [professionalForm, setProfessionalForm] = useState({
    firstName: '',
    firstName2: '',
    lastName: '',
    lastName2: '',
    taxId: '',
    profession: '',
    email: '',
    phone: '',
    city: '',
    bankName: '',
    bankAccountType: 'AHORROS',
    bankAccountNumber: ''
  });

  const [engagementModal, setEngagementModal] = useState(false);
  const [engagementProfessional, setEngagementProfessional] = useState(null);
  const [engagementForm, setEngagementForm] = useState({
    vinculationType: 'INDEPENDENT_SERVICES',
    hourlyRate: '',
    startDate: '',
    endDate: '',
    retentionConcept: 'SERVICIOS',
    isIncomeTaxFiler: false,
    deliverableDescription: '',
    weeklyHours: '',
    contractType: '1'
  });

  const [timeEntryModal, setTimeEntryModal] = useState(false);
  const [timeEntryForm, setTimeEntryForm] = useState({
    periodStart: '',
    periodEnd: '',
    hours: '',
    notes: ''
  });

  const [pilaModal, setPilaModal] = useState(false);
  const [pilaForm, setPilaForm] = useState({
    period: '',
    declaredIbc: '',
    planillaReference: ''
  });

  const [settlementModal, setSettlementModal] = useState(false);
  const [settlementForm, setSettlementForm] = useState({
    periodStart: '',
    periodEnd: '',
    retentionRatePercent: ''
  });
  const [settlementResult, setSettlementResult] = useState(null);
  const [showSettlementPreview, setShowSettlementPreview] = useState(false);

  const selectedEngagement = engagements.find(function(e) {
    return e.id === selectedEngagementId;
  });

  const selectedCompany = companies.find(function(c) {
    return c.id === selectedCompanyId;
  });

  const selectedPeriod = periods.find(function(p) {
    return p.id === selectedPeriodId;
  });

  const isSuperAdmin = me.role === 'SUPER_ADMIN';

  useEffect(function() {
    loadCompanies();
  }, []);

  useEffect(function() {
    if (selectedCompanyId) {
      loadEmployees(selectedCompanyId);
      loadPeriods(selectedCompanyId);
    } else {
      setEmployees([]);
      setSelectedEmp(null);
      setPeriods([]);
      setSelectedPeriodId('');
      clearPayrollForm();
    }
  }, [selectedCompanyId]);

  useEffect(function() {
    if (selectedPeriodId) {
      loadSettlements(selectedPeriodId);
    } else {
      setSettlements([]);
    }

    clearPayrollForm();
  }, [selectedPeriodId]);

  useEffect(function() {
    if (selectedCompanyId && activeSection === 'hourly') {
      loadEngagements(selectedCompanyId);
    } else {
      setEngagements([]);
      setSelectedEngagementId('');
    }
  }, [selectedCompanyId, activeSection]);

  async function loadCompanies() {
    try {
      setError('');
      const result = await api('/api/companies');
      const list = Array.isArray(result.data) ? result.data : [];

      setCompanies(list);

      if (list.length > 0) {
        setSelectedCompanyId(function(current) {
          return current && list.some(function(c) { return c.id === current; })
            ? current
            : list[0].id;
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEmployees(companyId) {
    try {
      setError('');
      const result = await api(
        '/api/employees?companyId=' + encodeURIComponent(companyId)
      );

      setEmployees(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message);
      setEmployees([]);
    }
  }

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  function clearPayrollForm() {
    setSelectedEmp(null);

    setPayrollForm({
      employeeId: '',
      baseSalary: '',
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0
    });

    setPayrollResult(null);
    setDianXmlResult(null);
    setDisbursementResult(null);
    setCurrentSettlementId('');
    setCurrentSettlementStatus('');
  }

  function findSettlementForEmployee(employeeId) {
    return settlements.find(function(s) {
      return s.employeeId === employeeId;
    });
  }

  function selectEmployeeForPayroll(employee) {
    clearMessages();

    setSelectedEmp(employee);
    setDisbursementResult(null);

    setPayrollForm({
      employeeId: employee.id,
      baseSalary: employee.salary,
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0
    });

    const existing = findSettlementForEmployee(employee.id);

    if (existing) {
      setCurrentSettlementId(existing.id);
      setCurrentSettlementStatus(existing.dianStatus);
      setPayrollResult(existing.calculation || null);

      if (existing.dianStatus === 'GENERATED') {
        setDianXmlResult({
          cune: existing.dianCune,
          consecutive: existing.dianConsecutive,
          xmlContent: existing.dianXmlContent
        });
      } else {
        setDianXmlResult(null);
      }
    } else {
      setCurrentSettlementId('');
      setCurrentSettlementStatus('');
      setPayrollResult(null);
      setDianXmlResult(null);
    }
  }

  function openNewCompany() {
    clearMessages();

    setEditingCompany(null);

    setCompanyForm({
      name: '',
      nit: '',
      dv: '',
      address: '',
      city: 'Popayán',
      department: 'Cauca',
      postalCode: '190001',
      phone: '',
      whatsapp: '',
      email: '',
      contactName: '',
      legalRepresentative: '',
      taxRegime: 'ORDINARIO',
      economicActivity: ''
    });

    setCompanyModal(true);
  }

  function openEditCompany() {
    if (!selectedCompany) return;

    clearMessages();
    setEditingCompany(selectedCompany);

    setCompanyForm({
      name: selectedCompany.name || '',
      nit: selectedCompany.nit || '',
      dv: selectedCompany.dv || '',
      address: selectedCompany.address || '',
      city: selectedCompany.city || '',
      department: selectedCompany.department || '',
      postalCode: selectedCompany.postalCode || '',
      phone: selectedCompany.phone || '',
      whatsapp: selectedCompany.whatsapp || '',
      email: selectedCompany.email || '',
      contactName: selectedCompany.contactName || '',
      legalRepresentative: selectedCompany.legalRepresentative || '',
      taxRegime: selectedCompany.taxRegime || 'ORDINARIO',
      economicActivity: selectedCompany.economicActivity || ''
    });

    setCompanyModal(true);
  }

  async function saveCompany() {
    try {
      clearMessages();

      if (!companyForm.name.trim()) {
        throw new Error('El nombre de la empresa es obligatorio.');
      }

      if (!companyForm.nit.trim()) {
        throw new Error('El NIT de la empresa es obligatorio.');
      }

      setLoading(true);

      const payload = {
        ...companyForm
      };

      if (editingCompany) {
        await api('/api/companies/' + encodeURIComponent(editingCompany.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empresa actualizada correctamente.');
      } else {
        const result = await api('/api/companies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empresa creada correctamente.');

        if (result.data && result.data.id) {
          setSelectedCompanyId(result.data.id);
        }
      }

      setCompanyModal(false);
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteCompany() {
    if (!selectedCompany) return;

    const confirmed = window.confirm(
      '¿Deseas eliminar la empresa "' +
      selectedCompany.name +
      '"?'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/companies/' + encodeURIComponent(selectedCompany.id), {
        method: 'DELETE'
      });

      setSuccess('Empresa eliminada correctamente.');
      setSelectedCompanyId('');
      await loadCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNewEmployee() {
    if (!selectedCompany) {
      setError('Primero debes crear o seleccionar una empresa.');
      return;
    }

    clearMessages();
    setEditingEmployee(null);

    setEmployeeForm({
      firstName: '',
      firstName2: '',
      lastName: '',
      lastName2: '',
      taxId: '',
      position: '',
      contractType: '1',
      salary: '',
      address: '',
      city: selectedCompany.city || 'Popayán',
      country: 'Colombia',
      phone: '',
      whatsapp: '',
      hireDate: '',
      bankName: '',
      bankAccountType: 'AHORROS',
      bankAccountNumber: ''
    });

    setEmployeeModal(true);
  }

  function openEditEmployee(employee) {
    clearMessages();

    setEditingEmployee(employee);

    setEmployeeForm({
      firstName: employee.firstName || '',
      firstName2: employee.firstName2 || '',
      lastName: employee.lastName || '',
      lastName2: employee.lastName2 || '',
      taxId: employee.taxId || '',
      position: employee.position || '',
      contractType: employee.contractType || '1',
      salary: employee.salary || '',
      address: employee.address || '',
      city: employee.city || '',
      country: employee.country || 'Colombia',
      phone: employee.phone || '',
      whatsapp: employee.whatsapp || '',
      hireDate: employee.hireDate || '',
      bankName: employee.bankName || '',
      bankAccountType: employee.bankAccountType || 'AHORROS',
      bankAccountNumber: employee.bankAccountNumber || ''
    });

    setEmployeeModal(true);
  }

  async function saveEmployee() {
    try {
      clearMessages();

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      if (!employeeForm.firstName.trim()) {
        throw new Error('El primer nombre es obligatorio.');
      }

      if (!employeeForm.lastName.trim()) {
        throw new Error('El primer apellido es obligatorio.');
      }

      if (!employeeForm.taxId.trim()) {
        throw new Error('El documento del empleado es obligatorio.');
      }

      const salary = Number(employeeForm.salary);

      if (!Number.isFinite(salary) || salary <= 0) {
        throw new Error('El salario debe ser mayor que cero.');
      }

      setLoading(true);

      const payload = {
        ...employeeForm,
        salary,
        companyId: selectedCompany.id
      };

      if (editingEmployee) {
        await api('/api/employees/' + encodeURIComponent(editingEmployee.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empleado actualizado correctamente.');
      } else {
        await api('/api/employees', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Empleado creado correctamente.');
      }

      setEmployeeModal(false);
      await loadEmployees(selectedCompany.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteEmployee(employee) {
    const confirmed = window.confirm(
      '¿Deseas eliminar a "' +
      employee.firstName +
      ' ' +
      employee.lastName +
      '"?'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/employees/' + encodeURIComponent(employee.id), {
        method: 'DELETE'
      });

      setSuccess('Empleado eliminado correctamente.');

      if (selectedEmp && selectedEmp.id === employee.id) {
        clearPayrollForm();
      }

      await loadEmployees(selectedCompanyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadPeriods(companyId) {
    try {
      const result = await api(
        '/api/payroll-periods?companyId=' + encodeURIComponent(companyId)
      );

      const list = Array.isArray(result.data) ? result.data : [];
      setPeriods(list);

      setSelectedPeriodId(function(current) {
        return current && list.some(function(p) { return p.id === current; })
          ? current
          : (list[0] ? list[0].id : '');
      });
    } catch (err) {
      setError(err.message);
      setPeriods([]);
    }
  }

  async function loadSettlements(periodId) {
    try {
      const result = await api(
        '/api/payroll-settlements?periodId=' + encodeURIComponent(periodId)
      );

      setSettlements(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message);
      setSettlements([]);
    }
  }

  function openNewPeriod() {
    if (!selectedCompany) {
      setError('Primero debes crear o seleccionar una empresa.');
      return;
    }

    clearMessages();
    setPeriodForm({ periodStart: '', periodEnd: '' });
    setPeriodModal(true);
  }

  async function savePeriod() {
    try {
      clearMessages();

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      if (!periodForm.periodStart || !periodForm.periodEnd) {
        throw new Error('El periodo (inicio y fin) es obligatorio.');
      }

      setLoading(true);

      const result = await api('/api/payroll-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompany.id,
          periodStart: periodForm.periodStart,
          periodEnd: periodForm.periodEnd
        })
      });

      setSuccess('Periodo creado correctamente.');
      setPeriodModal(false);

      await loadPeriods(selectedCompany.id);
      setSelectedPeriodId(result.data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function closeCurrentPeriod() {
    if (!selectedPeriod) return;

    const confirmed = window.confirm(
      '¿Cerrar el periodo ' + selectedPeriod.periodStart + ' a ' +
      selectedPeriod.periodEnd + '? No podrás calcular más liquidaciones en él.'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/payroll-periods/' + encodeURIComponent(selectedPeriod.id) + '/close', {
        method: 'POST'
      });

      setSuccess('Periodo cerrado correctamente.');
      await loadPeriods(selectedCompanyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function calculatePayroll() {
    try {
      clearMessages();

      if (!selectedPeriod) {
        throw new Error('Selecciona o crea un periodo primero.');
      }

      if (!payrollForm.employeeId) {
        throw new Error('Selecciona un empleado.');
      }

      const daysWorked = Number(payrollForm.daysWorked);

      if (!Number.isFinite(daysWorked) || daysWorked < 1 || daysWorked > 30) {
        throw new Error('Los días trabajados deben estar entre 1 y 30.');
      }

      setLoading(true);

      const result = await api('/api/payroll-settlements/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          periodId: selectedPeriod.id,
          employeeId: payrollForm.employeeId,
          daysWorked,
          overtimeHours: {
            extraDiurna: Number(payrollForm.extraDiurna) || 0,
            extraNocturna: Number(payrollForm.extraNocturna) || 0,
            recargoNocturno: Number(payrollForm.recargoNocturno) || 0
          }
        })
      });

      setPayrollResult(result.data.calculation);
      setCurrentSettlementId(result.data.id);
      setCurrentSettlementStatus(result.data.dianStatus);
      setDianXmlResult(null);
      setDisbursementResult(null);
      setSuccess('Nómina calculada correctamente.');

      await loadSettlements(selectedPeriod.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateDianXml() {
    try {
      clearMessages();

      if (!payrollResult || !currentSettlementId) {
        throw new Error('Primero debes calcular la nómina.');
      }

      setLoading(true);

      const result = await api(
        '/api/payroll-settlements/' + encodeURIComponent(currentSettlementId) + '/generate-xml',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            employeeExtra: {
              typeDocument: '13',
              typeContract: '1',
              paymentMethod: '42'
            }
          })
        }
      );

      setDianXmlResult(result.data);
      setCurrentSettlementStatus('GENERATED');
      setSuccess('XML de nómina generado.');

      await loadSettlements(selectedPeriodId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateBankFile() {
    try {
      clearMessages();

      if (!selectedPeriod) {
        throw new Error('Selecciona un periodo.');
      }

      setLoading(true);

      const result = await api(
        '/api/payroll-periods/' + encodeURIComponent(selectedPeriod.id) + '/bank-disbursement',
        { method: 'POST' }
      );

      setDisbursementResult(result.data);
      setSuccess('Archivo bancario del periodo generado.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ------------------------------------------------------------
  // PERSONAL POR HORAS — funciones
  // ------------------------------------------------------------

  async function searchProfessionals() {
    try {
      clearMessages();
      setSearchingProfessionals(true);

      const result = await api(
        '/api/professionals?q=' + encodeURIComponent(professionalQuery)
      );

      setProfessionalResults(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearchingProfessionals(false);
    }
  }

  function openNewProfessional() {
    clearMessages();

    setProfessionalForm({
      firstName: '',
      firstName2: '',
      lastName: '',
      lastName2: '',
      taxId: '',
      profession: '',
      email: '',
      phone: '',
      city: '',
      bankName: '',
      bankAccountType: 'AHORROS',
      bankAccountNumber: ''
    });

    setProfessionalModal(true);
  }

  async function saveProfessional() {
    try {
      clearMessages();

      if (
        !professionalForm.firstName.trim() ||
        !professionalForm.lastName.trim()
      ) {
        throw new Error(
          'El primer nombre y el primer apellido son obligatorios.'
        );
      }

      if (!professionalForm.taxId.trim()) {
        throw new Error('El documento del profesional es obligatorio.');
      }

      if (!professionalForm.profession.trim()) {
        throw new Error('La profesión es obligatoria.');
      }

      setLoading(true);

      const result = await api('/api/professionals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(professionalForm)
      });

      setSuccess('Profesional creado correctamente.');
      setProfessionalModal(false);

      openNewEngagement(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openNewEngagement(professional) {
    if (!selectedCompany) {
      setError('Primero debes crear o seleccionar una empresa.');
      return;
    }

    clearMessages();
    setEngagementProfessional(professional);

    setEngagementForm({
      vinculationType: 'INDEPENDENT_SERVICES',
      hourlyRate: '',
      startDate: '',
      endDate: '',
      retentionConcept: 'SERVICIOS',
      isIncomeTaxFiler: false,
      deliverableDescription: '',
      weeklyHours: '',
      contractType: '1'
    });

    setEngagementModal(true);
  }

  async function saveEngagement() {
    try {
      clearMessages();

      if (!selectedCompany) {
        throw new Error('No hay una empresa seleccionada.');
      }

      if (!engagementProfessional) {
        throw new Error('Selecciona o crea un profesional primero.');
      }

      const hourlyRate = Number(engagementForm.hourlyRate);

      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        throw new Error('La tarifa por hora debe ser mayor que cero.');
      }

      if (!engagementForm.startDate) {
        throw new Error('La fecha de inicio es obligatoria.');
      }

      if (
        engagementForm.vinculationType === 'INDEPENDENT_SERVICES' &&
        !engagementForm.deliverableDescription.trim()
      ) {
        throw new Error('Describe el objeto/entregable del contrato.');
      }

      if (
        engagementForm.vinculationType === 'PART_TIME_EMPLOYEE' &&
        (!engagementForm.weeklyHours || Number(engagementForm.weeklyHours) <= 0)
      ) {
        throw new Error('Las horas semanales son obligatorias.');
      }

      setLoading(true);

      const payload = {
        professionalId: engagementProfessional.id,
        companyId: selectedCompany.id,
        vinculationType: engagementForm.vinculationType,
        hourlyRate,
        startDate: engagementForm.startDate,
        endDate: engagementForm.endDate || null,
        retentionConcept: engagementForm.retentionConcept,
        isIncomeTaxFiler: engagementForm.isIncomeTaxFiler,
        deliverableDescription: engagementForm.deliverableDescription,
        weeklyHours: Number(engagementForm.weeklyHours) || undefined,
        contractType: engagementForm.contractType
      };

      await api('/api/engagements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      setSuccess('Vinculación creada correctamente.');
      setEngagementModal(false);
      setProfessionalResults([]);
      setProfessionalQuery('');

      await loadEngagements(selectedCompany.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEngagements(companyId) {
    try {
      const result = await api(
        '/api/engagements?companyId=' + encodeURIComponent(companyId)
      );

      setEngagements(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setError(err.message);
      setEngagements([]);
    }
  }

  async function endEngagement(engagement) {
    const confirmed = window.confirm(
      '¿Deseas finalizar la vinculación con "' +
      engagement.professional.firstName +
      ' ' +
      engagement.professional.lastName +
      '"?'
    );

    if (!confirmed) return;

    try {
      clearMessages();
      setLoading(true);

      await api('/api/engagements/' + encodeURIComponent(engagement.id), {
        method: 'DELETE'
      });

      setSuccess('Vinculación finalizada correctamente.');

      if (selectedEngagementId === engagement.id) {
        setSelectedEngagementId('');
      }

      await loadEngagements(selectedCompanyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openTimeEntryModal() {
    clearMessages();

    setTimeEntryForm({
      periodStart: '',
      periodEnd: '',
      hours: '',
      notes: ''
    });

    setTimeEntryModal(true);
  }

  async function saveTimeEntry() {
    try {
      clearMessages();

      if (!selectedEngagement) {
        throw new Error('Selecciona una vinculación.');
      }

      const hours = Number(timeEntryForm.hours);

      if (!timeEntryForm.periodStart || !timeEntryForm.periodEnd) {
        throw new Error('El periodo (inicio y fin) es obligatorio.');
      }

      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error('Las horas deben ser mayores que cero.');
      }

      setLoading(true);

      await api('/api/time-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          engagementId: selectedEngagement.id,
          periodStart: timeEntryForm.periodStart,
          periodEnd: timeEntryForm.periodEnd,
          hours,
          notes: timeEntryForm.notes
        })
      });

      setSuccess('Horas registradas correctamente.');
      setTimeEntryModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openPilaModal() {
    clearMessages();

    setPilaForm({
      period: '',
      declaredIbc: '',
      planillaReference: ''
    });

    setPilaModal(true);
  }

  async function savePilaVerification() {
    try {
      clearMessages();

      if (!selectedEngagement) {
        throw new Error('Selecciona una vinculación.');
      }

      if (!/^\d{4}-\d{2}$/.test(pilaForm.period)) {
        throw new Error('El periodo debe tener formato AAAA-MM.');
      }

      const declaredIbc = Number(pilaForm.declaredIbc);

      if (!Number.isFinite(declaredIbc) || declaredIbc <= 0) {
        throw new Error('El IBC declarado debe ser mayor que cero.');
      }

      setLoading(true);

      await api('/api/pila-verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          engagementId: selectedEngagement.id,
          period: pilaForm.period,
          declaredIbc,
          planillaReference: pilaForm.planillaReference
        })
      });

      setSuccess('Verificación de PILA registrada.');
      setPilaModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function openSettlementModal() {
    clearMessages();

    setSettlementForm({ periodStart: '', periodEnd: '', retentionRatePercent: '' });
    setSettlementResult(null);
    setSettlementModal(true);
  }

  async function calculateSettlement() {
    try {
      clearMessages();

      if (!selectedEngagement) {
        throw new Error('Selecciona una vinculación.');
      }

      if (!settlementForm.periodStart || !settlementForm.periodEnd) {
        throw new Error('El periodo (inicio y fin) es obligatorio.');
      }

      const isHonorarios =
        selectedEngagement.retentionConcept === 'HONORARIOS';

      let retentionRate;

      if (isHonorarios) {
        const percent = Number(settlementForm.retentionRatePercent);

        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          throw new Error(
            'Indica la tarifa de retención vigente para honorarios (0 a 100%).'
          );
        }

        retentionRate = percent / 100;
      }

      setLoading(true);

      const result = await api('/api/hourly/settlements/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          engagementId: selectedEngagement.id,
          periodStart: settlementForm.periodStart,
          periodEnd: settlementForm.periodEnd,
          retentionRate: retentionRate
        })
      });

      setSettlementResult(result.data);
      setSuccess('Liquidación calculada correctamente.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function renderPayrollResult() {
    if (!payrollResult) {
      return (
        <div className="empty">
          <div style={{fontSize: '30px', marginBottom: '10px'}}>📊</div>
          Selecciona un empleado y calcula la nómina para ver los resultados.
        </div>
      );
    }

    const deductions = payrollResult.employeeDeductions || {};
    const employer = payrollResult.employerContributions || {};
    const provisions = payrollResult.provisions || {};

    return (
      <>
        <div className="result-summary">
          <div className="result-label">Neto a pagar</div>
          <div className="net-pay">
            {formatCOP(payrollResult.netPay)}
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span>TOTAL DEVENGADO</span>
              <strong>{formatCOP(payrollResult.grossEarnings)}</strong>
            </div>

            <div className="summary-card">
              <span>DEDUCCIONES</span>
              <strong>{formatCOP(deductions.totalDeductions)}</strong>
            </div>
          </div>
        </div>

        <div className="result-body">
          <div className="result-section">
            <h3>👤 Empleado</h3>

            <div className="result-row">
              <span>Nombre</span>
              <strong>{payrollResult.employeeName}</strong>
            </div>

            <div className="result-row">
              <span>Documento</span>
              <strong>{payrollResult.taxId}</strong>
            </div>

            <div className="result-row">
              <span>Días trabajados</span>
              <strong>{payrollResult.daysWorked}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>💰 Devengados</h3>

            <div className="result-row">
              <span>Salario</span>
              <strong>{formatCOP(payrollResult.baseSalaryEarned)}</strong>
            </div>

            <div className="result-row">
              <span>Auxilio transporte</span>
              <strong>{formatCOP(payrollResult.earnedAuxTransporte)}</strong>
            </div>

            <div className="result-row">
              <span>Extra diurna</span>
              <strong>{formatCOP(payrollResult.extraDiurnaValue)}</strong>
            </div>

            <div className="result-row">
              <span>Extra nocturna</span>
              <strong>{formatCOP(payrollResult.extraNocturnaValue)}</strong>
            </div>

            <div className="result-row">
              <span>Recargo nocturno</span>
              <strong>{formatCOP(payrollResult.recargoNocturnoValue)}</strong>
            </div>

            <div className="result-row">
              <span>Total devengado</span>
              <strong>{formatCOP(payrollResult.grossEarnings)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📉 Deducciones empleado</h3>

            <div className="result-row">
              <span>Salud 4%</span>
              <strong>{formatCOP(deductions.health4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Pensión 4%</span>
              <strong>{formatCOP(deductions.pension4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Fondo solidaridad</span>
              <strong>{formatCOP(deductions.fspValue)}</strong>
            </div>

            <div className="result-row">
              <span>Total deducciones</span>
              <strong>{formatCOP(deductions.totalDeductions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>🏢 Aportes empleador</h3>

            <div className="result-row">
              <span>Salud 8.5%</span>
              <strong>{formatCOP(employer.health8_5pct)}</strong>
            </div>

            <div className="result-row">
              <span>Pensión 12%</span>
              <strong>{formatCOP(employer.pension12pct)}</strong>
            </div>

            <div className="result-row">
              <span>ARL</span>
              <strong>{formatCOP(employer.arlValue)}</strong>
            </div>

            <div className="result-row">
              <span>SENA 2%</span>
              <strong>{formatCOP(employer.sena2pct)}</strong>
            </div>

            <div className="result-row">
              <span>ICBF 3%</span>
              <strong>{formatCOP(employer.icbf3pct)}</strong>
            </div>

            <div className="result-row">
              <span>Caja compensación 4%</span>
              <strong>{formatCOP(employer.ccf4pct)}</strong>
            </div>

            <div className="result-row">
              <span>Total aportes</span>
              <strong>{formatCOP(employer.totalContributions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📦 Provisiones</h3>

            <div className="result-row">
              <span>Cesantías</span>
              <strong>{formatCOP(provisions.cesantias)}</strong>
            </div>

            <div className="result-row">
              <span>Intereses cesantías</span>
              <strong>{formatCOP(provisions.interesesCesantias)}</strong>
            </div>

            <div className="result-row">
              <span>Prima</span>
              <strong>{formatCOP(provisions.primaServicios)}</strong>
            </div>

            <div className="result-row">
              <span>Vacaciones</span>
              <strong>{formatCOP(provisions.vacaciones)}</strong>
            </div>

            <div className="result-row">
              <span>Total provisiones</span>
              <strong>{formatCOP(provisions.totalProvisions)}</strong>
            </div>
          </div>

          <div className="result-section">
            <h3>📊 Seguridad social</h3>

            <div className="result-row">
              <span>IBC</span>
              <strong>{formatCOP(payrollResult.ibcSecuritySocial)}</strong>
            </div>

            <div className="result-row">
              <span>Valor hora</span>
              <strong>{formatCOP(payrollResult.hourlyRate)}</strong>
            </div>
          </div>

          <div className="button-row">
            <button
              className="btn"
              onClick={() => setShowPayrollPreview(true)}
            >
              📄 Ver hoja de nómina
            </button>

            <button
              className="btn btn-success"
              onClick={generateDianXml}
              disabled={loading || currentSettlementStatus === 'GENERATED'}
            >
              {currentSettlementStatus === 'GENERATED'
                ? '✅ XML ya generado'
                : '🧾 Generar XML DIAN'}
            </button>
          </div>

          {dianXmlResult && (
            <div className="result-section" style={{marginTop: '18px'}}>
              <h3>🧾 XML DIAN generado</h3>

              <div className="result-row">
                <span>CUNE</span>
                <strong>{dianXmlResult.cune}</strong>
              </div>

              <div className="result-row">
                <span>Consecutivo</span>
                <strong>{dianXmlResult.consecutive}</strong>
              </div>

              <pre>{dianXmlResult.xmlContent}</pre>
            </div>
          )}

          {showPayrollPreview && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.82)',
                zIndex: 9999,
                overflowY: 'auto',
                padding: '30px 15px'
              }}
            >
              <div
                style={{
                  maxWidth: '950px',
                  margin: '0 auto',
                  background: '#ffffff',
                  color: '#111827',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 70px rgba(0,0,0,0.5)'
                }}
              >
                <div
                  style={{
                    padding: '22px 28px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '15px'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        letterSpacing: '1px'
                      }}
                    >
                      KREADU GESTIÓN-FUTURE
                    </div>

                    <h2 style={{margin: '5px 0', fontSize: '22px'}}>
                      Nómina Individual
                    </h2>

                    <div style={{fontSize: '13px', color: '#64748b'}}>
                      Liquidación de nómina · Colombia
                    </div>
                  </div>

                  <button
                    className="btn"
                    onClick={() => setShowPayrollPreview(false)}
                  >
                    ✕ Cerrar
                  </button>
                </div>

                <div style={{padding: '28px'}}>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '20px',
                      marginBottom: '25px'
                    }}
                  >
                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '16px'
                      }}
                    >
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        marginBottom: '10px'
                      }}>
                        TRABAJADOR
                      </div>

                      <strong style={{fontSize: '17px'}}>
                        {payrollResult.employeeName}
                      </strong>

                      <div style={{marginTop: '7px', fontSize: '13px'}}>
                        Documento: {payrollResult.taxId}
                      </div>

                      <div style={{marginTop: '5px', fontSize: '13px'}}>
                        ID empleado: {payrollResult.employeeId}
                      </div>
                    </div>

                    <div
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '16px'
                      }}
                    >
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b',
                        marginBottom: '10px'
                      }}>
                        PERÍODO
                      </div>

                      <strong style={{fontSize: '17px'}}>
                        Nómina mensual
                      </strong>

                      <div style={{marginTop: '7px', fontSize: '13px'}}>
                        Días trabajados: {payrollResult.daysWorked}
                      </div>

                      <div style={{marginTop: '5px', fontSize: '13px'}}>
                        Moneda: COP
                      </div>
                    </div>
                  </div>

                  <h3 style={{
                    fontSize: '15px',
                    borderBottom: '2px solid #111827',
                    paddingBottom: '8px',
                    marginBottom: '10px'
                  }}>
                    Devengados
                  </h3>

                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    marginBottom: '25px'
                  }}>
                    <tbody>
                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Salario básico
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.baseSalaryEarned)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Auxilio de transporte
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.earnedAuxTransporte)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Horas extras diurnas
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.extraDiurnaValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Horas extras nocturnas
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.extraNocturnaValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Recargo nocturno
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.recargoNocturnoValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{
                          padding: '12px 5px',
                          fontWeight: '800'
                        }}>
                          TOTAL DEVENGADO
                        </td>
                        <td style={{
                          padding: '12px 5px',
                          textAlign: 'right',
                          fontWeight: '800'
                        }}>
                          {formatCOP(payrollResult.grossEarnings)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <h3 style={{
                    fontSize: '15px',
                    borderBottom: '2px solid #111827',
                    paddingBottom: '8px',
                    marginBottom: '10px'
                  }}>
                    Deducciones
                  </h3>

                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '13px',
                    marginBottom: '25px'
                  }}>
                    <tbody>
                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Salud · 4%
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.health4pct)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Pensión · 4%
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.pension4pct)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Fondo de solidaridad
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.fspValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{
                          padding: '12px 5px',
                          fontWeight: '800'
                        }}>
                          TOTAL DEDUCCIONES
                        </td>
                        <td style={{
                          padding: '12px 5px',
                          textAlign: 'right',
                          fontWeight: '800'
                        }}>
                          {formatCOP(deductions.totalDeductions)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        color: '#64748b'
                      }}>
                        NETO A PAGAR
                      </div>

                      <div style={{
                        fontSize: '28px',
                        fontWeight: '900',
                        marginTop: '5px'
                      }}>
                        {formatCOP(payrollResult.netPay)}
                      </div>
                    </div>

                    <div style={{
                      textAlign: 'right',
                      fontSize: '12px',
                      color: '#64748b'
                    }}>
                      <div>IBC Seguridad Social</div>
                      <strong style={{color: '#111827'}}>
                        {formatCOP(payrollResult.ibcSecuritySocial)}
                      </strong>
                    </div>
                  </div>

                  <div style={{
                    marginTop: '25px',
                    paddingTop: '15px',
                    borderTop: '1px solid #e5e7eb',
                    fontSize: '11px',
                    color: '#64748b'
                  }}>
                    Documento generado por Kreadu Gestión-Future.
                    Esta vista es una representación visual de la liquidación.
                    El documento técnico para nómina electrónica se encuentra
                    en el XML DIAN.
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderEngagementDetail() {
    if (!selectedEngagement) {
      return (
        <div className="empty">
          <div style={{fontSize: '30px', marginBottom: '10px'}}>🕐</div>
          Selecciona una vinculación de la lista para registrar horas,
          verificar PILA o liquidar un periodo.
        </div>
      );
    }

    const engagement = selectedEngagement;
    const professional = engagement.professional || {};
    const isIndependent = engagement.vinculationType === 'INDEPENDENT_SERVICES';

    return (
      <div className="panel-body">
        <div className="selected-employee">
          <strong>
            {professional.firstName + ' ' + professional.lastName}
          </strong>
          <br />
          <span>{professional.profession}</span>
          <br />
          <span>
            {VINCULATION_LABELS[engagement.vinculationType] || engagement.vinculationType}
            {' · '}
            {formatCOP(engagement.hourlyRate)}/hora
          </span>
        </div>

        {isIndependent && (
          <div className="info-box" style={{marginBottom: '18px'}}>
            Antes de liquidar un periodo, debes verificar que el
            contratista pagó su seguridad social (PILA) para ese mes.
            Es un deber legal del contratante (Ley 1955/2019 art. 244).
          </div>
        )}

        <div className="button-row">
          <button className="btn btn-primary" onClick={openTimeEntryModal}>
            ⏱️ Registrar horas
          </button>

          {isIndependent && (
            <button className="btn" onClick={openPilaModal}>
              ✅ Verificar PILA
            </button>
          )}

          <button className="btn btn-success" onClick={openSettlementModal}>
            💵 Liquidar periodo
          </button>

          <button
            className="btn btn-danger"
            onClick={function() { endEngagement(engagement); }}
          >
            Finalizar vinculación
          </button>
        </div>

        {settlementResult && (
          <div className="result-section" style={{marginTop: '20px'}}>
            <h3>📊 Última liquidación calculada</h3>

            <div className="summary-grid">
              <div className="summary-card">
                <span>BRUTO</span>
                <strong>{formatCOP(settlementResult.grossAmount)}</strong>
              </div>

              <div className="summary-card">
                <span>{isIndependent ? 'RETENCIÓN' : 'DEDUCCIONES'}</span>
                <strong>{formatCOP(settlementResult.retentionAmount)}</strong>
              </div>
            </div>

            <div className="result-row" style={{marginTop: '10px'}}>
              <span>Total horas liquidadas</span>
              <strong>{settlementResult.totalHours}</strong>
            </div>

            <div className="result-row">
              <span>Neto a pagar</span>
              <strong>{formatCOP(settlementResult.netAmount)}</strong>
            </div>

            {isIndependent && settlementResult.calculation && (
              <div className="result-row">
                <span>IBC mínimo sugerido para el contratista</span>
                <strong>
                  {formatCOP(settlementResult.calculation.suggestedMinimumIbc)}
                </strong>
              </div>
            )}

            <div className="button-row">
              <button
                className="btn"
                onClick={function() { setShowSettlementPreview(true); }}
              >
                📄 Ver documento DIAN generado
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderHourlySection() {
    return (
      <main style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 380px) 1fr',
        minHeight: 'calc(100vh - 76px)'
      }}>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>🔍 Bolsa de profesionales</h2>
              <span>Busca o crea uno nuevo</span>
            </div>
          </div>

          <div className="panel-body">
            <div className="form-grid">
              <div className="form-group full">
                <label>Buscar por nombre o profesión</label>
                <input
                  value={professionalQuery}
                  onChange={function(e) {
                    setProfessionalQuery(e.target.value);
                  }}
                  onKeyDown={function(e) {
                    if (e.key === 'Enter') searchProfessionals();
                  }}
                  placeholder="Ej: contador, María..."
                />
              </div>
            </div>

            <div className="button-row">
              <button
                className="btn btn-primary"
                onClick={searchProfessionals}
                disabled={searchingProfessionals}
              >
                {searchingProfessionals ? 'Buscando...' : 'Buscar'}
              </button>

              <button className="btn" onClick={openNewProfessional}>
                + Nuevo profesional
              </button>
            </div>

            {professionalResults.length > 0 && (
              <div className="employee-list" style={{padding: '10px 0'}}>
                {professionalResults.map(function(professional) {
                  return (
                    <div key={professional.id} className="employee-card">
                      <div className="employee-name">
                        {professional.firstName + ' ' + professional.lastName}
                      </div>

                      <div className="employee-meta">
                        {professional.profession}
                        <br />
                        {professional.city || 'Sin ciudad'}
                        {professional.taxId ? (
                          <span><br />CC/NIT: {professional.taxId}</span>
                        ) : null}
                      </div>

                      <div className="button-row" style={{marginTop: '9px'}}>
                        <button
                          className="btn btn-primary"
                          onClick={function() {
                            openNewEngagement(professional);
                          }}
                        >
                          + Vincular a esta empresa
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel-header">
            <div>
              <h2>🤝 Vinculaciones activas</h2>
              <span>{engagements.length} en esta empresa</span>
            </div>
          </div>

          <div className="employee-list">
            {!selectedCompany ? (
              <div className="empty">
                Selecciona una empresa arriba.
              </div>
            ) : engagements.length === 0 ? (
              <div className="empty">
                Esta empresa no tiene vinculaciones por horas todavía.
              </div>
            ) : (
              engagements.map(function(engagement) {
                const isSelected = engagement.id === selectedEngagementId;
                const professional = engagement.professional || {};

                return (
                  <div
                    key={engagement.id}
                    className={'employee-card' + (isSelected ? ' selected' : '')}
                    onClick={function() {
                      setSettlementResult(null);
                      setSelectedEngagementId(engagement.id);
                    }}
                  >
                    <div className="employee-name">
                      {professional.firstName + ' ' + professional.lastName}
                    </div>

                    <div className="employee-meta">
                      {VINCULATION_LABELS[engagement.vinculationType] || engagement.vinculationType}
                      <br />
                      {professional.profession}
                    </div>

                    <div className="employee-salary">
                      {formatCOP(engagement.hourlyRate)}/hora
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>📋 Detalle de la vinculación</h2>
              <span>Horas, verificación PILA y liquidación</span>
            </div>
          </div>

          {renderEngagementDetail()}
        </section>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-logo">K</div>

          <div>
            <h1>Kreadu Gestión-Future</h1>
            <p>Sistema de gestión de nómina multiempresa</p>
          </div>
        </div>

        <div className="header-right">
          <span className="badge">Motor Colombia 2026</span>

          <div className="company-selector">
            <select
              value={selectedCompanyId}
              onChange={function(e) {
                setSelectedCompanyId(e.target.value);
              }}
            >
              {companies.length === 0 && (
                <option value="">Sin empresas creadas</option>
              )}

              {companies.map(function(company) {
                return (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                );
              })}
            </select>

            <button
              className="btn"
              onClick={openEditCompany}
              disabled={!selectedCompany}
            >
              ✏️
            </button>

            {isSuperAdmin && (
              <button
                className="btn btn-primary"
                onClick={openNewCompany}
              >
                🏢 + Crear Empresa
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              paddingLeft: '9px',
              borderLeft: '1px solid #1d3047'
            }}
          >
            <div style={{ textAlign: 'right', lineHeight: '1.3' }}>
              <div style={{ fontSize: '12px', fontWeight: '700' }}>
                {me.email}
              </div>
              <div style={{ fontSize: '10px', color: '#7890a9' }}>
                {ROLE_LABELS[me.role] || me.role}
              </div>
            </div>

            <button className="btn" onClick={onSignOut}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 24px 0',
        borderBottom: '1px solid #1d3047'
      }}>
        <button
          className={'btn' + (activeSection === 'payroll' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('payroll'); }}
        >
          🧾 Nómina mensual
        </button>

        <button
          className={'btn' + (activeSection === 'hourly' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('hourly'); }}
        >
          🕐 Personal por horas
        </button>
      </div>

      {error && (
        <div className="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success">
          {success}
        </div>
      )}

      {activeSection === 'hourly' && renderHourlySection()}

      {activeSection === 'payroll' && (
      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>👥 Empleados</h2>
              <span>
                {employees.length} registrado(s)
              </span>
            </div>

            <button
              className="btn btn-primary"
              onClick={openNewEmployee}
              disabled={!selectedCompany}
            >
              + Empleado
            </button>
          </div>

          <div className="employee-list">
            {employees.length === 0 ? (
              <div className="empty">
                No hay empleados registrados para esta empresa.
              </div>
            ) : (
              employees.map(function(employee) {
                const isSelected =
                  selectedEmp &&
                  selectedEmp.id === employee.id;

                return (
                  <div
                    key={employee.id}
                    className={
                      'employee-card' +
                      (isSelected ? ' selected' : '')
                    }
                    onClick={function() {
                      selectEmployeeForPayroll(employee);
                    }}
                  >
                    <div className="employee-name">
                      {getEmployeeName(employee)}
                    </div>

                    <div className="employee-meta">
                      CC/NIT: {employee.taxId}
                      <br />
                      {employee.position || 'Sin cargo'}
                      <br />
                      {employee.city || 'Sin ciudad'}
                    </div>

                    <div className="employee-salary">
                      {formatCOP(employee.salary)}
                    </div>

                    <div
                      className="button-row"
                      style={{marginTop: '9px'}}
                    >
                      <button
                        className="btn"
                        onClick={function(e) {
                          e.stopPropagation();
                          openEditEmployee(employee);
                        }}
                      >
                        Editar
                      </button>

                      <button
                        className="btn btn-danger"
                        onClick={function(e) {
                          e.stopPropagation();
                          deleteEmployee(employee);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>🧮 Datos para la liquidación de nómina</h2>
              <span>Colombia 2026</span>
            </div>
          </div>

          <div className="panel-body">
            <div className="section">
              <div className="section-title">
                📅 Periodo de nómina
              </div>

              <div className="form-grid">
                <div className="form-group full">
                  <label>Periodo</label>
                  <select
                    value={selectedPeriodId}
                    onChange={function(e) {
                      setSelectedPeriodId(e.target.value);
                    }}
                  >
                    {periods.length === 0 && (
                      <option value="">Sin periodos creados</option>
                    )}

                    {periods.map(function(period) {
                      return (
                        <option key={period.id} value={period.id}>
                          {period.periodStart + ' a ' + period.periodEnd +
                            (period.status === 'CLOSED' ? ' (cerrado)' : ' (borrador)')}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="button-row">
                <button
                  className="btn btn-primary"
                  onClick={openNewPeriod}
                  disabled={!selectedCompany}
                >
                  + Nuevo periodo
                </button>

                {selectedPeriod && (
                  <button
                    className="btn"
                    onClick={closeCurrentPeriod}
                    disabled={loading || selectedPeriod.status === 'CLOSED'}
                  >
                    🔒 Cerrar periodo
                  </button>
                )}

                {selectedPeriod && (
                  <button
                    className="btn btn-success"
                    onClick={generateBankFile}
                    disabled={loading}
                  >
                    🏦 Archivo bancario del periodo
                  </button>
                )}
              </div>

              {disbursementResult && (
                <pre style={{marginTop: '10px'}}>{disbursementResult}</pre>
              )}
            </div>

            {!selectedPeriod ? (
              <div className="info-box">
                Crea o selecciona un periodo para poder liquidar empleados.
              </div>
            ) : !selectedEmp ? (
              <div className="info-box">
                Selecciona un empleado de la izquierda. Sus datos de
                identificación y salario se cargarán automáticamente.
              </div>
            ) : (
              <>
                <div className="selected-employee">
                  Empleado seleccionado:
                  <br />
                  <strong>
                    {getEmployeeName(selectedEmp)}
                  </strong>
                  <br />
                  <span>
                    Documento: {selectedEmp.taxId}
                  </span>

                  {currentSettlementStatus === 'GENERATED' && (
                    <>
                      <br />
                      <span className="badge" style={{marginTop: '7px', display: 'inline-block'}}>
                        ✅ XML DIAN ya generado para este periodo
                      </span>
                    </>
                  )}
                </div>

                <div className="section">
                  <div className="section-title">
                    💼 Información salarial
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Empleado</label>
                      <input
                        value={getEmployeeName(selectedEmp)}
                        disabled
                      />
                    </div>

                    <div className="form-group">
                      <label>Salario mensual</label>
                      <input
                        value={formatCOP(payrollForm.baseSalary)}
                        disabled
                      />
                    </div>

                    <div className="form-group">
                      <label>Días trabajados</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={payrollForm.daysWorked}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            daysWorked: e.target.value
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title">
                    ⏱️ Horas extras y recargos
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label>Extra diurna</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.extraDiurna}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            extraDiurna: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Extra nocturna</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.extraNocturna}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            extraNocturna: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Recargo nocturno</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.recargoNocturno}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            recargoNocturno: e.target.value
                          });
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="button-row">
                  <button
                    className="btn btn-primary"
                    onClick={calculatePayroll}
                    disabled={loading || currentSettlementStatus === 'GENERATED'}
                  >
                    {loading
                      ? 'Calculando...'
                      : currentSettlementStatus === 'GENERATED'
                        ? '🔒 Ya liquidado'
                        : '🧮 Calcular nómina'}
                  </button>

                  <button
                    className="btn"
                    onClick={clearPayrollForm}
                    disabled={loading}
                  >
                    🧹 Limpiar formulario
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>📊 Resultado de la liquidación</h2>
              <span>Detalle completo</span>
            </div>
          </div>

          {renderPayrollResult()}
        </section>
      </main>
      )}

      {companyModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {editingCompany
                  ? 'Editar empresa'
                  : 'Crear empresa'}
              </h3>

              <button
                className="btn"
                onClick={function() {
                  setCompanyModal(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label>Razón social</label>
                  <div style={{
                    marginBottom: '18px',
                    padding: '16px',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    background: '#020617'
                  }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '700'
                    }}>
                      🖼️ Logo de la empresa
                    </label>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '15px',
                      flexWrap: 'wrap'
                    }}>
                      {companyForm.logo ? (
                        <img
                          src={companyForm.logo}
                          alt="Logo de la empresa"
                          style={{
                            width: '90px',
                            height: '90px',
                            objectFit: 'contain',
                            background: '#ffffff',
                            borderRadius: '8px',
                            padding: '6px'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '90px',
                          height: '90px',
                          borderRadius: '8px',
                          border: '1px dashed #64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#64748b',
                          fontSize: '12px',
                          textAlign: 'center'
                        }}>
                          Sin logo
                        </div>
                      )}

                      <div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          style={{fontSize: '12px'}}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            if (file.size > 2 * 1024 * 1024) {
                              alert('El logo no puede superar 2 MB.');
                              return;
                            }

                            const reader = new FileReader();

                            reader.onload = () => {
                              setCompanyForm({
                                ...companyForm,
                                logo: String(reader.result || '')
                              });
                            };

                            reader.readAsDataURL(file);
                          }}
                        />

                        <div style={{
                          marginTop: '7px',
                          fontSize: '11px',
                          color: '#94a3b8'
                        }}>
                          PNG, JPG, WEBP o SVG · máximo 2 MB
                        </div>
                      </div>
                    </div>
                  </div>

                  <label>Nombre de la empresa</label>

                  <input
                    value={companyForm.name}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        name: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>NIT</label>
                  <input
                    value={companyForm.nit}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        nit: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Dígito verificación</label>
                  <input
                    value={companyForm.dv}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        dv: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Dirección</label>
                  <input
                    value={companyForm.address}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        address: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    value={companyForm.city}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        city: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Departamento</label>
                  <input
                    value={companyForm.department}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        department: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Código postal</label>
                  <input
                    value={companyForm.postalCode}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        postalCode: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={companyForm.phone}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        phone: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>WhatsApp</label>
                  <input
                    value={companyForm.whatsapp}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        whatsapp: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Correo</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        email: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Contacto</label>
                  <input
                    value={companyForm.contactName}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        contactName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Representante legal</label>
                  <input
                    value={companyForm.legalRepresentative}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        legalRepresentative: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Régimen tributario</label>
                  <select
                    value={companyForm.taxRegime}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        taxRegime: e.target.value
                      });
                    }}
                  >
                    <option value="ORDINARIO">Ordinario</option>
                    <option value="SIMPLE">SIMPLE</option>
                  </select>
                </div>

                <div className="form-group full">
                  <label>Actividad económica</label>
                  <input
                    value={companyForm.economicActivity}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        economicActivity: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {editingCompany && isSuperAdmin && (
                <button
                  className="btn btn-danger"
                  onClick={deleteCompany}
                  disabled={loading}
                >
                  Eliminar
                </button>
              )}

              <button
                className="btn"
                onClick={function() {
                  setCompanyModal(false);
                }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveCompany}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {employeeModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>
                {editingEmployee
                  ? 'Editar empleado'
                  : 'Crear empleado'}
              </h3>

              <button
                className="btn"
                onClick={function() {
                  setEmployeeModal(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Primer nombre</label>
                  <input
                    value={employeeForm.firstName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        firstName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo nombre</label>
                  <input
                    value={employeeForm.firstName2}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        firstName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Primer apellido</label>
                  <input
                    value={employeeForm.lastName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        lastName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo apellido</label>
                  <input
                    value={employeeForm.lastName2}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        lastName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Documento</label>
                  <input
                    value={employeeForm.taxId}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        taxId: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Cargo</label>
                  <input
                    value={employeeForm.position}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        position: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Tipo contrato DIAN</label>
                  <select
                    value={employeeForm.contractType}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        contractType: e.target.value
                      });
                    }}
                  >
                    <option value="1">Término indefinido</option>
                    <option value="2">Término fijo</option>
                    <option value="3">Obra o labor</option>
                    <option value="4">Aprendizaje</option>
                    <option value="5">Otro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Salario mensual</label>
                  <input
                    type="number"
                    min="0"
                    value={employeeForm.salary}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        salary: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Dirección</label>
                  <input
                    value={employeeForm.address}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        address: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    value={employeeForm.city}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        city: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>País</label>
                  <input
                    value={employeeForm.country}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        country: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={employeeForm.phone}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        phone: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>WhatsApp</label>
                  <input
                    value={employeeForm.whatsapp}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        whatsapp: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha ingreso</label>
                  <input
                    type="date"
                    value={employeeForm.hireDate}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        hireDate: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Banco</label>
                  <input
                    value={employeeForm.bankName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        bankName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de cuenta</label>
                  <select
                    value={employeeForm.bankAccountType}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        bankAccountType: e.target.value
                      });
                    }}
                  >
                    <option value="AHORROS">Ahorros</option>
                    <option value="CORRIENTE">Corriente</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Número de cuenta</label>
                  <input
                    value={employeeForm.bankAccountNumber}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        bankAccountNumber: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() {
                  setEmployeeModal(false);
                }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveEmployee}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar empleado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {periodModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Nuevo periodo de nómina</h3>

              <button
                className="btn"
                onClick={function() { setPeriodModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Periodo desde</label>
                  <input
                    type="date"
                    value={periodForm.periodStart}
                    onChange={function(e) {
                      setPeriodForm({
                        ...periodForm,
                        periodStart: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Periodo hasta</label>
                  <input
                    type="date"
                    value={periodForm.periodEnd}
                    onChange={function(e) {
                      setPeriodForm({
                        ...periodForm,
                        periodEnd: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setPeriodModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={savePeriod}
                disabled={loading}
              >
                {loading ? 'Creando...' : 'Crear periodo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {professionalModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Nuevo profesional</h3>

              <button
                className="btn"
                onClick={function() { setProfessionalModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Primer nombre</label>
                  <input
                    value={professionalForm.firstName}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        firstName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo nombre</label>
                  <input
                    value={professionalForm.firstName2}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        firstName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Primer apellido</label>
                  <input
                    value={professionalForm.lastName}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        lastName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Segundo apellido</label>
                  <input
                    value={professionalForm.lastName2}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        lastName2: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Documento</label>
                  <input
                    value={professionalForm.taxId}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        taxId: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Profesión</label>
                  <input
                    value={professionalForm.profession}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        profession: e.target.value
                      });
                    }}
                    placeholder="Ej: Contador, Electricista..."
                  />
                </div>

                <div className="form-group">
                  <label>Correo</label>
                  <input
                    type="email"
                    value={professionalForm.email}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        email: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Teléfono</label>
                  <input
                    value={professionalForm.phone}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        phone: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Ciudad</label>
                  <input
                    value={professionalForm.city}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        city: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Banco</label>
                  <input
                    value={professionalForm.bankName}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        bankName: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Tipo de cuenta</label>
                  <select
                    value={professionalForm.bankAccountType}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        bankAccountType: e.target.value
                      });
                    }}
                  >
                    <option value="AHORROS">Ahorros</option>
                    <option value="CORRIENTE">Corriente</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Número de cuenta</label>
                  <input
                    value={professionalForm.bankAccountNumber}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        bankAccountNumber: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setProfessionalModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveProfessional}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Guardar y vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {engagementModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Nueva vinculación</h3>

              <button
                className="btn"
                onClick={function() { setEngagementModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {engagementProfessional && (
                <div className="info-box" style={{marginBottom: '18px'}}>
                  Vinculando a{' '}
                  <strong>
                    {engagementProfessional.firstName + ' ' + engagementProfessional.lastName}
                  </strong>{' '}
                  con {selectedCompany ? selectedCompany.name : 'la empresa seleccionada'}.
                </div>
              )}

              <div className="form-grid">
                <div className="form-group full">
                  <label>Modalidad</label>
                  <select
                    value={engagementForm.vinculationType}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        vinculationType: e.target.value
                      });
                    }}
                  >
                    <option value="INDEPENDENT_SERVICES">
                      Contratista independiente (prestación de servicios)
                    </option>
                    <option value="PART_TIME_EMPLOYEE">
                      Empleado de jornada parcial
                    </option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Tarifa por hora</label>
                  <input
                    type="number"
                    min="0"
                    value={engagementForm.hourlyRate}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        hourlyRate: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha inicio</label>
                  <input
                    type="date"
                    value={engagementForm.startDate}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        startDate: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Fecha fin (opcional)</label>
                  <input
                    type="date"
                    value={engagementForm.endDate}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        endDate: e.target.value
                      });
                    }}
                  />
                </div>

                {engagementForm.vinculationType === 'INDEPENDENT_SERVICES' ? (
                  <>
                    <div className="form-group">
                      <label>Concepto de retención</label>
                      <select
                        value={engagementForm.retentionConcept}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            retentionConcept: e.target.value
                          });
                        }}
                      >
                        <option value="SERVICIOS">Servicios</option>
                        <option value="HONORARIOS">Honorarios</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>¿Declarante de renta?</label>
                      <select
                        value={engagementForm.isIncomeTaxFiler ? '1' : '0'}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            isIncomeTaxFiler: e.target.value === '1'
                          });
                        }}
                      >
                        <option value="0">No</option>
                        <option value="1">Sí</option>
                      </select>
                    </div>

                    <div className="form-group full">
                      <label>Objeto / entregable del contrato</label>
                      <input
                        value={engagementForm.deliverableDescription}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            deliverableDescription: e.target.value
                          });
                        }}
                        placeholder="Ej: Elaborar los estados financieros mensuales"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Horas semanales (máx. 42)</label>
                      <input
                        type="number"
                        min="1"
                        max="42"
                        value={engagementForm.weeklyHours}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            weeklyHours: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Tipo contrato DIAN</label>
                      <select
                        value={engagementForm.contractType}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            contractType: e.target.value
                          });
                        }}
                      >
                        <option value="1">Término indefinido</option>
                        <option value="2">Término fijo</option>
                        <option value="3">Obra o labor</option>
                        <option value="5">Otro</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setEngagementModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveEngagement}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Crear vinculación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {timeEntryModal && selectedEngagement && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Registrar horas</h3>

              <button
                className="btn"
                onClick={function() { setTimeEntryModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Periodo desde</label>
                  <input
                    type="date"
                    value={timeEntryForm.periodStart}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        periodStart: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Periodo hasta</label>
                  <input
                    type="date"
                    value={timeEntryForm.periodEnd}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        periodEnd: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Horas trabajadas</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={timeEntryForm.hours}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        hours: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Notas (opcional)</label>
                  <input
                    value={timeEntryForm.notes}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        notes: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setTimeEntryModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveTimeEntry}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Registrar horas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pilaModal && selectedEngagement && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Verificar pago de PILA</h3>

              <button
                className="btn"
                onClick={function() { setPilaModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="info-box" style={{marginBottom: '18px'}}>
                Confirma que el contratista pagó su propia seguridad
                social para este periodo antes de registrar la
                verificación. El IBC mínimo sugerido es el 40% del
                valor mensualizado del contrato (piso de 1 SMMLV).
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Periodo (AAAA-MM)</label>
                  <input
                    value={pilaForm.period}
                    onChange={function(e) {
                      setPilaForm({
                        ...pilaForm,
                        period: e.target.value
                      });
                    }}
                    placeholder="2026-09"
                  />
                </div>

                <div className="form-group">
                  <label>IBC declarado por el contratista</label>
                  <input
                    type="number"
                    min="0"
                    value={pilaForm.declaredIbc}
                    onChange={function(e) {
                      setPilaForm({
                        ...pilaForm,
                        declaredIbc: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group full">
                  <label>Referencia de planilla (opcional)</label>
                  <input
                    value={pilaForm.planillaReference}
                    onChange={function(e) {
                      setPilaForm({
                        ...pilaForm,
                        planillaReference: e.target.value
                      });
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setPilaModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={savePilaVerification}
                disabled={loading}
              >
                {loading ? 'Guardando...' : 'Registrar verificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {settlementModal && selectedEngagement && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Liquidar periodo</h3>

              <button
                className="btn"
                onClick={function() { setSettlementModal(false); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Periodo desde</label>
                  <input
                    type="date"
                    value={settlementForm.periodStart}
                    onChange={function(e) {
                      setSettlementForm({
                        ...settlementForm,
                        periodStart: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Periodo hasta</label>
                  <input
                    type="date"
                    value={settlementForm.periodEnd}
                    onChange={function(e) {
                      setSettlementForm({
                        ...settlementForm,
                        periodEnd: e.target.value
                      });
                    }}
                  />
                </div>

                {selectedEngagement.retentionConcept === 'HONORARIOS' && (
                  <div className="form-group full">
                    <label>Tarifa de retención vigente (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settlementForm.retentionRatePercent}
                      onChange={function(e) {
                        setSettlementForm({
                          ...settlementForm,
                          retentionRatePercent: e.target.value
                        });
                      }}
                      placeholder="Consúltala en la tabla de honorarios de la DIAN"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setSettlementModal(false); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={async function() {
                  await calculateSettlement();
                  setSettlementModal(false);
                }}
                disabled={loading}
              >
                {loading ? 'Calculando...' : 'Calcular liquidación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettlementPreview && settlementResult && settlementResult.dianDocument && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.82)',
            zIndex: 9999,
            overflowY: 'auto',
            padding: '30px 15px'
          }}
        >
          <div
            style={{
              maxWidth: '820px',
              margin: '0 auto',
              background: '#091625',
              border: '1px solid #29415d',
              borderRadius: '10px',
              overflow: 'hidden'
            }}
          >
            <div className="modal-header">
              <h3>Documento DIAN generado</h3>

              <button
                className="btn"
                onClick={function() { setShowSettlementPreview(false); }}
              >
                ✕ Cerrar
              </button>
            </div>

            <div className="modal-body">
              <div className="alert" style={{margin: '0 0 15px'}}>
                {settlementResult.dianDocument.disclaimer ||
                  'Documento generado sin firma digital ni habilitación real ante la DIAN. Debe validarse antes de producción.'}
              </div>

              <pre>{settlementResult.dianDocument.xmlContent}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getEmployeeName(employee) {
  return [
    employee.firstName,
    employee.firstName2,
    employee.lastName,
    employee.lastName2
  ]
    .filter(Boolean)
    .join(' ');
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
</script>
</body>
</html>`;
}
