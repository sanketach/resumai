import React from "react";

// Catches render-time errors anywhere below it so one bug doesn't take down
// the whole app with a blank white screen. Does NOT catch errors inside
// event handlers or async code (React error boundaries never do) — those
// are handled by the try/catch blocks already throughout App.jsx.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // In production this is where you'd forward to an error-monitoring
    // service (Sentry or similar) — deliberately not wired to one here to
    // avoid pulling in another third-party script before you've decided
    // you want one.
    console.error("ResumeBuilderPro crashed:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0B12", color: "#F3F4F6", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: "#9CA3AF", fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
            This page hit an unexpected error. Your saved resumes are stored in your browser and haven't been affected — reloading should bring you back to normal.
          </p>
          <button onClick={() => window.location.reload()} style={{ background: "#fff", color: "#0A0B12", border: "none", borderRadius: 999, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
