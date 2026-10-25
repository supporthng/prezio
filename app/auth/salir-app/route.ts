import { supabaseServidor } from "@/lib/supabase/server";

/** La app Prezio Administrador al salir: cierra la sesión del panel en su ventana y vuelve a su pantalla de entrar. */
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await supabaseServidor();
  await supabase.auth.signOut();
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Saliendo…</title>
<style>body{font-family:"Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#102a43;background:#f3f5f7}</style></head>
<body><p>Saliendo… <a href="/entrar">Entrar otra vez</a></p>
<script>(function v(n){var a=window.pywebview&&window.pywebview.api;if(a&&a.mostrar_inicio){a.mostrar_inicio();}else if(n<40){setTimeout(function(){v(n+1)},150);}})(0);</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
