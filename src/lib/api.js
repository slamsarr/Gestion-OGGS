import { db, ensureLocalSeed, getLocalRef, isCloudConfigured, setLocalRef } from "./db";
import { getSupabase } from "./supabase";
import { calculer, n, todayISO, uuid } from "./calcul";
import { referentielFromSeed } from "./seed";

export { isCloudConfigured };

function totaux(r, ref) {
  const c = calculer(r, ref);
  return {
    ca_carburant: Math.round(c.caCarburant),
    ca_lubrifiant: Math.round(c.caLub),
    ca_gaz: Math.round(c.caGaz),
    ca_total: Math.round(c.caTotal),
    a_verser: Math.round(c.aVerser),
    total_versements: Math.round(c.bis),
    ecart_caisse: Math.round(c.ecart),
    depenses: Math.round(c.depenses),
    ca_lavage: Math.round(c.lavage),
    tickets: Math.round(c.tickets),
    remboursement: Math.round(c.remboursement),
    depots: Math.round(c.depots),
  };
}

export async function loadReferentiel() {
  const sb = getSupabase();
  if (sb) {
    try {
      const [{ data: stations }, { data: prix }, { data: pistolets }, { data: produits }, { data: categories }, { data: clients }, { data: cuves }] = await Promise.all([
        sb.from("stations").select("*").eq("actif", true),
        sb.from("prix_carburant").select("*"),
        sb.from("pistolets").select("*, stations(code)"),
        sb.from("produits").select("*").eq("actif", true).order("ordre"),
        sb.from("categories_depense").select("*"),
        sb.from("clients_credit").select("*").eq("actif", true),
        sb.from("cuves").select("*"),
      ]);
      if (stations?.length) {
        const pist = (pistolets || []).map((p) => ({ ...p, station_code: p.stations?.code }));
        const ref = {
          stations,
          prix: (prix || []).map((p) => ({ ...p, date_effet: p.date_effet })),
          pistolets: pist,
          produits,
          lubrifiants: (produits || []).filter((p) => p.famille === "LUBRIFIANT" || p.famille === "ACCESSOIRE"),
          gaz: (produits || []).filter((p) => p.famille === "GAZ"),
          categories: categories || [],
          clients: clients || [],
          cuves: cuves || [],
        };
        await setLocalRef(ref);
        return ref;
      }
    } catch {
      /* offline: cache locale */
    }
  }
  return getLocalRef();
}

export async function listRapports(options = {}) {
  const limit = options.limit ?? 100;
  const page = options.page ?? 1;
  await ensureLocalSeed();
  let local = await db.rapports.orderBy("date").reverse().toArray();
  if (options.station) local = local.filter((r) => r.station === options.station);
  const sb = getSupabase();
  if (!sb) { local.total = local.length; local.pages = 1; return local; }
  try {
    const from = (page - 1) * limit;
    const { data, error, count } = await sb
      .from("rapports_journaliers")
      .select("*, stations(code, nom)", { count: "exact" })
      .order("date_rapport", { ascending: false })
      .range(from, from + limit - 1);
    if (error || !data) { local.total = local.length; local.pages = 1; return local; }
    const rows = data.map(rowToLocal);
    const cloudKeys = new Set(rows.map((r) => `${r.station}:${r.date}`));
    const pendings = local
      .filter((r) => !cloudKeys.has(`${r.station}:${r.date}`) && !rows.some((c) => c.id === r.id))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const merged = page === 1 ? [...pendings, ...rows].slice(0, limit) : rows;
    merged.total = count ?? rows.length;
    merged.pages = Math.max(1, Math.ceil((count ?? rows.length) / limit));
    merged.page = page;
    merged.pending = pendings.length;
    return merged;
  } catch {
    local.total = local.length;
    local.pages = 1;
    return local;
  }
}

