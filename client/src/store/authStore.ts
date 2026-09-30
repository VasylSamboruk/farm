import { create } from 'zustand';
import type { User as AuthUser } from '../types/auth';

export type User = AuthUser;

interface AuthState {
  user: User | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setUser: (user: User | null) => void;
  updateUser: (data: Partial<User>) => void; // Нова функція для безпечного оновлення балансу/XP
}

export const useAuthStore = create<AuthState>((set) => ({
  // При завантаженні гри дістаємо юзера зі сховища браузера
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setAuth: (user, token) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('token', token);
    set({ user });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    set({ user: null });
  },
  
  setUser: (user) => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }
    set({ user });
  },

  updateUser: (data) => set((state) => {
    if (!state.user) return state;
    const updated = { ...state.user, ...data };
    localStorage.setItem('user', JSON.stringify(updated)); // Зберігаємо нові монети в пам'ять
    return { user: updated };
  })
}));