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

  const filteredItems = Object.values(items).filter((item) => item.type === activeCategory);

  const handleBuy = (item: (typeof filteredItems)[number]) => {
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
              </div>
              <div style={styles.statsContainer}>
                {item.sellPrice !== undefined && <div style={styles.statRow}><span>Продаж одиниці:</span><span className="currency-inline shop-price">+{item.sellPrice}<img src="/assets/ui/coin.png" alt="" className="currency-small-icon" draggable={false} /></span></div>}
                {item.productionTimeMs !== undefined && (
                  <div style={styles.statRow}>
                    <span>Готовність:</span>
                    <span>{formatDuration(item.productionTimeMs)}</span>
                  </div>
                )}
                <div style={styles.statRow}><span>Досвід:</span><span style={{ color: '#b388ff', fontWeight: 'bold' }}>+{item.plantingXp}</span></div>
              </div>
              <button style={styles.buyBtn} onClick={() => handleBuy(item)}>
                <span>−{item.price.toLocaleString('uk-UA')}</span><img src="/assets/ui/coin.png" alt="" className="currency-small-icon" draggable={false} />
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
  iconBox: { width: '100%', height: '82px', background: 'linear-gradient(145deg, #f7e7be, #e4c58b)', border: '1px solid rgba(140, 92, 45, 0.25)', borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' },
  shopImage: { width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))' },
  cardEmoji: { fontSize: '38px' },
  priceBadge: { background: 'rgba(255, 193, 7, 0.2)', border: '1px solid rgba(255, 193, 7, 0.5)', borderRadius: '10px', padding: '3px 8px', color: '#ffd54f', fontWeight: '800', fontSize: '12px', marginBottom: '10px' },
  statsContainer: { width: '100%', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', color: '#755a38', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  statRow: { display: 'flex', justifyContent: 'space-between', width: '100%' },
  buyBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', minHeight: '36px', padding: '7px 8px', background: 'linear-gradient(180deg, #84d84b, #398d27)', borderRadius: '8px', color: '#fff9dd', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: '900', fontSize: '12px', cursor: 'pointer', border: '2px solid #327327', boxShadow: 'inset 0 1px 0 rgba(235, 255, 187, 0.65), 0 2px 0 #2b5f21' },
};