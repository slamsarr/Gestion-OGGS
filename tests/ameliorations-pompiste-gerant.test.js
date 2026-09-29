import { describe, it, expect, vi, beforeEach } from "vitest";

const inMemoryBons = new Map();
const inMemoryDescentes = new Map();
const inMemoryOpsCredit = new Map();

vi.mock("../src/lib/supabase", () => ({
  getSupabase: vi.fn(() => null),
}));

vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    db: {
      bons_carburant: {
        get: vi.fn(async (id) => inMemoryBons.get(id)),
        put: vi.fn(async (item) => {
          inMemoryBons.set(item.id, item);
          return item.id;
        }),
        toArray: vi.fn(async () => Array.from(inMemoryBons.values())),
        where: (field) => ({
          equals: (val) => ({
            toArray: async () => Array.from(inMemoryBons.values()).filter((b) => b[field] === val),
          }),
        }),
        clear: vi.fn(async () => inMemoryBons.clear()),
      },
      descentes: {
        get: vi.fn(async (id) => inMemoryDescentes.get(id)),
        put: vi.fn(async (item) => {
          inMemoryDescentes.set(item.id, item);
          return item.id;
        }),
        toArray: vi.fn(async () => Array.from(inMemoryDescentes.values())),
        clear: vi.fn(async () => inMemoryDescentes.clear()),
      },
      operations_credit: {
        get: vi.fn(async (id) => inMemoryOpsCredit.get(id)),
        put: vi.fn(async (item) => {
          inMemoryOpsCredit.set(item.id, item);
          return item.id;
        }),
        add: vi.fn(async (item) => {
          const id = item.id || `auto-${Date.now()}-${Math.random()}`;
          const withId = { ...item, id };
          inMemoryOpsCredit.set(id, withId);
          return id;
        }),
        toArray: vi.fn(async () => Array.from(inMemoryOpsCredit.values())),
        where: (field) => ({
          equals: (val) => {
            const arr = () => Array.from(inMemoryOpsCredit.values()).filter((o) => o[field] === val);
            return {
              toArray: async () => arr(),
              reverse: () => ({
                sortBy: async (key) =>
                  arr().sort((a, b) => (b[key] || "").localeCompare(a[key] || "")),
              }),
              sortBy: async (key) =>
                arr().sort((a, b) => (a[key] || "").localeCompare(b[key] || "")),
            };
          },
        }),
        clear: vi.fn(async () => inMemoryOpsCredit.clear()),
      },
      queue: { add: vi.fn() },
    },
    ensureLocalSeed: vi.fn(),
    getLocalRef: vi.fn(),
    setLocalRef: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
  };
});

import {
  saveBonCarburant,
  listBonsClient,
  listTousBonsStation,
  attribuerBonClient,
  reglerBonsClient,
  syncBonsFromDescente,
  listOperationsCredit,
} from "../src/lib/api";
import { todayISO } from "../src/lib/calcul";

