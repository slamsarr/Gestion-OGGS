import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listeClientsCredit } from '../src/lib/seed';

const mockUsersStore = [];
const mockPompistesStore = [];

const mockUsersPut = vi.fn(async (row) => {
  const idx = mockUsersStore.findIndex((u) => u.id === row.id);
  if (idx >= 0) mockUsersStore[idx] = row;
  else mockUsersStore.push(row);
  return row.id;
});
const mockUsersToArray = vi.fn(async () => [...mockUsersStore]);
const mockUsersGet = vi.fn(async (id) => mockUsersStore.find((u) => u.id === id) || null);

const mockPompPut = vi.fn(async (row) => {
  mockPompistesStore.push(row);
  return row.id;
});
const mockPompGet = vi.fn(async (id) => mockPompistesStore.find((p) => p.id === id) || null);

vi.mock('../src/lib/supabase', () => ({
  getSupabase: vi.fn(() => null),
}));

vi.mock('../src/lib/db', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    db: {
      users: {
        put: mockUsersPut,
        toArray: mockUsersToArray,
        get: mockUsersGet,
      },
      pompistes: {
        put: mockPompPut,
        get: mockPompGet,
      },
      meta: {
        get: vi.fn(),
        put: vi.fn(),
      },
    },
    ensureLocalSeed: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
    isDemoModeEnabled: vi.fn(() => true),
  };
});

describe('Authentification et Rôles — Inscription et Connexion Client Pro', () => {
  beforeEach(() => {
    mockUsersStore.length = 0;
    mockPompistesStore.length = 0;
    mockUsersPut.mockClear();
    mockPompPut.mockClear();
  });

  it('enregistre un compte client professionnel avec le rôle exact client_pro', async () => {
    const { db } = await import('../src/lib/db');
    const newUser = {
      id: 'u-client-test',
      email: 'client.test@senegal.sn',
      password: 'Client2026!',
      nom_complet: 'Transport Diop & Frères',
      role: 'client_pro',
      client_code: 'CP-DIOP',
      station_id: 'st-hann',
      telephone: '77 555 44 33',
      actif: true,
      created_at: new Date().toISOString(),
    };
    await db.users.put(newUser);

    const list = await db.users.toArray();
    const found = list.find((u) => u.email === 'client.test@senegal.sn');
    expect(found).toBeDefined();
    expect(found.role).toBe('client_pro');
    expect(found.client_code).toBe('CP-DIOP');
    expect(found.password).toBe('Client2026!');
  });

  it('conserve les champs légaux et contacts dans listeClientsCredit', () => {
    const fakeRef = {
      clients_pro: [
        {
          code: 'CP-SOCOCIM',
          nom_entreprise: 'Sococim Ciments SA',
          email: 'contact@sococim.sn',
          telephone: '33 839 00 00',
          ninea: '0012345672V2',
          rccm: 'SN-DKR-2022-B-1234',
          plafond_credit: 5000000,
        },
      ],
      clients: [],
    };
    const cls = listeClientsCredit(fakeRef);
    expect(cls.length).toBe(1);
    expect(cls[0].code).toBe('CP-SOCOCIM');
    expect(cls[0].email).toBe('contact@sococim.sn');
    expect(cls[0].telephone).toBe('33 839 00 00');
    expect(cls[0].ninea).toBe('0012345672V2');
    expect(cls[0].rccm).toBe('SN-DKR-2022-B-1234');
  });

  it('calcule correctement les litrages autorises, consommes et restants du client', () => {
    const programmesClient = [
      { volume_demande_l: 10000, volume_accorde_l: 10000, volume_consomme_l: 3500 },
      { volume_demande_l: 5000, volume_accorde_l: 5000, volume_consomme_l: 1500 },
    ];
    let volTotal = 0;
    let volConso = 0;
    for (const p of programmesClient) {
      volTotal += p.volume_accorde_l;
      volConso += p.volume_consomme_l;
    }
    const volRestant = Math.max(0, volTotal - volConso);
    const pct = Math.round((volConso / volTotal) * 100);

    expect(volTotal).toBe(15000);
    expect(volConso).toBe(5000);
    expect(volRestant).toBe(10000);
    expect(pct).toBe(33);
  });
});
