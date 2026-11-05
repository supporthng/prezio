const { chromium, db, comoAna } = require("./comun");
const crypto = require('crypto');
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? '✅ ' : '❌ ') + m); };
  const errores = [];
  const pri = db(`select s.id from sucursales s join negocios n on n.id = s.negocio_id where n.nombre = 'Tienda Precios' and s.es_principal`);
  const A = db(`select id from negocios where nombre = 'Tienda Precios'`);
  async function equipo(ctx, nombre) {
    const p = await ctx.newPage(); p.on('pageerror', e => errores.push(e.message));
    await p.goto('http://localhost:8787/equipo');
    await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector('.equipo-codigo')?.textContent || ''));
    const codigo = (await p.textContent('.equipo-codigo')).replace(/\s/g, '');
    comoAna(`select public.vincular_equipo('${codigo}', '${pri}', '${nombre}')`);
    await p.waitForSelector('.pz', { timeout: 9000 });
    return p;
  }
  // ---- Windows: la app queda lista TARDE y SIN avisar (el caso que fallaba)
  const ctxW = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxW.addInitScript(() => {
    setTimeout(() => { window.pywebview = { api: { version: async () => '1.0.4', salir: async () => { window.__salio = (window.__salio || 0) + 1; }, buscarActualizacion: async () => {} } }; }, 2500);
  });
  const w = await equipo(ctxW, 'PC caja');
  await w.waitForTimeout(3500);
  await w.click('.verificador-esquina [aria-label="Información del equipo"]'); await w.waitForTimeout(300);
  const menuW = await w.textContent('.equipo-menu'); console.log('MENUW', menuW, errores);
  t(/Prezcio para Windows 1\.0\.4/.test(menuW), 'Windows lista tarde y sin aviso: igual se detecta la app');
  t(/Sin clave de salida/.test(menuW) && await w.$('text=Salir de la app'), 'sin clave puesta: avisa y deja salir (nadie queda atrapado)');
  await w.click('text=Salir de la app'); await w.waitForTimeout(200);
  t(await w.evaluate(() => window.__salio) === 1, '«Salir de la app» cierra la app');
  // ---- la X: cerrar sin pasar por la configuración
  t(await w.isVisible('.verificador-esquina [aria-label="Cerrar la app"]'), 'dentro de la app hay una X para cerrar');
  await w.click('.verificador-esquina [aria-label="Cerrar la app"]'); await w.waitForTimeout(300);
  t(/¿Cerrar la app\?/.test(await w.textContent('.equipo-menu')) && !(await w.$('text=Precios guardados')), 'sin clave: la X solo pide confirmar (no abre la configuración)');
  await w.screenshot({ path: 'cerrar-sin-clave.png' });
  await w.click('.equipo-menu >> text=Cancelar'); await w.waitForTimeout(200);
  t(await w.evaluate(() => window.__salio) === 1, 'Cancelar no cierra');
  await w.click('.verificador-esquina [aria-label="Cerrar la app"]'); await w.waitForTimeout(300); await w.click('.equipo-menu button:has-text("Cerrar la app")'); await w.waitForTimeout(200);
  t(await w.evaluate(() => window.__salio) === 2, '«Cerrar Prezcio» cierra la app');
  // ---- el dueño pone la clave «4321»
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('4321', Buffer.from(sal, 'hex'), 150000, 32, 'sha256').toString('hex');
  comoAna(`select public.guardar_salida('${A}', '${JSON.stringify({ sal, iter: 150000, hash })}')`);
  // ---- Android con clave
  const ctxA = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctxA.addInitScript(() => {
    window.PrezioApp = { plataforma: () => 'android', version: () => '1.0.9', salir: () => { window.__salio = (window.__salio || 0) + 1; },
      buscarActualizacion: () => { setTimeout(() => window.__prezioActualizacion && window.__prezioActualizacion('al_dia'), 50); } };
  });
  const a = await equipo(ctxA, 'Tableta');
  await a.waitForTimeout(600);
  await a.click('.verificador-esquina [aria-label="Información del equipo"]'); await a.waitForTimeout(300);
  t(await a.$('.equipo-candado') && !(await a.$('text=Precios guardados')), 'con clave: el menú pide la clave ANTES de mostrar la configuración');
  await a.screenshot({ path: 'candado.png' });
  await a.fill('#clave-salida', '1111'); await a.click('.equipo-candado button[type=submit]'); await a.waitForTimeout(800);
  t(/Clave incorrecta/.test(await a.textContent('.equipo-menu')) && !(await a.$('text=Precios guardados')), 'clave equivocada: no entra');
  await ctxA.setOffline(true);
  await a.fill('#clave-salida', '4321'); await a.click('.equipo-candado button[type=submit]'); await a.waitForTimeout(800);
  t(/Precios guardados/.test(await a.textContent('.equipo-menu')) && /Prezcio para Android 1\.0\.9/.test(await a.textContent('.equipo-menu')), 'clave correcta SIN internet: entra a la configuración');
  t(!/Sin clave de salida/.test(await a.textContent('.equipo-menu')), 'con clave no aparece el aviso');
  await a.click('text=Actualizar la app'); await a.waitForTimeout(300);
  t(/última versión/.test(await a.textContent('.equipo-aviso-app')), 'Actualizar la app responde');
  await a.click('text=Salir de la app'); await a.waitForTimeout(200);
  t(await a.evaluate(() => window.__salio) === 1, 'Salir de la app (ya con la clave) cierra la app');
  // la X con clave: pide la clave y cierra directo, sin mostrar la configuración
  await a.click('.verificador-esquina [aria-label="Cerrar la app"]'); await a.waitForTimeout(300);
  t(/Cerrar la app/.test(await a.textContent('.equipo-candado h2')) && !(await a.$('text=Precios guardados')), 'con clave: la X pide la clave para cerrar');
  await a.screenshot({ path: 'cerrar-con-clave.png' });
  await a.fill('#clave-salida', '1111'); await a.click('.equipo-candado button[type=submit]'); await a.waitForTimeout(800);
  t(/Clave incorrecta/.test(await a.textContent('.equipo-menu')) && await a.evaluate(() => window.__salio) === 1, 'clave equivocada: no cierra');
  await a.fill('#clave-salida', '4321'); await a.click('.equipo-candado button[type=submit]'); await a.waitForTimeout(800);
  t(await a.evaluate(() => window.__salio) === 2 && !(await a.$('text=Precios guardados')), 'clave correcta: cierra directo, sin pasar por la configuración');
  await ctxA.setOffline(false);
  await a.click('.verificador-esquina [aria-label="Información del equipo"]'); await a.waitForTimeout(300);
  t(await a.$('.equipo-candado'), 'al volver a abrir, pide la clave otra vez');
  await a.click('text=Cancelar'); await a.waitForTimeout(200);
  await a.keyboard.type('7501055363063'); await a.keyboard.press('Enter'); await a.waitForTimeout(300);
  t(await a.$('.pz-etiqueta'), 'tras cancelar, el lector sigue funcionando');
  // ---- navegador normal: sin cambios
  const n = await (await b.newContext()).newPage();
  await n.goto('http://localhost:8787/equipo'); await n.waitForSelector('.equipo-opciones');
  t(!(await n.$('text=Salir de la app')) && !(await n.$('.verificador-esquina [aria-label="Cerrar la app"]')), 'en el navegador normal no hay botones de la app (ni la X)');
  t(errores.length === 0, 'sin errores ' + errores.join(' | '));
  console.log(`${ok} bien, ${mal} mal`); await b.close();
})();
