import { describe, it, expect } from "vitest";
import {
  formaterTelephoneWhatsApp,
  messageDistributionTransporteur,
  messageFactureOfficielle,
  emailFactureOfficielle,
} from "../src/lib/notifications-client";
import { F } from "../src/lib/calcul";

describe("Notifications Client — WhatsApp & Email (Distribution & Factures)", () => {
  describe("1. Formatage des numéros de téléphone", () => {
    it("convertit les numéros sénégalais locaux en format international 221...", () => {
      expect(formaterTelephoneWhatsApp("77 123 45 67")).toBe("221771234567");
      expect(formaterTelephoneWhatsApp("78-456-78-90")).toBe("221784567890");
      expect(formaterTelephoneWhatsApp("76 000 11 22")).toBe("221760001122");
      expect(formaterTelephoneWhatsApp("33 800 12 34")).toBe("221338001234");
    });

    it("préserve et nettoie les numéros déjà au format international", () => {
      expect(formaterTelephoneWhatsApp("+221 77 123 45 67")).toBe("221771234567");
      expect(formaterTelephoneWhatsApp("00221 78 999 00 11")).toBe("221789990011");
      expect(formaterTelephoneWhatsApp("221770001122")).toBe("221770001122");
    });

    it("gère les numéros vides ou indéfinis sans crash", () => {
      expect(formaterTelephoneWhatsApp("")).toBe("");
      expect(formaterTelephoneWhatsApp(null)).toBe("");
      expect(formaterTelephoneWhatsApp(undefined)).toBe("");
    });
  });

  describe("2. Avis de distribution transporteur / opération pompe", () => {
    it("génère un message WhatsApp complet et certifié pour chaque opération d'un transporteur", () => {
      const msg = messageDistributionTransporteur({
        clientNom: "Transports Dakar Express SA",
        stationNom: "STAR ENERGY HANN MARISTE",
        bonNumero: "BON-2026-9901",
        date: "2026-06-20",
        produit: "GASOIL",
        volumeLitres: 250,
        montant: 188750,
        transporteurNom: "Mamadou Fall",
        immatriculation: "DK-8899-AX",
        programmeNumero: "PRG-2026-0042",
        volumeRestant: 1750,
        pompisteNom: "Cheikh Ndiaye",
      });

      expect(msg).toContain("AVIS DE DISTRIBUTION CARBURANT");
      expect(msg).toContain("Transports Dakar Express SA");
      expect(msg).toContain("BON-2026-9901");
      expect(msg).toContain("250 Litres");
      expect(msg).toContain(F(188750) + " FCFA");
      expect(msg).toContain("Mamadou Fall");
      expect(msg).toContain("DK-8899-AX");
      expect(msg).toContain("PRG-2026-0042");
      expect(msg).toContain(F(1750) + " Litres");
      expect(msg).toContain("Cheikh Ndiaye");
      expect(msg).toContain("FuelOS");
    });
  });

  describe("3. Notification de Facture Officielle sur bons sélectionnés", () => {
    it("génère le message WhatsApp de facture officielle avec totaux, TVA et arrêté en toutes lettres", () => {
      const facture = {
        numero_facture: "FAC-HANN-202606-0012",
        client_nom: "Sococim Industries SA",
        station_nom: "STAR ENERGY HANN MARISTE",
        date_emission: "2026-06-25",
        date_echeance: "2026-07-05",
        objet: "Facturation mensuelle flotte livraison",
        lignes: [
          { bon_numero: "B-1", volume_litres: 1000, montant_ttc: 755000 },
          { bon_numero: "B-2", volume_litres: 500, montant_ttc: 377500 },
        ],
        montant_ht: 959746,
        montant_tva: 172754,
        montant_ttc: 1132500,
        total_en_lettres: "Un million cent trente-deux mille cinq cents francs CFA",
      };

      const msg = messageFactureOfficielle({ facture });
      expect(msg).toContain("FACTURE OFFICIELLE CONFORME OHADA");
      expect(msg).toContain("FAC-HANN-202606-0012");
      expect(msg).toContain("Sococim Industries SA");
      expect(msg).toContain(F(1132500) + " FCFA");
      expect(msg).toContain(F(959746) + " FCFA");
      expect(msg).toContain(F(172754) + " FCFA");
      expect(msg).toContain("2 bon(s) de livraison");
      expect(msg).toContain("Un million cent trente-deux mille cinq cents francs CFA");
      expect(msg).toContain("QR Code fiscal DGID");
    });

    it("génère l'objet et le corps d'email pour la facture", () => {
      const facture = {
        numero_facture: "FAC-HANN-202606-0012",
        client_nom: "Sococim Industries SA",
        station_nom: "STAR ENERGY HANN MARISTE",
        date_emission: "2026-06-25",
        lignes: [{ bon_numero: "B-1" }],
        montant_ht: 959746,
        montant_tva: 172754,
        montant_ttc: 1132500,
        total_en_lettres: "Un million cent trente-deux mille cinq cents francs CFA",
      };

      const email = emailFactureOfficielle({ facture });
      expect(email.sujet).toContain("FAC-HANN-202606-0012");
      expect(email.corps).toContain(F(1132500) + " FCFA");
      expect(email.corps).toContain("Un million cent trente-deux mille cinq cents francs CFA");
      expect(email.corps).toContain("DGID");
    });
  });
});
