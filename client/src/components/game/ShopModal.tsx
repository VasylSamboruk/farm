import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { useToolStore } from '../../store/useToolStore';
import { useFarmStore } from '../../store/useFarmStore';
import type { GameItemType } from '../../types/game';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { type: GameItemType; label: string }[] = [
  { type: 'TREE', label: '🌳 Дерева' },
  { type: 'CROP', label: '🌱 Рослини' },
  { type: 'ANIMAL', label: '🐮 Тварини' },
  { type: 'BUILDING', label: '🏠 Декор' },
];

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.ceil(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} с`;

  const totalMinutes = Math.ceil(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} хв`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} год ${minutes} хв` : `${hours} год`;
};

export const ShopModal: React.FC<ShopModalProps> = ({ isOpen, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<GameItemType>('TREE');
  const { user } = useAuthStore();
  const { setActiveTool } = useToolStore();
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const { items, loading, error } = useGameConfigStore();

  if (!isOpen) return null;

  const filteredItems = Object.values(items).filter((item) =>
    item.type === activeCategory && (item.access !== 'admin' || user?.role === 'admin')
  ).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  const handleBuy = (item: (typeof filteredItems)[number]) => {
    const requiredLevel = item.requiredLevel ?? 1;
    if ((user?.level ?? 1) < requiredLevel) {
      notifyGameMessage(`Цей товар доступний з ${requiredLevel} рівня.`);
      return;
    }
    if ((user?.coins ?? 0) < item.price) {
      notifyGameMessage('Не вистачає монет для цього предмета.');
      onClose();
      return;
    }
    // Беремо в руку насіння
    setActiveTool(`place_${item.id}`);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.glassWindow} onClick={(e) => e.stopPropagation()}>
        
        <div className="shared-modal-header" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleWrapper}>
              <span style={{ fontSize: '22px' }}>🏪</span>
              <h2 style={styles.headerTitle}>МАГАЗИН</h2>
            </div>
            <span className="modal-title-divider" aria-hidden="true" />
            <div style={styles.resourcesContainer}>
              <div className="modal-resource-chip" style={styles.resourceItem}>
                <img src="/assets/ui/coin.png" alt="" style={styles.resourceIcon} draggable={false} />
                <span style={styles.resourceValue}>{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
              </div>
              <div className="modal-resource-chip" style={styles.resourceItem}>
                <img src="/assets/ui/rubin.png" alt="" style={styles.resourceIcon} draggable={false} />
                <span style={styles.resourceValue}>25</span>
              </div>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.tabContainer}>
          {CATEGORIES.map((category) => (
            <button
              key={category.type}
              style={activeCategory === category.type ? { ...styles.tabBtn, ...styles.activeTabBtn } : styles.tabBtn}
              onClick={() => setActiveCategory(category.type)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="modal-scrollbar-hidden" style={styles.gridContainer}>
          {filteredItems.map((item) => (
            <div key={item.id} style={styles.itemCard}>
              <div style={styles.cardTitle}>{item.name}</div>
              <div style={styles.iconBox}>
                {item.shopImage || item.growthImages?.at(-1) ? (
                  <img
                    src={item.shopImage ?? item.growthImages?.at(-1)}
                    alt={item.name}
                    style={styles.shopImage}
                    draggable={false}
                  />
                ) : (
                  <span style={styles.cardEmoji}>{item.shopIcon ?? item.yieldIcon ?? '🌳'}</span>
                )}
                {item.yieldItem && (
                  <div style={styles.yieldBadge} title={`${item.yieldName ?? item.name}${item.sellPrice !== undefined ? ` · +${item.sellPrice} монет за продаж` : ''}`}>
                    <span style={styles.yieldCircle}>
                      {item.yieldImage ? <img src={item.yieldImage} alt="" style={styles.yieldImage} draggable={false} /> : <span>{item.yieldIcon ?? '📦'}</span>}
                    </span>
                    {item.sellPrice !== undefined && (
                      <span style={styles.yieldPrice}>+{item.sellPrice}<img src="/assets/ui/coin.png" alt="" style={styles.yieldCoin} draggable={false} /></span>
                    )}
                  </div>
                )}
              </div>
              <div style={styles.statsContainer}>
                <div style={styles.statRow}><span>Доступно з:</span><span style={styles.levelRequirement}>{item.requiredLevel ?? 1} рівня</span></div>
                {item.productionTimeMs !== undefined && (
                  <div style={styles.statRow}>
                    <span>Готовність:</span>
                    <span>{formatDuration(item.productionTimeMs)}</span>
                  </div>
                )}
                <div style={styles.statRow}><span>Досвід:</span><span style={{ color: '#8b5ac7', fontWeight: 'bold' }}>+{item.plantingXp} XP</span></div>
              </div>
              <button
                style={(user?.level ?? 1) < (item.requiredLevel ?? 1) ? { ...styles.buyBtn, ...styles.lockedBuyBtn } : styles.buyBtn}
                onClick={() => handleBuy(item)}
                disabled={(user?.level ?? 1) < (item.requiredLevel ?? 1)}
                title={(user?.level ?? 1) < (item.requiredLevel ?? 1) ? `Доступно з ${item.requiredLevel ?? 1} рівня` : undefined}
              >
                <span>{(user?.level ?? 1) < (item.requiredLevel ?? 1) ? `Рівень ${item.requiredLevel ?? 1}` : `−${item.price.toLocaleString('uk-UA')}`}</span>
                {(user?.level ?? 1) >= (item.requiredLevel ?? 1) && <img src="/assets/ui/coin.png" alt="" className="currency-small-icon" draggable={false} />}
              </button>
            </div>
          ))}
          {loading && <p style={{color: 'white', gridColumn: '1 / -1', textAlign: 'center'}}>Завантаження каталогу...</p>}
          {error && <p style={{color: 'white', gridColumn: '1 / -1', textAlign: 'center'}}>{error}</p>}
          {!loading && !error && filteredItems.length === 0 && <p style={{color: 'white', gridColumn: '1 / -1', textAlign: 'center'}}>Тут поки порожньо...</p>}
        </div>

      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(19, 35, 24, 0.66)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box', pointerEvents: 'auto' },
  glassWindow: { width: '100%', maxWidth: '760px', maxHeight: '88vh', background: 'linear-gradient(145deg, #fff6dc, #ecd3a1)', color: '#402b1a', border: '7px solid #81512a', borderRadius: '18px 14px 18px 14px', boxShadow: 'inset 0 0 0 2px #d7a95f, inset 0 0 0 5px rgba(255, 250, 224, 0.72), 0 10px 0 #4f301d, 0 24px 50px rgba(0, 0, 0, 0.45)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '2px solid rgba(132, 83, 39, 0.22)', gap: '10px' },
  titleWrapper: { display: 'flex', alignItems: 'center', gap: '8px' },
  headerTitle: { margin: 0, color: '#4b2f1c', fontFamily: 'Georgia, serif', fontSize: '19px', fontWeight: '900' },
  resourcesContainer: { display: 'flex', alignItems: 'center', gap: '7px' },
  resourceItem: { display: 'flex', alignItems: 'center', gap: '5px' },
  resourceIcon: { width: '18px', height: '18px', objectFit: 'contain' },
  resourceValue: { color: '#fff4d4', fontWeight: '900', fontSize: '13px' },
  closeBtn: { background: 'linear-gradient(145deg, #fff1c8, #dba85e)', border: '2px solid #80502a', borderRadius: '50%', width: '36px', height: '36px', color: '#55351e', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.15s ease', boxShadow: 'inset 0 0 0 1px rgba(255, 255, 218, 0.8), 0 2px 0 #57351f' },
  tabContainer: { display: 'flex', padding: '10px 16px', gap: '8px', background: 'rgba(143, 94, 43, 0.1)', borderBottom: '2px solid rgba(132, 83, 39, 0.18)' },
  tabBtn: { flex: 1, padding: '10px', borderRadius: '9px', border: '2px solid rgba(142, 95, 48, 0.28)', background: 'linear-gradient(145deg, rgba(255, 250, 231, 0.85), rgba(231, 204, 153, 0.6))', color: '#745432', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: '800', fontSize: '12px', cursor: 'pointer', transition: 'all 0.2s ease' },
  activeTabBtn: { background: 'linear-gradient(180deg, #86d64b, #438e28)', borderColor: '#36732a', color: '#fff9dd', boxShadow: 'inset 0 1px 0 rgba(235, 255, 187, 0.72), 0 2px 0 #2c6022' },
  gridContainer: { padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px', overflowY: 'auto' },
  itemCard: { background: 'linear-gradient(145deg, #fff9e6, #ecd6aa)', border: '2px solid #d8b77e', borderRadius: '12px', padding: '11px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 3px 0 rgba(129, 81, 42, 0.16)' },
  cardTitle: { color: '#49301d', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: '900', fontSize: '13px', marginBottom: '8px', textAlign: 'center' },
  iconBox: { position: 'relative', width: '100%', height: '82px', background: 'linear-gradient(145deg, #f7e7be, #e4c58b)', border: '1px solid rgba(140, 92, 45, 0.25)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' },
  shopImage: { width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))' },
  yieldBadge: { position: 'absolute', top: -8, right: -7, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '3px 4px', border: '1px solid rgba(85, 60, 34, 0.32)', borderRadius: 24, background: 'rgba(255, 248, 225, 0.96)', boxShadow: '0 2px 5px rgba(60, 38, 18, 0.22)' },
  yieldCircle: { display: 'grid', placeItems: 'center', flex: '0 0 28px', width: 28, height: 28, overflow: 'hidden', border: '1px solid #b88c50', borderRadius: '50%', background: 'linear-gradient(145deg, #fff8de, #e8cc91)', fontSize: 17 },
  yieldImage: { width: '76%', height: '76%', objectFit: 'contain' },
  yieldPrice: { display: 'inline-flex', alignItems: 'center', gap: 1, color: '#357c2b', font: '900 11px/1.1 "Trebuchet MS", sans-serif', textShadow: '0 0 0.4px currentColor', whiteSpace: 'nowrap' },
  yieldCoin: { width: 12, height: 12, objectFit: 'contain' },
  cardEmoji: { fontSize: '38px' },
  priceBadge: { background: 'rgba(255, 193, 7, 0.2)', border: '1px solid rgba(255, 193, 7, 0.5)', borderRadius: '10px', padding: '3px 8px', color: '#ffd54f', fontWeight: '800', fontSize: '12px', marginBottom: '10px' },
  statsContainer: { width: '100%', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', color: '#755a38', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  statRow: { display: 'flex', justifyContent: 'space-between', width: '100%' },
  levelRequirement: { color: '#76502c', fontWeight: '800' },
  buyBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', minHeight: '36px', padding: '7px 8px', background: 'linear-gradient(180deg, #84d84b, #398d27)', borderRadius: '8px', color: '#fff9dd', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: '900', fontSize: '12px', cursor: 'pointer', border: '2px solid #327327', boxShadow: 'inset 0 1px 0 rgba(235, 255, 187, 0.65), 0 2px 0 #2b5f21' },
  lockedBuyBtn: { borderColor: '#8e7757', color: '#f5e8ce', background: 'linear-gradient(180deg, #a79a81, #756b5b)', boxShadow: 'inset 0 1px 0 rgba(255, 248, 224, 0.35), 0 2px 0 #5e5448', cursor: 'not-allowed' },
};