import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, kind }] }));
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 3500);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

export const notify = (message: string, kind?: Toast['kind']) =>
  useToastStore.getState().push(message, kind);
