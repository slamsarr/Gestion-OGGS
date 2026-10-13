import React, { useState, useMemo } from "react";
import { Badge, Button } from "../ui";

const F = (v) => Number(v || 0).toLocaleString("fr-FR");

export const STAR_CARE_TARIFS = [
  // ── FORFAITS VIDANGE & RÉVISION
  {
    cat: "FORFAITS",
    code: "PACK_ESSENTIEL",
    nom: "Pack Essentiel — Sécurité & Niveaux",
    description: "Huile moteur CEPSA Genuine 15W40 MAX + Filtre à huile + 20 points de contrôle",
    details: "Contrôle niveaux et sécurité de base. Option 10W40 MAX disponible à +10 000 F.",
    prix: 40000,
    prixBase: 20000,
    pts: 20,
    emoji: "🛡️",
    badge: "Essentiel",
    duree: "35 min",
  },
  {
    cat: "FORFAITS",
    code: "PACK_CONFORT",
    nom: "Pack Confort — Sécurité & Préventif",
    description: "Huile moteur CEPSA Genuine 10W40 MAX + Filtre à huile + Filtre à air + Filtre habitacle + 40 points de contrôle",
    details: "Le pack le plus recommandé pour préserver la mécanique et la climatisation.",
    prix: 75000,
    prixBase: 30000,
    pts: 40,
    emoji: "⭐",
    badge: "Plus Populaire",
    populaire: true,
    duree: "50 min",
  },
  {
    cat: "FORFAITS",
    code: "PACK_PREMIUM",
    nom: "Pack Premium — Diagnostic Électronique & Exhaustif",
    description: "Huile moteur CEPSA Genuine 10W40 MAX + 4 Filtres (huile, air, habitacle, carburant) + Diagnostic valise OBD + 60 points de contrôle",
    details: "Excellence Star Care : diagnostic électronique OBD complet, effacement défauts, transmissions et trains roulants.",
    prix: 90000,
    prixBase: 55000,
    pts: 60,
    emoji: "👑",
    badge: "Excellence",
    duree: "75 min",
  },

  // ── BOÎTE MANUELLE & PONT
  {
    cat: "TRANSMISSION",
    code: "BOITE_CONTROLE",
    nom: "Contrôle Niveau Boîte Manuelle",
    description: "Contrôle niveau, étanchéité carter et suintements",
    prix: 20000,
    emoji: "⚙️",
    duree: "25 min",
  },
  {
    cat: "TRANSMISSION",
    code: "BOITE_VIDANGE",
    nom: "Vidange Boîte Manuelle",
    description: "Vidange complète boîte et renouvellement huile transmission haute pression",
    prix: 28000,
    emoji: "🔩",
    duree: "40 min",
  },
  {
    cat: "TRANSMISSION",
    code: "BOITE_PONT_VIDANGE",
    nom: "Vidange Boîte + Pont Différentiel",
    description: "Vidange intégrale boîte et différentiel pour 4x4, pick-up et propulsions",
    prix: 45000,
    emoji: "🚜",
    duree: "60 min",
  },

  // ── FREINAGE
  {
    cat: "FREINAGE",
    code: "FREIN_CONTROLE",
    nom: "Contrôle & Dépoussiérage Freinage",
    description: "Dépoussiérage des garnitures/étriers et mesure d'usure des disques",
    prix: 15000,
    emoji: "🛑",
    duree: "30 min",
  },
  {
    cat: "FREINAGE",
    code: "PLAQUETTES",
    nom: "Remplacement Plaquettes de Frein",
    description: "Pose plaquettes neuves certifiées et vérification liquide de frein",
    prix: 25000,
    emoji: "🛑",
    duree: "45 min",
  },
  {
    cat: "FREINAGE",
    code: "DISQUES_PLAQUETTES",
    nom: "Remplacement Disques & Plaquettes",
    description: "Remplacement intégral disques de frein ventilés et jeu de plaquettes",
    prix: 45000,
    emoji: "🔴",
    duree: "60 min",
  },

  // ── CLIMATISATION
  {
    cat: "CLIMATISATION",
    code: "CLIM_CONTROLE",
    nom: "Contrôle Efficacité Climatisation",
    description: "Mesure delta de température et contrôle de charge du compresseur",
    prix: 20000,
    emoji: "❄️",
    duree: "20 min",
  },
  {
    cat: "CLIMATISATION",
    code: "CLIM_RECHARGE",
    nom: "Recharge Gaz Clim + Filtre Habitacle",
    description: "Tirage au vide, détection fuite, recharge gaz réfrigérant et filtre habitacle neuf",
    prix: 28000,
    emoji: "🧊",
    duree: "45 min",
  },
  {
    cat: "CLIMATISATION",
    code: "CLIM_TRAITEMENT",
    nom: "Traitement Antibactérien & Assainissement",
    description: "Désinfection intégrale des conduits d'aération contre odeurs et bactéries",
    prix: 35000,
    emoji: "💨",
    duree: "30 min",
  },

  // ── PNEUMATIQUE
  {
    cat: "PNEUMATIQUE",
    code: "PNEU_MONTAGE_2",
    nom: "Montage & Équilibrage (2 Pneus)",
    description: "Montage, valves neuves et équilibrage de 2 pneumatiques",
    prix: 5000,
    emoji: "🛞",
    duree: "25 min",
  },
  {
    cat: "PNEUMATIQUE",
    code: "PNEU_MONTAGE_4",
    nom: "Montage & Équilibrage (4 Pneus)",
    description: "Montage, valves neuves et équilibrage complet des 4 roues",
    prix: 10000,
    emoji: "🛞",
    duree: "40 min",
  },
  {
    cat: "PNEUMATIQUE",
    code: "PNEU_PERMUTATION",
    nom: "Permutation + Équilibrage Complet (4 Roues)",
    description: "Permutation croisée AV/AR et rééquilibrage complet des 4 pneumatiques",
    prix: 20000,
    emoji: "🔄",
    duree: "45 min",
  },
  {
    cat: "PNEUMATIQUE",
    code: "GEOMETRIE",
    nom: "Géométrie / Parallélisme Train Roulant",
    description: "Réglage au banc laser du parallélisme et contrôle des trains roulants",
    prix: 15000,
    emoji: "📐",
    duree: "40 min",
  },

  // ── BATTERIE & ÉLECTRICITÉ
  {
    cat: "ELECTRICITE",
    code: "BAT_CONTROLE",
    nom: "Contrôle Tension & Test de Charge",
    description: "Test de capacité batterie, testeur électronique et contrôle alternateur",
    prix: 5000,
    emoji: "⚡",
    duree: "15 min",
  },
  {
    cat: "ELECTRICITE",
    code: "BATTERIE",
    nom: "Remplacement Batterie & Pose",
    description: "Dépose ancienne batterie, pose batterie neuve, graissage cosses et test",
    prix: 10000,
    emoji: "🔋",
    duree: "20 min",
  },
  {
    cat: "ELECTRICITE",
    code: "BAT_DEMARRAGE_DIAG",
    nom: "Diagnostic Circuit Démarrage & Alternateur",
    description: "Contrôle débit alternateur, chute de tension et solénoïde démarreur",
    prix: 15000,
    emoji: "🔌",
    duree: "30 min",
  },

  // ── CONTRÔLE TECHNIQUE
  {
    cat: "CONTROLE_TECHNIQUE",
    code: "CT_PRE_CONTROLE",
    nom: "Pré-Contrôle Technique Visuel",
    description: "Contrôle des points sensibles soumis à contre-visite officielle",
    prix: 10000,
    emoji: "📋",
    duree: "30 min",
  },
  {
    cat: "CONTROLE_TECHNIQUE",
    code: "CT_DIAG_ELECTRONIQUE",
    nom: "Diagnostic Électronique & Pollution Pré-CT",
    description: "Scan valise OBD des défauts calculateurs et contrôle opacité/pollution",
    prix: 15000,
    emoji: "💻",
    duree: "35 min",
  },
  {
    cat: "CONTROLE_TECHNIQUE",
    code: "CT_PREPA_COMPLETE",
    nom: "Préparation Complète & Passage Visite CT",
    description: "Remise à niveau, réglages éclairage/freins et prise en charge intégrale",
    prix: 30000,
    emoji: "🎖️",
    duree: "60 min",
  },

  // ── LAVAGE & ESTHÉTIQUE AUTOMOBILE
  {
    cat: "ESTHETIQUE",
    code: "LAVAGE_EXTERIEUR",
    nom: "Lavage Extérieur Haute Pression",
    description: "Mousse active, lavage HP, séchage peau de chamois et brillance pneus",
    prix: 3000,
    emoji: "🚿",
    duree: "20 min",
  },
  {
    cat: "ESTHETIQUE",
    code: "LAVAGE_INTERIEUR",
    nom: "Lavage Intérieur Soigné",
    description: "Aspiration intégrale moquettes/sièges, plastiques et vitres intérieures",
    prix: 10000,
    emoji: "✨",
    duree: "35 min",
  },
  {
    cat: "ESTHETIQUE",
    code: "LAVAGE_COMPLET",
    nom: "Lavage Complet Intérieur + Extérieur",
    description: "Formule combinée lavage extérieur complet et intérieur en profondeur",
    prix: 12000,
    emoji: "🧼",
    duree: "50 min",
  },
  {
    cat: "ESTHETIQUE",
    code: "NETTOYAGE_MOTEUR",
    nom: "Nettoyage Compartiment Moteur",
    description: "Dégraissage minutieux du bloc moteur et protection durites",
    prix: 8000,
    emoji: "🔥",
    duree: "25 min",
  },
  {
    cat: "ESTHETIQUE",
    code: "POLISSAGE_CARROSSERIE",
    nom: "Polissage Carrosserie Lustrage Express",
    description: "Suppression micro-rayures et lustrage brillant à la polisseuse",
    prix: 25000,
    emoji: "🪞",
    duree: "75 min",
  },
  {
    cat: "ESTHETIQUE",
    code: "TRAITEMENT_CARROSSERIE",
    nom: "Traitement Protection Carrosserie & Cire",
    description: "Pose d'une cire de protection déperlante anti-UV et anti-poussière",
    prix: 30000,
    emoji: "💎",
    duree: "90 min",
  },
];

