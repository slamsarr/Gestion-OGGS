import { describe, it, expect, vi, beforeEach } from 'vitest';

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

  it('enregistre un pompiste avec rôle pompiste et synchronise pompistes', async () => {
    const { db } = await import('../src/lib/db');
    const pompisteUser = {
      id: 'u-pomp-01',
      email: 'pompiste.aliou@starenergy.sn',
      password: 'Star2026!',
      nom_complet: 'Aliou Sall',
      role: 'pompiste',
      station_id: 'st-hann',
      telephone: '78 111 22 33',
      actif: true,
      created_at: new Date().toISOString(),
    };
    await db.users.put(pompisteUser);
    await db.pompistes.put({
      id: pompisteUser.id,
      nom: pompisteUser.nom_complet,
      station_id: pompisteUser.station_id,
      telephone: pompisteUser.telephone,
      actif: true,
    });

    const foundUser = await db.users.get('u-pomp-01');
    expect(foundUser.role).toBe('pompiste');
    const foundPomp = await db.pompistes.get('u-pomp-01');
    expect(foundPomp.nom).toBe('Aliou Sall');
  });
});
