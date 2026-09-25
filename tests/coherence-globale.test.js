import { describe, it, expect, vi, beforeEach } from "vitest";
import { ALL_ROLES, ROLE_LABELS, rolesRoute, peutAgir, peutSoumettreRapport, peutValiderRapport, peutSupprimerRapport } from "../src/lib/permissions";
import { calculer, rapportVide, n } from "../src/lib/calcul";
import { referentielFromSeed, DEMO_USERS } from "../src/lib/seed";
import { calculerPointsFidelite } from "../src/lib/api";

// Mock des collections Dexie en mémoire pour Vitest Node.js
const memoryDB = {
  operations_credit: [],
  produits_boutique: [],
  ventes_boutique: [],
  rapports_depotage: [],
  jauges_cuves: [],
  queue: [],
};

vi.mock("../src/lib/supabase", () => ({
  getSupabase: vi.fn(() => null),
}));

vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    db: {
      operations_credit: {
        add: vi.fn(async (row) => {
          const id = memoryDB.operations_credit.length + 1;
          const entry = { ...row, id };
          memoryDB.operations_credit.push(entry);
          return id;
        }),
        where: vi.fn((col) => ({
          equals: vi.fn((val) => ({
            reverse: vi.fn(() => ({
              sortBy: vi.fn(async () =>
                memoryDB.operations_credit
                  .filter((r) => r[col] === val)
                  .sort((a, b) => (b.date_op || "").localeCompare(a.date_op || ""))
              ),
            })),
          })),
        })),
        clear: vi.fn(async () => { memoryDB.operations_credit = []; }),
      },
      produits_boutique: {
        put: vi.fn(async (row) => {
          const idx = memoryDB.produits_boutique.findIndex((p) => p.code === row.code || p.id === row.id);
          if (idx >= 0) memoryDB.produits_boutique[idx] = { ...memoryDB.produits_boutique[idx], ...row };
          else memoryDB.produits_boutique.push(row);
          return row.id || row.code;
        }),
        get: vi.fn(async (code) => memoryDB.produits_boutique.find((p) => p.code === code || p.id === code) || null),
        update: vi.fn(async (id, changes) => {
          const p = memoryDB.produits_boutique.find((x) => x.id === id || x.code === id);
          if (p) Object.assign(p, changes);
          return 1;
        }),
        toArray: vi.fn(async () => [...memoryDB.produits_boutique]),
        bulkPut: vi.fn(async (rows) => {
          rows.forEach((r) => {
            const idx = memoryDB.produits_boutique.findIndex((p) => p.code === r.code);
            if (idx >= 0) memoryDB.produits_boutique[idx] = r;
            else memoryDB.produits_boutique.push(r);
          });
        }),
        count: vi.fn(async () => memoryDB.produits_boutique.length),
        clear: vi.fn(async () => { memoryDB.produits_boutique = []; }),
      },
      ventes_boutique: {
        put: vi.fn(async (row) => {
          memoryDB.ventes_boutique.push(row);
          return row.id;
        }),
        where: vi.fn((col) => ({
          equals: vi.fn((val) => ({
            toArray: vi.fn(async () => memoryDB.ventes_boutique.filter((r) => r[col] === val)),
          })),
        })),
        toArray: vi.fn(async () => [...memoryDB.ventes_boutique]),
        clear: vi.fn(async () => { memoryDB.ventes_boutique = []; }),
      },
      rapports_depotage: {
        put: vi.fn(async (row) => {
          memoryDB.rapports_depotage.push(row);
          return row.id;
        }),
        where: vi.fn((col) => ({
          equals: vi.fn((val) => ({
            reverse: vi.fn(() => ({
              sortBy: vi.fn(async () =>
                memoryDB.rapports_depotage.filter((r) => r[col] === val)
              ),
            })),
          })),
        })),
        toArray: vi.fn(async () => [...memoryDB.rapports_depotage]),
        clear: vi.fn(async () => { memoryDB.rapports_depotage = []; }),
      },
      jauges_cuves: {
        put: vi.fn(async (row) => {
          const idx = memoryDB.jauges_cuves.findIndex((j) => j.id === row.id || (j.station_id === row.station_id && j.produit === row.produit));
          if (idx >= 0) memoryDB.jauges_cuves[idx] = row;
          else memoryDB.jauges_cuves.push(row);
          return row.id;
        }),
        where: vi.fn((col) => ({
          equals: vi.fn((val) => ({
            reverse: vi.fn(() => ({
              sortBy: vi.fn(async () =>
                memoryDB.jauges_cuves.filter((r) => r[col] === val)
              ),
            })),
          })),
        })),
        toArray: vi.fn(async () => [...memoryDB.jauges_cuves]),
        clear: vi.fn(async () => { memoryDB.jauges_cuves = []; }),
      },
      livraisons: {
        put: vi.fn(async (row) => row),
      },
      queue: {
        add: vi.fn(async (row) => {
          memoryDB.queue.push(row);
          return memoryDB.queue.length;
        }),
        count: vi.fn(async () => memoryDB.queue.length),
        clear: vi.fn(async () => { memoryDB.queue = []; }),
      },
      audit_logs: {
        put: vi.fn(async () => {}),
      },
    },
    ensureLocalSeed: vi.fn(),
    getLocalRef: vi.fn(async () => referentielFromSeed()),
    setLocalRef: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
  };
});

