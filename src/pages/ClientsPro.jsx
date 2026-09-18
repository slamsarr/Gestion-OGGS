import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { loadReferentiel, listClientsPro, createClientPro, listVehicules, createVehicule } from "../lib/api";
import { Section, Row, Num, Loading } from "../components/ui";
import { F, n, T, todayISO, uuid } from "../lib/calcul";

export default function ClientsPro() {
  const { profil, cloud } = useAuth();
  const [stationId, setStationId] = useState(profil?.station_id || "");
  const [loading, setLoading] = useState(true);
  const [ref, setRef] = useState(null);
  const [selected, setSelected] = useState(null);
  const [clForm, setClForm] = useState({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 0, station_id: stationId });
  const [veh, setVeh] = useState({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
  const [msg, setMsg] = useState("");
  const clients = ref?.clients_pro || [];
  const vehicules = selected ? (ref?.vehicules || []).filter((v) => v.client_code === selected) : [];

  useEffect(() => { if (!stationId && ref?.stations?.length) setStationId(ref.stations[0].code); }, [ref]);
  useEffect(() => { (async () => { setRef(await loadReferentiel()); setLoading(false); })(); }, [cloud]);

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const save = async () => {
    if (!clForm.nom_entreprise.trim()) return flash("Le nom de l'entreprise est requis");
    const res = await createClientPro({ ...clForm, station_id: stationId, plafond_credit: n(clForm.plafond_credit) });
    if (res?.error) return flash("Erreur : " + res.error);
    setClForm({ code: "", nom_entreprise: "", telephone: "", email: "", plafond_credit: 0, station_id: stationId });
    flash("Client professionnel ajouté");
    setRef(await loadReferentiel());
  };

  const saveVeh = async () => {
    if (!selected) return flash("Sélectionnez d'abord un client");
    if (!veh.immatriculation?.trim()) return flash("Immatriculation requise");
    const res = await createVehicule({ ...veh, client_code: selected, station_id: stationId });
    if (res?.error) return flash("Erreur : " + res.error);
    setVeh({ immatriculation: "", marque: "", modele: "", type_vehicule: "CAMION", carburant: "GASOIL" });
    flash("Véhicule ajouté");
    setRef(await loadReferentiel());
  };

  if (loading) return <Loading label="Chargement des clients professionnels…" />;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1" style={{ color: T.petrol }}>Clients professionnels</h1>
      <p className="text-sm mb-3" style={{ color: T.muted }}>Crédit carburant au plafond — §33</p>
      {msg && <div className="rounded px-3 py-2 mb-3 text-sm" style={{ background: "#E3F4EA", color: T.ok }}>{msg}</div>}

      <Section titre="Nouveau client professionnel" aside="Ajout direct (RBAC : admin, directeur, gerant, commercial)">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
          <div><div className="text-xs" style={{ color: T.muted }}>Code</div>
            <input value={clForm.code} onChange={(e) => setClForm({ ...clForm, code: e.target.value })} placeholder="CP-001" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div className="col-span-2"><div className="text-xs" style={{ color: T.muted }}>Nom entreprise *</div>
            <input value={clForm.nom_entreprise} onChange={(e) => setClForm({ ...clForm, nom_entreprise: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Téléphone</div>
            <input value={clForm.telephone} onChange={(e) => setClForm({ ...clForm, telephone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div className="col-span-2"><div className="text-xs" style={{ color: T.muted }}>Email</div>
            <input value={clForm.email} onChange={(e) => setClForm({ ...clForm, email: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
          <div><div className="text-xs" style={{ color: T.muted }}>Plafond crédit (F)</div>
            <Num value={clForm.plafond_credit} onChange={(v) => setClForm({ ...clForm, plafond_credit: v })} w="w-full" /></div>
        </div>
        <div className="pb-2"><button onClick={save} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Ajouter le client</button></div>
      </Section>

      <Section titre="Clients professionnels" aside={`${clients.length} clients`}>
        {clients.map((c, i) => (
          <Row key={c.code || c.id || i} onClick={() => setSelected(selected === c.code ? null : c.code)}>
            <div>
              <div className="font-medium">{c.nom_entreprise}</div>
              <div className="text-xs" style={{ color: T.muted }}>{c.code}{c.telephone ? ` · ${c.telephone}` : ""}</div>
            </div>
            <div className="text-right">
              <div className="font-semibold tabular">{F(c.plafond_credit || 0)} F</div>
              <div className="text-xs" style={{ color: T.muted }}>plafond crédit</div>
            </div>
          </Row>
        ))}
        {clients.length === 0 && <div className="py-3 text-sm" style={{ color: T.muted }}>Aucun client pro pour l'instant</div>}
      </Section>

      {selected && (
        <Section titre={`Véhicules — ${selected}`} aside="Rattacher des véhicules au client">
          {vehicules.map((v, i) => (
            <Row key={v.id || v.immatriculation || i}>
              <div>
                <div className="font-medium tabular">{v.immatriculation}</div>
                <div className="text-xs" style={{ color: T.muted }}>{v.marque} {v.modele}</div>
              </div>
              <div className="text-right text-sm">{v.type_vehicule}<span className="ml-2" style={{ color: T.muted }}>{v.carburant}</span></div>
            </Row>
          ))}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 py-2">
            <div><div className="text-xs" style={{ color: T.muted }}>Immatriculation *</div>
              <input value={veh.immatriculation} onChange={(e) => setVeh({ ...veh, immatriculation: e.target.value })} placeholder="SD-1234-AA" className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Marque</div>
              <input value={veh.marque} onChange={(e) => setVeh({ ...veh, marque: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Modèle</div>
              <input value={veh.modele} onChange={(e) => setVeh({ ...veh, modele: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }} /></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Type véhicule</div>
              <select value={veh.type_vehicule} onChange={(e) => setVeh({ ...veh, type_vehicule: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                {["CAMION", "PICKUP", "BUS", "VOITURE", "MOTO"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <div><div className="text-xs" style={{ color: T.muted }}>Carburant</div>
              <select value={veh.carburant} onChange={(e) => setVeh({ ...veh, carburant: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" style={{ borderColor: T.line }}>
                {["GASOIL", "SUPER", "GAZ"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
            <div className="flex items-end"><button onClick={saveVeh} className="px-4 py-2 rounded text-sm font-medium" style={{ background: T.petrol, color: "white" }}>Ajouter le véhicule</button></div>
          </div>
        </Section>
      )}
    </div>
  );
}
