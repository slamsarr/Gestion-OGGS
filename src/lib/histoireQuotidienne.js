import { n, F, fmtDate } from "./calcul";

const SEUIL_ECART = 5000;

function pct(v, ref) {
  if (ref === 0 || ref == null) return 0;
  return Math.round(((v - ref) / Math.abs(ref)) * 100);
}

function delta(v, prev) {
  const p = pct(v, prev || 0);
  if (p > 5) return { sens: "up", p, txt: `+${p}% vs veille` };
  if (p < -5) return { sens: "down", p, txt: `${p}% vs veille` };
  return { sens: "flat", p, txt: "stable vs veille" };
}

function topPerformers(items, keyValue, keyLabel, limit = 3) {
  if (!items || items.length === 0) return [];
  return [...items]
    .sort((a, b) => n(b[keyValue]) - n(a[keyValue]))
    .slice(0, limit)
    .map((x) => ({ label: x[keyLabel], valeur: n(x[keyValue]) }));
}

export function construireHistoire(params) {
  const {
    dateISO,
    stationNom = "votre station",
    stationCode = "",
    // Données du jour J
    caCarburantJ = 0,
    caLavageJ = 0,
    caBoutiqueJ = 0,
    caEntretienJ = 0,
    volumeCarburantJ = 0,
    nbLavagesJ = 0,
    nbVentesBoutiqueJ = 0,
    nbInterventionsEntretienJ = 0,
    descentesJ = [],
    // Données J-1 (veille)
    caCarburantV = 0,
    caLavageV = 0,
    caBoutiqueV = 0,
    // Données J-7 (moyenne 7j)
    caCarburantM7 = 0,
    caLavageM7 = 0,
    caBoutiqueM7 = 0,
    // Stocks & alertes
    stocks = [],
    ecartsDescente = [],
    // Bons & crédit
    bonsImpayes = [],
    montantImpayes = 0,
    // Rapports
    rapportsSoumis = false,
    rapportsManquants = [],
    // Personnalisation
    role = "gerant",
    nomUtilisateur = "",
  } = params;

  const histoires = [];
  const astuces = [];
  const alertes = [];

  const caTotalJ = caCarburantJ + caLavageJ + caBoutiqueJ + caEntretienJ;
  const caTotalV = caCarburantV + caLavageV + caBoutiqueV;
  const caTotalM7 = caCarburantM7 + caLavageM7 + caBoutiqueM7;

  // ── 1. Bannière d'introduction ─────────────────────────────────────────────
  const salut = (() => {
    const h = new Date().getHours();
    if (h < 11) return "☀️ Bonjour";
    if (h < 18) return "🌤️ Bon après-midi";
    return "🌙 Bonsoir";
  })();
  const introLignes = [];
  introLignes.push(`${salut} ${nomUtilisateur ? nomUtilisateur.split(" ")[0] + ", " : ""}voici l'histoire de **${stationNom}** du *${fmtDate(dateISO)}*.`);

  if (caTotalJ > 0) {
    const d = delta(caTotalJ, caTotalV);
    const emojiCA = d.sens === "up" ? "📈" : d.sens === "down" ? "📉" : "➖";
    introLignes.push(`${emojiCA} **Chiffre d'affaires global : ${F(caTotalJ)} FCFA** — ${d.txt}.`);
    if (caTotalM7 > 0) {
      const d7 = delta(caTotalJ, caTotalM7);
      introLignes.push(`📊 Moyenne glissante 7j : ${F(caTotalM7)} FCFA — ${d7.txt}.`);
    }
  } else {
    introLignes.push("⏳ La journée démarre — les données se mettent à jour au fil des descentes.");
  }

  histoires.push({
    id: "intro",
    type: "intro",
    tone: "info",
    icon: "📰",
    titre: `Résumé du ${fmtDate(dateISO)}`,
    lignes: introLignes,
  });

  // ── 2. Carburant ────────────────────────────────────────────────────────────
  const lignesCarb = [];
  const dCarb = delta(caCarburantJ, caCarburantV);
  const emojiCarb = dCarb.sens === "up" ? "⛽💪" : dCarb.sens === "down" ? "⛽📉" : "⛽";
  lignesCarb.push(`${emojiCarb} **Carburant : ${F(caCarburantJ)} FCFA** — ${dCarb.txt}.`);
  if (volumeCarburantJ > 0) lignesCarb.push(`🚛 Volume vendu : ~${F(volumeCarburantJ)} litres.`);
  if (descentesJ && descentesJ.length > 0) {
    const pompistesUniques = [...new Set(descentesJ.map((d) => d.pompiste_nom || d.pompiste_id).filter(Boolean))];
    lignesCarb.push(`👷 ${descentesJ.length} descente(s) enregistrée(s) — ${pompistesUniques.length} pompiste(s) actif(s).`);
  } else {
    lignesCarb.push("⚠️ Aucune descente de quart encore clôturée aujourd'hui.");
    alertes.push({ id: "no-descente", icon: "⏰", msg: "Aucune descente de quart clôturée aujourd'hui. Pensez à vérifier auprès de vos équipes.", niveau: "warning" });
  }

  // Écarts caisse pompistes
  if (ecartsDescente && ecartsDescente.length > 0) {
    const ecartsSignificatifs = ecartsDescente.filter((e) => Math.abs(n(e.ecart)) >= SEUIL_ECART);
    if (ecartsSignificatifs.length > 0) {
      const totalEcart = ecartsSignificatifs.reduce((s, e) => s + n(e.ecart), 0);
      lignesCarb.push(`🔴 **${ecartsSignificatifs.length} écart(s) caisse > 5 000F** détecté(s) · Total : ${F(totalEcart)} F`);
      alertes.push({ id: "ecarts", icon: "💸", msg: `${ecartsSignificatifs.length} écart(s) caisse important(s) — à investiguer rapidement.`, niveau: "danger" });
    } else {
      lignesCarb.push("✅ Toutes les caisses pompistes sont dans la tolérance (< 5 000 F).");
    }
  }

  histoires.push({
    id: "carburant",
    type: "pole",
    tone: "primary",
    icon: "⛽",
    titre: "Pôle Carburant",
    lignes: lignesCarb,
  });

  // ── 3. Services à forte marge ──────────────────────────────────────────────
  const lignesServices = [];
  const dLav = delta(caLavageJ, caLavageV);
  const emojiLav = dLav.sens === "up" ? "🚿💚" : dLav.sens === "down" ? "🚿" : "🚿➖";
  lignesServices.push(`${emojiLav} **Lavage : ${F(caLavageJ)} FCFA** — ${nbLavagesJ} véhicule(s) · ${dLav.txt}.`);

  const dBout = delta(caBoutiqueJ, caBoutiqueV);
  const emojiBout = dBout.sens === "up" ? "🛒✨" : dBout.sens === "down" ? "🛒" : "🛒➖";
  lignesServices.push(`${emojiBout} **Boutique : ${F(caBoutiqueJ)} FCFA** — ${nbVentesBoutiqueJ} ticket(s) · ${dBout.txt}.`);

  if (caEntretienJ > 0 || nbInterventionsEntretienJ > 0) {
    lignesServices.push(`🔧 **Entretien & Lubrifiants : ${F(caEntretienJ)} FCFA** — ${nbInterventionsEntretienJ} intervention(s).`);
  }

  // Panier moyen rapide
  if (nbVentesBoutiqueJ > 0) {
    const panier = Math.round(caBoutiqueJ / nbVentesBoutiqueJ);
    lignesServices.push(`💡 Panier moyen boutique : ~${F(panier)} FCFA.`);
    if (panier < 5000) astuces.push("Le panier moyen boutique est faible — proposer systématiquement un addon (bouteille d'huile, cure-dents…).");
  }
  if (nbLavagesJ > 0) {
    const tikLavage = Math.round(caLavageJ / nbLavagesJ);
    lignesServices.push(`💸 Ticket moyen lavage : ~${F(tikLavage)} FCFA.`);
  }

  histoires.push({
    id: "services",
    type: "pole",
    tone: "success",
    icon: "💎",
    titre: "Services & Marges",
    lignes: lignesServices,
  });

  // ── 4. Stocks & Approvisionnements ─────────────────────────────────────────
  const lignesStocks = [];
  if (stocks && stocks.length > 0) {
    const stocksBas = stocks.filter((s) => s.stock > 0 && s.stock <= s.seuil && s.seuil > 0);
    const stocksCritiques = stocks.filter((s) => s.stock <= 0 && s.seuil > 0);
    if (stocksCritiques.length > 0) {
      lignesStocks.push(`🛑 **${stocksCritiques.length} produit(s) en rupture de stock** : ${stocksCritiques.slice(0, 3).map((s) => s.produit).join(", ")}${stocksCritiques.length > 3 ? "…" : ""}`);
      alertes.push({ id: "rupture", icon: "🛑", msg: `${stocksCritiques.length} produit(s) en rupture — commande d'urgence recommandée.`, niveau: "danger" });
    }
    if (stocksBas.length > 0) {
      lignesStocks.push(`⚠️ **${stocksBas.length} produit(s) sous seuil d'alerte** : ${stocksBas.slice(0, 4).map((s) => `${s.produit} (${s.stock} u.)`).join(", ")}${stocksBas.length > 4 ? "…" : ""}`);
      alertes.push({ id: "stock-bas", icon: "📦", msg: `${stocksBas.length} stock(s) bas — prévoir une commande dans les 48h.`, niveau: "warning" });
    }
    if (stocksBas.length === 0 && stocksCritiques.length === 0) {
      lignesStocks.push("✅ Tous vos stocks sont au-dessus du seuil d'alerte — super !");
    }
    const valeurStock = stocks.reduce((s, p) => s + n(p.valeur), 0);
    if (valeurStock > 0) lignesStocks.push(`💰 Valeur totale du stock lubrifiants / gaz : ${F(valeurStock)} FCFA.`);
  }

  // Stocks carburant (cuves) – simplifié
  if (stocks && stocks.some((s) => s.famille === "CARBURANT" || s.famille === "GAZ")) {
    const stockGO = stocks.find((s) => s.famille === "CARBURANT" && /GASOIL|GO|DIESEL/i.test(s.produit));
    const stockSU = stocks.find((s) => s.famille === "CARBURANT" && /SUPER|ESSENCE/i.test(s.produit));
    if (stockGO && stockGO.stock > 0 && stockGO.seuil > 0 && stockGO.stock < stockGO.seuil * 1.5) {
      lignesStocks.push(`🛢️ Stock GASOIL bas : ${F(stockGO.stock)} L / seuil ${F(stockGO.seuil)} L — commander d'urgence.`);
      astuces.push("💡 Anticiper la commande GASOIL : en période de pic, les livraisons peuvent prendre 48h.");
    }
  }

  if (lignesStocks.length > 0) {
    histoires.push({
      id: "stocks",
      type: "pole",
      tone: "warning",
      icon: "📦",
      titre: "Stocks & Appro",
      lignes: lignesStocks,
    });
  }

  // ── 5. Bons impayés & Crédit ───────────────────────────────────────────────
  if (bonsImpayes && (bonsImpayes.length > 0 || montantImpayes > 0)) {
    const lignes = [];
    lignes.push(`🧾 **${bonsImpayes.length} bon(s) encore impayé(s)** — encours total : **${F(montantImpayes)} FCFA**.`);
    if (bonsImpayes.length > 0) {
      const top = topPerformers(bonsImpayes, "reste_a_payer", "client_nom" || "client_code", 2);
      if (top.length > 0) {
        lignes.push(`🎯 Top 2 impayés : ${top.map((t) => `${t.label || "Client"} (${F(t.valeur)} F)`).join(" · ")}.`);
      }
      alertes.push({ id: "impayes", icon: "🧾", msg: `${bonsImpayes.length} bon(s) impayé(s) pour ${F(montantImpayes)} F — relance recommandée.`, niveau: "warning" });
    }
    histoires.push({
      id: "impayes",
      type: "pole",
      tone: "danger",
      icon: "💳",
      titre: "Crédit & Impayés",
      lignes,
    });
  }

  // ── 6. Rapports & Clôture ─────────────────────────────────────────────────
  if (rapportsManquants && rapportsManquants.length > 0) {
    const lignes = [];
    lignes.push(`📝 **${rapportsManquants.length} station(s) n'ont pas encore soumis leur rapport** aujourd'hui.`);
    lignes.push(`→ Stations en attente : ${rapportsManquants.join(", ")}`);
    alertes.push({ id: "rapports", icon: "📋", msg: `${rapportsManquants.length} rapport(s) manquant(s) — relance nécessaire.`, niveau: "warning" });
    histoires.push({
      id: "rapports",
      type: "pole",
      tone: "warning",
      icon: "📋",
      titre: "Rapports Journaliers",
      lignes,
    });
  } else if (rapportsSoumis) {
    histoires.push({
      id: "rapports-ok",
      type: "pole",
      tone: "success",
      icon: "✅",
      titre: "Rapport du Jour",
      lignes: ["✅ Le rapport journalier a bien été soumis aujourd'hui. 🎉"],
    });
  }

  // ── 7. Top 3 astuces actionnables ──────────────────────────────────────────
  // Compléter les astuces si vide
  if (caCarburantJ === 0 && caLavageJ === 0 && caBoutiqueJ === 0) {
    astuces.push("💡 Journée jeune : partager ce cockpit avec vos équipes pour aligner tout le monde sur les objectifs.");
  }
  if (dLav.sens === "down" && caLavageV > 0) {
    astuces.push("💡 Lavage en baisse : proposer une offre flash 2×1 sur le lavage intérieur cet après-midi.");
  }
  if (dBout.sens === "down" && caBoutiqueV > 0) {
    astuces.push("💡 Boutique en baisse : rappeler à l'équipe de vendre les addons (cure-dents, huile 1L, glace).");
  }
  if (role && !["gerant", "admin", "directeur", "superviseur", "comptable"].includes(role)) {
    astuces.push("💡 Concentrez-vous sur la qualité du service : un client fidèle rapporte plus qu'un client ponctuel !");
  }

  if (astuces.length > 0) {
    histoires.push({
      id: "astuces",
      type: "astuces",
      tone: "accent",
      icon: "💡",
      titre: "Astuces pour gagner plus aujourd'hui",
      lignes: astuces.slice(0, 3),
    });
  }

  // ── 8. Fin — Motivation ────────────────────────────────────────────────────
  const mot = (() => {
    const h = new Date().getHours();
    if (h < 11) return "🏃‍♀️ Belle journée en perspective. Vos équipes comptent sur vous !";
    if (h < 18) return "⚡ On continue ! L'après-midi c'est là que se jouent les plus belles ventes.";
    return "🌙 Journée bien remplie — pensez à clôturer votre rapport avant de partir.";
  })();
  histoires.push({
    id: "cloture",
    type: "outro",
    tone: "success",
    icon: "🎯",
    titre: "Bonne journée !",
    lignes: [mot],
  });

  return {
    dateISO,
    stationNom,
    stationCode,
    caTotalJ,
    histoires,
    alertes,
    nbAlertes: alertes.length,
    nbHistoires: histoires.length,
  };
}

export const TONES = {
  primary: { bg: "from-blue-600 to-indigo-600", text: "text-white", accent: "bg-blue-500" },
  success: { bg: "from-emerald-500 to-teal-600", text: "text-white", accent: "bg-emerald-500" },
  warning: { bg: "from-amber-500 to-orange-600", text: "text-white", accent: "bg-amber-500" },
  danger:  { bg: "from-rose-500 to-red-600", text: "text-white", accent: "bg-rose-500" },
  info:    { bg: "from-slate-700 to-slate-900", text: "text-white", accent: "bg-slate-600" },
  accent:  { bg: "from-purple-600 to-pink-600", text: "text-white", accent: "bg-purple-500" },
};
