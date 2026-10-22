export const en = {
  "app.title": "Workout Tracker",
  "app.scaffold": "Scaffold ready. See docs/PRD.md and docs/roadmap.md.",
  "nav.primary": "Primary",
  "nav.home": "Home",
  "nav.routines": "Routines",
  "nav.history": "History",
  "nav.exercises": "Exercises",
  "nav.progress": "Progress",
  "common.notImplemented": "Not implemented yet.",
  "update.available": "Update available",
  "update.reload": "Reload",
} as const;

export type MessageKey = keyof typeof en;

export const ptBR: Record<MessageKey, string> = {
  "app.title": "Treino",
  "app.scaffold": "Estrutura pronta. Veja docs/PRD.md e docs/roadmap.md.",
  "nav.primary": "Principal",
  "nav.home": "Início",
  "nav.routines": "Rotinas",
  "nav.history": "Histórico",
  "nav.exercises": "Exercícios",
  "nav.progress": "Progresso",
  "common.notImplemented": "Ainda não implementado.",
  "update.available": "Atualização disponível",
  "update.reload": "Recarregar",
};