function rowToLocal(row) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: row.id,
    station: row.stations?.code || payload.station,
    date: row.date_rapport,
    statut: row.statut,
    gerant: payload.gerant,
    gerant_id: row.gerant_id,
    motifRejet: row.motif_rejet || payload.motifRejet,
    commentaire: row.commentaire || payload.commentaire,
    client_uuid: row.client_uuid,
    maj_le: row.maj_le,
    ca_total: row.ca_total ?? payload.ca_total,
    ecart_caisse: row.ecart_caisse ?? payload.ecart_caisse,
    a_verser: row.a_verser ?? payload.a_verser,
    vol_hint: payload,
  };
}

export async function getRapport(stationCode, date) {
  const local = await db.rapports.where("[station+date]").equals([stationCode, date]).first();
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: st } = await sb.from("stations").select("id").eq("code", stationCode).single();
      if (st) {
        const { data } = await sb.from("rapports_journaliers").select("*, stations(code, nom)").eq("station_id", st.id).eq("date_rapport", date).maybeSingle();
        if (data) {
          const mapped = rowToLocal(data);
          await db.rapports.put(mapped);
          return mapped;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return local || null;
}

export async function indexVeille(stationCode, date, pistoletCode) {
  const prev = await db.rapports.where("station").equals(stationCode).filter((r) => r.date < date).reverse().sortBy("date");
  const last = prev[prev.length - 1];
  const fin = last?.pistolets?.[pistoletCode]?.fin;
  return fin === "" || fin == null ? null : n(fin);
}

async function syncRapportCloud(doc, ref) {
  const sb = getSupabase();
  if (!sb) throw new Error("cloud non configuré");
  const referentiel = ref || (await getLocalRef());
  const station = referentiel.stations.find((s) => s.code === doc.station);
  if (!station) throw new Error("station inconnue : " + doc.station);
  const t = totaux(doc, referentiel);
  const row = {
    id: doc.id,
    station_id: station.id,
    date_rapport: doc.date,
    gerant_id: doc.gerant_id,
    statut: doc.statut,
    ca_lavage: t.ca_lavage,
    tickets: t.tickets,
    depenses: t.depenses,
    remboursement: t.remboursement,
    depots: t.depots,
    commentaire: doc.commentaire || null,
    motif_rejet: doc.motifRejet || null,
    payload: doc,
    client_uuid: doc.client_uuid,
    soumis_le: doc.soumisLe || null,
    valide_par: doc.valide_par || null,
  };
  const { error } = await sb.from("rapports_journaliers").upsert(row, { onConflict: "station_id,date_rapport" });
  if (error) throw new Error(error.message);
  await explodeCloud(sb, doc, referentiel, station.id);
  return { ok: true, t };
}

export async function saveRapport(r, profil, ref, extras = {}) {
  const t = totaux(r, ref);
  const doc = {
    ...r,
    ...extras,
    maj_le: new Date().toISOString(),
    gerant_id: profil.id,
    ...t,
  };
  await db.rapports.put(doc);
  if (doc.statut === "VALIDE") await ecrireMouvementsLocaux(doc, ref);
  const sb = getSupabase();
  if (!sb) {
    return { ok: true, cloud: false, doc };
  }
  try {
    await syncRapportCloud(doc, ref);
    return { ok: true, cloud: true, doc };
  } catch (e) {
    await db.queue.add({ op: "upsert_rapport", payload: doc, created_at: Date.now(), error: String(e.message || e) });
    return { ok: true, cloud: false, pending: true, error: e.message, doc };
  }
}

async function explodeCloud(sb, r, ref, stationId) {
  const { data: header } = await sb.from("rapports_journaliers").select("id, statut").eq("station_id", stationId).eq("date_rapport", r.date).maybeSingle();
  if (!header || header.statut === "VALIDE") return;
  const id = header.id;
  const pist = ref.pistolets.filter((p) => p.station_id === stationId || p.station_code === r.station);
  const pistRows = pist.map((p) => {
    const x = r.pistolets[p.code] || { depart: 0, fin: 0 };
    const fin = x.fin === "" ? n(x.depart) : n(x.fin);
    const prix = p.produit === "GASOIL" ? calculer(r, ref).pGO : calculer(r, ref).pSU;
    return {
      rapport_id: id,
      pistolet_id: p.id,
      index_depart: n(x.depart),
      index_fin: Math.max(fin, n(x.depart)),
      prix_unitaire: prix,
    };
  }).filter((row) => pist.some((p) => p.id === row.pistolet_id));
  if (pistRows.length) await sb.from("rapport_pistolets").upsert(pistRows);

  const lubRows = (ref.lubrifiants || []).map((l) => {
    const x = r.lubrifiants[l.designation] || {};
    return {
      rapport_id: id,
      produit_id: l.id,
      stock_debut: n(x.debut),
      reception: n(x.reception),
      qte_vendue: n(x.vendu),
      prix_unitaire: l.prix_vente,
    };
  });
  if (lubRows.length) await sb.from("rapport_lubrifiants").upsert(lubRows);

  const gazRows = (ref.gaz || []).map((g) => {
    const x = r.gaz[g.designation] || {};
    return {
      rapport_id: id,
      produit_id: g.id,
      stock_present: n(x.present),
      livraison: n(x.livraison),
      qte_vendue: n(x.vendu),
      prix_unitaire: g.prix_vente,
      cout_unitaire: g.cout_achat || 0,
    };
  });
  if (gazRows.length) await sb.from("rapport_gaz").upsert(gazRows);

  const vers = (r.versements || []).map((montant, i) => ({ rapport_id: id, numero: i + 1, montant: n(montant) }));
  if (vers.length) await sb.from("rapport_versements").upsert(vers, { onConflict: "rapport_id,numero" });

  const cats = ref.categories || [];
  await sb.from("lignes_depense").delete().eq("rapport_id", id);
  for (const d of r.depenses || []) {
    const cat = cats.find((c) => c.libelle === d.categorie || c.code === d.categorie);
    if (!cat) continue;
    await sb.from("lignes_depense").insert({ rapport_id: id, categorie_id: cat.id, libelle: d.libelle, montant: n(d.montant) });
  }

  const modes = ["TICKET", "CARTE_STAR", "PLATEFORME_PETROSEN", "ORANGE_MONEY", "WAVE", "TPE", "CREDIT_CLIENT"];
  await sb.from("rapport_reglements").delete().eq("rapport_id", id);
  for (const rg of r.reglements || []) {
    if (!modes.includes(rg.mode) || n(rg.montant) <= 0) continue;
    const client = ref.clients?.find((c) => c.code === rg.client);
    await sb.from("rapport_reglements").insert({
      rapport_id: id,
      mode: rg.mode,
      montant: n(rg.montant),
      client_id: rg.mode === "CREDIT_CLIENT" ? (client?.id || rg.client_id || null) : null,
      detail: rg.libelle ? { libelle: rg.libelle } : null,
    });
  }
}

async function ecrireMouvementsLocaux(doc, ref) {
  await db.mouvements.where("rapport_id").equals(doc.id).delete();
  const station = ref.stations.find((s) => s.code === doc.station);
  for (const l of ref.lubrifiants || []) {
    const x = doc.lubrifiants?.[l.designation];
    if (!x) continue;
    if (n(x.vendu)) await db.mouvements.add({ station_id: station.id, produit_id: l.id, date_mvt: doc.date, type: "VENTE", quantite: -n(x.vendu), rapport_id: doc.id });
    if (n(x.reception)) await db.mouvements.add({ station_id: station.id, produit_id: l.id, date_mvt: doc.date, type: "RECEPTION", quantite: n(x.reception), rapport_id: doc.id });
  }
  for (const g of ref.gaz || []) {
    const x = doc.gaz?.[g.designation];
    if (!x) continue;
    if (n(x.vendu)) await db.mouvements.add({ station_id: station.id, produit_id: g.id, date_mvt: doc.date, type: "VENTE", quantite: -n(x.vendu), rapport_id: doc.id });
    if (n(x.livraison)) await db.mouvements.add({ station_id: station.id, produit_id: g.id, date_mvt: doc.date, type: "RECEPTION", quantite: n(x.livraison), rapport_id: doc.id });
  }
}

export async function stocksTheoriques(ref) {
  const mvts = await db.mouvements.toArray();
  const map = {};
  for (const p of [...(ref.lubrifiants || []), ...(ref.gaz || [])]) {
    for (const st of ref.stations) {
      const q = mvts.filter((m) => m.produit_id === p.id && m.station_id === st.id).reduce((s, m) => s + n(m.quantite), 0);
      map[`${st.code}:${p.designation}`] = q;
    }
  }
  const rapports = await db.rapports.toArray();
  for (const r of rapports) {
    if (r.statut !== "VALIDE") {
      for (const l of ref.lubrifiants || []) {
        const x = r.lubrifiants?.[l.designation];
        if (!x) continue;
        const key = `${r.station}:${l.designation}`;
        if (map[key] === 0 || map[key] == null) {
          /* last stock_fin from latest rapport */
        }
      }
    }
  }
  const lastByStation = {};
  for (const r of rapports) {
    if (r.statut !== "VALIDE") continue;
    const prev = lastByStation[r.station];
    if (!prev || (r.date > prev.date)) lastByStation[r.station] = r;
  }
  const rows = [];
  for (const st of ref.stations) {
    const last = lastByStation[st.code];
    for (const l of [...(ref.lubrifiants || []), ...(ref.gaz || [])]) {
      let stock = map[`${st.code}:${l.designation}`] || 0;
      if (stock === 0 && last) {
        const x = last.lubrifiants?.[l.designation] || last.gaz?.[l.designation];
        if (x) {
          if (x.debut != null) stock = n(x.debut) + n(x.reception) - n(x.vendu);
          if (x.present != null) stock = n(x.present) + n(x.livraison) - n(x.vendu);
        }
      }
      rows.push({ station: st.code, stationNom: st.nom, produit: l.designation, famille: l.famille, stock, seuil: l.seuil_alerte ?? 5, valeur: stock * (l.prix_vente || 0) });
    }
  }
  return rows;
}

async function syncQuartsCloud(withDate) {
  const sb = getSupabase();
  if (!sb) throw new Error("cloud non configuré");
  const pompistes = await db.pompistes.toArray();
  const ref = await getLocalRef();
  let synced = 0;
  let missingRapport = false;
  for (const q of withDate) {
    const pomp = pompistes.find((p) => p.id === q.pompiste_id);
    const st = ref.stations.find((s) => s.id === (pomp?.station_id || q.station_id));
    if (!pomp || !st) continue;
    let rapportId = q.rapport_id || null;
    if (!rapportId) {
      const { data: rapport } = await sb.from("rapports_journaliers").select("id").eq("station_id", st.id).eq("date_rapport", q.date).maybeSingle();
      rapportId = rapport?.id || null;
    }
    if (!rapportId) { missingRapport = true; continue; }
    const { error } = await sb.from("quarts_pompistes").upsert({
      id: q.id,
      rapport_id: rapportId,
      pompiste_id: pomp.id,
      pistolets: q.pistolets || [],
      valeur_ventes: n(q.valeur_ventes),
      prelevement: n(q.prelevement),
      tickets: n(q.tickets),
      cartes_star: n(q.cartes_star),
      petrosen: n(q.petrosen),
      mobile_money: n(q.mobile_money),
      verse: n(q.verse),
    });
    if (error) throw new Error(error.message);
    synced++;
  }
  if (missingRapport) throw new Error("rapport absent pour certains quarts — reprise ultérieure");
  return synced;
}

export async function flushQueue() {
  const sb = getSupabase();
  if (!sb) return { flushed: 0 };
  const items = await db.queue.toArray();
  let flushed = 0;
  for (const item of items) {
    try {
      if (item.op === "upsert_rapport") {
        const res = await syncRapportCloud(item.payload);
        if (!res.ok) throw new Error(res.error);
      } else if (item.op === "upsert_quarts") {
        await syncQuartsCloud(item.payload);
      } else if (item.op === "upsert_operation_credit") {
        const op = item.payload;
        const { data: cl } = await sb.from("clients_credit").select("id").eq("code", op.client_code).maybeSingle();
        if (!cl) throw new Error("Client crédit introuvable au niveau du cloud");
        const { error } = await sb.from("operations_credit").insert({ ...op, client_id: cl.id });
        if (error) throw new Error(error.message);
      }
      await db.queue.delete(item.id);
      flushed += 1;
    } catch (e) {
      await db.queue.update(item.id, { error: String(e.message || e) });
    }
  }
  if (flushed > 0) await db.meta.put({ key: "last_sync", value: new Date().toISOString() });
  return { flushed };
}

export async function listProfilsCloud() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("profils").select("*, stations(code, nom)");
  return data || [];
}

