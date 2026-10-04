import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Facturation from '../src/lib/facturation';

describe('Module Facturation - nombreEnLettres', () => {
  it('convertit 0 en Zero', () => {
    expect(Facturation.nombreEnLettres(0)).toBe('Zéro');
  });

  it('convertit les petits montants usuels', () => {
    expect(Facturation.nombreEnLettres(990)).toBe('Neuf cent quatre-vingt-dix');
    expect(Facturation.nombreEnLettres(1000)).toBe('Mille');
    expect(Facturation.nombreEnLettres(25000)).toBe('Vingt-cinq mille');
  });

  it('convertit les montants en millions', () => {
    const lettres = Facturation.nombreEnLettres(1250000);
    expect(lettres).toContain('million');
    expect(lettres).toContain('deux cent cinquante mille');
  });

  it('convertit 50 millions FCFA', () => {
    expect(Facturation.nombreEnLettres(50000000)).toBe('Cinquante millions');
  });
});

describe('Module Facturation - genererNumeroFacture', () => {
  it('genere un numero conforme OHADA', () => {
    const num = Facturation.genererNumeroFacture('HANN', '2026-10-04', 42);
    expect(num).toBe('FAC-2026-10-HANN-0042');
  });
});

describe('Module Facturation - calculerFactureFiscale', () => {
  it('calcule correctement les totaux HT, TVA et TTC', () => {
    const lignes = [
      { designation: 'Gasoil', quantite: 100, prix_unitaire_ttc: 990, montant_ttc: 99000, taux_tva: 0 },
      { designation: 'Super', quantite: 50, prix_unitaire_ttc: 1020, montant_ttc: 51000, taux_tva: 0 }
    ];
    const resultat = Facturation.calculerFactureFiscale(lignes);
    expect(resultat.totalTTC).toBe(150000);
    expect(resultat.totalHT).toBe(150000);
    expect(resultat.totalTVA).toBe(0);
    expect(resultat.totalEnLettres).toBe('Cent cinquante mille Francs CFA');
    expect(resultat.lignes).toHaveLength(2);
  });
});

describe('Module Facturation - genererPayloadCertification', () => {
  it('produit un JSON valide pour le QR code', () => {
    const facture = {
      numero_facture: 'FAC-2026-10-HANN-0001',
      client_nom: 'TRANSPORTS SENEGALAIS',
      client_code: 'CLI-001',
      client_ninea: '001234567 2B1',
      date_emission: '2026-10-04',
      montant_ttc: 450000,
      lignes: [{ designation: 'Gasoil', quantite: 450, montant_ttc: 450000 }]
    };
    const payloadRaw = Facturation.genererPayloadCertification(facture);
    const parsed = JSON.parse(payloadRaw);
    expect(parsed.standard).toBe('DGID-SN-SYSCOHADA-2026');
    expect(parsed.numero).toBe('FAC-2026-10-HANN-0001');
    expect(parsed.checksum.startsWith('CERT-DE-')).toBe(true);
  });
});