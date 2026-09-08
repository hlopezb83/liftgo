// Validación mínima y compartida de las entradas del changelog.
// La consume `scripts/gen-version.mjs` en el prebuild: una entrada malformada
// debe ROMPER el build, no generar silenciosamente `version: "unknown"`.

const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {unknown} entries
 * @returns {string[]} lista de errores; vacía si todo es válido.
 */
export function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return ["El changelog debe ser un array no vacío."];
  }

  const errors = [];
  const seen = new Set();

  entries.forEach((entry, i) => {
    const at = `entrada #${i}`;
    if (typeof entry !== "object" || entry === null) {
      errors.push(`${at}: debe ser un objeto.`);
      return;
    }
    if (typeof entry.version !== "string" || !SEMVER.test(entry.version)) {
      errors.push(`${at}: 'version' debe cumplir semver X.Y.Z (recibido: ${JSON.stringify(entry.version)}).`);
    } else if (seen.has(entry.version)) {
      errors.push(`${at}: versión duplicada ${entry.version}.`);
    } else {
      seen.add(entry.version);
    }
    if (typeof entry.date !== "string" || !ISO_DATE.test(entry.date)) {
      errors.push(`${at}: 'date' debe ser YYYY-MM-DD (recibido: ${JSON.stringify(entry.date)}).`);
    }
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      errors.push(`${at}: 'title' es obligatorio.`);
    }
  });

  // Orden descendente por versión (la entrada 0 es la más reciente).
  const nums = entries
    .filter((e) => e && typeof e.version === "string" && SEMVER.test(e.version))
    .map((e) => e.version.split(".").map(Number));
  for (let i = 1; i < nums.length; i++) {
    const [a, b] = [nums[i - 1], nums[i]];
    const cmp = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    if (cmp < 0) {
      errors.push(`Orden incorrecto: la posición ${i - 1} debe ser >= la posición ${i}.`);
      break;
    }
  }

  return errors;
}