export async function updateProfilRole(id, patch) {
  const sb = getSupabase();
  if (!sb) return { error: "Cloud requis" };
  const { error } = await sb.from("profils").update(patch).eq("id", id);
  return { error: error?.message };
}

export function newId() {
  return uuid();
}

// ── CRUD Stations ──
export async function createStation(station) {
  const sb = getSupabase();
  const row = { id: station.id || uuid(), code: station.code, nom: station.nom, localisation: station.localisation || "", nb_pistolets: n(station.nb_pistolets) || 8, actif: true };
  if (sb) { const { error } = await sb.from("stations").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.stations = [...ref.stations, row]; await setLocalRef(ref);
  return { ok: true, station: row };
}
export async function updateStation(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("stations").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.stations = ref.stations.map((s) => s.id === id ? { ...s, ...patch } : s); await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Prix ──
export async function createPrix(prix) {
  const sb = getSupabase();
  const row = { produit: prix.produit, prix_vente: n(prix.prix_vente), prix_achat: prix.prix_achat ? +prix.prix_achat : null, date_effet: prix.date_effet };
  if (sb) { const { error } = await sb.from("prix_carburant").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.prix = [...ref.prix, row]; await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Produits ──
export async function createProduit(produit) {
  const sb = getSupabase();
  const row = { id: produit.id || uuid(), code: produit.code, designation: produit.designation, famille: produit.famille, unite: produit.unite || "unité", prix_vente: n(produit.prix_vente), cout_achat: produit.cout_achat ? n(produit.cout_achat) : null, seuil_alerte: n(produit.seuil_alerte) || 5, ordre: n(produit.ordre) || 99, actif: true };
  if (sb) { const { error } = await sb.from("produits").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.produits = [...(ref.produits || []), row];
  if (row.famille === "LUBRIFIANT" || row.famille === "ACCESSOIRE") ref.lubrifiants = [...(ref.lubrifiants || []), row];
  if (row.famille === "GAZ") ref.gaz = [...(ref.gaz || []), row];
  await setLocalRef(ref);
  return { ok: true, produit: row };
}
export async function updateProduit(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("produits").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  const upd = (arr) => (arr || []).map((p) => p.id === id ? { ...p, ...patch } : p);
  ref.produits = upd(ref.produits); ref.lubrifiants = upd(ref.lubrifiants); ref.gaz = upd(ref.gaz);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Catégories ──
export async function createCategorie(cat) {
  const sb = getSupabase();
  const row = { code: cat.code, libelle: cat.libelle, nature: cat.nature || "VARIABLE", compte_syscohada: cat.compte_syscohada || "6588" };
  if (sb) { const { error } = await sb.from("categories_depense").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.categories = [...(ref.categories || []), row]; await setLocalRef(ref);
  return { ok: true };
}
export async function updateCategorie(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("categories_depense").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.categories = (ref.categories || []).map((c) => (c.id === id || c.code === id) ? { ...c, ...patch } : c);
  await setLocalRef(ref);
  return { ok: true };
}
export async function deleteCategorie(id) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("categories_depense").delete().eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.categories = (ref.categories || []).filter((c) => c.id !== id && c.code !== id);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Clients crédit ──
export async function createClientCredit(client) {
  const sb = getSupabase();
  const row = { id: client.id || uuid(), code: client.code, nom: client.nom, plafond: n(client.plafond) || 0, actif: true };
  if (sb) { const { error } = await sb.from("clients_credit").insert(row); if (error) return { error: error.message }; }
  const ref = await getLocalRef(); ref.clients = [...(ref.clients || []), row]; await setLocalRef(ref);
  return { ok: true, client: row };
}
export async function updateClientCredit(id, patch) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("clients_credit").update(patch).eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.clients = (ref.clients || []).map((c) => (c.id === id || c.code === id) ? { ...c, ...patch } : c);
  await setLocalRef(ref);
  return { ok: true };
}

// ── CRUD Prix (suppression d'une saisie erronée) ──
export async function deletePrix(id) {
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("prix_carburant").delete().eq("id", id); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.prix = (ref.prix || []).filter((p) => p.id !== id);
  await setLocalRef(ref);
  return { ok: true };
}

// ── Livraisons carburant ──
export async function saveLivraison(liv) {
  const row = { id: liv.id || uuid(), station_id: liv.station_id, date_livraison: liv.date_livraison, numero_bl: liv.numero_bl, produit: liv.produit, volume_l: n(liv.volume_l), depot: liv.depot || "", camion: liv.camion || "", chauffeur: liv.chauffeur || "", prix_achat: liv.prix_achat ? +liv.prix_achat : null, manquant_l: n(liv.manquant_l) };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("livraisons_carburant").upsert(row); if (error) return { error: error.message }; }
  await db.livraisons.put(row);
  return { ok: true };
}
export async function listLivraisons(stationId) {
  const sb = getSupabase();
  if (sb) { try { const { data } = await sb.from("livraisons_carburant").select("*").eq("station_id", stationId).order("date_livraison", { ascending: false }).limit(100); if (data) return data; } catch {} }
  return db.livraisons.where("station_id").equals(stationId).reverse().sortBy("date_livraison");
}

// ── Jauges cuves ──
export async function saveJauge(jauge) {
  const row = { station_id: jauge.station_id, date_jauge: jauge.date_jauge, produit: jauge.produit, jauge_j: +jauge.jauge_j, livraison_l: n(jauge.livraison_l), vente_j: n(jauge.vente_j), jauge_j1: jauge.jauge_j1 != null && jauge.jauge_j1 !== "" ? +jauge.jauge_j1 : null };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("jauges_cuves").upsert(row, { onConflict: "station_id,date_jauge,produit" }); if (error) return { error: error.message }; }
  await db.jauges.put({ ...row, id: jauge.id || undefined });
  return { ok: true };
}
export async function listJauges(stationId) {
  const sb = getSupabase();
  if (sb) { try { const { data } = await sb.from("jauges_cuves").select("*").eq("station_id", stationId).order("date_jauge", { ascending: false }).limit(60); if (data) return data; } catch {} }
  return db.jauges.where("station_id").equals(stationId).reverse().sortBy("date_jauge");
}

// ── Pompistes ──
export async function listPompistes(stationId) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("pompistes").select("*").eq("station_id", stationId);
      if (data) return data;
    } catch {}
  }
  return db.pompistes.where("station_id").equals(stationId).toArray();
}
export async function savePompiste(p) {
  const row = { id: p.id || uuid(), station_id: p.station_id, nom: p.nom, actif: p.actif !== false };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("pompistes").upsert(row); if (error) return { error: error.message }; }
  await db.pompistes.put(row);
  return { ok: true, pompiste: row };
}

