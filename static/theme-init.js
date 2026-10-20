// Applies the stored theme before first paint (docs/design.md §4). Classic script; keep in sync with src/lib/settings.svelte.ts.
try {
  var t = localStorage.getItem("workout-tracker:theme");
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
} catch {
  // storage unavailable: follow the OS
}
