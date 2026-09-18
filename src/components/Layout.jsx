import { useEffect, useState, useMemo } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { T } from "../lib/calcul";
import { flushQueue, listNotifications, marquerNotificationLue, getParametres } from "../lib/api";
import { db } from "../lib/db";
import { ROLE_LABELS } from "../lib/permissions";

const NAV_POLES = [
  {
    id: "pilotage",
    label: "📊 Pilotage",
    roles: ["superviseur", "directeur", "comptable", "gerant", "admin"],
    items: [
      { to: "/", label: "Réseau / Dashboard", icon: "📈", roles: ["superviseur", "directeur", "comptable", "gerant", "admin"] },
      { to: "/rapport", label: "Rapport Journalier", icon: "📋", roles: ["gerant", "superviseur", "directeur", "admin"] },
      { to: "/historique", label: "Historique Rapports", icon: "📁", roles: ["superviseur", "directeur", "comptable", "gerant", "admin"] },
    ],
  },
  {
    id: "operations",
    label: "⛽ Opérations Terrain",
    roles: ["pompiste", "gerant", "admin", "superviseur", "directeur", "stock", "lavage", "boutique", "maintenance"],
    items: [
      { to: "/descente", label: "Ma Descente", icon: "⛽", roles: ["pompiste", "gerant", "admin", "superviseur", "directeur"] },
      { to: "/cuves", label: "Cuves & Jauges", icon: "🛢️", roles: ["stock", "gerant", "admin", "superviseur", "directeur"] },
      { to: "/lavage", label: "Lavage Auto", icon: "🚿", roles: ["lavage", "gerant", "admin", "superviseur", "directeur"] },
      { to: "/boutique", label: "Boutique / Shop", icon: "🛒", roles: ["boutique", "stock", "gerant", "admin", "superviseur", "directeur"] },
      { to: "/maintenance", label: "Maintenance", icon: "🛠️", roles: ["maintenance", "gerant", "admin", "superviseur", "directeur"] },
    ],
  },
  {
    id: "finance",
    label: "💼 Finance & Crédits",
    roles: ["superviseur", "directeur", "comptable", "gerant", "admin"],
    items: [
      { to: "/finance", label: "Finance & Caisse", icon: "💰", roles: ["superviseur", "directeur", "comptable", "admin"] },
      { to: "/depenses", label: "Dépenses & Justifs", icon: "🧾", roles: ["gerant", "superviseur", "directeur", "comptable", "admin"] },
      { to: "/clients-pro", label: "Clients Pro & Crédits", icon: "👥", roles: ["gerant", "superviseur", "directeur", "comptable", "admin"] },
      { to: "/fournisseurs", label: "Fournisseurs & BL", icon: "🚚", roles: ["superviseur", "directeur", "comptable", "admin"] },
    ],
  },
  {
    id: "gestion",
    label: "⚙️ Configuration",
    roles: ["directeur", "admin", "gerant", "superviseur"],
    items: [
      { to: "/pistolets", label: "Pistolets & Pompes", icon: "🔫", roles: ["superviseur", "directeur", "gerant", "admin"] },
      { to: "/pompistes", label: "Équipe Pompistes", icon: "👷", roles: ["superviseur", "directeur", "gerant", "admin"] },
      { to: "/stocks", label: "Stocks Récapitulatifs", icon: "📦", roles: ["gerant", "superviseur", "directeur", "comptable", "admin"] },
      { to: "/parametres", label: "Paramètres Réseau", icon: "⚙️", roles: ["directeur", "admin"] },
    ],
  },
];

