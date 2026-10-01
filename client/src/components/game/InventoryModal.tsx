import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({ isOpen, onClose }) => {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [sellingItemId, setSellingItemId] = useState<string | null>(null);
  const repeatTimeoutRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const sellItem = useFarmStore((state) => state.sellItem);
  const items = useGameConfigStore((state) => state.items);

  const inventory = user?.inventory ?? {};
  const stockedItems = Object.values(items).filter(
    (item) => item.yieldItem && (inventory[item.yieldItem] ?? 0) > 0
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

  const startAmountHold = (itemId: string, delta: number, max: number) => {
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
              <span className="modal-resource-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} />25</span>
            </div>
          </div>
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити інвентар">✕</button>
        </header>

        {stockedItems.length === 0 ? (
          <div className="inventory-modal-empty" style={styles.empty}>Поки що склад порожній</div>
        ) : (
          <div className="modal-scrollbar-hidden" style={styles.grid}>
              {stockedItems.map((item) => {
                const itemId = item.yieldItem!;
                const stockAmount = inventory[itemId] ?? 0;
                const amount = Math.min(amounts[itemId] ?? 1, stockAmount);
                const totalCoins = amount * (item.sellPrice ?? 0);
                const isSelling = sellingItemId === itemId;

                return (
                  <article key={itemId} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={styles.cardTitle}>{item.yieldName ?? item.name}</h3>
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
                        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startAmountHold(itemId, -1, stockAmount); }}
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
                        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startAmountHold(itemId, 1, stockAmount); }}
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
  card: { background: 'linear-gradient(145deg, #fff9e6, #ecd6aa)', border: '2px solid #d8b77e', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 3px 0 rgba(129, 81, 42, 0.16)' },
  cardTitle: { margin: 0, color: '#2b394d', textAlign: 'center', fontFamily: 'Trebuchet MS, sans-serif', fontSize: 13, fontWeight: 900 },
  imageBox: { height: 82, display: 'grid', placeItems: 'center', borderRadius: 12, border: '1px solid rgba(255,255,255,0.88)', background: 'linear-gradient(145deg, rgba(255,255,255,0.62), rgba(229,238,249,0.5))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.96)' },
  productIcon: { fontSize: 38 },
  productImage: { width: '70%', height: '70%', objectFit: 'contain' as const },
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