// ── Quarts pompistes ──
export async function listQuarts(dateISO) {
  const key = dateISO || todayISO();
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: rapports } = await sb.from("rapports_journaliers").select("id").eq("date_rapport", key);
      const ids = (rapports || []).map((r) => r.id);
      if (ids.length > 0) {
        const { data } = await sb.from("quarts_pompistes").select("*").in("rapport_id", ids).limit(200);
        if (data) {
          const merged = data.map((q) => ({ ...q, date: key }));
          for (const m of merged) await db.quarts.put(m);
          return merged;
        }
      }
    } catch {}
  }
  return db.quarts.where("date").equals(key).toArray();
}

export async function saveQuarts(quarts) {
  const withDate = quarts.map((q) => ({ ...q, date: q.date || todayISO() }));
  for (const q of withDate) await db.quarts.put(q);
  const sb = getSupabase();
  if (!sb) return { ok: true, cloud: false, count: withDate.length };
  try {
    await syncQuartsCloud(withDate);
    return { ok: true, cloud: true, count: withDate.length };
  } catch (e) {
    await db.queue.add({ op: "upsert_quarts", payload: withDate, created_at: Date.now(), error: String(e.message || e) });
    return { ok: true, cloud: false, pending: true, count: withDate.length, error: e.message };
  }
}

