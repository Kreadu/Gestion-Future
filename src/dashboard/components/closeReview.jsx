// ------------------------------------------------------------
// Revisión antes de cerrar el periodo
//
//   <CloseReviewModal period={...} onClosed={fn} onClose={fn} />
// Cierra el periodo con POST .../close y llama a onClosed si funcionó;
// si falla, el error queda dentro del modal, junto a la revisión.
// Muestra lo que impide el cierre (bloqueos) y lo que conviene revisar
// (avisos), con los totales de control. Los datos vienen de
// GET /api/payroll-periods/:id/close-review.
// ------------------------------------------------------------

function CloseReviewModal({ period, onClosed, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);

  useEffect(function() {
    let cancelled = false;
    api('/api/payroll-periods/' + encodeURIComponent(period.id) + '/close-review')
      .then(function(r) { if (!cancelled) setData(r.data); })
      .catch(function(err) { if (!cancelled) setError(err.message); });
    return function() { cancelled = true; };
  }, [period.id]);

  async function confirm() {
    setClosing(true);
    setError('');
    try {
      await api('/api/payroll-periods/' + encodeURIComponent(period.id) + '/close', { method: 'POST' });
    } catch (err) {
      setError(err.message);
      setClosing(false);
      return;
    }
    onClosed();
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Revisión antes de cerrar" style={{ width: 'min(680px, 100%)' }}>
        <div className="modal-header">
          <h3>🔒 Revisión antes de cerrar · {period.periodStart} a {period.periodEnd}</h3>
          <button className="btn" aria-label="Cerrar" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="alert" style={{ position: 'static', margin: 0 }}>{error}</div>}
          {!data && !error && <div className="info-box">Revisando el periodo…</div>}

          {data && (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr><td>Liquidaciones</td><td style={{ textAlign: 'right' }}>{data.totals.settlements}</td></tr>
                  <tr><td>Total devengado</td><td style={{ textAlign: 'right' }}>{formatCOP(data.totals.grossEarnings)}</td></tr>
                  <tr><td>Total deducciones</td><td style={{ textAlign: 'right' }}>{formatCOP(data.totals.totalDeductions)}</td></tr>
                  <tr style={{ fontWeight: 700 }}><td>Neto a pagar</td><td style={{ textAlign: 'right' }}>{formatCOP(data.totals.netPay)}</td></tr>
                </tbody>
              </table>

              {data.blockers.length > 0 && (
                <div style={{ margin: '12px 0' }}>
                  <strong>⛔ No se puede cerrar todavía ({data.blockers.length})</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                    {data.blockers.map(function(b) { return <li key={b.code}>{b.message}</li>; })}
                  </ul>
                </div>
              )}

              {data.warnings.length > 0 && (
                <div style={{ margin: '12px 0' }}>
                  <strong>⚠️ Revisa antes de cerrar ({data.warnings.length})</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '20px', fontSize: '13px' }}>
                    {data.warnings.map(function(w, i) { return <li key={i}>{w.message}</li>; })}
                  </ul>
                </div>
              )}

              {data.canClose && data.warnings.length === 0 && (
                <div className="info-box" style={{ marginTop: '12px' }}>✅ Todo en orden: no hay pendientes.</div>
              )}

              {data.canClose && (
                <div style={{ fontSize: '12px', color: '#8193aa', marginTop: '12px' }}>
                  Al cerrar no podrás calcular más liquidaciones en este periodo.
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={confirm}
            disabled={!data || !data.canClose || closing}
          >
            {data && data.warnings.length > 0 ? 'Cerrar de todos modos' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}
