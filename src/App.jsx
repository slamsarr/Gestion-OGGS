import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Historique from "./pages/Historique";
import Rapport from "./pages/Rapport";
import Stocks from "./pages/Stocks";
import Finance from "./pages/Finance";
import Depenses from "./pages/Depenses";
import ClientsPro from "./pages/ClientsPro";
import Fournisseurs from "./pages/Fournisseurs";
import Pistolets from "./pages/Pistolets";
import Pompistes from "./pages/Pompistes";
import Parametres from "./pages/Parametres";
import Configuration from "./pages/Configuration";
import Etats from "./pages/Etats";
import DescentePompiste from "./pages/DescentePompiste";
import Lavage from "./pages/Lavage";
import Entretien from "./pages/Entretien";
import Boutique from "./pages/Boutique";
import CuvesCarburant from "./pages/CuvesCarburant";
import Maintenance from "./pages/Maintenance";
import Fidelite from "./pages/Fidelite";
import BilanJournalierSite from "./pages/BilanJournalierSite";
import EspaceClientFidelite from "./pages/EspaceClientFidelite";
import TableauBordGerant from "./pages/TableauBordGerant";
import GestionQuarts from "./pages/GestionQuarts";
import ComptesClientsB2B from "./pages/ComptesClientsB2B";
import { rolesRoute } from "./lib/permissions";

function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-sm text-gray-500">Chargement…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ path, children }) {
  const { profil } = useAuth();
  const role = profil?.role;
  if (!role) return null;
  if (!rolesRoute(role, path)) return <Navigate to="/" replace />;
  return children;
}

// Redirection d'accueil selon le métier opérationnel réel (§37)
function HomeRouter() {
  const { profil } = useAuth();
  const role = profil?.role;
  if (!role) return null;
  if (role === "gerant") return <Navigate to="/gerant" replace />;
  if (role === "pompiste") return <Navigate to="/descente" replace />;
  if (role === "lavage") return <Navigate to="/lavage" replace />;
  if (role === "mecanicien") return <Navigate to="/entretien" replace />;
  if (role === "boutique") return <Navigate to="/boutique" replace />;
  if (role === "stock") return <Navigate to="/cuves" replace />;
  if (role === "maintenance") return <Navigate to="/maintenance" replace />;
  if (role === "commercial") return <Navigate to="/clients-pro" replace />;
  if (role === "client_pro") return <Navigate to="/clients-pro" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Espace Client Fidélité public (Accessible par scan de QR Code sans mot de passe) */}
      <Route path="/espace-fidelite" element={<EspaceClientFidelite />} />
      <Route path="/espace-fidelite/:id" element={<EspaceClientFidelite />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomeRouter />} />
        <Route path="/gerant" element={<RequireRole path="/gerant"><TableauBordGerant /></RequireRole>} />
        <Route path="/descente" element={<RequireRole path="/descente"><DescentePompiste /></RequireRole>} />
        <Route path="/cuves" element={<RequireRole path="/cuves"><CuvesCarburant /></RequireRole>} />
        <Route path="/fidelite" element={<RequireRole path="/fidelite"><Fidelite /></RequireRole>} />
        <Route path="/lavage" element={<RequireRole path="/lavage"><Lavage /></RequireRole>} />
        <Route path="/entretien" element={<RequireRole path="/entretien"><Entretien /></RequireRole>} />
        <Route path="/boutique" element={<RequireRole path="/boutique"><Boutique /></RequireRole>} />
        <Route path="/maintenance" element={<RequireRole path="/maintenance"><Maintenance /></RequireRole>} />
        <Route path="/incidents" element={<RequireRole path="/incidents"><Navigate to="/maintenance" replace /></RequireRole>} />

        <Route path="/historique" element={<RequireRole path="/historique"><Historique /></RequireRole>} />
        <Route path="/rapport" element={<RequireRole path="/rapport"><Rapport /></RequireRole>} />
        <Route path="/bilan-site" element={<RequireRole path="/bilan-site"><BilanJournalierSite /></RequireRole>} />
        <Route path="/stocks" element={<RequireRole path="/stocks"><Stocks /></RequireRole>} />
        <Route path="/finance" element={<RequireRole path="/finance"><Finance /></RequireRole>} />
        <Route path="/depenses" element={<RequireRole path="/depenses"><Depenses /></RequireRole>} />
        <Route path="/clients-pro" element={<RequireRole path="/clients-pro"><ClientsPro /></RequireRole>} />
        <Route path="/fournisseurs" element={<RequireRole path="/fournisseurs"><Fournisseurs /></RequireRole>} />
        <Route path="/pistolets" element={<RequireRole path="/pistolets"><Pistolets /></RequireRole>} />
        <Route path="/pompistes" element={<RequireRole path="/pompistes"><Pompistes /></RequireRole>} />
        <Route path="/gestion-quarts" element={<RequireRole path="/gestion-quarts"><GestionQuarts /></RequireRole>} />
        <Route path="/parametres" element={<RequireRole path="/parametres"><Parametres /></RequireRole>} />
        <Route path="/configuration" element={<RequireRole path="/configuration"><Configuration /></RequireRole>} />
        <Route path="/etats" element={<RequireRole path="/etats"><Etats /></RequireRole>} />
        <Route path="/comptes-clients-b2b" element={<RequireRole path="/comptes-clients-b2b"><ComptesClientsB2B /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