describe("Audit de Cohérence Globale & Interactions Multi-Utilisateurs", () => {
  const ref = referentielFromSeed();

  beforeEach(() => {
    memoryDB.operations_credit = [];
    memoryDB.produits_boutique = [];
    memoryDB.ventes_boutique = [];
    memoryDB.rapports_depotage = [];
    memoryDB.jauges_cuves = [];
    memoryDB.queue = [];
  });

  describe("1. Matrice des Rôles & Sécurité d'Accès (RBAC)", () => {
    it("chaque rôle dispose d'un intitulé officiel et d'un compte de démonstration", () => {
      ALL_ROLES.forEach((r) => {
        expect(ROLE_LABELS[r]).toBeDefined();
        expect(typeof ROLE_LABELS[r]).toBe("string");
      });
      // Vérifier que commercial existe dans demo users
      const commUser = DEMO_USERS.find((u) => u.role === "commercial");
      expect(commUser).toBeDefined();
      expect(commUser.email).toContain("commercial");
    });

    it("vérifie les autorisations de routage pour le rôle commercial", () => {
      expect(rolesRoute("commercial", "/clients-pro")).toBe(true);
      expect(rolesRoute("commercial", "/fidelite")).toBe(true);
      expect(rolesRoute("commercial", "/parametres")).toBe(false);
      expect(rolesRoute("commercial", "/finance")).toBe(false);
    });

    it("vérifie les autorisations pour le rôle pompiste", () => {
      expect(rolesRoute("pompiste", "/descente")).toBe(true);
      expect(rolesRoute("pompiste", "/fidelite")).toBe(true);
      expect(rolesRoute("pompiste", "/rapport")).toBe(false);
      expect(rolesRoute("pompiste", "/parametres")).toBe(false);
    });

    it("vérifie les autorisations pour le responsable stock", () => {
      expect(rolesRoute("stock", "/cuves")).toBe(true);
      expect(rolesRoute("stock", "/stocks")).toBe(true);
      expect(rolesRoute("stock", "/finance")).toBe(false);
    });

    it("vérifie le cycle de validation d'un rapport journalier", () => {
      expect(peutSoumettreRapport("gerant")).toBe(true);
      expect(peutSoumettreRapport("pompiste")).toBe(false);
      expect(peutValiderRapport("superviseur")).toBe(true);
      expect(peutValiderRapport("directeur")).toBe(true);
      expect(peutValiderRapport("gerant")).toBe(false);
    });
  });

  describe("2. Flux de Données Terrain : Pompiste (Bons) ➔ Compte Client Pro", () => {
    it("l'enregistrement d'un bon d'encaissement met à jour la dette du client et son crédit disponible", async () => {
      const { saveOperationCredit, listOperationsCredit, soldeClient } = await import("../src/lib/api.js");
      const clientCode = "CP-ITS";
      const plafond = 3500000;

      // 1. Initialement, le client a un solde nul
      const initialSolde = await soldeClient(clientCode);
      expect(initialSolde).toBe(0);

      // 2. Un pompiste consigne un bon de 150 000 F pris par un camion de CP-ITS
      await saveOperationCredit({
        client_code: clientCode,
        station_id: "st-hann",
        date_op: "2026-09-25",
        matricule: "Bon 9012 - Camion SD-4501-AA",
        volume_l: 200,
        valeur_cons: 150000,
        depot: 0,
      });

      // 3. Vérifier que l'opération est consignée
      const opsApresBon = await listOperationsCredit(clientCode);
      expect(opsApresBon.length).toBe(1);
      expect(opsApresBon[0].valeur_cons).toBe(150000);

      // 4. Le solde du client devient négatif (-150 000 F de dette)
      const soldeApresBon = await soldeClient(clientCode);
      expect(soldeApresBon).toBe(-150000);

      const dette = Math.max(0, -soldeApresBon);
      const creditRestant = plafond + soldeApresBon;
      expect(dette).toBe(150000);
      expect(creditRestant).toBe(3350000);

      // 5. Le client effectue un virement ou règlement de 100 000 F
      await saveOperationCredit({
        client_code: clientCode,
        station_id: "st-hann",
        date_op: "2026-09-26",
        matricule: "Règlement VIREMENT - VR-7782",
        volume_l: 0,
        valeur_cons: 0,
        depot: 100000,
      });

      // 6. La dette est réduite à 50 000 F et le disponible remonte à 3 450 000 F
      const soldeFinal = await soldeClient(clientCode);
      expect(soldeFinal).toBe(-50000);
      expect(plafond + soldeFinal).toBe(3450000);
    });
  });

  describe("3. Flux Boutique : Ventes ➔ Décrémentation Stock", () => {
    it("une vente boutique décrémente instantanément le stock produit", async () => {
      const { createVenteBoutique, listProduitsBoutique } = await import("../src/lib/api.js");
      const stationId = "st-hann";

      // Seed un produit boutique en mémoire
      memoryDB.produits_boutique.push({
        id: "HUILE-FREIN-DOT4",
        code: "HUILE-FREIN-DOT4",
        designation: "Liquide de frein DOT 4 (500ml)",
        categorie: "Entretien",
        prix_vente: 2500,
        prix_achat: 1600,
        stock: 20,
        seuil_alerte: 4,
        station_id: stationId,
      });

      // Vérifier le stock initial
      const initialProds = await listProduitsBoutique(stationId);
      const prodInit = initialProds.find((p) => p.code === "HUILE-FREIN-DOT4");
      expect(prodInit.stock).toBe(20);

      // Effectuer une vente de 3 unités
      await createVenteBoutique({
        station_id: stationId,
        date: "2026-09-25",
        total_montant: 7500,
        mode_paiement: "ESPECES",
        vendeur: "Fatou Ndiaye",
        lignes: [
          { code: "HUILE-FREIN-DOT4", designation: "Liquide de frein DOT 4", quantite: 3, prix_unitaire: 2500, montant_total: 7500 },
        ],
      });

      // Vérifier le stock décrémenté à 17
      const prodsApres = await listProduitsBoutique(stationId);
      const prodApres = prodsApres.find((p) => p.code === "HUILE-FREIN-DOT4");
      expect(prodApres.stock).toBe(17);
    });
  });

  describe("4. Flux Dépotage : Réception Citerne ➔ Rapprochement & Jauges", () => {
    it("le rapport de dépotage consigne l'écart BL vs Réception et met à jour la jauge physique", async () => {
      const { saveRapportDepotage, listJaugesCuves, listRapportsDepotage } = await import("../src/lib/api.js");
      const stationId = "st-hann";
      const rapportDepotage = {
        station_id: stationId,
        date: "2026-09-25",
        heure_debut: "10:00",
        heure_fin: "11:30",
        produit: "GASOIL",
        numero_bl: "BL-SAR-2026-990",
        fournisseur: "SAR (Société Africaine de Raffinage)",
        transporteur: "STT Sénégal",
        immatriculation_camion: "DK-8821-AA",
        volume_bl: 15000,
        hauteur_avant_cm: 80,
        jauge_avant_litres: 8000,
        hauteur_apres_cm: 230,
        jauge_apres_litres: 22950,
        volume_decharge_reel: 14950,
        ecart_depotage_l: -50, // 14950 - 15000 = -50 L (perte/coulage normal < 0.5%)
        taux_ecart_pct: -0.33,
        presence_eau: false,
        hauteur_eau_cm: 0,
        densite_mesuree: 0.835,
        temperature_c: 29,
        conforme: true,
        receptionnaire_nom: "Ibrahima Sarr",
        chauffeur_nom: "Mamadou Sow",
      };

      const res = await saveRapportDepotage(rapportDepotage);
      expect(res.ok).toBe(true);

      // Vérifier que le rapport de dépotage est bien consigné
      const raps = await listRapportsDepotage(stationId);
      expect(raps.length).toBe(1);
      expect(raps[0].numero_bl).toBe("BL-SAR-2026-990");

      // Vérifier que la jauge a été mise à jour à 22 950 L
      const jauges = await listJaugesCuves(stationId);
      const jaugeGasoil = jauges.find((j) => j.produit === "GASOIL");
      expect(jaugeGasoil).toBeDefined();
      expect(jaugeGasoil.volume_physique).toBe(22950);
    });
  });

  describe("5. Programme de Fidélité : Barèmes & Attribution", () => {
    it("calcule exactement les points selon la nature de la dépense", () => {
      // 1. Carburant en litres : 1 pt par Litre
      expect(calculerPointsFidelite("CARBURANT_LITRES", 45)).toBe(45);
      expect(calculerPointsFidelite("CARBURANT_LITRES", 72.5)).toBe(73);

      // 2. Carburant en montant : 10 pts pour 1 000 FCFA (soit 1 pt / 100 FCFA)
      expect(calculerPointsFidelite("CARBURANT_MONTANT", 25000)).toBe(250);

      // 3. Lavage : 15 pts pour 1 000 FCFA
      expect(calculerPointsFidelite("LAVAGE", 3500)).toBe(52);

      // 4. Boutique : 10 pts pour 1 000 FCFA
      expect(calculerPointsFidelite("BOUTIQUE", 5000)).toBe(50);
    });
  });

  describe("6. Synthèse Comptable du Rapport Journalier", () => {
    it("consolide fidèlement toutes les recettes, dépenses et calcule l'écart de caisse", () => {
      const rap = rapportVide(ref, "HANN", "2026-09-25", "Gérant Hann");

      // Ventes carburant : 1000 L de Gasoil (755 F = 755 000 F)
      rap.pistolets.gasoil1 = { depart: 10000, fin: 11000 };

      // Recettes annexes
      rap.lavage = 35000;
      rap.boutique = 50000;
      rap.tickets = 100000; // 100 000 F de bons clients pro
      rap.depenses = [
        { categorie: "Transport", libelle: "Taxi équipe", montant: 5000 },
        { categorie: "Fournitures", libelle: "Papier thermique", montant: 10000 },
      ]; // Total dépenses = 15 000 F

      // Versements espèces effectués en banque :
      // Total à verser = CA total (755 000 + 35 000 + 50 000 = 840 000 F) - Tickets (100 000 F) - Dépenses (15 000 F) = 725 000 F
      rap.versements = [500000, 225000, "", "", ""];

      const c = calculer(rap, ref);

      expect(c.caCarburant).toBe(755000);
      expect(c.caTotal).toBe(840000);
      expect(c.depenses).toBe(15000);
      expect(c.aVerser).toBe(725000);
      expect(c.bis).toBe(725000);
      expect(c.ecart).toBe(0); // Caisse parfaitement équilibrée !
    });
  });
});
