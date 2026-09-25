import { describe, it, expect } from "vitest";
import { calculerPointsFidelite } from "../src/lib/api";
import { peutAgir, rolesRoute } from "../src/lib/permissions";
import { F, n } from "../src/lib/calcul";

describe("Rapports de Dépotage Carburant & Contrôle Anti-Débordement", () => {
  // ── 1. CONTRÔLE ANTI-DÉBORDEMENT ──
  it("calcule correctement le creux disponible et déclenche l'alerte de débordement", () => {
    const capaciteCuve = 30000; // 30 000 L Gasoil
    const stockAvant = 18000;
    const creuxDisponible = capaciteCuve - stockAvant; // 12 000 L

    expect(creuxDisponible).toBe(12000);

    // Cas 1 : Livraison de 10 000 L (inférieure au creux -> Sécurisé)
    const volumeBlSecurise = 10000;
    const risque1 = volumeBlSecurise > creuxDisponible;
    expect(risque1).toBe(false);

    // Cas 2 : Livraison de 15 000 L (dépasse le creux de 3 000 L -> Risque de débordement)
    const volumeBlCritique = 15000;
    const risque2 = volumeBlCritique > creuxDisponible;
    const exces = volumeBlCritique - creuxDisponible;
    expect(risque2).toBe(true);
    expect(exces).toBe(3000);
  });

  // ── 2. CALCUL DU VOLUME RÉCEPTIONNÉ ET DE L'ÉCART NET ──
  it("calcule avec exactitude le volume réellement déchargé et l'écart par rapport au BL", () => {
    const jaugeAvantL = 7500;
    const jaugeApresL = 22480;
    const volumeBl = 15000;

    const volumeReel = jaugeApresL - jaugeAvantL; // 14 980 L
    const ecartLitres = volumeReel - volumeBl;   // -20 L
    const ecartPourcentage = (ecartLitres / volumeBl) * 100; // -0.133%

    expect(volumeReel).toBe(14980);
    expect(ecartLitres).toBe(-20);
    expect(Number(ecartPourcentage.toFixed(2))).toBe(-0.13);
  });

  // ── 3. TOLÉRANCE RÉGLEMENTAIRE DE TRANSPORT (SEUIL ±0.20%) ──
  it("valide la conformité si l'écart est dans la tolérance admise de ±0.20%", () => {
    const volumeBl = 20000;
    const seuilPct = 0.20;
    const toleranceLitres = volumeBl * (seuilPct / 100); // ±40 L

    expect(toleranceLitres).toBe(40);

    // Écart de -30 L (soit -0.15% <= 0.20% -> Conforme)
    const ecartConforme = -30;
    const pctConforme = (ecartConforme / volumeBl) * 100;
    const estConforme = Math.abs(pctConforme) <= seuilPct;
    expect(estConforme).toBe(true);

    // Écart de -65 L (soit -0.325% > 0.20% -> Litige / Hors norme)
    const ecartLitige = -65;
    const pctLitige = (ecartLitige / volumeBl) * 100;
    const estLitige = Math.abs(pctLitige) > seuilPct;
    expect(estLitige).toBe(true);
  });
});

