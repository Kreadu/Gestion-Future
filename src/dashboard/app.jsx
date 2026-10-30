// Dashboard (React). Se compila a JS con scripts/build-dashboard.mjs;
// React, ReactDOM y firebase llegan como globales desde el HTML de src/dashboard.ts.
const { useEffect, useRef, useState } = React;

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

const LEAVE_TYPE_LABELS = {
  GENERAL_INCAPACITY: 'Incapacidad general (enfermedad común)',
  WORK_INCAPACITY: 'Incapacidad laboral (ARL)',
  MATERNITY_LEAVE: 'Licencia de maternidad',
  PATERNITY_LEAVE: 'Licencia de paternidad',
  VACATION: 'Vacaciones disfrutadas'
};

// Fechas en formato AAAA-MM-DD: comparar como texto basta para el
// orden cronológico.
function leaveOverlapsPeriod(leave, period) {
  return period && leave.startDate <= period.periodEnd && leave.endDate >= period.periodStart;
}

// Días de la licencia que realmente caen DENTRO del periodo (una
// licencia puede empezar antes o terminar después del periodo) — es
// una réplica ligera de intersectDateRanges() del backend, sólo para
// mostrar un estimado en el aviso; el backend es la fuente de verdad.
function leaveDaysInPeriod(leave, period) {
  const start = leave.startDate > period.periodStart ? leave.startDate : period.periodStart;
  const end = leave.endDate < period.periodEnd ? leave.endDate : period.periodEnd;

  if (start > end) {
    return 0;
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((new Date(end + 'T00:00:00Z') - new Date(start + 'T00:00:00Z')) / msPerDay) + 1;
}

// Tarjetas clicables (div con onClick): Enter o Espacio las activan
// igual que un clic, sin disparar el clic de la tarjeta cuando el foco
// está en un botón dentro de ella (Editar/Eliminar).
function activateWithKeyboard(e) {
  if (e.target !== e.currentTarget) return;

  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
}

// Escape cierra la ventana modal abierta más reciente, usando su
// propio botón ✕ para respetar la lógica de cierre de cada una.
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;

  const closeButtons = document.querySelectorAll('.modal-backdrop .modal-header button');

  if (closeButtons.length > 0) {
    closeButtons[closeButtons.length - 1].click();
  }
});

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

