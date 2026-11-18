import { Component, type ReactNode } from "react";

/** Keep a failed optional module from leaving an empty presentation screen. */
export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#f3f6fb", color: "#14223b", fontFamily: "system-ui,sans-serif" }}>
      <section role="alert" style={{ maxWidth: 480, padding: 32, background: "white", border: "1px solid #d6e0f0", borderRadius: 20 }}>
        <p style={{ color: "#245cdb", fontWeight: 700, letterSpacing: ".08em" }}>ALL DAY OS · DEMO</p>
        <h1 style={{ fontSize: 26, lineHeight: 1.25 }}>Odśwież przestrzeń demonstracyjną</h1>
        <p style={{ lineHeight: 1.6 }}>Nie udało się załadować części interfejsu. Zapisane dane Twojej sesji pozostają dostępne po odświeżeniu.</p>
        <button onClick={() => window.location.reload()} style={{ background: "#245cdb", color: "white", padding: "13px 20px", border: 0, borderRadius: 10, font: "inherit", fontWeight: 650, cursor: "pointer" }}>Odśwież widok</button>
      </section>
    </main>;
  }
}
