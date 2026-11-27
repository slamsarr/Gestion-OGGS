import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  STATUTS_PROGRAMME,
  MODES_GESTION,
  genererNumeroProgramme,
  calculerSyntheseProgramme,
  verifierEligibiliteDistribution,
} from "../src/lib/programmes-bons";

const mockProgrammesStore = [];
const mockConsommationsStore = [];
const mockClientsProStore = [];
const mockUsersStore = [];
const mockBonsStore = [];

vi.mock("../src/lib/supabase", () => ({
  getSupabase: vi.fn(() => null),
  isCloudConfigured: vi.fn(() => false),
}));

vi.mock("../src/lib/db", () => {
  return {
    db: {
      programmes_bons: {
        get: vi.fn(async (id) => mockProgrammesStore.find((p) => p.id === id) || null),
        put: vi.fn(async (row) => {
          const idx = mockProgrammesStore.findIndex((p) => p.id === row.id);
          if (idx >= 0) mockProgrammesStore[idx] = row;
          else mockProgrammesStore.push(row);
          return row.id;
        }),
        toArray: vi.fn(async () => [...mockProgrammesStore]),
        where: vi.fn((field) => ({
          equals: (val) => ({
            toArray: async () => mockProgrammesStore.filter((p) => p[field] === val),
            first: async () => mockProgrammesStore.find((p) => p[field] === val) || null,
          }),
        })),
      },
      consommations_programmes: {
        put: vi.fn(async (row) => {
          mockConsommationsStore.push(row);
          return row.id;
        }),
        toArray: vi.fn(async () => [...mockConsommationsStore]),
        where: vi.fn((field) => ({
          equals: (val) => ({
            toArray: async () => mockConsommationsStore.filter((c) => c[field] === val),
            first: async () => mockConsommationsStore.find((c) => c[field] === val) || null,
          }),
        })),
      },
      clients_pro: {
        get: vi.fn(async (code) => mockClientsProStore.find((c) => c.code === code) || null),
        put: vi.fn(async (row) => {
          const idx = mockClientsProStore.findIndex((c) => c.code === row.code);
          if (idx >= 0) mockClientsProStore[idx] = row;
          else mockClientsProStore.push(row);
          return row.code;
        }),
        toArray: vi.fn(async () => [...mockClientsProStore]),
      },
      users: {
        put: vi.fn(async (row) => {
          mockUsersStore.push(row);
          return row.id;
        }),
        where: vi.fn((field) => ({
          equals: (val) => ({
            toArray: async () => mockUsersStore.filter((u) => u[field] === val),
          }),
        })),
      },
      bons_carburant: {
        get: vi.fn(async (id) => mockBonsStore.find((b) => b.id === id) || null),
        put: vi.fn(async (b) => {
          const idx = mockBonsStore.findIndex((x) => x.id === b.id);
          if (idx >= 0) mockBonsStore[idx] = b;
          else mockBonsStore.push(b);
          return b.id;
        }),
        where: vi.fn(() => ({
          equals: () => ({
            toArray: async () => [],
            first: async () => null,
          }),
        })),
      },
      operations_credit: {
        put: vi.fn(async () => {}),
      },
      audit_logs: {
        put: vi.fn(async () => {}),
      },
    },
    ensureLocalSeed: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
  };
});

// Import API après vi.mock
import {
  createClientPro,
  createProgrammeBons,
  getProgrammeBons,
  updateProgrammeBons,
  listProgrammesBons,
  imputerConsommationProgramme,
  listConsommationsProgramme,
  syncBonsFromDescente,
  creerAccesClientPro,
} from "../src/lib/api";

