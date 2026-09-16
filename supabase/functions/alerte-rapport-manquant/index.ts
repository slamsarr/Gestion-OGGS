// Supabase Edge Function — Alerte rapport manquant (J-1)
// Déploiement :
//   supabase functions deploy alerte-rapport-manquant
// Planification (Dashboard → Edge Functions → Schedules, ou pg_cron) : 0 10 * * * (10h UTC)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dateHierISO, evaluerRapportsManquants, composerMessageAlerte } from "../_shared/alertes.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: rpcData, error: rpcErr } = await supabase.rpc("verifier_rapports_manquants");
    if (!rpcErr && rpcData) {
      return new Response(JSON.stringify(rpcData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateHier = dateHierISO();

    const { data: stations, error: stErr } = await supabase
      .from("stations")
      .select("id, code, nom, actif")
      .eq("actif", true);
    if (stErr) throw stErr;

    if (!stations || stations.length === 0) {
      return new Response(JSON.stringify({ message: "Aucune station active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rapports, error: rpErr } = await supabase
      .from("rapports_journaliers")
      .select("station_id, statut")
      .eq("date_rapport", dateHier);
    if (rpErr) throw rpErr;

    const { manquantes, brouillons } = evaluerRapportsManquants(stations, rapports);

    if (manquantes.length === 0 && brouillons.length === 0) {
      return new Response(JSON.stringify({ message: "Tous les rapports J-1 sont soumis", date: dateHier }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = composerMessageAlerte(dateHier, manquantes, brouillons);

    const { data: admins, error: adErr } = await supabase
      .from("profils")
      .select("id, nom_complet, role")
      .in("role", ["superviseur", "directeur"])
      .eq("actif", true);
    if (adErr) throw adErr;

    for (const admin of admins || []) {
      const { error } = await supabase.from("notifications").insert({
        user_id: admin.id,
        type: "RAPPORT_MANQUANT",
        titre: `Rapport(s) manquant(s) du ${dateHier}`,
        message,
        date_ref: dateHier,
        lu: false,
      });
      if (error) console.error(`Notification ${admin.id}:`, error.message);
    }

    console.log(`[ALERTE ${dateHier}] ${message}`);

    return new Response(JSON.stringify({
      date: dateHier,
      manquantes: manquantes.map((s) => s.code),
      brouillons: brouillons.map((s) => s.code),
      notifies: (admins || []).length,
      message,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erreur Edge Function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
