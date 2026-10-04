/**
 * Module de Facturation Officielle conforme OHADA & Sénégal (DGID / SYSCOHADA)
 * Enseigne émettrice : STAR ENERGY SÉNÉGAL
 * Opérateur de gestion certifié : DAMEL ENERGY S.A.U / Station & Energy Management
 */

import { BRAND_CONFIG } from "./branding";
import { n, todayISO } from "./calcul";

export const FISCAL_CONFIG = {
  emetteur: {
    enseigne: "STAR ENERGY SÉNÉGAL",
    operateur: "DAMEL ENERGY S.A.U",
    activite: "Distribution de Produits Pétroliers & Exploitation de Stations-Service",
    siege: "Route des Maristes, Station Hann, Dakar, Sénégal",
    ninea: "006428932 2V3",
    rccm: "SN.DKR.2020.B.14890",
    centreFiscal: "CSF Grand-Dakar",
    telephone: "+221 33 832 00 00",
    email: "facturation@damelenergy.sn",
    siteWeb: "www.starenergy.sn",
    capital: "50 000 000 FCFA",
  },
  tvaTauxDefaut: 0.18,
  tauxTvaCarburant: 0,
  devise: "FCFA",
  deviseCode: "XOF",
};

/**
 * Convertit un nombre entier en toutes lettres en français
 * Exemple : 1250000 -> "Un million deux cent cinquante mille"
 */
export function nombreEnLettres(nombre) {
  const nbr = Math.round(Math.abs(n(nombre)));
  if (nbr === 0) return "Zéro";

  const unites = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf"];
  const particuliers = [
    "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
  ];
  const dizaines = [
    "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt",
  ];

  function convertMoinsDeCent(num) {
    if (num < 10) return unites[num];
    if (num < 20) return particuliers[num - 10];
    const d = Math.floor(num / 10);
    const u = num % 10;

    if (d === 7) {
      if (u === 1) return "soixante-et-onze";
      return `soixante-${particuliers[u]}`;
    }
    if (d === 8) {
      if (u === 0) return "quatre-vingts";
      return `quatre-vingt-${unites[u]}`;
    }
    if (d === 9) {
      return `quatre-vingt-${particuliers[u]}`;
    }

    if (u === 1 && d < 8) return `${dizaines[d]}-et-un`;
    if (u > 0) return `${dizaines[d]}-${unites[u]}`;
    return dizaines[d];
  }

  function convertCentaines(num) {
    if (num < 100) return convertMoinsDeCent(num);
    const c = Math.floor(num / 100);
    const reste = num % 100;
    let prefix = c === 1 ? "cent" : `${unites[c]} cent`;
    if (c > 1 && reste === 0) prefix += "s";
    if (reste > 0) prefix += ` ${convertMoinsDeCent(reste)}`;
    return prefix;
  }

  function convertMilliers(num) {
    if (num < 1000) return convertCentaines(num);
    const m = Math.floor(num / 1000);
    const reste = num % 1000;
    let prefix = m === 1 ? "mille" : `${convertCentaines(m)} mille`;
    if (reste > 0) prefix += ` ${convertCentaines(reste)}`;
    return prefix;
  }

  function convertMillions(num) {
    if (num < 1000000) return convertMilliers(num);
    const mil = Math.floor(num / 1000000);
    const reste = num % 1000000;
    let prefix = mil === 1 ? "un million" : `${convertCentaines(mil)} millions`;
    if (reste > 0) prefix += ` ${convertMilliers(reste)}`;
    return prefix;
  }

  function convertMilliards(num) {
    if (num < 1000000000) return convertMillions(num);
    const mrd = Math.floor(num / 1000000000);
    const reste = num % 1000000000;
    let prefix = mrd === 1 ? "un milliard" : `${convertCentaines(mrd)} milliards`;
    if (reste > 0) prefix += ` ${convertMillions(reste)}`;
    return prefix;
  }

  const resultat = convertMilliards(nbr).trim();
  return resultat.charAt(0).toUpperCase() + resultat.slice(1);
}

/**
 * Génère un numéro de facture séquentiel conforme OHADA
 * Ex: FAC-2026-10-HANN-0042
 */
export function genererNumeroFacture(stationCode = "HANN", dateISO = todayISO(), sequence = 1) {
  const annee = dateISO.slice(0, 4);
  const mois = dateISO.slice(5, 7);
  const code = (stationCode || "RESEAU").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const seqPadded = String(sequence).padStart(4, "0");
  return `FAC-${annee}-${mois}-${code}-${seqPadded}`;
}

/**
 * Calcule les lignes et totaux fiscaux d'une facture
 */
export function calculerFactureFiscale(lignes = []) {
  let totalHT = 0;
  let totalTVA = 0;
  let totalTTC = 0;

  const lignesCalculees = (lignes || []).map((l, index) => {
    const qte = n(l.quantite || 1);
    const puTtc = n(l.prix_unitaire_ttc || l.montant_ttc || 0);
    const montantTtcLigne = Math.round(l.montant_ttc != null ? n(l.montant_ttc) : qte * puTtc);

    const tauxTva = l.taux_tva != null ? n(l.taux_tva) : 0;
    const montantHtLigne = tauxTva > 0 ? Math.round(montantTtcLigne / (1 + tauxTva)) : montantTtcLigne;
    const montantTvaLigne = montantTtcLigne - montantHtLigne;

    totalHT += montantHtLigne;
    totalTVA += montantTvaLigne;
    totalTTC += montantTtcLigne;

    return {
      index: index + 1,
      designation: l.designation || "Consommation carburant",
      immatriculation: l.immatriculation || "—",
      bon_numero: l.bon_numero || "—",
      date_conso: l.date || l.date_bon || todayISO(),
      quantite: qte,
      prix_unitaire_ttc: puTtc,
      montant_ht: montantHtLigne,
      taux_tva: tauxTva,
      montant_tva: montantTvaLigne,
      montant_ttc: montantTtcLigne,
    };
  });

  return {
    lignes: lignesCalculees,
    totalHT,
    totalTVA,
    totalTTC,
    totalEnLettres: `${nombreEnLettres(totalTTC)} Francs CFA`,
  };
}

/**
 * Génère le payload d'intégrité et de certification fiscale pour le QR code
 */
export function genererPayloadCertification(facture) {
  const cleanFac = {
    standard: "DGID-SN-SYSCOHADA-2026",
    numero: facture.numero_facture,
    emetteur: FISCAL_CONFIG.emetteur.enseigne,
    gestionnaire: FISCAL_CONFIG.emetteur.operateur,
    ninea_emetteur: FISCAL_CONFIG.emetteur.ninea,
    client: facture.client_nom,
    client_code: facture.client_code,
    ninea_client: facture.client_ninea || "NON-ASSUJETTI",
    date: facture.date_emission,
    total_ttc: n(facture.montant_ttc),
    devise: FISCAL_CONFIG.deviseCode,
    lignes_count: (facture.lignes || []).length,
    checksum: `CERT-DE-${Math.abs(String(facture.numero_facture).split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)).toString(16).toUpperCase()}`,
  };

  return JSON.stringify(cleanFac);
}
