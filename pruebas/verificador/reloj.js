const { chromium, db, comoAna } = require("./comun");
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? '✅ ' : '❌ ') + m); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  // Reloj del equipo ATRASADO 2 horas.
  await ctx.addInitScript(() => { const real = Date.now; const RealDate = Date; const d = -2 * 3600e3;
    Date.now = () => real() + d;
    globalThis.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(real() + d); } static now() { return real() + d; } }; });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8787/equipo');
  await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector('.equipo-codigo')?.textContent || ''));
  const codigo = (await p.textContent('.equipo-codigo')).replace(/\s/g, '');
  const pri = db(`select s.id from sucursales s join negocios n on n.id = s.negocio_id where n.nombre = 'Tienda Precios' and s.es_principal`);
  comoAna(`select public.vincular_equipo('${codigo}', '${pri}', 'Caja reloj')`);
  await p.waitForSelector('.pz', { timeout: 9000 }); await p.waitForTimeout(800);
  // Consulta sin internet; se sube al volver.
  await ctx.setOffline(true);
  await p.keyboard.type('7501055363063'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  await p.waitForTimeout(4000);
  await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(2500);
  const seg = Number(db(`select round(extract(epoch from now() - c.creado)) from consultas c join equipos e on e.id = c.equipo_id where e.nombre = 'Caja reloj' order by c.creado desc limit 1`));
  t(seg >= 3 && seg < 60, `con el reloj 2 h atrasado, la consulta se anota con la hora real (hace ${seg} s, la hora de la consulta y no la de subida)`);
  await p.click('.verificador-esquina [aria-label="Información del equipo"]'); await p.waitForTimeout(300);
  const menu = await p.textContent('.equipo-menu');
  t(/Reloj del equipoAtrasado 2 h 00 min/.test(menu), 'el menú avisa que el reloj está atrasado 2 h');
  await p.screenshot({ path: 'reloj.png' });
  await ctx.close();
  // Reloj bien: no hay aviso.
  const ctx2 = await b.newContext(); const q = await ctx2.newPage();
  await q.goto('http://localhost:8787/equipo');
  await q.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector('.equipo-codigo')?.textContent || ''));
  const c2 = (await q.textContent('.equipo-codigo')).replace(/\s/g, '');
  comoAna(`select public.vincular_equipo('${c2}', '${pri}', 'Caja reloj bien')`);
  await q.waitForSelector('.pz', { timeout: 9000 }); await q.waitForTimeout(500);
  await q.click('.verificador-esquina [aria-label="Información del equipo"]'); await q.waitForTimeout(300);
  t(!/Reloj del equipo/.test(await q.textContent('.equipo-menu')), 'con el reloj bien no aparece el aviso');
  await b.close(); console.log(`\n${ok} bien, ${mal} mal`); process.exit(mal ? 1 : 0);
})();
