import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listPompistes, saveQuartConfig, listQuartConfigs, updatePompisteQuart } from "../lib/api";
import { F, fmtDate, n, T, todayISO, uuid } from "../lib/calcul";
import { Section, Row, Loading } from "../components/ui";

export default function GestionQuarts() {
  const { profil } = useAuth();
  const stationId = profil?.station_id || "";
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [pompistes, setPompistes] = useState([]);
  const [quartConfigs, setQuartConfigs] = useState([]);
  const [msg, setMsg] = useState("");
  
  // États pour les formulaires
  const [showAddQuart, setShowAddQuart] = useState(false);
  const [usePreset, setUsePreset] = useState(false);
  const [newQuart, setNewQuart] = useState({
    nom: "",
    heure_debut: "06:00",
    heure_fin: "14:00",
    type: "MATIN",
  });

  // Quarts prédéfinis pour couverture 24h
  const quartPresets = [
    { nom: "Quart Nuit", heure_debut: "00:00", heure_fin: "06:00", type: "NUIT" },
    { nom: "Quart Matin", heure_debut: "06:00", heure_fin: "12:00", type: "MATIN" },
    { nom: "Quart Midi", heure_debut: "12:00", heure_fin: "18:00", type: "APRES-MIDI" },
    { nom: "Quart Soir", heure_debut: "18:00", heure_fin: "24:00", type: "SOIR" },
  ];

  const selectPreset = (preset) => {
    setNewQuart({
      nom: preset.nom,
      heure_debut: preset.heure_debut,
      heure_fin: preset.heure_fin,
      type: preset.type,
    });
    setUsePreset(true);
  };
  
  const [selectedPompiste, setSelectedPompiste] = useState(null);
  const [showAffectation, setShowAffectation] = useState(false);
  const [affectationForm, setAffectationForm] = useState({
    quart_id: "",
    equipe_id: "",
    pistolets: [],
  });

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };

  const loadData = async () => {
    try {
      const r = await loadReferentiel();
      setRef(r);
      
      const allP = [];
      for (const st of r.stations) {
        const p = await listPompistes(st.id);
        allP.push(...p);
      }
      setPompistes(allP.filter(p => p.actif));
      
      const quarts = await listQuartConfigs(stationId);
      setQuartConfigs(quarts || []);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [stationId]);

  const createQuart = async () => {
    if (!newQuart.nom.trim()) {
      flash("⚠️ Le nom du quart est obligatoire");
      return;
    }

    // Convertir 00:00 en 24:00 pour les quarts de nuit si nécessaire
    let heureFin = newQuart.heure_fin;
    if (newQuart.heure_debut > newQuart.heure_fin) {
      // Cas où le quart traverse minuit (ex: 22:00 à 06:00)
      // On garde tel quel pour l'instant, pourrait être géré différemment
    }
    // Pour le quart soir 18:00-24:00, le preset utilise 24:00
    if (newQuart.heure_fin === "00:00" && newQuart.heure_debut >= "18:00") {
      heureFin = "24:00";
    }

    try {
      const config = {
        id: uuid(),
        station_id: stationId,
        nom: newQuart.nom.trim(),
        heure_debut: newQuart.heure_debut,
        heure_fin: heureFin,
        type: newQuart.type,
        actif: true,
        created_at: new Date().toISOString(),
      };

      await saveQuartConfig(config);
      setQuartConfigs([...quartConfigs, config]);
      setNewQuart({ nom: "", heure_debut: "06:00", heure_fin: "14:00", type: "MATIN" });
      setUsePreset(false);
      setShowAddQuart(false);
      flash("✓ Quart créé avec succès");
    } catch (e) {
      flash("Erreur création quart : " + (e.message || e));
    }
  };

  const saveAffectation = async () => {
    if (!selectedPompiste) return;
    
    try {
      const res = await updatePompisteQuart(
        selectedPompiste.id,
        affectationForm.quart_id || null,
        affectationForm.pistolets
      );
      
      if (res.ok) {
        // Mise à jour locale
        setPompistes(pompistes.map(p => p.id === selectedPompiste.id ? res.pompiste : p));
        flash("✓ Affectation enregistrée avec succès");
        setShowAffectation(false);
        setSelectedPompiste(null);
      } else {
        flash("Erreur affectation : " + (res.error || "Erreur inconnue"));
      }
    } catch (e) {
      flash("Erreur affectation : " + (e.message || e));
    }
  };

  const checkChevauchement = (pompisteId, quartId) => {
    // Vérifier si le pompiste est déjà affecté à un quart qui chevauche
    const pompiste = pompistes.find(p => p.id === pompisteId);
    if (!pompiste || !pompiste.quart_id) return false;
    
    const quartActuel = quartConfigs.find(q => q.id === pompiste.quart_id);
    const nouveauQuart = quartConfigs.find(q => q.id === quartId);
    
    if (!quartActuel || !nouveauQuart) return false;
    
    // Logique de chevauchement pour quarts 24h
    const debut1 = parseInt(quartActuel.heure_debut.replace(":", ""));
    const fin1 = parseInt(quartActuel.heure_fin.replace(":", ""));
    const debut2 = parseInt(nouveauQuart.heure_debut.replace(":", ""));
    const fin2 = parseInt(nouveauQuart.heure_fin.replace(":", ""));
    
    // Gestion du passage minuit (24:00 = 2400)
    const fin1Adj = fin1 === 2400 ? 1440 : fin1;
    const fin2Adj = fin2 === 2400 ? 1440 : fin2;
    
    return !(fin1Adj <= debut2 || fin2Adj <= debut1);
  };

  if (loading) return <Loading label="Chargement de la gestion des quarts..." />;

  const pompistesParQuart = quartConfigs.reduce((acc, quart) => {
    acc[quart.id] = pompistes.filter(p => p.quart_id === quart.id);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Gestion des Quarts & Équipes</h1>
      <p className="text-sm mb-4" style={{ color: T.muted }}>
        Organisation des équipes, affectation des pompistes aux quarts et suivi des plannings
      </p>
      
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-xl border" style={{ borderColor: T.line }}>
          <div className="text-[10px] font-bold text-gray-500">Pompistes Actifs</div>
          <div className="text-lg font-black" style={{ color: T.petrol }}>{pompistes.length}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border" style={{ borderColor: T.line }}>
          <div className="text-[10px] font-bold text-gray-500">Quarts Configurés</div>
          <div className="text-lg font-black" style={{ color: T.petrol }}>{quartConfigs.length}</div>
        </div>
        <div className="bg-white p-3 rounded-xl border" style={{ borderColor: T.line }}>
          <div className="text-[10px] font-bold text-gray-500">Affectés</div>
          <div className="text-lg font-black" style={{ color: T.ok }}>
            {pompistes.filter(p => p.quart_id).length}
          </div>
        </div>
        <div className="bg-white p-3 rounded-xl border" style={{ borderColor: T.line }}>
          <div className="text-[10px] font-bold text-gray-500">Non Affectés</div>
          <div className="text-lg font-black" style={{ color: T.alert }}>
            {pompistes.filter(p => !p.quart_id).length}
          </div>
        </div>
      </div>

      {/* Gestion des Quarts */}
      <Section titre="⏰ Configuration des Quarts" aside={`${quartConfigs.length} quart(s)`}>
        <div className="space-y-3">
          {quartConfigs.map((quart) => {
            const equipe = pompistesParQuart[quart.id] || [];
            return (
              <div key={quart.id} className="p-3 rounded-lg border" style={{ borderColor: T.line }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-bold text-sm">{quart.nom}</div>
                    <div className="text-xs" style={{ color: T.muted }}>
                      {quart.heure_debut} - {quart.heure_fin === "24:00" ? "24:00" : quart.heure_fin} · {quart.type}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    {equipe.length} pompiste(s)
                  </span>
                </div>
                {equipe.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {equipe.map(p => (
                      <span key={p.id} className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                        {p.nom}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          
          {quartConfigs.length === 0 && (
            <p className="text-sm py-3 text-center" style={{ color: T.muted }}>
              Aucun quart configuré. Créez votre premier quart ci-dessous.
            </p>
          )}
        </div>

        {!showAddQuart ? (
          <button
            onClick={() => setShowAddQuart(true)}
            className="w-full py-2 mt-3 rounded text-sm font-medium border-dashed"
            style={{ borderColor: T.petrol, color: T.petrol }}
          >
            + Créer un nouveau quart
          </button>
        ) : (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 space-y-2">
            <div className="text-xs font-semibold mb-2" style={{ color: T.muted }}>
              Quarts prédéfinis (couverture 24h)
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {quartPresets.map((preset) => (
                <button
                  key={preset.type}
                  onClick={() => selectPreset(preset)}
                  className="px-2 py-1.5 rounded text-xs border-2 transition-all"
                  style={{
                    borderColor: usePreset && newQuart.type === preset.type ? T.petrol : T.line,
                    background: usePreset && newQuart.type === preset.type ? "#E3F4EA" : "white",
                    color: usePreset && newQuart.type === preset.type ? T.petrol : T.muted,
                  }}
                >
                  {preset.nom}
                  <div className="text-[10px] opacity-70">
                    {preset.heure_debut} - {preset.heure_fin}
                  </div>
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nom du quart *</label>
              <input
                type="text"
                value={newQuart.nom}
                onChange={(e) => setNewQuart({ ...newQuart, nom: e.target.value })}
                placeholder="ex: Quart Matin A"
                className="w-full border rounded px-2 py-1.5 text-xs"
                style={{ borderColor: T.line }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-semibold mb-1">Début</label>
                <input
                  type="time"
                  value={newQuart.heure_debut}
                  onChange={(e) => setNewQuart({ ...newQuart, heure_debut: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  style={{ borderColor: T.line }}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Fin</label>
                <input
                  type="time"
                  value={newQuart.heure_fin === "24:00" ? "00:00" : newQuart.heure_fin}
                  onChange={(e) => setNewQuart({ ...newQuart, heure_fin: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  style={{ borderColor: T.line }}
                />
                {newQuart.heure_fin === "24:00" && (
                  <div className="text-[10px] text-gray-500 mt-0.5">Affiché comme 24:00 pour quart 24h</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Type</label>
                <select
                  value={newQuart.type}
                  onChange={(e) => setNewQuart({ ...newQuart, type: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  style={{ borderColor: T.line }}
                >
                  <option value="MATIN">Matin</option>
                  <option value="APRES-MIDI">Après-midi</option>
                  <option value="SOIR">Soir</option>
                  <option value="NUIT">Nuit</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={createQuart} className="px-3 py-1.5 rounded text-xs font-medium text-white" style={{ background: T.petrol }}>
                Créer
              </button>
              <button onClick={() => setShowAddQuart(false)} className="px-3 py-1.5 rounded text-xs" style={{ color: T.muted }}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Affectation des Pompistes */}
      <Section titre="👷 Affectation des Pompistes" aside={`${pompistes.length} pompiste(s)`}>
        <div className="space-y-2">
          {pompistes.map((p) => {
            const quart = quartConfigs.find(q => q.id === p.quart_id);
            return (
              <div key={p.id} className="p-3 rounded-lg border flex items-center justify-between" style={{ borderColor: T.line }}>
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${p.actif ? "bg-green-500" : "bg-gray-300"}`} />
                  <div>
                    <div className="font-medium text-sm">{p.nom}</div>
                    <div className="text-xs" style={{ color: T.muted }}>
                      {quart ? `Quart: ${quart.nom} (${quart.heure_debut}-${quart.heure_fin})` : "Non affecté"}
                    </div>
                    {p.pistolets && p.pistolets.length > 0 && (
                      <div className="text-xs text-blue-600">
                        Pistolets: {p.pistolets.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedPompiste(p);
                    setAffectationForm({
                      quart_id: p.quart_id || "",
                      equipe_id: p.equipe_id || "",
                      pistolets: p.pistolets || [],
                    });
                    setShowAffectation(true);
                  }}
                  className="px-3 py-1.5 rounded text-xs font-medium bg-blue-50 text-blue-800 hover:bg-blue-100"
                >
                  Affecter
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Modal d'affectation */}
      {showAffectation && selectedPompiste && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5">
            <h3 className="font-bold text-lg mb-4">Affecter {selectedPompiste.nom}</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Quart</label>
                <select
                  value={affectationForm.quart_id}
                  onChange={(e) => {
                    const newQuartId = e.target.value;
                    const chevauchement = checkChevauchement(selectedPompiste.id, newQuartId);
                    if (chevauchement) {
                      flash("⚠️ Attention : chevauchement d'horaires avec le quart actuel");
                    }
                    setAffectationForm({ ...affectationForm, quart_id: newQuartId });
                  }}
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  style={{ borderColor: T.line }}
                >
                  <option value="">-- Sélectionner un quart --</option>
                  {quartConfigs.map(q => (
                    <option key={q.id} value={q.id}>
                      {q.nom} ({q.heure_debut} - {q.heure_fin})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Pistolets assignés</label>
                <div className="flex flex-wrap gap-1">
                  {ref?.pistolets
                    ?.filter(p => !stationId || p.station_id === stationId)
                    .map(pistolet => (
                      <button
                        key={pistolet.id}
                        type="button"
                        onClick={() => {
                          const newPistolets = affectationForm.pistolets.includes(pistolet.code)
                            ? affectationForm.pistolets.filter(pc => pc !== pistolet.code)
                            : [...affectationForm.pistolets, pistolet.code];
                          setAffectationForm({ ...affectationForm, pistolets: newPistolets });
                        }}
                        className={`px-2 py-1 rounded text-xs ${
                          affectationForm.pistolets.includes(pistolet.code)
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {pistolet.code}
                      </button>
                    ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={saveAffectation} className="flex-1 py-2 rounded text-xs font-medium text-white" style={{ background: T.petrol }}>
                Enregistrer
              </button>
              <button onClick={() => { setShowAffectation(false); setSelectedPompiste(null); }} className="flex-1 py-2 rounded text-xs" style={{ color: T.muted }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
