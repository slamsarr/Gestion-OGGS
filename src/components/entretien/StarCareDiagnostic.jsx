import React, { useState, useMemo } from "react";
import { Badge, Button } from "../ui";

// ── Grille officielle des points de contrôle Star Care ─────────────────────────
export const STAR_CARE_POINTS = [
  // ── PALLIER 20 POINTS (Pack Essentiel, Confort & Premium)
  { id: "niv_huile", label: "Niveau & aspect huile moteur", icon: "🛢️", cat: "Niveaux & Fluides", niveau: 20 },
  { id: "niv_frein", label: "Niveau liquide de frein (DOT 4)", icon: "🩸", cat: "Niveaux & Fluides", niveau: 20 },
  { id: "niv_refroid", label: "Niveau liquide refroidissement", icon: "❄️", cat: "Niveaux & Fluides", niveau: 20 },
  { id: "niv_laveglace", label: "Niveau lave-glace & gicleurs", icon: "💧", cat: "Niveaux & Fluides", niveau: 20 },
  { id: "niv_da", label: "Niveau fluide direction assistée", icon: "🔄", cat: "Niveaux & Fluides", niveau: 20 },
  { id: "plaq_av", label: "Épaisseur plaquettes de frein avant", icon: "🛑", cat: "Freinage", niveau: 20 },
  { id: "plaq_ar", label: "Épaisseur plaquettes/mâchoires arrière", icon: "🛑", cat: "Freinage", niveau: 20 },
  { id: "disques_av", label: "État & surface des disques avant", icon: "💿", cat: "Freinage", niveau: 20 },
  { id: "frein_stationnement", label: "Efficacité frein de stationnement", icon: "🅿️", cat: "Freinage", niveau: 20 },
  { id: "pneu_av_g", label: "Pneu AV Gauche (usure, pression, flanc)", icon: "🛞", cat: "Pneumatiques", niveau: 20 },
  { id: "pneu_av_d", label: "Pneu AV Droit (usure, pression, flanc)", icon: "🛞", cat: "Pneumatiques", niveau: 20 },
  { id: "pneu_ar_g", label: "Pneu AR Gauche (usure, pression, flanc)", icon: "🛞", cat: "Pneumatiques", niveau: 20 },
  { id: "pneu_ar_d", label: "Pneu AR Droit (usure, pression, flanc)", icon: "🛞", cat: "Pneumatiques", niveau: 20 },
  { id: "eclairage_av", label: "Feux croisement, feux de route & veilleuses", icon: "💡", cat: "Visibilité & Éclairage", niveau: 20 },
  { id: "eclairage_ar", label: "Feux stop, antibrouillards & recul", icon: "🚨", cat: "Visibilité & Éclairage", niveau: 20 },
  { id: "clignotants", label: "Clignotants & feux de détresse", icon: "🔶", cat: "Visibilité & Éclairage", niveau: 20 },
  { id: "essuie_glaces", label: "Balais essuie-glace & état pare-brise", icon: "🌧️", cat: "Visibilité & Éclairage", niveau: 20 },
  { id: "bat_tension", label: "Tension batterie au repos & cosses", icon: "🔋", cat: "Électrique", niveau: 20 },
  { id: "fuites_visibles", label: "Contrôle visuel fuites sous moteur", icon: "🔍", cat: "Moteur & Châssis", niveau: 20 },
  { id: "avertisseur", label: "Avertisseur sonore (klaxon)", icon: "📢", cat: "Sécurité Habitacle", niveau: 20 },

  // ── PALLIER 40 POINTS (Pack Confort & Premium)
  { id: "roue_secours", label: "Pression roue de secours / kit secours", icon: "🛞", cat: "Pneumatiques", niveau: 40 },
  { id: "filtre_air", label: "État d'encrassement filtre à air", icon: "🌬️", cat: "Moteur & Filtres", niveau: 40 },
  { id: "filtre_habitacle", label: "État filtre habitacle / climatisation", icon: "💨", cat: "Moteur & Filtres", niveau: 40 },
  { id: "clim_efficacite", label: "Efficacité climatisation (température)", icon: "🧊", cat: "Climatisation", niveau: 40 },
  { id: "amortisseurs_av", label: "Amortisseurs avant & fuites hydrauliques", icon: "🚘", cat: "Liaisons au sol", niveau: 40 },
  { id: "amortisseurs_ar", label: "Amortisseurs arrière & fixations", icon: "🚘", cat: "Liaisons au sol", niveau: 40 },
  { id: "rotules_direction", label: "Rotules & biellettes de direction", icon: "⚙️", cat: "Liaisons au sol", niveau: 40 },
  { id: "rotules_suspension", label: "Rotules inférieures de suspension", icon: "🔩", cat: "Liaisons au sol", niveau: 40 },
  { id: "soufflets_cardan", label: "Soufflets de cardan (étanchéité graisse)", icon: "🔧", cat: "Transmission", niveau: 40 },
  { id: "silentblocs_train", label: "Silentblocs train avant & triangles", icon: "⛓️", cat: "Liaisons au sol", niveau: 40 },
  { id: "durites_refroid", label: "État & souplesse durites refroidissement", icon: "🧪", cat: "Niveaux & Fluides", niveau: 40 },
  { id: "flexibles_frein", label: "Flexibles de frein (craquelures, fuites)", icon: "🛑", cat: "Freinage", niveau: 40 },
  { id: "courroie_access", label: "Courroie accessoires & galets tendeurs", icon: "⚙️", cat: "Moteur & Filtres", niveau: 40 },
  { id: "charge_alternateur", label: "Tension de charge alternateur (moteur tournant)", icon: "⚡", cat: "Électrique", niveau: 40 },
  { id: "ligne_echappement", label: "Ligne d'échappement, silentblocs & fixation", icon: "💨", cat: "Moteur & Châssis", niveau: 40 },
  { id: "bouchon_carter", label: "Joint bouchon vidange & filtre à huile", icon: "🔩", cat: "Moteur & Châssis", niveau: 40 },
  { id: "retroviseurs", label: "Rétroviseurs & miroirs extérieurs", icon: "🪞", cat: "Visibilité & Éclairage", niveau: 40 },
  { id: "eclairage_plaque", label: "Éclairage plaque d'immatriculation", icon: "💡", cat: "Visibilité & Éclairage", niveau: 40 },
  { id: "ceintures", label: "Enrouleurs & verrouillage ceintures", icon: "💺", cat: "Sécurité Habitacle", niveau: 40 },
  { id: "bouchon_essence", label: "Clapet & étanchéité bouchon carburant", icon: "⛽", cat: "Sécurité Habitacle", niveau: 40 },

  // ── PALLIER 60 POINTS (Pack Premium & Diagnostic Intégral)
  { id: "obd_diag", label: "Diagnostic électronique OBD (calculateur)", icon: "💻", cat: "Électronique & OBD", niveau: 60 },
  { id: "obd_defauts", label: "Lecture & effacement codes défauts mémoires", icon: "📟", cat: "Électronique & OBD", niveau: 60 },
  { id: "obd_actionneurs", label: "Test paramètres temps réel & sondes", icon: "🔍", cat: "Électronique & OBD", niveau: 60 },
  { id: "geometrie_av", label: "Parallélisme & pincement train avant", icon: "📐", cat: "Liaisons au sol", niveau: 60 },
  { id: "carrossage", label: "Contrôle carrossage & angles de chasse", icon: "📐", cat: "Liaisons au sol", niveau: 60 },
  { id: "boite_niveau", label: "Niveau & étanchéité boîte de vitesses", icon: "⚙️", cat: "Transmission", niveau: 60 },
  { id: "pont_differentiel", label: "Niveau huile pont / différentiel", icon: "🚜", cat: "Transmission", niveau: 60 },
  { id: "roulements_av", label: "Jeu mécanique roulements de roues avant", icon: "🔘", cat: "Liaisons au sol", niveau: 60 },
  { id: "roulements_ar", label: "Jeu mécanique roulements de roues arrière", icon: "🔘", cat: "Liaisons au sol", niveau: 60 },
  { id: "biellettes_barre_stab", label: "Biellettes de barre stabilisatrice", icon: "🔗", cat: "Liaisons au sol", niveau: 60 },
  { id: "supports_moteur", label: "Supports moteur & anti-basculement", icon: "🧱", cat: "Moteur & Châssis", niveau: 60 },
  { id: "embrayage_course", label: "Garde pédale d'embrayage / boîte auto", icon: "🕹️", cat: "Transmission", niveau: 60 },
  { id: "cremaillere", label: "Crémaillère & colonne de direction", icon: "🏎️", cat: "Liaisons au sol", niveau: 60 },
  { id: "injecteurs_fuite", label: "Étanchéité circuit injection & carburant", icon: "🔥", cat: "Moteur & Filtres", niveau: 60 },
  { id: "antipollution", label: "Contrôle visuel fumées d'échappement", icon: "🌫️", cat: "Moteur & Châssis", niveau: 60 },
  { id: "temoins_tbd", label: "Témoins d'alerte combiné tableau de bord", icon: "📊", cat: "Électronique & OBD", niveau: 60 },
  { id: "ouvrants_serrures", label: "Verrouillage portières & charnières", icon: "🔑", cat: "Sécurité Habitacle", niveau: 60 },
  { id: "dessous_caisse", label: "Inspection châssis, plancher & corrosion", icon: "🛡️", cat: "Moteur & Châssis", niveau: 60 },
  { id: "bougies_allumage", label: "Contrôle allumage / préchauffage diesel", icon: "⚡", cat: "Moteur & Filtres", niveau: 60 },
  { id: "essai_dynamique", label: "Essai fonctionnel sur pont & braquage", icon: "🏁", cat: "Contrôle Final", niveau: 60 },
];

