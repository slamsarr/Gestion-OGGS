import { describe, it, expect } from "vitest";
import { dateHierISO, evaluerRapportsManquants, composerMessageAlerte } from "../src/lib/alertes.js";

describe("dateHierISO", () => {
  it("retourne J-1 en UTC au format YYYY-MM-DD", () => {
    expect(dateHierISO(new Date("2026-09-15T10:00:00.000Z"))).toBe("2026-09-14");
  });
});

describe("evaluerRapportsManquants", () => {
  const stations = [
    { id: "a", code: "HANN", nom: "Hann", actif: true },
    { id: "b", code: "NDIAKHIRATE", nom: "Ndia", actif: true },
    { id: "c", code: "OFF", nom: "Inactive", actif: false },
  ];

  it("détecte les stations sans rapport et les brouillons", () => {
    const { manquantes, brouillons } = evaluerRapportsManquants(stations, [
      { station_id: "a", statut: "BROUILLON" },
    ]);
    expect(manquantes.map((s) => s.code)).toEqual(["NDIAKHIRATE"]);
    expect(brouillons.map((s) => s.code)).toEqual(["HANN"]);
  });

  it("ignore les stations inactives", () => {
    const { manquantes } = evaluerRapportsManquants(stations, []);
    expect(manquantes.map((s) => s.code)).toEqual(["HANN", "NDIAKHIRATE"]);
  });
});

describe("composerMessageAlerte", () => {
  it("compose un message lisible", () => {
    const msg = composerMessageAlerte("2026-09-14", [{ nom: "Hann" }], [{ nom: "Ndia" }]);
    expect(msg).toContain("MANQUANT");
    expect(msg).toContain("BROUILLON");
    expect(msg).toContain("Hann");
    expect(msg).toContain("Ndia");
  });
});
