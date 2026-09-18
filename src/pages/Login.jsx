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
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: T.paper }}>
      <div className="w-full max-w-md bg-white rounded-xl p-6 shadow-sm" style={{ border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold" style={{ color: T.petrol }}>OGSS Réseau</h1>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: cloud ? "#EBF3FC" : "#F3F4F6", color: cloud ? T.petrol : T.muted }}>
            {cloud ? "Supabase Cloud" : "Mode local"}
          </span>
        </div>
        <p className="text-sm mb-4" style={{ color: T.muted }}>
          Gestion comptable & opérationnelle réseau de stations-service
        </p>

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
            <button disabled={busy} className="py-3 rounded-lg font-semibold" style={{ background: T.gold, color: T.ink }}>
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
                <label className="block text-xs font-medium mb-1" style={{ color: T.muted }}>Adresse e-mail</label>
                <input className="w-full border rounded px-3 py-2 text-sm" type="email" placeholder="utilisateur@ogss.sn" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ borderColor: T.line }} />
              </div>
              {mode !== "reset" ? (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: T.muted }}>Mot de passe</label>
                  <input className="w-full border rounded px-3 py-2 text-sm" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} style={{ borderColor: T.line }} />
                </div>
              ) : (
                <p className="text-sm" style={{ color: T.muted }}>Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.</p>
              )}
              {err && <p className="text-xs p-2 rounded" style={{ background: "#FDF2F2", color: T.alert }}>{err}</p>}
              {info && <p className="text-xs p-2 rounded" style={{ background: "#E3F4EA", color: T.ok }}>{info}</p>}
              <button disabled={busy} className="py-2.5 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90" style={{ background: T.gold, color: T.ink }}>
                {busy ? "Connexion en cours…" : mode === "signup" ? "Créer le compte" : mode === "reset" ? "Envoyer le lien" : "Se connecter"}
              </button>
            </form>

            {demoMode && (
              <div className="mt-4 pt-4 border-t" style={{ borderColor: T.line }}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: T.muted }}>
                  Connexion rapide (comptes démo par métier) :
                </div>
                <div className="grid grid-cols-1 gap-1.5 max-h-60 overflow-y-auto pr-1">
                  {DEMO_USERS.map((u) => (
                    <button
                      key={u.email}
                      type="button"
                      disabled={busy}
                      onClick={() => handleQuickLogin(u)}
                      className="w-full text-left px-3 py-2 rounded text-xs border flex items-center justify-between hover:bg-amber-50 hover:border-amber-400 transition-colors"
                      style={{ borderColor: T.line }}
                    >
                      <div>
                        <span className="font-semibold text-gray-900">{u.nom_complet || u.role}</span>
                        <span className="opacity-60 ml-2 text-[11px]">({u.role})</span>
                      </div>
                      <span className="text-xs font-bold" style={{ color: T.petrol }}>Entrer →</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {cloud && (
              <div className="mt-3 flex justify-between text-xs">
                <button type="button" style={{ color: T.petrol }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
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
    </div>
  );
}
