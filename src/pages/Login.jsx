import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { T } from "../lib/calcul";
import { DEMO_USERS } from "../lib/seed";
import { Loading } from "../components/ui";

export default function Login() {
  const { session, loading, login, loginDemo, signup, resetPassword, cloud, demoMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("gerant.hann@ogss.demo");
  const [password, setPassword] = useState("Hann2026!");
  const [newPassword, setNewPassword] = useState("");
  const [nom, setNom] = useState("");
  const [mode, setMode] = useState("login");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const isRecovery = useMemo(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("type") === "recovery",
    []
  );

  if (loading) return <Loading />;
  if (!isRecovery && session) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setInfo("");
    setBusy(true);
    try {
      if (mode === "signup") await signup(email, password, nom);
      else await login(email, password);
    } catch (ex) {
      setErr(ex.message || "Échec de connexion");
    } finally {
      setBusy(false);
    }
  };

  const handleQuickLogin = async (user) => {
    setErr("");
    setBusy(true);
    try {
      if (loginDemo) {
        await loginDemo(user.email);
      } else {
        await login(user.email, user.password);
      }
    } catch (ex) {
      setErr(ex.message || "Échec de connexion");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setErr(""); setInfo("");
    setBusy(true);
    try {
      await resetPassword(email);
      setInfo("Un lien de réinitialisation vient d'être envoyé à votre adresse e-mail.");
      setMode("login");
    } catch (ex) {
      setErr(ex.message || "Échec de l'envoi");
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    setErr(""); setInfo("");
    setBusy(true);
    try {
      const { getSupabase } = await import("../lib/supabase");
      const sb = getSupabase();
      if (!sb) throw new Error("Cloud requis pour modifier le mot de passe");
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      window.history.replaceState({}, "", "/login");
      navigate("/", { replace: true });
    } catch (ex) {
      setErr(ex.message || "Échec");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "linear-gradient(135deg, #F5F8F2 0%, #EDE5F0 100%)" }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border" style={{ borderColor: T.line }}>
        {/* Bannière Officielle Damel Energy (Services & Gestion) */}
        <div className="relative w-full overflow-hidden bg-gradient-to-r from-[#102A43] via-[#0B4EA2] to-[#08336D] p-5 sm:p-6 text-white border-b-2 border-amber-400">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 px-3 rounded-xl bg-white shadow-md flex items-center justify-center">
                <img
                  src="/branding/damel-energy/damel-energy-logo.svg"
                  alt="DAMEL ENERGY"
                  className="h-7 w-auto object-contain"
                />
              </div>
              <div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500 text-white uppercase tracking-wider block w-fit">
                  SERVICES ÉNERGÉTIQUES &amp; GESTION
                </span>
                <span className="text-xs text-blue-100 font-medium">Plateforme d'Exploitation &amp; Réseau</span>
              </div>
            </div>
            {/* Logo Star Energy au second plan */}
            <div className="flex items-center gap-1.5 bg-black/30 border border-white/20 px-2.5 py-1 rounded-xl">
              <img
                src="/star_energy_logo.jpg"
                alt="Star Energy"
                className="w-5 h-5 object-contain rounded"
              />
              <span className="text-[10px] text-amber-300 font-bold hidden sm:inline">Réseau Star Energy</span>
            </div>
          </div>
          <p className="text-[11px] text-blue-100 font-medium mt-3 italic">
            « ENERGY • OPERATIONS • PERFORMANCE »
          </p>
        </div>

        <div className="p-6">
          {/* Logo et En-tête de connexion */}
          <div className="flex items-center gap-3 mb-4 pb-3 border-b" style={{ borderColor: T.line }}>
            <div className="h-12 px-2.5 rounded-xl border border-blue-200 bg-slate-50 flex items-center justify-center shadow-xs">
              <img
                src="/branding/damel-energy/damel-energy-icon.svg"
                alt="DAMEL ENERGY"
                className="w-8 h-8 object-contain"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-black tracking-tight text-[#0B4EA2]">
                  PORTAIL DAMEL ENERGY
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: cloud ? "#EBF3FC" : "#F3F4F6", color: cloud ? T.petrol : T.muted }}>
                  {cloud ? "Supabase Cloud" : "Mode local"}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium">
                Gestion stations-service &amp; services affiliés · Hann Mariste · Ndiakhirate
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-medium">Enseigne déployée :</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-[#56216C] font-black">
                  <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3.5 h-3.5 object-contain rounded-xs" />
                  STAR ENERGY SÉNÉGAL
                </span>
              </div>
            </div>
          </div>

          {isRecovery ? (
            <form onSubmit={submitNewPassword} className="grid gap-3">
              <p className="text-sm" style={{ color: T.muted }}>Choisissez un nouveau mot de passe.</p>
              <input
                className="border rounded px-3 py-2"
                type="password"
                placeholder="Nouveau mot de passe (min. 8 caractères)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                style={{ borderColor: T.line }}
              />
              {err && <p className="text-sm" style={{ color: T.alert }}>{err}</p>}
              <button disabled={busy} className="py-3 rounded-lg font-bold text-white shadow-sm" style={{ background: T.orange }}>
                {busy ? "…" : "Mettre à jour le mot de passe"}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={mode === "reset" ? submitReset : submit} className="grid gap-3">
                {mode === "signup" && (
                  <input className="border rounded px-3 py-2 text-sm" placeholder="Nom complet" value={nom} onChange={(e) => setNom(e.target.value)} required style={{ borderColor: T.line }} />
                )}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-gray-700">Adresse e-mail</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500" type="email" placeholder="utilisateur@starenergy.sn" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ borderColor: T.line }} />
                </div>
                {mode !== "reset" ? (
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-700">Mot de passe</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-500" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ borderColor: T.line }} />
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: T.muted }}>Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.</p>
                )}
                {err && <p className="text-xs p-2 rounded bg-rose-50 text-rose-700 border border-rose-200">{err}</p>}
                {info && <p className="text-xs p-2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">{info}</p>}
                <button
                  disabled={busy}
                  className="py-2.5 rounded-lg font-bold text-sm text-white shadow-md transition-all hover:opacity-95 mt-1"
                  style={{ background: "linear-gradient(to right, #0B4EA2, #102A43)" }}
                >
                  {busy ? "Connexion en cours…" : mode === "signup" ? "Créer le compte" : mode === "reset" ? "Envoyer le lien" : "Se connecter à la plateforme DAMEL ENERGY"}
                </button>
              </form>

              {demoMode && (
                <div className="mt-4 pt-3 border-t" style={{ borderColor: T.line }}>
                  <div className="text-[11px] font-bold uppercase tracking-wider mb-2 text-gray-500 flex items-center justify-between">
                    <span>⚡ Connexion rapide par métier (Démo) :</span>
                    <span className="text-[10px] text-amber-700 font-semibold">1 clic</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                    {DEMO_USERS.map((u) => (
                      <button
                        key={u.email}
                        type="button"
                        disabled={busy}
                        onClick={() => handleQuickLogin(u)}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs border flex items-center justify-between hover:bg-blue-50 hover:border-blue-400 transition-colors"
                        style={{ borderColor: T.line }}
                      >
                        <div className="truncate pr-1">
                          <span className="font-semibold text-gray-900 block truncate">{u.nom_complet || u.role}</span>
                          <span className="text-gray-400 text-[10px] uppercase font-bold">{u.role}</span>
                        </div>
                        <span className="text-xs font-black text-[#0B4EA2]">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cloud && (
                <div className="mt-3 flex justify-between text-xs pt-2 border-t" style={{ borderColor: T.line }}>
                  <button type="button" style={{ color: "#0B4EA2" }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
                    {mode === "signup" ? "Connexion existante" : "Créer un compte"}
                  </button>
                  <button type="button" style={{ color: T.muted }} onClick={() => setMode(mode === "reset" ? "login" : "reset")}>
                    {mode === "reset" ? "← Retour" : "Mot de passe oublié ?"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {/* Pied de carte d'authentification */}
        <div className="bg-slate-50 border-t px-6 py-3 flex items-center justify-between text-[11px] text-gray-500" style={{ borderColor: T.line }}>
          <span className="flex items-center gap-1.5 font-bold text-[#0B4EA2]">
            <img src="/branding/damel-energy/damel-energy-icon.svg" alt="DE" className="w-4 h-4 object-contain" />
            <span>DAMEL ENERGY</span>
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-slate-600 font-medium">
            <span>Réseau affilié :</span>
            <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3.5 h-3.5 object-contain rounded-xs" />
            <span className="text-[#56216C] font-black">STAR ENERGY</span>
          </span>
        </div>
      </div>
    </div>
  );
}
