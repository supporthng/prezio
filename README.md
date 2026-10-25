# Prezio

Verificadores de precios para negocios, como suscripción. Cada negocio carga sus precios (Excel, Google o SQL Server)
y pone verificadores en sus sucursales, que funcionan aun sin internet.

- **Next.js** (App Router) en **Vercel**: el panel y el verificador en línea.
- **Supabase**: base de datos para todos los negocios, separados por reglas de acceso (RLS), e inicio de sesión.
- **GitHub**: el código; Vercel publica cada cambio.

## Etapa 1 (este código)

- Crear cuenta, entrar, recuperar la clave.
- Crear un negocio (queda como dueño, con 30 días de prueba y su sucursal **Principal**).
- Panel del negocio: renombrar la Principal, agregar sucursales, ver el equipo.
- Invitar personas con un enlace: administrador, encargado de una sucursal o verificador; quitar miembros.
- Base de datos con datos separados por negocio: `supabase/migrations/0001_base.sql`.

## Etapa 2

- **Inventarios** (`/n/<negocio>/inventarios`): cargar Excel (.xlsx) o CSV, leído en el navegador con un lector
  propio (`lib/hoja.ts`, sin librerías); actualizar, reemplazar o crear un inventario; renombrar; no se borra
  uno que use una sucursal.
- **Fuente de precios por sucursal** (Resumen): cada sucursal elige un inventario o «Igual que la Principal».
- **Apariencia** (`/n/<negocio>/apariencia`): los 5 estilos del sistema actual, color, logo, QR, textos y
  segundos del precio, con vista previa horizontal y vertical (`components/Pantalla.tsx`, `app/pantalla.css`).
- **Verificador en línea** (`/v/<negocio>/<sucursal>`): pantalla completa; el lector escribe en un cuadro
  invisible siempre activo; `consultar_precio` busca todas las formas del código (`lib/codigos.ts`) y registra
  la consulta.
- Requiere ejecutar **`supabase/migrations/0002_precios_y_apariencia.sql`** en Supabase › SQL Editor.

## Etapa 3 · parte 1: equipos sin internet

- **Equipo** (`/equipo`): la tableta, el teléfono o la PC del verificador abre esa dirección y muestra un código
  de 8 cifras. En **Prezio › Equipos** se escribe el código y se elige la sucursal. El equipo guarda los precios
  de su sucursal en el propio equipo y sigue consultando sin internet; al volver la conexión sube las consultas.
- Revisa precios nuevos cada 5 minutos (o con «Buscar precios nuevos» en su menú ⓘ) y solo descarga si cambiaron.
- Desde el panel se ve si cada equipo está conectado, al día y con consultas por subir; se renombra, se cambia
  de sucursal o se desvincula. El encargado maneja solo los de su sucursal.
- El equipo no inicia sesión: tiene su propia clave al azar y en la base solo queda su huella (SHA-256).
- Se puede instalar como app (pantalla completa) desde el navegador: `public/manifest.webmanifest` y `public/sw.js`.
- Requiere ejecutar **`supabase/migrations/0003_equipos.sql`**.

## Puesta en marcha

### 1. Supabase (proyecto nuevo, solo para Prezio)

1. En [supabase.com](https://supabase.com) crea un proyecto **nuevo** (no uses el del sistema actual).
2. **SQL Editor** › ejecuta, en orden, `supabase/migrations/0001_base.sql`, `0002_precios_y_apariencia.sql` y `0003_equipos.sql`.
3. **Authentication › URL Configuration**:
   - *Site URL*: la dirección de Vercel (por ejemplo `https://prezio.vercel.app`).
   - *Redirect URLs*: agrega `https://prezio.vercel.app/**` (y `http://localhost:3000/**` si trabajas en tu PC).
4. **Project Settings › API**: copia la *Project URL* y la clave **pública** (*publishable* o *anon*).
   La clave secreta (*service_role* / *secret*) **no** se usa aquí ni se comparte.

### 2. Vercel

1. En [vercel.com](https://vercel.com) › **Add New › Project** › importa el repositorio `prezio` de GitHub.
2. En **Environment Variables** agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = la Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la clave pública (`sb_publishable_…`)
   - `NEXT_PUBLIC_SITE_URL` = la dirección final de Vercel (sin `/` al final)
3. **Deploy**. Cada cambio que se suba a GitHub se publica solo.

### 3. Probar

1. Abre la dirección de Vercel › **Probar gratis 30 días** › crea tu cuenta y confírmala desde el correo.
2. Crea tu negocio; renombra la Principal y agrega una sucursal.
3. Invita a otro correo tuyo como encargado; abre el enlace en otra ventana privada, crea la cuenta con ese
   correo y acepta: debe ver el negocio solo como encargado de su sucursal.

## Seguridad

- El navegador y el servidor usan solo la clave **pública**; lo que cada usuario puede ver lo deciden las reglas
  de la base de datos (RLS), no la app.
- El plan y la suscripción no los puede cambiar un cliente (solo Prezio con la clave de servidor).
- `supabase/tests/aislamiento.py` (49 pruebas), `precios.py` (17) y `equipos.py` (50) prueban en PostgreSQL que los negocios no se ven
  entre sí, los permisos por rol, la consulta de precios por sucursal, los permisos del logo/QR y los equipos (vincular, mover, quitar, subir consultas).

## Trabajar en tu PC (opcional)

```bash
npm install
cp .env.example .env.local   # y completa los valores
npm run dev                   # http://localhost:3000
npm run typecheck
```
