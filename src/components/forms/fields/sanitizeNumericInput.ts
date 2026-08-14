/**
 * Normaliza la entrada del usuario: solo dígitos, un punto decimal, hasta 2 decimales.
 *
 * Regla es-MX (`,` = separador de miles, `.` = separador decimal). Una coma NO
 * puede tratarse siempre como decimal: el display en reposo es "1,234.50" y al
 * copiar/pegarlo una versión ingenua lo corrompería a "1.23" (~1000× menos).
 * Pre-proceso de comas, antes de la regla de punto único:
 * 1. Si hay AMBOS `,` y `.` → se eliminan TODAS las `,` (son miles).
 * 2. Si solo hay `,`:
 *    - más de una `,` → se eliminan todas (miles);
 *    - exactamente una `,` → si va seguida de EXACTAMENTE 3 dígitos hasta el
 *      final se elimina (miles: "1,234" → "1234"); en otro caso se reemplaza
 *      por `.` (decimal: "0,5" → "0.5", "12,34" → "12.34").
 */
export function sanitizeNumericInput(raw: string): string {
  let input = raw;
  if (input.includes(",") && input.includes(".")) {
    input = input.replace(/,/g, "");
  } else if (input.includes(",")) {
    const commas = input.split(",").length - 1;
    if (commas > 1) {
      input = input.replace(/,/g, "");
    } else {
      const tail = input.slice(input.indexOf(",") + 1);
      input = /^\d{3}$/.test(tail) ? input.replace(",", "") : input.replace(",", ".");
    }
  }
  let out = "";
  let dotSeen = false;
  let decimals = 0;
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") {
      if (dotSeen) {
        if (decimals >= 2) continue;
        decimals += 1;
      }
      out += ch;
    } else if (ch === "." && !dotSeen) {
      dotSeen = true;
      out += ".";
    }
  }
  return out;
}