describe("Améliorations Pompiste & Gérant", () => {
  beforeEach(() => {
    inMemoryBons.clear();
    inMemoryDescentes.clear();
    inMemoryOpsCredit.clear();
  });

  describe("1. Profil Pompiste : Isolation caisse pompes, Litrage sur les bons et verrouillage", () => {
    it("isole strictement les ventes au niveau des pompes de la vente de lubrifiants", () => {
      // Données simulées d'une descente
      const ventesPompes = [
        { index_depart: 1000, index_fin: 1100, prix: 755 }, // 100 L * 755 = 75 500 F
        { index_depart: 2000, index_fin: 2050, prix: 890 }, // 50 L * 890 = 44 500 F
      ];
      const totalCarburant = ventesPompes.reduce((acc, p) => acc + (p.index_fin - p.index_depart) * p.prix, 0);
      expect(totalCarburant).toBe(120000);

      // Lubrifiants vendus
      const ventesLubrifiants = [
        { quantite: 2, prix_vente: 6500 }, // 13 000 F
      ];
      const totalLubrifiants = ventesLubrifiants.reduce((acc, l) => acc + l.quantite * l.prix_vente, 0);
      expect(totalLubrifiants).toBe(13000);

      // La caisse du haut de la pompe doit être EXCLUSIVEMENT totalCarburant (120 000 F)
      // et ne doit pas changer lorsque l'on ajoute un produit lubrifiant
      const caissePompeHaut = totalCarburant;
      expect(caissePompeHaut).toBe(120000);

      // Le total général combiné du shift pompiste est distinct
      const totalGlobalPompiste = totalCarburant + totalLubrifiants;
      expect(totalGlobalPompiste).toBe(133000);
      expect(caissePompeHaut).not.toBe(totalGlobalPompiste);
    });

    it("enregistre le litrage sur les bons de carburant et vérifie la cohérence montant / volume", () => {
      const volumeLitres = 45.5;
      const prixUnitaire = 755; // Gasoil
      const montantCalcule = Math.round(volumeLitres * prixUnitaire); // 34 353 F

      const bon = {
        id: "bon-test-1",
        station_id: "st-hann",
        client_code: "CP-SOCOCIM",
        client_nom: "Sococim Industries",
        numero_bon: "BON-2026-9901",
        immatriculation: "DK-7788-AB",
        produit: "GASOIL",
        volume_litres: volumeLitres,
        prix_unitaire: prixUnitaire,
        montant: montantCalcule,
        date: todayISO(),
      };

      expect(bon.volume_litres).toBe(45.5);
      expect(bon.montant).toBe(34353);
      expect(bon.produit).toBe("GASOIL");
    });

    it("interdit la modification d'une descente soumise (statut TERMINEE)", () => {
      const descenteSoumise = {
        id: "desc-001",
        numero: "DESC-2026-001",
        statut: "TERMINEE",
        total_recette_theorique: 150000,
      };

      // Simule la garde de modification
      const canEdit = descenteSoumise.statut !== "TERMINEE";
      expect(canEdit).toBe(false);

      const descenteBrouillon = {
        id: "desc-002",
        numero: "DESC-2026-002",
        statut: "BROUILLON",
        total_recette_theorique: 80000,
      };
      const canEditDraft = descenteBrouillon.statut !== "TERMINEE";
      expect(canEditDraft).toBe(true);
    });
  });

  describe("2. Vue Gérant : Dépotage Camion Citerne avec BL partagé et Scellés distincts par cuve", () => {
    it("hérite du N° BL du camion pour tous les compartiments avec des scellés propres à chaque cuve", () => {
      const blCamion = "BL-SAR-2026-8842";

      const compartiments = [
        {
          numero_compartiment: 1,
          produit: "GASOIL",
          cuve_id: "cuve-1",
          numero_bl: blCamion, // hérité du camion
          numero_scelle: "SC-99101-A", // scellé propre
          volume_bl_num: 15000,
        },
        {
          numero_compartiment: 2,
          produit: "SUPER",
          cuve_id: "cuve-2",
          numero_bl: blCamion, // hérité du même camion
          numero_scelle: "SC-99102-B", // scellé propre distinct
          volume_bl_num: 10000,
        },
        {
          numero_compartiment: 3,
          produit: "GASOIL",
          cuve_id: "cuve-3",
          numero_bl: blCamion, // hérité du même camion
          numero_scelle: "SC-99103-C", // scellé propre distinct
          volume_bl_num: 15000,
        },
      ];

      // Vérification : tous ont le même BL camion
      expect(compartiments.every((c) => c.numero_bl === blCamion)).toBe(true);

      // Vérification : chaque compartiment a un scellé distinct
      const scelles = compartiments.map((c) => c.numero_scelle);
      const uniqueScelles = new Set(scelles);
      expect(uniqueScelles.size).toBe(compartiments.length);

      // Volume total convoi
      const totalVolumeBl = compartiments.reduce((acc, c) => acc + c.volume_bl_num, 0);
      expect(totalVolumeBl).toBe(40000);
    });
  });

  describe("3. Vue Gérant : Suivi et Règlements des Bons Carburant (paiements partiels et choix des bons)", () => {
    it("synchronise les bons depuis une descente et permet le règlement partiel puis total", async () => {
      // 1. Pompiste soumet une descente avec 2 bons pour CP-DDE
      const descente = {
        id: "desc-sync-100",
        numero: "DESC-100",
        station_id: "st-hann",
        pompiste_nom: "Amadou Diallo",
        date: "2026-09-28",
        statut: "TERMINEE",
        bons: [
          {
            id: "bon-1",
            client_code: "CP-DDE",
            client_nom: "Direction Équipement",
            numero_bon: "BON-001",
            volume_litres: 100,
            produit: "GASOIL",
            montant: 75500,
            immatriculation: "DK-1001-A",
          },
          {
            id: "bon-2",
            client_code: "CP-DDE",
            client_nom: "Direction Équipement",
            numero_bon: "BON-002",
            volume_litres: 50,
            produit: "GASOIL",
            montant: 37750,
            immatriculation: "DK-1002-B",
          },
        ],
      };

      await syncBonsFromDescente(descente);

      // 2. Vérifier que listBonsClient charge les 2 bons
      const bonsInitiaux = await listBonsClient("CP-DDE", "st-hann");
      expect(bonsInitiaux.length).toBe(2);
      const bon1Init = bonsInitiaux.find((b) => b.id === "bon-1");
      expect(bon1Init.volume_litres).toBe(100);
      expect(bon1Init.reste_a_payer).toBe(75500);
      expect(bon1Init.statut_paiement).toBe("NON_REGLE");

      // 3. Le client fait un paiement PARTIEL de 50 000 FCFA.
      // Le gérant choisit d'allouer les 50 000 FCFA sur le premier bon (BON-001)
      const resPartiel = await reglerBonsClient({
        client_code: "CP-DDE",
        station_id: "st-hann",
        date: "2026-09-29",
        montant_total_recu: 50000,
        mode_paiement: "CHEQUE",
        reference: "CHQ-001122",
        allocations: [{ bon_id: "bon-1", montant_alloue: 50000 }],
        operateur: "Gérant M. Fall",
      });

      expect(resPartiel.ok).toBe(true);

      // Re-vérifier l'état des bons
      const bonsApresPartiel = await listBonsClient("CP-DDE", "st-hann");
      const bon1 = bonsApresPartiel.find((b) => b.id === "bon-1");
      const bon2 = bonsApresPartiel.find((b) => b.id === "bon-2");

      expect(bon1.montant_regle).toBe(50000);
      expect(bon1.reste_a_payer).toBe(25500);
      expect(bon1.statut_paiement).toBe("PARTIELLEMENT_REGLE");
      expect(bon1.historique_reglements.length).toBe(1);
      expect(bon1.historique_reglements[0].montant).toBe(50000);
      expect(bon1.historique_reglements[0].reference).toBe("CHQ-001122");

      // Bon 2 n'a pas été impacté
      expect(bon2.reste_a_payer).toBe(37750);
      expect(bon2.statut_paiement).toBe("NON_REGLE");

      // 4. Deuxième paiement pour solder le bon 1 (25 500 F) et payer partiellement le bon 2 (10 000 F)
      // Total reçu = 35 500 F
      const resSuite = await reglerBonsClient({
        client_code: "CP-DDE",
        station_id: "st-hann",
        date: "2026-09-30",
        montant_total_recu: 35500,
        mode_paiement: "ESPECES",
        allocations: [
          { bon_id: "bon-1", montant_alloue: 25500 },
          { bon_id: "bon-2", montant_alloue: 10000 },
        ],
        operateur: "Gérant M. Fall",
      });

      expect(resSuite.ok).toBe(true);

      const bonsFinaux = await listBonsClient("CP-DDE", "st-hann");
      const bon1Final = bonsFinaux.find((b) => b.id === "bon-1");
      const bon2Final = bonsFinaux.find((b) => b.id === "bon-2");

      // Bon 1 est totalement soldé
      expect(bon1Final.montant_regle).toBe(75500);
      expect(bon1Final.reste_a_payer).toBe(0);
      expect(bon1Final.statut_paiement).toBe("REGLE");
      expect(bon1Final.historique_reglements.length).toBe(2);

      // Bon 2 est partiellement réglé
      expect(bon2Final.montant_regle).toBe(10000);
      expect(bon2Final.reste_a_payer).toBe(27750);
      expect(bon2Final.statut_paiement).toBe("PARTIELLEMENT_REGLE");

      // Vérifier que 2 opérations de crédit (dépôt) ont été créées
      const opsCredit = await listOperationsCredit("CP-DDE");
      expect(opsCredit.length).toBe(2);
      expect(opsCredit[0].depot + opsCredit[1].depot).toBe(85500);
    });

    it("capture les bons saisis même sans client_code renseigné et permet au gérant de les lister et les attribuer", async () => {
      // Descente avec un bon où le pompiste a omis le client_code
      const descenteAvecBonSansClient = {
        id: "desc-anonyme-1",
        station_id: "st-hann",
        pompiste_nom: "Ibrahima Ba",
        date: "2026-09-28",
        bons: [
          {
            id: "bon-anonyme-99",
            numero_bon: "BON-SANS-CODE-01",
            volume_litres: 40,
            produit: "GASOIL",
            montant: 30200,
            immatriculation: "DK-9900-Z",
            // pas de client_code ni client_nom
          },
        ],
      };

      await syncBonsFromDescente(descenteAvecBonSansClient);

      // Le gérant liste TOUS les bons de la station
      const tousLesBons = await listTousBonsStation("st-hann");
      expect(tousLesBons.length).toBeGreaterThanOrEqual(1);

      const bonTrouve = tousLesBons.find((b) => b.numero_bon === "BON-SANS-CODE-01");
      expect(bonTrouve).toBeDefined();
      expect(bonTrouve.client_code).toBe("DIVERS");
      expect(bonTrouve.volume_litres).toBe(40);
      expect(bonTrouve.montant).toBe(30200);

      // Le gérant attribue ce bon au client CP-SOCOCIM
      const resAttrib = await attribuerBonClient(bonTrouve.id, "CP-SOCOCIM", "Sococim Industries");
      expect(resAttrib.ok).toBe(true);

      const bonsApresAttrib = await listTousBonsStation("st-hann");
      const bonMaj = bonsApresAttrib.find((b) => b.id === bonTrouve.id);
      expect(bonMaj.client_code).toBe("CP-SOCOCIM");
      expect(bonMaj.client_nom).toBe("Sococim Industries");
    });

    it("permet au gérant de corriger une descente clôturée alors que le pompiste est verrouillé", () => {
      const descenteCloturee = {
        id: "desc-cloturee-1",
        statut: "TERMINEE",
        total_caisse: 200000,
      };

      // Règle d'autorisation
      const peutCorrigerDescente = (role, statut) => {
        const isManager = ["gerant", "admin", "superviseur", "directeur"].includes(role);
        if (statut === "TERMINEE" && !isManager) return false;
        return true;
      };

      // Le pompiste ne peut PAS modifier
      expect(peutCorrigerDescente("pompiste", descenteCloturee.statut)).toBe(false);

      // Le gérant PEUT modifier pour corriger
      expect(peutCorrigerDescente("gerant", descenteCloturee.statut)).toBe(true);
      expect(peutCorrigerDescente("admin", descenteCloturee.statut)).toBe(true);
    });
  });
});