export default function StarCareDiagnostic({
  checklist = {},
  onChange,
  niveau = 20,
  onNiveauChange,
}) {
  const [filterStatut, setFilterStatut] = useState("ALL");
  const [activeCat, setActiveCat] = useState("ALL");

  // Filtrage selon le niveau sélectionné (10, 20, 40 ou 60)
  const currentPoints = useMemo(() => {
    if (niveau === 10) return STAR_CARE_POINTS.slice(0, 10);
    return STAR_CARE_POINTS.filter((p) => p.niveau <= niveau);
  }, [niveau]);

  // Statistiques du rapport de contrôle
  const stats = useMemo(() => {
    let ok = 0;
    let surveiller = 0;
    let urgent = 0;
    let nonVerifies = 0;

    currentPoints.forEach((p) => {
      const val = checklist[p.id];
      if (val === "OK" || val === true) ok++;
      else if (val === "SURVEILLER") surveiller++;
      else if (val === "URGENT") urgent++;
      else nonVerifies++;
    });

    const total = currentPoints.length;
    const verifies = ok + surveiller + urgent;
    return { ok, surveiller, urgent, nonVerifies, verifies, total };
  }, [currentPoints, checklist]);

  // Action rapide : tout cocher OK
  const handleToutMarquerOK = () => {
    const updated = { ...checklist };
    currentPoints.forEach((p) => {
      // Si non encore défini ou déjà OK, on met OK
      if (!updated[p.id] || updated[p.id] === true) {
        updated[p.id] = "OK";
      }
    });
    onChange(updated);
  };

  // Basculer l'état d'un point : OK -> SURVEILLER -> URGENT -> Reset
  const handleSetStatut = (pointId, newStatut) => {
    const current = checklist[pointId];
    const next = current === newStatut ? undefined : newStatut;
    const updated = { ...checklist };
    if (!next) {
      delete updated[pointId];
    } else {
      updated[pointId] = next;
    }
    onChange(updated);
  };

  const categories = useMemo(() => {
    const set = new Set();
    currentPoints.forEach((p) => set.add(p.cat));
    return ["ALL", ...Array.from(set)];
  }, [currentPoints]);

  const displayedPoints = useMemo(() => {
    return currentPoints.filter((p) => {
      if (activeCat !== "ALL" && p.cat !== activeCat) return false;
      const val = checklist[p.id];
      const statut = val === true ? "OK" : val || "NON_VERIFIE";
      if (filterStatut === "OK" && statut !== "OK") return false;
      if (filterStatut === "SURVEILLER" && statut !== "SURVEILLER") return false;
      if (filterStatut === "URGENT" && statut !== "URGENT") return false;
      if (filterStatut === "NON_VERIFIE" && statut !== "NON_VERIFIE") return false;
      return true;
    });
  }, [currentPoints, activeCat, filterStatut, checklist]);

  return (
    <div className="space-y-3.5">
      {/* Barre de sélection du niveau de contrôle Star Care */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gradient-to-r from-amber-50 to-orange-50/60 rounded-2xl border border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <div>
            <div className="text-xs font-black uppercase text-amber-900 tracking-wider">
              Niveau de Contrôle Star Care
            </div>
            <div className="text-[11px] text-amber-800">
              {stats.verifies}/{stats.total} points vérifiés · Rapport d'état du véhicule
            </div>
          </div>
        </div>

        {/* Sélecteur de niveau */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-amber-200 shadow-sm">
          {[
            { n: 10, label: "10 Pts (Express)" },
            { n: 20, label: "20 Pts (Essentiel)" },
            { n: 40, label: "40 Pts (Confort)" },
            { n: 60, label: "60 Pts (Premium)" },
          ].map((lvl) => (
            <button
              key={lvl.n}
              type="button"
              onClick={() => onNiveauChange && onNiveauChange(lvl.n)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold transition-all ${
                niveau === lvl.n
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {lvl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Résumé synthétique & Boutons d'action */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterStatut("ALL")}
            className={`px-2 py-1 rounded-lg font-bold border transition-all ${
              filterStatut === "ALL"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            Tous ({stats.total})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatut("OK")}
            className={`px-2 py-1 rounded-lg font-bold border transition-all flex items-center gap-1 ${
              filterStatut === "OK"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-emerald-50 text-emerald-800 border-emerald-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            OK ({stats.ok})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatut("SURVEILLER")}
            className={`px-2 py-1 rounded-lg font-bold border transition-all flex items-center gap-1 ${
              filterStatut === "SURVEILLER"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-amber-50 text-amber-900 border-amber-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            À surveiller ({stats.surveiller})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatut("URGENT")}
            className={`px-2 py-1 rounded-lg font-bold border transition-all flex items-center gap-1 ${
              filterStatut === "URGENT"
                ? "bg-red-600 text-white border-red-600"
                : "bg-red-50 text-red-900 border-red-200"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Urgent ({stats.urgent})
          </button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon="⚡"
          onClick={handleToutMarquerOK}
          className="!text-[11px] !py-1 !px-2.5"
        >
          Tout marquer OK
        </Button>
      </div>

      {/* Grille des points de contrôle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
        {displayedPoints.map((p) => {
          const rawVal = checklist[p.id];
          const val = rawVal === true ? "OK" : rawVal;

          return (
            <div
              key={p.id}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                val === "URGENT"
                  ? "border-red-300 bg-red-50/80 shadow-sm"
                  : val === "SURVEILLER"
                  ? "border-amber-300 bg-amber-50/80 shadow-sm"
                  : val === "OK"
                  ? "border-emerald-300 bg-emerald-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-lg shrink-0">{p.icon}</span>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      val === "URGENT"
                        ? "text-red-950 font-black"
                        : val === "SURVEILLER"
                        ? "text-amber-950"
                        : val === "OK"
                        ? "text-emerald-950"
                        : "text-slate-800"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[10px] text-slate-400">{p.cat}</div>
                </div>
              </div>

              {/* Sélecteur d'état à 3 boutons : OK / Surveiller / Urgent */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title="OK (Aucune action nécessaire)"
                  onClick={() => handleSetStatut(p.id, "OK")}
                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center ${
                    val === "OK"
                      ? "bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-700"
                      : "bg-slate-100 text-slate-400 hover:bg-emerald-100 hover:text-emerald-700"
                  }`}
                >
                  ✓
                </button>
                <button
                  type="button"
                  title="À SURVEILLER (À prévoir prochainement)"
                  onClick={() => handleSetStatut(p.id, "SURVEILLER")}
                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center ${
                    val === "SURVEILLER"
                      ? "bg-amber-500 text-white shadow-sm ring-1 ring-amber-600"
                      : "bg-slate-100 text-slate-400 hover:bg-amber-100 hover:text-amber-700"
                  }`}
                >
                  ⚠
                </button>
                <button
                  type="button"
                  title="URGENT (Intervention recommandée)"
                  onClick={() => handleSetStatut(p.id, "URGENT")}
                  className={`w-7 h-7 rounded-lg text-xs font-black transition-all flex items-center justify-center ${
                    val === "URGENT"
                      ? "bg-red-600 text-white shadow-sm ring-1 ring-red-700"
                      : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-700"
                  }`}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Alerte si des points urgents sont détectés */}
      {stats.urgent > 0 && (
        <div className="p-2.5 rounded-xl bg-red-100 border border-red-300 text-red-900 text-xs flex items-center justify-between">
          <span className="font-bold">
            🚨 <b>{stats.urgent} point(s) URGENT(S)</b> détecté(s) sur le véhicule.
          </span>
          <span className="text-[11px] font-semibold text-red-800">
            Intervention recommandée
          </span>
        </div>
      )}
    </div>
  );
}
