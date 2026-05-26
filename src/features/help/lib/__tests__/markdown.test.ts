import { describe, it, expect } from "vitest";
import { renderMarkdown, renderSafeMarkdown } from "@/features/help/lib/markdown";

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
    expect(renderMarkdown("1. uno")).toContain("list-decimal");
    expect(renderMarkdown("- uno")).toContain("list-disc");
  });

  it("convierte blockquote", () => {
    expect(renderMarkdown("> nota")).toContain("border-l-4");
  });
});

describe("renderSafeMarkdown", () => {
  it("sanitiza scripts maliciosos", () => {
    const out = renderSafeMarkdown("**hola** <script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("<strong>hola</strong>");
  });
});
