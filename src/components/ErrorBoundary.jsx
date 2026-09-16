import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur applicative :", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#F5F3EF", padding: 24 }}>
          <div style={{ maxWidth: 420, width: "100%", background: "white", borderRadius: 12, padding: 24, border: "1px solid #E5E0D8", textAlign: "center" }}>
            <div style={{ fontSize: 32 }}>⚠️</div>
            <h1 style={{ fontSize: 18, fontWeight: 600, color: "#0E3A56", margin: "12px 0 4px" }}>Une erreur est survenue</h1>
            <p style={{ fontSize: 13, color: "#6B6B6B", marginBottom: 16 }}>L'application a rencontré un problème inattendu. Vos données locales sont conservées.</p>
            <code style={{ display: "block", fontSize: 12, background: "#F5F3EF", padding: 10, borderRadius: 8, marginBottom: 16, color: "#B3261E" }}>
              {String(this.state.error?.message || this.state.error)}
            </code>
            <button
              onClick={() => { this.setState({ error: null }); }}
              style={{ width: "100%", padding: 12, borderRadius: 8, fontWeight: 600, background: "#F2B90C", color: "#0E0E0E", border: "none", cursor: "pointer" }}
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}