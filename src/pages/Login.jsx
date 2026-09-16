import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { T } from "../lib/calcul";
import { DEMO_USERS } from "../lib/seed";
import { Loading } from "../components/ui";

export default function Login() {
  const { session, loading, login, signup, resetPassword, cloud } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(cloud ? "" : "gerant.hann@ogss.demo");
  const [password, setPassword] = useState(cloud ? "" : "Hann2026!");
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
      setErr(ex.message || "Échec");
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
      if (!sb) throw new Error("Cloud requise pour modifier le mot de passe");
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
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: T.paper }}>
      <div className="w-full max-w-md bg-white rounded-xl p-6" style={{ border: `1px solid ${T.line}` }}>
        <h1 className="text-xl font-semibold" style={{ color: T.petrol }}>OGSS Réseau</h1>
        <p className="text-sm mt-1 mb-4" style={{ color: T.muted }}>
          {cloud ? "Connexion au projet Supabase" : "Mode démonstration (données sur cet appareil)"}
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
                <input className="border rounded px-3 py-2" placeholder="Nom complet" value={nom} onChange={(e) => setNom(e.target.value)} required style={{ borderColor: T.line }} />
              )}
              <input className="border rounded px-3 py-2" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ borderColor: T.line }} />
              {mode !== "reset" ? (
                <input className="border rounded px-3 py-2" type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={{ borderColor: T.line }} />
              ) : (
                <p className="text-sm" style={{ color: T.muted }}>Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.</p>
              )}
              {err && <p className="text-sm" style={{ color: T.alert }}>{err}</p>}
              {info && <p className="text-sm" style={{ color: T.ok }}>{info}</p>}
              <button disabled={busy} className="py-3 rounded-lg font-semibold" style={{ background: T.gold, color: T.ink }}>
                {busy ? "…" : mode === "signup" ? "Créer le compte" : mode === "reset" ? "Envoyer le lien" : "Se connecter"}
              </button>
            </form>
            {cloud && (
              <div className="mt-3 grid gap-1 text-sm">
                <button style={{ color: T.petrol }} onClick={() => setMode(mode === "signup" ? "login" : "signup")}>
                  {mode === "signup" ? "Déjà un compte ? Connexion" : "Premier utilisateur ? Créer un compte (devient gérant)"}
                </button>
                <button style={{ color: T.muted }} onClick={() => setMode(mode === "reset" ? "login" : "reset")}>
                  {mode === "reset" ? "← Retour à la connexion" : "Mot de passe oublié ?"}
                </button>
              </div>
            )}
            {!cloud && (
              <div className="mt-4 text-xs" style={{ color: T.muted }}>
                <div className="font-semibold mb-1">Comptes démo</div>
                {DEMO_USERS.map((u) => (
                  <button key={u.email} className="block w-full text-left py-1" onClick={() => { setEmail(u.email); setPassword(u.password); }}>
                    {u.role} — {u.email}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
