import React, { useState } from 'react';

interface EmployeePayrollForm {
  employeeId: string;
  firstName: string;
  lastName: string;
  taxId: string;
  baseSalaryMonthly: number;
  daysWorked: number;
  extraDiurna: number;
  extraNocturna: number;
  recargoNocturno: number;
  isExempt114_1: boolean;
}

interface PayrollResult {
  employeeName: string;
  taxId: string;
  daysWorked: number;
  baseSalaryEarned: number;
  auxTransporte: number;
  overtimeTotal: number;
  extraDiurnaVal: number;
  extraNocturnaVal: number;
  recargoNocturnoVal: number;
  grossEarnings: number;
  ibc: number;
  health: number;
  pension: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;
}

export const Dashboard: React.FC = () => {
  const [selectedTenant, setSelectedTenant] = useState('tenant-001');
  const [activeTab, setActiveTab] = useState<'payroll' | 'dian'>('payroll');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<EmployeePayrollForm>({
    employeeId: 'EMP-101',
    firstName: 'Carlos',
    lastName: 'Rodríguez',
    taxId: '1098765432',
    baseSalaryMonthly: 1750905,
    daysWorked: 30,
    extraDiurna: 4,
    extraNocturna: 2,
    recargoNocturno: 10,
    isExempt114_1: true,
  });

  const [payrollResult, setPayrollResult] = useState<PayrollResult | null>(null);
  const [dianStatus, setDianStatus] = useState<{ emitted: boolean; cune?: string }>({ emitted: false });

  const handleCalculatePayroll = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      const hourlyRate = form.baseSalaryMonthly / 210;
      const baseSalaryEarned = (form.baseSalaryMonthly / 30) * form.daysWorked;
      const auxTransporte = form.baseSalaryMonthly <= 3501810 ? (249095 / 30) * form.daysWorked : 0;

      const extraDiurnaVal = form.extraDiurna * hourlyRate * 1.25;
      const extraNocturnaVal = form.extraNocturna * hourlyRate * 1.75;
      const recargoNocturnoVal = form.recargoNocturno * hourlyRate * 0.35;
      const overtimeTotal = extraDiurnaVal + extraNocturnaVal + recargoNocturnoVal;

      const grossEarnings = baseSalaryEarned + auxTransporte + overtimeTotal;
      const ibc = baseSalaryEarned + overtimeTotal;
      const health = ibc * 0.04;
      const pension = ibc * 0.04;
      const totalDeductions = health + pension;

      const netPay = grossEarnings - totalDeductions;
      const employerCost =
        grossEarnings +
        ibc * 0.12 + // AFP
        ibc * 0.00522 + // SENA
        ibc * 0.04 + // ICBF
        ibc * 0.225; // Provisiones

      setPayrollResult({
        employeeName: `${form.firstName} ${form.lastName}`,
        taxId: form.taxId,
        daysWorked: form.daysWorked,
        baseSalaryEarned,
        auxTransporte,
        overtimeTotal,
        extraDiurnaVal,
        extraNocturnaVal,
        recargoNocturnoVal,
        grossEarnings,
        ibc,
        health,
        pension,
        totalDeductions,
        netPay,
        employerCost,
      });

      setDianStatus({ emitted: false });
      setLoading(false);
    }, 400);
  };

  const handleEmitDian = () => {
    if (!payrollResult) return;
    const fakeCune = 'cune_' + Math.random().toString(36).substring(2, 15);
    setDianStatus({ emitted: true, cune: fakeCune });
  };

  const tenantOptions = [
    { id: 'tenant-001', name: 'Empresa Alfa S.A.S.', nit: '900.123.456' },
    { id: 'tenant-002', name: 'Tech Solutions Ltda.', nit: '800.987.654' },
    { id: 'tenant-003', name: 'Comercializadora Beta', nit: '901.555.444' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', color: '#e2e8f0', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      {/* HEADER */}
      <header
        style={{
          borderBottom: '1px solid #1e293b',
          backgroundColor: '#020617',
          padding: '1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              height: '36px',
              width: '36px',
              borderRadius: '0.5rem',
              backgroundColor: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              color: 'white',
              fontSize: '14px',
            }}
          >
            KF
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', margin: '0', color: 'white' }}>
              Kreadu Gestión-Future
            </h1>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
              Plataforma de Outsourcing de RRHH & Nómina Electrónica
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              padding: '0.375rem 0.75rem',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8' }}>Empresa Cliente:</span>
            <select
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                fontSize: '14px',
                fontWeight: '500',
                color: '#818cf8',
                border: 'none',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {tenantOptions.map((opt) => (
                <option key={opt.id} value={opt.id} style={{ backgroundColor: '#1e293b', color: 'white' }}>
                  {opt.name} (NIT {opt.nit})
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              height: '32px',
              width: '32px',
              borderRadius: '50%',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              color: '#cbd5e1',
            }}
          >
            AD
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* SIDEBAR */}
        <aside
          style={{
            width: '256px',
            borderRight: '1px solid #1e293b',
            backgroundColor: '#020617',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <button
            onClick={() => setActiveTab('payroll')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s',
              border: activeTab === 'payroll' ? '1px solid rgba(99, 102, 241, 0.3)' : 'none',
              backgroundColor: activeTab === 'payroll' ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
              color: activeTab === 'payroll' ? '#818cf8' : '#94a3b8',
              cursor: 'pointer',
            }}
          >
            📊 Liquidador de Nómina
          </button>
          <button
            onClick={() => setActiveTab('dian')}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.3s',
              border: activeTab === 'dian' ? '1px solid rgba(99, 102, 241, 0.3)' : 'none',
              backgroundColor: activeTab === 'dian' ? 'rgba(79, 70, 229, 0.2)' : 'transparent',
              color: activeTab === 'dian' ? '#818cf8' : '#94a3b8',
              cursor: 'pointer',
            }}
          >
            🏛️ Nómina Electrónica DIAN
          </button>
        </aside>

        {/* MAIN AREA */}
        <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
          {/* KPI CARDS */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1.5rem',
              marginBottom: '2rem',
            }}
          >
            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Empleados Activos
              </span>
              <p style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: '0.5rem 0 0 0' }}>
                42
              </p>
              <span style={{ fontSize: '11px', color: '#4ade80', marginTop: '0.5rem', display: 'inline-block' }}>
                100% Contratos Vigentes
              </span>
            </div>

            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Salario Mínimo 2026
              </span>
              <p style={{ fontSize: '28px', fontWeight: '900', color: '#818cf8', margin: '0.5rem 0 0 0' }}>
                $1.750.905 COP
              </p>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '0.5rem', display: 'inline-block' }}>
                Aux. Transp: $249.095
              </span>
            </div>

            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Jornada Ordinaria
              </span>
              <p style={{ fontSize: '28px', fontWeight: '900', color: 'white', margin: '0.5rem 0 0 0' }}>
                42 hrs / sem
              </p>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '0.5rem', display: 'inline-block' }}>
                210 Horas Mensuales (Ley 2101)
              </span>
            </div>

            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(71, 85, 105, 0.5)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Estado Transmisión DIAN
              </span>
              <p style={{ fontSize: '28px', fontWeight: '900', color: '#4ade80', margin: '0.5rem 0 0 0' }}>
                Al día
              </p>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '0.5rem', display: 'inline-block' }}>
                Próximo límite: Día 10 del mes
              </span>
            </div>
          </div>

          {/* PAYROLL TAB CONTENT */}
          {activeTab === 'payroll' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* FORM */}
              <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(71, 85, 105, 0.4)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>
                  Liquidador Exprés (Colombia 2026)
                </h2>

                <form onSubmit={handleCalculatePayroll} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* NOMBRE Y APELLIDO */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Nombre
                      </label>
                      <input
                        type="text"
                        value={form.firstName}
                        onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          fontSize: '14px',
                          color: 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Apellido
                      </label>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          fontSize: '14px',
                          color: 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* CEDULA Y SALARIO */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Cédula / Tax ID
                      </label>
                      <input
                        type="text"
                        value={form.taxId}
                        onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          fontSize: '14px',
                          color: 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                        Salario Mensual Base (COP)
                      </label>
                      <input
                        type="number"
                        value={form.baseSalaryMonthly}
                        onChange={(e) => setForm({ ...form, baseSalaryMonthly: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          backgroundColor: '#0f172a',
                          border: '1px solid #334155',
                          borderRadius: '0.5rem',
                          padding: '0.5rem 0.75rem',
                          fontSize: '14px',
                          color: 'white',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>

                  {/* DIAS TRABAJADOS */}
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                      Días Laborados
                    </label>
                    <input
                      type="number"
                      value={form.daysWorked}
                      onChange={(e) => setForm({ ...form, daysWorked: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.75rem',
                        fontSize: '14px',
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* HORAS EXTRAS */}
                  <div style={{ paddingTop: '0.5rem', borderTop: '1px solid rgba(71, 85, 105, 0.5)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.5rem' }}>
                      Horas Extras & Recargos
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          Extra Diurna (+25%)
                        </label>
                        <input
                          type="number"
                          value={form.extraDiurna}
                          onChange={(e) => setForm({ ...form, extraDiurna: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '0.5rem',
                            padding: '0.375rem 0.5rem',
                            fontSize: '13px',
                            color: 'white',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          Extra Noct. (+75%)
                        </label>
                        <input
                          type="number"
                          value={form.extraNocturna}
                          onChange={(e) => setForm({ ...form, extraNocturna: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '0.5rem',
                            padding: '0.375rem 0.5rem',
                            fontSize: '13px',
                            color: 'white',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '0.25rem' }}>
                          Rec. Noct. (+35%)
                        </label>
                        <input
                          type="number"
                          value={form.recargoNocturno}
                          onChange={(e) => setForm({ ...form, recargoNocturno: Number(e.target.value) })}
                          style={{
                            width: '100%',
                            backgroundColor: '#0f172a',
                            border: '1px solid #334155',
                            borderRadius: '0.5rem',
                            padding: '0.375rem 0.5rem',
                            fontSize: '13px',
                            color: 'white',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* SUBMIT BUTTON */}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      backgroundColor: loading ? '#4f46e5' : '#4f46e5',
                      color: 'white',
                      fontWeight: 'bold',
                      padding: '0.625rem',
                      borderRadius: '0.5rem',
                      fontSize: '14px',
                      transition: 'all 0.3s',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      border: 'none',
                      opacity: loading ? 0.8 : 1,
                    }}
                  >
                    {loading ? '⏳ Calculando...' : '⚡ Calcular Liquidación de Nómina'}
                  </button>
                </form>
              </div>

              {/* RESULTS */}
              <div>
                {payrollResult ? (
                  <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(71, 85, 105, 0.4)', borderRadius: '0.75rem', padding: '1.5rem' }}>
                    <div style={{ paddingBottom: '1rem', borderBottom: '1px solid rgba(71, 85, 105, 0.4)', marginBottom: '1.5rem' }}>
                      <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: '0 0 0.25rem 0' }}>
                          {payrollResult.employeeName}
                        </h3>
                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
                          C.C. {payrollResult.taxId} | {payrollResult.daysWorked} Días Laborados
                        </p>
                      </div>

                      <button
                        onClick={handleEmitDian}
                        disabled={dianStatus.emitted}
                        style={{
                          marginTop: '0.75rem',
                          paddingLeft: '1rem',
                          paddingRight: '1rem',
                          paddingTop: '0.5rem',
                          paddingBottom: '0.5rem',
                          borderRadius: '0.5rem',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          transition: 'all 0.3s',
                          border: dianStatus.emitted ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
                          backgroundColor: dianStatus.emitted ? 'rgba(16, 185, 129, 0.2)' : '#10b981',
                          color: dianStatus.emitted ? '#4ade80' : 'white',
                          cursor: dianStatus.emitted ? 'default' : 'pointer',
                        }}
                      >
                        {dianStatus.emitted ? '✓ Nómina Transmitida a DIAN' : '🏛️ Transmitir a DIAN (XML)'}
                      </button>
                    </div>

                    {dianStatus.emitted && (
                      <div style={{ marginBottom: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '0.5rem' }}>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#4ade80', display: 'block' }}>
                          CUNE Generado (SHA-384):
                        </span>
                        <code style={{ fontSize: '11px', color: '#cbd5e1', wordBreak: 'break-all', fontFamily: 'monospace', display: 'block', marginTop: '0.25rem' }}>
                          {dianStatus.cune}
                        </code>
                      </div>
                    )}

                    {/* DESGLOSE */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      {/* DEVENGADOS */}
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>
                          Percepciones / Devengado
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                          <span>Sueldo Básico</span>
                          <span>${payrollResult.baseSalaryEarned.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                          <span>Auxilio de Transporte</span>
                          <span>${payrollResult.auxTransporte.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                          <span>Extra Diurna</span>
                          <span>${payrollResult.extraDiurnaVal.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                          <span>Extra Nocturna</span>
                          <span>${payrollResult.extraNocturnaVal.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1' }}>
                          <span>Recargo Nocturno</span>
                          <span>${payrollResult.recargoNocturnoVal.toLocaleString('es-CO')}</span>
                        </div>
                      </div>

                      {/* DEDUCCIONES */}
                      <div>
                        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>
                          Deducciones Trabajador
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.5rem' }}>
                          <span>Salud (4%)</span>
                          <span>${payrollResult.health.toLocaleString('es-CO')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#cbd5e1', marginBottom: '0.75rem' }}>
                          <span>Pensión (4%)</span>
                          <span>${payrollResult.pension.toLocaleString('es-CO')}</span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: '#fca5a5',
                            paddingTop: '0.5rem',
                            borderTop: '1px solid #334155',
                          }}
                        >
                          <span>Total Deducciones</span>
                          <span>-${payrollResult.totalDeductions.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    </div>

                    {/* NETO FINAL */}
                    <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.75rem' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', display: 'block' }}>
                        Neto a Pagar al Empleado
                      </span>
                      <span style={{ fontSize: '28px', fontWeight: '900', color: '#4ade80', display: 'block', marginTop: '0.5rem' }}>
                        ${payrollResult.netPay.toLocaleString('es-CO')} COP
                      </span>
                    </div>

                    {/* COSTO EMPLEADOR */}
                    <div style={{ marginTop: '1rem', textAlign: 'right', paddingRight: '1rem' }}>
                      <span style={{ fontSize: '12px', color: '#94a3b8', display: 'block' }}>
                        Costo Total Empleador (con provisiones)
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 'bold', color: '#cbd5e1', display: 'block', marginTop: '0.25rem' }}>
                        ${payrollResult.employerCost.toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      height: '100%',
                      border: '2px dashed #334155',
                      borderRadius: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '3rem',
                      textAlign: 'center',
                      color: '#64748b',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: '16px', fontWeight: '600', margin: '0' }}>Sin liquidación calculada</p>
                      <p style={{ fontSize: '12px', color: '#475569', margin: '0.5rem 0 0 0' }}>
                        Completa los datos a la izquierda para simular el pago y la emisión DIAN.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* DIAN TAB CONTENT */}
          {activeTab === 'dian' && (
            <div style={{ backgroundColor: 'rgba(30, 41, 59, 0.25)', border: '1px solid rgba(71, 85, 105, 0.4)', borderRadius: '0.75rem', padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ fontSize: '16px', color: '#cbd5e1', margin: 0 }}>
                📄 Módulo de Nómina Electrónica DIAN - En desarrollo
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
