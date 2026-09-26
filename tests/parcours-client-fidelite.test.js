import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocking storage for offline tests
const mockMembres = [
  {
    id: "mem-1",
    station_id: "st-hann",
    numero_carte: "FID-1001",
    nom: "Cheikh Ndiaye",
    nom_complet: "Cheikh Ndiaye",
    telephone: "77 123 45 67",
    immatriculation: "DK-5512-AB",
    points_solde: 1250,
    points_cumules: 1850,
    statut_palier: "Silver",
    date_adhesion: "2026-01-15",
    actif: true,
  },
];

const mockPut = vi.fn(async (row) => row);
const mockQueueAdd = vi.fn();

vi.mock("../src/lib/supabase", () => ({
  getSupabase: vi.fn(() => null),
}));

vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    db: {
      membres_fidelite: {
        get: vi.fn(async (id) => mockMembres.find((m) => m.id === id) || null),
        toArray: vi.fn(async () => [...mockMembres]),
        put: mockPut,
      },
      transactions_fidelite: {
        put: mockPut,
        toArray: vi.fn(async () => []),
      },
      recompenses_fidelite: {
        toArray: vi.fn(async () => []),
      },
      queue: { add: mockQueueAdd },
      audit_logs: { put: vi.fn() },
    },
    ensureLocalSeed: vi.fn(),
    getLocalRef: vi.fn(),
    setLocalRef: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
  };
});

describe("Parcours Client & Programme de Fidélité QR Code", () => {
  let calculerPointsFidelite, getMembreFidelite, saveMembreFidelite, crediterPointsFidelite;

  beforeEach(async () => {
    const api = await import("../src/lib/api.js");
    calculerPointsFidelite = api.calculerPointsFidelite;
    getMembreFidelite = api.getMembreFidelite;
    saveMembreFidelite = api.saveMembreFidelite;
    crediterPointsFidelite = api.crediterPointsFidelite;
    mockPut.mockClear();
    mockQueueAdd.mockClear();
  });

  // 1. Règle de cumul automatique (1 000 FCFA = 10 points)
  it("applique la règle de cumul : 1 000 FCFA dépensés = 10 points", () => {
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 1000)).toBe(10);
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 5000)).toBe(50);
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 10000)).toBe(100);
    expect(calculerPointsFidelite("CARBURANT_MONTANT", 25000)).toBe(250);
    expect(calculerPointsFidelite("BOUTIQUE", 10000)).toBe(100);
    expect(calculerPointsFidelite("LAVAGE", 10000)).toBe(150); // 15 pts pour 1000 FCFA
  });

  // 2. Identification client par QR Code (multi-formats)
  it("reconnaît un client par son ID, son tag QR 'STARFID:...', ou l'URL de son espace client", async () => {
    const membre = await getMembreFidelite("mem-1");
    expect(membre).not.toBeNull();
    expect(membre.id).toBe("mem-1");

    // Format QR scanné : STARFID:mem-1
    const membreParQr = await getMembreFidelite("STARFID:mem-1");
    expect(membreParQr).not.toBeNull();
    expect(membreParQr.id).toBe("mem-1");

    // Format URL scannée : https://station.sn/espace-fidelite?client=mem-1
    const membreParUrl = await getMembreFidelite("http://localhost:5173/espace-fidelite?client=mem-1");
    expect(membreParUrl).not.toBeNull();
    expect(membreParUrl.id).toBe("mem-1");

    // Format URL path : /espace-fidelite/mem-1
    const membreParPath = await getMembreFidelite("http://localhost:5173/espace-fidelite/mem-1");
    expect(membreParPath).not.toBeNull();
    expect(membreParPath.id).toBe("mem-1");

    // Format numéro de carte
    const membreParCarte = await getMembreFidelite("FID-1001");
    expect(membreParCarte).not.toBeNull();
    expect(membreParCarte.id).toBe("mem-1");

    // Format téléphone
    const membreParTel = await getMembreFidelite("77 123 45 67");
    expect(membreParTel).not.toBeNull();
    expect(membreParTel.id).toBe("mem-1");

    // Format matricule de véhicule
    const membreParVehicule = await getMembreFidelite("DK-5512-AB");
    expect(membreParVehicule).not.toBeNull();
    expect(membreParVehicule.id).toBe("mem-1");
  });

  // 3. Première visite : Création de profil avec matricule et points de bienvenue
  it("enrôle un nouveau client lors de sa première visite avec son véhicule et points offerts", async () => {
    const res = await saveMembreFidelite({
      nom: "Fatou Diop",
      telephone: "77 999 11 22",
      immatriculation: "DK-7890-ZZ",
      carburant_prefere: "GASOIL",
      points_solde: 100, // 100 points de bienvenue
    });

    expect(res.ok).toBe(true);
    expect(res.membre.nom).toBe("Fatou Diop");
    expect(res.membre.immatriculation).toBe("DK-7890-ZZ");
    expect(res.membre.points_solde).toBe(100);
    expect(res.membre.numero_carte).toMatch(/^FID-\d{4}-\d+/);
    expect(mockPut).toHaveBeenCalled();
  });

  // 4. Visites suivantes : Choix du Wallet, Paiement et Crédit automatique
  it("enregistre le paiement avec wallet (Wave, OM, Petrosen...) et crédite instantanément les points", async () => {
    // Membre existant mem-1 (solde initial 1250 pts)
    const pointsGagnes = calculerPointsFidelite("CARBURANT_MONTANT", 20000);
    expect(pointsGagnes).toBe(200);

    const creditRes = await crediterPointsFidelite({
      membre_id: "mem-1",
      station_id: "st-hann",
      type_operation: "CARBURANT",
      montant: 20000,
      points: pointsGagnes,
      mode_paiement: "WAVE",
      reference_piece: "WV-887711",
      notes: "Plein Gasoil Wave",
      created_by: "Borne Client",
    });

    expect(creditRes.ok).toBe(true);
    expect(creditRes.points_ajoutes).toBe(200);
    expect(creditRes.nouveau_solde).toBe(1450); // 1250 + 200
    expect(creditRes.transaction.mode_paiement).toBe("WAVE");
  });
});