function downloadText(filename, text, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type: type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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

// ---- Logos de empresa ----
// El listado de empresas sólo trae `hasLogo`/`logoVersion`; la imagen
// se pide aparte a GET /api/companies/:id/logo con el token (no sirve
// un <img src> directo) y se muestra como blob URL. Se cachea una vez
// por empresa y versión.
const companyLogoCache = {};

function fetchCompanyLogoUrl(companyId, version) {
  const cached = companyLogoCache[companyId];

  if (cached && cached.version === version) {
    return cached.promise;
  }

  if (cached) {
    cached.promise.then(function(url) { URL.revokeObjectURL(url); }, function() {});
  }

  const promise = (async function() {
    const currentUser = firebase.auth().currentUser;
    const headers = {};

    if (currentUser) {
      headers.Authorization = 'Bearer ' + await currentUser.getIdToken();
    }

    const response = await fetch(
      '/api/companies/' + encodeURIComponent(companyId) + '/logo?v=' + encodeURIComponent(version || ''),
      { headers: headers }
    );

    if (!response.ok) {
      throw new Error('No se pudo cargar el logo.');
    }

    return URL.createObjectURL(await response.blob());
  })();

  companyLogoCache[companyId] = { version: version, promise: promise };

  promise.catch(function() {
    if (companyLogoCache[companyId] && companyLogoCache[companyId].promise === promise) {
      delete companyLogoCache[companyId];
    }
  });

  return promise;
}

function CompanyLogo({ company, style }) {
  const [src, setSrc] = useState('');
  const id = company ? company.id : '';
  const version = company && company.hasLogo ? String(company.logoVersion || '') : '';

  useEffect(function() {
    let alive = true;
    setSrc('');

    if (id && version) {
      fetchCompanyLogoUrl(id, version).then(
        function(url) { if (alive) setSrc(url); },
        function() {}
      );
    }

    return function() { alive = false; };
  }, [id, version]);

  if (!src) return null;

  return <img src={src} alt={'Logo de ' + company.name} style={style} />;
}

// Reduce el logo en el navegador (máx. 400 px por lado) antes de
// enviarlo. Un SVG pequeño (< 200 KB) se deja tal cual.
const LOGO_MAX_PX = 400;

function resizeLogoFile(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();

    reader.onerror = function() {
      reject(new Error('No se pudo leer el archivo del logo.'));
    };

    reader.onload = function() {
      const dataUrl = String(reader.result || '');

      if (file.type === 'image/svg+xml' && file.size < 200 * 1024) {
        resolve(dataUrl);
        return;
      }

      const img = new Image();

      img.onerror = function() {
        reject(new Error('El archivo del logo no es una imagen válida.'));
      };

      img.onload = function() {
        const w0 = img.naturalWidth || LOGO_MAX_PX;
        const h0 = img.naturalHeight || LOGO_MAX_PX;
        const scale = Math.min(1, LOGO_MAX_PX / Math.max(w0, h0));
        const canvas = document.createElement('canvas');

        canvas.width = Math.max(1, Math.round(w0 * scale));
        canvas.height = Math.max(1, Math.round(h0 * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

        // JPEG se queda en JPEG; el resto en PNG para conservar la transparencia.
        resolve(file.type === 'image/jpeg'
          ? canvas.toDataURL('image/jpeg', 0.9)
          : canvas.toDataURL('image/png'));
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
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
          Kreadu Gestion-Future
        </h1>

        <p style={{ color: '#8193aa', fontSize: '13px', margin: '0 0 24px' }}>
          Inicia sesión para gestionar la nómina de tu empresa.
        </p>

        <p style={{ color: '#8193aa', fontSize: '11px', margin: '-12px 0 18px' }}>
          Al iniciar sesión aceptas los{' '}
          <a href="/legal" target="_blank" rel="noopener" style={{ color: '#93c5fd' }}>
            Términos de uso y la Política de tratamiento de datos
          </a>.
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

      <PageFooter />
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

  if (me.role === 'EMPLOYEE') {
    return <EmployeePortal me={me} onSignOut={signOut} />;
  }

  return <App me={me} onSignOut={signOut} />;
}

function App({ me, onSignOut }) {
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [showRetired, setShowRetired] = useState(false);

  const [companyModal, setCompanyModal] = useState(false);
  const [summaryModal, setSummaryModal] = useState(false);
  const [adminFeePct, setAdminFeePct] = useState('0');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [employeeModal, setEmployeeModal] = useState(false);
  const [importModal, setImportModal] = useState(false);

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
    contractType: '2',
    salary: '',
    address: '',
    city: 'Popayán',
    country: 'Colombia',
    phone: '',
    whatsapp: '',
    hireDate: '',
    bankName: '',
    bankAccountType: 'AHORROS',
    bankAccountNumber: '',
    arlRiskClass: '1'
  });

  const [payrollForm, setPayrollForm] = useState({
    employeeId: '',
    baseSalary: '',
    daysWorked: 30,
    extraDiurna: 0,
    extraNocturna: 0,
    recargoNocturno: 0,
    horasDominicalFestivo: 0,
    horasExtraDominicalFestivo: 0,
    isIntegralSalary: false
  });

  const [payrollResult, setPayrollResult] = useState(null);
  const [dianXmlResult, setDianXmlResult] = useState(null);
  const [showPayrollPreview, setShowPayrollPreview] = useState(false);
  const [disbursementResult, setDisbursementResult] = useState(null);
  const [currentSettlementId, setCurrentSettlementId] = useState('');
  const [currentSettlementStatus, setCurrentSettlementStatus] = useState('');

  const [employeeLeaves, setEmployeeLeaves] = useState([]);
  const [leaveModal, setLeaveModal] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'GENERAL_INCAPACITY',
    startDate: '',
    endDate: '',
    accumulatedDaysBefore: 0,
    notes: ''
  });

  const [periods, setPeriods] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [settlements, setSettlements] = useState([]);
  const [periodModal, setPeriodModal] = useState(false);
  const [showCloseReview, setShowCloseReview] = useState(false);
  const [periodForm, setPeriodForm] = useState({ periodStart: '', periodEnd: '' });

  // ------------------------------------------------------------
  // PERSONAL POR HORAS (bolsa de talento)
  // ------------------------------------------------------------

  const [activeSection, setActiveSection] = useState('payroll');
  const [terminationEmployee, setTerminationEmployee] = useState(null);

  const [professionalQuery, setProfessionalQuery] = useState('');
  const [professionalResults, setProfessionalResults] = useState([]);
  const [searchingProfessionals, setSearchingProfessionals] = useState(false);

  const [engagements, setEngagements] = useState([]);
  const [selectedEngagementId, setSelectedEngagementId] = useState('');
  const [editingEngagementRate, setEditingEngagementRate] = useState(false);
  const [engagementRateInput, setEngagementRateInput] = useState('');

  const [professionalModal, setProfessionalModal] = useState(false);
  const [editingProfessional, setEditingProfessional] = useState(null);
  const [professionalForm, setProfessionalForm] = useState({
    firstName: '',
    firstName2: '',
    lastName: '',
    lastName2: '',
    taxId: '',
    documentType: '13',
    dv: '',
    profession: '',
    email: '',
    phone: '',
    city: '',
    bankName: '',
    bankAccountType: 'AHORROS',
    bankAccountNumber: '',
    defaultHourlyRate: ''
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
    contractType: '2'
  });

  const [timeEntryModal, setTimeEntryModal] = useState(false);
  const [timeEntryForm, setTimeEntryForm] = useState({
    periodStart: '',
    periodEnd: '',
    hours: '',
    notes: ''
  });

  const [pilaModal, setPilaModal] = useState(false);
  const [pilaVerifications, setPilaVerifications] = useState([]);
  const pilaVerificationsLoadSeq = useRef(0);
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

  // El motor soporta varias incapacidades/licencias dentro de un
  // mismo periodo (se suman), así que se detectan TODAS las que
  // se solapen, no solo la primera.
  const detectedLeaves = selectedPeriod
    ? employeeLeaves.filter(function(lv) {
        return leaveOverlapsPeriod(lv, selectedPeriod);
      })
    : [];

  const detectedLeavesDaysInPeriod = selectedPeriod
    ? detectedLeaves.reduce(function(sum, lv) {
        return sum + leaveDaysInPeriod(lv, selectedPeriod);
      }, 0)
    : 0;

  const maxDaysWorkedWithLeaves = 30 - detectedLeavesDaysInPeriod;

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
    if (selectedCompanyId) loadEmployees(selectedCompanyId);
  }, [showRetired]);

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

  useEffect(function() {
    setEditingEngagementRate(false);
    loadPilaVerifications(selectedEngagementId);
  }, [selectedEngagementId]);

  // Si hay licencias detectadas para el periodo y "Días trabajados"
  // ya no cabe junto con ellas (ej. se acaba de registrar una nueva
  // y el campo se quedó en 30), se ajusta solo — evita que el
  // cálculo se rechace en silencio por un valor que quedó
  // desactualizado, sin que la persona tenga que restar a mano.
  useEffect(function() {
    if (
      detectedLeavesDaysInPeriod > 0 &&
      Number(payrollForm.daysWorked) > maxDaysWorkedWithLeaves
    ) {
      setPayrollForm(function(prev) {
        return { ...prev, daysWorked: maxDaysWorkedWithLeaves };
      });
    }
  }, [detectedLeavesDaysInPeriod]);

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
        '/api/employees?companyId=' + encodeURIComponent(companyId) +
          (showRetired ? '&includeRetired=1' : '')
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
      recargoNocturno: 0,
      horasDominicalFestivo: 0,
      horasExtraDominicalFestivo: 0,
      isIntegralSalary: false
    });

    setPayrollResult(null);
    setDianXmlResult(null);
    setDisbursementResult(null);
    setCurrentSettlementId('');
    setCurrentSettlementStatus('');
    setEmployeeLeaves([]);
  }

  async function loadEmployeeLeaves(employeeId) {
    try {
      const result = await api(
        '/api/employee-leaves?employeeId=' + encodeURIComponent(employeeId)
      );

      setEmployeeLeaves(Array.isArray(result.data) ? result.data : []);
    } catch (err) {
      setEmployeeLeaves([]);
    }
  }

  const currentSettlement = settlements.find(function(s) {
    return s.id === currentSettlementId;
  }) || null;

  // Se puede regenerar mientras la DIAN no tenga el documento (sin enviar o rechazado).
  const canGenerateDianXml = !currentSettlement ||
    currentSettlementStatus !== 'GENERATED' ||
    !currentSettlement.dianSubmissionStatus ||
    currentSettlement.dianSubmissionStatus === 'REJECTED';

  function findSettlementForEmployee(employeeId) {
    return settlements.find(function(s) {
      return s.employeeId === employeeId;
    });
  }

  function selectEmployeeForPayroll(employee) {
    clearMessages();

    setSelectedEmp(employee);
    setDisbursementResult(null);
    loadEmployeeLeaves(employee.id);

    setPayrollForm({
      employeeId: employee.id,
      baseSalary: employee.salary,
      daysWorked: 30,
      extraDiurna: 0,
      extraNocturna: 0,
      recargoNocturno: 0,
      horasDominicalFestivo: 0,
      horasExtraDominicalFestivo: 0,
      isIntegralSalary: false
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
      economicActivity: '',
      isExempt114_1: false,
      arlCode: '',
      divipolaCode: '',
      arlActivityCode: ''
    });

    setTermsAccepted(false);
    setCompanyModal(true);
  }

  function openEditCompany() {
    if (!selectedCompany) return;

    clearMessages();
    setEditingCompany(selectedCompany);

    setCompanyForm({
      logo: undefined,
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
      economicActivity: selectedCompany.economicActivity || '',
      isExempt114_1: !!selectedCompany.isExempt114_1,
      arlCode: selectedCompany.arlCode || '',
      divipolaCode: selectedCompany.divipolaCode || '',
      arlActivityCode: selectedCompany.arlActivityCode || ''
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

      if (!editingCompany && !termsAccepted) {
        throw new Error(
          'Debes aceptar los Términos de uso y la Política de ' +
          'tratamiento de datos para crear la empresa.'
        );
      }

      setLoading(true);

      const payload = {
        ...companyForm,
        acceptedTermsVersion: editingCompany ? undefined : window.__LEGAL_VERSION__
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
      contractType: '2',
      salary: '',
      address: '',
      city: selectedCompany.city || 'Popayán',
      country: 'Colombia',
      phone: '',
      whatsapp: '',
      hireDate: '',
      bankName: '',
      bankAccountType: 'AHORROS',
      bankAccountNumber: '',
      arlRiskClass: '1',
      contractEndDate: '',
      vacationDaysTakenBefore: 0,
      isIntegralSalary: false,
      documentType: 'CC',
      epsCode: '',
      afpCode: '',
      ccfCode: '',
      divipolaCode: ''
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
      contractType: employee.contractType || '2',
      salary: employee.salary || '',
      address: employee.address || '',
      city: employee.city || '',
      country: employee.country || 'Colombia',
      phone: employee.phone || '',
      whatsapp: employee.whatsapp || '',
      hireDate: employee.hireDate || '',
      bankName: employee.bankName || '',
      bankAccountType: employee.bankAccountType || 'AHORROS',
      bankAccountNumber: employee.bankAccountNumber || '',
      arlRiskClass: String(employee.arlRiskClass || 1),
      contractEndDate: employee.contractEndDate || '',
      vacationDaysTakenBefore: employee.vacationDaysTakenBefore || 0,
      isIntegralSalary: !!employee.isIntegralSalary,
      documentType: employee.documentType || 'CC',
      epsCode: employee.epsCode || '',
      afpCode: employee.afpCode || '',
      ccfCode: employee.ccfCode || '',
      divipolaCode: employee.divipolaCode || ''
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

  async function onPeriodClosed() {
    setShowCloseReview(false);
    clearMessages();
    setSuccess('Periodo cerrado correctamente.');
    await loadPeriods(selectedCompanyId);
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
          },
          horasDominicalFestivo: Number(payrollForm.horasDominicalFestivo) || 0,
          horasExtraDominicalFestivo: Number(payrollForm.horasExtraDominicalFestivo) || 0,
          isIntegralSalary: !!payrollForm.isIntegralSalary
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

  function openLeaveModal(leave) {
    clearMessages();
    setEditingLeave(leave || null);

    setLeaveForm(
      leave
        ? {
            leaveType: leave.leaveType,
            startDate: leave.startDate,
            endDate: leave.endDate,
            accumulatedDaysBefore: leave.accumulatedDaysBefore || 0,
            businessDays: leave.businessDays || '',
            notes: leave.notes || ''
          }
        : {
            leaveType: 'GENERAL_INCAPACITY',
            startDate: '',
            endDate: '',
            accumulatedDaysBefore: 0,
            businessDays: '',
            notes: ''
          }
    );

    setLeaveModal(true);
  }

  async function saveLeave() {
    try {
      clearMessages();

      if (!selectedEmp) {
        throw new Error('Selecciona un empleado.');
      }

      if (!leaveForm.startDate || !leaveForm.endDate) {
        throw new Error('La fecha de inicio y de fin son obligatorias.');
      }

      if (leaveForm.endDate < leaveForm.startDate) {
        throw new Error('La fecha de fin no puede ser anterior a la de inicio.');
      }

      setLoading(true);

      const payload = {
        employeeId: selectedEmp.id,
        leaveType: leaveForm.leaveType,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        accumulatedDaysBefore:
          leaveForm.leaveType === 'GENERAL_INCAPACITY'
            ? Number(leaveForm.accumulatedDaysBefore) || 0
            : 0,
        businessDays:
          leaveForm.leaveType === 'VACATION' && leaveForm.businessDays !== ''
            ? Number(leaveForm.businessDays)
            : undefined,
        notes: leaveForm.notes
      };

      if (editingLeave) {
        await api('/api/employee-leaves/' + encodeURIComponent(editingLeave.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Incapacidad/licencia actualizada correctamente.');
      } else {
        await api('/api/employee-leaves', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        setSuccess('Incapacidad/licencia registrada correctamente.');
      }

      setLeaveModal(false);
      setEditingLeave(null);

      await loadEmployeeLeaves(selectedEmp.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteLeave(leave) {
    if (!selectedEmp) {
      return;
    }

    if (!window.confirm(
      '¿Eliminar esta incapacidad/licencia (' +
      LEAVE_TYPE_LABELS[leave.leaveType] + ', del ' + leave.startDate +
      ' al ' + leave.endDate + ')?'
    )) {
      return;
    }

    try {
      clearMessages();
      setLoading(true);

      await api('/api/employee-leaves/' + encodeURIComponent(leave.id), {
        method: 'DELETE'
      });

      setSuccess('Incapacidad/licencia eliminada correctamente.');

      await loadEmployeeLeaves(selectedEmp.id);
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
  // RESUMEN DEL PERIODO — costo total para la empresa cliente
  // ------------------------------------------------------------

  function buildPeriodSummary() {
    const rows = settlements
      .filter(function(s) { return s.calculation; })
      .map(function(s) {
        const c = s.calculation;
        const contributions = c.employerContributions.totalContributions;
        const provisions = c.provisions.totalProvisions;

        return {
          name: getEmployeeName(s.employee),
          taxId: s.employee.taxId,
          gross: c.grossEarnings,
          deductions: c.employeeDeductions.totalDeductions,
          net: c.netPay,
          contributions: contributions,
          provisions: provisions,
          // Costo para la empresa: todo lo devengado (lo que recibe el
          // trabajador más lo que se le descuenta para seguridad
          // social y retención) + aportes del empleador + provisiones.
          cost: c.grossEarnings + contributions + provisions
        };
      });

    const totals = rows.reduce(function(acc, r) {
      return {
        gross: acc.gross + r.gross,
        deductions: acc.deductions + r.deductions,
        net: acc.net + r.net,
        contributions: acc.contributions + r.contributions,
        provisions: acc.provisions + r.provisions,
        cost: acc.cost + r.cost
      };
    }, { gross: 0, deductions: 0, net: 0, contributions: 0, provisions: 0, cost: 0 });

    const feePct = Math.max(Number(adminFeePct) || 0, 0);
    const fee = totals.cost * feePct / 100;

    return { rows: rows, totals: totals, feePct: feePct, fee: fee, invoice: totals.cost + fee };
  }

  function exportPeriodSummaryCsv() {
    const summary = buildPeriodSummary();
    const money = function(v) { return String(Math.round(v)); };
    // Excel en español usa ';' como separador.
    const line = function(cells) {
      return cells.map(function(c) {
        return '"' + String(c).replace(/"/g, '""') + '"';
      }).join(';');
    };

    const lines = [
      line(['Empresa', selectedCompany ? selectedCompany.name : '']),
      line(['Periodo', selectedPeriod.periodStart + ' a ' + selectedPeriod.periodEnd]),
      '',
      line(['Empleado', 'Documento', 'Devengado', 'Deducciones', 'Neto a pagar',
        'Aportes empleador', 'Provisiones', 'Costo total empresa'])
    ];

    summary.rows.forEach(function(r) {
      lines.push(line([r.name, r.taxId, money(r.gross), money(r.deductions), money(r.net),
        money(r.contributions), money(r.provisions), money(r.cost)]));
    });

    const t = summary.totals;
    lines.push(line(['TOTAL', '', money(t.gross), money(t.deductions), money(t.net),
      money(t.contributions), money(t.provisions), money(t.cost)]));
    lines.push('');
    lines.push(line(['Administración (' + summary.feePct + '%)', money(summary.fee)]));
    lines.push(line(['Total a facturar', money(summary.invoice)]));

    downloadText(
      'resumen-nomina-' + selectedPeriod.periodStart + '.csv',
      '\ufeff' + lines.join('\r\n'),
      'text/csv;charset=utf-8'
    );
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
    setEditingProfessional(null);

    setProfessionalForm({
      firstName: '',
      firstName2: '',
      lastName: '',
      lastName2: '',
      taxId: '',
      documentType: '13',
      dv: '',
      profession: '',
      email: '',
      phone: '',
      city: '',
      bankName: '',
      bankAccountType: 'AHORROS',
      bankAccountNumber: '',
      defaultHourlyRate: ''
    });

    setProfessionalModal(true);
  }

  function openEditProfessional(professional) {
    clearMessages();
    setEditingProfessional(professional);

    setProfessionalForm({
      firstName: professional.firstName || '',
      firstName2: professional.firstName2 || '',
      lastName: professional.lastName || '',
      lastName2: professional.lastName2 || '',
      taxId: professional.taxId || '',
      documentType: professional.documentType || '13',
      dv: professional.dv || '',
      profession: professional.profession || '',
      email: professional.email || '',
      phone: professional.phone || '',
      city: professional.city || '',
      bankName: professional.bankName || '',
      bankAccountType: professional.bankAccountType || 'AHORROS',
      bankAccountNumber: professional.bankAccountNumber || '',
      defaultHourlyRate: professional.defaultHourlyRate
        ? String(professional.defaultHourlyRate)
        : ''
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

      if (editingProfessional) {
        const result = await api('/api/professionals/' + encodeURIComponent(editingProfessional.id), {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(professionalForm)
        });

        setSuccess('Profesional actualizado correctamente.');
        setProfessionalModal(false);
        setEditingProfessional(null);

        if (selectedCompany) {
          await loadEngagements(selectedCompany.id);
        }

        if (engagementProfessional && engagementProfessional.id === result.data.id) {
          setEngagementProfessional(result.data);
        }
      } else {
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
      }
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
      // Precargada desde la tarifa "por defecto" del profesional
      // (si tiene una); la empresa siempre la puede cambiar para
      // esta vinculación puntual.
      hourlyRate: professional && professional.defaultHourlyRate
        ? String(professional.defaultHourlyRate)
        : '',
      startDate: '',
      endDate: '',
      retentionConcept: 'SERVICIOS',
      isIncomeTaxFiler: false,
      deliverableDescription: '',
      weeklyHours: '',
      contractType: '2'
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

  function openEditEngagementRate(engagement) {
    clearMessages();
    setEngagementRateInput(String(engagement.hourlyRate));
    setEditingEngagementRate(true);
  }

  async function saveEngagementRate(engagement) {
    try {
      clearMessages();

      const hourlyRate = Number(engagementRateInput);

      if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
        throw new Error('La tarifa por hora debe ser mayor que cero.');
      }

      setLoading(true);

      await api('/api/engagements/' + encodeURIComponent(engagement.id), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hourlyRate })
      });

      setSuccess('Tarifa por hora actualizada correctamente.');
      setEditingEngagementRate(false);

      if (selectedCompany) {
        await loadEngagements(selectedCompany.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  async function loadPilaVerifications(engagementId) {
    const loadSeq = ++pilaVerificationsLoadSeq.current;
    setPilaVerifications([]);
    if (!engagementId) return;
    try {
      const result = await api('/api/pila-verifications?engagementId=' + encodeURIComponent(engagementId));
      if (loadSeq === pilaVerificationsLoadSeq.current) setPilaVerifications(result.data || []);
    } catch (_) {
      // Si no se puede comprobar, mantenemos visible el aviso preventivo.
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
      await loadPilaVerifications(selectedEngagement.id);
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
              <span>Dominical/festivo</span>
              <strong>{formatCOP(payrollResult.dominicalFestivoValue)}</strong>
            </div>

            <div className="result-row">
              <span>Incapacidad/licencia</span>
              <strong>{formatCOP(payrollResult.leaveValue)}</strong>
            </div>

            <div className="result-row">
              <span>Total devengado</span>
              <strong>{formatCOP(payrollResult.grossEarnings)}</strong>
            </div>
          </div>

          {payrollResult.leaveValue > 0 && (
            <div className="info-box" style={{margin: '0 18px 18px'}}>
              De la incapacidad/licencia, {formatCOP(payrollResult.reimbursableAmount)}{' '}
              son recobrables a EPS/ARL. Este valor ya está incluido en lo
              que se le paga al empleado (el empleado cobra todo, ahora,
              sin esperar nada) — lo recobrable es lo que la empresa
              puede reclamarle después a la EPS/ARL, no cambia el pago
              al empleado.
            </div>
          )}

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
              <span>Retención en la fuente</span>
              <strong>{formatCOP(deductions.retencionFuente)}</strong>
            </div>

            <div className="result-row">
              <span>Total deducciones</span>
              <strong>{formatCOP(deductions.totalDeductions)}</strong>
            </div>
          </div>

          {payrollResult.complianceNotes && payrollResult.complianceNotes.length > 0 && (
            <div className="info-box" style={{margin: '0 18px 18px'}}>
              {payrollResult.complianceNotes.map(function(note, index) {
                return <div key={index} style={{marginBottom: '5px'}}>⚠️ {note}</div>;
              })}
            </div>
          )}

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
              disabled={loading || !canGenerateDianXml}
            >
              {currentSettlementStatus !== 'GENERATED'
                ? '🧾 Generar XML DIAN'
                : canGenerateDianXml
                  ? '🔁 Volver a generar XML'
                  : '✅ XML ya generado'}
            </button>
          </div>

          <DianSubmissionPanel
            key={currentSettlementId}
            settlement={currentSettlement}
            onChanged={function() { return loadSettlements(selectedPeriodId); }}
          />

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
                      KREADU GESTION-FUTURE
                    </div>

                    <h2 style={{margin: '5px 0', fontSize: '22px'}}>
                      Nómina Individual
                    </h2>

                    <div style={{fontSize: '13px', color: '#64748b'}}>
                      Liquidación de nómina · Colombia
                    </div>

                    {selectedCompany && (
                      <div style={{fontSize: '13px', marginTop: '4px'}}>
                        {selectedCompany.name}
                        {selectedCompany.nit && (
                          <> · NIT {selectedCompany.nit}{selectedCompany.dv ? '-' + selectedCompany.dv : ''}</>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
                    {selectedCompany && selectedCompany.hasLogo && (
                      <CompanyLogo company={selectedCompany} style={{maxHeight: '42px', maxWidth: '120px', objectFit: 'contain'}} />
                    )}

                    <button
                      className="btn"
                      onClick={() => setShowPayrollPreview(false)}
                    >
                      ✕ Cerrar
                    </button>
                  </div>
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

                      {selectedEmp && selectedEmp.position && (
                        <div style={{marginTop: '5px', fontSize: '13px'}}>
                          Cargo: {selectedEmp.position}
                        </div>
                      )}

                      {selectedEmp && selectedEmp.hireDate && (
                        <div style={{marginTop: '5px', fontSize: '13px'}}>
                          Fecha de ingreso: {selectedEmp.hireDate}
                        </div>
                      )}
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

                      {selectedPeriod && (
                        <div style={{marginTop: '7px', fontSize: '13px'}}>
                          Del {selectedPeriod.periodStart} al {selectedPeriod.periodEnd}
                        </div>
                      )}

                      <div style={{marginTop: '5px', fontSize: '13px'}}>
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
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Dominical/festivo
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.dominicalFestivoValue)}
                        </td>
                      </tr>

                      <tr>
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Incapacidad/licencia
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(payrollResult.leaveValue)}
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
                        <td style={{padding: '9px 5px', borderBottom: '1px solid #e5e7eb'}}>
                          Retención en la fuente
                        </td>
                        <td style={{
                          padding: '9px 5px',
                          borderBottom: '1px solid #e5e7eb',
                          textAlign: 'right'
                        }}>
                          {formatCOP(deductions.retencionFuente)}
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
                    Documento generado por Kreadu Gestion-Future.
                    Esta vista es una representación visual de la liquidación.
                    El documento técnico para nómina electrónica se encuentra
                    en el XML DIAN.
                  </div>

                  {renderKreaduFooter()}

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
            {editingEngagementRate ? (
              <span style={{display: 'inline-flex', alignItems: 'center', gap: '6px'}}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={engagementRateInput}
                  onChange={function(e) { setEngagementRateInput(e.target.value); }}
                  style={{width: '110px', display: 'inline-block'}}
                />
                /hora
                <button
                  className="btn btn-primary"
                  style={{padding: '3px 8px', fontSize: '12px'}}
                  onClick={function() { saveEngagementRate(engagement); }}
                  disabled={loading}
                >
                  Guardar
                </button>
                <button
                  className="btn"
                  style={{padding: '3px 8px', fontSize: '12px'}}
                  onClick={function() { setEditingEngagementRate(false); }}
                >
                  Cancelar
                </button>
              </span>
            ) : (
              <>
                {formatCOP(engagement.hourlyRate)}/hora
                {' '}
                <button
                  className="btn"
                  style={{padding: '2px 7px', fontSize: '11px'}}
                  onClick={function() { openEditEngagementRate(engagement); }}
                >
                  ✏️ Editar tarifa
                </button>
              </>
            )}
          </span>
        </div>

        <div className="button-row" style={{marginBottom: '18px'}}>
          <button
            className="btn"
            onClick={function() { openEditProfessional(professional); }}
          >
            ✏️ Editar profesional
          </button>
        </div>

        {isIndependent && pilaVerifications.length === 0 && (
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

              <button
                className="btn btn-danger"
                onClick={async function() {
                  if (!confirm('¿Anular esta liquidación para poder rehacerla?')) return;
                  try {
                    clearMessages();
                    await api('/api/hourly/settlements/' + encodeURIComponent(settlementResult.id), { method: 'DELETE' });
                    setSettlementResult(null);
                    setSuccess('Liquidación anulada: puedes liquidar el periodo de nuevo.');
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                Anular liquidación
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
                <label htmlFor="gf-field-1-buscar-por-nombre-o-profesion">Buscar por nombre o profesión</label>
                <input id="gf-field-1-buscar-por-nombre-o-profesion"
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
                    <div
                      key={professional.id}
                      className="employee-card"
                      role="button"
                    tabIndex={0}
                    onKeyDown={activateWithKeyboard}
                    onClick={function() {
                        openNewEngagement(professional);
                      }}
                    >
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
                          onClick={function(e) {
                            e.stopPropagation();
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
                    role="button"
                    tabIndex={0}
                    onKeyDown={activateWithKeyboard}
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
      <PageFooter />

      {terminationEmployee && (
        <TerminationModal
          employee={terminationEmployee}
          company={selectedCompany}
          onClose={function() { setTerminationEmployee(null); }}
          onDone={function() {
            setTerminationEmployee(null);
            setSelectedEmp(null);
            setSuccess('Empleado retirado. La liquidación definitiva quedó guardada.');
            loadEmployees(selectedCompanyId);
          }}
        />
      )}

      <header className="header">
        <div className="brand">
          <div className="brand-logo">K</div>

          <div>
            <h1>Kreadu Gestion-Future</h1>
            <p>Sistema de gestión de nómina multiempresa</p>
          </div>
        </div>

        <div className="header-right">
          <span className="badge">Motor Colombia 2026</span>

          <div className="company-selector">
            {selectedCompany && selectedCompany.hasLogo && <CompanyLogo company={selectedCompany} style={{height: '30px', maxWidth: '80px', objectFit: 'contain', background: '#fff', borderRadius: '6px', padding: '2px'}} />}
            <select
              aria-label="Empresa"
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
              aria-label="Editar empresa"
              title="Editar empresa"
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
        {isSuperAdmin && (
          <button
            className={'btn' + (activeSection === 'overview' ? ' btn-primary' : '')}
            onClick={function() { setActiveSection('overview'); }}
          >
            🏢 Panel de empresas
          </button>
        )}

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

        <button
          className={'btn' + (activeSection === 'benefits' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('benefits'); }}
        >
          🎁 Prestaciones
        </button>

        <button
          className={'btn' + (activeSection === 'users' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('users'); }}
        >
          👤 Usuarios
        </button>

        <button
          className={'btn' + (activeSection === 'requests' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('requests'); }}
        >
          📨 Solicitudes
        </button>

        <button
          className={'btn' + (activeSection === 'activity' ? ' btn-primary' : '')}
          onClick={function() { setActiveSection('activity'); }}
        >
          🗂️ Actividad
        </button>
      </div>

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="alert success" role="status">
          {success}
        </div>
      )}

      {activeSection === 'hourly' && renderHourlySection()}

      {activeSection === 'benefits' && (
        <BenefitsSection
          company={selectedCompany}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}

      {activeSection === 'overview' && (
        <OverviewSection
          onError={setError}
          onOpenCompany={function(id) {
            setSelectedCompanyId(id);
            setActiveSection('payroll');
          }}
        />
      )}

      {activeSection === 'activity' && (
        <ActivitySection company={selectedCompany} onError={setError} />
      )}

      {activeSection === 'requests' && (
        <RequestsSection
          company={selectedCompany}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}

      {activeSection === 'users' && (
        <UsersSection
          me={me}
          company={selectedCompany}
          employees={employees}
          onError={setError}
          onSuccess={setSuccess}
        />
      )}

      {activeSection === 'payroll' && (
      <main className="layout">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>👥 Empleados</h2>
              <span>
                {employees.filter(function(e) { return e.active; }).length} activo(s)
              </span>
              <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', marginTop: '4px' }}>
                <input
                  type="checkbox"
                  checked={showRetired}
                  onChange={function(e) { setShowRetired(e.target.checked); }}
                />
                Ver retirados
              </label>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={function() { setImportModal(true); }}
                disabled={!selectedCompany}
              >
                📥 Importar desde Excel
              </button>
              <button
                className="btn btn-primary"
                onClick={openNewEmployee}
                disabled={!selectedCompany}
              >
                + Empleado
              </button>
            </div>
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

                if (!employee.active) {
                  return (
                    <div key={employee.id} className="employee-card" style={{ opacity: 0.8 }}>
                      <div className="employee-name">
                        {getEmployeeName(employee)}
                      </div>
                      <div className="employee-meta">
                        CC/NIT: {employee.taxId}
                        <br />
                        <span className="badge">Retirado el {employee.terminationDate}</span>
                      </div>
                      <div className="button-row" style={{marginTop: '9px'}}>
                        <CertificatesButton employee={employee} />
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={employee.id}
                    className={
                      'employee-card' +
                      (isSelected ? ' selected' : '')
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={activateWithKeyboard}
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
                  <label htmlFor="gf-field-2-periodo">Periodo</label>
                  <select id="gf-field-2-periodo"
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
                    onClick={function() { setShowCloseReview(true); }}
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

                {selectedPeriod && (
                  <button
                    className="btn"
                    onClick={function() { setSummaryModal(true); }}
                  >
                    📊 Resumen del periodo
                  </button>
                )}

                {selectedPeriod && <PilaButton period={selectedPeriod} />}
                {selectedPeriod && <AccountingButton period={selectedPeriod} />}

                {showCloseReview && selectedPeriod && (
                  <CloseReviewModal
                    period={selectedPeriod}
                    onClosed={onPeriodClosed}
                    onClose={function() { setShowCloseReview(false); }}
                  />
                )}
              </div>

              {disbursementResult && (
                <>
                  <button
                    className="btn btn-secondary"
                    style={{marginTop: '10px'}}
                    onClick={function() {
                      downloadText(
                        'dispersion-' + selectedPeriod.periodStart + '.csv',
                        '\ufeff' + disbursementResult.replace(/\n/g, '\r\n'),
                        'text/csv;charset=utf-8'
                      );
                    }}
                  >
                    ⬇️ Descargar CSV
                  </button>
                  <pre style={{marginTop: '10px'}}>{disbursementResult}</pre>
                </>
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

                  <VacationBalance employee={selectedEmp} />

                  <div style={{ marginTop: '8px' }}>
                    <button
                      className="btn"
                      onClick={function() { setTerminationEmployee(selectedEmp); }}
                    >
                      🚪 Retiro y liquidación definitiva
                    </button>
                    {' '}<CertificatesButton employee={selectedEmp} />
                  </div>

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
                      <label htmlFor="gf-field-3-empleado">Empleado</label>
                      <input id="gf-field-3-empleado"
                        value={getEmployeeName(selectedEmp)}
                        disabled
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="gf-field-4-salario-mensual" className="required">Salario mensual</label>
                      <input id="gf-field-4-salario-mensual"
                        value={formatCOP(payrollForm.baseSalary)}
                        disabled required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="gf-field-5-dias-trabajados">Días trabajados</label>
                      <input id="gf-field-5-dias-trabajados"
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
                    🩹 Incapacidades, licencias y vacaciones
                  </div>

                  {detectedLeaves.length > 0 ? (
                    <div className="info-box">
                      <div>
                        {detectedLeaves.length === 1
                          ? 'Se detectó 1 incapacidad/licencia:'
                          : 'Se detectaron ' + detectedLeaves.length + ' incapacidades/licencias:'}
                      </div>

                      <ul style={{margin: '8px 0 0', paddingLeft: '18px'}}>
                        {detectedLeaves.map(function(lv) {
                          return (
                            <li key={lv.id} style={{marginBottom: '4px'}}>
                              {LEAVE_TYPE_LABELS[lv.leaveType]}
                              {' — '}{lv.totalDays} días, del {lv.startDate} al {lv.endDate}
                            </li>
                          );
                        })}
                      </ul>

                      <div style={{marginTop: '8px'}}>
                        El motor {detectedLeaves.length === 1 ? 'la aplicará' : 'las sumará'} automáticamente al calcular la nómina de este periodo.
                      </div>

                      <div style={{
                        marginTop: '8px',
                        fontWeight: '700',
                        color: Number(payrollForm.daysWorked) > maxDaysWorkedWithLeaves ? '#fca5a5' : '#94a9c0'
                      }}>
                        Días trabajados máximo para que cuadren con {detectedLeaves.length === 1 ? 'esta licencia' : 'estas licencias'}:{' '}
                        {maxDaysWorkedWithLeaves} (30 − {detectedLeavesDaysInPeriod} días de licencia en este periodo).
                        {Number(payrollForm.daysWorked) > maxDaysWorkedWithLeaves && ' Ajusta el campo de abajo antes de calcular.'}
                      </div>
                    </div>
                  ) : employeeLeaves.length > 0 ? (
                    <div className="info-box">
                      <div>
                        ⚠️ Este empleado tiene {employeeLeaves.length === 1 ? '1 incapacidad/licencia registrada' : employeeLeaves.length + ' incapacidades/licencias registradas'},
                        {' '}pero ninguna cae dentro de las fechas de este periodo
                        {selectedPeriod ? ' (' + selectedPeriod.periodStart + ' al ' + selectedPeriod.periodEnd + ')' : ''}:
                      </div>

                      <ul style={{margin: '8px 0 0', paddingLeft: '18px'}}>
                        {employeeLeaves.map(function(lv) {
                          return (
                            <li key={lv.id} style={{marginBottom: '4px'}}>
                              {LEAVE_TYPE_LABELS[lv.leaveType]}
                              {' — '}del {lv.startDate} al {lv.endDate}
                            </li>
                          );
                        })}
                      </ul>

                      <div style={{marginTop: '8px'}}>
                        Revisa si el periodo o las fechas de la licencia están bien.
                      </div>
                    </div>
                  ) : (
                    <div className="info-box">
                      No se detectó ninguna incapacidad o licencia de este
                      empleado que se solape con el periodo seleccionado.
                    </div>
                  )}

                  {employeeLeaves.length > 0 && (
                    <div style={{marginTop: '10px'}}>
                      {employeeLeaves.map(function(lv) {
                        return (
                          <div
                            key={lv.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '10px',
                              padding: '8px 10px',
                              border: '1px solid #203750',
                              borderRadius: '8px',
                              marginBottom: '6px',
                              fontSize: '12px'
                            }}
                          >
                            <span>
                              {LEAVE_TYPE_LABELS[lv.leaveType]}
                              {' — '}{lv.totalDays} días, del {lv.startDate} al {lv.endDate}
                            </span>

                            <span style={{display: 'flex', gap: '6px', flexShrink: 0}}>
                              <button
                                className="btn"
                                style={{padding: '4px 9px', fontSize: '12px'}}
                                onClick={function() { openLeaveModal(lv); }}
                              >
                                ✏️ Editar
                              </button>

                              <button
                                className="btn"
                                style={{padding: '4px 9px', fontSize: '12px'}}
                                onClick={function() { deleteLeave(lv); }}
                              >
                                🗑️ Eliminar
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="button-row" style={{marginTop: '10px'}}>
                    <button
                      className="btn"
                      onClick={function() { openLeaveModal(); }}
                      disabled={currentSettlementStatus === 'GENERATED'}
                    >
                      + Registrar incapacidad, licencia o vacaciones
                    </button>
                  </div>
                </div>

                <div className="section">
                  <div className="section-title">
                    ⏱️ Horas extras y recargos
                  </div>

                  <div className="info-box" style={{marginBottom: '13px'}}>
                    Las horas se escriben en formato decimal (minutos ÷ 60),
                    no en horas y minutos: 15 min = 0.25, 30 min = 0.5,
                    45 min = 0.75. Ej: 1 hora 15 minutos se escribe{' '}
                    <strong>1.25</strong>.
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
                      <label htmlFor="gf-field-6-extra-diurna">Extra diurna</label>
                      <input id="gf-field-6-extra-diurna"
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
                      <label htmlFor="gf-field-7-extra-nocturna">Extra nocturna</label>
                      <input id="gf-field-7-extra-nocturna"
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
                      <label htmlFor="gf-field-8-recargo-nocturno">Recargo nocturno</label>
                      <input id="gf-field-8-recargo-nocturno"
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

                    <div className="form-group">
                      <label htmlFor="gf-field-9-dominical-festivo">Dominical/festivo</label>
                      <input id="gf-field-9-dominical-festivo"
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.horasDominicalFestivo}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            horasDominicalFestivo: e.target.value
                          });
                        }}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="gf-field-10-extra-dominical-festivo">Extra dominical/festivo</label>
                      <input id="gf-field-10-extra-dominical-festivo"
                        type="number"
                        min="0"
                        step="0.01"
                        value={payrollForm.horasExtraDominicalFestivo}
                        disabled={currentSettlementStatus === 'GENERATED'}
                        onChange={function(e) {
                          setPayrollForm({
                            ...payrollForm,
                            horasExtraDominicalFestivo: e.target.value
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-grid" style={{marginTop: '13px'}}>
                    <div className="form-group">
                      <label>
                        <input
                          type="checkbox"
                          checked={payrollForm.isIntegralSalary}
                          disabled={currentSettlementStatus === 'GENERATED'}
                          onChange={function(e) {
                            setPayrollForm({
                              ...payrollForm,
                              isIntegralSalary: e.target.checked
                            });
                          }}
                          style={{marginRight: '7px'}}
                        />
                        Salario integral (mínimo 13 SMMLV)
                      </label>
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
                aria-label="Cerrar"
                onClick={function() {
                  setCompanyModal(false);
                }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {!editingCompany && (
                <div className="legal-box">
                  <div style={{ fontWeight: '700', marginBottom: '6px' }}>
                    📜 Términos de uso y Política de tratamiento de datos
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 8px' }}>
                    Léelos antes de crear la empresa. En la nómina de esta
                    empresa, ella es la Responsable de los datos de sus
                    trabajadores y Kreadu actúa como Encargado del tratamiento.
                  </p>
                  <iframe
                    src="/legal"
                    title="Términos de uso y Política de tratamiento de datos"
                    className="legal-frame"
                  />
                  <label className="legal-accept">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={function(e) {
                        setTermsAccepted(e.target.checked);
                      }}
                    />
                    <span>
                      Declaro que tengo facultades para representar a la
                      empresa, que acepto los Términos de uso y la Política de
                      tratamiento de datos (versión {window.__LEGAL_VERSION__}),
                      y que la empresa cuenta con la autorización de sus
                      trabajadores y contratistas para tratar sus datos,
                      incluidos los de salud (incapacidades y licencias).
                      {' '}
                      <a href="/legal" target="_blank" rel="noopener">Abrir en otra pestaña</a>
                    </span>
                  </label>
                </div>
              )}

              <div className="form-grid">
                <div className="form-group full">
                  <div style={{
                    marginBottom: '18px',
                    padding: '16px',
                    border: '1px solid #334155',
                    borderRadius: '10px',
                    background: '#020617'
                  }}>
                    <label htmlFor="f-companyForm-logo" style={{
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
                      ) : companyForm.logo === undefined && editingCompany && editingCompany.hasLogo ? (
                        <CompanyLogo company={editingCompany} style={{width: '90px', height: '90px', objectFit: 'contain', background: '#fff', borderRadius: '8px', padding: '6px'}} />
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
                        <input id="f-companyForm-logo"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          style={{fontSize: '12px'}}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            if (file.size > 10 * 1024 * 1024) {
                              setError('El archivo original no puede superar 10 MB.');
                              return;
                            }

                            resizeLogoFile(file).then(
                              function(logo) { setCompanyForm(function(prev) { return { ...prev, logo: logo }; }); },
                              function(err) { setError(err.message); }
                            );
                          }}
                        />

                        {(companyForm.logo || (editingCompany && editingCompany.hasLogo)) && (
                          <button type="button" className="btn" style={{marginTop: '8px'}} onClick={function() { setCompanyForm(function(prev) { return { ...prev, logo: '' }; }); }}>Quitar logo</button>
                        )}

                        <div style={{
                          marginTop: '7px',
                          fontSize: '11px',
                          color: '#94a3b8'
                        }}>
                          PNG, JPG, WEBP o SVG · se reduce a un máximo de 512 KB
                        </div>
                      </div>
                    </div>
                  </div>

                  <label htmlFor="gf-field-11-razon-social" className="required">Razón social</label>

                  <input id="gf-field-11-razon-social"
                    value={companyForm.name}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        name: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-12-nit" className="required">NIT</label>
                  <input id="gf-field-12-nit"
                    value={companyForm.nit}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        nit: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-13-digito-verificacion">Dígito verificación</label>
                  <input id="gf-field-13-digito-verificacion"
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
                  <label htmlFor="gf-field-14-direccion">Dirección</label>
                  <input id="gf-field-14-direccion"
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
                  <label htmlFor="gf-field-15-ciudad">Ciudad</label>
                  <input id="gf-field-15-ciudad"
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
                  <label htmlFor="gf-field-16-departamento">Departamento</label>
                  <input id="gf-field-16-departamento"
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
                  <label htmlFor="gf-field-17-codigo-postal">Código postal</label>
                  <input id="gf-field-17-codigo-postal"
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
                  <label htmlFor="gf-field-18-telefono">Teléfono</label>
                  <input id="gf-field-18-telefono"
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
                  <label htmlFor="gf-field-19-whatsapp">WhatsApp</label>
                  <input id="gf-field-19-whatsapp"
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
                  <label htmlFor="gf-field-20-correo">Correo</label>
                  <input id="gf-field-20-correo"
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
                  <label htmlFor="gf-field-21-contacto">Contacto</label>
                  <input id="gf-field-21-contacto"
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
                  <label htmlFor="gf-field-22-representante-legal">Representante legal</label>
                  <input id="gf-field-22-representante-legal"
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
                  <label htmlFor="gf-field-23-regimen-tributario">Régimen tributario</label>
                  <select id="gf-field-23-regimen-tributario"
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

                <div className="form-group">
                  <div style={{fontWeight: '700'}}>Exoneración de aportes (art. 114-1 ET)</div>
                  <label className="legal-accept" style={{ marginTop: '4px' }}>
                    <input
                      type="checkbox"
                      checked={!!companyForm.isExempt114_1}
                      onChange={function(e) {
                        setCompanyForm({
                          ...companyForm,
                          isExempt114_1: e.target.checked
                        });
                      }}
                    />
                    <span>
                      Exonerada de salud del empleador, SENA e ICBF por
                      trabajadores que devenguen menos de 10 SMMLV
                    </span>
                  </label>
                </div>

                <div className="form-group full">
                  <label htmlFor="gf-field-24-actividad-economica">Actividad económica</label>
                  <input id="gf-field-24-actividad-economica"
                    value={companyForm.economicActivity}
                    onChange={function(e) {
                      setCompanyForm({
                        ...companyForm,
                        economicActivity: e.target.value
                      });
                    }}
                  />
                </div>

                <PilaCompanyFields form={companyForm} setForm={setCompanyForm} />
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
                disabled={loading || (!editingCompany && !termsAccepted)}
              >
                {loading ? 'Guardando...' : 'Guardar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {summaryModal && selectedPeriod && (function() {
        const summary = buildPeriodSummary();
        const t = summary.totals;
        const cell = { padding: '6px 8px', borderBottom: '1px solid #1d3047', textAlign: 'right', whiteSpace: 'nowrap' };
        const left = { ...cell, textAlign: 'left' };

        return (
          <div className="modal-backdrop">
            <div className="modal" style={{ width: 'min(1040px, 100%)' }}>
              <div className="modal-header">
                <h3>
                  📊 Resumen del periodo {selectedPeriod.periodStart} a {selectedPeriod.periodEnd}
                </h3>
                <button className="btn" onClick={function() { setSummaryModal(false); }}>✕</button>
              </div>

              <div className="modal-body">
                {summary.rows.length === 0 ? (
                  <div className="info-box">
                    Aún no hay empleados liquidados en este periodo.
                  </div>
                ) : (
                  <>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th style={left}>Empleado</th>
                            <th style={cell}>Devengado</th>
                            <th style={cell}>Deducciones</th>
                            <th style={cell}>Neto a pagar</th>
                            <th style={cell}>Aportes empleador</th>
                            <th style={cell}>Provisiones</th>
                            <th style={cell}>Costo total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.rows.map(function(r) {
                            return (
                              <tr key={r.taxId}>
                                <td style={left}>{r.name}<br /><span style={{ color: '#8193aa' }}>{r.taxId}</span></td>
                                <td style={cell}>{formatCOP(r.gross)}</td>
                                <td style={cell}>{formatCOP(r.deductions)}</td>
                                <td style={cell}>{formatCOP(r.net)}</td>
                                <td style={cell}>{formatCOP(r.contributions)}</td>
                                <td style={cell}>{formatCOP(r.provisions)}</td>
                                <td style={cell}>{formatCOP(r.cost)}</td>
                              </tr>
                            );
                          })}
                          <tr style={{ fontWeight: '700' }}>
                            <td style={left}>TOTAL ({summary.rows.length})</td>
                            <td style={cell}>{formatCOP(t.gross)}</td>
                            <td style={cell}>{formatCOP(t.deductions)}</td>
                            <td style={cell}>{formatCOP(t.net)}</td>
                            <td style={cell}>{formatCOP(t.contributions)}</td>
                            <td style={cell}>{formatCOP(t.provisions)}</td>
                            <td style={cell}>{formatCOP(t.cost)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="form-grid" style={{ marginTop: '16px' }}>
                      <div className="form-group">
                        <label htmlFor="gf-field-25-de-administracion-outsourcing">% de administración (outsourcing)</label>
                        <input id="gf-field-25-de-administracion-outsourcing"
                          type="number"
                          min="0"
                          step="0.5"
                          value={adminFeePct}
                          onChange={function(e) { setAdminFeePct(e.target.value); }}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="gf-field-26-valor-administracion">Valor administración</label>
                        <input id="gf-field-26-valor-administracion" value={formatCOP(summary.fee)} disabled />
                      </div>
                      <div className="form-group full">
                        <label htmlFor="gf-field-27-total-a-facturar-a-la-empresa-costo-total-administracion">Total a facturar a la empresa (costo total + administración)</label>
                        <input id="gf-field-27-total-a-facturar-a-la-empresa-costo-total-administracion" value={formatCOP(summary.invoice)} disabled />
                      </div>
                    </div>

                    <p style={{ fontSize: '11px', color: '#8193aa', marginTop: '10px' }}>
                      Sólo incluye a los empleados ya liquidados en este periodo.
                      Las provisiones (cesantías, intereses, prima, vacaciones) se
                      causan cada mes aunque se paguen después. Antes de facturar,
                      agrega el IVA que corresponda a la administración.
                    </p>
                  </>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn" onClick={function() { setSummaryModal(false); }}>Cerrar</button>
                <button
                  className="btn btn-primary"
                  onClick={exportPeriodSummaryCsv}
                  disabled={summary.rows.length === 0}
                >
                  ⬇️ Exportar CSV (Excel)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {importModal && selectedCompany && (
        <EmployeeImportModal
          company={selectedCompany}
          employees={employees}
          onClose={function() { setImportModal(false); }}
          onImported={function() { loadEmployees(selectedCompany.id); }}
          onError={setError}
          onSuccess={setSuccess}
        />
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
                  <label htmlFor="gf-field-28-primer-nombre" className="required">Primer nombre</label>
                  <input id="gf-field-28-primer-nombre"
                    value={employeeForm.firstName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        firstName: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-29-segundo-nombre">Segundo nombre</label>
                  <input id="gf-field-29-segundo-nombre"
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
                  <label htmlFor="gf-field-30-primer-apellido" className="required">Primer apellido</label>
                  <input id="gf-field-30-primer-apellido"
                    value={employeeForm.lastName}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        lastName: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-31-segundo-apellido">Segundo apellido</label>
                  <input id="gf-field-31-segundo-apellido"
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
                  <label htmlFor="gf-field-32-documento" className="required">Documento</label>
                  <input id="gf-field-32-documento"
                    value={employeeForm.taxId}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        taxId: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-33-cargo">Cargo</label>
                  <input id="gf-field-33-cargo"
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
                  <label htmlFor="gf-field-34-tipo-contrato-dian">Tipo contrato DIAN</label>
                  <select id="gf-field-34-tipo-contrato-dian"
                    value={employeeForm.contractType}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        contractType: e.target.value
                      });
                    }}
                  >
                    <option value="2">Término indefinido</option>
                    <option value="1">Término fijo</option>
                    <option value="3">Obra o labor</option>
                    <option value="4">Aprendizaje</option>
                    <option value="5">Prácticas o pasantías</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-35-clase-de-riesgo-arl">Clase de riesgo ARL</label>
                  <select id="gf-field-35-clase-de-riesgo-arl"
                    value={employeeForm.arlRiskClass}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        arlRiskClass: e.target.value
                      });
                    }}
                  >
                    <option value="1">Clase I · 0,522% (oficina, administrativo)</option>
                    <option value="2">Clase II · 1,044% (algunos procesos manufactureros)</option>
                    <option value="3">Clase III · 2,436% (procesos industriales, conductores)</option>
                    <option value="4">Clase IV · 4,350% (transporte, procesos de alto riesgo)</option>
                    <option value="5">Clase V · 6,960% (construcción, alturas, minería)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-36-salario-mensual" className="required">Salario mensual</label>
                  <input id="gf-field-36-salario-mensual"
                    type="number"
                    min="0"
                    value={employeeForm.salary}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        salary: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group full">
                  <label htmlFor="gf-field-37-direccion">Dirección</label>
                  <input id="gf-field-37-direccion"
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
                  <label htmlFor="gf-field-38-ciudad">Ciudad</label>
                  <input id="gf-field-38-ciudad"
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
                  <label htmlFor="gf-field-39-pais">País</label>
                  <input id="gf-field-39-pais"
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
                  <label htmlFor="gf-field-40-telefono">Teléfono</label>
                  <input id="gf-field-40-telefono"
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
                  <label htmlFor="gf-field-41-whatsapp">WhatsApp</label>
                  <input id="gf-field-41-whatsapp"
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
                  <label htmlFor="gf-field-42-fecha-ingreso">Fecha ingreso</label>
                  <input id="gf-field-42-fecha-ingreso"
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

                {(employeeForm.contractType === '1' || employeeForm.contractType === '3') && (
                  <div className="form-group">
                    <label htmlFor="gf-field-43-fin-pactado-del-contrato">Fin pactado del contrato</label>
                    <input id="gf-field-43-fin-pactado-del-contrato"
                      type="date"
                      value={employeeForm.contractEndDate}
                      onChange={function(e) {
                        setEmployeeForm({
                          ...employeeForm,
                          contractEndDate: e.target.value
                        });
                      }}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="gf-field-44-dias-de-vacaciones-ya-disfrutados-antes-de-usar-la-plataforma">Días de vacaciones ya disfrutados antes de usar la plataforma</label>
                  <input id="gf-field-44-dias-de-vacaciones-ya-disfrutados-antes-de-usar-la-plataforma"
                    type="number"
                    min="0"
                    step="0.5"
                    value={employeeForm.vacationDaysTakenBefore}
                    onChange={function(e) {
                      setEmployeeForm({
                        ...employeeForm,
                        vacationDaysTakenBefore: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label className="legal-accept">
                    <input
                      type="checkbox"
                      checked={!!employeeForm.isIntegralSalary}
                      onChange={function(e) {
                        setEmployeeForm({
                          ...employeeForm,
                          isIntegralSalary: e.target.checked
                        });
                      }}
                    />
                    <span>Salario integral (mínimo 13 SMMLV): sin prima ni cesantías aparte</span>
                  </label>
                </div>

                <PilaEmployeeFields form={employeeForm} setForm={setEmployeeForm} />

                <div className="form-group">
                  <label htmlFor="gf-field-45-banco">Banco</label>
                  <input id="gf-field-45-banco"
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
                  <label htmlFor="gf-field-46-tipo-de-cuenta">Tipo de cuenta</label>
                  <select id="gf-field-46-tipo-de-cuenta"
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
                  <label htmlFor="gf-field-47-numero-de-cuenta">Número de cuenta</label>
                  <input id="gf-field-47-numero-de-cuenta"
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
                  <label htmlFor="gf-field-48-periodo-desde" className="required">Periodo desde</label>
                  <input id="gf-field-48-periodo-desde"
                    type="date"
                    value={periodForm.periodStart}
                    onChange={function(e) {
                      setPeriodForm({
                        ...periodForm,
                        periodStart: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-49-periodo-hasta" className="required">Periodo hasta</label>
                  <input id="gf-field-49-periodo-hasta"
                    type="date"
                    value={periodForm.periodEnd}
                    onChange={function(e) {
                      setPeriodForm({
                        ...periodForm,
                        periodEnd: e.target.value
                      });
                    }} required
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

      {leaveModal && selectedEmp && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingLeave ? 'Editar novedad' : 'Registrar incapacidad, licencia o vacaciones'}</h3>

              <button
                className="btn"
                onClick={function() { setLeaveModal(false); setEditingLeave(null); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group full">
                  <label htmlFor="gf-field-50-tipo" className="required">Tipo</label>
                  <select id="gf-field-50-tipo"
                    value={leaveForm.leaveType}
                    onChange={function(e) {
                      setLeaveForm({
                        ...leaveForm,
                        leaveType: e.target.value
                      });
                    }} required
                  >
                    <option value="GENERAL_INCAPACITY">Incapacidad general (enfermedad común)</option>
                    <option value="WORK_INCAPACITY">Incapacidad laboral (ARL)</option>
                    <option value="MATERNITY_LEAVE">Licencia de maternidad</option>
                    <option value="PATERNITY_LEAVE">Licencia de paternidad</option>
                    <option value="VACATION">Vacaciones disfrutadas</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-51-fecha-inicio" className="required">Fecha inicio</label>
                  <input id="gf-field-51-fecha-inicio"
                    type="date"
                    value={leaveForm.startDate}
                    onChange={function(e) {
                      setLeaveForm({
                        ...leaveForm,
                        startDate: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-52-fecha-fin" className="required">Fecha fin</label>
                  <input id="gf-field-52-fecha-fin"
                    type="date"
                    value={leaveForm.endDate}
                    onChange={function(e) {
                      setLeaveForm({
                        ...leaveForm,
                        endDate: e.target.value
                      });
                    }} required
                  />
                </div>

                {leaveForm.leaveType === 'VACATION' && (
                  <div className="form-group full">
                    <label htmlFor="gf-field-53-dias-habiles-opcional">Días hábiles (opcional)</label>
                    <input id="gf-field-53-dias-habiles-opcional"
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Se calculan solos: lunes a sábado sin festivos"
                      value={leaveForm.businessDays}
                      onChange={function(e) {
                        setLeaveForm({
                          ...leaveForm,
                          businessDays: e.target.value
                        });
                      }}
                    />
                  </div>
                )}

                {leaveForm.leaveType === 'GENERAL_INCAPACITY' && (
                  <div className="form-group full">
                    <label htmlFor="gf-field-54-dias-acumulados-de-incapacidad-continua-antes-de-esta">Días acumulados de incapacidad continua ANTES de esta</label>
                    <input id="gf-field-54-dias-acumulados-de-incapacidad-continua-antes-de-esta"
                      type="number"
                      min="0"
                      value={leaveForm.accumulatedDaysBefore}
                      onChange={function(e) {
                        setLeaveForm({
                          ...leaveForm,
                          accumulatedDaysBefore: e.target.value
                        });
                      }}
                    />
                  </div>
                )}

                <div className="form-group full">
                  <label htmlFor="gf-field-55-notas-opcional">Notas (opcional)</label>
                  <input id="gf-field-55-notas-opcional"
                    value={leaveForm.notes}
                    onChange={function(e) {
                      setLeaveForm({
                        ...leaveForm,
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
                onClick={function() { setLeaveModal(false); setEditingLeave(null); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveLeave}
                disabled={loading}
              >
                {loading ? 'Guardando...' : editingLeave ? 'Guardar cambios' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {professionalModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingProfessional ? 'Editar profesional' : 'Nuevo profesional'}</h3>

              <button
                className="btn"
                onClick={function() { setProfessionalModal(false); setEditingProfessional(null); }}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="gf-field-56-primer-nombre" className="required">Primer nombre</label>
                  <input id="gf-field-56-primer-nombre"
                    value={professionalForm.firstName}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        firstName: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-57-segundo-nombre">Segundo nombre</label>
                  <input id="gf-field-57-segundo-nombre"
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
                  <label htmlFor="gf-field-58-primer-apellido" className="required">Primer apellido</label>
                  <input id="gf-field-58-primer-apellido"
                    value={professionalForm.lastName}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        lastName: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-59-segundo-apellido">Segundo apellido</label>
                  <input id="gf-field-59-segundo-apellido"
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
                  <label htmlFor="gf-field-60-documento" className="required">Documento</label>
                  <input id="gf-field-60-documento"
                    value={professionalForm.taxId}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        taxId: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-61-tipo-de-documento">Tipo de documento</label>
                  <select id="gf-field-61-tipo-de-documento"
                    value={professionalForm.documentType}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        documentType: e.target.value
                      });
                    }}
                  >
                    <option value="13">Cédula de ciudadanía</option>
                    <option value="31">NIT</option>
                    <option value="22">Cédula de extranjería</option>
                    <option value="41">Pasaporte</option>
                    <option value="42">Documento extranjero</option>
                  </select>
                </div>

                {professionalForm.documentType === '31' && (
                  <div className="form-group">
                    <label htmlFor="gf-field-62-dv-digito-de-verificacion">DV (dígito de verificación)</label>
                    <input id="gf-field-62-dv-digito-de-verificacion"
                      value={professionalForm.dv}
                      onChange={function(e) {
                        setProfessionalForm({
                          ...professionalForm,
                          dv: e.target.value
                        });
                      }}
                      placeholder="Ej: 7"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="gf-field-63-profesion" className="required">Profesión</label>
                  <input id="gf-field-63-profesion"
                    value={professionalForm.profession}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        profession: e.target.value
                      });
                    }}
                    placeholder="Ej: Contador, Electricista..." required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-64-correo">Correo</label>
                  <input id="gf-field-64-correo"
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
                  <label htmlFor="gf-field-65-telefono">Teléfono</label>
                  <input id="gf-field-65-telefono"
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
                  <label htmlFor="gf-field-66-ciudad">Ciudad</label>
                  <input id="gf-field-66-ciudad"
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
                  <label htmlFor="gf-field-67-banco">Banco</label>
                  <input id="gf-field-67-banco"
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
                  <label htmlFor="gf-field-68-tipo-de-cuenta">Tipo de cuenta</label>
                  <select id="gf-field-68-tipo-de-cuenta"
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
                  <label htmlFor="gf-field-69-numero-de-cuenta">Número de cuenta</label>
                  <input id="gf-field-69-numero-de-cuenta"
                    value={professionalForm.bankAccountNumber}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        bankAccountNumber: e.target.value
                      });
                    }}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-70-tarifa-por-hora-por-defecto-opcional">Tarifa por hora (por defecto, opcional)</label>
                  <input id="gf-field-70-tarifa-por-hora-por-defecto-opcional"
                    type="number"
                    min="0"
                    step="0.01"
                    value={professionalForm.defaultHourlyRate}
                    onChange={function(e) {
                      setProfessionalForm({
                        ...professionalForm,
                        defaultHourlyRate: e.target.value
                      });
                    }}
                    placeholder="Se precarga al crear una vinculación"
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn"
                onClick={function() { setProfessionalModal(false); setEditingProfessional(null); }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                onClick={saveProfessional}
                disabled={loading}
              >
                {loading
                  ? 'Guardando...'
                  : editingProfessional
                    ? 'Guardar cambios'
                    : 'Guardar y vincular'}
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
                  <label htmlFor="gf-field-71-modalidad" className="required">Modalidad</label>
                  <select id="gf-field-71-modalidad"
                    value={engagementForm.vinculationType}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        vinculationType: e.target.value
                      });
                    }} required
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
                  <label htmlFor="gf-field-72-tarifa-por-hora" className="required">Tarifa por hora</label>
                  <input id="gf-field-72-tarifa-por-hora"
                    type="number"
                    min="0"
                    value={engagementForm.hourlyRate}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        hourlyRate: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-73-fecha-inicio" className="required">Fecha inicio</label>
                  <input id="gf-field-73-fecha-inicio"
                    type="date"
                    value={engagementForm.startDate}
                    onChange={function(e) {
                      setEngagementForm({
                        ...engagementForm,
                        startDate: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-74-fecha-fin-opcional">Fecha fin (opcional)</label>
                  <input id="gf-field-74-fecha-fin-opcional"
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
                      <label htmlFor="gf-field-75-concepto-de-retencion">Concepto de retención</label>
                      <select id="gf-field-75-concepto-de-retencion"
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
                      <label htmlFor="gf-field-76-declarante-de-renta">¿Declarante de renta?</label>
                      <select id="gf-field-76-declarante-de-renta"
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
                      <label htmlFor="gf-field-77-objeto-entregable-del-contrato" className="required">Objeto / entregable del contrato</label>
                      <input id="gf-field-77-objeto-entregable-del-contrato"
                        value={engagementForm.deliverableDescription}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            deliverableDescription: e.target.value
                          });
                        }}
                        placeholder="Ej: Elaborar los estados financieros mensuales" required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="gf-field-78-horas-semanales-max-42" className="required">Horas semanales (máx. 42)</label>
                      <input id="gf-field-78-horas-semanales-max-42"
                        type="number"
                        min="1"
                        max="42"
                        value={engagementForm.weeklyHours}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            weeklyHours: e.target.value
                          });
                        }} required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="gf-field-79-tipo-contrato-dian">Tipo contrato DIAN</label>
                      <select id="gf-field-79-tipo-contrato-dian"
                        value={engagementForm.contractType}
                        onChange={function(e) {
                          setEngagementForm({
                            ...engagementForm,
                            contractType: e.target.value
                          });
                        }}
                      >
                        <option value="2">Término indefinido</option>
                        <option value="1">Término fijo</option>
                        <option value="3">Obra o labor</option>
                        <option value="5">Prácticas o pasantías</option>
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
                  <label htmlFor="gf-field-80-periodo-desde" className="required">Periodo desde</label>
                  <input id="gf-field-80-periodo-desde"
                    type="date"
                    value={timeEntryForm.periodStart}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        periodStart: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-81-periodo-hasta" className="required">Periodo hasta</label>
                  <input id="gf-field-81-periodo-hasta"
                    type="date"
                    value={timeEntryForm.periodEnd}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        periodEnd: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-82-horas-trabajadas" className="required">Horas trabajadas</label>
                  <input id="gf-field-82-horas-trabajadas"
                    type="number"
                    min="0"
                    step="0.5"
                    value={timeEntryForm.hours}
                    onChange={function(e) {
                      setTimeEntryForm({
                        ...timeEntryForm,
                        hours: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group full">
                  <label htmlFor="gf-field-83-notas-opcional">Notas (opcional)</label>
                  <input id="gf-field-83-notas-opcional"
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
                  <label htmlFor="gf-field-84-periodo-aaaa-mm" className="required">Periodo (AAAA-MM)</label>
                  <input id="gf-field-84-periodo-aaaa-mm"
                    value={pilaForm.period}
                    onChange={function(e) {
                      setPilaForm({
                        ...pilaForm,
                        period: e.target.value
                      });
                    }}
                    placeholder="2026-09" required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-85-ibc-declarado-por-el-contratista" className="required">IBC declarado por el contratista</label>
                  <input id="gf-field-85-ibc-declarado-por-el-contratista"
                    type="number"
                    min="0"
                    value={pilaForm.declaredIbc}
                    onChange={function(e) {
                      setPilaForm({
                        ...pilaForm,
                        declaredIbc: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group full">
                  <label htmlFor="gf-field-86-referencia-de-planilla-opcional">Referencia de planilla (opcional)</label>
                  <input id="gf-field-86-referencia-de-planilla-opcional"
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
                  <label htmlFor="gf-field-87-periodo-desde" className="required">Periodo desde</label>
                  <input id="gf-field-87-periodo-desde"
                    type="date"
                    value={settlementForm.periodStart}
                    onChange={function(e) {
                      setSettlementForm({
                        ...settlementForm,
                        periodStart: e.target.value
                      });
                    }} required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="gf-field-88-periodo-hasta" className="required">Periodo hasta</label>
                  <input id="gf-field-88-periodo-hasta"
                    type="date"
                    value={settlementForm.periodEnd}
                    onChange={function(e) {
                      setSettlementForm({
                        ...settlementForm,
                        periodEnd: e.target.value
                      });
                    }} required
                  />
                </div>

                {selectedEngagement.retentionConcept === 'HONORARIOS' && (
                  <div className="form-group full">
                    <label htmlFor="gf-field-89-tarifa-de-retencion-vigente">Tarifa de retención vigente (%)</label>
                    <input id="gf-field-89-tarifa-de-retencion-vigente"
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
              <div className="inline-warning" style={{marginBottom: '15px'}}>
                {settlementResult.dianDocument.disclaimer ||
                  'Documento generado sin firma digital ni habilitación real ante la DIAN. Debe validarse antes de producción.'}
              </div>

              <pre>{settlementResult.dianDocument.xmlContent}</pre>

              {renderKreaduFooter()}
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

// Pie institucional obligatorio, fijo al fondo de TODA la página
// (login y dashboard) — distinto de renderKreaduFooter(), que es el
// mismo texto pero en flujo normal al final de un documento
// imprimible (no fijo, porque ahí ya está dentro de un contenedor).
// Aviso informativo: la Plataforma sólo usa almacenamiento esencial
// (la sesión de Firebase en IndexedDB/localStorage), sin cookies de
// analítica ni publicidad, así que no hay nada que "aceptar" o
// rechazar: basta informar y enlazar la política.
function StorageNotice() {
  const [hidden, setHidden] = useState(function() {
    try {
      return localStorage.getItem('gf-storage-notice') === '1';
    } catch (e) {
      return false;
    }
  });

  if (hidden) return null;

  return (
    <div role="region" aria-label="Aviso de cookies y almacenamiento" className="storage-notice">
      <span>
        Sólo usamos almacenamiento técnico esencial para mantener tu sesión
        iniciada. No usamos cookies de analítica ni de publicidad.{' '}
        <a href="/legal#cookies" target="_blank" rel="noopener">Más información</a>
      </span>
      <button
        className="btn"
        onClick={function() {
          try { localStorage.setItem('gf-storage-notice', '1'); } catch (e) {}
          setHidden(true);
        }}
      >
        Entendido
      </button>
    </div>
  );
}

function PageFooter() {
  return (
    <footer className="page-footer">
      <strong>KREADU S.A.S.</strong> - Empresa AI Business Systems Lab -
      Academy - KREADU School
      {' · '}
      Contacto: is@kreadu.com; (+57) 3235297951; (+57) 3225832662
      {' · '}
      <a href="/legal" target="_blank" rel="noopener" style={{ color: '#93c5fd' }}>
        Términos y Política de datos
      </a>
      {' · '}
      <a href="mailto:is@kreadu.com?subject=Solicitud%20de%20datos%20personales" style={{ color: '#93c5fd' }}>
        Solicitar acceso o eliminación de mis datos
      </a>
      <StorageNotice />
    </footer>
  );
}

// Pie institucional obligatorio: debe ir al final de todo documento
// imprimible/visual (nómina individual, y cualquier otro que se
// agregue a futuro — reutilizar esta función, no copiar el texto).
function renderKreaduFooter() {
  return (
    <div style={{
      marginTop: '12px',
      paddingTop: '12px',
      borderTop: '1px solid #e5e7eb',
      textAlign: 'center',
      fontSize: '11px',
      color: '#64748b'
    }}>
      <strong>KREADU S.A.S.</strong> - Empresa AI Business Systems Lab -
      Academy - KREADU School
      <br />
      Contacto: is@kreadu.com; (+57) 3235297951; (+57) 3225832662
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
