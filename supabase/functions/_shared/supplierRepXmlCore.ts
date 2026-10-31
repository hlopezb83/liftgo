/** Runtime-independent REP traversal. The adapters inject the pinned XML parser. */
interface XmlNode {
  nodeType: number;
  localName?: string | null;
  namespaceURI?: string | null;
  nodeValue?: string | null;
  childNodes: ArrayLike<XmlNode>;
  getAttribute?(name: string): string | null;
}

export const REP_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const REP_MAX_XML_DEPTH = 64;
export const REP_MAX_XML_NODES = 50_000;
const CFDI = new Set([
  "http://www.sat.gob.mx/cfd/3",
  "http://www.sat.gob.mx/cfd/4",
]);
const PAGOS = new Set([
  "http://www.sat.gob.mx/Pagos",
  "http://www.sat.gob.mx/Pagos20",
]);
const TIMBRE = "http://www.sat.gob.mx/TimbreFiscalDigital";

function children(node: XmlNode): XmlNode[] {
  return Array.from(node.childNodes).filter((child) => child.nodeType === 1);
}

function isXmlCharacter(code: number): boolean {
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 0x20 && code <= 0xd7ff) ||
    (code >= 0xe000 && code <= 0xfffd) ||
    (code >= 0x10000 && code <= 0x10ffff)
  );
}

/** No fiscal decisions here: only XML syntax, resource bounds and structural paths. */
export function createRepXmlParser(parseXml: (xml: string) => XmlNode) {
  function read(xml: string): XmlNode | null {
    // Conservative policy: REP never needs a DTD, including internal entities.
    // Reject before the parser can process declarations. Predefined/numeric entities remain valid.
    if (
      !xml ||
      xml.length > REP_MAX_FILE_BYTES ||
      new TextEncoder().encode(xml).byteLength > REP_MAX_FILE_BYTES ||
      /<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)
    ) {
      return null;
    }
    // Bound allocation before DOM construction (conservatively counts markup
    // inside comments/CDATA too). This is a resource guard, not an XML lexer.
    let markup = 0;
    for (const character of xml) {
      if (!isXmlCharacter(character.codePointAt(0)!)) return null;
      if (character === "<" && ++markup > REP_MAX_XML_NODES) return null;
    }
    // xmldom does not reject every XML 1.0 character-reference violation.
    for (const match of xml.matchAll(/&#(x[0-9a-f]+|[0-9]+);/gi)) {
      const value = match[1];
      const code = value[0].toLowerCase() === "x"
        ? Number.parseInt(value.slice(1), 16)
        : Number(value);
      if (!isXmlCharacter(code)) return null;
    }
    try {
      const document = parseXml(xml);
      const roots = children(document);
      if (roots.length !== 1) return null;
      // Non-whitespace text outside the sole root must never be silently accepted.
      for (const node of Array.from(document.childNodes)) {
        if (
          ![1, 3, 7, 8].includes(node.nodeType) ||
          (node.nodeType === 3 && node.nodeValue?.trim())
        ) {
          return null;
        }
      }
      const pending = [{ node: document, depth: 0 }];
      let count = 0;
      while (pending.length) {
        const current = pending.pop()!;
        if (++count > REP_MAX_XML_NODES || current.depth > REP_MAX_XML_DEPTH) {
          return null;
        }
        for (const node of Array.from(current.node.childNodes)) {
          pending.push({ node, depth: current.depth + 1 });
        }
      }
      return roots[0];
    } catch {
      // Fail closed on warnings as well as parser errors; never expose XML in logs.
      return null;
    }
  }

  function select(xml: string, tag: string): XmlNode[] {
    const root = read(xml);
    if (
      !root ||
      root.localName !== "Comprobante" ||
      !CFDI.has(root.namespaceURI ?? "")
    ) {
      return [];
    }
    if (tag === "Comprobante") return [root];
    const direct = children(root);
    if (tag === "Emisor") {
      return direct.filter(
        (n) => n.localName === tag && n.namespaceURI === root.namespaceURI,
      );
    }
    const complements = direct.filter(
      (n) =>
        n.localName === "Complemento" && n.namespaceURI === root.namespaceURI,
    );
    const extensions = complements.flatMap(children);
    if (tag === "TimbreFiscalDigital") {
      return extensions.filter(
        (n) => n.localName === tag && n.namespaceURI === TIMBRE,
      );
    }
    const payments = extensions
      .filter((n) => n.localName === "Pagos" && PAGOS.has(n.namespaceURI ?? ""))
      .flatMap((n) =>
        children(n).filter(
          (p) => p.localName === "Pago" && p.namespaceURI === n.namespaceURI,
        )
      );
    if (tag === "Pago") return payments;
    if (tag === "DoctoRelacionado") return payments.flatMap((p) => related(p));
    return [];
  }

  function related(payment: XmlNode): XmlNode[] {
    return children(payment).filter(
      (n) =>
        n.localName === "DoctoRelacionado" &&
        n.namespaceURI === payment.namespaceURI,
    );
  }

  return {
    isWellFormedXml: (xml: string): boolean => read(xml) !== null,
    extractAttr(xml: string, tag: string, attr: string): string | null {
      const nodes = select(xml, tag);
      // Singular fields must be unambiguous; do not choose an attacker's first duplicate.
      return nodes.length === 1
        ? (nodes[0].getAttribute?.(attr) ?? null)
        : null;
    },
    extractAllAttr(xml: string, tag: string, attr: string): string[] {
      return select(xml, tag).flatMap((n) => {
        const value = n.getAttribute?.(attr);
        return value == null ? [] : [value];
      });
    },
    extractPagoNodes(xml: string): Array<{ monto: number; doctos: string[] }> {
      return select(xml, "Pago").map((payment) => ({
        monto: Number(payment.getAttribute?.("Monto") ?? "0"),
        doctos: related(payment).flatMap((n) => {
          const id = n.getAttribute?.("IdDocumento");
          return id == null ? [] : [id];
        }),
      }));
    },
  };
}
