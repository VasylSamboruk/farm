import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useFarmStore } from './store/useFarmStore';
import { useGameConfigStore } from './store/useGameConfigStore';
import { AuthForm } from './components/auth/AuthForm';
import { PlayerProfile } from './components/auth/PlayerProfile';
import { AdminUsers } from './components/admin/AdminUsers';
import { AdminShop } from './components/admin/AdminShop';
import { AdminCreateItem } from './components/admin/AdminCreateItem.tsx';
import { AdminMedia } from './components/admin/AdminMedia';
import { AdminShell } from './components/admin/AdminShell';
import { GameHUD } from './components/game/GameHUD';
import { FarmCanvas } from './components/game/FarmCanvas';
import { loadGameImage, preloadGameImages } from './game/sprites';

type StartupStage = 'session' | 'farm' | 'assets' | 'ready';

const startupLabels: Record<StartupStage, string> = {
  session: 'Перевіряємо сесію',
  farm: 'Завантажуємо ферму',
  assets: 'Готуємо ігровий світ',
  ready: 'Ферма готова',
};

export const App: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const loadFarm = useFarmStore((state) => state.loadFarm);
  const loadGameItems = useGameConfigStore((state) => state.loadItems);
  const userId = user?.id;
  const sessionKey = userId ? `${userId}:${localStorage.getItem('token') ?? ''}` : null;
  const [stage, setStage] = useState<StartupStage>('session');
  const [startupError, setStartupError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [playSessionKey, setPlaySessionKey] = useState<string | null>(null);
  const isAdminRoute = location.pathname.startsWith('/admin');
  const adminSection = location.pathname === '/admin/shop'
    ? 'shop'
    : location.pathname === '/admin/items/new' ? 'create'
      : location.pathname === '/admin/media' ? 'media' : 'users';
  const playRequested = Boolean(sessionKey && sessionKey === playSessionKey);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('farmcanvas:theme') === 'light' ? 'light' : 'dark'
  );

  const toggleTheme = () => setTheme((current) => current === 'dark' ? 'light' : 'dark');
  const returnToProfile = () => {
    setStage('session');
    setStartupError(null);
    setPlaySessionKey(null);
  };
  const startPlaying = () => {
    setStage('session');
    setStartupError(null);
    setPlaySessionKey(sessionKey);
  };

  useEffect(() => {
    localStorage.setItem('farmcanvas:theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isAdminRoute && location.pathname === '/admin') navigate('/admin/users', { replace: true });
  }, [isAdminRoute, location.pathname, navigate]);

  useEffect(() => {
    if (user && user.role !== 'admin' && isAdminRoute) navigate('/', { replace: true });
  }, [user, isAdminRoute, navigate]);

  useEffect(() => {
    if (!playRequested) return;
    const intervalId = window.setInterval(() => { void loadGameItems(true); }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [loadGameItems, playRequested]);

  useEffect(() => {
    let cancelled = false;

    const startGame = async () => {
      setStartupError(null);
      setStage('session');

      if (!userId || !playRequested) return;
      const token = localStorage.getItem('token');
      if (!token) {
        setUser(null);
        return;
      }

      try {
        setStage('farm');
        await loadGameItems(true);
        const configState = useGameConfigStore.getState();
        if (configState.error) throw new Error(configState.error);
        await loadFarm(userId);

        if (cancelled) return;
        setStage('assets');
        await Promise.all([
          loadGameImage('/assets/fonik1.png'),
          loadGameImage('/assets/tiles/grass_tile.png'),
          loadGameImage('/assets/tiles/dirt_tile.png'),
          preloadGameImages(Object.values(configState.items)),
        ]);

        if (!cancelled) setStage('ready');
      } catch (error) {
        if (!cancelled) {
          setStartupError(error instanceof Error ? error.message : 'Не вдалося підготувати гру');
        }
      }
    };

    void startGame();
    return () => {
      cancelled = true;
    };
  }, [userId, loadFarm, loadGameItems, setUser, retryKey, playRequested]);

  if (!user || !localStorage.getItem('token')) {
    return <div className="app-shell" data-theme={theme}><AuthForm /></div>;
  }

  if (isAdminRoute && user.role === 'admin') {
    return (
      <div className="app-shell">
        <AdminShell
          section={adminSection}
          username={user.username}
          onSectionChange={(section) => navigate(section === 'create' ? '/admin/items/new' : `/admin/${section}`)}
          onBack={() => { returnToProfile(); navigate('/'); }}
        >
          {adminSection === 'shop'
            ? <AdminShop onAddItem={() => navigate('/admin/items/new')} />
            : adminSection === 'create'
              ? <AdminCreateItem onCancel={() => navigate('/admin/shop')} onCreated={() => navigate('/admin/shop')} />
              : adminSection === 'media'
                ? <AdminMedia />
                : <AdminUsers />}
        </AdminShell>
      </div>
    );
  }

  if (!playRequested) {
    return (
      <div className="app-shell" data-theme={theme}>
        <PlayerProfile key={user.id} user={user} theme={theme} onToggleTheme={toggleTheme} onPlay={startPlaying} onOpenAdmin={() => navigate('/admin/users')} />
      </div>
    );
  }

  if (stage !== 'ready') {
    const progress = stage === 'session' ? 12 : stage === 'farm' ? 42 : 78;
    return (
      <div className="app-shell" data-theme={theme}>
      <main className="startup-screen" aria-live="polite">
        <section className="startup-panel">
          <div className="startup-mark" aria-hidden="true">✦</div>
          <p className="startup-eyebrow">FARM CANVAS</p>
          <h1>{startupError ? 'Не вдалося запустити гру' : 'Готуємо твою ферму'}</h1>
          {startupError ? (
            <>
              <p className="startup-status startup-error">{startupError}</p>
              <button className="startup-retry" onClick={() => setRetryKey((key) => key + 1)}>
                Спробувати ще раз
              </button>
            </>
          ) : (
            <>
              <p className="startup-status">{startupLabels[stage]}</p>
              <div className="startup-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <p className="startup-caption">Перевіряємо дані та ресурси гри</p>
            </>
          )}
        </section>
      </main>
      </div>
    );
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <main className="game-screen">
        <GameHUD theme={theme} onToggleTheme={toggleTheme} onReturnToProfile={returnToProfile} />
        <FarmCanvas />
      </main>
    </div>
  );
};