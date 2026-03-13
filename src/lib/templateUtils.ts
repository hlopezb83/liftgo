/**
 * Unified placeholder replacement utility.
 * Supports two syntaxes:
 * - "bracket": [KEY] → value
 * - "brace" (default): {KEY} → value
 */
export function replacePlaceholders(
  text: string,
  vars: Record<string, string>,
  syntax: "bracket" | "brace" = "brace"
): string {
  if (syntax === "bracket") {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.split(`[${key}]`).join(value || "—");
    }
    return result;
  }
  return text.replace(/\{(\w+)\}/g, (match, key) => vars[key] ?? match);
}
