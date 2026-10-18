import axios from 'axios';
import { useImpersonationStore } from '../store/impersonationStore';
import { useBanStore } from '../store/banStore';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: API_BASE_URL,
});

// Автоматично додаємо токен у заголовки для всіх майбутніх запитів
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const impersonatedId = useImpersonationStore.getState().targetId;
  if (impersonatedId) {
    config.headers['X-Impersonate-User'] = impersonatedId;
  }
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error?.response?.data;
    if (error?.response?.status === 403 && data?.banned && !useImpersonationStore.getState().targetId) {
      useBanStore.getState().show({ banUntil: data.banUntil ?? null, reason: data.banReason ?? '' });
    }
    return Promise.reject(error);
  },
);
