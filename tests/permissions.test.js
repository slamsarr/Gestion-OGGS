import { describe, it, expect } from "vitest";
import { peutSupprimerRapport, peutSoumettreRapport, peutValiderRapport, rolesRoute, ROLE_LABELS } from "../src/lib/permissions.js";

describe("Permissions rôles", () => {
  it("expose un libellé pour chaque rôle", () => {
    expect(ROLE_LABELS.gerant).toBe("Gérant");
    expect(ROLE_LABELS.directeur).toBe("Directeur");
    expect(ROLE_LABELS.superviseur).toBe("Superviseur");
    expect(ROLE_LABELS.comptable).toBe("Comptable");
    expect(ROLE_LABELS.admin).toBe("Administrateur");
  });

  it("admin supprime tout brouillon/rejeté, jamais un validé", () => {
    expect(peutSupprimerRapport("admin", "BROUILLON", "HANN", "")).toBe(true);
    expect(peutSupprimerRapport("admin", "REJETE", "PK10", "")).toBe(true);
    expect(peutSupprimerRapport("admin", "VALIDE", "HANN", "")).toBe(false);
  });

  it("un rapport validé ou soumis n'est pas supprimable", () => {
    expect(peutSupprimerRapport("directeur", "VALIDE", "HANN", "")).toBe(false);
    expect(peutSupprimerRapport("superviseur", "SOUMIS", "HANN", "")).toBe(false);
  });

  it("directeur et superviseur suppriment tout brouillon/rejeté", () => {
    expect(peutSupprimerRapport("directeur", "BROUILLON", "HANN", "")).toBe(true);
    expect(peutSupprimerRapport("superviseur", "REJETE", "PK10", "")).toBe(true);
  });

  it("gérant supprime seulement son propre brouillon/rejeté", () => {
    expect(peutSupprimerRapport("gerant", "BROUILLON", "HANN", "HANN")).toBe(true);
    expect(peutSupprimerRapport("gerant", "REJETE", "HANN", "HANN")).toBe(true);
    expect(peutSupprimerRapport("gerant", "BROUILLON", "PK10", "HANN")).toBe(false);
    expect(peutSupprimerRapport("gerant", "SOUMIS", "HANN", "HANN")).toBe(false);
    expect(peutSupprimerRapport("comptable", "BROUILLON", "HANN", "")).toBe(false);
  });

  it("soumission réservée au gérant, validation au superviseur/directeur", () => {
    expect(peutSoumettreRapport("gerant")).toBe(true);
    expect(peutSoumettreRapport("superviseur")).toBe(false);
    expect(peutValiderRapport("superviseur")).toBe(true);
    expect(peutValiderRapport("directeur")).toBe(true);
    expect(peutValiderRapport("gerant")).toBe(false);
  });

  it("admin soumet et valide (plein pouvoir)", () => {
    expect(peutSoumettreRapport("admin")).toBe(true);
    expect(peutValiderRapport("admin")).toBe(true);
  });

  it("accorde l'accès aux routes selon le rôle", () => {
    expect(rolesRoute("directeur", "/parametres")).toBe(true);
    expect(rolesRoute("gerant", "/parametres")).toBe(false);
    expect(rolesRoute("comptable", "/finance")).toBe(true);
    expect(rolesRoute("gerant", "/finance")).toBe(false);
    expect(rolesRoute("gerant", "/rapport")).toBe(true);
    expect(rolesRoute("admin", "/parametres")).toBe(true);
    expect(rolesRoute("admin", "/finance")).toBe(true);
    expect(rolesRoute("admin", "/rapport")).toBe(true);
  });
});