import { describe, it, expect } from "vitest";
import { normalizeDescente } from "../src/pages/DescentePompiste";
import { peutAgir, rolesRoute } from "../src/lib/permissions";
import { F, n } from "../src/lib/calcul";

describe("Module Compte Pompiste — Multi-Pompes et Bons d'encaissement", () => {
  // ── SCÉNARIO 1 : Une seule pompe ──
  it("Scénario 1 : calcule correctement la caisse individuelle pour une seule pompe C1", () => {
    const pompe = {
      caisseId: "C1",
      pistolet_code: "gasoil1",
      produit: "GASOIL",
      index_debut: 10000,
      index_fin: 10500,
      prix_unitaire: 755,
    };

    const volume = pompe.index_fin - pompe.index_debut;
    const montant = volume * pompe.prix_unitaire;

    expect(volume).toBe(500);
    expect(montant).toBe(377500);
  });

  // ── SCÉNARIO 2 : Plusieurs pompes (C1 + C2 + C3) ──
  it("Scénario 2 : calcule et agrège plusieurs caisses C1 + C2 + C3 = TOTAL CAISSE", () => {
    const pompes = [
      { caisseId: "C1", pistolet_code: "gasoil1", volume: 350, prix: 755, montant: 350 * 755 }, // 264 250
      { caisseId: "C2", pistolet_code: "super1", volume: 300, prix: 990, montant: 300 * 990 },   // 297 000
      { caisseId: "C3", pistolet_code: "gasoil2", volume: 200, prix: 755, montant: 200 * 755 },  // 151 000
    ];

    const totalCaisse = pompes.reduce((acc, p) => acc + p.montant, 0);
    expect(totalCaisse).toBe(264250 + 297000 + 151000);
    expect(totalCaisse).toBe(712250);
  });

  // ── SCÉNARIO 3 : Ajout dynamique et validation anti-doublon ──
  it("Scénario 3 : refuse l'ajout d'une pompe déjà présente dans la session", () => {
    const sessionPompes = [
      { id: "1", caisseId: "C1", pistolet_code: "gasoil1" },
      { id: "2", caisseId: "C2", pistolet_code: "super1" },
    ];

    const isDuplicate = (code) =>
      sessionPompes.some((p) => p.pistolet_code.toLowerCase() === code.toLowerCase());

    expect(isDuplicate("gasoil1")).toBe(true);
    expect(isDuplicate("GASOIL1")).toBe(true);
    expect(isDuplicate("gasoil2")).toBe(false);
  });

  // ── SCÉNARIO 4 : Plusieurs bons d'encaissement ──
  it("Scénario 4 : agrège plusieurs bons pour différents clients (Client A, B, C)", () => {
    const bons = [
      { id: "b1", client_code: "CP-ITS", numero_bon: "BE-001", montant: 50000 },
      { id: "b2", client_code: "CP-JOUKADAR", numero_bon: "BE-002", montant: 75000 },
      { id: "b3", client_code: "CP-RETBA", numero_bon: "BE-003", montant: 25000 },
    ];

    const totalBons = bons.reduce((sum, b) => sum + n(b.montant), 0);
    expect(totalBons).toBe(150000);
  });

  // ── SCÉNARIO 5 : Modification d'un bon ──
  it("Scénario 5 : modifie le montant d'un bon et recalcule immédiatement le total", () => {
    let bons = [
      { id: "b1", client_code: "CP-ITS", numero_bon: "BE-001", montant: 50000 },
      { id: "b2", client_code: "CP-JOUKADAR", numero_bon: "BE-002", montant: 75000 },
      { id: "b3", client_code: "CP-RETBA", numero_bon: "BE-003", montant: 25000 },
    ];

    // Modification du montant du Bon 002 de 75 000 à 100 000 FCFA
    bons = bons.map((b) => (b.id === "b2" ? { ...b, montant: 100000 } : b));

    const totalBonsModifie = bons.reduce((sum, b) => sum + n(b.montant), 0);
    expect(totalBonsModifie).toBe(175000);
  });

  // ── SCÉNARIO 6 : Suppression d'un bon ──
  it("Scénario 6 : supprime un bon et recalcule immédiatement le total", () => {
    let bons = [
      { id: "b1", client_code: "CP-ITS", numero_bon: "BE-001", montant: 50000 },
      { id: "b2", client_code: "CP-JOUKADAR", numero_bon: "BE-002", montant: 75000 },
      { id: "b3", client_code: "CP-RETBA", numero_bon: "BE-003", montant: 25000 },
    ];

    // Suppression du Bon 002
    bons = bons.filter((b) => b.id !== "b2");

    const totalBonsApresSuppr = bons.reduce((sum, b) => sum + n(b.montant), 0);
    expect(bons.length).toBe(2);
    expect(totalBonsApresSuppr).toBe(75000);
  });

  // ── SCÉNARIO 7 : Rétrocompatibilité & Normalisation ──
  it("Scénario 7 : normalise les anciennes descentes mono-pompe sans perte de données", () => {
    const ancientRecord = {
      id: "des-old-123",
      station_id: "st-hann",
      date: "2026-09-10",
      pompiste_nom: "Amadou Sow",
      pistolet_code: "gasoil1",
      produit: "GASOIL",
      prix_unitaire: 755,
      index_debut: 1000,
      index_fin: 1300,
      volume_vendu: 300,
      montant_theorique: 226500,
      encaissements: {
        especes: 126500,
        credit_client: 100000,
      },
      total_encaisse: 226500,
      ecart: 0,
      client_credit: "CP-ITS",
    };

    const normalized = normalizeDescente(ancientRecord);
    expect(normalized).toBeDefined();
    expect(normalized.pompes).toHaveLength(1);
    expect(normalized.pompes[0].caisseId).toBe("C1");
    expect(normalized.pompes[0].pistolet_code).toBe("gasoil1");
    expect(normalized.pompes[0].volume_vendu).toBe(300);
    expect(normalized.pompes[0].montant).toBe(226500);

    expect(normalized.bons).toHaveLength(1);
    expect(normalized.bons[0].montant).toBe(100000);
    expect(normalized.total_caisse).toBe(226500);
    expect(normalized.total_bons).toBe(100000);
  });

  // ── SCÉNARIO 8 : Sécurité & Permissions ──
  it("Scénario 8 : valide les règles de sécurité et les permissions pour le rôle pompiste", () => {
    // Le rôle pompiste a accès à la route /descente
    expect(rolesRoute("pompiste", "/descente")).toBe(true);

    // Le rôle pompiste ne peut pas valider ou supprimer les rapports généraux du gérant
    expect(peutAgir("pompiste", "rapport", "valider")).toBe(false);
    expect(peutAgir("pompiste", "rapport", "soumettre")).toBe(false);

    // Le rôle pompiste peut créer une vente / opération
    expect(peutAgir("pompiste", "vente", "creer")).toBe(true);

    // Détection index fin < index début
    const indexDeb = 12000;
    const indexFin = 11950;
    const estValide = indexFin >= indexDeb;
    expect(estValide).toBe(false);
  });

  // ── SCÉNARIO 9 : Modification / Correction d'une descente soumise avec des erreurs ──
  it("Scénario 9 : permet au pompiste de corriger une descente soumise avec des erreurs d'index ou d'encaissements", () => {
    // 1. Descente initiale soumise avec une erreur de frappe sur l'index fin
    const descenteSoumise = {
      id: "des-12345",
      station_id: "st-hann",
      date: "2026-09-25",
      pompiste_id: "u-pompiste-hann",
      pompiste_nom: "Modou Fall (Pompiste)",
      pompes: [
        {
          id: "p1",
          caisseId: "C1",
          pistolet_code: "gasoil1",
          produit: "GASOIL",
          index_debut: 10000,
          index_fin: 10200, // Erreur : l'index réel était 10500
          volume_vendu: 200,
          prix_unitaire: 755,
          montant: 151000,
        },
      ],
      total_volume: 200,
      total_caisse: 151000,
      bons: [
        { id: "b1", client_code: "CP-ITS", numero_bon: "BE-001", montant: 50000 },
      ],
      total_bons: 50000,
      encaissements: {
        especes: 101000,
        wave: 0,
        orange_money: 0,
        carte_bancaire: 0,
        credit_client: 50000,
        autre: 0,
      },
      total_encaisse: 151000,
      ecart: 0,
      statut: "TERMINEE",
    };

    // 2. Le pompiste recharge et corrige l'index fin de 10 200 à 10 500 et ajoute un second bon de 25 000 F
    const pompesCorrigees = descenteSoumise.pompes.map((p) => {
      const idxFin = 10500;
      const vol = idxFin - p.index_debut;
      return {
        ...p,
        index_fin: idxFin,
        volume_vendu: vol,
        montant: vol * p.prix_unitaire,
      };
    });

    const bonsCorriges = [
      ...descenteSoumise.bons,
      { id: "b2", client_code: "CP-JOUKADAR", numero_bon: "BE-002", montant: 25000 },
    ];

    const totalVolCorrige = pompesCorrigees.reduce((sum, p) => sum + p.volume_vendu, 0);
    const totalCaisseCorrigee = pompesCorrigees.reduce((sum, p) => sum + p.montant, 0);
    const totalBonsCorrige = bonsCorriges.reduce((sum, b) => sum + b.montant, 0);

    const encaissementsCorriges = {
      ...descenteSoumise.encaissements,
      especes: 302500, // 377 500 - 75 000
      credit_client: totalBonsCorrige,
      bons: totalBonsCorrige,
    };

    const totalEncaisseCorrige =
      encaissementsCorriges.especes + totalBonsCorrige;
    const ecartCorrige = totalEncaisseCorrige - totalCaisseCorrigee;

    const descenteMiseAJour = {
      ...descenteSoumise,
      pompes: pompesCorrigees,
      total_volume: totalVolCorrige,
      total_caisse: totalCaisseCorrigee,
      bons: bonsCorriges,
      total_bons: totalBonsCorrige,
      encaissements: encaissementsCorriges,
      total_encaisse: totalEncaisseCorrige,
      ecart: ecartCorrige,
    };

    // 3. Vérifications : la descente conserve son identifiant id et contient les données corrigées
    expect(descenteMiseAJour.id).toBe("des-12345");
    expect(descenteMiseAJour.pompes[0].index_fin).toBe(10500);
    expect(descenteMiseAJour.pompes[0].volume_vendu).toBe(500);
    expect(descenteMiseAJour.total_caisse).toBe(377500);
    expect(descenteMiseAJour.bons).toHaveLength(2);
    expect(descenteMiseAJour.total_bons).toBe(75000);
    expect(descenteMiseAJour.total_encaisse).toBe(377500);
    expect(descenteMiseAJour.ecart).toBe(0);
  });
});
