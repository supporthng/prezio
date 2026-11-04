const { chromium, db, comoAna } = require("./comun");
const leerCodigo = async (p) => { await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector('.equipo-codigo')?.textContent || ''), null, { timeout: 15000 }); return (await p.textContent('.equipo-codigo')).replace(/\s/g, ''); };
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? '✅ ' : '❌ ') + m); };
  // 1. Reloj del equipo adelantado 1 hora: antes el código cambiaba cada segundo.
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.addInitScript(() => { const real = Date.now; const d = 3600e3; Date.now = () => real() + d; });
    await p.goto('http://localhost:8787/equipo');
    const c1 = await leerCodigo(p); await p.waitForTimeout(9000); const c2 = await leerCodigo(p);
    t(c1 === c2, `reloj adelantado 1 h: el código se queda fijo (${c1} → ${c2})`);
    await ctx.close();
  }
  // 2. Se reinicia la app mientras espera: vuelve a mostrar un código (antes quedaba «Pidiendo código…»).
  {
    const ctx = await b.newContext(); const p = await ctx.newPage();
    await p.goto('http://localhost:8787/equipo'); const c1 = await leerCodigo(p);
    await p.reload(); const c2 = await leerCodigo(p).catch(() => '');
    t(/^\d{8}$/.test(c2), `tras reiniciar sin vincular, muestra código (${c1} → ${c2})`);
    const pri = db(`select s.id from sucursales s join negocios n on n.id = s.negocio_id where n.nombre = 'Tienda Precios' and s.es_principal`);
    await p.waitForTimeout(5000); const c3 = await leerCodigo(p);
    t(c3 === c2, 'y ese código se queda fijo');
    comoAna(`select public.vincular_equipo('${c3}', '${pri}', 'Caja reinicio')`);
    await p.waitForSelector('.pz', { timeout: 9000 }).then(() => t(true, 'con ese código se vincula')).catch(() => t(false, 'con ese código se vincula'));
    await ctx.close();
  }
  // 3. App de Windows: la clave también queda en la app; si se borran los datos del navegador interno, sigue vinculado.
  {
    const nativo = { clave: '' };
    const ctx = await b.newContext();
    await ctx.exposeBinding('__guardarNativo', (_s, c) => { if (!nativo.clave) nativo.clave = c; return true; });
    await ctx.exposeBinding('__leerNativo', () => nativo.clave);
    await ctx.addInitScript(() => { window.pywebview = { api: {
      version: async () => '1.0.9', salir: async () => true, cerrar: async () => true, buscarActualizacion: async () => true,
      claveGuardada: async () => window.__leerNativo(), guardarClave: async (c) => window.__guardarNativo(c) } }; });
    let p = await ctx.newPage(); await p.goto('http://localhost:8787/equipo');
    const c = await leerCodigo(p); await p.waitForTimeout(1500);
    t(/^[0-9a-f]{64}$/.test(nativo.clave), 'la app de Windows guarda la clave del equipo');
    const pri = db(`select s.id from sucursales s join negocios n on n.id = s.negocio_id where n.nombre = 'Tienda Precios' and s.es_principal`);
    comoAna(`select public.vincular_equipo('${c}', '${pri}', 'Caja Windows')`);
    await p.waitForSelector('.pz', { timeout: 9000 });
    await p.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('prezio-equipo'); q.onsuccess = q.onerror = q.onblocked = r; }));
    const bases = await p.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    await p.close(); await new Promise((r) => setTimeout(r, 300));
    // borrar TODAS las bases (por si el nombre es otro)
    p = await ctx.newPage(); await p.goto('http://localhost:8787/equipo');
    await p.evaluate(async () => { for (const d of await indexedDB.databases()) await new Promise((r) => { const q = indexedDB.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = r; }); });
    await p.reload();
    const listo = await p.waitForSelector('.pz', { timeout: 15000 }).then(() => true).catch(() => false);
    t(listo, `datos del navegador borrados (${bases.join(',')}): sigue vinculado, sin pedir código nuevo`);
    t(db(`select count(*) from equipos where nombre = 'Caja Windows'`) === '1', 'sigue siendo el mismo equipo en el panel');
    await ctx.close();
  }
  await b.close(); console.log(`\n${ok} bien, ${mal} mal`); process.exit(mal ? 1 : 0);
})();
