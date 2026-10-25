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
- **Vincular en el propio equipo**: en `/equipo`, «Elegir sucursal» pide entrar con el dueño, un administrador o el
  encargado (el encargado solo ve su sucursal); se elige negocio, sucursal y nombre. La sesión solo autoriza: no
  se guarda en el equipo. Requiere **`supabase/migrations/0005_vincular_en_el_equipo.sql`**.
- Requiere ejecutar **`supabase/migrations/0003_equipos.sql`**.

## Etapa 3 · parte 2: inventarios que se llenan solos

En **Inventarios**, además de cargar Excel, un inventario puede llenarse solo:

- **Desde Google**: una hoja de Google, una hoja «publicada en la web» o un Excel/CSV guardado en Drive,
  compartido como «Cualquier persona con el enlace · Lector». Se revisa la hoja, se eligen las columnas (se
  recuerdan por su nombre, así que mover columnas no rompe nada) y cada cuánto se actualiza (15 min a 1 día).
  También hay **Actualizar ahora**. Si la hoja falla o llega vacía, se anota el error y se quedan los precios
  anteriores.
  - Lo hace una tarea de Supabase cada 15 minutos (`pg_cron` + `pg_net`) que llama a `/api/tareas/google`
    con una clave interna que solo conoce la base. **Vercel no necesita ninguna clave secreta.**
- **Conector de SQL Server** (`conector/prezio_conector.py`, compilado como `PrezioConector.exe` por
  `.github/workflows/conector.yml`): en el panel se crea el conector y se copia su clave (se ve una sola vez);
  en la PC del sistema se abre el programa, se pega la clave, se elige servidor, base, tabla y columnas.
  Envía solo cuando cambian los precios, en partes, y el panel muestra si está conectado y su último error.
  Habla solo con `/api/conector` de Prezio; si se pierde la PC, se quita el conector y su clave deja de servir.
- Los equipos sin internet reciben los precios nuevos en su próxima revisión, como con Excel.
- Requiere ejecutar **`supabase/migrations/0004_fuentes_automaticas.sql`**. Si al final dice que no pudo
  programar la tarea, activa `pg_cron` y `pg_net` en Supabase › Database › Extensions y ejecútalo otra vez.

## Puesta en marcha

### 1. Supabase (proyecto nuevo, solo para Prezio)

