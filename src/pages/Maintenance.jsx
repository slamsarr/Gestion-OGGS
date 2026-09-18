import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listEquipements, listIncidents, createIncident, updateIncident, listMaintenances, createMaintenance } from "../lib/api";
import { F, fmtDate, n, T, todayISO } from "../lib/calcul";
import { Section, Row, Num, Loading } from "../components/ui";

export default function Maintenance() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "st-hann";
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("incidents"); // incidents | interventions | equipements
  const [msg, setMsg] = useState("");

  const [equipements, setEquipements] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [maintenances, setMaintenances] = useState([]);

  // Formulaire Déclaration Panne / Incident
  const [selectedEq, setSelectedEq] = useState("");
  const [descriptionPanne, setDescriptionPanne] = useState("");
  const [priorite, setPriorite] = useState("MOYENNE");

  // Formulaire Nouvelle Intervention
  const [intervEquipement, setIntervEquipement] = useState("");
  const [dateInterv, setDateInterv] = useState(todayISO());
  const [descriptionTravaux, setDescriptionTravaux] = useState("");
  const [piecesChangees, setPiecesChangees] = useState("");
  const [prestataire, setPrestataire] = useState("");
  const [coutMaintenance, setCoutMaintenance] = useState("");

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const loadData = async () => {
    try {
      const ref = await loadReferentiel();
      const [eqs, incs, mains] = await Promise.all([
        listEquipements(stationId).catch(() => []),
        listIncidents(stationId).catch(() => []),
        listMaintenances(stationId).catch(() => []),
      ]);
      const stationEqs = (eqs && eqs.length > 0)
        ? eqs
        : (ref?.equipements || []).filter((e) => !stationId || e.station_id === stationId).map((e) => ({
            id: e.id,
            nom: e.libelle,
            nom_equipement: e.libelle,
            type: e.type,
            etat: "FONCTIONNEL",
          }));
      setEquipements(stationEqs);
      if (stationEqs.length > 0) {
        setSelectedEq((prev) => prev || stationEqs[0].id || stationEqs[0].nom);
        setIntervEquipement((prev) => prev || stationEqs[0].id || stationEqs[0].nom);
      }
      setIncidents(incs || []);
      setMaintenances(mains || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  if (loading) return <Loading label="Chargement du module Maintenance & Équipements..." />;

  const handleDeclarerPanne = async (e) => {
    e.preventDefault();
    if (!descriptionPanne.trim()) return flash("Veuillez décrire la panne");

    const eqObj = equipements.find((eq) => (eq.id === selectedEq || eq.nom_equipement === selectedEq));
    const payload = {
      station_id: stationId,
      date_incident: todayISO(),
      equipement_id: selectedEq,
      nom_equipement: eqObj?.nom || eqObj?.nom_equipement || selectedEq,
      description_incident: descriptionPanne.trim(),
      priorite,
      statut_resolution: "OUVERT",
      signale_par: profil?.nom_complet || "Technicien",
    };

    const res = await createIncident(payload);
    if (res.ok) {
      flash("Panne signalée avec succès !");
      setDescriptionPanne("");
      loadData();
    } else {
      flash("Erreur lors de la déclaration");
    }
  };

  const handleCloturerIncident = async (id) => {
    await updateIncident(id, { statut_resolution: "RESOLU" });
    flash("Incident marqué comme résolu !");
    loadData();
  };

  const handleEnregistrerIntervention = async (e) => {
    e.preventDefault();
    if (!descriptionTravaux.trim()) return flash("Veuillez décrire les travaux effectués");

    const eqObj = equipements.find((eq) => (eq.id === intervEquipement || eq.nom_equipement === intervEquipement));
    const payload = {
      station_id: stationId,
      date_maintenance: dateInterv,
      equipement_id: intervEquipement,
      nom_equipement: eqObj?.nom || eqObj?.nom_equipement || intervEquipement,
      description_travaux: descriptionTravaux.trim(),
      pieces_changees: piecesChangees.trim(),
      prestataire: prestataire.trim() || "Interne",
      cout_maintenance: n(coutMaintenance) || 0,
      statut_maintenance: "TERMINEE",
    };

    const res = await createMaintenance(payload);
    if (res.ok) {
      flash("Intervention de maintenance enregistrée !");
      setDescriptionTravaux("");
      setPiecesChangees("");
      setPrestataire("");
      setCoutMaintenance("");
      loadData();
    } else {
      flash("Erreur lors de l'enregistrement de l'intervention");
    }
  };

  const pannesOuvertes = incidents.filter((i) => i.statut_resolution !== "RESOLU");
  const coutTotalMaintenances = maintenances.reduce((s, m) => s + (n(m.cout_maintenance) || 0), 0);

  return (
    <div className="max-w-5xl mx-auto py-4 px-3">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b" style={{ borderColor: T.line }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>
            🛠️ Maintenance & Suivi des Pannes
          </h1>
          <p className="text-xs" style={{ color: T.muted }}>
            Signalement d'incidents, interventions techniques, suivi des pièces et coûts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("incidents")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "incidents" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            ⚠️ Pannes & Incidents ({pannesOuvertes.length > 0 ? `🚨 ${pannesOuvertes.length}` : incidents.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("interventions")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "interventions" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            📋 Interventions ({F(coutTotalMaintenances)} F)
          </button>
          <button
            type="button"
            onClick={() => setTab("equipements")}
            className={`text-xs px-3 py-1.5 rounded border font-semibold ${tab === "equipements" ? "bg-amber-400 text-gray-900" : "bg-white text-gray-700"}`}
            style={{ borderColor: T.line }}
          >
            ⚙️ Parc Équipements ({equipements.length})
          </button>
        </div>
      </div>

      {msg && (
        <div className="mb-3 p-2.5 text-xs rounded font-medium" style={{ background: "#E3F4EA", color: T.ok }}>
          {msg}
        </div>
      )}

      {/* VUE 1 : PANNES & INCIDENTS */}
      {tab === "incidents" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <form onSubmit={handleDeclarerPanne} className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                🚨 Déclarer une Panne
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Équipement concerné</label>
                  <select
                    value={selectedEq}
                    onChange={(e) => setSelectedEq(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white"
                    style={{ borderColor: T.line }}
                  >
                    {equipements.map((eq) => (
                      <option key={eq.id || eq.nom_equipement} value={eq.id || eq.nom_equipement}>
                        {eq.nom || eq.nom_equipement}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Niveau de Priorité</label>
                  <select
                    value={priorite}
                    onChange={(e) => setPriorite(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white font-semibold"
                    style={{ borderColor: T.line }}
                  >
                    <option value="BASSE">Basse (gêne mineure)</option>
                    <option value="MOYENNE">Moyenne (ralentissement)</option>
                    <option value="HAUTE">Haute (pompe arrêtée)</option>
                    <option value="CRITIQUE">🚨 Critique (arrêt station / sécurité)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Description de la Panne *</label>
                  <textarea
                    rows={3}
                    placeholder="Précisez le problème rencontré (ex: blocage pistolet 3, fuite raccord, coupure groupe...)"
                    value={descriptionPanne}
                    onChange={(e) => setDescriptionPanne(e.target.value)}
                    className="w-full text-xs border rounded p-2"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: T.gold }}
                >
                  ✓ Signaler la Panne
                </button>
              </div>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                Registre des Incidents & Pannes ({incidents.length})
              </h3>
              {incidents.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">Aucune panne signalée. Tout fonctionne normalement !</p>
              ) : (
                <div className="divide-y" style={{ borderColor: T.line }}>
                  {incidents.map((inc) => {
                    const resolu = inc.statut_resolution === "RESOLU";
                    return (
                      <div key={inc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{inc.nom_equipement}</span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              inc.priorite === "CRITIQUE" ? "bg-red-100 text-red-700" :
                              inc.priorite === "HAUTE" ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-700"
                            }`}>
                              {inc.priorite}
                            </span>
                          </div>
                          <p className="text-gray-700 mt-0.5">{inc.description_incident}</p>
                          <div className="text-[10px] text-gray-400 mt-1">
                            Signalé le {fmtDate(inc.date_incident || inc.created_at)} par {inc.signale_par}
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-end gap-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${resolu ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
                            {resolu ? "✓ Résolu" : "En cours"}
                          </span>
                          {!resolu && (
                            <button
                              type="button"
                              onClick={() => handleCloturerIncident(inc.id)}
                              className="text-[11px] font-semibold text-blue-800 hover:underline"
                            >
                              Marquer résolu →
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VUE 2 : INTERVENTIONS TECHNIQUES */}
      {tab === "interventions" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <form onSubmit={handleEnregistrerIntervention} className="bg-white rounded-xl border p-4 shadow-sm" style={{ borderColor: T.line }}>
              <h2 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                + Nouvelle Intervention
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Date d'intervention</label>
                  <input
                    type="date"
                    value={dateInterv}
                    onChange={(e) => setDateInterv(e.target.value)}
                    className="w-full text-xs border rounded p-2"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Équipement</label>
                  <select
                    value={intervEquipement}
                    onChange={(e) => setIntervEquipement(e.target.value)}
                    className="w-full text-xs border rounded p-2 bg-white"
                    style={{ borderColor: T.line }}
                  >
                    {equipements.map((eq) => (
                      <option key={eq.id || eq.nom_equipement} value={eq.id || eq.nom_equipement}>
                        {eq.nom || eq.nom_equipement}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Travaux Réalisés *</label>
                  <textarea
                    rows={2}
                    placeholder="Détail des réparations / maintenance..."
                    value={descriptionTravaux}
                    onChange={(e) => setDescriptionTravaux(e.target.value)}
                    className="w-full text-xs border rounded p-2"
                    style={{ borderColor: T.line }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Pièces Remplacées</label>
                  <input
                    type="text"
                    placeholder="ex: Filtre, raccord tournant, joint..."
                    value={piecesChangees}
                    onChange={(e) => setPiecesChangees(e.target.value)}
                    className="w-full text-xs border rounded p-2"
                    style={{ borderColor: T.line }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Prestataire</label>
                    <input
                      type="text"
                      placeholder="ex: Radiob"
                      value={prestataire}
                      onChange={(e) => setPrestataire(e.target.value)}
                      className="w-full text-xs border rounded p-2"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Coût (FCFA)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={coutMaintenance}
                      onChange={(e) => setCoutMaintenance(e.target.value)}
                      className="w-full text-xs border rounded p-2 font-bold text-right"
                      style={{ borderColor: T.line }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg text-xs font-bold text-gray-900 shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: T.gold }}
                >
                  ✓ Enregistrer l'Intervention
                </button>
              </div>
            </form>
          </div>

          <div className="md:col-span-2">
            <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
                Historique des Interventions Réalisées ({maintenances.length})
              </h3>
              {maintenances.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">Aucune intervention enregistrée.</p>
              ) : (
                <div className="divide-y" style={{ borderColor: T.line }}>
                  {maintenances.map((m) => (
                    <div key={m.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-gray-900">
                          {fmtDate(m.date_maintenance)} · {m.nom_equipement}
                        </div>
                        <p className="text-gray-700 mt-0.5">{m.description_travaux}</p>
                        {m.pieces_changees && (
                          <div className="text-gray-500 mt-0.5">
                            🔧 Pièces : <strong>{m.pieces_changees}</strong>
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400 mt-0.5">Prestataire : {m.prestataire}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-blue-900 tabular">{F(m.cout_maintenance)} FCFA</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VUE 3 : PARC ÉQUIPEMENTS */}
      {tab === "equipements" && (
        <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: T.line }}>
          <h3 className="text-sm font-bold mb-3" style={{ color: T.petrol }}>
            Inventaire des Équipements de la Station
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {equipements.map((eq) => (
              <div key={eq.id || eq.nom_equipement} className="border rounded-lg p-3 bg-gray-50/50 flex flex-col justify-between" style={{ borderColor: T.line }}>
                <div>
                  <span className="text-[10px] font-bold text-gray-400 block uppercase">{eq.type || "EQUIPEMENT"}</span>
                  <span className="text-xs font-bold text-gray-800 block mt-0.5">{eq.nom || eq.nom_equipement}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
                    {eq.etat || eq.etat_equipement || "Opérationnel"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEq(eq.id || eq.nom_equipement);
                      setTab("incidents");
                    }}
                    className="text-[11px] font-semibold text-blue-700 hover:underline"
                  >
                    Signaler panne →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}