import { PayrollCalculator } from './engine/payrollCalculator';
import { Employee } from './types/payroll';

export default { 
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') { 
      return new Response(JSON.stringify({ status: 'ok', service: 'Gestion-Future Payroll API' }),{ 
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/api/payroll/calculate' &amp;&amp; request.method === 'POST') {
      try { 
        const body = await request.json() as { employee: Employee; daysWorked?: number };
        const result = PayrollCalculator.calculateMonthlyPayroll(body.employee, body.daysWorked || 30); 
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        }); 
      } catch (err: any) {
        return new Response(JSON.stringify({ error: err.message }), { status: 400 });
      }
    }
    return new Response('Endpoint no encontrado en Gestion-Future API', { status: 404 });
  }
};
