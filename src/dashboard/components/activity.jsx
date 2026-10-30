// ------------------------------------------------------------
// Registro de actividad de la empresa
//
//   <ActivitySection company={...} onError={fn} />
// Quién hizo qué y cuándo (GET /api/audit-log), con filtros, "cargar
// más" y descarga en CSV de lo cargado.
// ------------------------------------------------------------

const ACTIVITY_ACTIONS = [
  ['', 'Todas'],
  ['CLOSE', 'Cierres de periodo'],
  ['GENERATE_XML', 'XML DIAN generados'],
  ['EXPORT', 'Descargas (banco, PILA, contable)'],
  ['CREATE', 'Creaciones'],
  ['UPDATE', 'Ediciones'],
  ['DELETE', 'Eliminaciones'],
  ['IMPORT', 'Importaciones'],
  ['RECALCULATE', 'Recálculos de nómina'],
  ['APPROVE', 'Solicitudes aprobadas'],
  ['REJECT', 'Solicitudes rechazadas'],
  ['CANCEL', 'Solicitudes canceladas por el empleado']
];

function formatActivityDate(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function ActivitySection({ company, onError }) {
  const [entries, setEntries] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [filters, setFilters] = useState({ action: '', from: '', to: '' });
  const [loading, setLoading] = useState(false);

  const companyId = company ? company.id : '';
  // Sólo la respuesta de la última carga se aplica: si cambian la
  // empresa o los filtros mientras llega otra, esa se descarta.
  const loadSeq = useRef(0);

  async function load(before) {
    const seq = ++loadSeq.current;

    if (!companyId) {
      setEntries([]);
      setNextBefore(null);
      return;
    }
    const qs = new URLSearchParams({ companyId: companyId, limit: '50' });
    if (filters.action) qs.set('action', filters.action);
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    if (before) qs.set('before', before);

    try {
      setLoading(true);
      const r = await api('/api/audit-log?' + qs.toString());
      if (seq !== loadSeq.current) return;
      setEntries(function(prev) { return before ? prev.concat(r.data.entries) : r.data.entries; });
      setNextBefore(r.data.nextBefore);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setEntries([]);
      setNextBefore(null);
      onError(err.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(function() { load(null); }, [companyId, filters.action, filters.from, filters.to]);

  function downloadCsv() {
    // Comillas y apóstrofo inicial ante = + - @: Excel no lo toma como fórmula.
    const cell = function(v) {
      let t = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
      return '"' + t.replace(/"/g, '""') + '"';
    };
    const rows = [['FECHA', 'USUARIO', 'ACCION', 'DETALLE', 'REGISTRO'].join(',')].concat(
      entries.map(function(e) {
        return [cell(e.at), cell(e.email), cell(e.action + ' ' + e.entity), cell(e.description), cell(e.entityId)].join(',');
      })
    );
    downloadText('actividad-' + (company.nit || 'empresa') + '.csv', '\ufeff' + rows.join('\n'), 'text/csv;charset=utf-8');
  }

  function set(key) {
    return function(e) { setFilters({ ...filters, [key]: e.target.value }); };
  }

  if (!company) {
    return (
      <main style={{ padding: '24px' }}>
        <div className="info-box">Selecciona una empresa para ver su registro de actividad.</div>
      </main>
    );
  }

  return (
    <main style={{ padding: '24px', maxWidth: '1100px' }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>🗂️ Actividad de {company.name}</h2>
            <span>Quién calculó, cerró, descargó o cambió qué, y cuándo</span>
          </div>
          <button className="btn" onClick={downloadCsv} disabled={entries.length === 0}>⬇️ Descargar CSV</button>
        </div>

        <div className="panel-body">
          <div className="form-grid" style={{ marginBottom: '14px' }}>
            <div className="form-group">
              <label htmlFor="activity-action">Acción</label>
              <select id="activity-action" value={filters.action} onChange={set('action')}>
                {ACTIVITY_ACTIONS.map(function(a) { return <option key={a[0]} value={a[0]}>{a[1]}</option>; })}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="activity-from">Desde</label>
              <input id="activity-from" type="date" value={filters.from} onChange={set('from')} />
            </div>
            <div className="form-group">
              <label htmlFor="activity-to">Hasta</label>
              <input id="activity-to" type="date" value={filters.to} onChange={set('to')} />
            </div>
          </div>

          {entries.length === 0 && !loading ? (
            <div className="empty">No hay actividad registrada con esos filtros.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                  <th style={{ padding: '8px 6px' }}>Fecha</th>
                  <th style={{ padding: '8px 6px' }}>Usuario</th>
                  <th style={{ padding: '8px 6px' }}>Qué hizo</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(function(e) {
                  return (
                    <tr key={e.id} style={{ borderTop: '1px solid #1d3047' }}>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatActivityDate(e.at)}</td>
                      <td style={{ padding: '8px 6px' }}>{e.email || '—'}</td>
                      <td style={{ padding: '8px 6px' }}>
                        {e.description}
                        {e.entityId && <div style={{ color: '#8193aa', fontSize: '11px' }}>{e.entityId}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {nextBefore && (
            <div style={{ textAlign: 'center', marginTop: '14px' }}>
              <button className="btn" disabled={loading} onClick={function() { load(nextBefore); }}>
                {loading ? 'Cargando…' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
