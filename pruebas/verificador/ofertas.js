const { chromium, db, comoAna } = require("./comun");
// Ofertas en la pantalla: carrusel en espera y precio de oferta al escanear (también sin internet).
(async () => {
  const b = await chromium.launch(); let ok = 0, mal = 0; const t = (c, m) => { c ? ok++ : mal++; console.log((c ? "✅ " : "❌ ") + m); };
  const A = db("select id from negocios where nombre = 'Tienda Precios'");
  const pri = db(`select id from sucursales where negocio_id = '${A}' and es_principal`);
  db(`delete from ofertas where negocio_id = '${A}'`);
  comoAna(`select public.guardar_oferta('${A}', '{"nombre":"Fin de semana refrescante","descripcion":"En los refrescos de 2 litros","tipo":"precio","productos":[{"codigo":"7501055363063","precio":"99"}]}')`);
  comoAna(`select public.guardar_oferta('${A}', '{"nombre":"Galletas 3×2","tipo":"lleva_paga","lleva":"3","paga":"2","productos":[{"codigo":"042100005264"}]}')`);
  const mañana = db("select (now() + interval '1 day')::text");
  comoAna(`select public.guardar_oferta('${A}', '{"nombre":"Empieza mañana","tipo":"aviso","desde":"${mañana}"}')`);

  for (const [ancho, alto, nombre] of [[1280, 800, "horizontal"], [800, 1280, "vertical"]]) {
    const ctx = await b.newContext({ viewport: { width: ancho, height: alto } });
    const p = await ctx.newPage();
    await p.goto("http://localhost:8787/equipo");
    if (nombre === "horizontal") {
      await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector(".equipo-codigo")?.textContent || ""));
      const cod = (await p.textContent(".equipo-codigo")).replace(/\s/g, "");
      comoAna(`select public.vincular_equipo('${cod}', '${pri}', 'Caja ofertas')`);
      await p.waitForSelector(".pz", { timeout: 15000 });
      await p.waitForSelector(".pz-ofertas", { timeout: 15000 }).catch(() => {});
      t(await p.$(".pz-ofertas") !== null, "en espera se ven las ofertas al lado del lector");
      const titulos = await p.$$eval(".pz-oferta h3", (h) => h.map((x) => x.textContent));
      t(titulos.length === 2 && !titulos.includes("Empieza mañana"), `solo las vigentes (${titulos.join(", ")})`);
      t((await p.textContent(".pz-oferta.on")).includes("99.00"), "con el precio de antes y el de oferta");
      await p.screenshot({ path: "ofertas-espera.png" });
      await p.waitForTimeout(7600);
      t((await p.textContent(".pz-oferta.on h3")) === "Galletas 3×2", "pasan solas a la siguiente");
      await p.keyboard.type("7501055363063"); await p.keyboard.press("Enter");
      await p.waitForSelector(".pz-resultado");
      const r = await p.textContent(".pz-resultado");
      t(r.includes("99") && r.includes("Antes") && r.includes("125.50") && r.includes("Ahorras"), "al escanear: precio de oferta, el de antes tachado y cuánto ahorra");
      await p.screenshot({ path: "ofertas-producto.png" });
      await p.waitForTimeout(400);
      // Sin internet sigue aplicando.
      await ctx.setOffline(true);
      await p.keyboard.type("042100005264"); await p.keyboard.press("Enter");
      await p.waitForTimeout(400);
      const g = await p.textContent(".pz-resultado");
      t(g.includes("Lleva 3, paga 2") && g.includes("Galletas") && !g.includes("Antes"), "sin internet también: «Lleva 3, paga 2» con su precio normal");
      await ctx.setOffline(false);
      // Ofertas apagadas en Apariencia: no se ven.
    } else {
      // Pantalla vertical: un equipo nuevo vinculado aquí; las ofertas van debajo del lector.
      await p.waitForFunction(() => /\d{4} \d{4}/.test(document.querySelector(".equipo-codigo")?.textContent || ""));
      const cod = (await p.textContent(".equipo-codigo")).replace(/\s/g, "");
      comoAna(`select public.vincular_equipo('${cod}', '${pri}', 'Caja vertical')`);
      await p.waitForSelector(".pz-ofertas", { timeout: 15000 });
      const [c, o] = await Promise.all([p.$eval(".pz-centro", (e) => e.getBoundingClientRect().bottom), p.$eval(".pz-ofertas", (e) => e.getBoundingClientRect().top)]);
      t(o >= c, "en pantalla vertical, las ofertas van debajo del lector");
      await p.screenshot({ path: "ofertas-vertical.png" });
      // Apagadas en Apariencia: no se ven.
      db(`update negocios set apariencia = apariencia || '{"mostrar_ofertas": false}'::jsonb where id = '${A}'`);
      await p.reload(); await p.waitForSelector(".pz-espera", { timeout: 15000 }); await p.waitForTimeout(1500);
      t(await p.$(".pz-ofertas") === null, "apagadas en Apariencia: no se muestran");
      db(`update negocios set apariencia = apariencia - 'mostrar_ofertas' where id = '${A}'`);
    }
    await ctx.close();
  }
  db(`delete from ofertas where negocio_id = '${A}'`);
  await b.close(); console.log(`\n${ok} bien, ${mal} mal`); process.exit(mal ? 1 : 0);
})();
