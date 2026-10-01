import React, { useState } from 'react';
import axios from 'axios';
import { KeyRound, LogIn, Sprout, UserRound, UserRoundPlus } from 'lucide-react';
import { authApi } from '../../api/auth.api';
import { useAuthStore } from '../../store/authStore';

export const AuthForm: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      if (isLogin) {
        const data = await authApi.login({ username, password });
        setAuth(data.user, data.token);
      } else {
        const data = await authApi.register({ username, password });
        setMessage(data.message || 'Реєстрація успішна! Увійдіть у систему.');
        setIsLogin(true);
      }
    } catch (err: unknown) {
      const serverMessage = axios.isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message
        : undefined;
      setError(serverMessage || 'Помилка доступу. Перевірте дані.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen scenic-screen auth-form-screen">
      <section className="auth-form-panel" aria-labelledby="auth-form-title">
        <div className="auth-form-mark" aria-hidden="true"><Sprout size={25} /></div>
        <p className="auth-form-kicker">FARM CANVAS</p>
        <h1 className="auth-form-title" id="auth-form-title">{isLogin ? 'Вхід у гру' : 'Створення акаунта'}</h1>
        <p className="auth-form-subtitle">{isLogin ? 'Повернись до своєї ферми' : 'Створи власну ферму та запроси друзів'}</p>

        {message && <div className="auth-form-notice is-success" role="status">{message}</div>}
        {error && <div className="auth-form-notice is-error" role="alert">{error}</div>}

        <form className="auth-form-fields" onSubmit={handleSubmit}>
          <label className="auth-form-field" htmlFor="auth-username">
            <span>Логін</span>
            <span className="auth-form-input"><UserRound size={17} aria-hidden="true" /><input id="auth-username" type="text" autoComplete="username" placeholder="Введіть логін" value={username} onChange={(event) => setUsername(event.target.value)} required /></span>
          </label>
          <label className="auth-form-field" htmlFor="auth-password">
            <span>Пароль</span>
            <span className="auth-form-input"><KeyRound size={17} aria-hidden="true" /><input id="auth-password" type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} placeholder="Введіть пароль" value={password} onChange={(event) => setPassword(event.target.value)} required /></span>
          </label>
          <button className="auth-form-submit" type="submit" disabled={loading}>
            {loading ? 'Завантаження…' : isLogin ? <><LogIn size={18} /> Увійти у гру</> : <><UserRoundPlus size={18} /> Створити акаунт</>}
          </button>
        </form>

        <button className="auth-form-switch" type="button" onClick={() => { setIsLogin(!isLogin); setError(''); setMessage(''); }}>
          {isLogin ? 'Ще немає акаунту? Створити' : 'Вже є акаунт? Увійти'}
        </button>
      </section>
    </main>
  );
};