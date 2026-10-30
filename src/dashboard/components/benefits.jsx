// ------------------------------------------------------------
// PRESTACIONES — vacaciones, prima, cesantías y liquidación final
// ------------------------------------------------------------

const TERMINATION_REASON_LABELS = {
  RENUNCIA: 'Renuncia voluntaria',
  DESPIDO_JUSTA_CAUSA: 'Despido con justa causa',
  DESPIDO_SIN_JUSTA_CAUSA: 'Despido sin justa causa',
  MUTUO_ACUERDO: 'Mutuo acuerdo',
  FIN_CONTRATO: 'Terminación del plazo / obra'
};

function VacationBalance({ employee }) {
  const [balance, setBalance] = useState(null);

  useEffect(function() {
    let cancelled = false;
    setBalance(null);

    if (!employee.hireDate) return;

    api('/api/employees/' + encodeURIComponent(employee.id) + '/vacation-balance')
      .then(function(r) { if (!cancelled) setBalance(r.data); })
      .catch(function() {});

    return function() { cancelled = true; };
  }, [employee.id]);

  if (!employee.hireDate) {
    return <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '6px' }}>Sin fecha de ingreso: no se puede calcular el saldo de vacaciones.</div>;
  }

  if (!balance) return null;

  return (
    <div style={{ fontSize: '12px', marginTop: '6px', color: '#8193aa' }}>
      🏖️ Vacaciones: <strong style={{ color: '#e5edf7' }}>{formatNumber2(balance.pendingDays)} días hábiles pendientes</strong>
      {' '}({formatNumber2(balance.accruedDays)} causados, {formatNumber2(balance.takenDays)} disfrutados)
    </div>
  );
}

