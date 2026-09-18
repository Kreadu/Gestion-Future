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
         
         {/* NOVEDADES / HORAS EXTRAS */}
         <div className="pt-2 border-t border-slate-700/50">
          <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block mb-2">
            Horas Extras &amp; Recargos
          </span>
          <div className="grid grid-cols-3 gap-3">
            </div>
            <label className="block text-[11px] text-slate-400">Extra Diurna (+25%)</label>
            <input
              type="number"
              value={form.extraDiurna}
              onChange={(e) =>; setForm({ ...form, extraDiurna: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
            />
           </div>
           <div>
             <label className="block text-[11px] text-slate-400">Extra Noct. (+75%)</label>
             <input
               type="number"
               value={form.extraNocturna} 
               onChange={(e) =&gt; setForm({ ...form, extraNocturna: Number(e.target.value) })} 
               className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
              />
            </div>
            <div>
             <label className="block text-[11px] text-slate-400">Rec. Noct. (+35%)</label>
             <input
               type="number" 
               value={form.recargoNocturno} 
               onChange={(e) =&gt; setForm({ ...form, recargoNocturno: Number(e.target.value) })}
               className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white"
             />
            </div>
          </div>
               
          <button
            type="submit" 
            disabled={loading} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-lg text-sm transition-all shadow-lg shadow-indigo-600/30"
          >
            {loading ? 'Calculando...' : '⚡ Calcular Liquidación de Nómina'}
          </button>
         </form> 
        </div>

        {/* RESULTADOS / VISTA DE COMPROBANTE */}
        <div className="lg:col-span-7">
          {payrollResult ? (
            <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-700/60">
                <div>
                 <h3 className="text-lg font-bold text-white">{payrollResult.employeeName}</h3>
                 <p className="text-xs text-slate-400">C.C. {payrollResult.taxId} | {payrollResult.daysWorked} Días Laborados</p>
                </div>

                <button
                  onClick={handleEmitDian} 
                  disabled={dianStatus.emitted}
                  className={\`px-4 py-2 rounded-lg text-xs font-bold transition-all ${ 
                    dianStatus.emitted
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'

                    }`}
                >
                     {dianStatus.emitted ? '✓ Nómina Transmitida a DIAN' : '🏛️ Transmitir a DIAN (XML)'}
                 </button>
               </div>

               {/* CUNE DIAN BANNER */}
               {dianStatus.emitted &amp;&amp; (
                 <div className="mt-4 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-lg">
                   <span className="text-xs font-bold text-emerald-400 block"&gt;CUNE Generado (SHA-384):</span>
                   <code className="text-[11px] text-slate-300 break-all font-mono">{dianStatus.cune}</code>
                 </div>
              )}

               {/* DESGLOSE */}
               <div className="grid grid-cols-2 gap-6 mt-6">
                 {/\* DEVENGADOS \*/}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                      Percepciones / Devengado
                    </span>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Sueldo Básico</span>
                      <span>\${payrollResult.baseSalaryEarned.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Auxilio de Transporte</span>
                      <span>\${payrollResult.auxTransporte.toLocaleString('es-CO')}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Total Devengado</span>
                      <span>\${payrollResult.grossEarnings.toLocaleString('es-CO')}</span>
                    </div>
                  </div>
                 
                {/* DEDUCCIONES */}
                <div className="space-y-2">   
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block">
                    Deducciones Trabajador
                  </span>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Salud (4%)</span>
                    <span>\${payrollResult.health.toLocaleString('es-CO')}</span>
                  </div>
                   <div className="flex justify-between text-xs text-slate-300">
                    <span>Pensión (4%)</span>
                    <span>\${payrollResult.pension.toLocaleString('es-CO')}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold text-rose-300 pt-2 border-t border-slate-700">
                    <span>Total Deducciones</span>
                    <span>-\${payrollResult.totalDeductions.toLocaleString('es-CO')}</span>
                  </div>
                 </div>
                </div>
    
                {/* NETO FINAL */}
                <div className="mt-6 p-4 bg-slate-900 border border-slate-700/80 rounded-xl flex items-center justify-between">
                  </div>
                  <span className="text-xs text-slate-400 font-semibold block">Neto a Pagar al Empleado</span>
                  <span className="text-2xl font-black text-emerald-400">
                    \${payrollResult.netPay.toLocaleString('es-CO')} COP
                   </span>
                </div>
                <div className="text-right">
                <span className="text-xs text-slate-400 block">Costo Total Empleador</span>
                <span className="text-sm font-bold text-slate-200">
                  \${payrollResult.employerCost.toLocaleString('es-CO')} COP
                </span>
               </div>
             </div>
            ) : (
              <div className="h-full border-2 border-dashed border-slate-800 rounded-xl flex items-center justify-center p-12 text-center text-slate-500">
               <div>
                 <p className="text-base font-semibold">Sin liquidación calculada</p>
                 <p className="text-xs text-slate-600 mt-1"&gt;Completa los datos a la izquierda para simular el pago y la emisión DIAN.</p>
              </div>
             </div>
            )}
          </div>
         </div>
       )}
     </main>
    </div>
   </div>
 );
};
