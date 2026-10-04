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
const mockUsersDelete = vi.fn(async (id) => {
  const idx = mockUsersStore.findIndex((u) => u.id === id);
  if (idx >= 0) mockUsersStore.splice(idx, 1);
});

const mockPompPut = vi.fn(async (row) => {
  mockPompistesStore.push(row);
  return row.id;
});
const mockPompToArray = vi.fn(async () => [...mockPompistesStore]);
const mockPompDelete = vi.fn(async (id) => {
  const idx = mockPompistesStore.findIndex((p) => p.id === id);
  if (idx >= 0) mockPompistesStore.splice(idx, 1);
});

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
        delete: mockUsersDelete,
      },
      pompistes: {
        put: mockPompPut,
        toArray: mockPompToArray,
        delete: mockPompDelete,
      },
    },
    ensureLocalSeed: vi.fn(),
  };
});

describe('Gestion Collaborateurs - Creation Automatique de Compte', () => {
  beforeEach(() => {
    mockUsersStore.length = 0;
    mockPompistesStore.length = 0;
    mockUsersPut.mockClear();
    mockPompPut.mockClear();
    mockUsersDelete.mockClear();
  });

  it('cree un pompiste avec generation automatique email et mot de passe', async () => {
    const { creerCollaborateur } = await import('../src/lib/api');
    const res = await creerCollaborateur({
      nom_complet: 'Moussa Diop',
      role: 'pompiste',
      station_id: 'st-hann',
      telephone: '77 123 45 67',
    });

    expect(res.ok).toBe(true);
    expect(res.user.nom_complet).toBe('Moussa Diop');
    expect(res.user.role).toBe('pompiste');
    expect(res.user.station_id).toBe('st-hann');
    expect(res.identifiants.email).toBe('moussa.diop@starenergy.sn');
    expect(res.identifiants.password).toBe('Star2026!');
    expect(mockUsersPut).toHaveBeenCalledTimes(1);
    expect(mockPompPut).toHaveBeenCalledTimes(1);
  });

  it('cree un agent de lavage sans l ajouter dans pompistes', async () => {
    const { creerCollaborateur } = await import('../src/lib/api');
    const res = await creerCollaborateur({
      nom_complet: 'Cheikh Fall',
      role: 'lavage',
      station_id: 'st-hann',
    });

    expect(res.ok).toBe(true);
    expect(res.user.role).toBe('lavage');
    expect(res.identifiants.email).toBe('cheikh.fall@starenergy.sn');
    expect(mockUsersPut).toHaveBeenCalledTimes(1);
    expect(mockPompPut).not.toHaveBeenCalled();
  });

  it('cree un vendeur boutique avec email personnalise', async () => {
    const { creerCollaborateur } = await import('../src/lib/api');
    const res = await creerCollaborateur({
      nom_complet: 'Amina Ba',
      role: 'boutique',
      email: 'amina.boutique@custom.sn',
      password: 'SecuredPassword2026!',
    });

    expect(res.ok).toBe(true);
    expect(res.user.role).toBe('boutique');
    expect(res.identifiants.email).toBe('amina.boutique@custom.sn');
    expect(res.identifiants.password).toBe('SecuredPassword2026!');
  });

  it('rejette la creation sans nom complet', async () => {
    const { creerCollaborateur } = await import('../src/lib/api');
    const res = await creerCollaborateur({
      nom_complet: '   ',
      role: 'pompiste',
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain('nom complet est obligatoire');
  });

  it('supprime un collaborateur et nettoie pompistes', async () => {
    const { creerCollaborateur, deleteCollaborateur } = await import('../src/lib/api');
    const res = await creerCollaborateur({
      nom_complet: 'Pompiste Test',
      role: 'pompiste',
    });

    expect(mockUsersStore).toHaveLength(1);
    expect(mockPompistesStore).toHaveLength(1);

    await deleteCollaborateur(res.user.id);
    expect(mockUsersDelete).toHaveBeenCalledWith(res.user.id);
  });
});