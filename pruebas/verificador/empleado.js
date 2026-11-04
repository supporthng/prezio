const { chromium, db, comoAna } = require("./comun");
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? '✅ ' : '❌ ') + m); };
  const errores = [];
  const A = db(`select id from negocios where nombre = 'Tienda Precios'`), slug = db(`select slug from negocios where id = '${A}'`);
  const cen = db(`select id from sucursales where negocio_id = '${A}' and codigo = 'centro'`);
  // El dueño crea «caja1» (como lo hace el panel: cuenta interna + agregar_usuario) con «Equipos» solo en Centro,
  // y «reportes1» sin la casilla Equipos.
  const crear = (u, permisos, sucursales) => {
    const id = db(`insert into auth.users (id, email) values (gen_random_uuid(), public.correo_de_usuario('${A}', '${u}')) returning id`);
    comoAna(`select public.agregar_usuario('${A}', '${id}', '${u}', '${u}', array[${permisos.map((x) => `'${x}'`).join(',')}]::text[], ${sucursales})`);
    return id;
  };
  crear('caja1', ['equipos'], `array['${cen}']::uuid[]`);
  crear('reportes1', ['reportes'], 'null');
  const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); p.on('pageerror', (e) => errores.push(e.message));
  await p.goto('http://localhost:8787/equipo'); await p.waitForSelector('.equipo-opciones');
  await p.click('text=Elegir sucursal');
  await p.fill('#a-correo', 'reportes1');
  t(await p.$('#a-negocio-codigo'), 'al escribir un usuario (sin @) pide el código del negocio');
  await p.fill('#a-negocio-codigo', slug); await p.fill('#a-clave', 'clave1234'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(800);
  t(/casilla «Equipos»/.test(await p.textContent('.equipo-autorizar')), 'usuario sin la casilla Equipos: no autoriza');
  await p.fill('#a-correo', 'caja1'); await p.fill('#a-clave', 'mala'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(800);
  t(/incorrectos/i.test(await p.textContent('.equipo-autorizar')), 'clave equivocada: no entra');
  await p.fill('#a-negocio-codigo', 'no-existe'); await p.fill('#a-clave', 'clave1234'); await p.click('button:has-text("Entrar")'); await p.waitForTimeout(800);
  t(/incorrectos/i.test(await p.textContent('.equipo-autorizar')), 'negocio que no existe: mismo mensaje (no revela nada)');
  await p.fill('#a-negocio-codigo', slug); await p.fill('#a-clave', 'clave1234'); await p.click('button:has-text("Entrar")');
  await p.waitForSelector('#a-sucursal', { timeout: 5000 });
  const ops = await p.$$eval('#a-sucursal option', (o) => o.map((x) => x.textContent));
  t(ops.length === 1 && ops[0] === 'Centro', 'caja1 solo puede poner el equipo en su sucursal: ' + ops.join(', '));
  await p.fill('#a-nombre', 'Entrada Centro'); await p.click('text=Vincular este equipo');
  await p.waitForSelector('.pz', { timeout: 8000 });
  t(/Centro/.test(await p.textContent('.pz')), 'empleado sin correo vincula el equipo en Centro');
  t(db(`select u.email like 'caja1@n%.prezio.invalid' from equipos e join auth.users u on u.id = e.creado_por where e.nombre = 'Entrada Centro'`) === 't', 'queda anotado que lo vinculó caja1');
  t(await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length) === 0, 'la sesión del empleado no se queda en el equipo');
  t(await p.evaluate(() => localStorage.getItem('prezio_negocio')) === slug, 'el equipo recuerda el código del negocio para la próxima vez');
  t(errores.length === 0, 'sin errores ' + errores.join(' | '));
  console.log(`${ok} bien, ${mal} mal`); await b.close();
})();
