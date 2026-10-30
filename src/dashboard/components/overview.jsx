// ------------------------------------------------------------
// Panel central de empresas (vista de la outsourcing)
//
//   <OverviewSection onOpenCompany={fn(companyId)} onError={fn} />
// Estado de la nómina del mes de cada empresa y lo que falta por
// hacer. Datos de GET /api/overview.
// ------------------------------------------------------------

const OVERVIEW_STATUS = {
  CLOSED: ['✅', 'Cerrado'],
  DRAFT: ['🟡', 'Abierto']
};

function OverviewSection({ onOpenCompany, onError }) {
  const [data, setData] = useState(null);

  useEffect(function() {
    let cancelled = false;
    api('/api/overview')
      .then(function(r) { if (!cancelled) setData(r.data); })
      .catch(function(err) { if (!cancelled) onError(err.message); });
    return function() { cancelled = true; };
  }, []);

  if (!data) {
    return <main style={{ padding: '24px' }}><div className="info-box">Cargando el panel…</div></main>;
  }

  const s = data.summary;
  const tiles = [
    ['Empresas', s.companies],
    ['Con pendientes', s.withAlerts],
    ['Cerradas en ' + data.month.label, s.closedThisMonth],
    ['Empleados activos', s.activeEmployees],
    ['Solicitudes por decidir', s.pendingRequests]
  ];

  return (
    <main style={{ padding: '24px', maxWidth: '1200px' }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>🏢 Panel de empresas · {data.month.label}</h2>
            <span>Primero las empresas con más pendientes</span>
          </div>
        </div>

        <div className="panel-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '18px' }}>
            {tiles.map(function(t) {
              return (
                <div key={t[0]} className="info-box" style={{ margin: 0 }}>
                  <div style={{ fontSize: '11px', color: '#8193aa' }}>{t[0]}</div>
                  <div style={{ fontSize: '22px', fontWeight: 800 }}>{t[1]}</div>
                </div>
              );
            })}
          </div>

          {data.companies.length === 0 ? (
            <div className="empty">No hay empresas activas.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                  <th style={{ padding: '8px 6px' }}>Empresa</th>
                  <th style={{ padding: '8px 6px' }}>Nómina del mes</th>
                  <th style={{ padding: '8px 6px' }}>Pendientes</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {data.companies.map(function(c) {
                  const p = c.currentPeriod;
                  const st = p ? OVERVIEW_STATUS[p.status] : ['⚪', 'Sin periodo'];
                  return (
                    <tr key={c.companyId} style={{ borderTop: '1px solid #1d3047', verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 6px' }}>
                        <strong>{c.name}</strong>
                        <div style={{ color: '#8193aa', fontSize: '11px' }}>
                          NIT {c.nit} · {c.activeEmployees} empleado(s)
                          {c.lastActivityAt ? ' · última actividad ' + formatActivityDate(c.lastActivityAt) : ''}
                        </div>
                      </td>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>
                        {st[0]} {st[1]}
                        {p && <div style={{ color: '#8193aa', fontSize: '11px' }}>{p.periodStart} a {p.periodEnd} · {p.settlements} liquidada(s)</div>}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {c.alerts.length === 0
                          ? <span style={{ color: '#22c55e' }}>Al día</span>
                          : (
                            <ul style={{ margin: 0, paddingLeft: '16px' }}>
                              {c.alerts.map(function(a) { return <li key={a.code}>{a.message}</li>; })}
                            </ul>
                          )}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        <button className="btn" onClick={function() { onOpenCompany(c.companyId); }}>Abrir</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
