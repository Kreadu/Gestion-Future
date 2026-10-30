// ------------------------------------------------------------
// Solicitudes de vacaciones y permisos
//
//   <PortalRequests onError={fn} />                         pestaña del portal del empleado
//   <RequestsSection company={...} onError onSuccess />     bandeja del administrador
// API: /api/portal/requests (empleado) y /api/employee-requests (admin).
// ------------------------------------------------------------

const REQUEST_TYPE_LABELS = { VACATION: '🏖️ Vacaciones', PERMISSION: '🕑 Permiso' };
const REQUEST_STATUS_LABELS = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', CANCELLED: 'Cancelada' };
const REQUEST_STATUS_COLORS = { PENDING: '#f59e0b', APPROVED: '#22c55e', REJECTED: '#ef4444', CANCELLED: '#8193aa' };

function RequestStatus({ status }) {
  return (
    <strong style={{ color: REQUEST_STATUS_COLORS[status], whiteSpace: 'nowrap' }}>
      {REQUEST_STATUS_LABELS[status] || status}
    </strong>
  );
}

function requestDates(r) {
  return r.startDate === r.endDate ? r.startDate : r.startDate + ' a ' + r.endDate;
}

function PortalRequests({ onError }) {
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ requestType: 'VACATION', startDate: '', endDate: '', reason: '' });
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const r = await api('/api/portal/requests');
      setRequests(r.data || []);
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(function() { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    onError('');
    setNotice('');

    try {
      setSaving(true);
      const r = await api('/api/portal/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const d = r.data;
      setNotice(
        'Solicitud enviada; tu administrador la revisará.' +
        (d.exceedsBalance
          ? ' Pediste ' + d.businessDays + ' días hábiles y tu saldo disponible es ' + d.pendingDays + ': serían vacaciones anticipadas.'
          : '')
      );
      setForm({ requestType: form.requestType, startDate: '', endDate: '', reason: '' });
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(r) {
    if (!confirm('¿Cancelar la solicitud del ' + requestDates(r) + '?')) return;
    onError('');
    try {
      await api('/api/portal/requests/' + encodeURIComponent(r.id) + '/cancel', { method: 'POST' });
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  function set(key) {
    return function(e) { setForm({ ...form, [key]: e.target.value }); };
  }

  return (
    <>
      <section className="portal-card">
        <h2>Nueva solicitud</h2>
        <form className="portal-card-body form-grid" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="req-type">Tipo</label>
            <select id="req-type" value={form.requestType} onChange={set('requestType')}>
              <option value="VACATION">Vacaciones</option>
              <option value="PERMISSION">Permiso</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="req-start">Desde</label>
            <input id="req-start" type="date" required value={form.startDate} onChange={set('startDate')} />
          </div>
          <div className="form-group">
            <label htmlFor="req-end">Hasta</label>
            <input id="req-end" type="date" required value={form.endDate} onChange={set('endDate')} />
          </div>
          <div className="form-group full">
            <label htmlFor="req-reason">{form.requestType === 'PERMISSION' ? 'Motivo' : 'Comentario (opcional)'}</label>
            <input id="req-reason" maxLength={500} required={form.requestType === 'PERMISSION'}
              value={form.reason} onChange={set('reason')} />
          </div>
          <div className="form-group full">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
          {notice && <div className="info-box full" role="status">{notice}</div>}
        </form>
      </section>

      <section className="portal-card">
        <h2>Mis solicitudes</h2>
        <div className="portal-card-body">
          {requests.length === 0 && <div className="portal-muted">No has hecho solicitudes.</div>}
          {requests.map(function(r) {
            return (
              <div key={r.id} className="portal-list-item">
                <div style={{ minWidth: 0 }}>
                  <div>{REQUEST_TYPE_LABELS[r.requestType]} · {requestDates(r)}</div>
                  <div className="portal-muted">
                    {[r.businessDays ? r.businessDays + ' días hábiles' : null, r.reason, r.decisionNotes ? 'Respuesta: ' + r.decisionNotes : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <RequestStatus status={r.status} />
                  {r.status === 'PENDING' && <button className="btn" onClick={function() { cancel(r); }}>Cancelar</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function RequestsSection({ company, onError, onSuccess }) {
  const [requests, setRequests] = useState([]);
  const [status, setStatus] = useState('PENDING');
  const [busy, setBusy] = useState('');

  const companyId = company ? company.id : '';
  // Descarta cargas anteriores si cambian empresa o estado antes de que respondan.
  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;

    if (!companyId) {
      setRequests([]);
      return;
    }
    try {
      const r = await api('/api/employee-requests?companyId=' + encodeURIComponent(companyId) +
        '&status=' + encodeURIComponent(status));
      if (seq !== loadSeq.current) return;
      setRequests(r.data || []);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      onError(err.message);
    }
  }

  useEffect(function() { load(); }, [companyId, status]);

  async function decide(r, action) {
    const notes = action === 'reject'
      ? prompt('Motivo del rechazo (lo verá ' + r.employeeName + '):', '')
      : '';
    if (notes === null) return;

    onError('');
    onSuccess('');
    try {
      setBusy(r.id);
      await api('/api/employee-requests/' + encodeURIComponent(r.id) + '/' + action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes })
      });
      onSuccess(action === 'approve'
        ? (r.requestType === 'VACATION'
          ? 'Vacaciones aprobadas y registradas como novedad de ' + r.employeeName + '.'
          : 'Permiso aprobado.')
        : 'Solicitud rechazada.');
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy('');
    }
  }

  if (!company) {
    return (
      <main style={{ padding: '24px' }}>
        <div className="info-box">Selecciona una empresa para ver las solicitudes de sus empleados.</div>
      </main>
    );
  }

  return (
    <main style={{ padding: '24px', maxWidth: '980px' }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>📨 Solicitudes de {company.name}</h2>
            <span>Vacaciones y permisos pedidos desde el portal del empleado</span>
          </div>
          <div className="form-group" style={{ margin: 0, minWidth: '180px' }}>
            <label htmlFor="requests-status">Estado</label>
            <select id="requests-status" value={status} onChange={function(e) { setStatus(e.target.value); }}>
              <option value="PENDING">Pendientes</option>
              <option value="APPROVED">Aprobadas</option>
              <option value="REJECTED">Rechazadas</option>
              <option value="CANCELLED">Canceladas</option>
              <option value="">Todas</option>
            </select>
          </div>
        </div>

        <div className="panel-body">
          {requests.length === 0 ? (
            <div className="empty">No hay solicitudes {status ? REQUEST_STATUS_LABELS[status].toLowerCase() + 's' : ''}.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                  <th style={{ padding: '8px 6px' }}>Empleado</th>
                  <th style={{ padding: '8px 6px' }}>Solicitud</th>
                  <th style={{ padding: '8px 6px' }}>Estado</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {requests.map(function(r) {
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid #1d3047' }}>
                      <td style={{ padding: '8px 6px' }}>
                        {r.employeeName}
                        <div style={{ color: '#8193aa', fontSize: '11px' }}>{r.taxId}</div>
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {REQUEST_TYPE_LABELS[r.requestType]} · {requestDates(r)}
                        <div style={{ color: '#8193aa', fontSize: '11px' }}>
                          {[r.businessDays ? r.businessDays + ' días hábiles' : null,
                            r.pendingDays !== null && r.pendingDays !== undefined ? 'saldo disponible ' + r.pendingDays : null,
                            r.reason].filter(Boolean).join(' · ')}
                        </div>
                        {r.exceedsBalance && (
                          <div style={{ color: '#f59e0b', fontSize: '11px' }}>⚠️ Supera el saldo: serían vacaciones anticipadas.</div>
                        )}
                        {r.decisionNotes && <div style={{ color: '#8193aa', fontSize: '11px' }}>Respuesta: {r.decisionNotes}</div>}
                      </td>
                      <td style={{ padding: '8px 6px' }}><RequestStatus status={r.status} /></td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.status === 'PENDING' && (
                          <>
                            <button className="btn btn-success" disabled={busy === r.id}
                              onClick={function() { decide(r, 'approve'); }}>Aprobar</button>{' '}
                            <button className="btn btn-danger" disabled={busy === r.id}
                              onClick={function() { decide(r, 'reject'); }}>Rechazar</button>
                          </>
                        )}
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
