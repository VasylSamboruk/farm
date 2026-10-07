import React, { useEffect, useRef, useState } from 'react';
import { Minus, PackageOpen, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { useToolStore } from '../../store/useToolStore';
import { formatGameDuration } from '../../game/trees';

const getTitleFontSize = (name: string) => Math.max(9, Math.min(13, (13 * 14) / name.length));

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ isOpen, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<'harvest' | 'farm' | 'other' | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [sellingItemId, setSellingItemId] = useState<string | null>(null);
  const repeatTimeoutRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const sellItem = useFarmStore((state) => state.sellItem);
  const sellFarmItem = useFarmStore((state) => state.sellFarmItem);
  const expandFarm = useFarmStore((state) => state.expandFarm);
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const items = useGameConfigStore((state) => state.items);

  const inventory = user?.inventory ?? {};
  const stockedItems = Object.values(items).filter(
    (item) => item.yieldItem && (inventory[item.yieldItem] ?? 0) > 0
  );
  const stockedFarmItems = Object.entries(user?.itemInventory ?? {}).filter(([, amount]) => amount > 0)
    .map(([itemId, amount]) => ({ item: items[itemId], amount }))
    .filter((entry) => entry.item);
  const stockedOtherItems = stockedFarmItems.filter(({ item }) => item?.type === 'OTHER');
  const stockedPlaceableItems = stockedFarmItems.filter(({ item }) => item?.type !== 'OTHER');
  const categoryCounts = {
    harvest: stockedItems.reduce((total, item) => total + (inventory[item.yieldItem!] ?? 0), 0),
    farm: stockedPlaceableItems.reduce((total, entry) => total + entry.amount, 0),
    other: stockedOtherItems.reduce((total, entry) => total + entry.amount, 0),
  };
  const visibleCategory = activeCategory ?? (
    categoryCounts.other > 0 ? 'other' : categoryCounts.farm > 0 ? 'farm' : 'harvest'
  );

  const stopAmountHold = () => {
    if (repeatTimeoutRef.current !== null) window.clearTimeout(repeatTimeoutRef.current);
    if (repeatIntervalRef.current !== null) window.clearInterval(repeatIntervalRef.current);
    repeatTimeoutRef.current = null;
    repeatIntervalRef.current = null;
  };

  const changeAmountBy = (itemId: string, delta: number, max: number) => {
    setAmounts((current) => ({
      ...current,
      [itemId]: Math.min(max, Math.max(0, Math.floor((current[itemId] ?? 1) + delta))),
    }));
  };

  const startAmountHold = (itemId: string, delta: number, max: number) =>
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      stopAmountHold();
      changeAmountBy(itemId, delta, max);
      repeatTimeoutRef.current = window.setTimeout(() => {
        repeatIntervalRef.current = window.setInterval(() => changeAmountBy(itemId, delta, max), 80);
      }, 300);
    };

  useEffect(() => stopAmountHold, []);

  if (!isOpen) return null;

  const handleSell = async (itemId: string, amount: number) => {
    if (!user || amount <= 0 || sellingItemId) return;

    setSellingItemId(itemId);
    await sellItem(user.id, itemId, amount);
    setSellingItemId(null);
  };

  const handleUseFarmItem = async (itemId: string, mechanic?: string | null) => {
    if (!user) return;
    if (mechanic === 'expand_farm') {
      const success = await expandFarm(user.id, itemId, true);
      if (success) notifyGameMessage('Подароване розширення застосовано.');
      return;
    }
    if (mechanic === 'accelerate_growth') {
      setActiveTool(`fertilize_${itemId}`);
      onClose();
      return;
    }
    if (items[itemId]?.type === 'OTHER') {
      notifyGameMessage('Механіка цього предмета ще не доступна.');
      return;
    }
    setActiveTool(`place_inventory_${itemId}`);
    onClose();
  };

  const handleSellFarmItem = async (itemId: string, amount: number) => {
    if (!user || amount <= 0 || sellingItemId) return;
    setSellingItemId(itemId);
    await sellFarmItem(user.id, itemId, amount);
    setSellingItemId(null);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <section className="game-modal-window inventory-modal-window" style={styles.window} onClick={(event) => event.stopPropagation()}>
        <header className="shared-modal-header game-modal-header" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleBlock}>
              <span style={styles.headerIcon}>📦</span>
              <h2 className="inventory-modal-title" style={styles.title}>СКЛАД</h2>
            </div>
            <span className="modal-title-divider" aria-hidden="true" />
            <div style={styles.resources}>
              <span className="modal-resource-chip"><img src="/assets/ui/coin.png" alt="" draggable={false} />{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
                <span className="modal-resource-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} />{(user?.rubies ?? 25).toLocaleString('uk-UA')}</span>
            </div>
          </div>
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити інвентар">✕</button>
        </header>

        <div className="shop-modal-tabs inventory-modal-tabs">
          {([
            ['harvest', 'Урожай'],
            ['farm', 'Ферма'],
            ['other', 'Інше'],
          ] as const).map(([category, label]) => (
            <button
              key={category}
              type="button"
              className={`shop-modal-tab${visibleCategory === category ? ' is-active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {label} <span className="inventory-tab-count">{categoryCounts[category]}</span>
            </button>
          ))}
        </div>
        {stockedItems.length === 0 && stockedFarmItems.length === 0 ? (
          <div className="inventory-modal-empty" style={styles.empty}>Поки що склад порожній</div>
        ) : (
          <div className="modal-scrollbar-hidden" style={styles.grid}>
              {visibleCategory === 'harvest' && stockedItems.length > 0 && <h3 className="inventory-section-title" style={styles.sectionTitle}>Урожай</h3>}
              {visibleCategory === 'harvest' && stockedItems.map((item) => {
                const itemId = item.yieldItem!;
                const stockAmount = inventory[itemId] ?? 0;
                const amount = Math.min(amounts[itemId] ?? 1, stockAmount);
                const totalCoins = amount * (item.sellPrice ?? 0);
                const isSelling = sellingItemId === itemId;

                return (
                  <article key={itemId} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(item.yieldName ?? item.name)}px` }} title={item.yieldName ?? item.name}>{item.yieldName ?? item.name}</h3>
                    <div className="inventory-image-box" style={styles.imageBox}>
                      {item.yieldImage ? (
                        <img src={item.yieldImage} alt="" style={styles.productImage} draggable={false} />
                      ) : (
                        <span style={styles.productIcon}>{item.yieldIcon ?? item.shopIcon ?? '📦'}</span>
                      )}
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Запас</span><strong>{stockAmount}</strong></div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Ціна / шт.</span><strong className="currency-inline inventory-unit-price" style={styles.unitPrice}>{item.sellPrice ?? 0}<img src="/assets/ui/coin.png" alt="" draggable={false} /></strong></div>
                    <div style={styles.stepper}>
                      <button
                        type="button"
                        className="inventory-step-button"
                        style={styles.stepButton}
                        onPointerDown={startAmountHold(itemId, -1, stockAmount)}
                        onPointerUp={stopAmountHold}
                        onPointerCancel={stopAmountHold}
                        onLostPointerCapture={stopAmountHold}
                        onContextMenu={(event) => event.preventDefault()}
                        disabled={amount <= 0 || isSelling}
                        aria-label={`Зменшити кількість ${item.yieldName ?? item.name}`}
                      >
                        <Minus size={14} />
                      </button>
                      <output className="inventory-step-value" style={styles.stepValue}>{amount}</output>
                      <button
                        type="button"
                        className="inventory-step-button"
                        style={styles.stepButton}
                        onPointerDown={startAmountHold(itemId, 1, stockAmount)}
                        onPointerUp={stopAmountHold}
                        onPointerCancel={stopAmountHold}
                        onLostPointerCapture={stopAmountHold}
                        onContextMenu={(event) => event.preventDefault()}
                        disabled={amount >= stockAmount || isSelling}
                        aria-label={`Збільшити кількість ${item.yieldName ?? item.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div style={styles.sellActions}>
                      <button
                        type="button"
                        className="inventory-sell-button"
                        style={styles.sellButton}
                        onClick={() => void handleSell(itemId, amount)}
                        disabled={!item.sellPrice || amount <= 0 || isSelling}
                      >
                        <span>{isSelling ? '...' : `${amount} шт.`}</span>
                        <small style={styles.sellPrice}>+{totalCoins.toLocaleString('uk-UA')}<img src="/assets/ui/coin.png" alt="" style={styles.sellPriceCoin} draggable={false} /></small>
                      </button>
                      <button
                        type="button"
                        className="inventory-sell-all-button"
                        style={styles.sellAllButton}
                        onClick={() => void handleSell(itemId, stockAmount)}
                        disabled={!item.sellPrice || stockAmount <= 0 || isSelling}
                      >
                        <span>{isSelling ? '...' : 'Продати все'}</span>
                        <small style={styles.sellPrice}>+{(stockAmount * (item.sellPrice ?? 0)).toLocaleString('uk-UA')}<img src="/assets/ui/coin.png" alt="" style={styles.sellPriceCoin} draggable={false} /></small>
                      </button>
                    </div>
                  </article>
                );
              })}
              {visibleCategory === 'farm' && stockedPlaceableItems.length > 0 && <h3 className="inventory-section-title" style={styles.sectionTitle}>Предмети ферми</h3>}
              {visibleCategory === 'farm' && stockedPlaceableItems.map(({ item, amount: stockAmount }) => {
                if (!item) return null;
                const refund = Math.floor(item.price / 2);
                const currencyImage = item.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png';
                const isBusy = sellingItemId === item.id;
                return (
                  <article key={item.id} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(item.name)}px` }} title={item.name}>{item.name}</h3>
                    <div className="inventory-image-box" style={styles.imageBox}>
                      {item.shopImage || item.growthImages?.at(-1)
                        ? <img src={item.shopImage ?? item.growthImages?.at(-1)} alt="" style={styles.farmItemImage} draggable={false} />
                        : <span style={styles.productIcon}>{item.shopIcon ?? '🎁'}</span>}
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Запас</span><strong>{stockAmount}</strong></div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Продаж / шт.</span><strong className="currency-inline inventory-unit-price" style={styles.unitPrice}>{refund}<img src={currencyImage} alt="" draggable={false} /></strong></div>
                    <button
                      type="button"
                      className="inventory-sell-button"
                      style={styles.sellButton}
                      onClick={() => void handleUseFarmItem(item.id, item.mechanic)}
                      disabled={isBusy}
                    >
                      {item.mechanic === 'expand_farm' ? 'Застосувати' : item.mechanic === 'accelerate_growth' ? 'Вибрати ціль' : 'Розмістити'}
                    </button>
                    <button
                      type="button"
                      className="inventory-sell-all-button"
                      style={styles.sellAllButton}
                      onClick={() => void handleSellFarmItem(item.id, stockAmount)}
                      disabled={isBusy || refund <= 0}
                    >
                      <span>{isBusy ? 'Продаємо…' : `Продати все · ${stockAmount} шт.`}</span>
                      <small style={styles.sellPrice}>+{(refund * stockAmount).toLocaleString('uk-UA')}<img src={currencyImage} alt="" style={styles.sellPriceCoin} draggable={false} /></small>
                    </button>
                  </article>
                );
              })}
              {visibleCategory === 'other' && stockedOtherItems.length > 0 && <h3 className="inventory-section-title" style={styles.sectionTitle}>Інше</h3>}
              {visibleCategory === 'other' && stockedOtherItems.map(({ item, amount: stockAmount }) => {
                if (!item) return null;
                const isBusy = sellingItemId === item.id;
                const isFertilizer = item.mechanic === 'accelerate_growth';
                return (
                  <article key={item.id} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(item.name)}px` }} title={item.name}>{item.name}</h3>
                    <div className="inventory-image-box" style={styles.imageBox}>
                      {item.shopImage
                        ? <img src={item.shopImage} alt="" style={styles.farmItemImage} draggable={false} />
                        : <span style={styles.productIcon}>{item.shopIcon ?? '🎁'}</span>}
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Запас</span><strong>{stockAmount}</strong></div>
                    {isFertilizer && (
                      <div className="inventory-stock-line" style={styles.stockLine}>
                        <span>Прискорює таймер</span>
                        <strong>{formatGameDuration(item.accelerationMs ?? 0)}</strong>
                      </div>
                    )}
                    <button
                      type="button"
                      className="inventory-sell-button"
                      style={styles.sellButton}
                      onClick={() => void handleUseFarmItem(item.id, item.mechanic)}
                      disabled={isBusy}
                    >
                      {isBusy ? '...' : isFertilizer ? 'Використати' : 'Застосувати'}
                    </button>
                  </article>
                );
              })}
              {((visibleCategory === 'harvest' && stockedItems.length === 0) ||
                (visibleCategory === 'farm' && stockedPlaceableItems.length === 0) ||
                (visibleCategory === 'other' && stockedOtherItems.length === 0)) && (
                <div className="inventory-category-empty">
                  <span className="inventory-category-empty-icon"><PackageOpen size={30} strokeWidth={1.8} /></span>
                  <strong>У цій категорії поки що порожньо</strong>
                  <span>Тут з’являться ваші предмети</span>
                </div>
              )}
          </div>
        )}
      </section>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16, background: 'rgba(25, 34, 45, 0.4)', backdropFilter: 'blur(5px)', pointerEvents: 'auto',
  },
  window: {
    width: 'min(100%, 720px)', maxHeight: '88vh', color: '#402b1a',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px',
    borderBottom: '1px solid rgba(132, 83, 39, 0.22)',
  },
  titleBlock: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 22 },
  title: { margin: 0, color: '#1f2e42', fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 900 },
  resources: { display: 'flex', alignItems: 'center', gap: 7 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, padding: 16, overflowY: 'auto', maxHeight: '76vh' },
  sectionTitle: { gridColumn: '1 / -1', margin: '2px 0', color: '#47674d', font: '700 14px Georgia, serif' },
  card: { background: 'linear-gradient(145deg, #fff9e6, #ecd6aa)', border: '2px solid #d8b77e', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 3px 0 rgba(129, 81, 42, 0.16)' },
  cardTitle: { width: '100%', margin: 0, overflow: 'hidden', color: '#2b394d', textAlign: 'center', fontFamily: 'Trebuchet MS, sans-serif', fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap' },
  imageBox: { position: 'relative', width: '100%', minWidth: 0, height: 82, overflow: 'hidden', display: 'grid', placeItems: 'center', boxSizing: 'border-box', borderRadius: 12, border: '1px solid rgba(255,255,255,0.88)', background: 'linear-gradient(145deg, rgba(255,255,255,0.62), rgba(229,238,249,0.5))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.96)' },
  productIcon: { fontSize: 38 },
  productImage: { display: 'block', width: '70%', height: '70%', maxWidth: '70%', maxHeight: '70%', objectFit: 'contain' as const },
  farmItemImage: { display: 'block', width: '100%', height: '100%', objectFit: 'contain' as const, filter: 'drop-shadow(0 4px 7px rgba(35,51,72,0.18))' },
  stockLine: { display: 'flex', justifyContent: 'space-between', color: '#65748a', fontFamily: 'Trebuchet MS, sans-serif', fontSize: 10, fontWeight: 600 },
  unitPrice: { color: '#218a55', whiteSpace: 'nowrap' },
  stepper: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stepButton: {
    display: 'grid', placeItems: 'center', width: 30, height: 30, padding: 0,
    borderRadius: 10, border: '1px solid rgba(255,255,255,0.94)',
    background: 'linear-gradient(145deg, rgba(255,255,255,0.9), rgba(226,236,248,0.72))', color: '#405168', cursor: 'pointer', touchAction: 'none', userSelect: 'none', boxShadow: 'inset 0 1px 0 #fff, 0 4px 10px rgba(51,70,94,0.1)',
  },
  stepValue: { minWidth: 24, color: '#49301d', textAlign: 'center', fontSize: 14, fontWeight: 900 },
  sellActions: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 },
  sellButton: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0, minHeight: 44, padding: '6px 12px', border: '1px solid rgba(31,112,66,0.86)', borderRadius: 11, background: 'linear-gradient(180deg, #238351, #1b6e42)', color: '#fff',
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 12, fontWeight: 900, whiteSpace: 'normal', textAlign: 'center', cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 3px 8px rgba(31,128,75,0.2)',
  },
  sellAllButton: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, minWidth: 0, minHeight: 48, padding: '5px 8px', border: '1px solid #3d566d', borderRadius: 11, background: 'linear-gradient(180deg, #5a7184, #40586c)', color: '#fff',
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 12, fontWeight: 900, whiteSpace: 'normal', textAlign: 'center', cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 3px 8px rgba(48,74,96,0.2)',
  },
  sellPrice: { display: 'inline-flex', alignItems: 'center', gap: 3, opacity: 1, fontSize: 11, lineHeight: 1.1, whiteSpace: 'nowrap' },
  sellPriceCoin: { width: 15, height: 15, objectFit: 'contain' },
  empty: { padding: '32px 20px', color: '#65748a', textAlign: 'center', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: 700 },
};
