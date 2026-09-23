import React, { useMemo, useState } from 'react';

export type AppView = 'companies' | 'employees' | 'payroll' | 'my-paystubs';

export interface Company {
  id: string;
  name: string;
  nit: string;
  city: string;
  department: string;
  phone?: string;
  email?: string;
  status: 'Activa' | 'Inactiva';
}

export interface Employee {
  id: string;
  fullName: string;
  identification: string;
  position: string;
  contractType: string;
  companyId: string;
  companyName: string;
  companyNit: string;
  salary: number;
  status: 'Activo' | 'Inactivo';
  bankName?: string;
  bankAccountLast4?: string;
}

export interface Paystub {
  id: string;
  period: string;
  issueDate: string;
  baseSalary: number;
  auxTransporte: number;
  overtime: number;
  grossEarnings: number;
  healthDeduction: number;
  pensionDeduction: number;
  totalDeductions: number;
  netPay: number;
  cune?: string;
}

const initialCompanies: Company[] = [
  {
    id: 'COMP-001',
    name: 'Empresa Alfa S.A.S.',
    nit: '900.123.456-7',
    city: 'Popayán',
    department: 'Cauca',
    phone: '602 000 0000',
    email: 'contacto@empresa-alfa.com',
    status: 'Activa',
  },
];

const initialEmployees: Employee[] = [
  {
    id: 'EMP-001',
    fullName: 'Carlos Rodríguez',
    identification: '1.098.765.432',
    position: 'Analista Operativo',
    contractType: 'Contrato Indefinido',
    companyId: 'COMP-001',
    companyName: 'Empresa Alfa S.A.S.',
    companyNit: '900.123.456-7',
    salary: 3500000,
    status: 'Activo',
    bankName: 'Bancolombia',
    bankAccountLast4: '4567',
  },
];

const paystubs: Paystub[] = [
  {
    id: 'PAY-2026-09-2',
    period: 'Septiembre 2026 (Quincena 2)',
    issueDate: '2026-09-30',
    baseSalary: 1750905,
    auxTransporte: 249095,
    overtime: 81292,
    grossEarnings: 2081292,
    healthDeduction: 73288,
    pensionDeduction: 73288,
    totalDeductions: 146576,
    netPay: 1934716,
    cune: 'cune_9874a65f123bc45d678e90123456789a',
  },
  {
    id: 'PAY-2026-09-1',
    period: 'Septiembre 2026 (Quincena 1)',
    issueDate: '2026-09-15',
    baseSalary: 875452,
    auxTransporte: 124547,
    overtime: 0,
    grossEarnings: 1000000,
    healthDeduction: 35018,
    pensionDeduction: 35018,
    totalDeductions: 70036,
    netPay: 929964,
    cune: 'cune_1234a56b789cd01ef234567890abcdef',
  },
];

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);

const formatDate = (date: string): string => {
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
};

const initials = (name: string): string =>
  name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

