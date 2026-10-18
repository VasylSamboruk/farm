import { create } from 'zustand';

interface BanState {
  ban: { banUntil: string | null; reason: string } | null;
  show: (ban: { banUntil: string | null; reason: string }) => void;
  dismiss: () => void;
}

export const useBanStore = create<BanState>((set) => ({
  ban: null,
  show: (ban) => set({ ban }),
  dismiss: () => set({ ban: null }),
}));
