import { describe, it, expect } from "vitest";
import { renderSafeMarkdown } from "../markdown";

describe("renderSafeMarkdown", () => {
  it("strippea tags <script>", () => {
    const html = renderSafeMarkdown("Hola\n\n<script>alert('xss')</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
  });

  it("strippea tags <iframe>", () => {
    const html = renderSafeMarkdown("Antes\n\n<iframe src='https://evil.example'></iframe>\n\nDespués");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("evil.example");
  });

  it("strippea atributos on*", () => {
    const html = renderSafeMarkdown("<div onclick='steal()'>click</div>");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("steal(");
  });

  it("strippea <style> y <form>", () => {
    const html = renderSafeMarkdown("<style>body{display:none}</style><form action='/x'><input/></form>");
    expect(html).not.toContain("<style");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("preserva markdown legítimo (encabezados, énfasis, listas)", () => {
    const html = renderSafeMarkdown("## Título\n\n**bold** y *italic*\n\n- item 1\n- item 2");
    expect(html).toContain("<h2");
    expect(html).toContain("Título");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<li");
  });

  it("fuerza rel=noopener y target=_blank en enlaces", () => {
    const html = renderSafeMarkdown("[link](https://example.com)");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("bloquea href javascript:", () => {
    const html = renderSafeMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
});
