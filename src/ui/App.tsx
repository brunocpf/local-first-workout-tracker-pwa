const TABS = ["Home", "Routines", "History", "Exercises", "Progress"] as const;

export function App() {
  return (
    <div className="app">
      <main>
        <h1>Workout Tracker</h1>
        <p>Scaffold ready. See docs/PRD.md and docs/roadmap.md.</p>
      </main>
      <nav aria-label="Primary">
        {TABS.map((t) => (
          <button key={t}>{t}</button>
        ))}
      </nav>
    </div>
  );
}