export default function Layout() {
  const { profil, logout, online, cloud } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = profil?.role || "gerant";

  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nomReseau, setNomReseau] = useState("OGSS Réseau");

  const unread = notifs.filter((n) => !n.lu).length;

  // Filtrer les pôles et leurs liens selon le rôle
  const availablePoles = useMemo(() => {
    return NAV_POLES.map((pole) => ({
      ...pole,
      items: pole.items.filter((item) => item.roles.includes(role)),
    })).filter((pole) => pole.items.length > 0);
  }, [role]);

  // Détecter le pôle actif selon l'URL courante
  const currentPath = location.pathname;
  const detectedPole = useMemo(() => {
    for (const pole of availablePoles) {
      if (pole.items.some((item) => (item.to === "/" ? currentPath === "/" : currentPath.startsWith(item.to)))) {
        return pole.id;
      }
    }
    return availablePoles[0]?.id || "pilotage";
  }, [currentPath, availablePoles]);

  const [selectedPoleId, setSelectedPoleId] = useState(detectedPole);

  useEffect(() => {
    setSelectedPoleId(detectedPole);
  }, [detectedPole]);

  const activePole = availablePoles.find((p) => p.id === selectedPoleId) || availablePoles[0];

  useEffect(() => {
    let alive = true;
    getParametres().then((p) => { if (alive && p?.nom_reseau) setNomReseau(p.nom_reseau); }).catch(() => {});
    return () => { alive = false; };
  }, [cloud]);

  // Check pending queue count
  useEffect(() => {
    const check = async () => {
      try { const count = await db.queue.count(); setPending(count); } catch {}
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    const syncOnline = async () => {
      if (!navigator.onLine) return;
      try {
        const { flushed } = await flushQueue();
        if (flushed > 0) {
          setSyncMsg(`${flushed} rapport(s) synchronisé(s)`);
          setPending((p) => Math.max(0, p - flushed));
          setTimeout(() => setSyncMsg(""), 4000);
        }
      } catch {}
    };
    window.addEventListener("online", syncOnline);
    syncOnline();
    return () => window.removeEventListener("online", syncOnline);
  }, []);

  useEffect(() => {
    if (!cloud) return undefined;
    const load = async () => {
      try { setNotifs(await listNotifications()); } catch { /* hors ligne */ }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [cloud]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* HEADER SUPÉRIEUR */}
      <header className="sticky top-0 z-40 bg-[#0B2530] text-white shadow-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
          {/* Logo & Identité Station */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200"
              aria-label="Menu"
            >
              <span className="text-lg">☰</span>
            </button>
            <NavLink to="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm shadow-xs group-hover:scale-105 transition-transform">
                ⛽
              </div>
              <div>
                <div className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                  <span>{nomReseau}</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">PRO</span>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {profil?.stations?.nom || (profil?.station_id ? `Station ${profil.station_id.replace("st-", "").toUpperCase()}` : "Réseau Global")}
                </div>
              </div>
            </NavLink>
          </div>

          {/* Statut & Outils Utilisateur */}
          <div className="flex items-center gap-2 text-xs">
            {/* Indicateur de connectivité */}
            <span
              className={`px-2 py-0.5 rounded-full flex items-center gap-1.5 text-[11px] font-semibold border ${
                online
                  ? "bg-emerald-950/60 text-emerald-300 border-emerald-800/60"
                  : "bg-rose-950/60 text-rose-300 border-rose-800/60 animate-pulse"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-400"}`} />
              <span className="hidden sm:inline">{online ? "En ligne" : "Hors ligne"}</span>
              {pending > 0 && (
                <span className="bg-amber-400 text-slate-950 font-bold px-1 rounded-full text-[10px]">
                  {pending} en attente
                </span>
              )}
            </span>

            {/* Notifications / Alertes */}
            {cloud && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifs((v) => !v)}
                  className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium transition flex items-center gap-1"
                >
                  <span>🔔</span>
                  {unread > 0 && (
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white font-bold flex items-center justify-center text-[10px]">
                      {unread}
                    </span>
                  )}
                </button>
                {showNotifs && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl shadow-xl text-left p-2.5 z-50 bg-white text-slate-800 border border-slate-200">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 font-bold text-xs text-slate-900">
                      <span>Alertes & Notifications</span>
                      <span className="text-[10px] text-slate-400">{notifs.length} total</span>
                    </div>
                    {notifs.length === 0 && <div className="text-xs p-3 text-center text-slate-400">Aucune alerte récente</div>}
                    <div className="max-h-64 overflow-y-auto space-y-1">
                      {notifs.slice(0, 8).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          className={`block w-full text-left text-xs p-2 rounded-lg transition ${n.lu ? "bg-slate-50 hover:bg-slate-100" : "bg-amber-50/80 hover:bg-amber-100 border border-amber-200/60"}`}
                          onClick={async () => {
                            await marquerNotificationLue(n.id);
                            setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
                          }}
                        >
                          <div className="font-semibold text-slate-900">{n.titre}</div>
                          <div className="text-[11px] text-slate-600 mt-0.5">{n.message}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Profil utilisateur & Rôle */}
            <div className="hidden sm:flex flex-col text-right px-2 border-l border-slate-800">
              <span className="font-bold text-xs text-slate-200 leading-tight">{profil?.nom_complet || "Utilisateur"}</span>
              <span className="text-[10px] text-amber-300 font-medium">{ROLE_LABELS[role] || role}</span>
            </div>

            {/* Déconnexion */}
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              title="Se déconnecter"
              className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-rose-900/60 hover:border-rose-700 text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              <span className="sm:hidden">✕</span>
              <span className="hidden sm:inline">Quitter</span>
            </button>
          </div>
        </div>

        {/* Message de synchronisation automatique */}
        {syncMsg && (
          <div className="bg-emerald-900/80 text-emerald-200 text-xs py-1 px-4 text-center font-medium border-t border-emerald-800">
            ✓ {syncMsg}
          </div>
        )}

        {/* NIVEAU 1 : SÉLECTEUR DE PÔLES MÉTIER (Desktop) */}
        {availablePoles.length > 1 && (
          <div className="hidden md:flex max-w-6xl mx-auto px-4 gap-1 border-t border-slate-800/80 text-xs bg-[#091D26]">
            {availablePoles.map((pole) => {
              const isSelected = pole.id === selectedPoleId;
              return (
                <button
                  key={pole.id}
                  type="button"
                  onClick={() => setSelectedPoleId(pole.id)}
                  className={`px-4 py-2 font-bold transition-all border-b-2 flex items-center gap-1.5 ${
                    isSelected
                      ? "border-amber-400 text-white bg-slate-800/50"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
                  }`}
                >
                  <span>{pole.label}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                    {pole.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* NIVEAU 2 : SOUS-NAVIGATION DU PÔLE ACTIF */}
        <nav className="max-w-6xl mx-auto px-3 sm:px-4 flex overflow-x-auto gap-1.5 py-2 bg-[#07171E] border-t border-slate-800/60 no-scrollbar">
          {activePole?.items.map((item) => {
            const isRoot = item.to === "/";
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={isRoot}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-all shadow-xs ${
                    isActive
                      ? "bg-amber-400 text-slate-950 shadow-md font-bold"
                      : "bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 hover:text-white"
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      {/* TIROIR MENU MOBILE COMPLET */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/70 backdrop-blur-xs flex">
          <div className="w-4/5 max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-4 bg-[#0B2530] text-white flex items-center justify-between">
              <div>
                <div className="font-extrabold text-sm">{nomReseau}</div>
                <div className="text-xs text-amber-300">{profil?.nom_complet} ({ROLE_LABELS[role] || role})</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {availablePoles.map((pole) => (
                <div key={pole.id} className="space-y-1">
                  <div className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider px-2 mb-1">
                    {pole.label}
                  </div>
                  <div className="grid gap-1">
                    {pole.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition ${
                            isActive
                              ? "bg-amber-400 text-slate-950 font-bold shadow-xs"
                              : "text-slate-700 hover:bg-slate-100"
                          }`
                        }
                      >
                        <span className="text-base">{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t bg-slate-50">
              <button
                type="button"
                onClick={async () => {
                  setMobileMenuOpen(false);
                  await logout();
                  navigate("/login");
                }}
                className="w-full py-2.5 rounded-xl bg-rose-50 text-rose-700 font-bold text-xs border border-rose-200 flex items-center justify-center gap-2"
              >
                <span>🚪</span>
                <span>Se déconnecter</span>
              </button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* CONTENU PRINCIPAL */}
      <main className="max-w-6xl mx-auto w-full px-3 sm:px-4 py-5 flex-1">
        <Outlet />
      </main>

      {/* PIED DE PAGE DISCRET */}
      <footer className="bg-white border-t border-slate-200 py-3 text-center text-[11px] text-slate-400 font-medium">
        {nomReseau} · Système Intégré de Gestion Pétrolière & PWA Hors-ligne · Version 2026
      </footer>
    </div>
  );
}
