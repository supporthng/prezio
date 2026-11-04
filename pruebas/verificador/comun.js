// Lo que comparten las pruebas del verificador: el navegador y el PostgreSQL de pruebas.
// En GitHub Actions: PREZIO_PSQL="psql postgresql://…/prezio". En local, el PostgreSQL de pruebas (puerto 5499).
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");

const PSQL = process.env.PREZIO_PSQL || "su postgres -c 'psql -h /var/lib/postgresql -p 5499 -d prezio -At -q -v ON_ERROR_STOP=1'";
const orden = process.env.PREZIO_PSQL ? `${PSQL} -At -q -v ON_ERROR_STOP=1` : PSQL;

/** Ejecuta SQL como superusuario y devuelve el texto. */
const db = (q) => execFileSync("sh", ["-c", orden], { input: q, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
const ANA = "00000000-0000-0000-0000-00000000000a";
/** SQL como Ana (dueña de «Tienda Precios»), igual que lo haría el panel. */
const comoAna = (q) => db(`set role authenticated; select set_config('request.jwt.claim.sub', '${ANA}', false) \\g /dev/null\n${q}`);

module.exports = { chromium, db, comoAna, ANA, PSQL: orden };