export const CEPSA_HUILES_OFFICIELLES = [
  {
    code: "LUB-CEPSA-15W40-5L",
    nom: "CEPSA Genuine 15W40 MAX 5L",
    grade: "15W40 Mineral MAX",
    contenance: "Bidon 5L",
    prixTTC: 16000,
    packInclus: "Pack Essentiel",
    caracteristiques: "Haute résistance thermique, protection optimale des moteurs diesel et essence kilométrés.",
  },
  {
    code: "LUB-CEPSA-10W40-5L",
    nom: "CEPSA Genuine 10W40 MAX 5L",
    grade: "10W40 Semi-synthèse MAX",
    contenance: "Bidon 5L",
    prixTTC: 25000,
    packInclus: "Pack Confort & Pack Premium",
    caracteristiques: "Technologie semi-synthétique, démarrages à froid facilités et longévité moteur accrue.",
  },
  {
    code: "OPT-10W40",
    nom: "Option surclassement 10W40 MAX",
    grade: "Supplément Pack Essentiel",
    contenance: "Option vidange",
    prixTTC: 10000,
    packInclus: "Option Pack Essentiel",
    caracteristiques: "Permet de bénéficier de la semi-synthèse CEPSA 10W40 MAX dans le Pack Essentiel.",
  },
];

