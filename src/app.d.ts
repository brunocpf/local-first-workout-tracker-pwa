declare global {
  namespace App {}
  interface ImportMetaEnv {
    /** Optional push relay (ADR 0014); unset hides the notifications feature. */
    readonly VITE_PUSH_RELAY_URL?: string;
    readonly VITE_PUSH_VAPID_PUBLIC_KEY?: string;
  }
}
export {};
