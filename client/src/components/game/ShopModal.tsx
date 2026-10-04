import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { useToolStore } from '../../store/useToolStore';
import { useFarmStore } from '../../store/useFarmStore';
import type { GameItemConfig, GameItemType } from '../../types/game';
import { formatGameDuration } from '../../game/trees';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { type: GameItemType; label: string }[] = [
  { type: 'TREE', label: '🌳 Дерева' },
  { type: 'CROP', label: '🌱 Рослини' },
  { type: 'ANIMAL', label: '🐮 Тварини' },
  { type: 'BUILDING', label: '🏠 Декор' },
  { type: 'OTHER', label: '🧰 Інше' },
];

const getTitleFontSize = (name: string) => Math.max(9, Math.min(13, (13 * 14) / name.length));

export const ShopModal: React.FC<ShopModalProps> = ({ isOpen, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<GameItemType>('TREE');
  const [pendingExpansion, setPendingExpansion] = useState<GameItemConfig | null>(null);
  const [expanding, setExpanding] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { setActiveTool } = useToolStore();
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const expandFarm = useFarmStore((state) => state.expandFarm);
  const { items, loading, error } = useGameConfigStore();

  if (!isOpen) return null;

  const filteredItems = Object.values(items).filter((item) =>
    item.type === activeCategory && !item.disabled && (item.access !== 'admin' || user?.role === 'admin')
  ).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  const handleBuy = (item: (typeof filteredItems)[number]) => {
    const requiredLevel = item.requiredLevel ?? 1;
    if ((user?.level ?? 1) < requiredLevel) {
      notifyGameMessage(`Цей товар доступний з ${requiredLevel} рівня.`);
      return;
    }
    const currency = item.priceCurrency ?? 'coins';
    const balance = currency === 'rubies' ? (user?.rubies ?? 25) : (user?.coins ?? 0);
    if (balance < item.price) {
      notifyGameMessage(`Не вистачає ${currency === 'rubies' ? 'рубінів' : 'монет'} для цього предмета.`);
      onClose();
      return;
    }
    if (item.mechanic === 'expand_farm') {
      setPendingExpansion(item);
      return;
    }
    if (item.type === 'OTHER') {
      notifyGameMessage('Механіка цього товару ще не доступна.');
      return;
    }
    // Беремо в руку насіння
    setActiveTool(`place_${item.id}`);
    onClose();
  };

  const confirmExpansion = async () => {
    if (!pendingExpansion || !user?.id || expanding) return;
    setExpanding(true);
    const success = await expandFarm(user.id, pendingExpansion.id);
    setExpanding(false);
    if (success) {
      notifyGameMessage('Ферму розширено! Додано по одному квадрату з кожного боку.');
      setPendingExpansion(null);
      onClose();
    }
  };

  const scrollCategories = (direction: -1 | 1) => {
    tabsRef.current?.scrollBy({ left: direction * 180, behavior: 'smooth' });
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="game-modal-window shop-modal-window" style={styles.glassWindow} onClick={(e) => e.stopPropagation()}>
        
        <div className="shared-modal-header game-modal-header" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleWrapper}>
              <span style={{ fontSize: '22px' }}>🏪</span>
              <h2 className="shop-modal-title" style={styles.headerTitle}>МАГАЗИН</h2>
            </div>
            <span className="modal-title-divider" aria-hidden="true" />
            <div style={styles.resourcesContainer}>
              <div className="modal-resource-chip" style={styles.resourceItem}>
                <img src="/assets/ui/coin.png" alt="" style={styles.resourceIcon} draggable={false} />
                <span className="shop-modal-balance" style={styles.resourceValue}>{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
              </div>
              <div className="modal-resource-chip" style={styles.resourceItem}>
                <img src="/assets/ui/rubin.png" alt="" style={styles.resourceIcon} draggable={false} />
                <span className="shop-modal-balance" style={styles.resourceValue}>{(user?.rubies ?? 25).toLocaleString('uk-UA')}</span>
              </div>
            </div>
          </div>
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити магазин">✕</button>
        </div>

        <div className="shop-modal-tabs" style={styles.tabContainer}>
          <button className="shop-category-scroll" type="button" onClick={() => scrollCategories(-1)} aria-label="Прокрутити категорії вліво"><ChevronLeft size={21} /></button>
          <div className="shop-category-track" ref={tabsRef}>
          {CATEGORIES.map((category) => (
            <button
              key={category.type}
              className={`shop-modal-tab${activeCategory === category.type ? ' is-active' : ''}`}
              onClick={() => setActiveCategory(category.type)}
            >
              {category.label}
            </button>
          ))}
          </div>
          <button className="shop-category-scroll" type="button" onClick={() => scrollCategories(1)} aria-label="Прокрутити категорії вправо"><ChevronRight size={21} /></button>
        </div>

        {pendingExpansion && (
          <div className="shop-confirm-overlay" role="presentation">
            <section className="shop-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="shop-confirm-title">
              <h3 id="shop-confirm-title">Розширення ферми</h3>
              <p>Чи дійсно бажаєте купити розширення для своєї ферми?</p>
              <p className="shop-confirm-price">{pendingExpansion.price.toLocaleString('uk-UA')} <img src="/assets/ui/rubin.png" alt="рубінів" draggable={false} /></p>
              <div className="shop-confirm-actions">
                <button type="button" onClick={() => setPendingExpansion(null)} disabled={expanding}>Скасувати</button>
                <button type="button" onClick={() => void confirmExpansion()} disabled={expanding}>{expanding ? 'Купуємо…' : 'Підтвердити покупку'}</button>
              </div>
            </section>
          </div>
        )}

        <div className="shop-modal-grid modal-scrollbar-hidden" style={styles.gridContainer}>
          {filteredItems.map((item) => (
            <div key={item.id} className="game-modal-card shop-modal-card" style={styles.itemCard}>
              <div className="shop-modal-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(item.name)}px` }} title={item.name}>{item.name}</div>
              <div className="shop-modal-icon-box" style={styles.iconBox}>
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
                  <div className="shop-yield-pill" style={styles.yieldBadge} title={`${item.yieldName ?? item.name}${typeof item.sellPrice === 'number' ? ` · +${item.sellPrice} монет за продаж` : ''}`}>
                    <span className="shop-yield-icon" style={styles.yieldCircle}>
                      {item.yieldImage ? <img src={item.yieldImage} alt="" style={styles.yieldImage} draggable={false} /> : <span>{item.yieldIcon ?? '📦'}</span>}
                    </span>
                    {typeof item.sellPrice === 'number' && (
                      <span className="shop-yield-price" style={styles.yieldPrice}>+{item.sellPrice}<img src="/assets/ui/coin.png" alt="" style={styles.yieldCoin} draggable={false} /></span>
                    )}
                  </div>
                )}
              </div>
              <div className="shop-modal-stats" style={styles.statsContainer}>
                <div style={styles.statRow}><span>Доступно з:</span><span className="shop-modal-level" style={styles.levelRequirement}>{item.requiredLevel ?? 1} рівня</span></div>
                {item.type === 'OTHER' ? (
                  <div style={styles.statRow}><span>Механіка:</span><span>{item.mechanic === 'expand_farm' ? '+1 квадрат по периметру' : 'Спеціальна дія'}</span></div>
                ) : item.type !== 'BUILDING' && typeof item.productionTimeMs === 'number' && item.productionTimeMs > 0 && (
                  <div style={styles.statRow}>
                    <span>Готовність:</span>
                    <span>{formatGameDuration(item.productionTimeMs)}</span>
                  </div>
                )}
                {item.type !== 'OTHER' && <div style={styles.statRow}><span>Досвід:</span><span style={{ color: '#8b5ac7', fontWeight: 'bold' }}>+{item.plantingXp} XP</span></div>}
              </div>
              <button
                className="shop-modal-buy-button"
                style={(user?.level ?? 1) < (item.requiredLevel ?? 1) ? { ...styles.buyBtn, ...styles.lockedBuyBtn } : styles.buyBtn}
                onClick={() => handleBuy(item)}
                disabled={(user?.level ?? 1) < (item.requiredLevel ?? 1)}
                title={(user?.level ?? 1) < (item.requiredLevel ?? 1) ? `Доступно з ${item.requiredLevel ?? 1} рівня` : undefined}
              >
                <span>{(user?.level ?? 1) < (item.requiredLevel ?? 1) ? `Рівень ${item.requiredLevel ?? 1}` : `−${item.price.toLocaleString('uk-UA')}`}</span>
                {(user?.level ?? 1) >= (item.requiredLevel ?? 1) && <img src={item.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt="" className="currency-small-icon" draggable={false} />}
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
  overlay: { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(25, 34, 45, 0.4)', backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', boxSizing: 'border-box', pointerEvents: 'auto' },
  glassWindow: { width: '100%', maxWidth: '760px', maxHeight: '88vh', color: '#263447', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid rgba(132, 83, 39, 0.22)', gap: '10px' },
  titleWrapper: { display: 'flex', alignItems: 'center', gap: '8px' },
  headerTitle: { margin: 0, color: '#1f2e42', fontFamily: 'Georgia, serif', fontSize: '19px', fontWeight: '900' },
  resourcesContainer: { display: 'flex', alignItems: 'center', gap: '7px' },
  resourceItem: { display: 'flex', alignItems: 'center', gap: '5px' },
  resourceIcon: { width: '18px', height: '18px', objectFit: 'contain' },
  resourceValue: { color: '#263b58', fontWeight: '900', fontSize: '13px', textShadow: '0 1px rgba(255,255,255,0.55)' },
  tabContainer: { display: 'flex', alignItems: 'center', padding: '10px 12px', gap: '4px', background: 'linear-gradient(180deg, rgba(143, 94, 43, 0.09), rgba(143, 94, 43, 0.025))', borderBottom: '1px solid rgba(132, 83, 39, 0.18)' },
  gridContainer: { padding: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', overflowY: 'auto' },
  itemCard: { background: 'linear-gradient(145deg, #fffdf1, #f1dfb9)', border: '1px solid #d8b77e', borderRadius: '12px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 3px 0 rgba(129, 81, 42, 0.16), 0 7px 14px rgba(112, 77, 34, 0.08)' },
  cardTitle: { width: '100%', overflow: 'hidden', color: '#2b394d', fontWeight: '900', fontSize: '13px', marginBottom: '8px', textAlign: 'center', whiteSpace: 'nowrap' },
  iconBox: { position: 'relative', width: '100%', height: '82px', background: 'linear-gradient(145deg, rgba(249,250,251,0.96), rgba(220,225,231,0.88))', border: '1px solid rgba(255,255,255,0.94)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.98)' },
  shopImage: { width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 7px rgba(35,51,72,0.18))' },
  yieldBadge: { position: 'absolute', zIndex: 2, left: -7, bottom: -8, display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 29, margin: 0, padding: '2px 8px 2px 2px', border: '1px solid rgba(255,255,255,0.98)', borderRadius: 18, color: '#17653c', background: 'linear-gradient(180deg, rgba(235,250,241,0.98), rgba(193,230,207,0.96))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.98), 0 4px 10px rgba(35,86,57,0.2)' },
  yieldCircle: { display: 'grid', placeItems: 'center', flex: '0 0 24px', width: 24, height: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.98)', borderRadius: '50%', background: 'rgba(255,255,255,0.92)', boxShadow: '0 2px 5px rgba(45,70,58,0.12)', fontSize: 15 },
  yieldImage: { width: '76%', height: '76%', objectFit: 'contain' },
  yieldPrice: { display: 'inline-flex', alignItems: 'center', gap: 3, color: '#176c40', font: '900 11px/1.1 "Trebuchet MS", sans-serif', textShadow: '0 1px rgba(255,255,255,0.65)', whiteSpace: 'nowrap' },
  yieldCoin: { width: 14, height: 14, objectFit: 'contain' },
  cardEmoji: { fontSize: '38px' },
  priceBadge: { background: 'rgba(255, 193, 7, 0.2)', border: '1px solid rgba(255, 193, 7, 0.5)', borderRadius: '10px', padding: '3px 8px', color: '#ffd54f', fontWeight: '800', fontSize: '12px', marginBottom: '10px' },
  statsContainer: { width: '100%', fontFamily: 'Trebuchet MS, sans-serif', fontSize: '10px', color: '#65748a', display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' },
  statRow: { display: 'flex', justifyContent: 'space-between', width: '100%' },
  levelRequirement: { color: '#445c78', fontWeight: '800' },
  buyBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', minHeight: '36px', padding: '7px 8px', background: 'linear-gradient(180deg, #43d17c, #20a85a)', borderRadius: '11px', color: '#fff', fontFamily: 'Trebuchet MS, sans-serif', fontWeight: '900', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(31,151,81,0.7)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.58), 0 5px 12px rgba(31,164,88,0.2)' },
  lockedBuyBtn: { borderColor: '#8e7757', color: '#f5e8ce', background: 'linear-gradient(180deg, #a79a81, #756b5b)', boxShadow: 'inset 0 1px 0 rgba(255, 248, 224, 0.35), 0 2px 0 #5e5448', cursor: 'not-allowed' },
};