function formatNumber2(value) {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function BenefitsSection({ company, onError, onSuccess }) {
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState({
    benefitType: 'PRIMA',
    year: thisYear,
    semester: new Date().getMonth() < 6 ? 1 : 2
  });
  const [preview, setPreview] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);

  const companyId = company ? company.id : '';

  async function loadPayments() {
    if (!companyId) return;
    try {
      const r = await api('/api/benefit-payments?companyId=' + encodeURIComponent(companyId));
      setPayments(r.data || []);
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(function() {
    setPreview(null);
    loadPayments();
  }, [companyId]);

  async function calculate(save) {
    onError('');
    onSuccess('');

    if (save && !confirm('¿Registrar el pago para todos los empleados de la lista que aún no lo tienen?')) return;

    try {
      setLoading(true);
      const r = await api('/api/benefits/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: companyId,
          benefitType: form.benefitType,
          year: Number(form.year),
          semester: Number(form.semester),
          save: save
        })
      });
      setPreview(r.data);
      if (save) {
        onSuccess('Pago registrado para ' + r.data.saved + ' empleado(s).');
        await loadPayments();
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function removePayment(p) {
    if (!confirm('¿Anular el registro de este pago?')) return;
    try {
      await api('/api/benefit-payments/' + encodeURIComponent(p.id), { method: 'DELETE' });
      await loadPayments();
    } catch (err) {
      onError(err.message);
    }
  }

  function exportCsv() {
    const isCes = form.benefitType === 'CESANTIAS';
    const head = ['Documento', 'Nombre', 'Desde', 'Hasta', 'Días', 'Base', 'Valor'].concat(isCes ? ['Intereses'] : []);
    const lines = [head.join(';')].concat(preview.rows.map(function(r) {
      return [r.taxId, r.name, r.from, r.to, r.days, Math.round(r.base), Math.round(r.amount)]
        .concat(isCes ? [Math.round(r.interest)] : [])
        .join(';');
    }));
    downloadText(
      (isCes ? 'cesantias-' + form.year : 'prima-' + form.year + '-S' + form.semester) + '.csv',
      '﻿' + lines.join('\r\n'),
      'text/csv;charset=utf-8'
    );
  }

  if (!company) {
    return (
      <main style={{ padding: '24px' }}>
        <div className="info-box">Selecciona o crea una empresa.</div>
      </main>
    );
  }

  const totals = preview ? preview.rows.reduce(function(acc, r) {
    return { amount: acc.amount + r.amount, interest: acc.interest + r.interest };
  }, { amount: 0, interest: 0 }) : null;

  const LABELS = { PRIMA: 'Prima', CESANTIAS: 'Cesantías', INTERESES_CESANTIAS: 'Intereses cesantías' };

  return (
    <main style={{ padding: '24px', maxWidth: '1100px' }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>🎁 Prima y cesantías</h2>
            <span>Prima: 30 de junio y 20 de diciembre · Cesantías: consignar al fondo antes del 14 de febrero · Intereses: pagar al empleado antes del 31 de enero</span>
          </div>
        </div>

        <div className="panel-body">
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="benefit-type">Prestación</label>
              <select id="benefit-type" value={form.benefitType} onChange={function(e) { setForm({ ...form, benefitType: e.target.value }); setPreview(null); }}>
                <option value="PRIMA">Prima de servicios (semestral)</option>
                <option value="CESANTIAS">Cesantías e intereses (anual)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="benefit-year">Año</label>
              <input id="benefit-year" type="number" value={form.year} onChange={function(e) { setForm({ ...form, year: e.target.value }); setPreview(null); }} />
            </div>

            {form.benefitType === 'PRIMA' && (
              <div className="form-group">
                <label htmlFor="benefit-semester">Semestre</label>
                <select id="benefit-semester" value={form.semester} onChange={function(e) { setForm({ ...form, semester: e.target.value }); setPreview(null); }}>
                  <option value="1">Enero – junio</option>
                  <option value="2">Julio – diciembre</option>
                </select>
              </div>
            )}

            <div className="form-group full button-row">
              <button className="btn btn-primary" onClick={function() { calculate(false); }} disabled={loading}>🧮 Calcular</button>
              {preview && (
                <>
                  <button className="btn btn-success" onClick={function() { calculate(true); }} disabled={loading}>✅ Registrar pago</button>
                  <button className="btn" onClick={exportCsv}>⬇️ Exportar CSV</button>
                </>
              )}
            </div>
          </div>

          {preview && (
            preview.rows.length === 0 ? (
              <div className="empty">No hay empleados con derecho en este periodo (se requiere fecha de ingreso; salario integral excluido).</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '16px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                    <th style={{ padding: '6px' }}>Empleado</th>
                    <th style={{ padding: '6px' }}>Periodo</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Días</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Base</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Valor</th>
                    {form.benefitType === 'CESANTIAS' && <th style={{ padding: '6px', textAlign: 'right' }}>Intereses</th>}
                    <th style={{ padding: '6px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map(function(r) {
                    return (
                      <tr key={r.employeeId} style={{ borderTop: '1px solid #1d3047' }}>
                        <td style={{ padding: '6px' }}>{r.name}<div style={{ color: '#8193aa' }}>{r.taxId}</div></td>
                        <td style={{ padding: '6px' }}>{r.from} a {r.to}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{r.days}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(r.base)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(r.amount)}</td>
                        {form.benefitType === 'CESANTIAS' && <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(r.interest)}</td>}
                        <td style={{ padding: '6px' }}>{r.alreadyPaid ? '✅ Registrado' : ''}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid #334155', fontWeight: 700 }}>
                    <td style={{ padding: '6px' }} colSpan={4}>TOTAL</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(totals.amount)}</td>
                    {form.benefitType === 'CESANTIAS' && <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(totals.interest)}</td>}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            )
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: '18px' }}>
        <div className="panel-header">
          <div>
            <h2>📒 Pagos registrados</h2>
            <span>{payments.length} registro(s)</span>
          </div>
        </div>
        <div className="panel-body">
          {payments.length === 0 ? (
            <div className="empty">Todavía no hay pagos de prestaciones registrados.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <tbody>
                {payments.map(function(p) {
                  return (
                    <tr key={p.id} style={{ borderTop: '1px solid #1d3047' }}>
                      <td style={{ padding: '6px' }}>{LABELS[p.benefitType]}</td>
                      <td style={{ padding: '6px' }}>{p.name}</td>
                      <td style={{ padding: '6px' }}>{p.periodStart} a {p.periodEnd}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(p.amount)}</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>
                        <button className="btn" onClick={function() { removePayment(p); }}>Anular</button>
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

function TerminationModal({ employee, company, onClose, onDone }) {
  const [form, setForm] = useState({
    terminationDate: new Date().toISOString().slice(0, 10),
    reason: 'RENUNCIA',
    contractEndDate: employee.contractEndDate || '',
    vacationDaysPending: ''
  });
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function body() {
    return JSON.stringify({
      terminationDate: form.terminationDate,
      reason: form.reason,
      contractEndDate: form.contractEndDate || undefined,
      vacationDaysPending: form.vacationDaysPending === '' ? undefined : Number(form.vacationDaysPending)
    });
  }

  async function run(path, method) {
    setError('');
    setLoading(true);
    try {
      return await api('/api/employees/' + encodeURIComponent(employee.id) + path, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body()
      });
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function doPreview() {
    const r = await run('/termination/preview', 'POST');
    if (r) setPreview(r.data);
  }

  async function confirmTermination() {
    if (!confirm('¿Retirar a ' + getEmployeeName(employee) + ' y guardar la liquidación? El empleado quedará inactivo.')) return;
    const r = await run('/termination', 'POST');
    if (r) onDone();
  }

  function set(field) {
    return function(e) {
      setForm({ ...form, [field]: e.target.value });
      setPreview(null);
    };
  }

  const ct = employee.contractType;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Liquidación definitiva">
        <div className="modal-header">
          <h3>🚪 Retiro y liquidación definitiva · {getEmployeeName(employee)}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" style={{ position: 'static', margin: '0 0 12px' }}>{error}</div>}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="term-date">Fecha de retiro (último día)</label>
              <input id="term-date" type="date" value={form.terminationDate} onChange={set('terminationDate')} />
            </div>

            <div className="form-group">
              <label htmlFor="term-reason">Motivo</label>
              <select id="term-reason" value={form.reason} onChange={set('reason')}>
                {Object.keys(TERMINATION_REASON_LABELS).map(function(k) {
                  return <option key={k} value={k}>{TERMINATION_REASON_LABELS[k]}</option>;
                })}
              </select>
            </div>

            {(ct === '1' || ct === '3') && (
              <div className="form-group">
                <label htmlFor="term-end">Fin pactado del contrato</label>
                <input id="term-end" type="date" value={form.contractEndDate} onChange={set('contractEndDate')} />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="term-vac">Días de vacaciones pendientes (vacío = saldo calculado)</label>
              <input id="term-vac" type="number" min="0" step="0.5" value={form.vacationDaysPending} onChange={set('vacationDaysPending')} />
            </div>
          </div>

          {preview && (
            <div className="printable-sheet" style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', color: '#8193aa', marginBottom: '8px' }}>
                {company ? company.name + ' · NIT ' + company.nit + (company.dv ? '-' + company.dv : '') : ''}
                {' · '}Ingreso {preview.input.hireDate} · Retiro {preview.input.terminationDate}
                {' · '}{preview.result.serviceDays} días de servicio · {TERMINATION_REASON_LABELS[preview.input.reason]}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                    <th style={{ padding: '6px' }}>Concepto</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Base</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Días</th>
                    <th style={{ padding: '6px', textAlign: 'right' }}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.result.lines.map(function(l) {
                    return (
                      <tr key={l.concept} style={{ borderTop: '1px solid #1d3047' }}>
                        <td style={{ padding: '6px' }}>{l.concept}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(l.base)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatNumber2(l.days)}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(l.amount)}</td>
                      </tr>
                    );
                  })}
                  {preview.result.retencionIndemnizacion > 0 && (
                    <tr style={{ borderTop: '1px solid #1d3047' }}>
                      <td style={{ padding: '6px' }} colSpan={3}>Retención en la fuente sobre indemnización (20 %)</td>
                      <td style={{ padding: '6px', textAlign: 'right' }}>− {formatCOP(preview.result.retencionIndemnizacion)}</td>
                    </tr>
                  )}
                  <tr style={{ borderTop: '2px solid #334155', fontWeight: 700 }}>
                    <td style={{ padding: '6px' }} colSpan={3}>TOTAL A PAGAR</td>
                    <td style={{ padding: '6px', textAlign: 'right' }}>{formatCOP(preview.result.total)}</td>
                  </tr>
                </tbody>
              </table>
              <ul style={{ fontSize: '11px', color: '#8193aa' }}>
                {preview.result.notes.map(function(n) { return <li key={n}>{n}</li>; })}
              </ul>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={doPreview} disabled={loading}>🧮 Calcular liquidación</button>
          {preview && (
            <>
              <button className="btn" onClick={function() { window.print(); }}>🖨️ Imprimir</button>
              <button className="btn btn-danger" onClick={confirmTermination} disabled={loading}>Retirar y guardar</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
