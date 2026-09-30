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
      <section style={styles.window} onClick={(event) => event.stopPropagation()}>
        <header className="shared-modal-header" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleBlock}>
              <span style={styles.headerIcon}>📦</span>
              <h2 style={styles.title}>СКЛАД</h2>
            </div>
            <span className="modal-title-divider" aria-hidden="true" />
            <div style={styles.resources}>
              <span className="modal-resource-chip"><img src="/assets/ui/coin.png" alt="" draggable={false} />{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
              <span className="modal-resource-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} />25</span>
            </div>
          </div>
          <button type="button" style={styles.closeButton} onClick={onClose} aria-label="Закрити інвентар">✕</button>
        </header>

        {stockedItems.length === 0 ? (
          <div style={styles.empty}>Поки що склад порожній</div>
        ) : (
          <div className="modal-scrollbar-hidden" style={styles.grid}>
              {stockedItems.map((item) => {
                const itemId = item.yieldItem!;
                const stockAmount = inventory[itemId] ?? 0;
                const amount = Math.min(amounts[itemId] ?? 1, stockAmount);
                const totalCoins = amount * (item.sellPrice ?? 0);
                const isSelling = sellingItemId === itemId;

                return (
                  <article key={itemId} style={styles.card}>
                    <h3 style={styles.cardTitle}>{item.yieldName ?? item.name}</h3>
                    <div style={styles.imageBox}>
                      {item.yieldImage ? (
                        <img src={item.yieldImage} alt="" style={styles.productImage} draggable={false} />
                      ) : (
                        <span style={styles.productIcon}>{item.yieldIcon ?? item.shopIcon ?? '📦'}</span>
                      )}
                    </div>
                    <div style={styles.stockLine}><span>Запас</span><strong>{stockAmount}</strong></div>
                    <div style={styles.stockLine}><span>Ціна / шт.</span><strong className="currency-inline" style={styles.unitPrice}>{item.sellPrice ?? 0}<img src="/assets/ui/coin.png" alt="" draggable={false} /></strong></div>
                    <div style={styles.stepper}>
                      <button
                        type="button"
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
                      <output style={styles.stepValue}>{amount}</output>
                      <button
                        type="button"
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
                        style={styles.sellButton}
                        onClick={() => void handleSell(itemId, amount)}
                        disabled={!item.sellPrice || amount <= 0 || isSelling}
                      >
                        <span>{isSelling ? '...' : `Продати ${amount}`}</span>
                        <small style={styles.sellPrice}>+{totalCoins.toLocaleString('uk-UA')}<img src="/assets/ui/coin.png" alt="" style={styles.sellPriceCoin} draggable={false} /></small>
                      </button>
                      <button
                        type="button"
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
    padding: 16, background: 'rgba(19, 35, 24, 0.66)', backdropFilter: 'blur(8px)', pointerEvents: 'auto',
  },
  window: {
    width: 'min(100%, 720px)', maxHeight: '88vh', background: 'linear-gradient(145deg, #fff6dc, #ecd3a1)', color: '#402b1a',
    border: '7px solid #81512a', borderRadius: '18px 14px 18px 14px', boxShadow: 'inset 0 0 0 2px #d7a95f, inset 0 0 0 5px rgba(255, 250, 224, 0.72), 0 10px 0 #4f301d, 0 24px 50px rgba(0, 0, 0, 0.45)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px',
    borderBottom: '2px solid rgba(132, 83, 39, 0.22)',
  },
  titleBlock: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 22 },
  title: { margin: 0, color: '#4b2f1c', fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 900 },
  resources: { display: 'flex', alignItems: 'center', gap: 7 },
  closeButton: {
    width: 36, height: 36, borderRadius: '50%', border: '2px solid #80502a',
    background: 'linear-gradient(145deg, #fff1c8, #dba85e)', color: '#55351e', fontSize: 16, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(255, 255, 218, 0.8), 0 2px 0 #57351f',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, padding: 16, overflowY: 'auto', maxHeight: '76vh' },
  card: { background: 'linear-gradient(145deg, #fff9e6, #ecd6aa)', border: '2px solid #d8b77e', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 3px 0 rgba(129, 81, 42, 0.16)' },
  cardTitle: { margin: 0, color: '#49301d', textAlign: 'center', fontFamily: 'Trebuchet MS, sans-serif', fontSize: 13, fontWeight: 900 },
  imageBox: { height: 82, display: 'grid', placeItems: 'center', borderRadius: 9, border: '1px solid rgba(140, 92, 45, 0.25)', background: 'linear-gradient(145deg, #f7e7be, #e4c58b)' },
  productIcon: { fontSize: 38 },
  productImage: { width: '70%', height: '70%', objectFit: 'contain' as const },
  stockLine: { display: 'flex', justifyContent: 'space-between', color: '#755a38', fontFamily: 'Trebuchet MS, sans-serif', fontSize: 10, fontWeight: 600 },
  unitPrice: { color: '#3c812a', whiteSpace: 'nowrap' },
  stepper: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  stepButton: {
    display: 'grid', placeItems: 'center', width: 30, height: 30, padding: 0,
    borderRadius: 8, border: '2px solid #c8a46d',
    background: 'linear-gradient(145deg, #fff0c3, #e0bf81)', color: '#57391f', cursor: 'pointer', touchAction: 'none', userSelect: 'none',
  },
  stepValue: { minWidth: 24, color: '#49301d', textAlign: 'center', fontSize: 14, fontWeight: 900 },
  sellActions: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 5 },
  sellButton: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 0, minHeight: 42, padding: '3px 4px', border: '2px solid #327327', borderRadius: 8, background: 'linear-gradient(180deg, #84d84b, #398d27)', color: '#fff9dd',
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 9, fontWeight: 900, whiteSpace: 'normal', textAlign: 'center', cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(235, 255, 187, 0.65), 0 2px 0 #2b5f21',
  },
  sellAllButton: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 0, minHeight: 42, padding: '3px 4px', border: '2px solid #8b5428', borderRadius: 8, background: 'linear-gradient(180deg, #e7b957, #b8752f)', color: '#fff7df',
    fontFamily: 'Trebuchet MS, sans-serif', fontSize: 8, fontWeight: 900, whiteSpace: 'normal', textAlign: 'center', cursor: 'pointer', boxShadow: 'inset 0 1px 0 rgba(255, 240, 190, 0.65), 0 2px 0 #75451f',
  },
  sellPrice: { display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.92, fontSize: 9, lineHeight: 1 },
  sellPriceCoin: { width: 12, height: 12, objectFit: 'contain' },
  empty: { padding: '32px 20px', color: '#755a38', textAlign: 'center', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: 700 },
};
