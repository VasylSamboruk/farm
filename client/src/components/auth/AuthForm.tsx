import React, { useState } from 'react';
import axios from 'axios';
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
    <div style={styles.pageOverlay}>
      <div style={styles.card}>
        <div style={styles.iconContainer}>
          <span style={styles.icon}>{isLogin ? '🎮' : '🚀'}</span>
        </div>

        <h1 style={styles.title}>
          {isLogin ? 'АВТОРИЗАЦІЯ' : 'РЕЄСТРАЦІЯ'}
        </h1>
        <p style={styles.subtitle}>
          {isLogin ? 'Увійдіть до ігрового світу' : 'Створіть свій новий акаунт'}
        </p>

        {message && <div style={styles.successBanner}>{message}</div>}
        {error && <div style={styles.errorBanner}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Логін</label>
            <input
              type="text"
              placeholder="Введіть логін..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Пароль</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Завантаження...' : isLogin ? 'УВІЙТИ У ГРУ' : 'СТВОРИТИ АКАУНТ'}
          </button>
        </form>

        <div style={styles.footer}>
          <span
            style={styles.toggleLink}
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setMessage('');
            }}
          >
            {isLogin ? 'Ще немає акаунту? Створити' : 'Вже є акаунт? Увійти'}
          </span>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    margin: 0,
    padding: 0,
    overflow: 'hidden',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'radial-gradient(circle at center, #1f1c2c 0%, #000000 100%)',
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    userSelect: 'none',
  },
  card: {
    width: '90%',
    maxWidth: '380px',
    padding: '40px 30px',
    backgroundColor: 'rgba(25, 25, 35, 0.85)',
    backdropFilter: 'blur(16px)',
    borderRadius: '20px',
    boxShadow: '0 0 30px rgba(123, 31, 162, 0.25), 0 15px 35px rgba(0, 0, 0, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    textAlign: 'center',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    margin: '0 auto 15px auto',
    background: 'linear-gradient(135deg, #7b1fa2 0%, #e91e63 100%)',
    borderRadius: '16px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0 8px 20px rgba(123, 31, 162, 0.4)',
  },
  icon: {
    fontSize: '30px',
  },
  title: {
    margin: '0 0 6px 0',
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '800',
    letterSpacing: '1px',
  },
  subtitle: {
    margin: '0 0 25px 0',
    color: '#9e9e9e',
    fontSize: '13px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  inputGroup: {
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: '700',
    color: '#b388ff',
    marginBottom: '8px',
    textTransform: 'uppercase',
    letterSpacing: '1px',
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    backgroundColor: '#121218',
    color: '#ffffff',
    transition: 'all 0.2s ease',
  },
  button: {
    marginTop: '10px',
    width: '100%',
    padding: '15px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #8e24aa 0%, #d81b60 100%)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: '800',
    letterSpacing: '1px',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(216, 27, 96, 0.35)',
    transition: 'transform 0.1s ease, box-shadow 0.2s ease',
  },
  errorBanner: {
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
    color: '#ff5252',
    padding: '12px',
    borderRadius: '10px',
    fontSize: '13px',
    marginBottom: '15px',
    border: '1px solid rgba(255, 82, 82, 0.3)',
  },
  successBanner: {
    backgroundColor: 'rgba(56, 142, 60, 0.15)',
    color: '#69f0ae',
    padding: '12px',
    borderRadius: '10px',
    fontSize: '13px',
    marginBottom: '15px',
    border: '1px solid rgba(105, 240, 174, 0.3)',
  },
  footer: {
    marginTop: '25px',
  },
  toggleLink: {
    color: '#b388ff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'color 0.2s',
  },
};