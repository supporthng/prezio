const { chromium, db, comoAna } = require("./comun");
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? '✅ ' : '❌ ') + m); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage(); const errores = []; p.on('pageerror', e => errores.push(e.message));
  await p.goto('http://localhost:8787/equipo');
  await p.waitForSelector('.equipo-codigo'); await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector('.equipo-codigo').textContent));
  const codigo = (await p.textContent('.equipo-codigo')).replace(/\s/g, '');
  t(/^\d{8}$/.test(codigo), 'pantalla de vínculo con código ' + codigo);
  await p.screenshot({ path: 'vincular.png' });
  const pri = db(`select s.id from sucursales s join negocios n on n.id = s.negocio_id where n.nombre = 'Tienda Precios' and s.es_principal`);
  comoAna(`select public.vincular_equipo('${codigo}', '${pri}', 'Caja prueba')`);
  await p.waitForSelector('.pz', { timeout: 9000 });
  t(true, 'tras vincular en el panel, el equipo pasa solo a la pantalla de precios');
  await p.waitForTimeout(1500);   // guardián listo y archivos guardados
  await p.keyboard.type('7501055363063'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  t(/125/.test(await p.textContent('.pz-etiqueta')) && /Refresco/.test(await p.textContent('.pz-nombre')), 'consulta en el equipo: Refresco 2L 125.50');
  await p.screenshot({ path: 'precio.png' });
  await p.keyboard.type('04252614'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  t(/Galletas/.test(await p.textContent('.pz-nombre')), 'código UPC-E encuentra el producto guardado como UPC-A');
  // sin internet
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('.pz', { timeout: 8000 }).catch(() => {});
  t(await p.$('.pz') !== null, 'sin internet: la página abre desde lo guardado');
  await p.waitForTimeout(500);
  await p.keyboard.type('7501055363063'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  t(/125/.test(await p.textContent('.pz-etiqueta').catch(() => '')), 'sin internet: sigue dando precios');
  await p.keyboard.type('000111222'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  t(/No encontramos/.test(await p.textContent('.pz')), 'sin internet: «no encontrado» para un código que no está');
  await p.click('.verificador-esquina [aria-label="Información del equipo"]'); await p.waitForTimeout(300);
  const menu = await p.textContent('.equipo-menu');
  t(/Sin conexión/.test(menu) && /Consultas por subir\s*[1-9]/.test(menu), 'el menú dice sin internet y cuántas consultas faltan por subir');
  await p.screenshot({ path: 'menu.png' });
  await p.click('text=Cerrar');
  const antes = Number(db(`select count(*) from consultas where canal = 'equipo'`));
  await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(2500);
  const despues = Number(db(`select count(*) from consultas where canal = 'equipo'`));
  t(despues - antes >= 4, `al volver el internet sube las consultas (${antes} → ${despues})`);
  // cambia el precio en el panel → el equipo lo toma al revisar
  const inv = db(`select (fuente->>'inventario_id') from sucursales where id = '${pri}'`);
  comoAna(`update productos set precio = 199 where inventario_id = '${inv}' and codigo = '7501055363063'; update inventarios set actualizado = now() where id = '${inv}'`);
  await p.click('.verificador-esquina [aria-label="Información del equipo"]'); await p.click('text=Buscar precios nuevos'); await p.waitForTimeout(1500); await p.click('text=Cerrar'); await p.waitForTimeout(100);
  await p.screenshot({ path: 'tras-menu.png' });
  await p.keyboard.type('7501055363063'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  t(/199/.test(await p.textContent('.pz-etiqueta')), 'precio cambiado en Prezcio: el equipo lo descarga (199)');
  t(db(`select app || '|' || productos || '|' || pendientes from equipos where nombre = 'Caja prueba'`).startsWith('web 1.0|2|'), 'el panel ve versión de la app y precios guardados');
  // desvincular en el panel
  comoAna(`select public.quitar_equipo(id) from equipos where nombre = 'Caja prueba'`);
  await p.click('.verificador-esquina [aria-label="Información del equipo"]'); await p.click('text=Buscar precios nuevos'); await p.waitForTimeout(1500);
  t(await p.$('.equipo-codigo') !== null, 'desvinculado en el panel: vuelve a pedir código');
  // tamaño celular vertical
  const p2 = await ctx.newPage({}); await p2.setViewportSize({ width: 390, height: 800 }); await p2.goto('http://localhost:8787/equipo'); await p2.waitForTimeout(1200);
  await p2.screenshot({ path: 'vincular-celular.png' });
  t(await p2.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'pantalla de vínculo cabe en celular');
  t(errores.length === 0, 'sin errores ' + errores.join(' | '));
  console.log(`${ok} bien, ${mal} mal`); await b.close();
})();
