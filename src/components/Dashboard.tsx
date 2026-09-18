import React, { useState } from 'react';

// Tipos importados del motor
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
  isExempt114\_1: boolean;
}

export const Dashboard: React.FC = () =>; {
  // Estado Multi-tenant (Empresas Cliente)
  const [selectedTenant, setSelectedTenant] = useState('tenant-001');
  const [activeTab, setActiveTab] = useState<;'payroll' | 'employees' | 'dian'>;('payroll');

// Estado del Formulario de Liquidación
  const [form, setForm] = useState<EmployeePayrollForm&gt;({ 
    employeeId: 'EMP-101',
    irstName: 'Carlos',
    lastName: 'Rodríguez',
    taxId: '1098765432',
    baseSalaryMonthly: 1750905,// 1 SMMLV 2026 
    daysWorked: 30,
    extraDiurna: 4,
    extraNocturna: 2,
    recargoNocturno: 10,
    isExempt114\_1: true
  });

// Estado de la nómina calculada y estado DIAN
  const [payrollResult, setPayrollResult] = useState<any | null>(null);
  const [dianStatus, setDianStatus] = useState<;{ emitted: boolean; cune?: string }>;({ emitted: false }); 
  const [loading, setLoading] = useState(false);

// Cálculo en tiempo real (Simulación frontend con reglas Colombia 2026) 
  const handleCalculatePayroll = (e: React.FormEvent) =>;{
   e.preventDefault();
   setLoading(true);
  
  setTimeout(() =>; { 
    const hourlyRate = form.baseSalaryMonthly / 210; // 42h/semana
    const baseSalaryEarned = (form.baseSalaryMonthly / 30) \* form.daysWorked;

    const auxTransporte = form.baseSalaryMonthly <= 3501810 ? (249095 / 30) \* form.daysWorked : 0;
    const extraDiurnaVal = form.extraDiurna \* hourlyRate \* 1.25;
    const extraNocturnaVal = form.extraNocturna \* hourlyRate \* 1.75;
    const recargoNocturnoVal = form.recargoNocturno \* hourlyRate \* 0.35;
    const overtimeTotal = extraDiurnaVal + extraNocturnaVal + recargoNocturnoVal;
    const grossEarnings = baseSalaryEarned + auxTransporte + overtimeTotal;
    const ibc = baseSalaryEarned + overtimeTotal;
    const health = ibc \* 0.04;
    const pension = ibc \* 0.04;
    const totalDeductions = health + pension;

    const netPay = grossEarnings - totalDeductions;
    const employerCost = grossEarnings + (ibc \* 0.12) + (ibc \* 0.00522) + (ibc \* 0.04) + (ibc \* 0.225); // Con provisiones

    setPayrollResult({ 
      employeeName: \`${form.firstName} ${form.lastName}\`, 
      taxId: form.taxId,
      daysWorked: form.daysWorked,
      baseSalaryEarned, 
      auxTransporte, 
      overtimeTotal,
      grossEarnings,
      ibc, 
      health, 
      pension,
      totalDeductions,
      netPay,
      employerCost
    });
    
    setDianStatus({ emitted: false });
    setLoading(false);
  }, 400);
};
// Simulación de emisión a la DIAN 
 const handleEmitDian = () =>; { 
 if (!payrollResult) return; 
 const fakeCune = 'cune\_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
 setDianStatus({ emitted: true, cune: fakeCune });
};
return ( 
  <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">;
  {/* HEADER / NAVBAR */} 
  <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
   <div className="flex items-center gap-3">
    <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
     KF 
   </div>
   <div> 
     <h1 className="text-lg font-bold tracking-wide text-white"&gt;Kreadu Gestión-Future>
     <p className="text-xs text-slate-400">Plataforma de Outsourcing de RRHH &amp; Nómina Electrónica</p>
   </div>
  </div>

  {/\* SELECTOR MULTI-TENANT \*/}
  <div className="flex items-center gap-4">
    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
      <span className="text-xs font-semibold text-slate-400">Empresa Cliente:</span> 
      <select
        value={selectedTenant}
        onChange={(e) =>; setSelectedTenant(e.target.value)}
        className="bg-transparent text-sm font-medium text-indigo-400 focus:outline-none cursor-pointer"
   >
     <option value="tenant-001" className="bg-slate-900 text-white">Empresa Alfa S.A.S. (NIT 900.123.456)</option>
     <option value="tenant-002" className="bg-slate-900 text-white">Tech Solutions Ltda. (NIT 800.987.654)</option>
     <option value="tenant-003" className="bg-slate-900 text-white">Comercializadora Beta (NIT 901.555.444)</option>
    </select>
   </div>

   <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
    AD
   </div>
  </div>
 </header>

 {/* DASHBOARD BODY */}
 <div className="flex-1 flex">
   {/\* SIDEBAR \*/}
   <aside className="w-64 border-r border-slate-800 bg-slate-950 p-4 flex flex-col gap-2">
    <button
    onClick={() =>; setActiveTab('payroll')}
    className={\`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
      activeTab === 'payroll'
       ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
       : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
    }\`}
   >
    📊 Liquidador de Nómina
   </button>
   <button
     onClick={() =>; setActiveTab('dian')}
     className={\`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-all ${
       activeTab === 'dian'
        ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
     }\`}
    >
     🏛️ Nómina Electrónica DIAN
    </button>
  </aside>
  
  {/* MAIN CONTENT AREA */}
  <main className="flex-1 p-8 overflow-y-auto">
    {/* KPI CARDS */}
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
     <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
       <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Empleados Activos</span>
       <p className="text-2xl font-extrabold text-white mt-1">42</p>
       <span className="text-xs text-emerald-400 mt-1 inline-block">100% Contratos Vigentes</span>
    </div>
    
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5"> 
     <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Salario Mínimo 2026</span>
     <p className="text-2xl font-extrabold text-indigo-400 mt-1"> \$1.750.905 COP</p> 
     <span className="text-xs text-slate-400 mt-1 inline-block"> Aux. Transp: \$249.095</span>
    </div>
    
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
     <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Jornada Ordinaria</span>
     <p className="text-2xl font-extrabold text-white mt-1">42 hrs / sem</p>
     <span className="text-xs text-slate-400 mt-1 inline-block">210 Horas Mensuales (Ley 2101)</span> 
    </div>
    
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
     <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado Transmisión DIAN</span>
     <p className="text-2xl font-extrabold text-emerald-400 mt-1">Al día</p>
     <span className="text-xs text-slate-400 mt-1 inline-block">Próximo límite: Día 10 del mes</span>
    </div>
  </div>

    {/\* CONTENIDO DE LA PESTAÑA \*/}
    {activeTab === 'payroll' &amp;&amp; (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/\* FORMULARIO DE LIQUIDACIÓN \*/}
        <div className="lg:col-span-5 bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
          <h2 className="text-lg font-bold text-white mb-4"&gt;Liquidador Exprés (Colombia 2026)>
          
          <form onSubmit={handleCalculatePayroll} className="space-y-4">
           <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1"&gt;Nombre>
              <input
              type="text"
              value={form.firstName} onChange={(e) =>; setForm({ ...form, firstName: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">Apellido</label>
          <input
            type="text" 
            value={form.lastName}
            onChange={(e) =&gt; setForm({ ...form, lastName: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
           />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          </div>
           <label className="block text-xs font-semibold text-slate-300 mb-1">Cédula / Tax ID</label>
           <input
             type="text" 
             value={form.taxId} 
             onChange={(e) =>; setForm({ ...form, taxId: e.target.value })}
             className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
           />
          </div>
          <div>
           <label className="block text-xs font-semibold text-slate-300 mb-1">Días Laborados</label>
           <input
             type="number" 
             value={form.daysWorked} 
             onChange={(e) =>; setForm({ ...form, daysWorked: Number(e.target.value) })} 
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
           />
          </div>
         <div>

         <div>
           <label className="block text-xs font-semibold text-slate-300 mb-1"&gt;Salario Mensual Base (COP)>
           <input
           type="number" 
           value={form.baseSalaryMonthly} 
           onChange={(e) =>; setForm({ ...form, baseSalaryMonthly: Number(e.target.value) })}
           className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          />
         </div>
