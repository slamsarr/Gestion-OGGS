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

  // ── 6. DÉPOTAGE PILOTÉ PAR LA CUVE : MULTI-COMPARTIMENTS ET RÉPARTITION (EXEMPLE GUIDE) ──
  it("valide la logique 'Cuve comme élément principal' : Cuve Gasoil 1 reçoit C1 (10 000 L) + C2 (2 000 L) = 12 000 L", () => {
    // Cuve réceptrice principale
    const cuveGasoil1 = {
      id: "cuve-go-1",
      nom: "Cuve 1 Gasoil",
      produit: "GASOIL",
      capacite_l: 30000,
      stock_initial_l: 5000,
    };

    // Compartiments du camion-citerne alimentant cette cuve
    const compartimentsVersCuve1 = [
      { id: "c1", numero_compartiment: "C1", produit: "GASOIL", volume_bl: 10000, numero_scelle: "SC-991" },
      { id: "c2-part1", numero_compartiment: "C2", produit: "GASOIL", volume_bl: 2000, numero_scelle: "SC-992" },
    ];

    // Calcul du volume BL total dirigé vers cette cuve
    const totalVolumeBlVersCuve = compartimentsVersCuve1.reduce((sum, c) => sum + c.volume_bl, 0);
    expect(totalVolumeBlVersCuve).toBe(12000);

    // Contrôle creux disponible avant dépotage
    const creuxDisponible = cuveGasoil1.capacite_l - cuveGasoil1.stock_initial_l; // 25 000 L
    expect(creuxDisponible).toBe(25000);
    expect(totalVolumeBlVersCuve <= creuxDisponible).toBe(true); // Sécurisé, aucun risque de débordement

    // Stock théorique après réception
    const stockTheoriqueApres = cuveGasoil1.stock_initial_l + totalVolumeBlVersCuve; // 17 000 L
    expect(stockTheoriqueApres).toBe(17000);

    // Jauge physique mesurée après dépotage (repos 15 min) : 16 970 L
    const stockFinalMesure = 16970;
    const volumeDepoteReel = stockFinalMesure - cuveGasoil1.stock_initial_l; // 11 970 L
    const ecartLitres = volumeDepoteReel - totalVolumeBlVersCuve; // -30 L
    const ecartPct = Number(((ecartLitres / totalVolumeBlVersCuve) * 100).toFixed(2)); // -0.25%

    expect(volumeDepoteReel).toBe(11970);
    expect(ecartLitres).toBe(-30);
    expect(ecartPct).toBe(-0.25);

    // Cuve 2 Gasoil alimentée par le reste du compartiment C2 (6 000 L) du même convoi
    const cuveGasoil2 = {
      id: "cuve-go-2",
      nom: "Cuve 2 Gasoil",
      produit: "GASOIL",
      capacite_l: 20000,
      stock_initial_l: 4000,
    };
    const compartimentVersCuve2 = [
      { id: "c2-part2", numero_compartiment: "C2", produit: "GASOIL", volume_bl: 6000, numero_scelle: "SC-992" },
    ];
    const totalBlCuve2 = compartimentVersCuve2.reduce((s, c) => s + c.volume_bl, 0);
    expect(totalBlCuve2).toBe(6000);

    // Total compartiment C2 réparti entre les 2 cuves
    const totalC2 = compartimentsVersCuve1.find(c => c.numero_compartiment === "C2").volume_bl + totalBlCuve2;
    expect(totalC2).toBe(8000); // 2 000 L + 6 000 L = 8 000 L
  });

  // ── 7. PERSISTANCE DES INFORMATIONS DU CONVOI CAMION POUR DÉPOTAGE MULTI-CUVES ──
  it("partage et réutilise les informations du convoi camion (BL, transporteur, chauffeur, sécurité) entre les cuves", () => {
    const camionLivraison = {
      numero_bl: "BL-TOT-2026-9921",
      fournisseur: "TOTAL Energies",
      transporteur: "STT Carburants Sénégal",
      immatriculation_camion: "DK-4402-A",
      immatriculation_remorque: "RM-8821-C",
      nom_chauffeur: "Amadou Ba",
      agent_controleur: "Mamadou Sow",
      responsable_reception: "Sadio Keita",
      check_securite_10_points: true,
      densite_mesuree: 0.835,
      temperature_c: 28,
    };

    // Dépotage 1 : Cuve Gasoil 1
    const depotageCuve1 = {
      numero_depotage: "DEP-HANN-20261011-001",
      cuve_id: "cuve-go-1",
      cuve_nom: "Cuve 1 Gasoil",
      ...camionLivraison,
    };

    // Dépotage 2 : Cuve Gasoil 2 (même camion, même convoi, nouvelle opération de cuve)
    const depotageCuve2 = {
      numero_depotage: "DEP-HANN-20261011-002",
      cuve_id: "cuve-go-2",
      cuve_nom: "Cuve 2 Gasoil",
      ...camionLivraison,
    };

    expect(depotageCuve1.numero_bl).toBe(depotageCuve2.numero_bl);
    expect(depotageCuve1.immatriculation_camion).toBe(depotageCuve2.immatriculation_camion);
    expect(depotageCuve1.cuve_id).not.toBe(depotageCuve2.cuve_id);
    expect(depotageCuve1.numero_depotage).not.toBe(depotageCuve2.numero_depotage);
  });
});
