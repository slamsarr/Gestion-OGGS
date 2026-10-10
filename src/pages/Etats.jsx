import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, listCollaborateurs, listDescentes } from "../lib/api";
import { F, n, fmtDate, todayISO, T } from "../lib/calcul";
import { Section, Loading } from "../components/ui";
import { exporterCsv } from "../lib/exportExcel";
import { useFlash } from "../hooks/useFlash";

const ETAT_TYPES = [
  { id: "rapports_journaliers", nom: "Rapports Journaliers", description: "Rapports de caisse complets par station et date" },
  { id: "descentes_pompistes", nom: "Descentes Pompistes", description: "Descentes individuelles par pompiste et date" },
  { id: "etat_detaille_pompiste", nom: "État Détaillé Pompiste", description: "État complet d'un pompiste (descentes, quarts, pistolets, performance)" },
  { id: "activite_collaborateur", nom: "Activité Collaborateur", description: "Synthèse d'activité par collaborateur sur une période" },
  { id: "performance_quart", nom: "Performance par Quart", description: "Performance par quart de travail et période" },
  { id: "etat_pistolet", nom: "État par Pistolet", description: "Volumes et valeurs par pistolet sur une période" },
  { id: "ventes_produit", nom: "Ventes par Produit", description: "Ventes de carburants, lubrifiants, gaz par période" },
  { id: "caisse", nom: "Mouvements de Caisse", description: "Versements, dépenses et écarts de caisse" },
];