describe("Module B2B — Programmes de Bons de Carburant & Flotte Transporteurs", () => {
  beforeEach(() => {
    mockProgrammesStore.length = 0;
    mockConsommationsStore.length = 0;
    mockClientsProStore.length = 0;
    mockUsersStore.length = 0;
    mockBonsStore.length = 0;
  });

  describe("1. Référentiel & Métier Programmes de Bons", () => {
    it("définit bien les 11 statuts de cycle de vie et les 2 modes de gestion", () => {
      expect(Object.keys(STATUTS_PROGRAMME)).toEqual([
        "BROUILLON",
        "EN_ATTENTE",
        "INFO_DEMANDEE",
        "A_CORRIGER",
        "VALIDE",
        "ACTIF",
        "SUSPENDU",
        "EPUISE",
        "EXPIRE",
        "REFUSE",
        "CLOTURE",
      ]);
      expect(MODES_GESTION.VOLUME_GLOBAL.code).toBe("VOLUME_GLOBAL");
      expect(MODES_GESTION.PLAFONDS_INDIVIDUELS.code).toBe("PLAFONDS_INDIVIDUELS");
    });

    it("génère des numéros de programme uniques et normalisés PRG-YYYY-XXXX", () => {
      const num1 = genererNumeroProgramme();
      const num2 = genererNumeroProgramme();
      expect(num1).toMatch(/^PRG-\d{4}-\d{4}$/);
      expect(num2).toMatch(/^PRG-\d{4}-\d{4}$/);
      expect(num1).not.toBe(num2);
    });

    it("calcule la synthèse d'un programme avec pourcentages et alertes", () => {
      const programme = {
        volume_autorise: 1000,
        volume_consomme: 400,
        date_debut: "2026-01-01",
        date_fin: "2026-12-31",
        statut: "ACTIF",
        mode_gestion: "PLAFONDS_INDIVIDUELS",
        transporteurs: [
          { id: "t1", nom_prenom: "Mamadou Fall", volume_autorise: 600, volume_consomme: 300 },
          { id: "t2", nom_prenom: "Ousmane Diallo", volume_autorise: 400, volume_consomme: 100 },
        ],
      };

      const synthese = calculerSyntheseProgramme(programme);
      expect(synthese.volume_total).toBe(1000);
      expect(synthese.volume_consomme).toBe(400);
      expect(synthese.volume_restant).toBe(600);
      expect(synthese.pourcentage_consomme).toBe(40);
      expect(synthese.nb_transporteurs).toBe(2);
      expect(synthese.est_epuise).toBe(false);
      expect(synthese.est_expire).toBe(false);
    });

    it("vérifie l'éligibilité d'une distribution à la pompe (Anti-dépassement)", () => {
      const programmeActif = {
        id: "prg-1",
        numero_programme: "PRG-2026-0001",
        statut: "ACTIF",
        type_carburant: "GASOIL",
        mode_gestion: "PLAFONDS_INDIVIDUELS",
        volume_autorise: 500,
        volume_consomme: 400, // Reste 100 L
        date_debut: "2026-01-01",
        date_fin: "2026-12-31",
        transporteurs: [
          { id: "t1", nom_prenom: "Amadou", carburant: "GASOIL", volume_autorise: 300, volume_consomme: 250 }, // Reste 50 L
        ],
      };

      // Cas 1 : Distribution valide de 40 L
      const resValide = verifierEligibiliteDistribution(programmeActif, "t1", 40, "GASOIL");
      expect(resValide.eligible).toBe(true);
      expect(resValide.nouveau_solde).toBe(60);

      // Cas 2 : Dépassement du quota individuel du transporteur (demande 60L alors qu'il lui reste 50L)
      const resTropTransp = verifierEligibiliteDistribution(programmeActif, "t1", 60, "GASOIL");
      expect(resTropTransp.eligible).toBe(false);
      expect(resTropTransp.erreur).toContain("Plafond individuel dépassé");

      // Cas 3 : Mauvais carburant (veut du SUPER au lieu de GASOIL)
      const resCarb = verifierEligibiliteDistribution(programmeActif, "t1", 20, "SUPER");
      expect(resCarb.eligible).toBe(false);
      expect(resCarb.erreur).toContain("Carburant non autorisé");

      // Cas 4 : Programme suspendu
      const programmeSuspendu = { ...programmeActif, statut: "SUSPENDU" };
      const resSusp = verifierEligibiliteDistribution(programmeSuspendu, "t1", 10, "GASOIL");
      expect(resSusp.eligible).toBe(false);
      expect(resSusp.erreur).toContain("statut SUSPENDU");
    });
  });

  describe("2. Création des comptes clients professionnels avec données légales et accès", () => {
    it("crée un compte client pro complet avec NINEA, RCCM et contacts détaillés", async () => {
      const clientPayload = {
        code: "CP-DANGOTE",
        nom_entreprise: "Dangote Cement Senegal SA",
        nom_commercial: "Dangote Ciment",
        ninea: "0012987652V3",
        rccm: "SN-DKR-2023-B-9988",
        adresse: "Pout, Région de Thiès",
        ville: "Thiès",
        telephone: "33 800 00 00",
        email: "flotte@dangote.sn",
        representant_legal_nom: "M. Dangote Rep",
        representant_legal_contact: "77 111 22 33",
        responsable_compte_nom: "Ibrahima Ba",
        responsable_compte_contact: "78 444 55 66",
        responsable_financier_nom: "Fatou Ndiaye",
        responsable_financier_contact: "fatou@dangote.sn",
        infos_complementaires: "Facturation groupée fin de quinzaine",
        plafond_credit: 25000000,
        station_id: "st-hann",
      };

      const res = await createClientPro(clientPayload);
      expect(res.ok).toBe(true);
      expect(res.client.code).toBe("CP-DANGOTE");
      expect(res.client.ninea).toBe("0012987652V3");
      expect(res.client.responsable_compte_nom).toBe("Ibrahima Ba");

      // Création des identifiants d'accès sécurisé
      const accRes = await creerAccesClientPro({
        client: res.client,
        password: "TempPassword2026!",
        station_id: "st-hann",
      });
      expect(accRes.ok).toBe(true);
      expect(mockUsersStore.length).toBe(1);
      expect(mockUsersStore[0].role).toBe("client_pro");
      expect(mockUsersStore[0].client_code).toBe("CP-DANGOTE");
    });
  });

  describe("3. Demande, instruction et validation d'un programme de bons", () => {
    it("permet au client de soumettre une demande avec flotte transporteurs", async () => {
      const demande = {
        client_code: "CP-DANGOTE",
        client_nom: "Dangote Cement Senegal SA",
        station_id: "st-hann",
        objet: "Approvisionnement mensuel camions livraisons",
        type_carburant: "GASOIL",
        volume_demande: 15000,
        mode_gestion: "PLAFONDS_INDIVIDUELS",
        date_debut: "2026-06-01",
        date_fin: "2026-06-30",
        demandeur_nom: "Ibrahima Ba",
        statut: "EN_ATTENTE",
        transporteurs: [
          {
            id: "t-1",
            nom_prenom: "Modou Gueye",
            telephone: "77 555 11 22",
            immatriculation: "DK-9081-BA",
            type_vehicule: "CAMION",
            carburant: "GASOIL",
            volume_demande: 5000,
          },
          {
            id: "t-2",
            nom_prenom: "Samba Sy",
            telephone: "77 666 33 44",
            immatriculation: "DK-1022-BB",
            type_vehicule: "CAMION",
            carburant: "GASOIL",
            volume_demande: 10000,
          },
        ],
      };

      const res = await createProgrammeBons(demande);
      expect(res.ok).toBe(true);
      expect(res.programme.numero_programme).toMatch(/^PRG-\d{4}-\d{4}$/);
      expect(res.programme.statut).toBe("EN_ATTENTE");

      const progId = res.programme.id;

      // 4. Le gérant instruit la demande : il ajuste le volume à 12 000 L et valide
      const decisionGerant = {
        nouveau_statut: "ACTIF",
        volume_autorise: 12000,
        mode_gestion: "PLAFONDS_INDIVIDUELS",
        conditions_particulieres: "Plein uniquement entre 06h et 22h",
        instruction_par_nom: "Gérant Hann Mariste",
        motif: "Dossier et solvabilité validés",
        transporteurs: [
          {
            id: "t-1",
            nom_prenom: "Modou Gueye",
            immatriculation: "DK-9081-BA",
            type_vehicule: "CAMION",
            carburant: "GASOIL",
            volume_autorise: 4000,
            volume_consomme: 0,
          },
          {
            id: "t-2",
            nom_prenom: "Samba Sy",
            immatriculation: "DK-1022-BB",
            type_vehicule: "CAMION",
            carburant: "GASOIL",
            volume_autorise: 8000,
            volume_consomme: 0,
          },
        ],
      };

      const resUpdate = await updateProgrammeBons(progId, decisionGerant);
      expect(resUpdate.ok).toBe(true);

      const programmeValide = await getProgrammeBons(progId);
      expect(programmeValide.statut).toBe("ACTIF");
      expect(programmeValide.volume_autorise).toBe(12000);
      expect(programmeValide.volume_restant).toBe(12000);
      expect(programmeValide.historique_decisions.length).toBeGreaterThan(0);
    });
  });

  describe("4. Imputation automatique à la pompe via Descente de Caisse", () => {
    it("déduit le volume consommé lors de la descente et met à jour le solde du programme et du transporteur", async () => {
      // 1. Créer un programme actif avec 1000 Litres
      const progRes = await createProgrammeBons({
        client_code: "CP-DANGOTE",
        client_nom: "Dangote Cement Senegal SA",
        station_id: "st-hann",
        objet: "Flotte Test",
        type_carburant: "GASOIL",
        volume_demande: 1000,
        volume_autorise: 1000,
        volume_consomme: 0,
        volume_restant: 1000,
        mode_gestion: "PLAFONDS_INDIVIDUELS",
        statut: "ACTIF",
        transporteurs: [
          {
            id: "t-10",
            nom_prenom: "Chauffeur 10",
            immatriculation: "TH-3312-C",
            carburant: "GASOIL",
            volume_autorise: 400,
            volume_consomme: 0,
          },
        ],
      });

      const progId = progRes.programme.id;

      // 2. Simuler une descente de caisse avec un bon rattaché à ce programme
      const descente = {
        id: "desc-test-01",
        station_id: "st-hann",
        date: "2026-06-15",
        pompiste_nom: "Alioune Diop",
        bons: [
          {
            id: "bon-01",
            client_code: "CP-DANGOTE",
            client_nom: "Dangote Cement Senegal SA",
            numero_bon: "BON-DANGOTE-001",
            produit: "GASOIL",
            volume_litres: 150,
            montant: 113250, // 150 * 755
            observation: "Véhicule TH-3312-C",
            programme_id: progId,
            transporteur_id: "t-10",
            transporteur_nom: "Chauffeur 10",
          },
        ],
      };

      // 3. Exécution de la synchronisation des bons de la descente
      await syncBonsFromDescente(descente);

      // 4. Vérification que le programme a été décrémenté
      const progApres = await getProgrammeBons(progId);
      expect(progApres.volume_consomme).toBe(150);
      expect(progApres.volume_restant).toBe(850);

      // Vérification du quota transporteur
      const transp = progApres.transporteurs.find((t) => t.id === "t-10");
      expect(transp.volume_consomme).toBe(150);

      // 5. Vérification de la création de la ligne d'imputation dans consommations_programmes
      const consos = await listConsommationsProgramme({ programme_id: progId });
      expect(consos.length).toBe(1);
      expect(consos[0].volume_litres).toBe(150);
      expect(consos[0].bon_numero).toBe("BON-DANGOTE-001");
      expect(consos[0].pompiste_nom).toBe("Alioune Diop");
      expect(consos[0].transporteur_id).toBe("t-10");
    });
  });
});
