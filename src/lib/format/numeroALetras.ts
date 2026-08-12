/**
 * Conversión de importes a letra en español mexicano, con el formato usado en
 * documentos legales y fiscales: "TRESCIENTOS CINCUENTA MIL PESOS 00/100 M.N."
 *
 * Usado por el pagaré (Anexo B del contrato), donde la práctica mercantil pide
 * cifra y letra; ante discrepancia entre ambas, prevalece la letra.
 */

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE",
];

const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];

const CENTENAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

/** Convierte 0–999 a letra. */
function centenasALetras(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) {
    if (resto <= 20) {
      partes.push(UNIDADES[resto]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d === 2) {
        partes.push(u === 0 ? "VEINTE" : `VEINTI${UNIDADES[u]}`);
      } else {
        partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
      }
    }
  }
  return partes.join(" ");
}

/** Convierte la parte entera (0–999,999,999,999) a letra. */
function enteroALetras(n: number): string {
  if (n === 0) return "CERO";

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  const partes: string[] = [];

  if (millones > 0) {
    partes.push(millones === 1 ? "UN MILLÓN" : `${enteroALetras(millones)} MILLONES`);
  }
  if (miles > 0) {
    // "UN MIL" (no "MIL" a secas) es la forma usada en documentos legales MX.
    partes.push(miles === 1 ? "UN MIL" : `${centenasALetras(miles)} MIL`);
  }
  if (resto > 0) {
    partes.push(centenasALetras(resto));
  }
  return partes.join(" ");
}

/**
 * Importe en letra con centavos en formato NN/100.
 * @param amount importe en pesos (se redondea a 2 decimales)
 * @param currencyLabel etiqueta de moneda, por defecto "PESOS ... M.N."
 */
export function numeroALetras(amount: number | null | undefined, currencyLabel = "PESOS", suffix = "M.N."): string {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? Math.abs(value) : 0;
  // Redondeo a centavos evitando la deriva binaria (0.145 → 15 centavos).
  const cents = Math.round((safe + Number.EPSILON) * 100);
  const entero = Math.floor(cents / 100);
  const centavos = cents % 100;

  const letras = enteroALetras(entero);
  const singular = entero === 1 && currencyLabel === "PESOS" ? "PESO" : currencyLabel;
  const negativo = Number.isFinite(value) && value < 0 ? "MENOS " : "";

  return `${negativo}${letras} ${singular} ${String(centavos).padStart(2, "0")}/100 ${suffix}`.trim();
}
