/**
 * Consultas y utilidades de empleados por periodo compartidas entre
 * rutas (PILA, revisión de cierre, prestaciones, portal).
 */

export function employeeName(row: any): string {
  return [row.firstName, row.firstName2, row.lastName, row.lastName2]
    .filter(Boolean)
    .join(' ');
}

/**
 * Empleados vinculados a la empresa durante el periodo (contratados
 * antes del fin y no retirados antes del inicio) que no tienen
 * liquidación en él.
 */
export async function linkedEmployeesWithoutSettlement(env: { DB: D1Database }, period: any): Promise<any[]> {
  const result = await env.DB
    .prepare(`
      SELECT e.*
      FROM employees e
      WHERE e.companyId = ?1
        AND (e.hireDate IS NULL OR e.hireDate <= ?3)
        AND (e.terminationDate IS NULL OR e.terminationDate >= ?2)
        AND (e.active = 1 OR e.terminationDate IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM payroll_settlements s
          WHERE s.periodId = ?4 AND s.employeeId = e.id
        )
      ORDER BY e.lastName, e.firstName
    `)
    .bind(period.companyId, period.periodStart, period.periodEnd, period.id)
    .all<any>();

  return result.results || [];
}
