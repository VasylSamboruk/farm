import React, { useEffect, useState } from 'react';
import { ArrowRight, Hourglass, Minus, Plus, Wheat } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore, type TileData } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { GameItemConfig } from '../../types/game';
import { formatGameDuration } from '../../game/trees';
import { AdminItemSettings } from './AdminItemSettings';

interface FactoryModalProps {
  building: GameItemConfig;
  position: { row: number; col: number; quadrant: number };
  tile: TileData;
  onClose: () => void;
}

export const FactoryModal: React.FC<FactoryModalProps> = ({ building, position, tile, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const startFactory = useFarmStore((state) => state.startFactory);
  const collectFactory = useFarmStore((state) => state.collectFactory);
  const items = useGameConfigStore((state) => state.items);
  const [now, setNow] = useState(0);
  const [amount, setAmount] = useState('1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const queuedUnits = tile.factoryQueuedUnits ?? 0;
  const capacity = building.factoryCapacity ?? 25;
  const inputItem = items[building.factoryInputItemId ?? tile.factoryInputItemId ?? ''];
  const availableInput = inputItem?.yieldItem ? Number(user?.inventory?.[inputItem.yieldItem] ?? 0) : 0;
  const processingTimeMs = building.productionTimeMs ?? 0;
  const outputImage = building.yieldImage
    ?? (building.yieldItem === 'flour' ? '/assets/buildings/fabrik/muka.png' : undefined);
  const startedAt = tile.factoryStartedAt ? new Date(tile.factoryStartedAt).getTime() : null;
  const readyUnits = queuedUnits && startedAt && processingTimeMs > 0
    ? Math.min(queuedUnits, Math.floor(Math.max(0, now - startedAt) / processingTimeMs))
    : 0;
  const processProgress = queuedUnits && startedAt && processingTimeMs > 0
    ? readyUnits === queuedUnits ? 100 : Math.min(100, (Math.max(0, now - startedAt) % processingTimeMs) / processingTimeMs * 100)
    : 0;

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialUpdate);
      window.clearInterval(interval);
    };
  }, []);

  const start = async () => {
    const parsedAmount = Number(amount);
    if (!user?.id || busy || !Number.isSafeInteger(parsedAmount) || parsedAmount < 1) return;
    setBusy(true);
    setNotice('');
    try {
      if (await startFactory(user.id, position, parsedAmount)) {
        setNotice(`У чергу додано ${parsedAmount} од. ${inputItem?.yieldName ?? inputItem?.name ?? 'сировини'}.`);
        setAmount('1');
      }
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    if (!user?.id || busy || readyUnits < 1) return;
    setBusy(true);
    setNotice('');
    try {
      const collected = await collectFactory(user.id, position);
      if (collected > 0) setNotice(`Зібрано ${building.yieldName ?? 'продукту'}: ${collected * (building.yieldAmount ?? 1)} од.`);
    } finally {
      setBusy(false);
    }
  };

  const inputAmount = Math.min(availableInput, Math.max(0, capacity - queuedUnits));
  const selectedAmount = inputAmount > 0
    ? Math.min(inputAmount, Math.max(1, Number(amount) || 1))
    : 0;

  return (
    <div className="housing-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="housing-modal factory-modal game-modal-window" role="dialog" aria-modal="true" aria-labelledby="factory-modal-title" onClick={(event) => event.stopPropagation()}>
        <header className="housing-modal-header shared-modal-header game-modal-header">
          <div className="housing-modal-heading">
            <span className="housing-modal-icon" aria-hidden="true">
              {building.shopImage ? <img src={building.shopImage} alt="" draggable={false} /> : '🏭'}
            </span>
            <div className="housing-modal-title-copy">
              <h2 id="factory-modal-title">{building.name}</h2>
              <span className="factory-header-caption">Переробляй урожай у цінні товари</span>
            </div>
          </div>
          <div className="modal-header-actions">
            <AdminItemSettings item={building} />
            <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити">×</button>
          </div>
        </header>
        <div className="housing-modal-content">
          <div className="factory-recipe-flow">
            <article className="factory-product">
              <span className="factory-product-image">
                {inputItem?.yieldImage
                  ? <img src={inputItem.yieldImage} alt="" draggable={false} />
                  : <span>{inputItem?.yieldIcon ?? <Wheat size={27} />}</span>}
              </span>
              <strong>{inputItem?.yieldName ?? inputItem?.name ?? 'Сировина'}</strong>
              <small>На складі: {availableInput}</small>
              <span className="factory-price"><img src="/assets/ui/coin.png" alt="" draggable={false} />{inputItem?.sellPrice ?? '—'} <small>монет</small></span>
              <span className="factory-price-caption">вартість {inputItem?.yieldName?.toLowerCase() ?? 'сировини'}</span>
            </article>
            <div className="factory-recipe-process">
              <div className="factory-quantity-control" aria-label="Кількість сировини для завантаження">
                <button type="button" onClick={() => setAmount(String(Math.max(1, selectedAmount - 1)))} disabled={busy || selectedAmount <= 1} aria-label="Зменшити кількість"><Minus size={11} /></button>
                <output aria-live="polite">{selectedAmount}</output>
                <button type="button" onClick={() => setAmount(String(Math.min(inputAmount, selectedAmount + 1)))} disabled={busy || selectedAmount >= inputAmount} aria-label="Збільшити кількість"><Plus size={11} /></button>
              </div>
              <ArrowRight size={21} aria-hidden="true" />
              <div className="factory-input-controls">
                <button
                  className="factory-inline-load"
                  type="button"
                  onClick={() => void start()}
                  disabled={busy || inputAmount === 0 || selectedAmount > inputAmount}
                  aria-label={`Завантажити ${selectedAmount} одиниць`}
                >
                  {busy ? '…' : 'Завантажити'}
                </button>
              </div>
              <span><img className="factory-clock" src="/assets/ui/shop/clock.png" alt="" draggable={false} />{formatGameDuration(processingTimeMs)}</span>
            </div>
            <article className="factory-product is-output">
              <span className="factory-product-image">
                {outputImage
                  ? <img src={outputImage} alt="" draggable={false} />
                  : <span>{building.yieldIcon ?? '🛍️'}</span>}
              </span>
              <strong>{building.yieldName ?? 'Готовий продукт'}</strong>
              <small>{building.yieldAmount ?? 1} за цикл</small>
              <span className="factory-price"><img src="/assets/ui/coin.png" alt="" draggable={false} />{building.sellPrice ?? '—'} <small>монет</small></span>
              <span className="factory-price-caption">продаж {building.yieldName?.toLowerCase() ?? 'продукту'}</span>
            </article>
          </div>
          <section className="factory-queue-panel" aria-label="Заповнення черги фабрики">
            <div className="factory-queue-heading">
              <span>Черга: {building.name}</span>
              <small>Заповнено: <b>{queuedUnits}/{capacity}</b></small>
            </div>
            <div className="factory-slots" role="list">
              {Array.from({ length: capacity }, (_, index) => {
                if (index >= queuedUnits) return <div className="factory-slot is-empty" role="listitem" key={index}><img src={outputImage ?? ''} alt="" draggable={false} hidden={!outputImage} /></div>;
                const readyAt = startedAt && processingTimeMs > 0 ? startedAt + (index + 1) * processingTimeMs : null;
                const isDone = index < readyUnits;
                const isActive = index === readyUnits;
                const left = readyAt ? Math.max(0, readyAt - now) : 0;
                const label = isDone ? 'Готово' : formatGameDuration(left);
                return (
                  <div className={`factory-slot${isDone ? ' is-done' : ''}`} role="listitem" key={index}>
                    {outputImage ? <img src={outputImage} alt="" draggable={false} /> : <span className="factory-slot-emoji">{building.yieldIcon ?? '🛍️'}</span>}
                    <strong>{label}</strong>
                    <span className="factory-slot-bar"><span style={{ width: `${isDone ? 100 : isActive ? processProgress : 0}%` }} /></span>
                  </div>
                );
              })}
            </div>
            {queuedUnits > 0 && (
              <button className="factory-collect-button" type="button" onClick={() => void collect()} disabled={busy || readyUnits === 0}>
                {busy ? 'Зачекай…' : `Забрати готове · ${readyUnits}`}
              </button>
            )}
          </section>
          <p className="factory-capacity-note"><Hourglass size={20} aria-hidden="true" />Вільно місця: <b>{Math.max(0, capacity - queuedUnits)} од.</b></p>
          {notice && <p className="factory-notice" role="status">{notice}</p>}
        </div>
      </section>
    </div>
  );
};