export const EmployeePortal: React.FC = () => {
  const [view, setView] = useState<AppView>('companies');
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [selectedCompanyId, setSelectedCompanyId] = useState('COMP-001');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('EMP-001');
  const [search, setSearch] = useState('');
  const [selectedPaystubId, setSelectedPaystubId] = useState<string | null>(
    paystubs[0]?.id ?? null,
  );
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );

  const companyEmployees = useMemo(
    () => employees.filter((employee) => employee.companyId === selectedCompanyId),
    [employees, selectedCompanyId],
  );

  const filteredCompanies = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return companies;
    return companies.filter(
      (company) =>
        company.name.toLowerCase().includes(term) ||
        company.nit.toLowerCase().includes(term),
    );
  }, [companies, search]);

  const filteredEmployees = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return companyEmployees;
    return companyEmployees.filter(
      (employee) =>
        employee.fullName.toLowerCase().includes(term) ||
        employee.identification.includes(term) ||
        employee.position.toLowerCase().includes(term),
    );
  }, [companyEmployees, search]);

  const selectedPaystub = useMemo(
    () => paystubs.find((paystub) => paystub.id === selectedPaystubId) ?? null,
    [selectedPaystubId],
  );

  const openEmployees = (companyId: string): void => {
    setSelectedCompanyId(companyId);
    setSearch('');
    setView('employees');
  };

  const openPayroll = (employeeId: string): void => {
    setSelectedEmployeeId(employeeId);
    setView('payroll');
  };

  const addCompany = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const company: Company = {
      id: `COMP-${Date.now()}`,
      name: String(form.get('name') ?? ''),
      nit: String(form.get('nit') ?? ''),
      city: String(form.get('city') ?? ''),
      department: String(form.get('department') ?? ''),
      phone: String(form.get('phone') ?? ''),
      email: String(form.get('email') ?? ''),
      status: 'Activa',
    };

    if (!company.name || !company.nit) return;

    setCompanies((current) => [...current, company]);
    setSelectedCompanyId(company.id);
    setShowCompanyForm(false);
    setSearch('');
  };

  const addEmployee = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!selectedCompany) return;

    const form = new FormData(event.currentTarget);
    const employee: Employee = {
      id: `EMP-${Date.now()}`,
      fullName: String(form.get('fullName') ?? ''),
      identification: String(form.get('identification') ?? ''),
      position: String(form.get('position') ?? ''),
      contractType: String(form.get('contractType') ?? 'Contrato Indefinido'),
      companyId: selectedCompany.id,
      companyName: selectedCompany.name,
      companyNit: selectedCompany.nit,
      salary: Number(form.get('salary') ?? 0),
      status: 'Activo',
    };

    if (!employee.fullName || !employee.identification) return;

    setEmployees((current) => [...current, employee]);
    setSelectedEmployeeId(employee.id);
    setShowEmployeeForm(false);
    setSearch('');
  };

  const nav = [
    { id: 'companies' as const, label: 'Empresas', icon: '🏢' },
    { id: 'employees' as const, label: 'Empleados', icon: '👥' },
    { id: 'payroll' as const, label: 'Liquidaciones', icon: '📊' },
    { id: 'my-paystubs' as const, label: 'Nómina electrónica', icon: '📄' },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="h-[66px] border-b border-slate-800 bg-slate-950 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold">
            KF
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-white">
              Kreadu Gestión-Future
            </h1>
            <p className="hidden sm:block text-[11px] text-slate-500">
              Plataforma de Outsourcing de RRHH & Nómina Electrónica
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2">
          <span className="hidden sm:block text-xs text-slate-500">Empresa</span>
          <select
            value={selectedCompanyId}
            onChange={(event) => {
              setSelectedCompanyId(event.target.value);
              setSearch('');
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white outline-none"
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="flex min-h-[calc(100vh-66px)]">
        <aside className="hidden md:block w-60 border-r border-slate-800 bg-slate-950 p-3">
          <nav className="space-y-1">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  setSearch('');
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left transition ${
                  view === item.id
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Empresa activa
            </p>
            <p className="mt-1 text-sm font-semibold text-white truncate">
              {selectedCompany?.name ?? 'Sin empresa'}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {companyEmployees.length} empleado(s)
            </p>
          </div>
        </aside>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto">
          <div className="max-w-6xl mx-auto">
            {view === 'companies' && (
              <section>
                <PageHeader
                  title="Empresas"
                  subtitle="Administra las empresas vinculadas a tu operación de RRHH."
                  action={
                    <button
                      type="button"
                      onClick={() => setShowCompanyForm(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-lg text-sm font-bold"
                    >
                      + Nueva empresa
                    </button>
                  }
                />

                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar empresa por nombre o NIT..."
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredCompanies.map((company) => {
                    const count = employees.filter(
                      (employee) => employee.companyId === company.id,
                    ).length;

                    return (
                      <article
                        key={company.id}
                        className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition"
                      >
                        <div className="flex justify-between gap-4">
                          <div className="flex gap-3 min-w-0">
                            <div className="h-11 w-11 shrink-0 rounded-xl bg-indigo-600/15 text-indigo-300 flex items-center justify-center text-xl">
                              🏢
                            </div>
                            <div className="min-w-0">
                              <h2 className="font-bold text-white truncate">
                                {company.name}
                              </h2>
                              <p className="text-xs text-slate-500 mt-1">
                                NIT: {company.nit}
                              </p>
                            </div>
                          </div>
                          <StatusBadge status={company.status} />
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-5">
                          <Info label="Ubicación">
                            {company.city}, {company.department}
                          </Info>
                          <Info label="Empleados">{count}</Info>
                        </div>

                        <button
                          type="button"
                          onClick={() => openEmployees(company.id)}
                          className="mt-5 w-full border border-slate-700 hover:border-indigo-500 hover:text-indigo-300 rounded-lg py-2.5 text-xs font-bold transition"
                        >
                          Administrar empresa →
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {view === 'employees' && (
              <section>
                <PageHeader
                  title="Empleados"
                  subtitle={
                    selectedCompany
                      ? `${selectedCompany.name} · ${selectedCompany.nit}`
                      : 'Selecciona una empresa'
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => setShowEmployeeForm(true)}
                      disabled={!selectedCompany}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 rounded-lg text-sm font-bold"
                    >
                      + Nuevo empleado
                    </button>
                  }
                />

                <SearchBox
                  value={search}
                  onChange={setSearch}
                  placeholder="Buscar por nombre, cédula o cargo..."
                />

                <div className="bg-slate-900/70 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="hidden md:grid grid-cols-[2fr_1.3fr_1.4fr_1fr_110px] gap-4 px-5 py-3 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                    <span>Empleado</span>
                    <span>Identificación</span>
                    <span>Cargo</span>
                    <span>Estado</span>
                    <span />
                  </div>

                  {filteredEmployees.map((employee) => (
                    <div
                      key={employee.id}
                      className="grid grid-cols-1 md:grid-cols-[2fr_1.3fr_1.4fr_1fr_110px] gap-3 md:gap-4 px-5 py-4 border-b last:border-0 border-slate-800 hover:bg-slate-800/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-indigo-600/15 text-indigo-300 flex items-center justify-center text-xs font-bold">
                          {initials(employee.fullName)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {employee.fullName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {employee.contractType}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs text-slate-400">
                        {employee.identification}
                      </span>
                      <span className="text-xs text-slate-400">
                        {employee.position}
                      </span>
                      <StatusBadge status={employee.status} />

                      <button
                        type="button"
                        onClick={() => openPayroll(employee.id)}
                        className="text-xs font-bold text-indigo-400 hover:text-indigo-300 text-left md:text-right"
                      >
                        Liquidar →
                      </button>
                    </div>
                  ))}

                  {filteredEmployees.length === 0 && (
                    <EmptyState
                      icon="👥"
                      title="No hay empleados"
                      text="Crea el primer empleado de esta empresa."
                    />
                  )}
                </div>
              </section>
            )}

            {view === 'payroll' && (
              <section>
                <PageHeader
                  title="Liquidación"
                  subtitle={
                    selectedEmployee
                      ? `${selectedEmployee.fullName} · ${selectedEmployee.identification}`
                      : 'Selecciona un empleado'
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => setView('employees')}
                      className="border border-slate-700 hover:border-slate-500 px-4 py-2.5 rounded-lg text-sm font-bold"
                    >
                      ← Volver a empleados
                    </button>
                  }
                />

                {selectedEmployee ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                      <p className="text-[10px] uppercase tracking-wider text-indigo-400 font-bold">
                        Empleado
                      </p>
                      <h2 className="text-xl font-bold mt-2">
                        {selectedEmployee.fullName}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        C.C. {selectedEmployee.identification}
                      </p>

                      <div className="grid grid-cols-2 gap-4 mt-6">
                        <Info label="Cargo">{selectedEmployee.position}</Info>
                        <Info label="Contrato">{selectedEmployee.contractType}</Info>
                        <Info label="Salario">
                          {formatCurrency(selectedEmployee.salary)}
                        </Info>
                        <Info label="Empresa">{selectedEmployee.companyName}</Info>
                      </div>

                      <div className="mt-6 p-4 rounded-xl bg-indigo-600/10 border border-indigo-500/20">
                        <p className="text-xs font-bold text-indigo-300">
                          Liquidación Colombia 2026
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Aquí conservamos el flujo del liquidador que ya tienes.
                          Los datos del empleado se cargarán automáticamente.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="mt-5 w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg text-sm font-bold"
                      >
                        ⚡ Abrir liquidador
                      </button>
                    </div>

                    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500">
                        Próximo paso
                      </p>
                      <h3 className="text-lg font-bold mt-2">
                        Novedades de nómina
                      </h3>

                      <div className="space-y-3 mt-5">
                        <MiniAction label="Horas extras y recargos" icon="⏱️" />
                        <MiniAction label="Bonificaciones y comisiones" icon="💰" />
                        <MiniAction label="Deducciones" icon="➖" />
                        <MiniAction label="Nómina electrónica DIAN" icon="🏛️" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon="📊"
                    title="Selecciona un empleado"
                    text="Regresa a Empleados para iniciar una liquidación."
                  />
                )}
              </section>
            )}

            {view === 'my-paystubs' && (
              <section>
                <PageHeader
                  title="Nómina electrónica"
                  subtitle="Consulta los comprobantes de pago y su información DIAN."
                />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <section className="lg:col-span-5 space-y-3">
                    {paystubs.map((paystub) => {
                      const selected = selectedPaystubId === paystub.id;

                      return (
                        <button
                          key={paystub.id}
                          type="button"
                          onClick={() => setSelectedPaystubId(paystub.id)}
                          className={`w-full text-left p-4 rounded-xl border transition ${
                            selected
                              ? 'bg-indigo-600/15 border-indigo-500/60'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex justify-between gap-3">
                            <span className="text-xs font-bold text-indigo-300">
                              {paystub.period}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {formatDate(paystub.issueDate)}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-3">
                            Neto pagado
                          </p>
                          <p className="text-lg font-black text-emerald-400">
                            {formatCurrency(paystub.netPay)}
                          </p>
                        </button>
                      );
                    })}
                  </section>

                  <section className="lg:col-span-7">
                    {selectedPaystub ? (
                      <PaystubDetail
                        employee={selectedEmployee ?? employees[0]}
                        paystub={selectedPaystub}
                      />
                    ) : (
                      <EmptyState
                        icon="📄"
                        title="Sin comprobante seleccionado"
                        text="Selecciona un comprobante."
                      />
                    )}
                  </section>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      {/* Navegación móvil */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur border-t border-slate-800 grid grid-cols-4">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setView(item.id)}
            className={`py-3 text-[10px] font-semibold ${
              view === item.id ? 'text-indigo-300' : 'text-slate-500'
            }`}
          >
            <span className="block text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {showCompanyForm && (
        <Modal title="Nueva empresa" onClose={() => setShowCompanyForm(false)}>
          <form onSubmit={addCompany} className="space-y-4">
            <Input name="name" label="Razón social *" required />
            <Input name="nit" label="NIT *" required />
            <div className="grid grid-cols-2 gap-3">
              <Input name="city" label="Ciudad" />
              <Input name="department" label="Departamento" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input name="phone" label="Teléfono" />
              <Input name="email" label="Correo" type="email" />
            </div>
            <ModalActions onCancel={() => setShowCompanyForm(false)} />
          </form>
        </Modal>
      )}

      {showEmployeeForm && selectedCompany && (
        <Modal title="Nuevo empleado" onClose={() => setShowEmployeeForm(false)}>
          <form onSubmit={addEmployee} className="space-y-4">
            <Input name="fullName" label="Nombre completo *" required />
            <Input name="identification" label="Cédula / identificación *" required />
            <div className="grid grid-cols-2 gap-3">
              <Input name="position" label="Cargo" />
              <Input
                name="salary"
                label="Salario mensual"
                type="number"
                min="0"
                step="1000"
              />
            </div>
            <label className="block">
              <span className="text-xs text-slate-400">Tipo de contrato</span>
              <select
                name="contractType"
                defaultValue="Contrato Indefinido"
                className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm"
              >
                <option>Contrato Indefinido</option>
                <option>Contrato Fijo</option>
                <option>Obra o Labor</option>
                <option>Prestación de Servicios</option>
              </select>
            </label>
            <ModalActions onCancel={() => setShowEmployeeForm(false)} />
          </form>
        </Modal>
      )}
    </div>
  );
};

const PageHeader: React.FC<{
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
    <div>
      <h2 className="text-2xl sm:text-3xl font-black text-white">{title}</h2>
      <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>
    </div>
    {action}
  </div>
);

const SearchBox: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => (
  <div className="mb-5">
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600"
    />
  </div>
);

const StatusBadge: React.FC<{ status: 'Activa' | 'Inactiva' | 'Activo' | 'Inactivo' }> = ({
  status,
}) => {
  const active = status === 'Activa' || status === 'Activo';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold ${
        active ? 'text-emerald-400' : 'text-slate-500'
      }`}
    >
      <span>●</span>
      {status}
    </span>
  );
};

const Info: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-slate-600">{label}</p>
    <p className="text-xs text-slate-300 mt-1">{children}</p>
  </div>
);

const MiniAction: React.FC<{ icon: string; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800">
    <span>{icon}</span>
    <span className="text-xs text-slate-300">{label}</span>
  </div>
);

const EmptyState: React.FC<{
  icon: string;
  title: string;
  text: string;
}> = ({ icon, title, text }) => (
  <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-10 text-center">
    <div className="text-3xl">{icon}</div>
    <h3 className="font-bold text-white mt-3">{title}</h3>
    <p className="text-xs text-slate-500 mt-1">{text}</p>
  </div>
);

const Input: React.FC<{
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
}> = ({ name, label, type = 'text', required, min, step }) => (
  <label className="block">
    <span className="text-xs text-slate-400">{label}</span>
    <input
      name={name}
      type={type}
      required={required}
      min={min}
      step={step}
      className="mt-1 w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 outline-none rounded-lg px-3 py-2.5 text-sm text-white"
    />
  </label>
);

const Modal: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <h3 className="font-bold text-white">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-500 hover:text-white text-xl"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const ModalActions: React.FC<{ onCancel: () => void }> = ({ onCancel }) => (
  <div className="flex justify-end gap-3 pt-2">
    <button
      type="button"
      onClick={onCancel}
      className="px-4 py-2.5 rounded-lg border border-slate-700 text-sm font-semibold text-slate-300"
    >
      Cancelar
    </button>
    <button
      type="submit"
      className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold"
    >
      Guardar
    </button>
  </div>
);

const PaystubDetail: React.FC<{
  employee: Employee;
  paystub: Paystub;
}> = ({ employee, paystub }) => {
  const handlePrint = (): void => window.print();

  return (
    <article className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="font-bold text-white">{paystub.period}</h3>
          <p className="text-xs text-slate-500 mt-1">{employee.companyName}</p>
          <p className="text-xs text-slate-600">NIT: {employee.companyNit}</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="bg-indigo-600 hover:bg-indigo-500 h-fit px-3 py-2 rounded-lg text-xs font-bold print:hidden"
        >
          🖨️ Imprimir
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 bg-slate-950/60 rounded-xl p-4">
        <Info label="Empleado">{employee.fullName}</Info>
        <Info label="Identificación">{employee.identification}</Info>
        <Info label="Banco">
          {employee.bankName
            ? `${employee.bankName} (*${employee.bankAccountLast4 ?? '----'})`
            : 'No registrado'}
        </Info>
        <Info label="Emisión">{formatDate(paystub.issueDate)}</Info>
      </div>

      <section>
        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
          Percepciones (Devengado)
        </h4>
        <Row label="Sueldo Básico" value={paystub.baseSalary} />
        {paystub.auxTransporte > 0 && (
          <Row label="Auxilio de Transporte" value={paystub.auxTransporte} />
        )}
        {paystub.overtime > 0 && (
          <Row label="Horas Extras y Recargos" value={paystub.overtime} />
        )}
        <Row label="Total Devengado Bruto" value={paystub.grossEarnings} bold />
      </section>

      <section>
        <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">
          Deducciones de Ley
        </h4>
        <Row label="Aporte Salud (4%)" value={-paystub.healthDeduction} />
        <Row label="Aporte Pensión (4%)" value={-paystub.pensionDeduction} />
        <Row label="Total Deducciones" value={-paystub.totalDeductions} bold />
      </section>

      <div className="p-4 bg-emerald-950/30 border border-emerald-500/20 rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">Total Neto Pagado</p>
          <p className="text-2xl font-black text-emerald-400">
            {formatCurrency(paystub.netPay)}
          </p>
        </div>
        <span className="text-xs font-semibold text-emerald-400">
          ● Pagado
        </span>
      </div>

      {paystub.cune && (
        <div className="border-t border-slate-800 pt-4">
          <p className="text-[10px] font-bold text-slate-500 mb-1">
            CUNE · Nómina Electrónica DIAN
          </p>
          <code className="block text-[10px] break-all bg-slate-950 rounded-lg p-2 text-slate-500">
            {paystub.cune}
          </code>
        </div>
      )}
    </article>
  );
};

const Row: React.FC<{
  label: string;
  value: number;
  bold?: boolean;
}> = ({ label, value, bold }) => (
  <div
    className={`flex justify-between gap-4 py-2 border-b border-slate-800 text-xs ${
      bold ? 'font-bold text-white' : 'text-slate-300'
    }`}
  >
    <span>{label}</span>
    <span className="font-mono whitespace-nowrap">
      {value < 0 ? '- ' : ''}
      {formatCurrency(Math.abs(value))}
    </span>
  </div>
);
