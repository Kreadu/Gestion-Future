// ------------------------------------------------------------
// CLIENTES DEL PERSONAL POR HORAS — temporales (EST) y servicios
//
//   <ServiceClientsButton company={...} />   botón + modal
//
// Clientes: /api/service-clients (figura EST o SERVICIO, forma de
// cobro, % administración y clase de riesgo ARL del sitio).
// Autorización EST: /api/companies/:id/est-authorization.
// Cobro: /api/service-clients/:id/billing?from=&to=
// Liquidación del mes: POST /api/service-clients/:id/settle-month
// ------------------------------------------------------------

const CLIENT_FIGURE_LABELS = {
  EST: 'Empresa usuaria (EST, trabajadores en misión)',
  SERVICIO: 'Prestación de servicio (aseo, meseros…)'
};

const BILLING_MODE_LABELS = {
  HOURLY_RATE: 'Tarifa por hora',
  COST_PLUS: 'Costo + % administración'
};

const EMPTY_CLIENT = {
  name: '', nit: '', address: '', city: '',
  figure: 'SERVICIO', billingMode: 'COST_PLUS', adminFeePct: '0', arlRiskClass: '1'
};

function csvCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  // Evita fórmulas al abrir el CSV en Excel.
  const safe = /^[=+\-@]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function monthRange(month) {
  const parts = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  return { from: month + '-01', to: month + '-' + String(lastDay).padStart(2, '0') };
}

function SettleMonthResult({ result }) {
  return (
    <div style={{ marginTop: '10px' }}>
      <div className="info-box">
        Liquidados: {result.settled.length}
        {result.alreadySettled.length > 0 ? ' · ya estaban liquidados: ' + result.alreadySettled.length : ''}
      </div>
      {result.missingTimesheet.length > 0 && (
        <div className="inline-warning" style={{ marginTop: '8px' }}>
          Sin planilla de horas (pídele al cliente que la llene y vuelve a liquidar):{' '}
          {result.missingTimesheet.map(function(w) { return w.worker + (w.position ? ' (' + w.position + ')' : ''); }).join(', ')}
        </div>
      )}
      {result.errors.map(function(e) {
        return <div key={e.engagementId} className="inline-warning" style={{ marginTop: '8px' }}>{e.worker}: {e.error}</div>;
      })}
    </div>
  );
}

