import React, { useRef, useState } from 'react';
import { ArrowRight, Camera, Check, Copy, LogOut, Package, Settings, ShieldCheck, Sparkles, Sprout } from 'lucide-react';
import { getLevelProgress } from '../../config/progression';
import type { User } from '../../types/auth';
import { useAuthStore } from '../../store/authStore';
import { socialApi } from '../../api/social.api';
import { FriendsPanel } from './FriendsPanel';

interface PlayerProfileProps {
  user: User;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onPlay: () => void;
  onOpenAdmin: () => void;
}

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ user, theme, onToggleTheme, onPlay, onOpenAdmin }) => {
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [idCopied, setIdCopied] = useState(false);
  const progression = getLevelProgress(user.xp ?? 0);
  const progressPercent = (progression.xpInLevel / progression.xpToNextLevel) * 100;
  const inventoryCount = Object.values(user.inventory ?? {}).reduce((total, amount) => total + amount, 0);

  const handleAvatarSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarError('');

    if (!file.type.startsWith('image/')) {
      setAvatarError('Обери файл зображення.');
      event.target.value = '';
      return;
    }

    try {
      setAvatarSaving(true);
      const image = await createImageBitmap(file);
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не вдалося обробити зображення.');

      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      image.close();

      const compressedAvatar = canvas.toDataURL('image/jpeg', 0.82);
      const savedAvatar = await socialApi.updateAvatar(compressedAvatar);
      updateUser({ avatar: savedAvatar.avatar });
    } catch {
      setAvatarError('Не вдалося зберегти аватар на сервері. Спробуй ще раз.');
    } finally {
      setAvatarSaving(false);
      event.target.value = '';
    }
  };

  const copyPlayerId = async () => {
    try {
      await navigator.clipboard.writeText(user.id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1600);
    } catch {
      setAvatarError('Не вдалося скопіювати ID.');
    }
  };

  return (
    <main className="profile-screen scenic-screen farmer-lobby">
      <div className="farmer-main">
        <header className="farmer-topbar">
          <a className="wood-logo" href="#profile" aria-label="Farm Canvas">
            <Sprout size={20} />
            <span>FARM<span>CANVAS</span></span>
            <Sprout size={20} />
          </a>
          <div className="farmer-wallet">
            <div className="wallet-chip coin-chip"><img src="/assets/ui/coin.png" alt="" draggable={false} /><strong>{(user.coins ?? 0).toLocaleString('uk-UA')}</strong></div>
            <div className="wallet-chip gem-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} /><strong>25</strong></div>
            <button className="top-icon-button" type="button" onClick={onToggleTheme} aria-label={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`} title={`Увімкнути ${theme === 'dark' ? 'світлу' : 'темну'} тему`}><Settings size={18} /></button>
            {user.role === 'admin' && <button className="top-icon-button admin-entry-button" type="button" onClick={onOpenAdmin} aria-label="Відкрити адмін-панель" title="Адмін-панель"><ShieldCheck size={18} /></button>}
            <button className="top-icon-button" type="button" onClick={logout} aria-label="Вийти з акаунта" title="Вийти"><LogOut size={18} /></button>
          </div>
        </header>

        <div className="profile-content">
          <section className="farmer-profile-card" id="farmer-profile-card" aria-labelledby="farmer-profile-title">
            <header className="farmer-card-heading">
              <Sprout size={22} />
              <h1 id="farmer-profile-title">Профіль фермера</h1>
            </header>

            <div className="farmer-card-main">
              <div className="farmer-avatar-wrap">
                <div className="farmer-avatar-frame">
                  <div className="farmer-avatar">
                    {user.avatar ? <img src={user.avatar} alt={`Аватар гравця ${user.username}`} /> : <span>{user.username.slice(0, 1).toUpperCase()}</span>}
                  </div>
                </div>
                <button className="avatar-edit" type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarSaving} aria-label={avatarSaving ? 'Зберігаємо аватар' : 'Змінити аватар'} title={avatarSaving ? 'Зберігаємо аватар' : 'Змінити аватар'}>
                  {avatarSaving ? <span className="avatar-spinner" /> : <Camera size={16} />}
                </button>
                <input ref={avatarInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleAvatarSelection} />
              </div>

              <div className="farmer-identity">
                <span className="player-label">ГОСПОДАР ФЕРМИ</span>
                <h2>{user.username}</h2>
                <button className="player-id copy-id" type="button" onClick={() => void copyPlayerId()} title="Скопіювати ID гравця">
                  {idCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>ID: {user.id}</span>
                </button>
                {avatarError && <p className="avatar-error" role="alert">{avatarError}</p>}
              </div>

              <div className="farmer-level-card">
                <div className="level-medallion">
                  <img src="/assets/ui/lvl_ico.png" alt="" />
                  <strong>{progression.level}</strong>
                </div>
                <div className="level-progress-content">
                  <div className="level-progress-heading"><span>Рівень ферми</span><strong>{progression.xpInLevel} / {progression.xpToNextLevel} XP</strong></div>
                  <div className="farmer-xp-track" role="progressbar" aria-label="Прогрес рівня ферми" aria-valuenow={Math.round(progressPercent)} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="farmer-stat-grid">
              <div className="farmer-stat-tile"><span className="farmer-stat-icon stat-coin"><img src="/assets/ui/coin.png" alt="" draggable={false} /></span><div><span>Монети</span><strong>{(user.coins ?? 0).toLocaleString('uk-UA')}</strong></div></div>
              <div className="farmer-stat-tile"><span className="farmer-stat-icon stat-inventory"><Package size={27} /></span><div><span>В інвентарі</span><strong>{inventoryCount.toLocaleString('uk-UA')} <small>предм.</small></strong></div></div>
              <div className="farmer-stat-tile"><span className="farmer-stat-icon stat-xp"><Sparkles size={27} /></span><div><span>Усього досвіду</span><strong>{(user.xp ?? 0).toLocaleString('uk-UA')} <small>XP</small></strong></div></div>
            </div>
          </section>

          <button className="farmer-play-button" type="button" onClick={onPlay}>
            <span className="play-circle"><ArrowRight size={22} /></span>
            <span className="play-copy"><strong>Продовжити гру</strong><small>Повернутися на свою ферму</small></span>
            <ArrowRight className="play-trailing" size={21} />
          </button>

          <FriendsPanel />
        </div>
      </div>
    </main>
  );
};
