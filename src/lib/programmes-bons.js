import { n, todayISO } from "./calcul";

export const STATUTS_PROGRAMME = {
  BROUILLON: { code: "BROUILLON", label: "Brouillon", color: "bg-gray-100 text-gray-700 border-gray-300" },
  EN_ATTENTE: { code: "EN_ATTENTE", label: "En attente de validation", color: "bg-amber-100 text-amber-900 border-amber-300 animate-pulse" },
  INFO_DEMANDEE: { code: "INFO_DEMANDEE", label: "Informations complémentaires demandées", color: "bg-sky-100 text-sky-900 border-sky-300" },
  A_CORRIGER: { code: "A_CORRIGER", label: "À corriger", color: "bg-orange-100 text-orange-900 border-orange-300" },
  VALIDE: { code: "VALIDE", label: "Validé (Prêt à activer)", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  ACTIF: { code: "ACTIF", label: "Actif (En cours)", color: "bg-emerald-500 text-white border-emerald-600 shadow-2xs" },
  SUSPENDU: { code: "SUSPENDU", label: "Suspendu", color: "bg-rose-100 text-rose-900 border-rose-300" },
  EPUISE: { code: "EPUISE", label: "Épuisé (Solde 0 L)", color: "bg-purple-100 text-purple-900 border-purple-300" },
  EXPIRE: { code: "EXPIRE", label: "Expiré", color: "bg-slate-200 text-slate-800 border-slate-300" },
  REFUSE: { code: "REFUSE", label: "Refusé", color: "bg-red-100 text-red-900 border-red-300" },
  CLOTURE: { code: "CLOTURE", label: "Clôturé", color: "bg-gray-200 text-gray-800 border-gray-400" },
};

export const MODES_GESTION_PROGRAMME = {
  VOLUME_GLOBAL: {
    code: "VOLUME_GLOBAL",
    label: "Volume global partagé",
    description: "Les transporteurs autorisés consomment sur une enveloppe commune jusqu'à épuisement du solde.",
  },
  PLAFONDS_INDIVIDUELS: {
    code: "PLAFONDS_INDIVIDUELS",
    label: "Plafonds individuels par transporteur",
    description: "Chaque transporteur dispose d'un volume maximal strict défini. Tout dépassement est bloqué.",
  },
};

export const MODES_GESTION = MODES_GESTION_PROGRAMME;

/**
 * Génère un identifiant séquentiel / lisible pour un programme de bons
 * ex : PRG-2026-0042
 */
export function genererNumeroProgramme(dateStr = todayISO()) {
  const annee = (dateStr || todayISO()).split("-")[0] || new Date().getFullYear();
  const randSeq = Math.floor(1000 + Math.random() * 9000);
  return `PRG-${annee}-${randSeq}`;
}

/**
 * Badge visuel Tailwind pour un statut de programme
 */
export function badgeStatutProgramme(statut) {
  const s = STATUTS_PROGRAMME[statut] || { label: statut || "Inconnu", color: "bg-gray-100 text-gray-700 border-gray-300" };
  return s;
}

/**
 * Calcule la synthèse volumétrique d'un programme
 */
export function calculerSyntheseProgramme(prog) {
  const totalAutorise = n(prog?.volume_autorise ?? prog?.volume_autorise_l ?? prog?.volume_demande ?? prog?.volume_demande_l ?? 0);
  const totalConsomme = n(prog?.volume_consomme ?? prog?.volume_consomme_l ?? 0);
  const volumeRestant = Math.max(0, totalAutorise - totalConsomme);
  const pctConsommation = totalAutorise > 0 ? Number(((totalConsomme / totalAutorise) * 100).toFixed(1)) : 0;

  // Calcul pour transporteurs
  const transporteurs = Array.isArray(prog?.transporteurs) ? prog.transporteurs : [];
  const transporteursSynthese = transporteurs.map((t) => {
    const alloue = n(t.volume_autorise ?? t.volume_alloue_l ?? t.volume_demande ?? t.volume_demande_l ?? 0);
    const conso = n(t.volume_consomme ?? t.volume_consomme_l ?? 0);
    const restant = Math.max(0, alloue - conso);
    const pct = alloue > 0 ? Number(((conso / alloue) * 100).toFixed(1)) : 0;
    return {
      ...t,
      volume_autorise: alloue,
      volume_alloue_l: alloue,
      volume_consomme: conso,
      volume_consomme_l: conso,
      volume_restant: restant,
      volume_restant_l: restant,
      pourcentage_consomme: pct,
      pct_consommation: pct,
    };
  });

  const estExpire = prog?.date_fin ? todayISO() > prog.date_fin : false;

  return {
    volume_total: totalAutorise,
    total_autorise_l: totalAutorise,
    volume_consomme: totalConsomme,
    total_consomme_l: totalConsomme,
    volume_restant: volumeRestant,
    volume_restant_l: volumeRestant,
    pourcentage_consomme: pctConsommation,
    pct_consommation: pctConsommation,
    est_epuise: volumeRestant <= 0 && totalAutorise > 0,
    est_expire: estExpire,
    transporteurs: transporteursSynthese,
    nb_transporteurs: transporteurs.length,
    nb_passages: n(prog?.nb_passages ?? 0),
  };
}

/**
 * Valide si une distribution à la pompe peut être accordée sur un programme
 */
export function verifierEligibiliteDistribution(prog, optsOrTransId = {}, volumeArg = 0, produitArg = "GASOIL", dateArg = todayISO()) {
  let transporteur_id = null;
  let immatriculation = "";
  let produit = "GASOIL";
  let volume_souhaite = 0;
  let date_distribution = todayISO();

  if (typeof optsOrTransId === "object" && optsOrTransId !== null) {
    transporteur_id = optsOrTransId.transporteur_id || null;
    immatriculation = optsOrTransId.immatriculation || "";
    produit = optsOrTransId.produit || "GASOIL";
    volume_souhaite = optsOrTransId.volume_souhaite ?? optsOrTransId.volume_litres ?? 0;
    date_distribution = optsOrTransId.date_distribution || todayISO();
  } else {
    transporteur_id = optsOrTransId || null;
    volume_souhaite = volumeArg;
    produit = produitArg || "GASOIL";
    date_distribution = dateArg || todayISO();
  }

  if (!prog) {
    return { eligible: false, motif: "Programme introuvable.", erreur: "Programme introuvable." };
  }

  // 1. Statut du programme
  if (prog.statut !== "ACTIF") {
    let msg = `Distribution bloquée : statut du programme = ${prog.statut}`;
    if (prog.statut === "EN_ATTENTE" || prog.statut === "BROUILLON") {
      msg = "Le programme n'a pas encore été validé ou activé par le gérant.";
    } else if (prog.statut === "SUSPENDU") {
      msg = "Ce programme de bons a été suspendu par la direction (statut SUSPENDU).";
    } else if (prog.statut === "EPUISE") {
      msg = "Le programme de bons est totalement épuisé (Solde : 0 L).";
    } else if (prog.statut === "EXPIRE" || prog.statut === "CLOTURE" || prog.statut === "REFUSE") {
      msg = `Le programme n'est plus utilisable (Statut : ${prog.statut}).`;
    }
    return { eligible: false, motif: msg, erreur: msg };
  }

  // 2. Dates de validité
  if (prog.date_debut && date_distribution < prog.date_debut) {
    const msg = `Le programme n'est valable qu'à partir du ${prog.date_debut}.`;
    return { eligible: false, motif: msg, erreur: msg };
  }
  if (prog.date_fin && date_distribution > prog.date_fin) {
    const msg = `Le programme a expiré depuis le ${prog.date_fin}.`;
    return { eligible: false, motif: msg, erreur: msg };
  }

  // 3. Conformité du carburant
  const carbProg = prog.type_carburant || prog.produit;
  if (carbProg && carbProg !== "MULTI") {
    if (carbProg.toUpperCase() !== (produit || "").toUpperCase()) {
      const msg = `Carburant non autorisé : ce programme est exclusivement dédié au ${carbProg} (${produit} demandé).`;
      return { eligible: false, motif: msg, erreur: msg };
    }
  }

  // 4. Solde global du programme
  const totalAutorise = n(prog.volume_autorise ?? prog.volume_autorise_l ?? prog.volume_demande ?? prog.volume_demande_l ?? 0);
  const totalConsomme = n(prog.volume_consomme ?? prog.volume_consomme_l ?? 0);
  const soldeGlobal = Math.max(0, totalAutorise - totalConsomme);

  const volDemand = n(volume_souhaite);
  if (volDemand > soldeGlobal) {
    const msg = `Solde global insuffisant : il ne reste que ${soldeGlobal} L disponibles sur ce programme (${volDemand} L demandés).`;
    return {
      eligible: false,
      motif: msg,
      erreur: msg,
      solde_restant_l: soldeGlobal,
    };
  }

  // 5. Identification du transporteur / véhicule
  const transporteurs = Array.isArray(prog.transporteurs) ? prog.transporteurs : [];
  let trans = null;
  if (transporteur_id) {
    trans = transporteurs.find((t) => t.id === transporteur_id);
  } else if (immatriculation) {
    const cleanImmat = immatriculation.trim().replace(/[\s-]/g, "").toUpperCase();
    trans = transporteurs.find((t) => {
      const tImmat = (t.immatriculation || "").trim().replace(/[\s-]/g, "").toUpperCase();
      return tImmat && tImmat === cleanImmat;
    });
  }

  // Si des transporteurs sont listés, le chauffeur/véhicule doit être autorisé
  if (transporteurs.length > 0 && !trans) {
    const msg = `Le véhicule / transporteur (${immatriculation || transporteur_id}) n'est pas autorisé sur ce programme.`;
    return {
      eligible: false,
      motif: msg,
      erreur: msg,
      solde_restant_l: soldeGlobal,
    };
  }

  // 6. Mode plafonds individuels
  if (prog.mode_gestion === "PLAFONDS_INDIVIDUELS" && trans) {
    const quotaTrans = n(trans.volume_autorise ?? trans.volume_alloue_l ?? trans.volume_demande ?? trans.volume_demande_l ?? 0);
    const consoTrans = n(trans.volume_consomme ?? trans.volume_consomme_l ?? 0);
    const soldeTrans = Math.max(0, quotaTrans - consoTrans);

    if (volDemand > soldeTrans) {
      const msg = `Plafond individuel dépassé pour ${trans.nom_prenom || trans.immatriculation} : solde restant de ${soldeTrans} L (${volDemand} L demandés).`;
      return {
        eligible: false,
        motif: msg,
        erreur: msg,
        solde_restant_l: soldeTrans,
      };
    }
    return {
      eligible: true,
      solde_restant_l: Math.min(soldeGlobal, soldeTrans),
      nouveau_solde: soldeGlobal - volDemand,
      transporteur: trans,
    };
  }

  return {
    eligible: true,
    solde_restant_l: soldeGlobal,
    nouveau_solde: soldeGlobal - volDemand,
    transporteur: trans,
  };
}
