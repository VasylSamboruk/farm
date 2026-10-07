import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Gift, X } from 'lucide-react';
import type { SocialGiftProduct, SocialPlayer } from '../../api/social.api';

const categories = [
  { type: 'ALL', label: 'Усі' },
  { type: 'TREE', label: 'Дерева' },
  { type: 'CROP', label: 'Рослини' },
  { type: 'ANIMAL', label: 'Тварини' },
  { type: 'BUILDING', label: 'Декор' },
];

const formatRemaining = (until: string | undefined, now: number) => {
  if (!until) return '';
  const remaining = new Date(until).getTime() - now;
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return `${hours} год ${String(minutes).padStart(2, '0')} хв ${String(seconds).padStart(2, '0')} с`;
};

interface GiftShopModalProps {
  friend: SocialPlayer;
  items: SocialGiftProduct[];
  cooldownUntil?: string;
  sendingItemId: string | null;
  onClose: () => void;
  onSend: (item: SocialGiftProduct) => void;
}

export const GiftShopModal: React.FC<GiftShopModalProps> = ({
  friend, items, cooldownUntil, sendingItemId, onClose, onSend,
}) => {
  const [category, setCategory] = useState('ALL');
  const [now, setNow] = useState<number | null>(null);
  const [pendingItem, setPendingItem] = useState<SocialGiftProduct | null>(null);
  const remaining = cooldownUntil && now === null ? 'оновлюємо…' : formatRemaining(cooldownUntil, now ?? 0);
  const visibleItems = useMemo(
    () => items.filter((item) => category === 'ALL' || item.type === category),
    [category, items]
  );
  const portalRoot = document.querySelector('.app-shell') ?? document.body;
  const confirmationPortalRoot = document.body;

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  return (
    <>
      {createPortal(
        <div className="gift-shop-overlay" onClick={onClose}>
          <section className="game-modal-window gift-shop-window" role="dialog" aria-modal="true" aria-labelledby="gift-shop-title" onClick={(event) => event.stopPropagation()}>
            <header className="gift-shop-header">
              <div><Gift size={21} /><div><h2 id="gift-shop-title">Подарунок для {friend.username}</h2><span>Обери особливий подарунок для друга</span></div></div>
              <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити магазин подарунків"><X size={18} /></button>
            </header>
            {remaining && <div className="gift-shop-cooldown">Наступний подарунок цьому другові можна надіслати через <strong>{remaining}</strong></div>}
            <nav className="gift-shop-categories" aria-label="Категорії подарунків">
              {categories.map((entry) => (
                <button type="button" key={entry.type} className={category === entry.type ? 'is-active' : ''} onClick={() => setCategory(entry.type)}>{entry.label}</button>
              ))}
            </nav>
            {visibleItems.length === 0 ? (
              <div className="gift-shop-empty"><Gift size={28} /><strong>У цій категорії подарунків поки немає</strong></div>
            ) : (
              <div className="gift-shop-grid">
                {visibleItems.map((item) => (
                  <article className="gift-shop-card" key={item.itemId}>
                    <div className="gift-shop-image">{item.image ? <img src={item.image} alt="" draggable={false} /> : <span>{item.icon || '🎁'}</span>}</div>
                    <strong>{item.name}</strong>
                    <span className="gift-shop-type">{item.type === 'BUILDING' ? 'Декор' : item.type === 'TREE' ? 'Дерево' : item.type === 'CROP' ? 'Рослина' : item.type === 'ANIMAL' ? 'Тварина' : 'Подарунок'}</span>
                    <button
                      type="button"
                      aria-label={`Подарувати ${item.name} за ${item.price.toLocaleString('uk-UA')} ${item.priceCurrency === 'rubies' ? 'рубінів' : 'монет'}`}
                      onClick={() => setPendingItem(item)}
                      disabled={Boolean(remaining) || sendingItemId !== null}
                    >
                      <Gift size={17} />
                      <strong>{sendingItemId === item.itemId ? '…' : item.price.toLocaleString('uk-UA')}</strong>
                      <img src={item.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt={item.priceCurrency === 'rubies' ? 'рубінів' : 'монет'} draggable={false} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>,
        portalRoot
      )}
      {pendingItem && createPortal(
        <div className="gift-confirm-backdrop" onClick={() => sendingItemId === null && setPendingItem(null)}>
          <section className="gift-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="gift-confirm-title" onClick={(event) => event.stopPropagation()}>
            <button className="gift-confirm-close" type="button" onClick={() => setPendingItem(null)} disabled={sendingItemId !== null} aria-label="Скасувати"><X size={17} /></button>
            <div className="gift-confirm-mark"><Gift size={25} /></div>
            <p className="gift-confirm-eyebrow">ПОДАРУНОК ДЛЯ ДРУГА</p>
            <h3 id="gift-confirm-title">Надіслати цей подарунок?</h3>
            <div className="gift-confirm-recipient">
              <span className="gift-confirm-avatar">{friend.avatar ? <img src={friend.avatar} alt="" /> : friend.username.slice(0, 1).toUpperCase()}</span>
              <span><strong>{friend.username}</strong><small>Рівень {friend.level}</small></span>
            </div>
            <div className="gift-confirm-item">
              <span>{pendingItem.image ? <img src={pendingItem.image} alt="" /> : pendingItem.icon || '🎁'}</span>
              <strong>{pendingItem.name}</strong>
            </div>
            <p className="gift-confirm-cost">Буде списано <strong>{pendingItem.price.toLocaleString('uk-UA')}<img src={pendingItem.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt={pendingItem.priceCurrency === 'rubies' ? 'рубінів' : 'монет'} draggable={false} /></strong></p>
            <div className="gift-confirm-actions">
              <button type="button" onClick={() => setPendingItem(null)} disabled={sendingItemId !== null}>Ще подумаю</button>
              <button type="button" className="gift-confirm-send" onClick={() => onSend(pendingItem)} disabled={sendingItemId !== null}>
                <Check size={16} />{sendingItemId === pendingItem.itemId ? 'Надсилаємо…' : 'Так, подарувати'}
              </button>
            </div>
          </section>
        </div>,
        confirmationPortalRoot
      )}
    </>
  );
};
