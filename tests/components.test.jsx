import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Num, Row, Section, Alerte } from "../src/components/ui.jsx";

describe("Composants UI", () => {
  it("Section rend son titre et son aside", () => {
    const html = renderToStaticMarkup(<Section titre="Test" aside="3 items">contenu</Section>);
    expect(html).toContain("Test");
    expect(html).toContain("3 items");
    expect(html).toContain("contenu");
  });

  it("Section n'affiche pas d'aside si absent", () => {
    const html = renderToStaticMarkup(<Section titre="Seul">contenu</Section>);
    expect(html).not.toContain("aside");
  });

  it("Row rend ses enfants", () => {
    const html = renderToStaticMarkup(
      <Row><span>Gauche</span><strong>Droit</strong></Row>
    );
    expect(html).toContain("Gauche");
    expect(html).toContain("Droit");
  });

  it("Num rend un champ saisie aligné à droite par défaut", () => {
    const html = renderToStaticMarkup(<Num value="123" onChange={() => {}} />);
    expect(html).toContain("123");
    expect(html).toContain("text-right");
  });

  it("Alerte rend son message", () => {
    const html = renderToStaticMarkup(<Alerte>Écart détecté</Alerte>);
    expect(html).toContain("Écart détecté");
  });
});