import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { useToolStore } from '../../store/useToolStore';
import { useFarmStore } from '../../store/useFarmStore';
import { adminApi } from '../../api/admin.api';
import type { GameItemConfig, GameItemType, ShopBadge } from '../../types/game';
import { formatGameDuration } from '../../game/trees';
import { PurchaseConfirmDialog } from './PurchaseConfirmDialog';

interface ShopModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ShopCategory = GameItemType | 'DECOR' | 'WATER';
type BuildingSubcategory = 'FACTORIES' | 'PENS';
type OtherSubcategory = 'items' | 'styles';
type WaterSubcategory = 'all' | 'animals' | 'plants' | 'decor';

const CATEGORIES: { type: ShopCategory; label: string; icon: string }[] = [
  { type: 'TREE', label: 'Дерева', icon: '/assets/ui/shop_cat_tree.png' },
  { type: 'CROP', label: 'Рослини', icon: '/assets/ui/shop_cat_crop.png' },
  { type: 'ANIMAL', label: 'Тварини', icon: '/assets/ui/shop_cat_animal.png' },
  { type: 'BUILDING', label: 'Будівлі', icon: '/assets/ui/shop_cat_building.png' },
  { type: 'DECOR', label: 'Декор', icon: '/assets/ui/shop_cat_decor.png' },
  { type: 'WATER', label: 'Вода', icon: '/assets/ui/water_shovel.png' },
  { type: 'OTHER', label: 'Інше', icon: '/assets/ui/shop_cat_other.png' },
];

const getTitleFontSize = (name: string) => Math.max(10, Math.min(14, (14 * 13) / name.length));

const SHOP_BADGES: { id: ShopBadge; label: string; image: string }[] = [
  { id: 'new', label: 'Новинка', image: '/assets/ui/shop/badge-new.png' },
  { id: 'sale', label: 'Акція', image: '/assets/ui/shop/badge-sale.png' },
  { id: 'top', label: 'Топ', image: '/assets/ui/shop/badge-top.png' },
  { id: 'hit', label: 'Хіт', image: '/assets/ui/shop/badge-hit.png' },
];

const StatRow: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; accent?: 'level' | 'xp' }> = ({ icon, label, value, accent }) => (
  <div className="shop-stat-row">
    <span className="shop-stat-icon">{icon}</span>
    <span className="shop-stat-label">{label}</span>
    <span className={`shop-stat-value${accent ? ` is-${accent}` : ''}`}>{value}</span>
  </div>
);

