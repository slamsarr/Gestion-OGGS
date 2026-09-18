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

import { MemoryRouter } from "react-router-dom";
import { AuthCtx } from "../src/context/AuthContext.jsx";
import Login from "../src/pages/Login.jsx";
import Dashboard from "../src/pages/Dashboard.jsx";
import Historique from "../src/pages/Historique.jsx";
import Rapport from "../src/pages/Rapport.jsx";
import Stocks from "../src/pages/Stocks.jsx";
import Finance from "../src/pages/Finance.jsx";
import Depenses from "../src/pages/Depenses.jsx";
import ClientsPro from "../src/pages/ClientsPro.jsx";
import Fournisseurs from "../src/pages/Fournisseurs.jsx";
import Pistolets from "../src/pages/Pistolets.jsx";
import Pompistes from "../src/pages/Pompistes.jsx";
import Parametres from "../src/pages/Parametres.jsx";
import DescentePompiste from "../src/pages/DescentePompiste.jsx";
import Lavage from "../src/pages/Lavage.jsx";
import Boutique from "../src/pages/Boutique.jsx";
import CuvesCarburant from "../src/pages/CuvesCarburant.jsx";
import Maintenance from "../src/pages/Maintenance.jsx";

const mockAuthValue = {
  profil: {
    id: "u-gerant",
    nom_complet: "Mamadou Sow",
    role: "admin",
    station_id: "st-hann",
    stations: { code: "HANN", nom: "Station Hann Bel-Air" },
    email: "gerant@station.sn",
  },
  session: { type: "demo" },
  loading: false,
  online: true,
  cloud: false,
  logout: () => {},
  switchUser: () => {},
};

describe("Affichage de toutes les pages sans crash", () => {
  const pages = [
    ["Login", Login],
    ["Dashboard", Dashboard],
    ["Historique", Historique],
    ["Rapport", Rapport],
    ["Stocks", Stocks],
    ["Finance", Finance],
    ["Depenses", Depenses],
    ["ClientsPro", ClientsPro],
    ["Fournisseurs", Fournisseurs],
    ["Pistolets", Pistolets],
    ["Pompistes", Pompistes],
    ["Parametres", Parametres],
    ["DescentePompiste", DescentePompiste],
    ["Lavage", Lavage],
    ["Boutique", Boutique],
    ["CuvesCarburant", CuvesCarburant],
    ["Maintenance", Maintenance],
  ];

  for (const [nom, Component] of pages) {
    it(`La page ${nom} s'affiche correctement`, () => {
      const authVal = nom === "Login" ? { ...mockAuthValue, session: null } : mockAuthValue;
      const html = renderToStaticMarkup(
        <AuthCtx.Provider value={authVal}>
          <MemoryRouter>
            <Component />
          </MemoryRouter>
        </AuthCtx.Provider>
      );
      expect(html).toBeDefined();
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });
  }
});