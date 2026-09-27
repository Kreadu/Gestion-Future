# Gestion-Future

Sistema de gestión de nómina y administración de RRHH multi-tenant, desarrollado sobre **Cloudflare Workers** (API + D1) y **Firebase Authentication** (login).

Una empresa de outsourcing usa esta plataforma para prestar el servicio de nómina a varias pymes clientes, cada una aislada de las demás.

## Requisitos

- Node.js 24, npm.
- Una cuenta de Cloudflare con Workers y D1 habilitados.
- Un proyecto de Firebase con el proveedor **Google** habilitado en Authentication.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Firebase Authentication

En la consola de Firebase (Authentication → Sign-in method) habilita el proveedor **Google**, y en Authentication → Settings → Authorized domains añade:

- El dominio del Worker en producción (`gestion-future-api.<tu-subdominio>.workers.dev`).
- `localhost` (para `wrangler dev`).

Copia `projectId`, `apiKey` y `authDomain` de la configuración web del proyecto y complétalos en `wrangler.toml` (`[vars]`). No son secretos: son la configuración pública que el navegador necesita para iniciar sesión.

### 3. Migraciones de la base de datos (D1)

El esquema vive versionado en `migrations/`. Para un entorno local nuevo:

```bash
npx wrangler d1 migrations apply gestion_future_db --local
```

Para la base remota (producción), antes de la primera vez confirma que las columnas `logo` (companies) y `hireDate` (employees) ya existen ahí (la app en producción ya las usa):

```bash
npx wrangler d1 execute gestion_future_db --remote --command "PRAGMA table_info(companies);"
npx wrangler d1 execute gestion_future_db --remote --command "PRAGMA table_info(employees);"
```

Si faltara alguna, añádela con `ALTER TABLE ... ADD COLUMN ...` antes de continuar. Luego aplica las migraciones:

```bash
npx wrangler d1 migrations apply gestion_future_db --remote
```

### 4. Dar de alta el primer SUPER_ADMIN

No hay UI para esto (es intencional: sólo Kreadu, la outsourcing, tiene este rol). Con tu correo real:

```bash
npx wrangler d1 execute gestion_future_db --remote --command \
  "INSERT INTO users (id, email, role, active, createdAt) VALUES \
   ('USR-admin', 'tu-correo@dominio.com', 'SUPER_ADMIN', 1, datetime('now'));"
```

Desde el dashboard, ese SUPER_ADMIN puede crear empresas y usuarios `TENANT_ADMIN` para cada cliente (`POST /api/users`, o una futura pantalla de administración).

### 5. Secretos de la DIAN (opcional, para nómina electrónica)

```bash
npx wrangler secret put DIAN_SOFTWARE_ID
npx wrangler secret put DIAN_SOFTWARE_PIN
```

Sin configurarlos, el Worker usa valores de prueba válidos sólo para el ambiente de habilitación de la DIAN.

## Desarrollo local

```bash
npm run dev        # wrangler dev
npm run typecheck  # tsc --noEmit
npm test           # jest
python3 tests/test_colombia_payroll_and_dian.py
```

## Despliegue

El workflow de GitHub Actions (`.github/workflows/test.yml`) corre typecheck y pruebas en cada push/PR, y en `main` aplica migraciones remotas y despliega con Wrangler. Requiere los secretos de repositorio `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

## Modelo de acceso

- **SUPER_ADMIN**: personal de Kreadu (la outsourcing). Acceso a todas las empresas; único rol que puede crear/eliminar empresas.
- **TENANT_ADMIN**: administrador de una pyme cliente. Sólo ve y gestiona su propia empresa (empleados, nómina, usuarios de esa empresa).
- **EMPLOYEE**: reservado para el portal del empleado (pendiente de implementar).

Cada usuario se autentica con su cuenta de Google vía Firebase Auth; el rol y la empresa asociada viven en la tabla `users` de D1 (no en custom claims de Firebase), y todo el acceso a datos de una empresa se valida en el Worker contra ese registro.