function ClientBilling({ client }) {
  const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  const [month, setMonth] = useState(today.slice(0, 7));
  const { from, to } = monthRange(month);
  const [data, setData] = useState(null);
  const [settleResult, setSettleResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const r = await api('/api/service-clients/' + encodeURIComponent(client.id) + '/billing?from=' + from + '&to=' + to);
      setData(r.data);
    } catch (err) {
      setData(null);
      setError(err.message);
    }
  }

  async function settleMonth() {
    setError('');
    setSettleResult(null);
    setBusy(true);
    try {
      const r = await api('/api/service-clients/' + encodeURIComponent(client.id) + '/settle-month', {
        method: 'POST',
        body: JSON.stringify({ month: month })
      });
      setSettleResult(r.data);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const header = ['Trabajador', 'Documento', 'Cargo', 'Desde', 'Hasta', 'Horas', 'Costo nómina', 'Valor a cobrar'];
    const rows = data.lines.map(function(l) {
      return [l.worker, l.taxId, l.position, l.periodStart, l.periodEnd, l.hours, l.payrollCost, l.billed];
    });
    rows.push(['TOTAL', '', '', from, to, data.totals.hours, data.totals.payrollCost, data.totals.billed]);
    const csv = [header].concat(rows).map(function(r) { return r.map(csvCell).join(';'); }).join('\r\n');
    downloadText('cobro-' + client.name.replace(/[^\w-]+/g, '-') + '-' + from + '-' + to + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
  }

  return (
    <div className="result-section" style={{ marginTop: '12px' }}>
      <h3>💲 Cobro a {client.name}</h3>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="billing-month">Mes</label>
          <input id="billing-month" type="month" value={month}
            onChange={function(e) { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setMonth(e.target.value); setData(null); setSettleResult(null); } }} />
        </div>
      </div>
      <div className="button-row">
        <button className="btn btn-primary" onClick={settleMonth} disabled={busy}>
          {busy ? 'Liquidando…' : 'Liquidar el mes'}
        </button>
        <button className="btn" onClick={load}>Calcular cobro</button>
        {data && data.lines.length > 0 && <button className="btn" onClick={download}>⬇️ Descargar CSV</button>}
      </div>
      <p style={{ fontSize: '12px', color: '#8193aa', margin: '6px 0 0' }}>
        Liquida del {from} al {to} a todos los trabajadores de este cliente que tengan planilla de horas.
      </p>

      {error && <div className="inline-warning" role="alert" style={{ marginTop: '10px' }}>{error}</div>}
      {settleResult && <SettleMonthResult result={settleResult} />}

      {data && (
        <div style={{ marginTop: '10px' }}>
          {data.warnings.map(function(w, i) { return <div key={i} className="inline-warning" style={{ marginBottom: '8px' }}>{w}</div>; })}
          {data.lines.length === 0 ? (
            <div className="info-box">No hay liquidaciones de este cliente en el periodo.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Trabajador</th>
                  <th style={{ textAlign: 'left' }}>Periodo</th>
                  <th style={{ textAlign: 'right' }}>Horas</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>A cobrar</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map(function(l) {
                  return (
                    <tr key={l.settlementId}>
                      <td>{l.worker}{l.position ? ' · ' + l.position : ''}</td>
                      <td>{l.periodStart} a {l.periodEnd}</td>
                      <td style={{ textAlign: 'right' }}>{l.hours}</td>
                      <td style={{ textAlign: 'right' }}>{formatCOP(l.payrollCost)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCOP(l.billed)}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan="2">Total · margen {formatCOP(data.totals.margin)}</td>
                  <td style={{ textAlign: 'right' }}>{data.totals.hours}</td>
                  <td style={{ textAlign: 'right' }}>{formatCOP(data.totals.payrollCost)}</td>
                  <td style={{ textAlign: 'right' }}>{formatCOP(data.totals.billed)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function EstAuthorizationForm({ company }) {
  const [form, setForm] = useState({ resolution: '', resolutionDate: '', insurancePolicy: '' });
  const [saved, setSaved] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(function() {
    let cancelled = false;
    api('/api/companies/' + encodeURIComponent(company.id) + '/est-authorization')
      .then(function(r) {
        if (cancelled || !r.data) return;
        setSaved(r.data);
        setForm({ resolution: r.data.resolution, resolutionDate: r.data.resolutionDate, insurancePolicy: r.data.insurancePolicy || '' });
      })
      .catch(function() {});
    return function() { cancelled = true; };
  }, [company.id]);

  async function save() {
    setMessage('');
    try {
      const r = await api('/api/companies/' + encodeURIComponent(company.id) + '/est-authorization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      setSaved(r.data);
      setMessage('Autorización EST guardada.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  function field(key) {
    return function(e) {
      const value = e.target.value;
      setForm(function(prev) { return { ...prev, [key]: value }; });
    };
  }

  return (
    <details style={{ marginBottom: '12px' }} open={!saved}>
      <summary>🏛️ Autorización EST del Ministerio del Trabajo {saved ? '· ' + saved.resolution : '(sin registrar)'}</summary>
      <div className="info-box" style={{ margin: '8px 0' }}>
        Sólo con la resolución que autoriza a {company.name} como Empresa de Servicios Temporales se pueden
        enviar trabajadores en misión. Las misiones duran máximo 6 meses, prorrogables otros 6.
      </div>
      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="est-resolution">Resolución</label>
          <input id="est-resolution" value={form.resolution} onChange={field('resolution')} />
        </div>
        <div className="form-group">
          <label htmlFor="est-date">Fecha de la resolución</label>
          <input id="est-date" type="date" value={form.resolutionDate} onChange={field('resolutionDate')} />
        </div>
        <div className="form-group">
          <label htmlFor="est-policy">Póliza de garantía</label>
          <input id="est-policy" value={form.insurancePolicy} onChange={field('insurancePolicy')} />
        </div>
      </div>
      <div className="button-row">
        <button className="btn" onClick={save}>Guardar autorización</button>
      </div>
      {message && <div className="info-box" role="status" style={{ marginTop: '8px' }}>{message}</div>}
    </details>
  );
}

function ServiceClientsModal({ company, onClose }) {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [billingClient, setBillingClient] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    try {
      const r = await api('/api/service-clients?companyId=' + encodeURIComponent(company.id));
      setClients(r.data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(function() { load(); }, [company.id]);

  function edit(client) {
    setEditing(client);
    setBillingClient(null);
    setForm(client ? {
      name: client.name, nit: client.nit || '', address: client.address || '', city: client.city || '',
      figure: client.figure, billingMode: client.billingMode,
      adminFeePct: String(client.adminFeePct), arlRiskClass: String(client.arlRiskClass)
    } : { ...EMPTY_CLIENT });
  }

  function field(key) {
    return function(e) {
      const value = e.target.value;
      setForm(function(prev) { return { ...prev, [key]: value }; });
    };
  }

  async function save() {
    setError('');
    setNotice('');
    try {
      const body = { ...form, companyId: company.id, adminFeePct: Number(form.adminFeePct) || 0, arlRiskClass: Number(form.arlRiskClass) };
      await api(editing ? '/api/service-clients/' + encodeURIComponent(editing.id) : '/api/service-clients', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      setNotice(editing ? 'Cliente actualizado.' : 'Cliente creado.');
      setForm(null);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Clientes" style={{ width: 'min(760px, 100%)' }}>
        <div className="modal-header">
          <h3>🤝 Clientes · temporales y servicios</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <EstAuthorizationForm company={company} />

          {error && <div className="inline-warning" role="alert" style={{ marginBottom: '10px' }}>{error}</div>}
          {notice && <div className="info-box" role="status" style={{ marginBottom: '10px' }}>{notice}</div>}

          {!form && (
            <>
              {clients.length === 0 && <div className="info-box">Aún no hay clientes.</div>}
              {clients.map(function(client) {
                return (
                  <div key={client.id} className="result-row" style={{ alignItems: 'center' }}>
                    <span>
                      <strong>{client.name}</strong>{client.active ? '' : ' (inactivo)'}
                      <br />
                      <small>
                        {CLIENT_FIGURE_LABELS[client.figure]} · {BILLING_MODE_LABELS[client.billingMode]}
                        {client.billingMode === 'COST_PLUS' ? ' ' + client.adminFeePct + '%' : ''} · ARL clase {client.arlRiskClass}
                      </small>
                    </span>
                    <span className="button-row" style={{ margin: 0 }}>
                      <button className="btn" onClick={function() { setBillingClient(client); }}>💲 Cobro</button>
                      <button className="btn" onClick={function() { edit(client); }}>✏️</button>
                    </span>
                  </div>
                );
              })}
              <div className="button-row" style={{ marginTop: '12px' }}>
                <button className="btn btn-primary" onClick={function() { edit(null); }}>+ Nuevo cliente</button>
              </div>
              {billingClient && <ClientBilling key={billingClient.id} client={billingClient} />}
            </>
          )}

          {form && (
            <div className="form-grid">
              <div className="form-group full">
                <label htmlFor="client-name" className="required">Nombre del cliente</label>
                <input id="client-name" value={form.name} onChange={field('name')} />
              </div>
              <div className="form-group">
                <label htmlFor="client-nit">NIT del cliente</label>
                <input id="client-nit" value={form.nit} onChange={field('nit')} />
              </div>
              <div className="form-group">
                <label htmlFor="client-city">Ciudad</label>
                <input id="client-city" value={form.city} onChange={field('city')} />
              </div>
              <div className="form-group full">
                <label htmlFor="client-address">Dirección del sitio de trabajo</label>
                <input id="client-address" value={form.address} onChange={field('address')} />
              </div>
              <div className="form-group full">
                <label htmlFor="client-figure">Figura</label>
                <select id="client-figure" value={form.figure} onChange={field('figure')}>
                  <option value="SERVICIO">{CLIENT_FIGURE_LABELS.SERVICIO}</option>
                  <option value="EST">{CLIENT_FIGURE_LABELS.EST}</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="client-billing">Forma de cobro</label>
                <select id="client-billing" value={form.billingMode} onChange={field('billingMode')}>
                  <option value="COST_PLUS">{BILLING_MODE_LABELS.COST_PLUS}</option>
                  <option value="HOURLY_RATE">{BILLING_MODE_LABELS.HOURLY_RATE}</option>
                </select>
              </div>
              {form.billingMode === 'COST_PLUS' && (
                <div className="form-group">
                  <label htmlFor="client-fee">% de administración</label>
                  <input id="client-fee" type="number" min="0" max="100" step="0.1" value={form.adminFeePct} onChange={field('adminFeePct')} />
                </div>
              )}
              <div className="form-group">
                <label htmlFor="client-arl">Clase de riesgo ARL del sitio</label>
                <select id="client-arl" value={form.arlRiskClass} onChange={field('arlRiskClass')}>
                  {[1, 2, 3, 4, 5].map(function(n) { return <option key={n} value={String(n)}>Clase {n}</option>; })}
                </select>
              </div>
              <div className="form-group full button-row">
                <button className="btn" onClick={function() { setForm(null); setEditing(null); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={save}>Guardar cliente</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceClientsButton({ company }) {
  const [open, setOpen] = useState(false);
  if (!company) return null;

  return (
    <>
      <button className="btn" onClick={function() { setOpen(true); }}>🤝 Clientes</button>
      {open && <ServiceClientsModal key={company.id} company={company} onClose={function() { setOpen(false); }} />}
    </>
  );
}
