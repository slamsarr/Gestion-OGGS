import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { T } from "../lib/calcul";
import { DEMO_USERS } from "../lib/seed";
import { Loading, Button, Badge, Card } from "../components/ui";
import { PRODUCT } from "../lib/branding";

export default function Login() {
  const { session, loading, login, loginDemo, signup, resetPassword, cloud, demoMode } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("gerant.hann@fuelos.demo");
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-surface-base via-fuelos-50/40 to-purple-50/30">
      <div className="w-full max-w-lg relative animate-subtle-in">
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-damel-blue/5 blur-3xl" />
        <div className="absolute -bottom-16 -right-10 w-52 h-52 rounded-full bg-star-purple/5 blur-3xl" />

        <div className="relative bg-white rounded-3xl shadow-pop overflow-hidden border border-surface-border/80">
          <div className="relative w-full overflow-hidden bg-gradient-to-br from-fuelos-950 via-fuelos-900 to-damel-navy-ink p-6 sm:p-7 text-white border-b border-white/10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-damel-yellow/5 rounded-full blur-3xl -mt-20 -mr-20" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-12 px-3 rounded-2xl bg-white shadow-button flex items-center justify-center border border-white/90">
                  <img
                    src="/branding/damel-energy/damel-energy-logo.svg"
                    alt="DAMEL ENERGY"
                    className="h-7.5 w-auto object-contain"
                    style={{ height: "30px" }}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-2xl tracking-tight">{PRODUCT.name}</span>
                    <Badge variant="gold">v2.0</Badge>
                  </div>
                  <span className="text-[11.5px] text-fuelos-200/90 font-medium block mt-0.5">
                    Plateforme de gestion de stations-service · {PRODUCT.tagline}
                  </span>
                  <span className="text-[10.5px] text-damel-yellow font-bold block mt-1.5 tracking-wider uppercase">
                    by DAMEL ENERGY
                  </span>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                <div className="flex items-center gap-1.5 bg-white/8 border border-white/15 px-2.5 py-1.5 rounded-xl backdrop-blur-sm">
                  <img
                    src="/star_energy_logo.jpg"
                    alt="Star Energy"
                    className="w-5 h-5 object-contain rounded"
                  />
                  <span className="text-[10.5px] text-amber-300 font-bold">STAR ENERGY</span>
                </div>
                <Badge variant="info" className="!bg-white/10 !text-fuelos-100 !border-white/15">{cloud ? "Cloud" : "Local"}</Badge>
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-fuelos-50 to-white border border-fuelos-100 flex items-center justify-center shadow-card">
                <img
                  src="/branding/damel-energy/damel-energy-icon.svg"
                  alt="DAMEL ENERGY"
                  className="w-6.5 h-6.5 object-contain"
                  style={{ width: "26px", height: "26px" }}
                />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-extrabold tracking-tight text-fuelos-900">
                  Connexion à {PRODUCT.name}
                </h2>
                <p className="text-[12px] text-slate-500 mt-0.5">
                  Accédez à votre espace de gestion · {ROLE_LABELS_FRIENDLY?.[mode] || "Exploitation & Pilotage"}
                </p>
              </div>
            </div>

            {isRecovery ? (
              <form onSubmit={submitNewPassword} className="grid gap-4">
                <p className="text-sm text-slate-600 bg-blue-50 border border-blue-200 rounded-xl px-3.5 py-3">
                  <span className="font-semibold text-blue-900">🔐 Sécurité</span> — Choisissez un nouveau mot de passe sécurisé.
                </p>
                <div>
                  <label className="label block mb-1.5">Nouveau mot de passe</label>
                  <input
                    className="input-base"
                    type="password"
                    placeholder="Minimum 8 caractères"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                {err && <div className="text-xs p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200">{err}</div>}
                <Button variant="primary" size="lg" type="submit" disabled={busy} icon={busy ? "⏳" : "✓"} fullWidth>
                  {busy ? "Mise à jour…" : "Mettre à jour le mot de passe"}
                </Button>
              </form>
            ) : (
              <>
                <form onSubmit={mode === "reset" ? submitReset : submit} className="grid gap-3.5">
                  {mode === "signup" && (
                    <div>
                      <label className="label block mb-1.5">Nom complet</label>
                      <input className="input-base" placeholder="Ex : M. Mbaye DIOP" value={nom} onChange={(e) => setNom(e.target.value)} required />
                    </div>
                  )}
                  <div>
                    <label className="label block mb-1.5">Adresse e-mail</label>
                    <input
                      className="input-base"
                      type="email"
                      placeholder="utilisateur@damel-energy.sn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  {mode !== "reset" ? (
                    <div>
                      <label className="label block mb-1.5">Mot de passe</label>
                      <input
                        className="input-base"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                      />
                    </div>
                  ) : (
                    <div className="text-sm bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-amber-900">
                      <span className="font-semibold">ℹ️</span> Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation par e-mail.
                    </div>
                  )}
                  {err && <div className="text-xs p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 font-medium">{err}</div>}
                  {info && <div className="text-xs p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">{info}</div>}
                  <Button
                    variant="primary"
                    size="lg"
                    type="submit"
                    disabled={busy}
                    icon={busy ? "⏳" : "🔑"}
                    fullWidth
                    className="mt-1"
                  >
                    {busy
                      ? "Connexion en cours…"
                      : mode === "signup"
                      ? "Créer mon compte"
                      : mode === "reset"
                      ? "Envoyer le lien de réinitialisation"
                      : "Se connecter"}
                  </Button>
                </form>

                {demoMode && (
                  <div className="mt-5 pt-4 border-t border-surface-border">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <span>⚡</span> Démo — Connexion rapide par métier
                      </div>
                      <Badge variant="star">1 clic</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1 no-scrollbar">
                      {DEMO_USERS.map((u) => (
                        <button
                          key={u.email}
                          type="button"
                          disabled={busy}
                          onClick={() => handleQuickLogin(u)}
                          className="w-full text-left px-3 py-2.5 rounded-xl text-xs border border-surface-border bg-white flex items-center justify-between hover:bg-fuelos-50 hover:border-fuelos-200 hover:shadow-card transition-all duration-150 group"
                        >
                          <div className="truncate pr-1.5">
                            <span className="font-bold text-slate-900 block truncate text-[12px]">{u.nom_complet || u.role}</span>
                            <span className="text-slate-400 text-[10px] uppercase font-extrabold tracking-wider">{u.role}</span>
                          </div>
                          <span className="text-xs font-black text-damel-blue group-hover:translate-x-0.5 transition-transform">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {cloud && (
                  <div className="mt-4 flex justify-between items-center text-[11.5px] pt-3 border-t border-surface-border">
                    <button
                      type="button"
                      className="text-damel-blue hover:text-fuelos-700 font-bold transition-colors"
                      onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                    >
                      {mode === "signup" ? "← J'ai déjà un compte" : "Créer un compte"}
                    </button>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-700 font-medium transition-colors"
                      onClick={() => setMode(mode === "reset" ? "login" : "reset")}
                    >
                      {mode === "reset" ? "← Retour connexion" : "Mot de passe oublié ?"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-gradient-to-br from-surface-muted to-white border-t border-surface-border/80 px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 text-[11px]">
            <span className="flex items-center gap-2 font-bold text-damel-blue">
              <img src="/branding/damel-energy/damel-energy-icon.svg" alt="DE" className="w-4 h-4 object-contain" />
              <span>DAMEL ENERGY</span>
              <span className="text-slate-300">·</span>
              <span className="font-extrabold text-fuelos-900">{PRODUCT.name}</span>
            </span>
            <span className="flex items-center gap-1.5 text-[10.5px] text-slate-600 font-medium">
              <span>Réseau exploité :</span>
              <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3.5 h-3.5 object-contain rounded" />
              <span className="text-star-purple font-black">STAR ENERGY</span>
            </span>
          </div>
        </div>

        <div className="text-center mt-4 text-[10.5px] text-slate-400 font-medium">
          © {new Date().getFullYear()} DAMEL ENERGY — {PRODUCT.name} v2.0 · Tous droits réservés
        </div>
      </div>
    </div>
  );
}

const ROLE_LABELS_FRIENDLY = {
  login: "Pilotage & Opérations",
  signup: "Création de compte",
  reset: "Récupération de compte",
};
