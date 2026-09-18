import { describe, it, expect } from "vitest";
import {
  dexieTable,
  cloudTable,
  parseQueueMetierOp,
  TABLES_CLOUD_METIER,
  TABLES_OPS_CLOUD,
} from "../src/lib/metier-sync.js";

describe("metier-sync helpers", () => {
  it("mappe sessions_caisse vers sessions_urssaf en local", () => {
    expect(dexieTable("sessions_caisse")).toBe("sessions_urssaf");
    expect(dexieTable("depenses")).toBe("depenses");
  });

  it("résout les tables cloud Vague 1b et Vague 2", () => {
    expect(cloudTable("clients_pro")).toBe("clients_professionnels");
    expect(cloudTable("achats")).toBe("achats_carburant");
    expect(cloudTable("descentes")).toBe("descentes_pompistes");
    expect(cloudTable("jauges_cuves")).toBe("jauges_cuves_ops");
  });

  it("parse les opérations de file d'attente métier", () => {
    expect(parseQueueMetierOp("upsert_depenses")).toEqual({ action: "upsert", table: "depenses" });
    expect(parseQueueMetierOp("delete_clients_pro")).toEqual({ action: "delete", table: "clients_pro" });
    expect(parseQueueMetierOp("upsert_rapport")).toBeNull();
  });

  it("couvre toutes les tables cloud déclarées", () => {
    expect(Object.keys(TABLES_CLOUD_METIER).length).toBeGreaterThanOrEqual(9);
    expect(Object.keys(TABLES_OPS_CLOUD).length).toBeGreaterThanOrEqual(5);
  });
});
