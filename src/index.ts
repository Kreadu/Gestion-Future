import { ColombiaPayrollEngine, ColombiaEmployeeInput } from './engine/countries/colombiaEngine';
import { DianNominaXmlService, DianEmployerInfo, DianEmployeeExtraInfo } from './services/dianNominaXmlService';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Healthcheck
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'Gestion-Future Payroll &amp; DIAN API' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Endpoint: Cálculo de Nómina Colombia
    if (url.pathname === '/api/colombia/payroll/calculate' &amp;&amp; request.method === 'POST') { 
      try { 
        const body = await request.json() as { employeeInput: ColombiaEmployeeInput };
        const result = ColombiaPayrollEngine.calculate(body.employeeInput);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } }); 
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
      }
    }

  // Endpoint: Generación de XML de Nómina Electrónica para la DIAN
    if (url.pathname === '/api/dian/nomina-xml' &amp;&amp; request.method === 'POST') {
      try {
        const body = await request.json() as {
          employeeInput: ColombiaEmployeeInput;
          employerInfo: DianEmployerInfo;
          employeeExtraInfo: DianEmployeeExtraInfo;
          consecutiveNumber: number;
        };

        // 1. Calcular nómina con el motor de Colombia
        const payrollResult = ColombiaPayrollEngine.calculate(body.employeeInput);

        // 2. Generar XML y CUNE
        const xmlResult = await DianNominaXmlService.generateDSPNE(
          payrollResult,
          body.employerInfo,
          body.employeeExtraInfo,
          body.consecutiveNumber || 1
        );

        return new Response(JSON.stringify({
          success: true,
          payrollSummary: payrollResult,
          dianDocument: xmlResult
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint no encontrado' }), { status: 404 });
  }
};

```