// ── Cuves ──
export async function listCuves(stationId) {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("cuves").select("*").eq("station_id", stationId);
      if (data?.length) return data;
    } catch {}
  }
  const ref = await getLocalRef();
  return (ref.cuves || []).filter((c) => c.station_id === stationId);
}
export async function saveCuve(cuve) {
  const row = { id: cuve.id || uuid(), station_id: cuve.station_id, produit: cuve.produit, capacite_l: n(cuve.capacite_l) || null };
  const sb = getSupabase();
  if (sb) { const { error } = await sb.from("cuves").upsert(row, { onConflict: "station_id,produit" }); if (error) return { error: error.message }; }
  const ref = await getLocalRef();
  ref.cuves = [...(ref.cuves || []).filter((c) => !(c.station_id === row.station_id && c.produit === row.produit)), row];
  await setLocalRef(ref);
  return { ok: true, cuve: row };
}

// ── Opérations crédit ──
export async function saveOperationCredit(op) {
  const row = { client_code: op.client_code, station_id: op.station_id, date_op: op.date_op, matricule: op.matricule || "", volume_l: n(op.volume_l), valeur_cons: n(op.valeur_cons), depot: n(op.depot), rapport_id: op.rapport_id || null };
  const id = await db.operations_credit.add(row);
  const sb = getSupabase();
  if (sb) {
    try {
      const { data: cl } = await sb.from("clients_credit").select("id").eq("code", op.client_code).maybeSingle();
      if (!cl) throw new Error("Client crédit introuvable au niveau du cloud");
      const { error } = await sb.from("operations_credit").insert({ ...row, client_id: cl.id });
      if (error) throw new Error(error.message);
    } catch (e) {
      await db.queue.add({ op: "upsert_operation_credit", payload: row, created_at: Date.now(), error: String(e.message || e) });
      return { ok: true, cloud: false, pending: true, id, row, error: e.message };
    }
  }
  return { ok: true, cloud: Boolean(sb), id, row };
}
export async function listOperationsCredit(clientCode) {
  const sb = getSupabase();
  if (sb) { try { const { data: cl } = await sb.from("clients_credit").select("id").eq("code", clientCode).maybeSingle(); if (cl) { const { data } = await sb.from("operations_credit").select("*").eq("client_id", cl.id).order("date_op", { ascending: false }).limit(200); if (data) return data; } } catch {} }
  return db.operations_credit.where("client_code").equals(clientCode).reverse().sortBy("date_op");
}
export async function soldeClient(clientCode) {
  const ops = await listOperationsCredit(clientCode);
  return ops.reduce((s, o) => s + n(o.depot) - n(o.valeur_cons), 0);
}