export default function StarCareGrilleModal({ isOpen, onClose, onSelectService }) {
  const [filterCat, setFilterCat] = useState("ALL");
  const [search, setSearch] = useState("");

  const categories = [
    { id: "ALL", label: "Toutes les offres", icon: "📑" },
    { id: "FORFAITS", label: "Grands Forfaits", icon: "🛡️" },
    { id: "TRANSMISSION", label: "Boîte & Pont", icon: "⚙️" },
    { id: "FREINAGE", label: "Freinage", icon: "🛑" },
    { id: "CLIMATISATION", label: "Climatisation", icon: "❄️" },
    { id: "PNEUMATIQUE", label: "Pneus & Géométrie", icon: "🛞" },
    { id: "ELECTRICITE", label: "Batterie & Élec.", icon: "⚡" },
    { id: "CONTROLE_TECHNIQUE", label: "Contrôle Technique", icon: "📋" },
    { id: "ESTHETIQUE", label: "Lavage & Esthétique", icon: "🧼" },
    { id: "HUILES", label: "Huiles CEPSA", icon: "🛢️" },
  ];

  const filteredItems = useMemo(() => {
    return STAR_CARE_TARIFS.filter((item) => {
      if (filterCat !== "ALL" && item.cat !== filterCat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.nom.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
      );
    });
  }, [filterCat, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl border border-amber-200 overflow-hidden">
        {/* En-tête officiel */}
        <div className="bg-gradient-to-r from-fuelos-900 via-amber-950 to-fuelos-950 text-white p-5 sm:p-6 border-b border-amber-500/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
                ⭐
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/30">
                    STAR OIL · DAKAR
                  </span>
                  <span className="text-[11px] text-slate-300">Station Hann Maristes</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white mt-0.5">
                  STAR PREMIUM CAR CARE
                </h2>
                <p className="text-xs text-amber-200/90 font-medium">
                  Grille Tarifaire Officielle · Entretien Automobile &amp; Baie de Service
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all font-bold text-lg"
              title="Fermer"
            >
              ✕
            </button>
          </div>

          {/* Coordonnées & Engagements */}
          <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-amber-200">
              <span className="flex items-center gap-1 font-bold bg-white/10 px-2.5 py-1 rounded-lg">
                📞 RDV Atelier : <b className="text-white">77 44 39 690</b>
              </span>
              <span className="flex items-center gap-1 bg-white/10 px-2.5 py-1 rounded-lg">
                ⏱ <b>7j/7</b> — 06h30 à 22h00
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10.5px]">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-md font-semibold">
                ✓ Pièces certifiées d'origine
              </span>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded-md font-semibold">
                ✓ Sans RDV
              </span>
              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-md font-semibold">
                ✓ Prix transparents
              </span>
            </div>
          </div>
        </div>

        {/* Barre de navigation & Recherche */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2.5 items-center justify-between">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1 max-w-full">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setFilterCat(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  filterCat === c.id
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>

          <div className="w-full sm:w-60">
            <input
              type="text"
              placeholder="🔍 Rechercher une prestation…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Contenu défilable */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 bg-slate-50/50">
          {/* Section spécifique Huiles CEPSA si sélectionnée */}
          {(filterCat === "ALL" || filterCat === "HUILES") && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                  <span>🛢️</span> Tarifs Officiels Huiles Moteur CEPSA (Prix TTC)
                </h3>
                <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  Lubrifiants Agréés Star Oil
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {CEPSA_HUILES_OFFICIELLES.map((h) => (
                  <div
                    key={h.code}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/60 to-white border border-amber-200 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-black uppercase text-amber-900 font-mono">
                          {h.grade}
                        </span>
                        <Badge variant="gold" size="sm">{h.contenance}</Badge>
                      </div>
                      <h4 className="font-extrabold text-slate-900 text-sm mt-1">{h.nom}</h4>
                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                        {h.caracteristiques}
                      </p>
                      <div className="mt-2 text-[10.5px] text-amber-800 font-medium">
                        📦 Inclus dans : <b>{h.packInclus}</b>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-amber-100 flex items-center justify-between">
                      <span className="text-base font-black text-amber-900 tabular">
                        {F(h.prixTTC)} F CFA
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Prix TTC</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste des prestations */}
          {filterCat !== "HUILES" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredItems.map((item) => (
                <div
                  key={item.code}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between bg-white ${
                    item.populaire
                      ? "border-amber-400 shadow-md ring-2 ring-amber-400/20"
                      : "border-slate-200 hover:border-amber-300 hover:shadow-card"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{item.emoji}</span>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.cat}
                            </span>
                            {item.badge && (
                              <Badge variant={item.populaire ? "gold" : "primary"} size="sm">
                                {item.badge}
                              </Badge>
                            )}
                            {item.pts && (
                              <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                                {item.pts} Pts de contrôle
                              </span>
                            )}
                          </div>
                          <h4 className="font-extrabold text-slate-900 text-sm mt-1">{item.nom}</h4>
                        </div>
                      </div>
                      {item.duree && (
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                          ⏱ {item.duree}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                      {item.description}
                    </p>
                    {item.details && (
                      <p className="text-[11px] text-amber-800/90 font-medium mt-1 bg-amber-50 p-2 rounded-xl">
                        💡 {item.details}
                      </p>
                    )}
                  </div>

                  <div className="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black text-slate-900 tabular">
                        {F(item.prix)} F CFA
                      </div>
                      {item.prixBase && (
                        <div className="text-[10.5px] text-slate-500">
                          (ou base main d'œuvre : {F(item.prixBase)} F)
                        </div>
                      )}
                    </div>
                    {onSelectService && (
                      <Button
                        size="sm"
                        variant={item.populaire ? "accent" : "secondary"}
                        icon="➕"
                        onClick={() => {
                          onSelectService(item);
                          onClose();
                        }}
                      >
                        Ajouter
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredItems.length === 0 && filterCat !== "HUILES" && (
            <div className="text-center py-12 text-slate-500">
              <span className="text-3xl block mb-2">🔍</span>
              Aucune prestation trouvée pour votre recherche.
            </div>
          )}
        </div>

        {/* Pied de page modal */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Star Premium Car Care · Station Hann Maristes</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </div>
  );
}