export default function Etats() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "";
  const role = profil?.role || "";
  const stationScope = profil?.stations?.code || profil?.station_id?.replace("st-", "").toUpperCase() || "";

  const [ref, setRef] = useState(null);
  const [collaborateurs, setCollaborateurs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, flash] = useFlash();

  // Filtres
  const [etatType, setEtatType] = useState("rapports_journaliers");
  const [filtreStation, setFiltreStation] = useState(stationScope || "ALL");
  const [filtreCollaborateur, setFiltreCollaborateur] = useState("ALL");
  const [dateDebut, setDateDebut] = useState(todayISO());
  const [dateFin, setDateFin] = useState(todayISO());
  const [filtreStatut, setFiltreStatut] = useState("ALL");

  // Résultats
  const [donnees, setDonnees] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await loadReferentiel();
      setRef(r);
      
      const collabs = await listCollaborateurs();
      setCollaborateurs(collabs || []);
      
      setLoading(false);
    })();
  }, []);

  const genererEtat = async () => {
    setGenerating(true);
    setDonnees([]);
    
    try {
      let data = [];
      
      switch (etatType) {
        case "rapports_journaliers":
          const opts = { 
            station: filtreStation === "ALL" ? undefined : filtreStation,
            limit: 1000 // Augmenter la limite pour les périodes longues
          };
          const rapports = await listRapports(opts);
          // Filtrer par période et statut
          data = rapports.filter(r => {
            const dateRapport = r.date || r.date_rapport;
            const periodeOk = dateRapport >= dateDebut && dateRapport <= dateFin;
            const statutOk = filtreStatut === "ALL" || r.statut === filtreStatut;
            return periodeOk && statutOk;
          });
          break;
          
        case "descentes_pompistes":
          const descentes = await listDescentes(
            filtreStation === "ALL" ? undefined : filtreStation,
            undefined, // date spécifique non utilisé pour période
            filtreCollaborateur === "ALL" ? undefined : filtreCollaborateur
          );
          // Filtrer par période
          data = (descentes || []).filter(d => {
            if (!d.date) return false;
            return d.date >= dateDebut && d.date <= dateFin;
          });
          break;
          
        case "activite_collaborateur":
          if (filtreCollaborateur === "ALL") {
            flash("⚠️ Sélectionnez un collaborateur pour ce type d'état");
            setGenerating(false);
            return;
          }
          // Récupérer toutes les descentes du collaborateur sur la période
          const allDescentes = await listDescentes(
            undefined, // station
            undefined, // date spécifique
            filtreCollaborateur
          );
          // Filtrer par période
          data = (allDescentes || []).filter(d => {
            if (!d.date) return false;
            return d.date >= dateDebut && d.date <= dateFin;
          });
          break;

        case "etat_detaille_pompiste":
          if (filtreCollaborateur === "ALL") {
            flash("⚠️ Sélectionnez un pompiste pour ce type d'état");
            setGenerating(false);
            return;
          }
          // État détaillé pompiste : descentes + infos collaborateur
          const collabDetail = collaborateurs.find(c => c.id === filtreCollaborateur);
          const descentesDetail = await listDescentes(
            filtreStation === "ALL" ? undefined : filtreStation,
            undefined,
            filtreCollaborateur
          );
          const descentesPeriode = (descentesDetail || []).filter(d => {
            if (!d.date) return false;
            return d.date >= dateDebut && d.date <= dateFin;
          });
          // Enrichir avec infos du collaborateur
          data = descentesPeriode.map(d => ({
            ...d,
            pompiste_nom: collabDetail?.nom_complet || d.pompiste_nom,
            pompiste_role: collabDetail?.role || "pompiste",
            pompiste_station: collabDetail?.station_id || d.station,
          }));
          break;

        case "performance_quart":
          // Performance par quart : regrouper les descentes par quart
          const descentesQuart = await listDescentes(
            filtreStation === "ALL" ? undefined : filtreStation,
            undefined,
            filtreCollaborateur === "ALL" ? undefined : filtreCollaborateur
          );
          const descentesQuartPeriode = (descentesQuart || []).filter(d => {
            if (!d.date) return false;
            return d.date >= dateDebut && d.date <= dateFin;
          });
          // Regrouper par quart et pompiste
          const quartPerf = {};
          descentesQuartPeriode.forEach(d => {
            const key = `${d.pompiste_id}_${d.quart || "NON_DEFINI"}`;
            if (!quartPerf[key]) {
              quartPerf[key] = {
                pompiste_id: d.pompiste_id,
                pompiste_nom: d.pompiste_nom,
                quart: d.quart || "NON_DEFINI",
                nb_descentes: 0,
                total_volume: 0,
                total_valeur: 0,
                total_a_verser: 0,
                total_ecart: 0,
                dates: [],
              };
            }
            quartPerf[key].nb_descentes++;
            quartPerf[key].total_volume += (d.volume || 0);
            quartPerf[key].total_valeur += (d.valeur || 0);
            quartPerf[key].total_a_verser += (d.a_verser || 0);
            quartPerf[key].total_ecart += (d.ecart || 0);
            if (!quartPerf[key].dates.includes(d.date)) {
              quartPerf[key].dates.push(d.date);
            }
          });
          data = Object.values(quartPerf);
          break;

        case "etat_pistolet":
          // État par pistolet : volumes par pistolet
          const descentesPistolet = await listDescentes(
            filtreStation === "ALL" ? undefined : filtreStation,
            undefined,
            filtreCollaborateur === "ALL" ? undefined : filtreCollaborateur
          );
          const descentesPistoletPeriode = (descentesPistolet || []).filter(d => {
            if (!d.date) return false;
            return d.date >= dateDebut && d.date <= dateFin;
          });
          // Regrouper par pistolet
          const pistoletPerf = {};
          descentesPistoletPeriode.forEach(d => {
            if (d.pistolets && Array.isArray(d.pistolets)) {
              d.pistolets.forEach(p => {
                const key = p.code || p;
                if (!pistoletPerf[key]) {
                  pistoletPerf[key] = {
                    pistolet: key,
                    nb_utilisations: 0,
                    total_volume: 0,
                    total_valeur: 0,
                    pompistes: new Set(),
                  };
                }
                pistoletPerf[key].nb_utilisations++;
                pistoletPerf[key].total_volume += (d.volume || 0) / (d.pistolets?.length || 1);
                pistoletPerf[key].total_valeur += (d.valeur || 0) / (d.pistolets?.length || 1);
                pistoletPerf[key].pompistes.add(d.pompiste_id);
              });
            }
          });
          data = Object.values(pistoletPerf).map(p => ({
            ...p,
            pompistes: Array.from(p.pompistes),
          }));
          break;
          
        case "ventes_produit":
          const rapportVentes = await listRapports({
            station: filtreStation === "ALL" ? undefined : filtreStation,
            limit: 1000
          });
          data = rapportVentes.filter(r => {
            const dateRapport = r.date || r.date_rapport;
            const periodeOk = dateRapport >= dateDebut && dateRapport <= dateFin;
            const statutOk = filtreStatut === "ALL" || r.statut === filtreStatut;
            return periodeOk && statutOk;
          });
          break;
          
        case "caisse":
          const rapportCaisse = await listRapports({
            station: filtreStation === "ALL" ? undefined : filtreStation,
            limit: 1000
          });
          data = rapportCaisse.filter(r => {
            const dateRapport = r.date || r.date_rapport;
            const periodeOk = dateRapport >= dateDebut && dateRapport <= dateFin;
            const statutOk = filtreStatut === "ALL" || r.statut === filtreStatut;
            return periodeOk && statutOk;
          });
          break;
          
        default:
          data = [];
      }
      
      setDonnees(data);
      flash(`✓ ${data.length} enregistrement(s) trouvé(s)`);
    } catch (e) {
      flash("Erreur génération état : " + (e.message || e));
    } finally {
      setGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    if (donnees.length === 0) {
      flash("⚠️ Aucune donnée à exporter");
      return;
    }

    try {
      let rows = [];
      let filename = "";
      
      switch (etatType) {
        case "rapports_journaliers":
          rows = [
            ["Station", "Date", "Gérant", "CA Total", "Écart Caisse", "Statut"],
            ...donnees.map(r => [
              r.station,
              fmtDate(r.date || r.date_rapport),
              r.gerant || "",
              F(r.ca_total),
              F(r.ecart_caisse),
              r.statut
            ])
          ];
          filename = `Rapports_Journaliers_${dateDebut}_${dateFin}.xlsx`;
          break;
          
        case "descentes_pompistes":
          rows = [
            ["Date", "Pompiste", "Station", "Index Départ", "Index Fin", "Volume", "Valeur", "À Verser", "Écart"],
            ...donnees.map(d => [
              fmtDate(d.date),
              d.pompiste_nom || d.pompiste_id,
              d.station || filtreStation,
              d.index_depart || 0,
              d.index_fin || 0,
              d.volume || 0,
              F(d.valeur || 0),
              F(d.a_verser || 0),
              F(d.ecart || 0)
            ])
          ];
          filename = `Descentes_Pompistes_${dateDebut}_${dateFin}.xlsx`;
          break;
          
        case "activite_collaborateur":
          const collab = collaborateurs.find(c => c.id === filtreCollaborateur);
          const totalVolume = donnees.reduce((s, d) => s + (d.volume || 0), 0);
          const totalValeur = donnees.reduce((s, d) => s + (d.valeur || 0), 0);
          const totalAVerser = donnees.reduce((s, d) => s + (d.a_verser || 0), 0);
          const totalEcart = donnees.reduce((s, d) => s + (d.ecart || 0), 0);
          
          rows = [
            ["Collaborateur", collab?.nom_complet || ""],
            ["Rôle", collab?.role || ""],
            ["Station", stations.find(s => s.id === collab?.station_id)?.nom || ""],
            ["Période", `${dateDebut} à ${dateFin}`],
            [],
            ["Date", "Station", "Volume", "Valeur", "À Verser", "Écart"],
            ...donnees.map(d => [
              fmtDate(d.date),
              d.station || filtreStation,
              d.volume || 0,
              F(d.valeur || 0),
              F(d.a_verser || 0),
              F(d.ecart || 0)
            ]),
            [],
            ["TOTAL", "", totalVolume, F(totalValeur), F(totalAVerser), F(totalEcart)]
          ];
          filename = `Activite_${collab?.nom_complet || "Collaborateur"}_${dateDebut}_${dateFin}.xlsx`;
          break;

        case "etat_detaille_pompiste":
          const pompisteDetail = collaborateurs.find(c => c.id === filtreCollaborateur);
          const totalVolDetail = donnees.reduce((s, d) => s + (d.volume || 0), 0);
          const totalValDetail = donnees.reduce((s, d) => s + (d.valeur || 0), 0);
          const totalAVerserDetail = donnees.reduce((s, d) => s + (d.a_verser || 0), 0);
          const totalEcartDetail = donnees.reduce((s, d) => s + (d.ecart || 0), 0);
          
          rows = [
            ["ÉTAT DÉTAILLÉ POMPISTE"],
            [],
            ["Pompiste", pompisteDetail?.nom_complet || ""],
            ["Rôle", pompisteDetail?.role || "pompiste"],
            ["Station", stations.find(s => s.id === pompisteDetail?.station_id)?.nom || ""],
            ["Téléphone", pompisteDetail?.telephone || ""],
            ["Email", pompisteDetail?.email || ""],
            ["Statut", pompisteDetail?.actif !== false ? "Actif" : "Suspendu"],
            [],
            ["Période", `${dateDebut} à ${dateFin}`],
            ["Nombre de descentes", donnees.length],
            [],
            ["Date", "Station", "Index Départ", "Index Fin", "Volume", "Valeur", "À Verser", "Écart", "Quart"],
            ...donnees.map(d => [
              fmtDate(d.date),
              d.station || filtreStation,
              d.index_depart || 0,
              d.index_fin || 0,
              d.volume || 0,
              F(d.valeur || 0),
              F(d.a_verser || 0),
              F(d.ecart || 0),
              d.quart || "NON_DEFINI"
            ]),
            [],
            ["TOTAL", "", "", "", totalVolDetail, F(totalValDetail), F(totalAVerserDetail), F(totalEcartDetail), ""]
          ];
          filename = `Etat_Detaille_${pompisteDetail?.nom_complet || "Pompiste"}_${dateDebut}_${dateFin}.xlsx`;
          break;

        case "performance_quart":
          rows = [
            ["PERFORMANCE PAR QUART"],
            [],
            ["Période", `${dateDebut} à ${dateFin}`],
            [],
            ["Pompiste", "Quart", "Nb Descentes", "Jours Travaillés", "Total Volume", "Total Valeur", "Total À Verser", "Total Écart", "Moyenne Volume/Jour"],
            ...donnees.map(d => [
              d.pompiste_nom || d.pompiste_id,
              d.quart,
              d.nb_descentes,
              d.dates.length,
              d.total_volume,
              F(d.total_valeur),
              F(d.total_a_verser),
              F(d.total_ecart),
              d.dates.length > 0 ? (d.total_volume / d.dates.length).toFixed(2) : 0
            ])
          ];
          filename = `Performance_Quart_${dateDebut}_${dateFin}.xlsx`;
          break;

        case "etat_pistolet":
          rows = [
            ["ÉTAT PAR PISTOLET"],
            [],
            ["Période", `${dateDebut} à ${dateFin}`],
            [],
            ["Pistolet", "Nb Utilisations", "Total Volume", "Total Valeur", "Nb Pompistes Différents"],
            ...donnees.map(d => [
              d.pistolet,
              d.nb_utilisations,
              d.total_volume.toFixed(2),
              F(d.total_valeur),
              d.pompistes.length
            ])
          ];
          filename = `Etat_Pistolet_${dateDebut}_${dateFin}.xlsx`;
          break;
          
        case "ventes_produit":
          rows = [
            ["Station", "Date", "Volume Gasoil", "Valeur Gasoil", "Volume Super", "Valeur Super", "CA Total"],
            ...donnees.map(r => [
              r.station,
              fmtDate(r.date || r.date_rapport),
              r.vol_gasoil || 0,
              F(r.vol_gasoil * r.prix_gasoil || 0),
              r.vol_super || 0,
              F(r.vol_super * r.prix_super || 0),
              F(r.ca_total)
            ])
          ];
          filename = `Ventes_Produit_${dateDebut}_${dateFin}.xlsx`;
          break;
          
        case "caisse":
          rows = [
            ["Station", "Date", "CA Total", "BIS", "Dépenses", "Tickets", "Écart Caisse", "Statut"],
            ...donnees.map(r => [
              r.station,
              fmtDate(r.date || r.date_rapport),
              F(r.ca_total),
              F(r.bis || 0),
              F(r.depenses || 0),
              F(r.tickets || 0),
              F(r.ecart_caisse),
              r.statut
            ])
          ];
          filename = `Mouvements_Caisse_${dateDebut}_${dateFin}.xlsx`;
          break;
      }
      
      exporterCsv(filename, rows);
      flash("✓ Export Excel généré avec succès");
    } catch (e) {
      flash("Erreur export : " + (e.message || e));
    }
  };

  if (loading) return <Loading label="Chargement des données..." />;

  const stations = ref?.stations || [];
  const collabsFiltres = collaborateurs.filter(c => 
    filtreStation === "ALL" || c.station_id === filtreStation
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>États & Rapports</h1>
        <p className="text-sm" style={{ color: T.muted }}>
          Génération d'états avec filtres avancés (collaborateur, date, station, etc.)
        </p>
      </div>

      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Section Filtres */}
      <Section titre="🔍 Critères de sélection" aside="Configurez vos filtres">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Type d'état */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Type d'état</label>
            <select
              value={etatType}
              onChange={(e) => setEtatType(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              {ETAT_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.nom}</option>
              ))}
            </select>
            <p className="text-[10px] mt-1" style={{ color: T.muted }}>
              {ETAT_TYPES.find(t => t.id === etatType)?.description}
            </p>
          </div>

          {/* Station */}
          {role !== "gerant" && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Station</label>
              <select
                value={filtreStation}
                onChange={(e) => setFiltreStation(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                style={{ borderColor: T.line }}
              >
                <option value="ALL">Toutes les stations</option>
                {stations.map(s => (
                  <option key={s.id} value={s.code}>{s.code} — {s.nom}</option>
                ))}
              </select>
            </div>
          )}

          {/* Collaborateur */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Collaborateur</label>
            <select
              value={filtreCollaborateur}
              onChange={(e) => setFiltreCollaborateur(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            >
              <option value="ALL">Tous les collaborateurs</option>
              {collabsFiltres.map(c => (
                <option key={c.id} value={c.id}>{c.nom_complet} ({c.role})</option>
              ))}
            </select>
          </div>

          {/* Date début */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Date début</label>
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>

          {/* Date fin */}
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Date fin</label>
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              style={{ borderColor: T.line }}
            />
          </div>

          {/* Statut (pour rapports) */}
          {(etatType === "rapports_journaliers" || etatType === "ventes_produit" || etatType === "caisse") && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: T.muted }}>Statut</label>
              <select
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                style={{ borderColor: T.line }}
              >
                <option value="ALL">Tous les statuts</option>
                <option value="BROUILLON">Brouillon</option>
                <option value="SOUMIS">Soumis</option>
                <option value="VALIDE">Validé</option>
                <option value="REJETE">Rejeté</option>
              </select>
            </div>
          )}

          {/* Message pour types nécessitant un collaborateur */}
          {(etatType === "etat_detaille_pompiste" || etatType === "activite_collaborateur") && filtreCollaborateur === "ALL" && (
            <div className="col-span-3">
              <p className="text-xs" style={{ color: "#B7791F" }}>
                ⚠️ Ce type d'état nécessite la sélection d'un collaborateur spécifique
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={genererEtat}
            disabled={generating}
            className="px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50"
            style={{ background: T.petrol }}
          >
            {generating ? "Génération..." : "🔍 Générer l'état"}
          </button>
          {donnees.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="px-4 py-2 rounded text-sm font-medium border"
              style={{ borderColor: T.line, color: T.petrol }}
            >
              📊 Exporter Excel
            </button>
          )}
        </div>
      </Section>

      {/* Résultats */}
      {donnees.length > 0 && (
        <Section titre={`📋 Résultats (${donnees.length} enregistrement(s))`} aside={`${dateDebut} → ${dateFin}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b" style={{ borderColor: T.line }}>
                <tr>
                  {etatType === "rapports_journaliers" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Station</th>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-left font-medium">Gérant</th>
                      <th className="py-2 px-3 text-right font-medium">CA Total</th>
                      <th className="py-2 px-3 text-right font-medium">Écart</th>
                      <th className="py-2 px-3 text-center font-medium">Statut</th>
                    </>
                  )}
                  {etatType === "descentes_pompistes" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-left font-medium">Pompiste</th>
                      <th className="py-2 px-3 text-right font-medium">Volume</th>
                      <th className="py-2 px-3 text-right font-medium">Valeur</th>
                      <th className="py-2 px-3 text-right font-medium">À Verser</th>
                      <th className="py-2 px-3 text-right font-medium">Écart</th>
                    </>
                  )}
                  {etatType === "activite_collaborateur" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-right font-medium">Volume</th>
                      <th className="py-2 px-3 text-right font-medium">Valeur</th>
                      <th className="py-2 px-3 text-right font-medium">À Verser</th>
                      <th className="py-2 px-3 text-right font-medium">Écart</th>
                    </>
                  )}
                  {etatType === "etat_detaille_pompiste" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-left font-medium">Station</th>
                      <th className="py-2 px-3 text-right font-medium">Index Départ</th>
                      <th className="py-2 px-3 text-right font-medium">Index Fin</th>
                      <th className="py-2 px-3 text-right font-medium">Volume</th>
                      <th className="py-2 px-3 text-right font-medium">Valeur</th>
                      <th className="py-2 px-3 text-right font-medium">À Verser</th>
                      <th className="py-2 px-3 text-right font-medium">Écart</th>
                      <th className="py-2 px-3 text-center font-medium">Quart</th>
                    </>
                  )}
                  {etatType === "performance_quart" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Pompiste</th>
                      <th className="py-2 px-3 text-left font-medium">Quart</th>
                      <th className="py-2 px-3 text-right font-medium">Nb Descentes</th>
                      <th className="py-2 px-3 text-right font-medium">Jours</th>
                      <th className="py-2 px-3 text-right font-medium">Total Volume</th>
                      <th className="py-2 px-3 text-right font-medium">Total Valeur</th>
                      <th className="py-2 px-3 text-right font-medium">Total À Verser</th>
                      <th className="py-2 px-3 text-right font-medium">Total Écart</th>
                      <th className="py-2 px-3 text-right font-medium">Moy. Vol/Jour</th>
                    </>
                  )}
                  {etatType === "etat_pistolet" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Pistolet</th>
                      <th className="py-2 px-3 text-right font-medium">Nb Utilisations</th>
                      <th className="py-2 px-3 text-right font-medium">Total Volume</th>
                      <th className="py-2 px-3 text-right font-medium">Total Valeur</th>
                      <th className="py-2 px-3 text-right font-medium">Nb Pompistes</th>
                    </>
                  )}
                  {etatType === "ventes_produit" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Station</th>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-right font-medium">Vol. Gasoil</th>
                      <th className="py-2 px-3 text-right font-medium">Val. Gasoil</th>
                      <th className="py-2 px-3 text-right font-medium">Vol. Super</th>
                      <th className="py-2 px-3 text-right font-medium">Val. Super</th>
                      <th className="py-2 px-3 text-right font-medium">CA Total</th>
                    </>
                  )}
                  {etatType === "caisse" && (
                    <>
                      <th className="py-2 px-3 text-left font-medium">Station</th>
                      <th className="py-2 px-3 text-left font-medium">Date</th>
                      <th className="py-2 px-3 text-right font-medium">CA Total</th>
                      <th className="py-2 px-3 text-right font-medium">BIS</th>
                      <th className="py-2 px-3 text-right font-medium">Dépenses</th>
                      <th className="py-2 px-3 text-right font-medium">Tickets</th>
                      <th className="py-2 px-3 text-right font-medium">Écart</th>
                      <th className="py-2 px-3 text-center font-medium">Statut</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {donnees.map((d, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50" style={{ borderColor: T.line }}>
                    {etatType === "rapports_journaliers" && (
                      <>
                        <td className="py-2 px-3 font-medium">{d.station}</td>
                        <td className="py-2 px-3">{fmtDate(d.date || d.date_rapport)}</td>
                        <td className="py-2 px-3">{d.gerant || "—"}</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.ca_total)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.ecart_caisse)) > 5000 ? T.alert : T.muted }}>{F(d.ecart_caisse)} F</td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                            background: { BROUILLON: "#F3F4F6", SOUMIS: "#FEF3C7", VALIDE: "#D1FAE5", REJETE: "#FEE2E2" }[d.statut],
                            color: { BROUILLON: "#6B7280", SOUMIS: "#D97706", VALIDE: "#059669", REJETE: "#DC2626" }[d.statut]
                          }}>{d.statut}</span>
                        </td>
                      </>
                    )}
                    {etatType === "descentes_pompistes" && (
                      <>
                        <td className="py-2 px-3">{fmtDate(d.date)}</td>
                        <td className="py-2 px-3 font-medium">{d.pompiste_nom || d.pompiste_id}</td>
                        <td className="py-2 px-3 text-right tabular">{d.volume || 0} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.valeur || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.a_verser || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.ecart)) > 1000 ? T.alert : T.muted }}>{F(d.ecart || 0)} F</td>
                      </>
                    )}
                    {etatType === "activite_collaborateur" && (
                      <>
                        <td className="py-2 px-3">{fmtDate(d.date)}</td>
                        <td className="py-2 px-3 text-right tabular">{d.volume || 0} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.valeur || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.a_verser || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.ecart)) > 1000 ? T.alert : T.muted }}>{F(d.ecart || 0)} F</td>
                      </>
                    )}
                    {etatType === "etat_detaille_pompiste" && (
                      <>
                        <td className="py-2 px-3">{fmtDate(d.date)}</td>
                        <td className="py-2 px-3 font-medium">{d.station || filtreStation}</td>
                        <td className="py-2 px-3 text-right tabular">{d.index_depart || 0}</td>
                        <td className="py-2 px-3 text-right tabular">{d.index_fin || 0}</td>
                        <td className="py-2 px-3 text-right tabular">{d.volume || 0} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.valeur || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.a_verser || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.ecart)) > 1000 ? T.alert : T.muted }}>{F(d.ecart || 0)} F</td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{d.quart || "—"}</span>
                        </td>
                      </>
                    )}
                    {etatType === "performance_quart" && (
                      <>
                        <td className="py-2 px-3 font-medium">{d.pompiste_nom || d.pompiste_id}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">{d.quart}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular">{d.nb_descentes}</td>
                        <td className="py-2 px-3 text-right tabular">{d.dates.length}</td>
                        <td className="py-2 px-3 text-right tabular">{d.total_volume.toFixed(2)} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.total_valeur)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.total_a_verser)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.total_ecart)) > 5000 ? T.alert : T.muted }}>{F(d.total_ecart)} F</td>
                        <td className="py-2 px-3 text-right tabular">{d.dates.length > 0 ? (d.total_volume / d.dates.length).toFixed(2) : 0} L</td>
                      </>
                    )}
                    {etatType === "etat_pistolet" && (
                      <>
                        <td className="py-2 px-3 font-medium">{d.pistolet}</td>
                        <td className="py-2 px-3 text-right tabular">{d.nb_utilisations}</td>
                        <td className="py-2 px-3 text-right tabular">{d.total_volume.toFixed(2)} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.total_valeur)} F</td>
                        <td className="py-2 px-3 text-right tabular">{d.pompistes.length}</td>
                      </>
                    )}
                    {etatType === "ventes_produit" && (
                      <>
                        <td className="py-2 px-3 font-medium">{d.station}</td>
                        <td className="py-2 px-3">{fmtDate(d.date || d.date_rapport)}</td>
                        <td className="py-2 px-3 text-right tabular">{d.vol_gasoil || 0} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.vol_gasoil * d.prix_gasoil || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{d.vol_super || 0} L</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.vol_super * d.prix_super || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular font-bold">{F(d.ca_total)} F</td>
                      </>
                    )}
                    {etatType === "caisse" && (
                      <>
                        <td className="py-2 px-3 font-medium">{d.station}</td>
                        <td className="py-2 px-3">{fmtDate(d.date || d.date_rapport)}</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.ca_total)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.bis || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.depenses || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular">{F(d.tickets || 0)} F</td>
                        <td className="py-2 px-3 text-right tabular" style={{ color: Math.abs(n(d.ecart_caisse)) > 5000 ? T.alert : T.muted }}>{F(d.ecart_caisse)} F</td>
                        <td className="py-2 px-3 text-center">
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ 
                            background: { BROUILLON: "#F3F4F6", SOUMIS: "#FEF3C7", VALIDE: "#D1FAE5", REJETE: "#FEE2E2" }[d.statut],
                            color: { BROUILLON: "#6B7280", SOUMIS: "#D97706", VALIDE: "#059669", REJETE: "#DC2626" }[d.statut]
                          }}>{d.statut}</span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {donnees.length === 0 && !generating && (
        <div className="text-center py-8" style={{ color: T.muted }}>
          <p className="text-sm">Configurez les filtres et cliquez sur "Générer l'état" pour afficher les résultats</p>
        </div>
      )}
    </div>
  );
}