export async function listNotifications() {
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("notifications").select("*").order("cree_le", { ascending: false }).limit(30);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function marquerNotificationLue(id) {
  const sb = getSupabase();
  if (!sb) return { ok: false };
  const { error } = await sb.from("notifications").update({ lu: true }).eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

// ── Suppression d'un rapport (brouillons / rejetés) ──
export async function deleteRapport(doc, ref) {
  if (!doc || !doc.id) return { error: "Rapport invalide" };
  if (doc.statut === "VALIDE") return { error: "Un rapport validé ne peut pas être supprimé — historique gardé" };
  const sb = getSupabase();
  if (sb) {
    try {
      const referentiel = ref || (await getLocalRef());
      const station = referentiel.stations.find((s) => s.code === doc.station);
      if (station) {
        const { error } = await sb.from("rapports_journaliers").delete().eq("station_id", station.id).eq("date_rapport", doc.date);
        if (error && !String(error.message || "").toLowerCase().includes("no rows")) {
          if (String(error.message || "").toLowerCase().includes("policy")) return { error: "Suppression refusée côté serveur (RLS)" };
        }
      }
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }
  await db.rapports.delete(doc.id);
  await db.mouvements.where("rapport_id").equals(doc.id).delete();
  await db.quarts.where("rapport_id").equals(doc.id).delete();
  const queued = await db.queue.toArray();
  for (const q of queued) {
    if (q.op === "upsert_rapport" && q.payload?.id === doc.id) await db.queue.delete(q.id);
  }
  return { ok: true };
}

// ── Paramètres réseau ──
export const PARAMETRES_DEFAUT = { id: "reseau", nom_reseau: "OGSS Réseau", devise: "FCFA", adresse: "", contact: "" };

export async function getParametres() {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data } = await sb.from("parametres_networks").select("*").eq("id", "reseau").maybeSingle();
      if (data) return { ...PARAMETRES_DEFAUT, ...data };
    } catch {
      /* hors ligne : cache locale */
    }
  }
  const local = await db.meta.get("parametres");
  return { ...PARAMETRES_DEFAUT, ...(local?.value || {}) };
}

