import { api } from './axios';
import type { AuthResponse, User } from '../types/auth';

export const authApi = {
  login: async (data: { username: string; password: string }): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data;
  },
  getCurrentUser: async (): Promise<User> => {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },
  register: async (data: { username: string; password: string }): Promise<{ message: string }> => {
    const response = await api.post('/auth/register', data);
    return response.data;
  },
};