// Servidor de prueba (solo para pruebas/verificador): sirve la página del equipo y responde /rest/v1/rpc/* ejecutando la función en PostgreSQL como «anon».
const http = require("http"), fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { PSQL } = require("./comun");
const RAIZ = path.resolve(__dirname, "../..");
const SALIDA = process.env.PREZIO_SALIDA || path.join(__dirname, "salida");
const lit = (v) => v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : typeof v === "boolean" ? String(v)
  : Array.isArray(v) && v.length && v.every((x) => typeof x === "string") ? "array[" + v.map((x) => "'" + x.replace(/'/g, "''") + "'").join(",") + "]::text[]"
  : typeof v === "object" ? "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb" : "'" + String(v).replace(/'/g, "''") + "'";
const archivos = {
  "/equipo": [path.join(__dirname, "index.html"), "text/html"], "/_next/static/app.js": [path.join(SALIDA, "app.js"), "text/javascript"],
  "/_next/static/globals.css": [path.join(RAIZ, "app/globals.css"), "text/css"], "/_next/static/pantalla.css": [path.join(RAIZ, "app/pantalla.css"), "text/css"],
  "/sw.js": [path.join(RAIZ, "public/sw.js"), "text/javascript"], "/manifest.webmanifest": [path.join(RAIZ, "public/manifest.webmanifest"), "application/manifest+json"] };
const USUARIOS = { "ana@a.com": "00000000-0000-0000-0000-00000000000a", "carla@a.com": "00000000-0000-0000-0000-00000000000c", "dani@a.com": "00000000-0000-0000-0000-00000000000d", "eva@x.com": "00000000-0000-0000-0000-00000000000e", "veri@a.com": "00000000-0000-0000-0000-00000000000f" };
const correoDe = (id) => Object.keys(USUARIOS).find((k) => USUARIOS[k] === id) || (() => { try { return psql(`select email from auth.users where id = '${id}'`); } catch { return ""; } })();
const psql = (q) => execFileSync("sh", ["-c", PSQL], { input: q, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
const rol = (req) => {
  const m = (req.headers.authorization || "").match(/^Bearer tok-([0-9a-f-]{36})$/);
  return m ? `set role authenticated; select set_config('request.jwt.claim.sub', '${m[1]}', false), set_config('request.jwt.claims', '${JSON.stringify({ sub: m[1], email: correoDe(m[1]) })}', false) \\g /dev/null\n` : "set role anon;\n";
};
const error = (res, e) => { const err = (e.stderr || "").toString().split("\n").find((l) => l.includes("ERROR:")) || String(e); res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: err.replace(/^.*ERROR:\s*/, "") })); };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (url.pathname === "/auth/v1/token" && req.method === "POST") {
    let c = ""; req.on("data", (d) => c += d); req.on("end", () => {
      const b = JSON.parse(c);
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const rid = String(b.refresh_token || "").replace(/^r-/, "");
        if (!/^[0-9a-f-]{36}$/.test(rid)) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error_description: "Invalid Refresh Token" })); }
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ access_token: "tok-" + rid, expires_in: 3600, refresh_token: "r-" + rid, user: { id: rid } }));
      }
      let id = USUARIOS[b.email];
      if (!id) { try { id = psql(`select id from auth.users where email = '${String(b.email).replace(/'/g, "''")}'`) || undefined; } catch { id = undefined; } }
      if (!id || b.password !== "clave1234") { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" })); }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ access_token: "tok-" + id, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "r-" + id,
        user: { id, aud: "authenticated", role: "authenticated", email: b.email, app_metadata: {}, user_metadata: (() => { try { return JSON.parse(psql(`select coalesce(raw_user_meta_data, '{}') from auth.users where id = '${id}'`) || "{}"); } catch { return {}; } })(), created_at: new Date().toISOString() } }));
    }); return;
  }
  if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
  if (url.pathname === "/api/publico") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ supabase_url: "http://localhost:8787", clave_publica: "anon" })); }
  if (url.pathname === "/api/sesion-app" && req.method === "POST") {
    const ok = /^Bearer tok-[0-9a-f-]{36}$/.test(req.headers.authorization || "");
    res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" }); return res.end(JSON.stringify(ok ? { token_hash: "hash-de-un-uso" } : { error: "La sesión venció" }));
  }
  if (url.pathname === "/api/conector" && req.method === "POST") {
    let c = ""; req.on("data", (d) => c += d); req.on("end", () => {
      const d = JSON.parse(c || "{}");
      const q = d.accion === "estado"
        ? `set role anon; select public.conector_estado(${lit(d.clave)}, ${lit(d.version)}, ${lit(d.equipo)}, ${lit(d.error)});`
        : `set role anon; select json_build_object('productos', public.conector_subir(${lit(d.clave)}, ${lit(d.inventario)}, ${lit(d.lote)}, ${d.productos ? lit(d.productos) : "null"}, ${d.fin === true}, ${lit(d.error)}));`;
      try { const out = psql(q); res.writeHead(200, { "Content-Type": "application/json" }); res.end(out); }
      catch (e) { const err = (e.stderr || "").toString(); res.writeHead(/conector_no_valido/.test(err) ? 401 : 400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.split("\n").find((l) => l.includes("ERROR:"))?.replace(/^.*ERROR:\s*/, "") || "error" })); }
    }); return;
  }
  const escribir = url.pathname.match(/^\/rest\/v1\/(inventarios|sucursales)$/);
  if (escribir && (req.method === "POST" || req.method === "PATCH")) {
    let c = ""; req.on("data", (d) => c += d); req.on("end", () => {
      const b = JSON.parse(c || "{}");
      const donde = [];
      for (const [k, v] of url.searchParams) if (v.startsWith("eq.")) donde.push(`${k.replace(/[^a-z_]/g, "")}::text = '${v.slice(3).replace(/'/g, "''")}'`);
      const q = req.method === "POST"
        ? `insert into public.${escribir[1]} (${Object.keys(b).map((k) => k.replace(/[^a-z_]/g, "")).join(",")}) values (${Object.values(b).map(lit).join(",")}) returning *`
        : `update public.${escribir[1]} set ${Object.entries(b).map(([k, v]) => `${k.replace(/[^a-z_]/g, "")} = ${lit(v)}`).join(", ")}${donde.length ? " where " + donde.join(" and ") : ""} returning *`;
      try { const out = psql(rol(req) + `with x as (${q}) select coalesce(json_agg(x), '[]') from x;`); res.writeHead(201, { "Content-Type": "application/json" }); res.end(out); }
      catch (e) { error(res, e); }
    }); return;
  }
  if (url.pathname === "/auth/confirm") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end("<h1>Panel del negocio</h1>"); }
  const tabla = url.pathname.match(/^\/rest\/v1\/(miembros|negocios|sucursales|inventarios)$/);
  if (tabla && req.method === "GET") {
    let sel = url.searchParams.get("select") || "*", junta = "";
    const emb = sel.match(/negocios\(([a-z_,]+)\)/);
    if (emb) { sel = sel.replace(emb[0], "").replace(/,,/g, ",").replace(/,$/, ""); junta = `, (select row_to_json(x) from (select ${emb[1]} from public.negocios n where n.id = negocio_id) x) as negocios`; }
    const cols = sel.split(",").filter(Boolean).map((x) => x.trim().replace(/[^a-z_*]/g, "")).join(", ") + junta;
    const donde = [];
    for (const [k, v] of url.searchParams) {
      if (k === "select" || k === "order") continue;
      const col = k.replace(/[^a-z_]/g, "");
      if (v.startsWith("eq.")) donde.push(`${col}::text = '${v.slice(3).replace(/'/g, "''")}'`);
      else if (v.startsWith("in.(")) donde.push(`${col}::text in (${v.slice(4, -1).split(",").map((x) => `'${x.replace(/"/g, "").replace(/'/g, "''")}'`).join(",")})`);
    }
    const orden = (url.searchParams.get("order") || "").split(",").filter(Boolean).map((o) => { const [c, d] = o.split("."); return `${c.replace(/[^a-z_]/g, "")} ${d === "desc" ? "desc" : "asc"}`; }).join(", ");
    try {
      const out = psql(rol(req) + `select coalesce(json_agg(t), '[]') from (select ${cols} from public.${tabla[1]}${donde.length ? " where " + donde.join(" and ") : ""}${orden ? " order by " + orden : ""}) t;`);
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(out);
    } catch (e) { error(res, e); }
    return;
  }
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (m && req.method === "POST") {
    let cuerpo = ""; req.on("data", (d) => cuerpo += d); req.on("end", () => {
      const args = JSON.parse(cuerpo || "{}");
      const q = rol(req) + `select public.${m[1]}(${Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`).join(", ")});`;
      try {
        const out = psql(q);
        res.writeHead(200, { "Content-Type": "application/json" }); res.end(/^[\[{"]/.test(out) || /^-?\d+(\.\d+)?$/.test(out) || out === "true" || out === "false" ? out : (out === "" ? "null" : JSON.stringify(out)));
      } catch (e) {
        const err = (e.stderr || "").toString().split("\n").find((l) => l.includes("ERROR:")) || "error";
        res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ message: err.replace(/^.*ERROR:\s*/, "") }));
      }
    }); return;
  }
  const a = archivos[url.pathname];
  if (!a) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "Content-Type": a[1], "Cache-Control": "no-cache" }); res.end(fs.readFileSync(a[0]));
}).listen(8787, () => console.log("en 8787"));
