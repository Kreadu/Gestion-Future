import React, { useState } from 'react';

export interface PayrollFormState {
  firstName: string;
  firstName2: string;
  lastName: string;
  lastName2: string;
  taxId: string;
  baseSalaryMonthly: number;
  daysWorked: number;
  extraDiurna: number;
  extraNocturna: number;
  recargoNocturno: number;
  isExempt114_1: boolean;
}

export interface PayrollResult {
  employeeName: string;
  taxId: string;
  baseSalaryEarned: number;
  earnedAuxTransporte: number;
  overtimeTotal: number;
  grossEarnings: number;
  healthDeduction: number;
  pensionDeduction: number;
  totalDeductions: number;
  netPay: number;
  employerPension: number;
  employerArl: number;
  employerHealth: number;
  employerSena: number;
  employerIcbf: number;
  employerCaja: number;
  employerTotalCost: number;
  isExempt114_1: boolean;
}

export const Dashboard: React.FC = () => {
  const [form, setForm] = useState<PayrollFormState>({
    firstName: 'Carlos',
    firstName2: 'Andrés',
    lastName: 'Rodríguez',
    lastName2: 'Pinto',
    taxId: '1098765432',
    baseSalaryMonthly: 1750905,
    daysWorked: 30,
    extraDiurna: 4,
    extraNocturna: 2,
    recargoNocturno: 10,
    isExempt114_1: true,
  });

  const [result, setResult] = useState<PayrollResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : type === 'number' ? (value === '' ? 0 : Number(value)) : value,
    }));
  };

  const handleCalculate = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const baseSalary = Number(form.baseSalaryMonthly) || 0;
      const days = Number(form.daysWorked) || 30;

      // 1. Sueldo Base Devengado
      const baseEarned = (baseSalary / 30) * days;

      // 2. Auxilio de Transporte (SMMLV 2026: $1.750.905, Aux: $249.095)
      const smmlv2026 = 1750905;
      const auxTransporte2026 = 249095;
      const qualifiesAux = baseSalary <= smmlv2026 * 2;
      const earnedAux = qualifiesAux ? (auxTransporte2026 / 30) * days : 0;

      // 3. Horas extras y recargos (Jornada ordinaria 210 h/mes)
      const hourlyRate = baseSalary > 0 ? baseSalary / 210 : 0;
      const extraDiurnaVal = (Number(form.extraDiurna) || 0) * hourlyRate * 1.25;
      const extraNocturnaVal = (Number(form.extraNocturna) || 0) * hourlyRate * 1.75;
      const recargoNocturnoVal = (Number(form.recargoNocturno) || 0) * hourlyRate * 0.35;
      const overtimeTotal = extraDiurnaVal + extraNocturnaVal + recargoNocturnoVal;

      // 4. Totales Devengados e IBC
      const grossEarnings = baseEarned + earnedAux + overtimeTotal;
      const ibc = baseEarned + overtimeTotal;

      // 5. Deducciones Trabajador
      const healthDeduction = ibc * 0.04;
      const pensionDeduction = ibc * 0.04;
      const totalDeductions = healthDeduction + pensionDeduction;
      const netPay = grossEarnings - totalDeductions;

      // 6. Aportes Empleador (Aportes Patronales & Parafiscales)
      const employerPension = ibc * 0.12;
      const employerArl = ibc * 0.00522; // Nivel de riesgo I standard
      const employerCaja = ibc * 0.04;

      // Exoneración Art. 114-1 ET (Salud 8.5%, SENA 2%, ICBF 3% exonerados si salario < 10 SMMLV y aplica)
      const isExempt = form.isExempt114_1 && baseSalary < smmlv2026 * 10;
      const employerHealth = isExempt ? 0 : ibc * 0.085;
      const employerSena = isExempt ? 0 : ibc * 0.02;
      const employerIcbf = isExempt ? 0 : ibc * 0.03;

      const employerTotalCost =
        grossEarnings +
        employerPension +
        employerArl +
        employerCaja +
        employerHealth +
        employerSena +
        employerIcbf;

      // Nombre completo compuesto
      const fullName = [form.firstName, form.firstName2, form.lastName, form.lastName2]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' ');

      const calculatedResult: PayrollResult = {
        employeeName: fullName || 'Empleado',
        taxId: String(form.taxId || 'N/A'),
        baseSalaryEarned: Math.round(baseEarned),
        earnedAuxTransporte: Math.round(earnedAux),
        overtimeTotal: Math.round(overtimeTotal),
        grossEarnings: Math.round(grossEarnings),
        healthDeduction: Math.round(healthDeduction),
        pensionDeduction: Math.round(pensionDeduction),
        totalDeductions: Math.round(totalDeductions),
        netPay: Math.round(netPay),
        employerPension: Math.round(employerPension),
        employerArl: Math.round(employerArl),
        employerHealth: Math.round(employerHealth),
        employerSena: Math.round(employerSena),
        employerIcbf: Math.round(employerIcbf),
        employerCaja: Math.round(employerCaja),
        employerTotalCost: Math.round(employerTotalCost),
        isExempt114_1: isExempt,
      };

      setResult(calculatedResult);
    } catch (err) {
      console.error('Error al calcular liquidación:', err);
      setErrorMessage('Ocurrió un error en el cálculo. Verifica los números ingresados.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCOP = (val?: number) => {
    const num = Number(val) || 0;
    return `$${num.toLocaleString('es-CO')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
      {/* HEADER SUPERIOR */}
      <header className="max-w-7xl mx-auto mb-6 flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-white text-lg shadow-inner">
            KF
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Kreadu Gestión-Future</h1>
            <p className="text-xs text-slate-400">Plataforma de Outsourcing de RRHH & Nómina Electrónica</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 font-medium">Empresa:</span>
          <select className="bg-slate-800 border border-slate-700 text-xs font-semibold text-white px-3 py-1.5 rounded-lg focus:outline-none focus:border-indigo-500">
            <option>Empresa Alfa S.A.S.</option>
            <option>Gestión & Future Popayán</option>
          </select>
        </div>
      </header>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* SIDEBAR NAVEGACIÓN IZQUIERDA */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
          <button className="w-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 px-3 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all hover:bg-indigo-600/30">
            📊 Liquidador
          </button>
          <button className="w-full text-slate-400 hover:text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all">
            📁 Empleados
          </button>
          <button className="w-full text-slate-400 hover:text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all">
            🏛️ Reportes DIAN
          </button>
          <button className="w-full text-slate-400 hover:text-white px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all">
            ⚙️ Configuración
          </button>
        </div>

        {/* CONTENIDO DE FORMULARIO Y RESULTADOS */}
        <div className="lg:col-span-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* PANEL IZQUIERDO: FORMULARIO */}
          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white">
                Liquidador Exprés (Colombia 2026)
              </h2>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                Jornada 210h
              </span>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-center gap-2">
                <span>⚠️</span> {errorMessage}
              </div>
            )}

            <form onSubmit={handleCalculate} className="space-y-4">
              {/* FILA 1: NOMBRES */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    PRIMER NOMBRE
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={form.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    SEGUNDO NOMBRE (OPT.)
                  </label>
                  <input
                    type="text"
                    name="firstName2"
                    value={form.firstName2}
                    onChange={handleInputChange}
                    placeholder="Ej: Andrés"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* FILA 2: APELLIDOS */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    PRIMER APELLIDO
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={form.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    SEGUNDO APELLIDO (OPT.)
                  </label>
                  <input
                    type="text"
                    name="lastName2"
                    value={form.lastName2}
                    onChange={handleInputChange}
                    placeholder="Ej: Rodríguez"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* FILA 3: CÉDULA Y SALARIO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    CÉDULA / NIT
                  </label>
                  <input
                    type="text"
                    name="taxId"
                    value={form.taxId}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    SALARIO MENSUAL (COP)
                  </label>
                  <input
                    type="number"
                    name="baseSalaryMonthly"
                    value={form.baseSalaryMonthly}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none font-mono transition-all"
                  />
                </div>
              </div>

              {/* FILA 4: DÍAS Y EXONERACIÓN 114-1 */}
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block h-5">
                    DÍAS LABORADOS (1-30)
                  </label>
                  <input
                    type="number"
                    name="daysWorked"
                    value={form.daysWorked}
                    onChange={handleInputChange}
                    min="1"
                    max="30"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none font-mono transition-all"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="isExempt114_1"
                    name="isExempt114_1"
                    checked={form.isExempt114_1}
                    onChange={handleInputChange}
                    className="h-4 w-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="isExempt114_1" className="text-xs text-slate-300 cursor-pointer select-none">
                    Exonerado Art. 114-1 ET
                  </label>
                </div>
              </div>

              {/* FILA 5: HORAS EXTRAS Y RECARGOS */}
              <div className="pt-2 border-t border-slate-800/80">
                <label className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-3">
                  HORAS EXTRAS Y RECARGOS
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block h-4">Extra Diurna (+25%)</label>
                    <input
                      type="number"
                      name="extraDiurna"
                      value={form.extraDiurna}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block h-4">Extra Nocturna (+75%)</label>
                    <input
                      type="number"
                      name="extraNocturna"
                      value={form.extraNocturna}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block h-4">Recargo Noct. (+35%)</label>
                    <input
                      type="number"
                      name="recargoNocturno"
                      value={form.recargoNocturno}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none font-mono transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* BOTÓN CALCULAR */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/25 text-sm flex items-center justify-center gap-2 mt-4 cursor-pointer active:scale-[0.99]"
              >
                {isLoading ? 'Calculando...' : '⚡ Calcular Liquidación'}
              </button>
            </form>
          </div>

          {/* PANEL DERECHO: VISTA PREVIA Y RESULTADOS */}
          <div className="lg:col-span-6">
            {result ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-extrabold text-white">{result.employeeName}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">C.C. / NIT {result.taxId}</p>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-md font-semibold">
                    Calculado
                  </span>
                </div>

                {/* GRILLA DEVENGADO VS DEDUCCIONES */}
                <div className="grid grid-cols-2 gap-6 pt-2 border-t border-slate-800">
                  {/* DEVENGADO */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">
                      DEVENGADO
                    </h4>
                    <div className="text-xs text-slate-300 flex justify-between">
                      <span>Sueldo:</span>
                      <span className="font-mono text-white">{formatCOP(result.baseSalaryEarned)}</span>
                    </div>
                    {result.earnedAuxTransporte > 0 && (
                      <div className="text-xs text-slate-300 flex justify-between">
                        <span>Transporte:</span>
                        <span className="font-mono text-white">{formatCOP(result.earnedAuxTransporte)}</span>
                      </div>
                    )}
                    {result.overtimeTotal > 0 && (
                      <div className="text-xs text-slate-300 flex justify-between">
                        <span>Horas Extras:</span>
                        <span className="font-mono text-indigo-300 font-bold">{formatCOP(result.overtimeTotal)}</span>
                      </div>
                    )}
                    <div className="text-xs font-bold text-white flex justify-between pt-2 border-t border-slate-800">
                      <span>Total Devengado:</span>
                      <span className="font-mono">{formatCOP(result.grossEarnings)}</span>
                    </div>
                  </div>

                  {/* DEDUCCIONES */}
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-2">
                      DEDUCCIONES
                    </h4>
                    <div className="text-xs text-slate-300 flex justify-between">
                      <span>Salud (4%):</span>
                      <span className="font-mono text-white">{formatCOP(result.healthDeduction)}</span>
                    </div>
                    <div className="text-xs text-slate-300 flex justify-between">
                      <span>Pensión (4%):</span>
                      <span className="font-mono text-white">{formatCOP(result.pensionDeduction)}</span>
                    </div>
                    <div className="text-xs font-bold text-rose-300 flex justify-between pt-2 border-t border-slate-800">
                      <span>Total Desc:</span>
                      <span className="font-mono">-{formatCOP(result.totalDeductions)}</span>
                    </div>
                  </div>
                </div>

                {/* TARGETA NETO A PAGAR */}
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-5 rounded-2xl text-center space-y-1 shadow-inner">
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                    NETO A PAGAR AL EMPLEADO
                  </span>
                  <span className="text-3xl font-black text-emerald-400 font-mono block">
                    {formatCOP(result.netPay)} COP
                  </span>
                </div>

                {/* COSTO PATRONAL Y APORTES */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 font-semibold">Costo Total Empleador</span>
                    <span className="text-base font-bold text-white font-mono">
                      {formatCOP(result.employerTotalCost)} COP
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400 font-mono">
                    <div className="flex justify-between">
                      <span>Pensión (12%):</span>
                      <span>{formatCOP(result.employerPension)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>ARL (0.522%):</span>
                      <span>{formatCOP(result.employerArl)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Caja (4%):</span>
                      <span>{formatCOP(result.employerCaja)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Salud (8.5%):</span>
                      <span>{result.isExempt114_1 ? 'Exonerado' : formatCOP(result.employerHealth)}</span>
                    </div>
                  </div>
                </div>

                {/* ACCIONES Y TRANSMISIÓN DIAN */}
                <button
                  type="button"
                  onClick={() => alert('¡Documento Soporte preparado para transmisión a la DIAN!')}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-600/20 text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  🏛️ Transmitir a DIAN (XML)
                </button>
              </div>
            ) : (
              <div className="h-full border-2 border-dashed border-slate-800 rounded-2xl flex items-center justify-center p-12 text-center text-slate-500 min-h-[400px]">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-400">
                    Completa el formulario para calcular la liquidación
                  </p>
                  <p className="text-xs text-slate-600">
                    Los resultados y aportes patronales aparecerán aquí.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};