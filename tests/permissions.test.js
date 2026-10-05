import { describe, it, expect } from "vitest";
import {
  peutSupprimerRapport,
  peutSoumettreRapport,
  peutValiderRapport,
  rolesRoute,
  ROLE_LABELS,
  peutCorrigerDescente,
  peutVoirNav,
  peutAgir,
  peutAgirProfil,
} from "../src/lib/permissions.js";

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
    expect(rolesRoute("gerant", "/historique")).toBe(true);
    expect(rolesRoute("gerant", "/gerant")).toBe(true);
    expect(rolesRoute("admin", "/parametres")).toBe(true);
    expect(rolesRoute("admin", "/finance")).toBe(true);
    expect(rolesRoute("admin", "/rapport")).toBe(true);
  });

  it("verrouille la descente clôturée pour le pompiste, pas pour le gérant", () => {
    expect(peutCorrigerDescente("pompiste", "TERMINEE")).toBe(false);
    expect(peutCorrigerDescente("lavage", "TERMINEE")).toBe(false);
    expect(peutCorrigerDescente("gerant", "TERMINEE")).toBe(true);
    expect(peutCorrigerDescente("admin", "TERMINEE")).toBe(true);
    expect(peutCorrigerDescente("pompiste", "BROUILLON")).toBe(true);
  });

  it("masque le cockpit réseau aux métiers terrain", () => {
    expect(peutVoirNav("comptable", "/")).toBe(true);
    expect(peutVoirNav("gerant", "/")).toBe(false);
    expect(peutVoirNav("pompiste", "/")).toBe(false);
    expect(peutVoirNav("gerant", "/gerant")).toBe(true);
    expect(peutVoirNav("pompiste", "/descente")).toBe(true);
    expect(peutVoirNav("gerant", "/incidents")).toBe(false);
  });

  it("peutAgirProfil refuse un pompiste au débit fidélité et un gérant sur une autre station", () => {
    expect(peutAgir("pompiste", "fidelite", "crediter")).toBe(true);
    expect(peutAgir("pompiste", "fidelite", "debiter")).toBe(false);
    expect(peutAgirProfil({ role: "gerant", station_id: "st-hann" }, "depotage", "creer", "st-ndia")).toBe(false);
    expect(peutAgirProfil({ role: "gerant", station_id: "st-hann" }, "depotage", "creer", "st-hann")).toBe(true);
    expect(peutAgirProfil({ role: "stock", station_id: "st-hann" }, "stock", "ajuster")).toBe(true);
  });

  it("un rôle vide n'ouvre aucune route métier", () => {
    expect(rolesRoute("", "/gerant")).toBe(false);
    expect(rolesRoute(undefined, "/rapport")).toBe(false);
    expect(peutVoirNav("", "/")).toBe(false);
  });

  it("lavage pro — actions configurer, voir_rapports, gerer_bays", () => {
    // configurer : uniquement gerant/admin/superviseur/directeur
    expect(peutAgir("admin", "lavage", "configurer")).toBe(true);
    expect(peutAgir("gerant", "lavage", "configurer")).toBe(true);
    expect(peutAgir("directeur", "lavage", "configurer")).toBe(true);
    expect(peutAgir("lavage", "lavage", "configurer")).toBe(false);
    expect(peutAgir("pompiste", "lavage", "configurer")).toBe(false);
    // voir_rapports : inclut comptable
    expect(peutAgir("comptable", "lavage", "voir_rapports")).toBe(true);
    expect(peutAgir("gerant", "lavage", "voir_rapports")).toBe(true);
    expect(peutAgir("lavage", "lavage", "voir_rapports")).toBe(false);
    // gerer_bays : uniquement direction+gerant
    expect(peutAgir("gerant", "lavage", "gerer_bays")).toBe(true);
    expect(peutAgir("lavage", "lavage", "gerer_bays")).toBe(false);
    expect(peutAgir("boutique", "lavage", "gerer_bays")).toBe(false);
    // creer et annuler restent inchangés
    expect(peutAgir("lavage", "lavage", "creer")).toBe(true);
    expect(peutAgir("lavage", "lavage", "annuler")).toBe(false);
    expect(peutAgir("gerant", "lavage", "annuler")).toBe(true);
  });
});

