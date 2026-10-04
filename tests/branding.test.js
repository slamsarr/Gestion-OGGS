import { describe, it, expect } from "vitest";
import { BRAND_CONFIG, getOperatorLabel } from "../src/lib/branding.js";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("BRAND_CONFIG — Configuration centralisée de marque", () => {
  it("expose STAR ENERGY comme enseigne principale", () => {
    expect(BRAND_CONFIG.station.name).toBe("STAR ENERGY");
    expect(BRAND_CONFIG.station.brandTitle).toContain("STAR ENERGY");
    expect(BRAND_CONFIG.station.logo).toBe("/star_energy_logo.jpg");
  });

  it("expose DAMEL ENERGY comme opérateur de gestion", () => {
    expect(BRAND_CONFIG.operator.name).toBe("DAMEL ENERGY");
    expect(BRAND_CONFIG.operator.role).toBe("ENERGY & STATION MANAGEMENT");
    expect(BRAND_CONFIG.operator.colors.blue).toBe("#0B4EA2");
    expect(BRAND_CONFIG.operator.colors.red).toBe("#E30620");
    expect(BRAND_CONFIG.operator.colors.yellow).toBe("#F9C400");
    expect(BRAND_CONFIG.operator.colors.navy).toBe("#102A43");
  });

  it("DAMEL ENERGY ne remplace pas STAR ENERGY — les deux ont une identité distincte", () => {
    expect(BRAND_CONFIG.station.name).not.toBe(BRAND_CONFIG.operator.name);
    expect(BRAND_CONFIG.station.logo).not.toBe(BRAND_CONFIG.operator.logos.principal);
  });

  it("expose les 5 variantes de logo DAMEL ENERGY", () => {
    const logos = BRAND_CONFIG.operator.logos;
    expect(logos.principal).toBeDefined();
    expect(logos.corporate).toBeDefined();
    expect(logos.dark).toBeDefined();
    expect(logos.white).toBeDefined();
    expect(logos.icon).toBeDefined();
  });

  it("expose les signatures contextuelles DAMEL ENERGY", () => {
    const sigs = BRAND_CONFIG.operator.signatures;
    expect(sigs.management).toBe("ENERGY & STATION MANAGEMENT");
    expect(sigs.operatedBy).toBe("Operated by DAMEL ENERGY");
    expect(sigs.managedBy).toBe("Managed by DAMEL ENERGY");
  });
});

describe("getOperatorLabel — Labels contextuels", () => {
  it("retourne 'Operated by DAMEL ENERGY' par défaut", () => {
    expect(getOperatorLabel()).toBe("Operated by DAMEL ENERGY");
    expect(getOperatorLabel("operated")).toBe("Operated by DAMEL ENERGY");
  });

  it("retourne 'Managed by DAMEL ENERGY' pour le contexte managed", () => {
    expect(getOperatorLabel("managed")).toBe("Managed by DAMEL ENERGY");
  });

  it("retourne 'ENERGY & STATION MANAGEMENT' pour le contexte corporate", () => {
    expect(getOperatorLabel("corporate")).toBe("ENERGY & STATION MANAGEMENT");
  });

  it("retourne le nom court 'DAMEL ENERGY' pour le contexte short", () => {
    expect(getOperatorLabel("short")).toBe("DAMEL ENERGY");
  });
});

describe("Assets SVG DAMEL ENERGY — présence des fichiers", () => {
  const brandingDir = join(ROOT, "public", "branding", "damel-energy");

  it("damel-energy-logo.svg existe", () => {
    expect(existsSync(join(brandingDir, "damel-energy-logo.svg"))).toBe(true);
  });

  it("damel-energy-corporate.svg existe", () => {
    expect(existsSync(join(brandingDir, "damel-energy-corporate.svg"))).toBe(true);
  });

  it("damel-energy-dark.svg existe", () => {
    expect(existsSync(join(brandingDir, "damel-energy-dark.svg"))).toBe(true);
  });

  it("damel-energy-white.svg existe", () => {
    expect(existsSync(join(brandingDir, "damel-energy-white.svg"))).toBe(true);
  });

  it("damel-energy-icon.svg existe", () => {
    expect(existsSync(join(brandingDir, "damel-energy-icon.svg"))).toBe(true);
  });

  it("les SVG sont des fichiers valides (taille > 100 octets)", () => {
    const { statSync } = require("fs");
    for (const name of [
      "damel-energy-logo.svg",
      "damel-energy-corporate.svg",
      "damel-energy-dark.svg",
      "damel-energy-white.svg",
      "damel-energy-icon.svg",
    ]) {
      const s = statSync(join(brandingDir, name));
      expect(s.size).toBeGreaterThan(100);
    }
  });
});

describe("Assets STAR ENERGY — non supprimés", () => {
  it("star_energy_logo.jpg est toujours à la racine /public", () => {
    expect(existsSync(join(ROOT, "public", "star_energy_logo.jpg"))).toBe(true);
  });

  it("star_energy_cover.jpg est toujours à la racine /public", () => {
    expect(existsSync(join(ROOT, "public", "star_energy_cover.jpg"))).toBe(true);
  });
});

describe("Export Excel — enrichissement non destructif DAMEL ENERGY", () => {
  it("génère le classeur avec la mention opérateur en Q1 et les métadonnées", async () => {
    const { genererWorkbookExcel } = await import("../src/lib/exportExcel.js");
    const { rapportVide, calculer, referentielFromSeed } = await import("../src/lib/calcul.js");
    const { referentielFromSeed: refFromSeed } = await import("../src/lib/seed.js");

    const ref = refFromSeed !== undefined
      ? refFromSeed()
      : (await import("../src/lib/seed.js")).referentielFromSeed();

    // fallback si calcul.js a aussi referentielFromSeed
    const finalRef = ref;
    const r = rapportVide(finalRef, "HANN", "2026-09-14", "Test Gérant");
    const c = calculer(r, finalRef);
    const wb = genererWorkbookExcel(r, c, finalRef.stations);

    // A1 contient toujours STAR ENERGY (rétro-compatibilité absolue)
    expect(wb.Sheets["JOURNAL"]["A1"]?.v).toContain("STAR ENERGY");

    // Q1 contient la mention DAMEL ENERGY (enrichissement)
    expect(wb.Sheets["JOURNAL"]["Q1"]?.v).toContain("DAMEL ENERGY");

    // Les métadonnées du classeur indiquent DAMEL ENERGY
    expect(wb.Props?.Author).toContain("DAMEL ENERGY");
    expect(wb.Props?.Company).toBe("DAMEL ENERGY");
  });
});