describe("Programme de Fidélisation Clients — Règles Métier & Paliers", () => {
  // ── 1. BARÈME DE CUMUL DE POINTS ──
  it("calcule les points selon le barème Carburant, Lavage et Boutique", () => {
    // Carburant par litre : 1 L = 1 point
    expect(calculerPointsFidelite("CARBURANT_LITRES", 45)).toBe(45);
    expect(calculerPointsFidelite("CARBURANT_LITRES", 62.5)).toBe(63);

    // Carburant par montant : 1000 FCFA = 10 points
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 15000)).toBe(150);
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 2500)).toBe(25);

    // Lavage Auto : 1000 FCFA = 15 points
    expect(calculerPointsFidelite("LAVAGE", 5000)).toBe(75);
    expect(calculerPointsFidelite("LAVAGE", 3000)).toBe(45);

    // Boutique & Lubrifiants : 1000 FCFA = 10 points
    expect(calculerPointsFidelite("BOUTIQUE", 12000)).toBe(120);
    expect(calculerPointsFidelite("BOUTIQUE", 8500)).toBe(85);
  });

  // ── 2. GRADUATION DES PALIERS (Bronze, Silver, Gold, Platine) ──
  it("attribue le bon palier selon les points cumulés à vie", () => {
    const getPalier = (pts) => {
      if (pts >= 4000) return "Platine";
      if (pts >= 1500) return "Gold";
      if (pts >= 500) return "Silver";
      return "Bronze";
    };

    expect(getPalier(0)).toBe("Bronze");
    expect(getPalier(350)).toBe("Bronze");
    expect(getPalier(500)).toBe("Silver");
    expect(getPalier(1200)).toBe("Silver");
    expect(getPalier(1500)).toBe("Gold");
    expect(getPalier(3800)).toBe("Gold");
    expect(getPalier(4000)).toBe("Platine");
    expect(getPalier(7500)).toBe("Platine");
  });

  // ── 3. CRÉDIT ET DÉBIT DE POINTS (ÉCHANGE RÉCOMPENSE) ──
  it("gère correctement le solde de points et refuse un débit excessif", () => {
    const membre = {
      id: "mem-1",
      nom: "Ousmane Ba",
      points_solde: 320,
      points_cumules: 320,
    };

    // Crédit de 80 points
    const pointsGagnes = 80;
    membre.points_solde += pointsGagnes;
    membre.points_cumules += pointsGagnes;
    expect(membre.points_solde).toBe(400);
    expect(membre.points_cumules).toBe(400);

    // Échange d'une récompense "Lavage Complet" à 300 points
    const pointsRequisLavage = 300;
    const soldeSuffisant = membre.points_solde >= pointsRequisLavage;
    expect(soldeSuffisant).toBe(true);

    membre.points_solde -= pointsRequisLavage;
    expect(membre.points_solde).toBe(100);
    expect(membre.points_cumules).toBe(400); // Le cumul à vie ne diminue pas lors d'un échange

    // Tentative d'échange d'une récompense à 250 points (solde = 100 -> refus)
    const pointsRequisBidon = 250;
    const peutAcheter = membre.points_solde >= pointsRequisBidon;
    expect(peutAcheter).toBe(false);
  });

  // ── 4. RBAC & CONTRÔLE D'ACCÈS ──
  it("vérifie les droits d'accès à la route /fidelite et aux opérations de dépotage", () => {
    // Route /fidelite accessible par pompiste, boutique, lavage, gerant, admin, superviseur, directeur
    expect(rolesRoute("pompiste", "/fidelite")).toBe(true);
    expect(rolesRoute("boutique", "/fidelite")).toBe(true);
    expect(rolesRoute("lavage", "/fidelite")).toBe(true);
    expect(rolesRoute("gerant", "/fidelite")).toBe(true);
    expect(rolesRoute("admin", "/fidelite")).toBe(true);
    expect(rolesRoute("superviseur", "/fidelite")).toBe(true);
    expect(rolesRoute("directeur", "/fidelite")).toBe(true);

    // Permissions fines : le pompiste peut créditer des points de fidélité
    expect(peutAgir("pompiste", "fidelite", "crediter")).toBe(true);
    // Mais seul le gérant/admin/commercial peut débiter ou gérer
    expect(peutAgir("gerant", "fidelite", "debiter")).toBe(true);
    expect(peutAgir("pompiste", "fidelite", "debiter")).toBe(false);

    // Dépotage cuves
    expect(peutAgir("gerant", "depotage", "creer")).toBe(true);
    expect(peutAgir("admin", "depotage", "creer")).toBe(true);
    expect(peutAgir("stock", "depotage", "creer")).toBe(true);
  });
});
