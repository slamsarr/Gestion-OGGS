import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listRapports, listCollaborateurs, listDescentes } from "../lib/api";
import { F, n, fmtDate, todayISO, T } from "../lib/calcul";
import { Section, Loading } from "../components/ui";
import { exporterCsv } from "../lib/exportExcel";

const ETAT_TYPES = [
  { id: "rapports_journaliers", nom: "Rapports Journaliers", description: "Rapports de caisse complets par station et date" },
  { id: "descentes_pompistes", nom: "Descentes Pompistes", description: "Descentes individuelles par pompiste et date" },
  { id: "activite_collaborateur", nom: "Activité Collaborateur", description: "Synthèse d'activité par collaborateur sur une période" },
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
  const [msg, setMsg] = useState("");

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

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };

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
