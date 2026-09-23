var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-s0ja6q/checked-fetch.js
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

// .wrangler/tmp/bundle-s0ja6q/strip-cf-connecting-ip-header.js
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
var COLOMBIA_PAYROLL_2026 = {
  SMMLV: 1750905,
  AUXILIO_TRANSPORTE: 249095,
  HEALTH_EMPLOYEE_RATE: 0.04,
  PENSION_EMPLOYEE_RATE: 0.04,
  HEALTH_EMPLOYER_RATE: 0.085,
  PENSION_EMPLOYER_RATE: 0.12,
  SENA_RATE: 0.02,
  ICBF_RATE: 0.03,
  // El test del proyecto utiliza 210 horas/mes.
  MONTHLY_HOURS: 210,
  // Recargos / horas extras
  EXTRA_DIURNA_RATE: 1.25,
  EXTRA_NOCTURNA_RATE: 1.75,
  RECARGO_NOCTURNO_RATE: 0.35
};
var ColombiaPayrollEngine = class {
  /**
   * Calcula la nómina de un empleado.
   */
  static calculate(input) {
    if (!input.employeeId) {
      throw new Error("employeeId es requerido");
    }
    if (!input.firstName) {
      throw new Error("firstName es requerido");
    }
    if (!input.lastName) {
      throw new Error("lastName es requerido");
    }
    if (!input.taxId) {
      throw new Error("taxId es requerido");
    }
    if (input.baseSalaryMonthly <= 0) {
      throw new Error("baseSalaryMonthly debe ser mayor a 0");
    }
    if (input.daysWorked < 1 || input.daysWorked > 30) {
      throw new Error("daysWorked debe estar entre 1 y 30");
    }
    const baseSalaryEarned = round2(
      input.baseSalaryMonthly / 30 * input.daysWorked
    );
    const qualifiesForTransport = input.baseSalaryMonthly <= COLOMBIA_PAYROLL_2026.SMMLV * 2;
    const earnedAuxTransporte = qualifiesForTransport ? round2(
      COLOMBIA_PAYROLL_2026.AUXILIO_TRANSPORTE / 30 * input.daysWorked
    ) : 0;
    const hourlyRate = round2(
      input.baseSalaryMonthly / COLOMBIA_PAYROLL_2026.MONTHLY_HOURS
    );
    const extraDiurnaHours = input.overtimeHours?.extraDiurna ?? 0;
    const extraNocturnaHours = input.overtimeHours?.extraNocturna ?? 0;
    const recargoNocturnoHours = input.overtimeHours?.recargoNocturno ?? 0;
    const extraDiurnaValue = round2(
      hourlyRate * extraDiurnaHours * COLOMBIA_PAYROLL_2026.EXTRA_DIURNA_RATE
    );
    const extraNocturnaValue = round2(
      hourlyRate * extraNocturnaHours * COLOMBIA_PAYROLL_2026.EXTRA_NOCTURNA_RATE
    );
    const recargoNocturnoValue = round2(
      hourlyRate * recargoNocturnoHours * COLOMBIA_PAYROLL_2026.RECARGO_NOCTURNO_RATE
    );
    const overtimeTotal = round2(
      extraDiurnaValue + extraNocturnaValue + recargoNocturnoValue
    );
    const grossEarnings = round2(
      baseSalaryEarned + earnedAuxTransporte + overtimeTotal
    );
    const ibcSecuritySocial = round2(
      baseSalaryEarned + overtimeTotal
    );
    const health4pct = round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.HEALTH_EMPLOYEE_RATE
    );
    const pension4pct = round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.PENSION_EMPLOYEE_RATE
    );
    const fsp = 0;
    const totalDeductions = round2(
      health4pct + pension4pct + fsp
    );
    const netPay = round2(
      grossEarnings - totalDeductions
    );
    const isExempt = input.isExempt114_1 === true;
    const health8_5pct = isExempt ? 0 : round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.HEALTH_EMPLOYER_RATE
    );
    const pension12pct = round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.PENSION_EMPLOYER_RATE
    );
    const sena2pct = isExempt ? 0 : round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.SENA_RATE
    );
    const icbf3pct = isExempt ? 0 : round2(
      ibcSecuritySocial * COLOMBIA_PAYROLL_2026.ICBF_RATE
    );
    const totalContributions = round2(
      health8_5pct + pension12pct + sena2pct + icbf3pct
    );
    return {
      employeeId: input.employeeId,
      employeeName: `${input.firstName} ${input.lastName}`.trim(),
      taxId: input.taxId,
      periodDate: getCurrentDate(),
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
        fsp,
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
function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
__name(round2, "round2");
function getCurrentDate() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
__name(getCurrentDate, "getCurrentDate");

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
      if (pathname === "/api" || pathname === "/api/" || pathname === "/") {
        return sendJson(
          {
            service: "Gesti\xF3n-Future Payroll & DIAN API",
            version: "1.0.0",
            endpoints: [
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
                  employeeInput: "ColombiaEmployeeInput",
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
          availableEndpoints: ["/api/health", "/api/colombia/payroll/calculate", "/api/dian/nomina-xml"]
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

// .wrangler/tmp/bundle-s0ja6q/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-s0ja6q/middleware-loader.entry.ts
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
