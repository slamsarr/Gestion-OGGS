import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPut = vi.fn();
const mockQueueAdd = vi.fn();

vi.mock("../src/lib/supabase", () => ({
  getSupabase: vi.fn(() => null),
}));

vi.mock("../src/lib/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    db: {
      depenses: { put: mockPut },
      sessions_urssaf: { put: mockPut },
      queue: { add: mockQueueAdd },
      audit_logs: { put: vi.fn() },
    },
    ensureLocalSeed: vi.fn(),
    getLocalRef: vi.fn(),
    setLocalRef: vi.fn(),
    isCloudConfigured: vi.fn(() => false),
  };
});

describe("saveMetierRow (mode offline)", () => {
  beforeEach(() => {
    mockPut.mockClear();
    mockQueueAdd.mockClear();
  });

  it("enregistre une dépense localement sans cloud", async () => {
    const { saveMetierRow } = await import("../src/lib/api.js");
    const res = await saveMetierRow("depenses", {
      station_id: "st-hann",
      montant: 5000,
      date_depense: "2026-09-18",
    });
    expect(res.ok).toBe(true);
    expect(res.row.montant).toBe(5000);
    expect(res.row.id).toBeTruthy();
    expect(mockPut).toHaveBeenCalledOnce();
    expect(mockQueueAdd).not.toHaveBeenCalled();
  });

  it("enregistre une session caisse dans sessions_urssaf (Dexie)", async () => {
    const { saveMetierRow } = await import("../src/lib/api.js");
    await saveMetierRow("sessions_caisse", {
      station_id: "st-hann",
      date_session: "2026-09-18",
    });
    expect(mockPut).toHaveBeenCalledOnce();
  });
});
