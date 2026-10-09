import { useEffect, useState, useMemo } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { flushQueue, listNotifications, marquerNotificationLue, getParametres } from "../lib/api";
import { db } from "../lib/db";
import { ROLE_LABELS, peutVoirNav } from "../lib/permissions";
import { OperatorBadge, BrandDualFooter, ProductBadge } from "./BrandingElements";
import { Button } from "./ui";

const NAV_POLES = [
  {
    id: "pilotage",
    label: "Pilotage & Cockpit",
    icon: "📊",
    items: [
      { to: "/gerant", label: "Poste de Commande", icon: "🏪" },
      { to: "/", label: "Cockpit Réseau", icon: "📈" },
      { to: "/bilan-site", label: "Bilan Journalier", icon: "📑" },
      { to: "/rapport", label: "Clôture Officielle", icon: "📋" },
      { to: "/historique", label: "Historique Clôtures", icon: "📁" },
    ],
  },
  {
    id: "operations",
    label: "Opérations",
    icon: "⛽",
    items: [
      { to: "/descente", label: "Descentes Pompistes", icon: "⛽" },
      { to: "/cuves", label: "Cuves & Dépotage", icon: "🛢️" },
      { to: "/stocks", label: "Stocks", icon: "📦" },
      { to: "/fidelite", label: "Fidélité", icon: "🎁" },
      { to: "/lavage", label: "Lavage", icon: "🚿" },
      { to: "/entretien", label: "Entretien", icon: "🔧" },
      { to: "/boutique", label: "Boutique", icon: "🛒" },
      { to: "/maintenance", label: "Maintenance", icon: "🛠️" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: "💼",
    items: [
      { to: "/clients-pro", label: "Clients Pro", icon: "📄" },
      { to: "/depenses", label: "Dépenses", icon: "🧾" },
      { to: "/finance", label: "Caisse & Trésorerie", icon: "💰" },
      { to: "/fournisseurs", label: "Fournisseurs", icon: "🚚" },
    ],
  },
  {
    id: "gestion",
    label: "Équipe & Config",
    icon: "⚙️",
    items: [
      { to: "/configuration", label: "Configuration", icon: "⚙️" },
      { to: "/pompistes", label: "Équipe & Quarts", icon: "�" },
      { to: "/gestion-quarts", label: "Planning Quarts", icon: "⏰" },
      { to: "/pistolets", label: "Pistolets & Pompes", icon: "🔫" },
      { to: "/parametres", label: "Paramètres Réseau", icon: "👥" },
    ],
  },
];

export default function Layout() {
  const { profil, logout, online, cloud } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = profil?.role || "";

  const [pending, setPending] = useState(0);
  const [syncMsg, setSyncMsg] = useState("");
  const [notifs, setNotifs] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [nomReseau, setNomReseau] = useState("STAR ENERGY");

  const unread = notifs.filter((n) => !n.lu).length;

  const availablePoles = useMemo(() => {
    return NAV_POLES.map((pole) => ({
      ...pole,
      items: pole.items.filter((item) => peutVoirNav(role, item.to)),
    })).filter((pole) => pole.items.length > 0);
  }, [role]);

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

  useEffect(() => {
    const check = async () => {
      try { const count = await db.queue.count(); setPending(count); } catch {}
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

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

  if (!role) {
    return (
      <div className="min-h-screen bg-surface-base flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-fuelos-50 border border-fuelos-200 mb-4 shadow-card">
          <img src="/branding/damel-energy/damel-energy-icon.svg" alt="Damel Energy" className="w-9 h-9 object-contain" />
        </div>
        <h2 className="text-lg font-extrabold text-fuelos-900 mb-1">FuelOS · DAMEL ENERGY</h2>
        <p className="text-sm text-slate-600 font-medium">Ce compte n’a pas encore de rôle attribué.</p>
        <p className="text-xs text-slate-500 mt-2 max-w-sm">Contacte le responsable réseau. Aucun droit gérant n’est accordé par défaut.</p>
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="mt-6"
          icon="🚪"
        >
          Se déconnecter
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-base text-slate-800 flex flex-col font-sans antialiased">
      <header className="sticky top-0 z-40 border-b border-fuelos-900/20 shadow-sm">
        <div className="bg-gradient-to-r from-fuelos-950 via-fuelos-900 to-damel-navy-ink text-white">
          <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="md:hidden btn-icon bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10"
                aria-label="Menu"
              >
                <span className="text-base">☰</span>
              </button>
              <NavLink to="/" className="flex items-center gap-3 group">
                <div className="h-10 px-2.5 rounded-xl bg-white shadow-button border border-white/80 shrink-0 flex items-center justify-center group-hover:scale-[1.03] transition-transform">
                  <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-6.5 w-auto object-contain" style={{ height: "26px" }} />
                </div>
                <div className="flex flex-col leading-tight">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-[15px] tracking-tight text-white">FuelOS</span>
                    <ProductBadge variant="dark-mini" />
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-white/10 text-fuelos-200 border border-white/15">
                      <img src="/star_energy_logo.jpg" alt="Star Energy" className="w-3.5 h-3.5 object-contain rounded-[2px]" />
                      <span>{nomReseau}</span>
                    </span>
                  </div>
                  <div className="text-[10.5px] text-fuelos-200/90 font-medium flex items-center gap-1.5 mt-0.5">
                    <span>{profil?.stations?.nom || (profil?.station_id ? `Station ${profil.station_id.replace("st-", "").toUpperCase()}` : "Gestion de stations-service")}</span>
                  </div>
                </div>
              </NavLink>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-semibold border backdrop-blur-sm ${
                  online
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30"
                    : "bg-red-500/15 text-red-300 border-red-400/30 animate-pulse"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="hidden sm:inline">{online ? "En ligne" : "Hors ligne"}</span>
                {pending > 0 && (
                  <span className="bg-damel-yellow text-fuelos-950 font-bold px-1.5 rounded-full text-[10px]">
                    {pending}
                  </span>
                )}
              </span>

              {cloud && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowNotifs((v) => !v)}
                    className="btn-icon bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10"
                  >
                    <span className="text-sm">🔔</span>
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full bg-red-500 text-white font-bold flex items-center justify-center text-[10px] shadow-md" style={{ width: "18px", height: "18px" }}>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </button>
                  {showNotifs && (
                    <div className="absolute right-0 mt-2 w-80 rounded-xl shadow-pop text-left p-2.5 z-50 bg-white text-slate-800 border border-surface-border animate-subtle-in">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-surface-border font-extrabold text-xs text-fuelos-900">
                        <span>🔔 Alertes & Notifications</span>
                        <span className="text-[10px] text-slate-400 font-medium">{notifs.length} total</span>
                      </div>
                      {notifs.length === 0 && <div className="text-xs p-4 text-center text-slate-400">Aucune alerte récente</div>}
                      <div className="max-h-72 overflow-y-auto space-y-1">
                        {notifs.slice(0, 8).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className={`block w-full text-left text-xs p-2.5 rounded-lg transition ${n.lu ? "bg-white hover:bg-surface-muted border border-transparent" : "bg-amber-50/80 hover:bg-amber-50 border border-amber-200/60"}`}
                            onClick={async () => {
                              await marquerNotificationLue(n.id);
                              setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, lu: true } : x)));
                            }}
                          >
                            <div className="font-bold text-slate-900">{n.titre}</div>
                            <div className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">{n.message}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="hidden sm:flex flex-col text-right px-2.5 border-l border-white/10 leading-tight">
                <span className="font-bold text-xs text-white">{profil?.nom_complet || "Utilisateur"}</span>
                <span className="text-[10.5px] text-damel-yellow font-semibold">{ROLE_LABELS[role] || role}</span>
              </div>

              <button
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                title="Se déconnecter"
                className="btn-icon bg-white/10 hover:bg-red-500/20 hover:border-red-400/30 text-slate-300 hover:text-white border border-white/10 transition-colors"
              >
                <span className="text-sm sm:hidden">✕</span>
                <span className="hidden sm:inline text-xs font-semibold px-1">Quitter</span>
              </button>
            </div>
          </div>

          {syncMsg && (
            <div className="bg-emerald-500/20 text-emerald-200 text-[11px] py-1.5 px-4 text-center font-semibold border-t border-emerald-500/20">
              ✓ {syncMsg}
            </div>
          )}

          {availablePoles.length > 1 && (
            <div className="hidden md:flex max-w-7xl mx-auto px-5 lg:px-6 gap-1 border-t border-white/10 bg-fuelos-950/50">
              {availablePoles.map((pole) => {
                const isSelected = pole.id === selectedPoleId;
                return (
                  <button
                    key={pole.id}
                    type="button"
                    onClick={() => setSelectedPoleId(pole.id)}
                    className={`px-4 py-2.5 font-bold transition-all border-b-[3px] flex items-center gap-2 text-[12.5px] ${
                      isSelected
                        ? "border-damel-yellow text-white bg-white/[0.07]"
                        : "border-transparent text-fuelos-200/80 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="text-base">{pole.icon}</span>
                    <span>{pole.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected ? "bg-damel-yellow text-fuelos-950" : "bg-white/10 text-fuelos-200/80"
                    }`}>
                      {pole.items.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <nav className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 flex overflow-x-auto gap-1.5 py-3 bg-surface-card/50 backdrop-blur border-b border-surface-border no-scrollbar">
          {activePole?.items.map((item) => {
            const isRoot = item.to === "/";
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={isRoot}
                className={({ isActive }) =>
                  `px-3.5 py-2 rounded-xl text-[11.5px] font-semibold whitespace-nowrap flex items-center gap-2 transition-all duration-150 ${
                    isActive
                      ? "bg-gradient-to-br from-damel-blue to-fuelos-700 text-white shadow-button font-bold"
                      : "bg-white text-slate-600 hover:bg-surface-muted border border-surface-border hover:border-surface-border-strong"
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/60 backdrop-blur-sm flex">
          <div className="w-[85%] max-w-sm bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-4 bg-gradient-to-r from-fuelos-950 via-fuelos-900 to-damel-navy-ink text-white flex items-center justify-between border-b-2 border-damel-yellow">
              <div className="flex items-center gap-2.5">
                <div className="h-9 px-2 rounded-xl bg-white shadow-sm border border-white/90 shrink-0 flex items-center justify-center">
                  <img src="/branding/damel-energy/damel-energy-logo.svg" alt="DAMEL ENERGY" className="h-5 w-auto object-contain" />
                </div>
                <div>
                  <div className="font-extrabold text-[13px] flex items-center gap-1.5">
                    <span>FuelOS</span>
                    <span className="text-[9px] px-1.5 py-0.25 bg-star-purple/90 text-amber-200 rounded font-bold">
                      {nomReseau}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-fuelos-200 font-medium">{profil?.nom_complet} · {ROLE_LABELS[role] || role}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="btn-icon bg-white/10 hover:bg-white/20 text-white border border-white/10"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {availablePoles.map((pole) => (
                <div key={pole.id} className="space-y-2">
                  <div className="text-[11px] font-extrabold text-fuelos-900 uppercase tracking-wider px-1 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="text-sm">{pole.icon}</span>
                      {pole.label}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuelos-50 text-fuelos-700 border border-fuelos-100">{pole.items.length}</span>
                  </div>
                  <div className="grid gap-1.5">
                    {pole.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/"}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[12px] font-semibold transition-all ${
                            isActive
                              ? "bg-gradient-to-br from-damel-blue to-fuelos-700 text-white shadow-button font-bold"
                              : "text-slate-700 hover:bg-fuelos-50 border border-transparent hover:border-fuelos-100"
                          }`
                        }
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t bg-surface-base space-y-2.5">
              <div className="flex items-center justify-center">
                <OperatorBadge variant="light" />
              </div>
              <Button
                variant="danger"
                fullWidth
                onClick={async () => {
                  setMobileMenuOpen(false);
                  await logout();
                  navigate("/login");
                }}
                icon="🚪"
              >
                Se déconnecter
              </Button>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <main className="max-w-7xl mx-auto w-full px-3 sm:px-5 lg:px-6 py-5 sm:py-6 flex-1">
        <Outlet />
      </main>

      <BrandDualFooter />
    </div>
  );
}
