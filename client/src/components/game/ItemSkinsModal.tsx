import React, { useState } from 'react';
import { Check, Clock3, LockKeyhole, Sparkles } from 'lucide-react';
import type { GameItemConfig } from '../../types/game';
import type { TileData } from '../../store/useFarmStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useAuthStore } from '../../store/authStore';
import { formatGameDuration } from '../../game/trees';
import { PurchaseConfirmDialog } from './PurchaseConfirmDialog';
import './ItemSkinsModal.css';

interface ItemSkinsModalProps {
  item: GameItemConfig;
  tile: TileData;
  target: { row: number; col: number; quadrant: number };
  onClose: () => void;
}

export const ItemSkinsModal: React.FC<ItemSkinsModalProps> = ({ item, tile, target, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const purchaseSkin = useFarmStore((state) => state.purchaseSkin);
  const applySkin = useFarmStore((state) => state.applySkin);
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const [busySkinId, setBusySkinId] = useState<string | null>(null);
  const [pendingSkinId, setPendingSkinId] = useState<string | null>(null);
  const skins = item.skins ?? [];
  const baseImage = item.growthImages?.[0] ?? item.shopImage;

  const handlePurchase = async (skinId: string, confirmed = false) => {
    if (!user || busySkinId) return;
    const skin = skins.find((entry) => entry.id === skinId);
    if (!skin) return;
    if (!confirmed && (skin.priceCurrency === 'rubies' || skin.price > 5000)) {
      setPendingSkinId(skinId);
      return;
    }
    setPendingSkinId(null);
    setBusySkinId(skinId);
    try {
      if (await purchaseSkin(user.id, target, item.id, skinId)) {
        if (await applySkin(user.id, target, item.id, skinId)) {
          notifyGameMessage('Скін придбано та одразу застосовано!');
        }
      }
    } finally {
      setBusySkinId(null);
    }
  };

  const handleApply = async (skinId: string | null) => {
    if (!user || busySkinId) return;
    setBusySkinId(skinId ?? 'default');
    try {
      if (await applySkin(user.id, target, item.id, skinId)) {
        notifyGameMessage(skinId ? 'Скін застосовано!' : 'Початковий вигляд відновлено.');
      }
    } finally {
      setBusySkinId(null);
    }
  };

  return (
    <div className="housing-modal-backdrop item-skins-backdrop" role="presentation" onClick={onClose}>
      <section className="housing-modal factory-modal game-modal-window item-skins-dialog" role="dialog" aria-modal="true" aria-labelledby="item-skins-title" onClick={(event) => event.stopPropagation()}>
        <header className="housing-modal-header shared-modal-header game-modal-header item-skins-heading">
          <div className="item-skins-heading-copy">
            <span className="housing-modal-icon item-skins-item-icon">
              {baseImage ? <img src={baseImage} alt="" draggable={false} /> : item.shopIcon ?? '✨'}
            </span>
            <div className="housing-modal-title-copy item-skins-title-copy">
              <span className="factory-eyebrow">КОЛЕКЦІЯ СКІНІВ</span>
              <h2 id="item-skins-title">Скіни · {item.name}</h2>
              <span className="factory-header-caption">Вибери вигляд для своєї ферми</span>
            </div>
          </div>
          <div className="item-skins-header-right">
            <div className="item-skins-balances">
              <span className="modal-resource-chip"><img src="/assets/ui/coin.png" alt="" />{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
              <span className="modal-resource-chip"><img src="/assets/ui/rubin.png" alt="" />{(user?.rubies ?? 0).toLocaleString('uk-UA')}</span>
            </div>
            <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити вікно скінів">✕</button>
          </div>
        </header>
        <div className="item-skins-toolbar"><span><Sparkles size={13} /> Образи предмета</span><small>{skins.length + 1} доступно</small></div>
        <div className="item-skins-list">
          <article className={`item-skin-card item-skin-card-default${!tile.skinId ? ' is-active' : ''}`}>
            <div className="item-skin-preview item-skin-preview-default">
              {baseImage ? <img src={baseImage} alt="" draggable={false} /> : <span>{item.shopIcon ?? '🌱'}</span>}
            </div>
            <div className="item-skin-details">
              <span className="item-skin-rarity is-default"><Sparkles size={10} /> Стандартний</span>
              <strong>Стандартний вигляд</strong>
              <span>{!tile.skinId ? 'Зараз використовується' : 'Початковий вигляд'}</span>
            </div>
            {!tile.skinId
              ? <span className="item-skin-action is-active"><Check size={15} />Активний</span>
              : <button type="button" className="item-skin-action" disabled={busySkinId !== null} onClick={() => void handleApply(null)}>
                {busySkinId === 'default' ? 'Застосовуємо…' : 'Застосувати'}
              </button>}
          </article>
          {skins.map((skin) => {
            const owned = tile.unlockedSkinIds?.includes(skin.id) ?? false;
            const active = tile.skinId === skin.id;
            const busy = busySkinId === skin.id;
            const rarity = skin.rarity ?? 'common';
            const bonus = skin.productionTimeBonus;
            const hasTimeBonus = bonus?.enabled && Number.isSafeInteger(bonus.reductionPercent) &&
              bonus.reductionPercent >= 1 && bonus.reductionPercent <= 90 &&
              Number.isFinite(item.productionTimeMs);
            const timeSaved = hasTimeBonus ? (item.productionTimeMs ?? 0) * bonus.reductionPercent / 100 : 0;
            const effectiveTime = hasTimeBonus ? (item.productionTimeMs ?? 0) - timeSaved : 0;
            return (
              <article className={`item-skin-card is-${rarity}${active ? ' is-active' : ''}`} key={skin.id}>
                <div className="item-skin-preview">
                  {skin.shopImage
                    ? <img className="item-skin-shop-image" src={skin.shopImage} alt="" />
                    : skin.images.map((image, index) => <img src={image} alt="" key={`${image}-${index}`} />)}
                </div>
                <div className="item-skin-details">
                  <span className={`item-skin-rarity is-${rarity}`}><Sparkles size={10} />{rarity === 'exclusive' ? 'Ексклюзивний' : rarity === 'rare' ? 'Рідкісний' : 'Звичайний'}</span>
                  <strong>{skin.name}</strong>
                  <span>{active ? 'Застосовано' : owned ? 'У твоїй колекції' : 'Новий образ'}</span>
                  {hasTimeBonus && <small className="item-skin-bonus">
                    <span><Clock3 size={12} /> На {bonus.reductionPercent}% швидше</span>
                    <b>{formatGameDuration(effectiveTime)} замість {formatGameDuration(item.productionTimeMs ?? 0)} · економія {formatGameDuration(timeSaved)} за цикл</b>
                  </small>}
                </div>
                {active ? <button type="button" className="item-skin-action is-active" disabled><Check size={15} />Активний</button>
                  : owned ? <button type="button" className="item-skin-action" disabled={busySkinId !== null} onClick={() => void handleApply(skin.id)}>{busy ? 'Застосовуємо…' : 'Застосувати'}</button>
                    : <button type="button" className="item-skin-action is-buy" disabled={busySkinId !== null} onClick={() => void handlePurchase(skin.id)}>{busy ? 'Купуємо…' : <><LockKeyhole size={13} />{skin.price.toLocaleString('uk-UA')} <img src={skin.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt={skin.priceCurrency === 'rubies' ? 'рубінів' : 'монет'} /></>}</button>}
              </article>
            );
          })}
        </div>
        <footer className="item-skins-footer">
          <span><Sparkles size={13} /> Придбаний образ можна одразу застосувати до предмета.</span>
          <span>{skins.length} {skins.length === 1 ? 'скін' : 'скіни'}</span>
        </footer>
        {pendingSkinId && (() => {
          const skin = skins.find((entry) => entry.id === pendingSkinId);
          return skin ? (
            <PurchaseConfirmDialog
              itemName={skin.name}
              price={skin.price}
              currency={skin.priceCurrency ?? 'coins'}
              busy={busySkinId !== null}
              onConfirm={() => void handlePurchase(skin.id, true)}
              onCancel={() => setPendingSkinId(null)}
            />
          ) : null;
        })()}
      </section>
    </div>
  );
};
