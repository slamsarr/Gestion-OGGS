import { F, fmtDate, n, todayISO } from "./calcul";

/**
 * Nettoie et formate un numéro de téléphone pour WhatsApp (ex: Sénégal +221)
 */
export function formaterTelephoneWhatsApp(rawPhone) {
  if (!rawPhone) return "";
  // Enlever tous les caractères non numériques sauf éventuellement le +
  let cleaned = rawPhone.toString().trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (cleaned.startsWith("00")) cleaned = cleaned.slice(2);

  // Si numéro sénégalais à 9 chiffres commençant par 7 ou 33 (ex: 77 123 45 67)
  if (/^(7[05678]|33)\d{7}$/.test(cleaned)) {
    return `221${cleaned}`;
  }
  // Si déjà 221 suivi de 9 chiffres
  if (/^221(7[05678]|33)\d{7}$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

/**
 * Ouvre WhatsApp avec un message pré-rempli
 */
export function ouvrirWhatsApp(telephone, message) {
  const phoneClean = formaterTelephoneWhatsApp(telephone);
  const textEncoded = encodeURIComponent(message || "");
  const url = phoneClean
    ? `https://wa.me/${phoneClean}?text=${textEncoded}`
    : `https://wa.me/?text=${textEncoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Ouvre le client de messagerie par défaut (mailto:)
 */
export function ouvrirEmail(email, sujet, corps) {
  const mailClean = (email || "").trim();
  const subjectEncoded = encodeURIComponent(sujet || "");
  const bodyEncoded = encodeURIComponent(corps || "");
  const url = `mailto:${mailClean}?subject=${subjectEncoded}&body=${bodyEncoded}`;
  window.location.href = url;
}

/**
 * Prépare le message pour une distribution de carburant par un transporteur
 */
export function messageDistributionTransporteur({
  clientNom = "Client Partenaire",
  stationNom = "Station STAR ENERGY",
  bonNumero = "—",
  date = todayISO(),
  produit = "GASOIL",
  volumeLitres = 0,
  montant = 0,
  transporteurNom = "",
  immatriculation = "",
  programmeNumero = "",
  volumeRestant = null,
  pompisteNom = "",
}) {
  const volTxt = n(volumeLitres) > 0 ? `${F(volumeLitres)} Litres` : "—";
  const mtTxt = n(montant) > 0 ? `${F(montant)} FCFA` : "—";
  const chauffeurTxt = transporteurNom || immatriculation ? `${transporteurNom} ${immatriculation ? `(${immatriculation})` : ""}`.trim() : "Transporteur autorisé";

  let msg = `⛽ *AVIS DE DISTRIBUTION CARBURANT*\n`;
  msg += `📍 *Station :* ${stationNom}\n`;
  msg += `🏢 *Client :* ${clientNom}\n`;
  msg += `📅 *Date :* ${fmtDate(date)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🚗 *Chauffeur / Véhicule :* ${chauffeurTxt}\n`;
  msg += `📝 *N° Bon :* ${bonNumero}\n`;
  msg += `🛢️ *Produit :* ${produit}\n`;
  msg += `📊 *Volume distribué :* ${volTxt}\n`;
  msg += `💰 *Montant :* ${mtTxt}\n`;

  if (programmeNumero) {
    msg += `📑 *Programme Bons :* ${programmeNumero}\n`;
  }
  if (volumeRestant != null) {
    msg += `📉 *Solde restant programme :* ${F(volumeRestant)} Litres\n`;
  }
  if (pompisteNom) {
    msg += `👤 *Servi par :* ${pompisteNom}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✓ Opération enregistrée et certifiée par le système FuelOS.\n`;
  msg += `_Merci pour votre confiance._`;
  return msg;
}

/**
 * Prépare le message pour l'envoi d'une Facture Officielle
 */
export function messageFactureOfficielle({
  facture,
  clientNom = "",
  stationNom = "STAR ENERGY HANN MARISTE",
}) {
  const f = facture || {};
  const numero = f.numero_facture || "—";
  const dateEmission = fmtDate(f.date_emission || todayISO());
  const dateEcheance = fmtDate(f.date_echeance || f.date_emission || todayISO());
  const totalTTC = F(f.montant_ttc || 0);
  const totalHT = F(f.montant_ht || 0);
  const totalTVA = F(f.montant_tva || 0);
  const nbBons = (f.lignes || []).length;
  const enLettres = f.total_en_lettres || "";

  let msg = `📑 *FACTURE OFFICIELLE CONFORME OHADA*\n`;
  msg += `📍 *Émetteur :* ${f.station_nom || stationNom}\n`;
  msg += `🏢 *Client (Doit) :* ${f.client_nom || clientNom}\n`;
  msg += `🔢 *Facture N° :* ${numero}\n`;
  msg += `📅 *Date d'émission :* ${dateEmission}\n`;
  msg += `⏳ *Échéance :* ${dateEcheance}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 *Objet :* ${f.objet || "Règlement des consommations de carburant sur bons"}\n`;
  msg += `🎫 *Bons inclus :* ${nbBons} bon(s) de livraison\n`;
  msg += `💵 *Montant HT :* ${totalHT} FCFA\n`;
  msg += `🏛️ *TVA (18%) :* ${totalTVA} FCFA\n`;
  msg += `👉 *TOTAL NET À PAYER (TTC) :* *${totalTTC} FCFA*\n`;

  if (enLettres) {
    msg += `\n💬 *Arrêtée à la somme de :*\n_${enLettres}_\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🔐 *Certification :* QR Code fiscal DGID & SHA-256 inclus dans le document.\n`;
  msg += `✓ Document original certifié disponible au service comptabilité.\n`;
  msg += `_Pour tout règlement : Virement ou chèque à l'ordre de la station._`;
  return msg;
}

/**
 * Prépare le sujet et le corps d'un email de facture
 */
export function emailFactureOfficielle({
  facture,
  clientNom = "",
  stationNom = "STAR ENERGY",
}) {
  const f = facture || {};
  const sujet = `Facture Officielle N° ${f.numero_facture} - ${f.client_nom || clientNom} - ${f.station_nom || stationNom}`;
  const corps = `Bonjour,\n\nVeuillez trouver ci-dessous les détails de votre Facture Officielle conforme OHADA émise par ${f.station_nom || stationNom} :\n\n` +
    `• Facture N° : ${f.numero_facture}\n` +
    `• Date d'émission : ${fmtDate(f.date_emission)}\n` +
    `• Date d'échéance : ${fmtDate(f.date_echeance || f.date_emission)}\n` +
    `• Nombre de bons de carburant inclus : ${(f.lignes || []).length}\n` +
    `• Montant Hors Taxes (HT) : ${F(f.montant_ht)} FCFA\n` +
    `• TVA (18%) : ${F(f.montant_tva)} FCFA\n` +
    `• TOTAL NET À PAYER (TTC) : ${F(f.montant_ttc)} FCFA\n` +
    (f.total_en_lettres ? `• Arrêtée à la somme de : ${f.total_en_lettres}\n` : "") +
    `\nCe document comporte la signature électronique et le QR Code de certification fiscale DGID.\n\n` +
    `Cordialement,\nService Comptabilité & Gestion B2B\n${f.station_nom || stationNom}`;
  return { sujet, corps };
}
