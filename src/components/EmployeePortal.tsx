```tsx
import React, { useMemo, useState } from 'react';

/**
 * Información del empleado.
 *
 * Posteriormente estos datos podrán venir
 * desde Firebase / Firestore.
 */
export interface Employee {
  id: string;
  fullName: string;
  identification: string;
  position: string;
  contractType: string;
  companyName: string;
  companyNit: string;
  bankName?: string;
  bankAccountLast4?: string;
}

/**
 * Información de un desprendible de pago.
 */
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

  /**
   * CUNE asociado a la nómina electrónica.
   */
  cune?: string;
}

/**
 * Datos temporales del empleado.
 *
 * Estos datos son únicamente para desarrollo.
 * Posteriormente serán reemplazados por información
 * obtenida desde Firebase.
 */
const employee: Employee = {
  id: 'EMP-001',
  fullName: 'Carlos Rodríguez',
  identification: '1.098.765.432',
  position: 'Analista Operativo',
  contractType: 'Contrato Indefinido',
  companyName: 'Empresa Alfa S.A.S.',
  companyNit: '900.123.456-7',
  bankName: 'Bancolombia',
  bankAccountLast4: '4567',
};

/**
 * Datos temporales de desprendibles.
 *
 * Posteriormente deberán obtenerse desde Firestore.
 */
const paystubs: Paystub[] = [
  {
    id: 'PAY-2026-09-2',
    period: 'Septiembre 2026 (Quincena 2)',
    issueDate: '2026-09-30',

    baseSalary: 1_750_905,
    auxTransporte: 249_095,
    overtime: 81_292,

    grossEarnings: 2_081_292,

    healthDeduction: 73_288,
    pensionDeduction: 73_288,
    totalDeductions: 146_576,

    netPay: 1_934_716,

    cune:
      'cune_9874a65f123bc45d678e90123456789a',
  },

  {
    id: 'PAY-2026-09-1',
    period: 'Septiembre 2026 (Quincena 1)',
    issueDate: '2026-09-15',

    baseSalary: 875_452,
    auxTransporte: 124_547,
    overtime: 0,

    grossEarnings: 1_000_000,

    healthDeduction: 35_018,
    pensionDeduction: 35_018,
    totalDeductions: 70_036,

    netPay: 929_964,

    cune:
      'cune_1234a56b789cd01ef234567890abcdef',
  },

  {
    id: 'PAY-2026-08-2',
    period: 'Agosto 2026 (Quincena 2)',
    issueDate: '2026-08-31',

    baseSalary: 1_750_905,
    auxTransporte: 249_095,
    overtime: 42_000,

    grossEarnings: 2_041_999,

    healthDeduction: 71_716,
    pensionDeduction: 71_716,
    totalDeductions: 143_432,

    netPay: 1_898_567,

    cune:
      'cune_5555b666c777d888e999f00011122233',
  },
];

/**
 * Formateador de moneda colombiana.
 */
const formatCurrency = (
  value: number
): string => {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Formateador de fechas.
 */
const formatDate = (
  date: string
): string => {
  const parsedDate = new Date(
    `${date}T00:00:00`
  );

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
};

/**
 * Portal de Autoservicio del Empleado.
 */
export const EmployeePortal: React.FC = () => {
  const [selectedPaystubId, setSelectedPaystubId] =
    useState<string | null>(
      paystubs[0]?.id ?? null
    );

  /**
   * Obtiene el desprendible seleccionado.
   */
  const selectedPaystub = useMemo(
    () =>
      paystubs.find(
        (paystub) =>
          paystub.id === selectedPaystubId
      ) ?? null,
    [selectedPaystubId]
  );

  /**
   * Imprime el comprobante.
   *
   * El navegador permite seleccionar
   * "Guardar como PDF".
   */
  const handlePrint = (): void => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-6 font-sans">

      {/* =====================================================
          ENCABEZADO
      ====================================================== */}

      <header
        className="
          max-w-5xl
          mx-auto
          mb-6
          sm:mb-8
          flex
          flex-col
          md:flex-row
          md:items-center
          md:justify-between
          gap-5
          bg-slate-800/60
          border
          border-slate-700/60
          p-5
          sm:p-6
          rounded-2xl
        "
      >
        <div className="flex items-center gap-4">

          {/* Avatar */}
          <div
            className="
              h-12
              w-12
              shrink-0
              rounded-xl
              bg-indigo-600
              flex
              items-center
              justify-center
              font-bold
              text-white
              text-xl
              shadow-lg
              shadow-indigo-500/30
            "
          >
            {employee.fullName
              .split(' ')
              .slice(0, 2)
              .map((name) => name[0])
              .join('')
              .toUpperCase()}
          </div>

          <div>
            <h1 className="text-xl font-bold text-white">
              {employee.fullName}
            </h1>

            <p className="text-xs text-slate-400 mt-1">
              C.C. {employee.identification}
              {' · '}
              Cargo: {employee.position}
            </p>

            <span
              className="
                inline-block
                mt-2
                bg-emerald-500/20
                text-emerald-400
                text-[11px]
                font-semibold
                px-2
                py-0.5
                rounded
                border
                border-emerald-500/30
              "
            >
              {employee.contractType}
              {' · '}
              {employee.companyName}
            </span>
          </div>
        </div>

        <div className="text-left md:text-right">
          <span className="text-xs text-slate-400 block">
            Empresa
          </span>

          <span className="text-sm font-bold text-indigo-400">
            {employee.companyName}
          </span>

          <span className="text-[11px] text-slate-500 block mt-1">
            NIT: {employee.companyNit}
          </span>
        </div>
      </header>

      {/* =====================================================
          CONTENIDO PRINCIPAL
      ====================================================== */}

      <main
        className="
          max-w-5xl
          mx-auto
          grid
          grid-cols-1
          lg:grid-cols-12
          gap-6
          lg:gap-8
        "
      >

        {/* ===================================================
            LISTADO DE DESPRENDIBLES
        ==================================================== */}

        <section className="lg:col-span-5">

          <div className="mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span aria-hidden="true">📄</span>
              Mis Desprendibles de Pago
            </h2>

            <p className="text-xs text-slate-500 mt-1">
              Consulta tus comprobantes de nómina.
            </p>
          </div>

          <div
            className="space-y-3"
            role="list"
            aria-label="Desprendibles de pago"
          >
            {paystubs.map((paystub) => {

              const isSelected =
                selectedPaystubId ===
                paystub.id;

              return (
                <button
                  key={paystub.id}
                  type="button"
                  onClick={() =>
                    setSelectedPaystubId(
                      paystub.id
                    )
                  }
                  className={`
                    w-full
                    text-left
                    p-4
                    rounded-xl
                    border
                    cursor-pointer
                    transition-all
                    focus:outline-none
                    focus:ring-2
                    focus:ring-indigo-500
                    ${
                      isSelected
                        ? `
                          bg-indigo-600/20
                          border-indigo-500
                          text-white
                          shadow-lg
                          shadow-indigo-600/10
                        `
                        : `
                          bg-slate-800/40
                          border-slate-700/60
                          hover:bg-slate-800
                          hover:border-slate-600
                          text-slate-300
                        `
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <span className="text-xs font-bold text-indigo-400">
                      {paystub.period}
                    </span>

                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {formatDate(
                        paystub.issueDate
                      )}
                    </span>
                  </div>

                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <span className="text-[11px] text-slate-400 block">
                        Neto Pagado
                      </span>

                      <span className="text-base font-extrabold text-emerald-400">
                        {formatCurrency(
                          paystub.netPay
                        )}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-indigo-400">
                      Ver detalle →
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ===================================================
            DETALLE DEL DESPRENDIBLE
        ==================================================== */}

        <section className="lg:col-span-7">

          {selectedPaystub ? (
            <article
              className="
                bg-slate-800/50
                border
                border-slate-700/60
                rounded-2xl
                p-5
                sm:p-6
                space-y-6
              "
            >

              {/* ENCABEZADO DEL RECIBO */}

              <div
                className="
                  flex
                  flex-col
                  sm:flex-row
                  sm:items-start
                  sm:justify-between
                  gap-4
                  border-b
                  border-slate-700/60
                  pb-4
                "
              >
                <div>
                  <h3 className="text-base font-bold text-white">
                    {selectedPaystub.period}
                  </h3>

                  <p className="text-xs text-slate-400 mt-1">
                    {employee.companyName}
                  </p>

                  <p className="text-xs text-slate-500">
                    NIT: {employee.companyNit}
                  </p>

                  <p className="text-xs text-indigo-400 font-medium mt-2">
                    Comprobante de Pago
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="
                    bg-indigo-600
                    hover:bg-indigo-500
                    text-white
                    text-xs
                    font-bold
                    px-3
                    py-2
                    rounded-lg
                    transition-all
                    shadow-md
                    shadow-indigo-600/20
                    flex
                    items-center
                    justify-center
                    gap-1.5
                    whitespace-nowrap
                  "
                >
                  <span aria-hidden="true">
                    🖨️
                  </span>
                  Imprimir / Descargar PDF
                </button>
              </div>

              {/* DATOS DEL EMPLEADO */}

              <div
                className="
                  grid
                  grid-cols-1
                  sm:grid-cols-2
                  gap-4
                  bg-slate-900/60
                  p-4
                  rounded-xl
                  border
                  border-slate-700/50
                  text-xs
                "
              >
                <div>
                  <span className="text-slate-400 block">
                    Empleado:
                  </span>

                  <span className="font-bold text-white">
                    {employee.fullName}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block">
                    Identificación:
                  </span>

                  <span className="font-bold text-white">
                    {employee.identification}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block">
                    Banco destino:
                  </span>

                  <span className="font-bold text-white">
                    {employee.bankName
                      ? `${employee.bankName} (*${employee.bankAccountLast4 ?? '----'})`
                      : 'No registrado'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block">
                    Fecha de emisión:
                  </span>

                  <span className="font-bold text-white">
                    {formatDate(
                      selectedPaystub.issueDate
                    )}
                  </span>
                </div>
              </div>

              {/* DEVENGADOS */}

              <section>
                <h4
                  className="
                    text-xs
                    font-bold
                    text-indigo-400
                    uppercase
                    tracking-wider
                    mb-2
                  "
                >
                  Percepciones (Devengado)
                </h4>

                <div className="space-y-1.5 text-xs text-slate-300">

                  <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800">
                    <span>Sueldo Básico</span>

                    <span className="font-mono whitespace-nowrap">
                      {formatCurrency(
                        selectedPaystub.baseSalary
                      )}
                    </span>
                  </div>

                  {selectedPaystub.auxTransporte >
                    0 && (
                    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800">
                      <span>
                        Auxilio de Transporte
                      </span>

                      <span className="font-mono whitespace-nowrap">
                        {formatCurrency(
                          selectedPaystub.auxTransporte
                        )}
                      </span>
                    </div>
                  )}

                  {selectedPaystub.overtime >
                    0 && (
                    <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800">
                      <span>
                        Horas Extras y Recargos
                      </span>

                      <span className="font-mono whitespace-nowrap">
                        {formatCurrency(
                          selectedPaystub.overtime
                        )}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4 font-bold text-white pt-2">
                    <span>
                      Total Devengado Bruto
                    </span>

                    <span className="font-mono whitespace-nowrap">
                      {formatCurrency(
                        selectedPaystub.grossEarnings
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {/* DEDUCCIONES */}

              <section>
                <h4
                  className="
                    text-xs
                    font-bold
                    text-rose-400
                    uppercase
                    tracking-wider
                    mb-2
                  "
                >
                  Deducciones de Ley
                </h4>

                <div className="space-y-1.5 text-xs text-slate-300">

                  <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800">
                    <span>
                      Aporte Salud (4%)
                    </span>

                    <span className="font-mono whitespace-nowrap">
                      -
                      {formatCurrency(
                        selectedPaystub.healthDeduction
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 py-1.5 border-b border-slate-800">
                    <span>
                      Aporte Pensión (4%)
                    </span>

                    <span className="font-mono whitespace-nowrap">
                      -
                      {formatCurrency(
                        selectedPaystub.pensionDeduction
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between gap-4 font-bold text-rose-300 pt-2">
                    <span>
                      Total Deducciones
                    </span>

                    <span className="font-mono whitespace-nowrap">
                      -
                      {formatCurrency(
                        selectedPaystub.totalDeductions
                      )}
                    </span>
                  </div>
                </div>
              </section>

              {/* NETO */}

              <div
                className="
                  p-4
                  bg-emerald-950/30
                  border
                  border-emerald-500/30
                  rounded-xl
                  flex
                  flex-col
```
