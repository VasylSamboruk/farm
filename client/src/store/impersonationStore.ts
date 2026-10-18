import { create } from 'zustand';
import type { User } from '../types/auth';

interface ImpersonationState {
  adminUser: User | null;
  targetId: string | null;
  targetName: string;
  begin: (adminUser: User, targetId: string, targetName: string) => void;
  end: () => void;
}

export const useImpersonationStore = create<ImpersonationState>((set) => ({
  adminUser: null,
  targetId: null,
  targetName: '',
  begin: (adminUser, targetId, targetName) => set({ adminUser, targetId, targetName }),
  end: () => set({ adminUser: null, targetId: null, targetName: '' }),
}));
