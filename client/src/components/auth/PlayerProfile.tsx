import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Copy, LogOut, Package, Play, ShieldCheck, Sparkles, Sprout, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getLevelProgress } from '../../config/progression';
import { getLevelIcon } from '../../config/levelIcons';
import type { User } from '../../types/auth';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { socialApi } from '../../api/social.api';
import { FriendsPanel } from './FriendsPanel';

interface PlayerProfileProps {
  user: User;
  onPlay: () => void;
  onOpenAdmin: () => void;
}

export const PlayerProfile: React.FC<PlayerProfileProps> = ({ user, onPlay, onOpenAdmin }) => {
  const logout = useAuthStore((state) => state.logout);
  const updateUser = useAuthStore((state) => state.updateUser);
  const backgroundStyle = useFarmStore((state) => state.backgroundStyle);
  const backgroundIsNight = useFarmStore((state) => state.backgroundIsNight);
  const loadFarm = useFarmStore((state) => state.loadFarm);
  const gameItems = useGameConfigStore((state) => state.items);
  const levelIcons = useGameConfigStore((state) => state.levelIcons);
  const loadGameItems = useGameConfigStore((state) => state.loadItems);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  useEffect(() => {
    void Promise.all([loadFarm(user.id), loadGameItems()]).catch((error: unknown) => {
      console.error('Не вдалося завантажити оформлення ферми для профілю:', error);
    });
  }, [loadFarm, loadGameItems, user.id]);

  const progression = getLevelProgress(user.xp ?? 0);
  const progressPercent = (progression.xpInLevel / progression.xpToNextLevel) * 100;
  const inventoryCount = Object.values(user.inventory ?? {}).reduce((total, amount) => total + amount, 0) +
    Object.values(user.itemInventory ?? {}).reduce((total, amount) => total + amount, 0);
  const defaultAvatars = Array.from({ length: 6 }, (_, index) => `/assets/ui/avatar/ava${index + 1}.png`);
  const activeBackground = gameItems[backgroundStyle];
  const profileBackground = backgroundIsNight
    ? activeBackground?.backgroundNightImage ?? '/assets/fonik1n.png'
    : activeBackground?.backgroundImage ?? '/assets/fonik1.png';

  const saveAvatar = async (avatar: string) => {
    try {
      setAvatarSaving(true);
      setAvatarError('');
      const savedAvatar = await socialApi.updateAvatar(avatar);
      updateUser({ avatar: savedAvatar.avatar });
      setShowAvatarPicker(false);
    } catch {
      setAvatarError('Не вдалося зберегти аватар на сервері. Спробуй ще раз.');
    } finally {
      setAvatarSaving(false);
    }
  };

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
      await saveAvatar(compressedAvatar);
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
    <main className="profile-screen scenic-screen farmer-lobby" data-background-night={backgroundIsNight}>
      <img className="farmer-world-background" src={profileBackground} alt="" aria-hidden="true" />
      <div className="farmer-main">
        <header className="farmer-topbar">
          <div className="farmer-wallet">
            <div className="wallet-chip coin-chip"><img src="/assets/ui/coin.png" alt="" draggable={false} /><strong>{(user.coins ?? 0).toLocaleString('uk-UA')}</strong></div>
            <div className="wallet-chip gem-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} /><strong>25</strong></div>
          </div>
          <div className="farmer-header-actions">
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
                <button className="avatar-edit" type="button" onClick={() => { setAvatarError(''); setShowAvatarPicker(true); }} disabled={avatarSaving} aria-label="Змінити аватар" title="Змінити аватар">
                  {avatarSaving ? <span className="avatar-spinner" /> : <Camera size={16} />}
                </button>
              </div>

              <div className="farmer-identity">
                <span className="player-label">ГОСПОДАР ФЕРМИ</span>
                <h2>{user.username}</h2>
                <button className="player-id copy-id" type="button" onClick={() => void copyPlayerId()} title="Скопіювати ID гравця">
                  {idCopied ? <Check size={13} /> : <Copy size={13} />}
                  <span>ID: {user.id}</span>
                </button>
              </div>

              <div className="farmer-level-card">
                <div className="level-medallion">
                  <img src={getLevelIcon(progression.level, levelIcons)} alt="" />
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

          <button className="farmer-play-button" type="button" onClick={onPlay} aria-label="Грати">
            <span className="play-circle"><Play size={19} fill="currentColor" /></span>
            <span className="play-copy"><strong>Грати</strong></span>
          </button>

          <FriendsPanel />
        </div>
      </div>
      {showAvatarPicker && createPortal(
        <div className="avatar-picker-overlay" onClick={() => !avatarSaving && setShowAvatarPicker(false)}>
          <section className="avatar-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title" onClick={(event) => event.stopPropagation()}>
            <button className="avatar-picker-close" type="button" onClick={() => setShowAvatarPicker(false)} disabled={avatarSaving} aria-label="Закрити"><X size={18} /></button>
            <div className="avatar-picker-heading"><Camera size={20} /><div><h2 id="avatar-picker-title">Обери аватар</h2><p>Вибери готовий або завантаж власне фото</p></div></div>
            <div className="avatar-picker-grid">
              {defaultAvatars.map((avatar, index) => (
                <button key={avatar} type="button" className={user.avatar === avatar ? 'is-selected' : ''} onClick={() => void saveAvatar(avatar)} disabled={avatarSaving} aria-label={`Вибрати стандартний аватар ${index + 1}`}>
                  <img src={avatar} alt={`Стандартний аватар ${index + 1}`} />
                  {user.avatar === avatar && <Check size={16} />}
                </button>
              ))}
            </div>
            <button className="avatar-picker-upload" type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarSaving}>
              {avatarSaving ? <span className="avatar-spinner" /> : <Camera size={17} />}
              {avatarSaving ? 'Зберігаємо…' : 'Завантажити своє фото'}
            </button>
            {avatarError && <p className="avatar-picker-error" role="alert">{avatarError}</p>}
            <input ref={avatarInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleAvatarSelection} />
          </section>
        </div>,
        document.body
      )}
    </main>
  );
};
