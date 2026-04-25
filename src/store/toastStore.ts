import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error';

export type ToastItem = {
  id: string;
  title?: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
};

type ToastState = {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'> & { id?: string }) => void;
  dismiss: (id: string) => void;
};

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? makeId();
    const durationMs = t.durationMs ?? 3000;

    const item: ToastItem = {
      id,
      title: t.title,
      message: t.message,
      variant: t.variant,
      durationMs,
    };

    set((s) => {
      // Cap max toasts at 5 to prevent unbounded growth under load
      const updated = [...s.toasts, item];
      return { toasts: updated.length > 5 ? updated.slice(-5) : updated };
    });

    if (durationMs > 0) {
      window.setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
      }, durationMs);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Convenience methods for showing toasts */
export const toast = {
  info: (message: string, title?: string, durationMs = 3000) =>
    useToastStore.getState().push({ variant: 'info', title, message, durationMs }),
  success: (message: string, title?: string, durationMs = 2500) =>
    useToastStore.getState().push({ variant: 'success', title, message, durationMs }),
  error: (message: string, title?: string, durationMs = 3500) =>
    useToastStore.getState().push({ variant: 'error', title, message, durationMs }),
};
