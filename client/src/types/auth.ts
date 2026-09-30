export interface User {
  id: string;
  username: string;
  role: 'user' | 'admin';
  coins: number;
  xp: number;
  level: number;
  inventory: Record<string, number>;
  avatar?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}