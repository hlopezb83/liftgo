import { assertEquals } from "@std/assert";
import { sanitizeCsfName, sanitizeLegalName } from "./sanitizeLegalName.ts";

Deno.test("sanitizeLegalName: valores nulos o vacíos", () => {
  assertEquals(sanitizeLegalName(null), "");
  assertEquals(sanitizeLegalName(undefined), "");
  assertEquals(sanitizeLegalName(""), "");
  assertEquals(sanitizeLegalName("   "), "");
});

Deno.test("sanitizeLegalName: quita regímenes al final", () => {
  assertEquals(sanitizeLegalName("Árbol, S.A. de C.V."), "ARBOL");
  assertEquals(
    sanitizeLegalName("LOGISTORAGE SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE"),
    "LOGISTORAGE",
  );
  assertEquals(
    sanitizeLegalName(
      "GRUPO FINANCIERO SOCIEDAD ANÓNIMA BURSÁTIL DE CAPITAL VARIABLE",
    ),
    "GRUPO FINANCIERO",
  );
  assertEquals(
    sanitizeLegalName(
      "CAPITAL SEMILLA SOCIEDAD ANÓNIMA PROMOTORA DE INVERSIÓN DE CAPITAL VARIABLE",
    ),
    "CAPITAL SEMILLA",
  );
  assertEquals(
    sanitizeLegalName(
      "TALLERES DEL NORTE SOCIEDAD DE RESPONSABILIDAD LIMITADA DE CAPITAL VARIABLE",
    ),
    "TALLERES DEL NORTE",
  );
  assertEquals(
    sanitizeLegalName("INNOVACION DIGITAL SOCIEDAD POR ACCIONES SIMPLIFICADA"),
    "INNOVACION DIGITAL",
  );
  assertEquals(
    sanitizeLegalName("INNOVACION DIGITAL, S.A.S."),
    "INNOVACION DIGITAL",
  );
  assertEquals(
    sanitizeLegalName("DESPACHO CONTABLE, SOCIEDAD CIVIL"),
    "DESPACHO CONTABLE",
  );
  assertEquals(
    sanitizeLegalName("FUNDACION EDUCATIVA, ASOCIACIÓN CIVIL"),
    "FUNDACION EDUCATIVA",
  );
  assertEquals(sanitizeLegalName("FOO S. DE R.L. DE C.V."), "FOO");
  assertEquals(sanitizeLegalName("BAR SAPI DE C.V."), "BAR");
  assertEquals(sanitizeLegalName("BAZ S.A.P.I. DE C.V."), "BAZ");
  assertEquals(sanitizeLegalName("QUX S.A.B. DE C.V."), "QUX");
  assertEquals(sanitizeLegalName("CONSULTORES, S.C."), "CONSULTORES");
  assertEquals(
    sanitizeLegalName("PATRONATO CULTURAL, A.C."),
    "PATRONATO CULTURAL",
  );
});

Deno.test("sanitizeLegalName: iniciales intermedias y puntuación", () => {
  assertEquals(
    sanitizeLegalName("GARCIA A C TRANSPORTES, S.A. DE C.V."),
    "GARCIA A C TRANSPORTES",
  );
  assertEquals(
    sanitizeLegalName("SERVICIOS S C DEL NORTE, S. DE R.L. DE C.V."),
    "SERVICIOS S C DEL NORTE",
  );
  assertEquals(
    sanitizeLegalName("  EMPRESA DEMO, SOCIEDAD ANONIMA, S.A. DE C.V..;  "),
    "EMPRESA DEMO",
  );
  assertEquals(sanitizeCsfName("José Pérez Núñez"), "JOSE PEREZ NUNEZ");
});