export const ShopModal: React.FC<ShopModalProps> = ({ isOpen, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<ShopCategory>('TREE');
  const [buildingSubcategory, setBuildingSubcategory] = useState<BuildingSubcategory>('PENS');
  const [otherSubcategory, setOtherSubcategory] = useState<OtherSubcategory>('items');
  const [waterSubcategory, setWaterSubcategory] = useState<WaterSubcategory>('all');
  const [pendingPurchase, setPendingPurchase] = useState<GameItemConfig | null>(null);
  const [pendingFertilizer, setPendingFertilizer] = useState<GameItemConfig | null>(null);
  const [purchasingItemId, setPurchasingItemId] = useState<string | null>(null);
  const [badgeSavingId, setBadgeSavingId] = useState<string | null>(null);
  const [promoEditId, setPromoEditId] = useState<string | null>(null);
  const [promoBadge, setPromoBadge] = useState<ShopBadge | ''>('');
  const [promoName, setPromoName] = useState('');
  const [promoBase, setPromoBase] = useState('');
  const [promoSale, setPromoSale] = useState('');
  const [promoScale, setPromoScale] = useState('1');
  const [promoRequiredLevel, setPromoRequiredLevel] = useState('1');
  const [promoVisibility, setPromoVisibility] = useState<'all' | 'admin' | 'hidden'>('all');
  const [promoTime, setPromoTime] = useState('');
  const [promoXp, setPromoXp] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { setActiveTool } = useToolStore();
  const notifyGameMessage = useFarmStore((state) => state.notifyGameMessage);
  const expandFarm = useFarmStore((state) => state.expandFarm);
  const buyFertilizer = useFarmStore((state) => state.buyFertilizer);
  const buyStyle = useFarmStore((state) => state.buyStyle);
  const { items, loading, error, loadItems } = useGameConfigStore();

  useEffect(() => {
    if (isOpen) void loadItems(true);
  }, [isOpen, loadItems]);

  if (!isOpen) return null;

  const openPromoEditor = (item: GameItemConfig) => {
    setPromoEditId(item.id);
    setPromoBadge(item.shopBadge ?? '');
    setPromoName(item.name);
    setPromoBase(String(item.originalPrice ?? item.price));
    setPromoSale(item.originalPrice && item.originalPrice > item.price ? String(item.price) : '');
    setPromoScale(String(item.spriteScale ?? 1));
    setPromoRequiredLevel(String(item.requiredLevel ?? 1));
    setPromoVisibility(item.disabled ? 'hidden' : item.access === 'admin' ? 'admin' : 'all');
    setPromoTime(item.productionTimeMs ? String(Math.round(item.productionTimeMs / 1000)) : '');
    setPromoXp(String(item.plantingXp ?? 0));
  };

  const applyDiscountPercent = (percent: number) => {
    const base = Number(promoBase);
    if (percent === 0 || !Number.isFinite(base) || base < 1) {
      setPromoSale('');
      return;
    }
    setPromoSale(String(Math.max(1, Math.round(base * (1 - percent / 100)))));
    if (!promoBadge) setPromoBadge('sale');
  };

  const savePromo = async (item: GameItemConfig) => {
    if (badgeSavingId) return;
    const name = promoName.trim();
    const base = Number(promoBase);
    const sale = promoSale.trim() === '' ? null : Number(promoSale);
    const scale = Number(promoScale);
    const requiredLevel = Number(promoRequiredLevel);
    if (!name || name.length > 80) { notifyGameMessage('Вкажи назву товару (до 80 символів).'); return; }
    if (!Number.isSafeInteger(base) || base < 0) { notifyGameMessage('Початкова ціна має бути цілим числом.'); return; }
    if (sale !== null && (!Number.isSafeInteger(sale) || sale < 1 || sale >= base)) {
      notifyGameMessage('Ціна зі знижкою має бути меншою за початкову.');
      return;
    }
    if (!Number.isFinite(scale) || scale < 0.1 || scale > 5) { notifyGameMessage('Розмір має бути від 0.1 до 5.'); return; }
    if (!Number.isSafeInteger(requiredLevel) || requiredLevel < 1 || requiredLevel > 999) {
      notifyGameMessage('Рівень доступу має бути цілим числом від 1 до 999.');
      return;
    }
    const hasTime = Boolean(item.productionTimeMs);
    const timeSec = Number(promoTime);
    const xp = Number(promoXp);
    if (hasTime && (!Number.isFinite(timeSec) || timeSec < 1)) { notifyGameMessage('Час має бути не менше 1 секунди.'); return; }
    if (!Number.isSafeInteger(xp) || xp < 0) { notifyGameMessage('Досвід має бути цілим числом від 0.'); return; }
    setBadgeSavingId(item.id);
    try {
      await adminApi.updateConfig(item.id, {
        name,
        price: base,
        salePrice: sale,
        spriteScale: scale,
        requiredLevel,
        plantingXp: xp,
        ...(hasTime ? { productionTimeMs: Math.round(timeSec * 1000) } : {}),
        shopBadge: promoBadge || null,
        disabled: promoVisibility === 'hidden',
        access: promoVisibility === 'admin' ? 'admin' : 'all',
      });
      await loadItems(true);
      setPromoEditId(null);
    } catch (badgeError) {
      console.error('Не вдалося зберегти налаштування товару:', badgeError);
      notifyGameMessage('Не вдалося зберегти налаштування товару.');
    } finally {
      setBadgeSavingId(null);
    }
  };

  const filteredItems = Object.values(items).filter((item) =>
    (activeCategory === 'WATER' || item.placementSurface !== 'water') &&
    (activeCategory === 'WATER'
      ? item.placementSurface === 'water' && (
        waterSubcategory === 'all' ||
        (waterSubcategory === 'animals' && item.type === 'ANIMAL') ||
        (waterSubcategory === 'plants' && (item.type === 'TREE' || item.type === 'CROP')) ||
        (waterSubcategory === 'decor' && item.type === 'BUILDING' &&
          (item.buildingCategory ?? (item.housing ? 'PEN' : 'DECOR')) === 'DECOR')
      )
      : activeCategory === 'DECOR'
        ? item.type === 'BUILDING' && (item.buildingCategory ?? (item.housing ? 'PEN' : 'DECOR')) === 'DECOR'
        : item.type === activeCategory && (activeCategory !== 'BUILDING' ||
          (buildingSubcategory === 'FACTORIES'
            ? item.buildingCategory === 'FACTORY'
            : item.buildingCategory === 'PEN' || (!item.buildingCategory && Boolean(item.housing))))) &&
    (activeCategory !== 'OTHER' ||
      (otherSubcategory === 'styles'
        ? item.mechanic === 'grass_style' || item.mechanic === 'background_style'
        : item.mechanic !== 'grass_style' && item.mechanic !== 'background_style')) &&
    !item.giftOnly && (!item.disabled || user?.role === 'admin') && (item.access !== 'admin' || user?.role === 'admin') &&
    (item.mechanic !== 'grass_style' || !user?.unlockedGrassStyles?.includes(item.id)) &&
    (item.mechanic !== 'background_style' || !user?.unlockedBackgroundStyles?.includes(item.id))
  ).sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

  const handleBuy = async (item: (typeof filteredItems)[number], confirmed = false) => {
    const requiredLevel = item.requiredLevel ?? 1;
    if ((user?.level ?? 1) < requiredLevel) {
      notifyGameMessage(`Цей товар доступний з ${requiredLevel} рівня.`);
      return;
    }
    if (item.mechanic === 'accelerate_growth') {
      setPendingFertilizer(item);
      return;
    }
    const currency = item.priceCurrency ?? 'coins';
    const balance = currency === 'rubies' ? (user?.rubies ?? 25) : (user?.coins ?? 0);
    if (balance < item.price) {
      notifyGameMessage(`Не вистачає ${currency === 'rubies' ? 'рубінів' : 'монет'} для цього предмета.`);
      if (!confirmed) onClose();
      return;
    }
    if (!confirmed) {
      setPendingPurchase(item);
      return;
    }
    if (item.mechanic === 'expand_farm') {
      if (!user?.id || purchasingItemId) return;
      setPurchasingItemId(item.id);
      try {
        if (await expandFarm(user.id, item.id)) {
          notifyGameMessage('Ферму розширено вперед!');
          setPendingPurchase(null);
          onClose();
        }
      } finally {
        setPurchasingItemId(null);
      }
      return;
    }
    if (item.mechanic === 'grass_style') {
      if (!user?.id || purchasingItemId) return;
      setPurchasingItemId(item.id);
      try {
        if (await buyStyle(user.id, item.id)) {
          notifyGameMessage('Вигляд трави придбано! Застосуй його у розділі «Оформлення» складу.');
          setPendingPurchase(null);
        }
      } finally {
        setPurchasingItemId(null);
      }
      return;
    }
    if (item.mechanic === 'background_style') {
      if (!user?.id || purchasingItemId) return;
      setPurchasingItemId(item.id);
      try {
        if (await buyStyle(user.id, item.id)) {
          notifyGameMessage('Фон придбано! Застосуй його у вкладці «Оформлення» складу.');
          setPendingPurchase(null);
        }
      } finally {
        setPurchasingItemId(null);
      }
      return;
    }
    if (item.type === 'OTHER') {
      notifyGameMessage('Механіка цього товару ще не доступна.');
      return;
    }
    // Беремо в руку насіння
    setPendingPurchase(null);
    setActiveTool(`place_${item.id}`);
    onClose();
  };

  const requestPurchase = (item: GameItemConfig) => {
    if ((user?.level ?? 1) < (item.requiredLevel ?? 1)) {
      notifyGameMessage(`Цей товар доступний з ${item.requiredLevel ?? 1} рівня.`);
      return;
    }
    if (item.mechanic === 'accelerate_growth') setPendingFertilizer(item);
    else setPendingPurchase(item);
  };

  const confirmFertilizerPurchase = async (quantity: number) => {
    if (!pendingFertilizer || !user?.id || purchasingItemId) return;
    const item = pendingFertilizer;
    setPurchasingItemId(item.id);
    try {
      if (await buyFertilizer(user.id, item.id, quantity)) {
        notifyGameMessage(`${quantity} ${quantity === 1 ? 'одиницю добрива куплено' : 'одиниць добрива куплено'} і поміщено на склад!`);
        setPendingFertilizer(null);
        onClose();
      }
    } finally {
      setPurchasingItemId(null);
    }
  };

  const scrollCategories = (direction: -1 | 1) => {
    const track = tabsRef.current;
    if (!track) return;
    const firstTab = track.querySelector<HTMLButtonElement>('.shop-modal-tab');
    const gap = Number.parseFloat(window.getComputedStyle(track).columnGap) || 0;
    track.scrollBy({ left: direction * ((firstTab?.offsetWidth ?? 120) + gap), behavior: 'smooth' });
  };

  if (pendingFertilizer) {
    return (
      <PurchaseConfirmDialog
        itemName={pendingFertilizer.name}
        image={pendingFertilizer.shopImage ?? pendingFertilizer.growthImages?.at(-1)}
        description={pendingFertilizer.accelerationMs ? `Прискорює ріст на ${formatGameDuration(pendingFertilizer.accelerationMs)}` : undefined}
        price={pendingFertilizer.price}
        currency={pendingFertilizer.priceCurrency ?? 'coins'}
        balance={pendingFertilizer.priceCurrency === 'rubies' ? (user?.rubies ?? 25) : (user?.coins ?? 0)}
        quantitySelection
        busy={purchasingItemId === pendingFertilizer.id}
        onConfirm={(quantity) => void confirmFertilizerPurchase(quantity)}
        onCancel={() => setPendingFertilizer(null)}
      />
    );
  }
  if (pendingPurchase) {
    const item = pendingPurchase;
    const image = item.shopImage ?? item.growthImages?.at(-1);
    const description = item.mechanic === 'expand_farm'
      ? 'Розширення ферми'
      : item.mechanic === 'accelerate_growth' && item.accelerationMs
        ? `Прискорює ріст на ${formatGameDuration(item.accelerationMs)}`
        : item.type === 'OTHER'
          ? item.mechanic === 'grass_style' ? 'Оформлення трави для ферми' : item.mechanic === 'background_style' ? 'Оформлення фону ферми' : undefined
          : item.yieldName ? `Виробляє: ${item.yieldName}` : undefined;
    return (
      <PurchaseConfirmDialog
        itemName={item.name}
        image={image}
        description={description}
        price={item.price}
        currency={item.priceCurrency ?? 'coins'}
        balance={item.priceCurrency === 'rubies' ? (user?.rubies ?? 25) : (user?.coins ?? 0)}
        busy={purchasingItemId === item.id}
        onConfirm={() => void handleBuy(item, true)}
        onCancel={() => setPendingPurchase(null)}
      />
    );
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div className="game-modal-window shop-modal-window" style={styles.glassWindow} onClick={(e) => e.stopPropagation()}>
        <div className="shared-modal-header game-modal-header modal-header-single-row" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleWrapper}>
              <img className="modal-brand-banner" src="/assets/ui/shop_banner.png" alt="Магазин" draggable={false} />
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
              <img className="shop-category-icon" src={category.icon} alt="" draggable={false} />
              {category.label}
            </button>
          ))}
          </div>
          <button className="shop-category-scroll" type="button" onClick={() => scrollCategories(1)} aria-label="Прокрутити категорії вправо"><ChevronRight size={21} /></button>
        </div>

        {activeCategory === 'BUILDING' && (
          <div className="shop-building-subcategories">
            {([
              ['FACTORIES', 'Фабрики'],
              ['PENS', 'Загони'],
            ] as const).map(([category, label]) => (
              <button
                key={category}
                type="button"
                className={`shop-building-subcategory${buildingSubcategory === category ? ' is-active' : ''}`}
                onClick={() => setBuildingSubcategory(category)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {activeCategory === 'OTHER' && (
          <div className="shop-building-subcategories">
            {([
              ['items', 'Розширення й добрива'],
              ['styles', 'Оформлення'],
            ] as const).map(([category, label]) => (
              <button
                key={category}
                type="button"
                className={`shop-building-subcategory${otherSubcategory === category ? ' is-active' : ''}`}
                onClick={() => setOtherSubcategory(category)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {activeCategory === 'WATER' && (
          <div className="shop-building-subcategories">
            {([
              ['all', 'Усе'],
              ['animals', 'Тварини'],
              ['plants', 'Рослини'],
              ['decor', 'Декор'],
            ] as const).map(([subcategory, label]) => (
              <button
                key={subcategory}
                type="button"
                className={`shop-building-subcategory${waterSubcategory === subcategory ? ' is-active' : ''}`}
                onClick={() => setWaterSubcategory(subcategory)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="shop-modal-grid modal-scrollbar-hidden" style={styles.gridContainer}>
          {filteredItems.map((item) => {
            const yieldImage = item.yieldImage
              ?? (item.yieldItem === 'flour' ? '/assets/buildings/fabrik/muka.png' : undefined);
            const factoryInput = item.factoryInputItemId ? items[item.factoryInputItemId] : undefined;
            const isBackgroundStyle = item.mechanic === 'background_style';
            const locked = (user?.level ?? 1) < (item.requiredLevel ?? 1);
            const balance = (item.priceCurrency ?? 'coins') === 'rubies' ? (user?.rubies ?? 25) : (user?.coins ?? 0);
            const canAfford = balance >= item.price;
            const onSale = Boolean(item.originalPrice && item.originalPrice > item.price);
            const badge = SHOP_BADGES.find((entry) => entry.id === item.shopBadge);
            return (
              <div key={item.id} className={`game-modal-card shop-modal-card${isBackgroundStyle ? ' is-background-style' : ''}${locked ? ' is-locked' : ''}${item.disabled ? ' is-hidden-item' : ''}`}>
              <div
                className="shop-modal-card-title"
                style={{ '--shop-title-size': `${getTitleFontSize(item.name)}px` } as React.CSSProperties}
                title={item.name}
                role="button"
                tabIndex={0}
                onClick={() => requestPurchase(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    requestPurchase(item);
                  }
                }}
              >{item.name}</div>
              <div
                className={`shop-modal-icon-box${isBackgroundStyle ? ' is-background-preview' : ''}`}
                role="button"
                tabIndex={0}
                onClick={() => requestPurchase(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    requestPurchase(item);
                  }
                }}
              >
                {item.shopImage || item.growthImages?.at(-1) ? (
                  <img
                    className={isBackgroundStyle ? 'shop-background-image' : 'shop-item-image'}
                    src={item.shopImage ?? item.growthImages?.at(-1)}
                    alt={item.name}
                    draggable={false}
                  />
                ) : (
                  <span className="shop-item-emoji">{item.shopIcon ?? item.yieldIcon ?? '🌳'}</span>
                )}
                {item.yieldItem && (
                  <div className="shop-yield-pill" title={`${item.yieldName ?? item.name}${typeof item.sellPrice === 'number' ? ` · +${item.sellPrice} монет за продаж` : ''}`}>
                    <span className="shop-yield-icon">
                      {yieldImage ? <img src={yieldImage} alt="" draggable={false} /> : <span>{item.yieldIcon ?? '📦'}</span>}
                    </span>
                    {typeof item.sellPrice === 'number' && (
                      <span className="shop-yield-price">+{item.sellPrice}<img src="/assets/ui/coin.png" alt="" draggable={false} /></span>
                    )}
                  </div>
                )}
                {factoryInput && (
                  <span
                    className="shop-factory-input-badge"
                    title={`Переробляє: ${factoryInput.yieldName ?? factoryInput.name}`}
                    aria-label={`Переробляє: ${factoryInput.yieldName ?? factoryInput.name}`}
                  >
                    {factoryInput.yieldImage
                      ? <img src={factoryInput.yieldImage} alt="" draggable={false} />
                      : <span>{factoryInput.yieldIcon ?? factoryInput.shopIcon ?? '📦'}</span>}
                  </span>
                )}
                {locked && <img className="shop-lock-icon" src="/assets/ui/shop/lock.png" alt="" draggable={false} />}
                {onSale && (
                  <span className="shop-old-price" title="Стара ціна">
                    <img src={item.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt="" draggable={false} />
                    <s>{item.originalPrice!.toLocaleString('uk-UA')}</s>
                  </span>
                )}
              </div>
              {badge && <img className="shop-badge-ribbon" src={badge.image} alt={badge.label} draggable={false} />}
              {user?.role === 'admin' && (
                <>
                  <button
                    type="button"
                    className="shop-admin-gear"
                    title="Позначка та знижка (тільки адмін)"
                    aria-label={`Позначка та знижка для ${item.name}`}
                    onClick={(event) => { event.stopPropagation(); if (promoEditId === item.id) setPromoEditId(null); else openPromoEditor(item); }}
                  >
                    <Settings size={13} strokeWidth={2.6} />
                  </button>
                  {promoEditId === item.id && (
                    <div className="shop-admin-popover" onClick={(event) => event.stopPropagation()}>
                      <div className="shop-admin-popover-title">Назва</div>
                      <input className="shop-admin-input" value={promoName} maxLength={80} onChange={(event) => setPromoName(event.target.value)} />
                      <label className="shop-admin-field"><span className="shop-admin-popover-title">Рівень для покупки</span>
                        <input className="shop-admin-input" type="number" min="1" max="999" step="1" value={promoRequiredLevel} onChange={(event) => setPromoRequiredLevel(event.target.value)} />
                      </label>
                      <div className="shop-admin-row">
                        <label className="shop-admin-field"><span className="shop-admin-popover-title">Початкова ціна</span>
                          <input className="shop-admin-input" type="number" min="0" value={promoBase} onChange={(event) => setPromoBase(event.target.value)} />
                        </label>
                        <label className="shop-admin-field"><span className="shop-admin-popover-title">Розмір</span>
                          <input className="shop-admin-input" type="number" min="0.1" max="5" step="0.1" value={promoScale} onChange={(event) => setPromoScale(event.target.value)} />
                        </label>
                      </div>
                      {(item.productionTimeMs || item.type !== 'OTHER') && (
                        <div className="shop-admin-row">
                          {item.productionTimeMs ? (
                            <label className="shop-admin-field"><span className="shop-admin-popover-title">Час (сек)</span>
                              <input className="shop-admin-input" type="number" min="1" value={promoTime} onChange={(event) => setPromoTime(event.target.value)} />
                            </label>
                          ) : null}
                          {item.type !== 'OTHER' && (
                            <label className="shop-admin-field"><span className="shop-admin-popover-title">Досвід (XP)</span>
                              <input className="shop-admin-input" type="number" min="0" value={promoXp} onChange={(event) => setPromoXp(event.target.value)} />
                            </label>
                          )}
                        </div>
                      )}
                      <div className="shop-admin-popover-title">Позначка</div>
                      <div className="shop-admin-chips">
                        {[{ id: '' as const, label: 'Без' }, ...SHOP_BADGES].map((entry) => (
                          <button
                            key={entry.id || 'none'}
                            type="button"
                            className={`shop-admin-chip${promoBadge === entry.id ? ' is-active' : ''}`}
                            onClick={() => setPromoBadge(entry.id)}
                          >{entry.label}</button>
                        ))}
                      </div>
                      <div className="shop-admin-popover-title">Знижка</div>
                      <div className="shop-admin-chips">
                        {[0, 10, 20, 30, 40, 50].map((percent) => (
                          <button key={percent} type="button" className="shop-admin-chip" onClick={() => applyDiscountPercent(percent)}>
                            {percent === 0 ? 'Без' : `-${percent}%`}
                          </button>
                        ))}
                      </div>
                      <label className="shop-admin-field"><span className="shop-admin-popover-title">Ціна зі знижкою (своя)</span>
                        <input className="shop-admin-input" type="number" min="1" placeholder="Без знижки" value={promoSale} onChange={(event) => setPromoSale(event.target.value)} />
                      </label>
                      <div className="shop-admin-popover-title">Показувати</div>
                      <div className="shop-admin-chips">
                        {([['all', 'Усім'], ['admin', 'Тільки адмін'], ['hidden', 'Сховано']] as const).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            className={`shop-admin-chip${promoVisibility === id ? ' is-active' : ''}`}
                            onClick={() => setPromoVisibility(id)}
                          >{label}</button>
                        ))}
                      </div>
                      <div className="shop-admin-popover-price">
                        {promoSale.trim() && Number(promoSale) > 0 && Number(promoSale) < Number(promoBase)
                          ? `${Number(promoBase).toLocaleString('uk-UA')} → ${Number(promoSale).toLocaleString('uk-UA')} (−${Math.round((1 - Number(promoSale) / Number(promoBase)) * 100)}%)`
                          : `Ціна: ${Number(promoBase || 0).toLocaleString('uk-UA')}`}
                      </div>
                      <div className="shop-admin-actions">
                        <button type="button" className="shop-admin-cancel" onClick={() => setPromoEditId(null)}>Скасувати</button>
                        <button type="button" className="shop-admin-save" disabled={badgeSavingId === item.id} onClick={() => void savePromo(item)}>
                          {badgeSavingId === item.id ? '…' : 'Зберегти'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className={`shop-modal-stats${isBackgroundStyle ? ' is-background-style' : ''}`}>
                <StatRow icon={<img src="/assets/ui/shop/level.png" alt="" draggable={false} />} label="Доступно з:" value={`${item.requiredLevel ?? 1} рівня`} accent="level" />
                {item.type === 'OTHER' ? (
                  <div className={`shop-stat-row${isBackgroundStyle ? ' is-description' : ''}`}>
                    <span className="shop-stat-label">{item.mechanic === 'accelerate_growth' ? 'Прискорює:' : 'Механіка:'}</span>
                    <span className="shop-stat-value">{item.mechanic === 'expand_farm' ? 'Розширення' : item.mechanic === 'accelerate_growth' && item.accelerationMs ? `на ${formatGameDuration(item.accelerationMs)}` : item.mechanic === 'grass_style' ? 'Змінює вигляд трави на фермі' : isBackgroundStyle ? 'День і ніч для фону ферми' : 'Спеціальна дія'}</span>
                  </div>
                ) : item.type !== 'BUILDING' && typeof item.productionTimeMs === 'number' && item.productionTimeMs > 0 && (
                  <StatRow icon={<img src="/assets/ui/shop/clock.png" alt="" draggable={false} />} label="Готовність:" value={formatGameDuration(item.productionTimeMs)} />
                )}
                {item.type !== 'OTHER' && <StatRow icon={<img src="/assets/ui/shop/xp.png" alt="" draggable={false} />} label="Досвід:" value={`+${item.plantingXp} XP`} accent="xp" />}
              </div>
              <button
                type="button"
                className={`shop-modal-buy-button${locked ? ' is-locked' : ''}${!locked && !canAfford ? ' is-unaffordable' : ''}${!locked && canAfford && onSale ? ' is-sale' : ''}`}
                onClick={() => void handleBuy(item, item.mechanic !== 'accelerate_growth')}
                disabled={locked || item.disabled || purchasingItemId === item.id}
                title={locked ? `Доступно з ${item.requiredLevel ?? 1} рівня` : !canAfford ? 'Не вистачає коштів' : undefined}
              >
                {purchasingItemId === item.id ? <span>Купуємо…</span> : locked ? (
                  <>
                    <img src="/assets/ui/shop/lock.png" alt="" className="shop-button-icon shop-button-lock" draggable={false} />
                    <span>{item.requiredLevel ?? 1} рівень</span>
                  </>
                ) : (
                  <>
                    <img src={item.priceCurrency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt="" className="shop-button-icon" draggable={false} />
                    <span className="shop-price-new">{item.price.toLocaleString('uk-UA')}</span>
                  </>
                )}
              </button>
              </div>
            );
          })}
          {loading && filteredItems.length === 0 && <p style={{color: 'white', gridColumn: '1 / -1', textAlign: 'center'}}>Завантаження каталогу...</p>}
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
  gridContainer: { overflowY: 'auto' },
};