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

## Puesta en marcha

### 1. Supabase (proyecto nuevo, solo para Prezio)

1. En [supabase.com](https://supabase.com) crea un proyecto **nuevo** (no uses el del sistema actual).
2. **SQL Editor** › pega todo `supabase/migrations/0001_base.sql` › **Run**.
3. **Authentication › URL Configuration**:
   - *Site URL*: la dirección de Vercel (por ejemplo `https://prezio.vercel.app`).
   - *Redirect URLs*: agrega `https://prezio.vercel.app/auth/confirm` (y `http://localhost:3000/auth/confirm` si trabajas en tu PC).
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
- `supabase/tests/aislamiento.py` prueba en PostgreSQL que dos negocios no se ven entre sí (49 pruebas).

## Trabajar en tu PC (opcional)

```bash
npm install
cp .env.example .env.local   # y completa los valores
npm run dev                   # http://localhost:3000
npm run typecheck
```