1. En [supabase.com](https://supabase.com) crea un proyecto **nuevo** (no uses el del sistema actual).
2. **SQL Editor** › ejecuta, en orden, `supabase/migrations/0001_base.sql`, `0002_precios_y_apariencia.sql`, `0003_equipos.sql`, `0004_fuentes_automaticas.sql`, `0005_vincular_en_el_equipo.sql`, `0006_clave_de_salida.sql` y `0007_seguridad_reporte_mantenimiento.sql`.
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
- `supabase/tests/aislamiento.py` (49 pruebas), `precios.py` (17), `equipos.py` (59) y `fuentes.py` (45) prueban en PostgreSQL que los negocios no se ven
  entre sí, los permisos por rol, la consulta de precios por sucursal, los permisos del logo/QR y los equipos (vincular, mover, quitar, subir consultas) y las fuentes automáticas (Google, conector, cargas por partes).

## Trabajar en tu PC (opcional)

```bash
npm install
cp .env.example .env.local   # y completa los valores
npm run dev                   # http://localhost:3000
npm run typecheck
```

## Etapa 3 · parte 3: apps Prezio para Android y Windows

- **`apps/android`** (Java, sin librerías) y **`apps/windows`** (Python + WebView2, instalador Inno Setup):
  abren `/equipo` a pantalla completa, arrancan al encender, no dejan salir sin la **clave de salida** del negocio
  (Prezio › Equipos; se comprueba sin internet, en la base solo queda su huella PBKDF2) y se **actualizan solas**:
  al abrir y cada 6 horas leen `/apps.json` y solo instalan archivos publicados en las Releases de este repositorio.
- **`.github/workflows/app-android.yml`** y **`app-windows.yml`** compilan, publican en Releases («android»,
  «windows») y anotan la versión en `public/apps.json` (Vercel la publica sola). Versión: `1.0.<n.º de compilación>`.
- Android necesita la llave de firma en GitHub › Settings › Secrets and variables › Actions:
  `ANDROID_KEYSTORE_B64` y `ANDROID_KEYSTORE_PASSWORD`. La misma llave siempre; nunca se sube al repositorio.
- Bloqueo total en Android (opcional): `adb shell dpm set-device-owner com.prezio.verificador/.AdminReceiver`.
- Requiere ejecutar **`supabase/migrations/0006_clave_de_salida.sql`**.
- Las descargas de Releases solo funcionan sin iniciar sesión si el repositorio es **público**.

## Antes de la prueba piloto (mejoras ya incluidas)

- **Pruebas automáticas** (`.github/workflows/pruebas.yml`): en cada cambio, GitHub prueba la base en un PostgreSQL
  limpio (las migraciones dos veces y las 200 pruebas) y compila la web como Vercel. Si algo falla, aparece en rojo en
  Actions antes de que lo vean los clientes.
- **Seguridad**: máximo 10 códigos de equipo equivocados por usuario cada 15 minutos; cabeceras que impiden meter
  Prezio dentro de otra página (`next.config.ts`).
- **Reporte de consultas** (Resumen): consultas de 7, 30 o 90 días, por día y sucursal, lo más consultado y los
  **códigos buscados que no tenían precio**. El encargado ve solo su sucursal.
- **Respaldo**: cada inventario se descarga en CSV (Excel lo abre; se restaura cargándolo con «Reemplazar») y el
  dueño o admin descarga el respaldo completo del negocio en JSON (Inventarios › «descargar todo el negocio»).
- **Limpieza diaria** (pg_cron): consultas de más de 13 meses, cargas a medias y códigos vencidos.
- Requiere ejecutar **`supabase/migrations/0007_seguridad_reporte_mantenimiento.sql`**.

## Antes de vender (pasos que se hacen a mano)

1. **Correo propio (imprescindible)**: el correo que trae Supabase solo envía a los miembros de tu equipo de
   Supabase y 2 mensajes por hora; un cliente nuevo no recibiría la confirmación ni la recuperación de clave.
   Supabase › Authentication › Emails › **SMTP Settings** › con un servicio como Brevo o Resend.
2. **Confirmar correo**: Supabase › Authentication › Sign In / Providers › Email › activar «Confirm email».
3. **Repositorio público o descargas en otro lugar**: las apps y el conector se descargan de GitHub Releases.
4. **Dominio propio** (por ejemplo prezio.do) en Vercel › Settings › Domains; luego actualizar
   `NEXT_PUBLIC_SITE_URL`, la Site URL de Supabase, `ajustes_privados.sitio` y la variable `PREZIO_SITIO` de GitHub.
5. **Plan de Supabase**: el gratuito pausa el proyecto tras 7 días sin uso y no guarda copias diarias; para clientes
  reales conviene el plan Pro (copias diarias automáticas).

## Etapa 4 · parte 1: importar del sistema anterior

- **`/n/<negocio>/importar`** (Inventarios › «Importar su respaldo», o desde el Resumen si no hay inventarios): se elige
  el ZIP de *Administración › Respaldo* del sistema anterior; se lee en el navegador (`lib/importar.ts`, `lib/zip.ts`),
  muestra lo que va a hacer y, al confirmar, crea o actualiza inventarios con sus productos, la Principal (nombre,
  inventario y ubicación), las sucursales (inventario propio, ubicación, activa) y la apariencia con logo y QR.
- Conversiones: Google con cuenta → inventario «desde Google» con el mismo archivo y columnas (hay que compartir la
  hoja con el enlace); SQL Server → aviso para instalar el conector de Prezio; «precios propios» de la versión vieja →
  inventario con los precios de la Principal más los de la sucursal.
- Se puede repetir sin duplicar (empareja por nombre de inventario y código de sucursal). No trae usuarios ni equipos.
- No requiere migración: usa los permisos de dueño o admin.

## Usuarios sin correo y permisos por casillas

- **Pestaña Usuarios**: el dueño (o quien tenga la casilla «Usuarios») crea empleados con **usuario y clave**, sin
  correo. Entran en *Entrar › Con usuario* con el **código del negocio** (el de la dirección, ej. `abarrotao-market`),
  su usuario y su clave. Si olvidan la clave, se cambia en Usuarios (no hay recuperación por correo).
- **Casillas**: Reportes, Inventarios (incluye Google y conector), Sucursales, Equipos (incluye clave de salida),
  Apariencia y Usuarios; y **en qué sucursales** (todas o algunas). El dueño tiene todo siempre. Quien gestiona
  usuarios solo da casillas y sucursales que él tiene, y nunca la casilla «Usuarios».
- Las personas que ya existían conservan su acceso (admin → todas; encargado → reportes, sucursales y equipos de su
  sucursal). Las invitaciones por correo siguen funcionando.
- Por dentro cada empleado es una cuenta de Supabase con un correo interno inexistente
  (`usuario@n<negocio>.prezio.invalid`): nunca recibe correos y no puede crear negocios.
- **Requiere**: ejecutar `supabase/migrations/0008_usuarios_y_permisos.sql` y poner en Vercel › Settings ›
  Environment Variables la variable **`SUPABASE_SECRET_KEY`** (tipo *Secret*, sin `NEXT_PUBLIC_`) con la clave
  secreta de Supabase (Project Settings › API Keys › *Secret key*, `sb_secret_…`). Solo la usa el servidor para crear
  cuentas y cambiar claves, siempre después de que la base confirmó el permiso de quien lo pide.

## Consulta desde el celular (enlace y QR por sucursal)

- **Pestaña Sucursales** (arriba, junto a Inventarios): nombre, de dónde toma los precios, ubicación y, por
  cada sucursal, su **enlace y QR** para los clientes: copiar, descargar PNG/SVG, imprimir un cartel o
  mostrarlo en la pantalla de los verificadores.
- **Activar**: Sucursales › Consulta desde el celular › Activar (casilla «Apariencia»). Apagada, el enlace
  dice que no está disponible.
- **El cliente** abre `/c/<negocio>/<sucursal>`, toca «Escanear con la cámara» y ve el precio. Sin cuenta ni
  app. El lector confirma el código tres veces y valida el dígito de control antes de buscar.
- **Ubicación**: si la sucursal tiene la ubicación activa, la base de datos exige que el celular esté dentro
  de la distancia (no se puede consultar desde la casa). La ubicación de la tienda nunca se envía al celular.
- **Reporte**: cada consulta queda con canal «movil». Límite de 300 consultas por minuto por sucursal.
- **Requiere**: ejecutar `supabase/migrations/0009_consulta_movil.sql` (después de 0008).

## Plataforma: tú das de alta los negocios

- **Registro cerrado**: nadie crea negocios por su cuenta. La página `/registro` solo sirve para aceptar una
  invitación de un negocio.
- **`/plataforma`** (solo administradores de plataforma) te permite:
  - dar de alta un negocio con nombre, código (ej. `abarrotao-market`), moneda y plan;
  - darle acceso al dueño de una de dos formas:
    - **usuario y clave**, que le entregas tú;
    - **invitación por correo**: el dueño recibe un enlace y elige su clave.
  - ver dueños, usuarios, sucursales, verificadores conectados hoy, productos y la última consulta;
  - cambiar el plan, **suspender** o reactivar un negocio, y agregar otro dueño.
- **Suspendido**:
  - el panel queda de solo lectura y muestra un aviso;
  - los verificadores muestran «Servicio suspendido»;
  - la consulta desde el celular se apaga y el conector deja de recibir precios.
  - Al reactivarlo todo vuelve solo, sin vincular los equipos de nuevo.
- **Requiere**:
  1. Ejecutar `supabase/migrations/0010_plataforma.sql`.
  2. Una vez, en el SQL Editor: `select public.agregar_admin_plataforma('tu-correo');`
  3. Tener `SUPABASE_SECRET_KEY` en Vercel.
  4. En Supabase › Authentication › URL Configuration › Redirect URLs, agregar `https://prezio-jade.vercel.app/**`.
     El enlace de la invitación vuelve a `/auth/sesion`.
  5. Para invitar por correo, configurar el correo propio (SMTP).

## Licencias (PREZIO-XXXX-XXXX-XXXX)

- **Cada negocio tiene una licencia única**, por ejemplo `PREZIO-K7QM-2XRP-H9TD`. Es el código con el que sus usuarios
  entran (Entrar › Con usuario, la app Prezio Administrador y «Vincular aquí» en los verificadores).
  - Se escribe en mayúsculas o minúsculas; el código viejo de la dirección (`abarrotao-market`) también sirve.
  - No usa caracteres que se confunden (0/O, 1/I/L).
  - Se ve en el Resumen del negocio, con un botón para copiarla.
- **Prueba de 30 días** desde el alta. Siete días antes de vencer, el panel avisa.
- **Al vencer**, el negocio queda bloqueado hasta que se pague: el panel queda de solo lectura con el aviso para
  pagar, los verificadores muestran «Servicio no disponible», y la consulta del celular y el conector se detienen.
- **En la Plataforma** puedes:
  - *Registrar pago*: plan Básico o Profesional por 1, 3, 6 o 12 meses, con una nota. Se suma desde hoy, o desde
    la fecha pagada si todavía no vence, y queda el historial de pagos;
  - dar días de prueba;
  - suspender o quitar la suspensión.
- **Requiere** ejecutar `supabase/migrations/0011_licencias.sql` (después de 0010). Los negocios que ya existían
  reciben su licencia y, si estaban en prueba, 30 días desde ese momento.

## Niveles de acceso

- **Plantillas de permisos** por negocio. Todos nacen con: Administrador, Gerente de sucursal, Encargado de precios,
  Técnico de equipos, Supervisor y Cajero. Cada negocio puede crear los suyos y cambiarlos o borrarlos en
  Usuarios › Niveles de acceso.
- Al crear o cambiar a una persona se elige su **nivel**: las casillas salen solas y, si el nivel es «por
  sucursal», se eligen las sucursales. «Personalizado» deja marcar las casillas a mano.
- **Cambiar un nivel cambia a todas las personas que lo tienen.** Al borrarlo, esas personas conservan sus
  casillas y quedan como «Personalizado».
- Quien no es dueño solo usa y crea niveles con las casillas que él mismo puede dar. Nunca puede dar «Usuarios».
- **Requiere** ejecutar `supabase/migrations/0012_niveles.sql` (después de 0011).

## Actualizaciones automáticas (todos los programas instalados)

Cada programa lee `public/apps.json` (lo escribe GitHub Actions al publicar) y solo acepta descargas de
`github.com/supporthng/prezio/releases/download/`.

- **Verificador Android** y **Verificador Windows**: al abrir y cada 6 horas; se instalan solos, sin preguntar.
- **Prezio Administrador**:
  - al abrir revisa y, si hay versión nueva, muestra «Actualizando…», la instala (Windows pide permiso una vez)
    y la app se vuelve a abrir sola;
  - la copia automática (tarea «Prezio Conector», como SYSTEM) revisa al arrancar y cada 6 horas, y se
    actualiza en silencio;
  - el instalador vuelve a arrancar la tarea y, si la actualización vino de la ventana, vuelve a abrir la app.
- **PrezioConector.exe (consola)**: al abrir y cada 6 horas; se reemplaza a sí mismo y vuelve a arrancar con
  las mismas opciones. `conector.yml` lo publica como 2.0.N en `apps.json › conector`.
- **Verificador web** (`/equipo`): toma la versión nueva del sitio al recargar (la página siempre se pide a internet primero).

## Clave secreta de Supabase (crear usuarios)

- `SUPABASE_SECRET_KEY` acepta la clave nueva (`sb_secret_…`) o la anterior «service_role» (`eyJ…`).
- Si hay un problema, las páginas Usuarios y Plataforma dicen cuál es: falta, es la publicable o la anon, o se
  copió incompleta.
- Si Supabase la rechaza («This endpoint requires a valid Bearer token»), usa la «service_role»: Supabase ›
  Project Settings › API Keys › Legacy API keys. Después, en Vercel, Redeploy.

## Prezio Administrador (Windows) · la app de cada negocio

- **Activar (una vez por PC)**: la primera vez la app pide la licencia del negocio (PREZIO-XXXX-XXXX-XXXX) y queda
  amarrada a ese negocio. Ejecutar `supabase/migrations/0013_activar_app.sql`. «Usar otra licencia en esta PC»
  solo funciona con la sesión cerrada.
- **Entrar**: solo usuario + clave (o correo) de ese negocio. No hay «Cambiar de negocio»: cada app es de un cliente.
- **Una sola ventana**: las pestañas del panel (Resumen, Sucursales, Inventarios…) se abren en la misma ventana. Dentro
  del panel aparecen «Base de datos» y «Copia automática» para volver a la app, y «Salir» cierra las dos sesiones.
  Lo que toca la PC (bases de datos, claves, archivos) solo responde a la pantalla propia de la app, no a páginas
  de internet abiertas en la ventana. Son las mismas cuentas y casillas de
  permisos de la web. «Recordarme» guarda la sesión cifrada, solo para ese usuario de Windows.
- **Panel del negocio**: cada sección se abre en su propia ventana, sin volver a entrar. La app pide a
  `/api/sesion-app` un enlace de un solo uso y el panel abre su propia sesión, así la de la app no se cierra.
- **Base de datos**:
  1. «Buscar servidores en mi red»: prueba en la red local (las /24 privadas de la PC) los puertos de
     SQL Server 1433, MySQL/MariaDB 3306, PostgreSQL 5432 y Firebird 3050. Confirma el motor cuando el servidor se
     presenta y pregunta al SQL Server Browser (UDP 1434) por las instancias con nombre (SQLEXPRESS…) y su puerto.
     Si un servidor no aparece, se escribe a mano o se busca en otra red.
  2. **Autorizar** con las credenciales de la base:
     - SQL Server: usuario de SQL o usuario de Windows;
     - Firebird: además la ruta o alias del archivo `.fdb`.
  3. Elegir base, tabla y columnas. La app sugiere las columnas y muestra una vista previa.
  4. Elegir un inventario nuevo o uno que ya existe, y si se usa en la Principal.
  - La app crea el conector de la PC y el inventario. No hay claves que copiar.
  - Las credenciales de la base quedan cifradas en la PC (DPAPI) y nunca van a Prezio.
- **Copia automática**: cada N minutos envía solo lo que cambió. Con «Arrancar con Windows» envía aunque nadie
  abra la app (tarea «Prezio Conector», `PrezioAdministrador.exe --servicio`).
- **Código**:
  - `conector/motores.py`: los cuatro motores;
  - `conector/red.py`: la búsqueda en la red;
  - `conector/cifrado.py`: claves cifradas;
  - `conector/prezio_conector.py`: el envío. Sigue aceptando la configuración de la versión 1.
- **Compilación** (`.github/workflows/app-administrador.yml`):
  - incluye pyodbc, PyMySQL, pg8000, firebird-driver y el cliente de Firebird (`fbclient.dll` de Firebird 4.0.5);
  - lo publica en Releases › «administrador» como versión 2.0.N.
