// ------------------------------------------------------------
// USUARIOS — quién puede entrar a la plataforma por empresa
// ------------------------------------------------------------

function UsersSection({ me, company, employees, onError, onSuccess }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', role: 'TENANT_ADMIN', employeeId: '' });

  const companyId = company ? company.id : '';

  async function load() {
    if (!companyId) {
      setUsers([]);
      return;
    }

    try {
      const result = await api('/api/users?companyId=' + encodeURIComponent(companyId));
      setUsers(result.data || []);
    } catch (err) {
      onError(err.message);
    }
  }

  useEffect(function() {
    load();
  }, [companyId]);

  async function invite(e) {
    e.preventDefault();
    onError('');
    onSuccess('');

    try {
      setLoading(true);
      await api('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          role: form.role,
          companyId: companyId,
          employeeId: form.role === 'EMPLOYEE' ? form.employeeId : undefined
        })
      });
      onSuccess('Acceso creado. La persona entra con su cuenta de Google de ese correo.');
      setForm({ email: '', role: form.role, employeeId: '' });
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function revoke(u) {
    if (!confirm('¿Quitar el acceso de ' + u.email + '?')) return;

    onError('');
    onSuccess('');

    try {
      await api('/api/users/' + encodeURIComponent(u.id), { method: 'DELETE' });
      onSuccess('Acceso retirado.');
      await load();
    } catch (err) {
      onError(err.message);
    }
  }

  function employeeLabel(id) {
    const emp = employees.find(function(e) { return e.id === id; });
    return emp ? getEmployeeName(emp) : '';
  }

  if (!company) {
    return (
      <main style={{ padding: '24px' }}>
        <div className="info-box">Selecciona o crea una empresa para gestionar sus usuarios.</div>
      </main>
    );
  }

  return (
    <main style={{ padding: '24px', maxWidth: '900px' }}>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>👤 Usuarios de {company.name}</h2>
            <span>{users.length} con acceso</span>
          </div>
        </div>

        <div className="panel-body">
          <form onSubmit={invite} className="form-grid">
            <div className="form-group">
              <label htmlFor="user-email">Correo (cuenta de Google)</label>
              <input
                id="user-email"
                type="email"
                required
                value={form.email}
                onChange={function(e) { setForm({ ...form, email: e.target.value }); }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="user-role">Rol</label>
              <select
                id="user-role"
                value={form.role}
                onChange={function(e) { setForm({ ...form, role: e.target.value }); }}
              >
                <option value="TENANT_ADMIN">{ROLE_LABELS.TENANT_ADMIN}</option>
                <option value="EMPLOYEE">{ROLE_LABELS.EMPLOYEE} (portal del empleado)</option>
              </select>
            </div>

            {form.role === 'EMPLOYEE' && (
              <div className="form-group full">
                <label htmlFor="user-employee">Empleado</label>
                <select
                  id="user-employee"
                  required
                  value={form.employeeId}
                  onChange={function(e) { setForm({ ...form, employeeId: e.target.value }); }}
                >
                  <option value="">Selecciona…</option>
                  {employees.map(function(emp) {
                    return (
                      <option key={emp.id} value={emp.id}>
                        {getEmployeeName(emp)} · {emp.taxId}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div className="form-group full">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Guardando…' : '+ Dar acceso'}
              </button>
            </div>
          </form>

          {users.length === 0 ? (
            <div className="empty">Nadie tiene acceso a esta empresa todavía.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginTop: '18px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8193aa' }}>
                  <th style={{ padding: '8px 6px' }}>Correo</th>
                  <th style={{ padding: '8px 6px' }}>Rol</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {users.map(function(u) {
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid #1d3047' }}>
                      <td style={{ padding: '8px 6px' }}>{u.email}</td>
                      <td style={{ padding: '8px 6px' }}>
                        {ROLE_LABELS[u.role] || u.role}
                        {u.employeeId && <div style={{ color: '#8193aa', fontSize: '11px' }}>{employeeLabel(u.employeeId)}</div>}
                      </td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                        {u.id !== me.id && (
                          <button className="btn btn-danger" onClick={function() { revoke(u); }}>
                            Quitar acceso
                          </button>
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