export async function saveParametres(p) {
  const row = { ...PARAMETRES_DEFAUT, ...p, id: "reseau", maj_le: new Date().toISOString() };
  await db.meta.put({ key: "parametres", value: row });
  const sb = getSupabase();
  if (!sb) return { ok: true, cloud: false, parametres: row };
  try {
    const { error } = await sb.from("parametres_networks").upsert(row);
    if (error) throw new Error(error.message);
    return { ok: true, cloud: true, parametres: row };
  } catch (e) {
    return { ok: true, cloud: false, pending: true, parametres: row, error: e.message };
  }
}

// ── Diagnostic synchronisation ──
export async function diagSync() {
  const sb = getSupabase();
  const pending = await db.queue.count();
  const localRapports = await db.rapports.count();
  const lastSyncMeta = await db.meta.get("last_sync");
  const result = { cloud: !!sb, enLigne: !!navigator?.onLine, pending, localRapports, lastSync: lastSyncMeta?.value || null, ok: false };
  if (sb) {
    try {
      const { count, error } = await sb.from("rapports_journaliers").select("id", { count: "exact", head: true });
      if (error) { result.erreur = error.message; } else { result.ok = true; result.cloudRapports = count ?? 0; }
    } catch (e) { result.erreur = String(e.message || e); }
  } else {
    result.erreur = "Cloud non configuré — mode démonstration locale";
  }
  return result;
}

export { referentielFromSeed };

