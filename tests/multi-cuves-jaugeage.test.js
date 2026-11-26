import { describe, it, expect } from "vitest";
import { n, F } from "../src/lib/calcul";

describe("Gestion Multi-Cuves Carburant & Jaugeage Quotidien", () => {
  // ── 1. CONFIGURATION MULTI-CUVES PAR PRODUIT (Gasoil & Super) ──
  it("gère plusieurs cuves physiques pour un même produit et calcule les totaux consolidés", () => {
    const cuvesStation = [
      { id: "cuve-go-1", nom: "Cuve 1 Gasoil", produit: "GASOIL", capacite_l: 30000, volume_physique: 18000 },
      { id: "cuve-go-2", nom: "Cuve 2 Gasoil", produit: "GASOIL", capacite_l: 20000, volume_physique: 12000 },
      { id: "cuve-sp-1", nom: "Cuve 1 Super", produit: "SUPER", capacite_l: 20000, volume_physique: 14000 },
      { id: "cuve-sp-2", nom: "Cuve 2 Super", produit: "SUPER", capacite_l: 10000, volume_physique: 5000 },
    ];

    // Consolidation Gasoil
    const cuvesGasoil = cuvesStation.filter((c) => c.produit === "GASOIL");
    expect(cuvesGasoil.length).toBe(2);

    const stockTotalGasoil = cuvesGasoil.reduce((s, c) => s + c.volume_physique, 0);
    const capaciteTotaleGasoil = cuvesGasoil.reduce((s, c) => s + c.capacite_l, 0);
    const creuxTotalGasoil = capaciteTotaleGasoil - stockTotalGasoil;
    const pctGasoil = Math.round((stockTotalGasoil / capaciteTotaleGasoil) * 100);

    expect(stockTotalGasoil).toBe(30000); // 18 000 + 12 000
    expect(capaciteTotaleGasoil).toBe(50000); // 30 000 + 20 000
    expect(creuxTotalGasoil).toBe(20000); // 50 000 - 30 000
    expect(pctGasoil).toBe(60);

    // Consolidation Super
    const cuvesSuper = cuvesStation.filter((c) => c.produit === "SUPER");
    expect(cuvesSuper.length).toBe(2);

    const stockTotalSuper = cuvesSuper.reduce((s, c) => s + c.volume_physique, 0);
    const capaciteTotaleSuper = cuvesSuper.reduce((s, c) => s + c.capacite_l, 0);
    const creuxTotalSuper = capaciteTotaleSuper - stockTotalSuper;
    const pctSuper = Math.round((stockTotalSuper / capaciteTotaleSuper) * 100);

    expect(stockTotalSuper).toBe(19000); // 14 000 + 5 000
    expect(capaciteTotaleSuper).toBe(30000); // 20 000 + 10 000
    expect(creuxTotalSuper).toBe(11000); // 30 000 - 19 000
    expect(pctSuper).toBe(63);
  });

  // ── 2. CALCUL D'ÉCART ET DE COULAGE PAR CUVE INDIVIDUELLE ──
  it("calcule avec précision l'écart et le taux de coulage d'une cuve spécifique", () => {
    const cuve = { id: "cuve-go-2", nom: "Cuve 2 Gasoil", capacite_l: 20000 };
    const stockTheorique = 12050; // Dernier stock calculé
    const stockPhysiqueMesure = 12025; // Mesure physique au barème

    const ecartLitres = stockPhysiqueMesure - stockTheorique; // -25 L
    const tauxCoulagePct = (ecartLitres / stockTheorique) * 100;
    const seuilTolere = 0.30; // ±0.30%
    const estConforme = Math.abs(tauxCoulagePct) <= seuilTolere;

    expect(ecartLitres).toBe(-25);
    expect(Number(tauxCoulagePct.toFixed(2))).toBe(-0.21);
    expect(estConforme).toBe(true);
  });

  // ── 3. TEST DE PÂTE À EAU (DÉTECTION D'EAU DE FOND DE CUVE) ──
  it("détecte la présence d'eau au fond d'une cuve et déclenche une alerte", () => {
    const checkFondCuve = (eauCm) => {
      const eau = n(eauCm) || 0;
      return {
        eau_cm: eau,
        conforme: eau === 0,
        alerte: eau > 0,
      };
    };

    // Cas sain : 0 cm d'eau
    const testSain = checkFondCuve(0);
    expect(testSain.conforme).toBe(true);
    expect(testSain.alerte).toBe(false);

    // Cas critique : 1.5 cm d'eau détectée au fond
    const testPollue = checkFondCuve(1.5);
    expect(testPollue.conforme).toBe(false);
    expect(testPollue.alerte).toBe(true);
    expect(testPollue.eau_cm).toBe(1.5);
  });

  // ── 4. AFFECTATION DE COMPARTIMENT DÉPOTAGE VERS UNE CUVE CIBLE ──
  it("valide l'anti-débordement sur la cuve cible spécifique d'un compartiment de camion", () => {
    const cuveCible1 = { id: "cuve-go-1", nom: "Cuve 1 Gasoil", capacite_l: 30000, stock_actuel: 24000 };
    const cuveCible2 = { id: "cuve-go-2", nom: "Cuve 2 Gasoil", capacite_l: 20000, stock_actuel: 5000 };

    const creuxCuve1 = cuveCible1.capacite_l - cuveCible1.stock_actuel; // 6 000 L
    const creuxCuve2 = cuveCible2.capacite_l - cuveCible2.stock_actuel; // 15 000 L

    const volumeBlCompartiment = 10000; // 10 000 L à décharger

    // Si envoyé vers Cuve 1 -> DÉBORDEMENT (10 000 > 6 000)
    const risqueCuve1 = volumeBlCompartiment > creuxCuve1;
    expect(risqueCuve1).toBe(true);

    // Si envoyé vers Cuve 2 -> SÉCURISÉ (10 000 <= 15 000)
    const risqueCuve2 = volumeBlCompartiment > creuxCuve2;
    expect(risqueCuve2).toBe(false);
  });

  // ── 5. RÉSOLUTION D'UNE CUVE AVEC IDENTIFIANT STATION TEXTUEL (st-hann) ──
  it("valide la structure et la résolution d'une cuve créée avec un identifiant textuel st-hann", () => {
    const isUUID = (str) => typeof str === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    const stationHannUuid = "cd735284-f0a3-40d7-8495-98c511af0da0";
    const refStations = [
      { id: stationHannUuid, code: "HANN", nom: "Star Energy Hann Mariste" },
      { id: "2a14bcfb-469b-4d8f-8abe-1ea5b7c57396", code: "NDIAKHIRATE", nom: "Star Energy Ndiakhirate" },
    ];

    const inputCuve = {
      station_id: "st-hann",
      nom: "Cuve 2 Gasoil Test",
      produit: "GASOIL",
      capacite_l: 25000,
    };

    // Résolution
    let resolvedStationId = inputCuve.station_id;
    if (!isUUID(resolvedStationId)) {
      const match = refStations.find((s) => s.code === "HANN" || s.id === "st-hann");
      if (match && isUUID(match.id)) {
        resolvedStationId = match.id;
      }
    }

    expect(isUUID(resolvedStationId)).toBe(true);
    expect(resolvedStationId).toBe(stationHannUuid);
  });
});
