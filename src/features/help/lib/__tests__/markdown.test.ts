/**
 * @vitest-environment jsdom
 *
 * DOMPurify requiere jsdom (happy-dom no implementa completamente los APIs
 * de sanitización usados por dompurify v3).
 */
import { describe, it, expect } from "vitest";
import { renderMarkdown, renderSafeMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("convierte headings", () => {
    expect(renderMarkdown("## Título")).toContain("<h2");
    expect(renderMarkdown("### Sub")).toContain("<h3");
    expect(renderMarkdown("#### Sub2")).toContain("<h4");
  });

  it("convierte negritas e itálicas", () => {
    const out = renderMarkdown("**bold** *it*");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
  });

  it("convierte listas ordenadas y desordenadas", () => {
    expect(renderMarkdown("1. uno")).toMatch(/<ol[^>]*>[\s\S]*<li>uno<\/li>/);
    expect(renderMarkdown("- uno")).toMatch(/<ul[^>]*>[\s\S]*<li>uno<\/li>/);
  });

  it("convierte blockquote", () => {
    expect(renderMarkdown("> nota")).toContain("<blockquote");
  });
});

describe("renderSafeMarkdown", () => {
  it("sanitiza scripts maliciosos", () => {
    const out = renderSafeMarkdown("**hola** <script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("<strong>hola</strong>");
  });

  it("envuelve en contenedor prose", () => {
    const out = renderSafeMarkdown("Hola");
    expect(out).toContain('class="prose');
  });

  it("conserva enlaces seguros y elimina protocolos y atributos ejecutables", () => {
    const container = document.createElement("div");
    container.innerHTML = renderSafeMarkdown(
      '<a href="https://example.invalid/help" onclick="alert(1)">manual</a> ' +
      '<a href="javascript:alert(1)">unsafe</a><img src=x onerror="alert(1)">',
    );
    const [safe, unsafe] = container.querySelectorAll("a");
    expect(safe.getAttribute("href")).toBe("https://example.invalid/help");
    expect(safe.getAttribute("rel")).toBe("noopener noreferrer");
    expect(safe.getAttribute("target")).toBe("_blank");
    expect(safe.hasAttribute("onclick")).toBe(false);
    expect(unsafe.hasAttribute("href")).toBe(false);
    expect(container.querySelector("img")).toBeNull();
  });

  it("mantiene tablas del manual y excluye SVG, plantillas y formularios", () => {
    const container = document.createElement("div");
    container.innerHTML = renderSafeMarkdown(
      '| Equipo | Estado |\n| --- | --- |\n| A | Listo |\n\n' +
      '<svg><a href="javascript:alert(1)">x</a></svg><template><script>alert(1)</script></template>' +
      '<form><input name="token"></form>',
    );
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(2);
    expect(container.querySelector("svg, template, script, form, input")).toBeNull();
  });
});
