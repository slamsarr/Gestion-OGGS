/**
 * Tests de coherence fonctionnelle — Module Star Premium Car Care
 * Verifie que toutes les donnees, exports et composants du module Star Care
 * sont complets, coherents et conformes au flyer tarifaire officiel.
 *
 * Utilise renderToStaticMarkup (rendu serveur) pour la compatibilite Vitest
 * sans necessiter de configuration jsdom supplementaire.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SEED_SERVICES_ENTRETIEN, SEED_PRODUITS } from "../src/lib/seed";
import StarCareDiagnostic, { STAR_CARE_POINTS } from "../src/components/entretien/StarCareDiagnostic";
import StarCareGrilleModal, { STAR_CARE_TARIFS, CEPSA_HUILES_OFFICIELLES } from "../src/components/entretien/StarCareGrilleModal";
import StarCarePacksSelector, { STAR_PACKS } from "../src/components/entretien/StarCarePacksSelector";

describe("Module Star Premium Car Care — Tests de Coherence et Fonctionnels", () => {
  // -------------------------------------------------------------------------
  describe("1. Referentiel Seed & Tarifs Officiels", () => {
    it("contient les 3 Grands Forfaits Star Care dans SEED_SERVICES_ENTRETIEN", () => {
      const essentiel = SEED_SERVICES_ENTRETIEN.find((s) => s.code === "PACK_ESSENTIEL");
      const confort = SEED_SERVICES_ENTRETIEN.find((s) => s.code === "PACK_CONFORT");
      const premium = SEED_SERVICES_ENTRETIEN.find((s) => s.code === "PACK_PREMIUM");

      expect(essentiel).toBeDefined();
      expect(essentiel.prix_base).toBe(40000);
      expect(essentiel.points_controle).toBe(20);

      expect(confort).toBeDefined();
      expect(confort.prix_base).toBe(75000);
      expect(confort.points_controle).toBe(40);

      expect(premium).toBeDefined();
      expect(premium.prix_base).toBe(90000);
      expect(premium.points_controle).toBe(60);
    });

    it("contient les prestations cles du flyer dans SEED_SERVICES_ENTRETIEN", () => {
      const codes = SEED_SERVICES_ENTRETIEN.map((s) => s.code);
      expect(codes).toContain("BOITE_VIDANGE");
      expect(codes).toContain("BOITE_PONT_VIDANGE");
      expect(codes).toContain("PLAQUETTES");
      expect(codes).toContain("DISQUES_PLAQUETTES");
      expect(codes).toContain("CLIM_RECHARGE");
      expect(codes).toContain("CLIM_TRAITEMENT");
      expect(codes).toContain("GEOMETRIE");
      expect(codes).toContain("PNEU_MONTAGE_2");
      expect(codes).toContain("PNEU_MONTAGE_4");
      expect(codes).toContain("BATTERIE");
      expect(codes).toContain("BAT_DEMARRAGE_DIAG");
      expect(codes).toContain("CT_PRE_CONTROLE");
      expect(codes).toContain("CT_DIAG_ELECTRONIQUE");
      expect(codes).toContain("LAVAGE_EXTERIEUR");
      expect(codes).toContain("LAVAGE_COMPLET");
      expect(codes).toContain("POLISSAGE_CARROSSERIE");
      expect(codes).toContain("TRAITEMENT_CARROSSERIE");
    });

    it("contient les huiles CEPSA Genuine 15W40 et 10W40 aux prix officiels dans SEED_PRODUITS", () => {
      const cepsa15w40 = SEED_PRODUITS.find((p) => p[0] === "LUB-CEPSA-15W40-5L");
      const cepsa10w40 = SEED_PRODUITS.find((p) => p[0] === "LUB-CEPSA-10W40-5L");

      expect(cepsa15w40).toBeDefined();
      expect(cepsa15w40[4]).toBe(16000);

      expect(cepsa10w40).toBeDefined();
      expect(cepsa10w40[4]).toBe(25000);
    });

    it("SEED_SERVICES_ENTRETIEN contient au moins 30 services", () => {
      expect(SEED_SERVICES_ENTRETIEN.length).toBeGreaterThanOrEqual(30);
    });

    it("tous les services ont les champs obligatoires (code, nom, prix_base, categorie)", () => {
      for (const s of SEED_SERVICES_ENTRETIEN) {
        expect(s.code).toBeTruthy();
        expect(s.nom).toBeTruthy();
        expect(typeof s.prix_base).toBe("number");
        expect(s.categorie).toBeTruthy();
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("2. Coherence des 60 Points de Controle Star Care", () => {
    it("STAR_CARE_POINTS contient exactement 60 points de controle", () => {
      expect(STAR_CARE_POINTS.length).toBe(60);
    });

    it("respecte la distribution par paliers : 20, 40 et 60 points", () => {
      const pts20 = STAR_CARE_POINTS.filter((p) => p.niveau === 20);
      const pts40 = STAR_CARE_POINTS.filter((p) => p.niveau === 40);
      const pts60 = STAR_CARE_POINTS.filter((p) => p.niveau === 60);

      expect(pts20.length).toBe(20);
      expect(pts40.length).toBe(20);
      expect(pts60.length).toBe(20);

      expect(STAR_CARE_POINTS.filter((p) => p.niveau <= 20).length).toBe(20);
      expect(STAR_CARE_POINTS.filter((p) => p.niveau <= 40).length).toBe(40);
      expect(STAR_CARE_POINTS.filter((p) => p.niveau <= 60).length).toBe(60);
    });

    it("chaque point a un identifiant unique, un label, une icone et une categorie", () => {
      const ids = new Set();
      STAR_CARE_POINTS.forEach((p) => {
        expect(p.id).toBeTruthy();
        expect(p.label).toBeTruthy();
        expect(p.cat).toBeTruthy();
        expect(p.icon).toBeTruthy();
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      });
    });

    it("le composant StarCareDiagnostic se rend sans crash avec un palier 20", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCareDiagnostic, {
          checklist: { niv_huile: "OK" },
          onChange: () => {},
          niveau: 20,
          onNiveauChange: () => {},
        })
      );
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain("Tout marquer OK");
    });

    it("le composant StarCareDiagnostic se rend sans crash avec un palier 60", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCareDiagnostic, {
          checklist: {},
          onChange: () => {},
          niveau: 60,
          onNiveauChange: () => {},
        })
      );
      expect(html.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  describe("3. Packs & Options Star Care", () => {
    it("STAR_PACKS contient les 3 formules officielles", () => {
      expect(STAR_PACKS.length).toBe(3);
      const [essentiel, confort, premium] = STAR_PACKS;

      expect(essentiel.id).toBe("PACK_ESSENTIEL");
      expect(essentiel.prix).toBe(40000);
      expect(essentiel.ptsControle).toBe(20);
      expect(essentiel.optionGrade?.supplement).toBe(10000);

      expect(confort.id).toBe("PACK_CONFORT");
      expect(confort.prix).toBe(75000);
      expect(confort.ptsControle).toBe(40);

      expect(premium.id).toBe("PACK_PREMIUM");
      expect(premium.prix).toBe(90000);
      expect(premium.ptsControle).toBe(60);
    });

    it("StarCarePacksSelector se rend et affiche les 3 packs", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCarePacksSelector, {
          selectedPackId: "PACK_ESSENTIEL",
          option10w40: false,
          onSelectPack: () => {},
          onToggleOption10w40: () => {},
        })
      );
      expect(html).toContain("Pack Essentiel");
      expect(html).toContain("Pack Confort");
      expect(html).toContain("Pack Premium");
    });

    it("StarCarePacksSelector affiche l option 10W40", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCarePacksSelector, {
          selectedPackId: "PACK_ESSENTIEL",
          option10w40: true,
          onSelectPack: () => {},
          onToggleOption10w40: () => {},
        })
      );
      expect(html).toContain("10W40");
    });
  });

  // -------------------------------------------------------------------------
  describe("4. Grille Tarifaire Star Care", () => {
    it("STAR_CARE_TARIFS contient au moins 20 tarifs reels", () => {
      expect(STAR_CARE_TARIFS.length).toBeGreaterThanOrEqual(20);
    });

    it("CEPSA_HUILES_OFFICIELLES contient exactement 3 references", () => {
      expect(CEPSA_HUILES_OFFICIELLES.length).toBe(3);
    });

    it("chaque tarif a un code, nom et prix valide", () => {
      for (const t of STAR_CARE_TARIFS) {
        expect(t.code).toBeTruthy();
        expect(t.nom).toBeTruthy();
        expect(typeof t.prix).toBe("number");
        expect(t.prix).toBeGreaterThan(0);
      }
    });

    it("la modal StarCareGrilleModal se rend (isOpen=false) sans crash", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCareGrilleModal, {
          isOpen: false,
          onClose: () => {},
          onSelectService: () => {},
        })
      );
      expect(typeof html).toBe("string");
    });

    it("la modal StarCareGrilleModal (isOpen=true) contient le branding Star Care", () => {
      const html = renderToStaticMarkup(
        React.createElement(StarCareGrilleModal, {
          isOpen: true,
          onClose: () => {},
          onSelectService: () => {},
        })
      );
      expect(html).toContain("STAR PREMIUM CAR CARE");
      expect(html).toContain("77 44 39 690");
      expect(html).toContain("Hann Maristes");
    });
  });

  // -------------------------------------------------------------------------
  describe("5. Coherence inter-modules (seed <-> tarifs <-> packs)", () => {
    it("les codes de SEED categorie PACK correspondent aux STAR_PACKS", () => {
      const packCodesFromSeed = SEED_SERVICES_ENTRETIEN
        .filter((s) => s.categorie === "PACK")
        .map((s) => s.code);
      const packIds = STAR_PACKS.map((p) => p.id);
      for (const id of packIds) {
        expect(packCodesFromSeed).toContain(id);
      }
    });

    it("les prix des packs sont coherents entre SEED et STAR_PACKS", () => {
      for (const pack of STAR_PACKS) {
        const seed = SEED_SERVICES_ENTRETIEN.find((s) => s.code === pack.id);
        expect(seed).toBeDefined();
        expect(seed.prix_base).toBe(pack.prix);
        expect(seed.points_controle).toBe(pack.ptsControle);
      }
    });

    it("tous les codes STAR_CARE_TARIFS sont des strings non vides", () => {
      for (const t of STAR_CARE_TARIFS) {
        expect(typeof t.code).toBe("string");
        expect(t.code.length).toBeGreaterThan(0);
      }
    });
  });
});
