/**
 * Mock minimal de @react-pdf/renderer para tests de smoke + snapshot.
 *
 * Renderiza a árbol React plano (sin layout Yoga ni binario PDF) para verificar
 * que los Document components no lanzan y producen estructura esperada cuando
 * reciben fixtures válidas. Es un guardián barato contra:
 *   - referencias rotas tras refactor (imports, tipos)
 *   - cambios de propiedades requeridas
 *   - regresiones estructurales obvias (snapshot)
 *
 * Para verificación visual real de los PDFs seguimos dependiendo de QA manual.
 */
import { vi } from "vitest";
import React from "react";

function makeTag(tag: string) {
  return function PdfTag(props: { children?: React.ReactNode; [k: string]: unknown }) {
    return React.createElement("pdf-" + tag, props, props.children);
  };
}

vi.mock("@react-pdf/renderer", () => ({
  Document: makeTag("document"),
  Page: makeTag("page"),
  View: makeTag("view"),
  Text: makeTag("text"),
  Image: makeTag("image"),
  Link: makeTag("link"),
  StyleSheet: { create: <T,>(s: T) => s },
  Font: { register: () => {}, registerHyphenationCallback: () => {} },
  pdf: () => ({ toBuffer: async () => Buffer.from("%PDF-MOCK") }),
}));
