import React, { useEffect, useRef, useState } from 'react';
import { Gift, Minus, Moon, PackageOpen, Plus, Sun } from 'lucide-react';

const TAB_ICONS = { harvest: 'skl1', farm: 'skl2', other: 'skl3', styles: 'skl4' } as const;
const SORT_OPTIONS = [['name', 'За назвою'], ['amount', 'За кількістю'], ['price', 'За ціною']] as const;
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
  const [activeCategory, setActiveCategory] = useState<'harvest' | 'farm' | 'other' | 'styles' | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [sellingItemId, setSellingItemId] = useState<string | null>(null);
  const [applyingGrassStyle, setApplyingGrassStyle] = useState<string | null>(null);
  const [applyingBackgroundStyle, setApplyingBackgroundStyle] = useState<string | null>(null);
  const [styleSection, setStyleSection] = useState<'grass' | 'background'>('grass');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'amount' | 'price'>('name');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [sellingSelected, setSellingSelected] = useState(false);
  const repeatTimeoutRef = useRef<number | null>(null);
  const repeatIntervalRef = useRef<number | null>(null);
  const user = useAuthStore((state) => state.user);
  const sellItem = useFarmStore((state) => state.sellItem);
  const sellFarmItem = useFarmStore((state) => state.sellFarmItem);
  const expandFarm = useFarmStore((state) => state.expandFarm);
  const grassStyle = useFarmStore((state) => state.grassStyle);
  const setGrassStyle = useFarmStore((state) => state.setGrassStyle);
  const backgroundStyle = useFarmStore((state) => state.backgroundStyle);
  const backgroundIsNight = useFarmStore((state) => state.backgroundIsNight);
  const setBackgroundStyle = useFarmStore((state) => state.setBackgroundStyle);
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
  const unlockedGrassStyles = user?.unlockedGrassStyles ?? ['classic'];
  const unlockedBackgroundStyles = user?.unlockedBackgroundStyles ?? ['classic'];
  const grassStyles: { id: string; name: string; image: string }[] = [
    { id: 'classic', name: 'Класична трава', image: '/assets/tiles/grass_tile.png' },
    ...Object.values(items)
      .filter((item) => item.mechanic === 'grass_style' && unlockedGrassStyles.includes(item.id))
      .map((item) => ({ id: item.id, name: item.name, image: item.grassTexture ?? item.shopImage ?? '/assets/tiles/grass_tile1.png' })),
  ];
  const backgroundStyles: { id: string; name: string; image: string }[] = [
    { id: 'classic', name: 'Класичний фон', image: '/assets/fonik1.png' },
    ...Object.values(items)
      .filter((item) => item.mechanic === 'background_style' && unlockedBackgroundStyles.includes(item.id))
      .map((item) => ({ id: item.id, name: item.name, image: item.backgroundImage ?? item.shopImage ?? '/assets/fonik1.png' })),
  ];
  const categoryCounts = {
    harvest: stockedItems.reduce((total, item) => total + (inventory[item.yieldItem!] ?? 0), 0),
    farm: stockedPlaceableItems.reduce((total, entry) => total + entry.amount, 0),
    other: stockedOtherItems.reduce((total, entry) => total + entry.amount, 0),
    styles: grassStyles.length + backgroundStyles.length,
  };
  const visibleCategory = activeCategory ?? (
    categoryCounts.other > 0 ? 'other' : categoryCounts.farm > 0 ? 'farm' : categoryCounts.harvest > 0 ? 'harvest' : 'styles'
  );

  const searchQuery = search.trim().toLowerCase();
  const harvestList = stockedItems
    .filter((item) => (item.yieldName ?? item.name).toLowerCase().includes(searchQuery))
    .sort((left, right) => {
      if (sortBy === 'amount') return (inventory[right.yieldItem!] ?? 0) - (inventory[left.yieldItem!] ?? 0);
      if (sortBy === 'price') return (right.sellPrice ?? 0) - (left.sellPrice ?? 0);
      return (left.yieldName ?? left.name).localeCompare(right.yieldName ?? right.name, 'uk');
    });
  const selectedItems = stockedItems.filter((item) => selectedIds[item.yieldItem!]);
  const selectedTotal = selectedItems.reduce((sum, item) => sum + (inventory[item.yieldItem!] ?? 0) * (item.sellPrice ?? 0), 0);

  const toggleSelected = (itemId: string) => setSelectedIds((current) => ({ ...current, [itemId]: !current[itemId] }));

  const stopAmountHold = () => {
    if (repeatTimeoutRef.current !== null) window.clearTimeout(repeatTimeoutRef.current);
    if (repeatIntervalRef.current !== null) window.clearInterval(repeatIntervalRef.current);
    repeatTimeoutRef.current = null;
    repeatIntervalRef.current = null;
  };

  const changeAmountBy = (itemId: string, delta: number, max: number) => {
    setAmounts((current) => ({
      ...current,
      [itemId]: Math.min(max, Math.max(1, Math.floor((current[itemId] ?? 1) + delta))),
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

  const sellSelected = async () => {
    if (!user || sellingSelected || sellingItemId || selectedItems.length === 0) return;
    setSellingSelected(true);
    for (const item of selectedItems) {
      await sellItem(user.id, item.yieldItem!, inventory[item.yieldItem!] ?? 0);
    }
    setSelectedIds({});
    setSellingSelected(false);
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

  const applyGrassStyle = async (styleId: string) => {
    if (!user || applyingGrassStyle) return;
    setApplyingGrassStyle(styleId);
    const success = await setGrassStyle(user.id, styleId);
    setApplyingGrassStyle(null);
    if (success) notifyGameMessage(styleId === 'classic' ? 'Повернуто класичний вигляд трави.' : 'Вигляд трави змінено для всієї ферми.');
  };

  const applyBackgroundStyle = async (styleId: string, isNight = backgroundIsNight) => {
    if (!user || applyingBackgroundStyle) return;
    setApplyingBackgroundStyle(styleId);
    const success = await setBackgroundStyle(user.id, styleId, isNight);
    setApplyingBackgroundStyle(null);
    if (success) {
      notifyGameMessage(styleId !== backgroundStyle
        ? 'Фон змінено для всієї ферми.'
        : isNight ? 'Увімкнено нічний режим.' : 'Увімкнено денний режим.');
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <section className="game-modal-window inventory-modal-window" style={styles.window} onClick={(event) => event.stopPropagation()}>
        <header className="shared-modal-header game-modal-header modal-header-single-row" style={styles.header}>
          <div className="modal-header-summary">
            <div style={styles.titleBlock}>
              <img className="modal-brand-banner" src="/assets/ui/inventory_banner.png" alt="Склад" draggable={false} />
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
            ['styles', 'Оформлення'],
          ] as const).map(([category, label]) => (
            <button
              key={category}
              type="button"
              className={`shop-modal-tab${visibleCategory === category ? ' is-active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              <img className="inventory-tab-icon" src={`/assets/ui/inventory/${TAB_ICONS[category]}.png`} alt="" draggable={false} />
              <span className="inventory-tab-label">{label}</span><span className="inventory-tab-count">{categoryCounts[category]}</span>
            </button>
          ))}
        </div>
        {stockedItems.length === 0 && stockedFarmItems.length === 0 && grassStyles.length === 0 ? (
          <div className="inventory-modal-empty" style={styles.empty}>Поки що склад порожній</div>
        ) : (
          <>
          {visibleCategory === 'harvest' && stockedItems.length > 0 && (
            <div className="inventory-toolbar">
              <label className="inventory-search">
                <img className="inventory-ui-icon" src="/assets/ui/inventory/skl6.png" alt="" draggable={false} />
                <input type="text" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук..." />
                {search && <button type="button" onClick={() => setSearch('')} aria-label="Очистити пошук">✕</button>}
              </label>
              <div className="inventory-sort-wrap">
                <button type="button" className="inventory-sort" onClick={() => setSortOpen((open) => !open)} aria-haspopup="listbox" aria-expanded={sortOpen}>
                  <img className="inventory-ui-icon" src="/assets/ui/inventory/skl5.png" alt="" draggable={false} />
                  <span className="inventory-sort-value">{SORT_OPTIONS.find(([value]) => value === sortBy)?.[1]}</span>
                  <span className={`inventory-sort-arrow${sortOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {sortOpen && (
                  <>
                    <div className="inventory-sort-backdrop" onClick={() => setSortOpen(false)} />
                    <ul className="inventory-sort-menu" role="listbox">
                      {SORT_OPTIONS.map(([value, text]) => (
                        <li key={value}>
                          <button type="button" role="option" aria-selected={sortBy === value} className={sortBy === value ? 'is-active' : ''} onClick={() => { setSortBy(value); setSortOpen(false); }}>
                            {text}{sortBy === value && <span aria-hidden="true">✓</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
          <div className="modal-scrollbar-hidden" style={styles.grid}>
              {visibleCategory === 'harvest' && harvestList.map((item) => {
                const itemId = item.yieldItem!;
                const productImage = item.yieldImage
                  ?? (itemId === 'flour' ? '/assets/buildings/fabrik/muka.png' : undefined);
                const stockAmount = inventory[itemId] ?? 0;
                const amount = Math.min(amounts[itemId] ?? 1, stockAmount);
                const totalCoins = amount * (item.sellPrice ?? 0);
                const isSelling = sellingItemId === itemId;
                const isSelected = Boolean(selectedIds[itemId]);
                const name = item.yieldName ?? item.name;

                return (
                  <article
                    key={itemId}
                    className={`game-modal-card inventory-card${isSelected ? ' is-selected' : ''}`}
                    onClick={() => toggleSelected(itemId)}
                    role="button"
                    aria-pressed={isSelected}
                  >
                    <h3 className="inventory-card-title" style={{ fontSize: `${getTitleFontSize(name)}px` }} title={name}>{name}</h3>
                    <span className="inventory-stock-badge" title="Запас">{stockAmount}</span>
                    {isSelected && <span className="inventory-check" aria-hidden="true">✓</span>}
                    <div className="inventory-image-box">
                      {productImage ? (
                        <img src={productImage} alt="" className="inventory-product-image" draggable={false} />
                      ) : (
                        <span className="inventory-product-emoji">{item.yieldIcon ?? item.shopIcon ?? '📦'}</span>
                      )}
                    </div>
                    <div className="inventory-price-line"><span className="inventory-coin-label"><img className="inventory-coin" src="/assets/ui/coin.png" alt="" draggable={false} />Ціна / шт.</span><strong>{item.sellPrice ?? 0}</strong></div>
                    <div className="inventory-stepper" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="inventory-step-button"
                        onPointerDown={startAmountHold(itemId, -1, stockAmount)}
                        onPointerUp={stopAmountHold}
                        onPointerCancel={stopAmountHold}
                        onLostPointerCapture={stopAmountHold}
                        onContextMenu={(event) => event.preventDefault()}
                        disabled={amount <= 1 || isSelling}
                        aria-label={`Зменшити кількість ${name}`}
                      >
                        <Minus size={14} />
                      </button>
                      <output className="inventory-step-value">{amount}</output>
                      <button
                        type="button"
                        className="inventory-step-button"
                        onPointerDown={startAmountHold(itemId, 1, stockAmount)}
                        onPointerUp={stopAmountHold}
                        onPointerCancel={stopAmountHold}
                        onLostPointerCapture={stopAmountHold}
                        onContextMenu={(event) => event.preventDefault()}
                        disabled={amount >= stockAmount || isSelling}
                        aria-label={`Збільшити кількість ${name}`}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="inventory-sell-button inventory-card-sell"
                      onClick={(event) => { event.stopPropagation(); void handleSell(itemId, amount); }}
                      disabled={!item.sellPrice || amount <= 0 || isSelling}
                    >
                      <img className="inventory-btn-icon" src="/assets/ui/inventory/skl7.png" alt="" draggable={false} />
                      <span className="inventory-sell-copy"><b>{isSelling ? '…' : 'Продати'}</b><small>+{totalCoins.toLocaleString('uk-UA')} <img className="inventory-coin" src="/assets/ui/coin.png" alt="" draggable={false} /></small></span>
                    </button>
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
                      {item.giftOnly && <span className="inventory-gift-badge"><Gift size={12} />Подарунок</span>}
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}><span>Запас</span><strong>{stockAmount}</strong></div>
                    {!item.giftOnly && <div className="inventory-stock-line" style={styles.stockLine}><span>Продаж / шт.</span><strong className="currency-inline inventory-unit-price" style={styles.unitPrice}>{refund}<img src={currencyImage} alt="" draggable={false} /></strong></div>}
                    <button
                      type="button"
                      className="inventory-sell-button"
                      style={styles.sellButton}
                      onClick={() => void handleUseFarmItem(item.id, item.mechanic)}
                      disabled={isBusy}
                    >
                      {item.mechanic === 'expand_farm' ? 'Застосувати' : item.mechanic === 'accelerate_growth' ? 'Вибрати ціль' : 'Розмістити'}
                    </button>
                    {!item.giftOnly && (
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
                    )}
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
                      {item.giftOnly && <span className="inventory-gift-badge"><Gift size={12} />Подарунок</span>}
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
              {visibleCategory === 'styles' && (
                <div className="shop-building-subcategories inventory-style-subcategories">
                  <button type="button" className={`shop-building-subcategory${styleSection === 'grass' ? ' is-active' : ''}`} onClick={() => setStyleSection('grass')}>Тайли трави</button>
                  <button type="button" className={`shop-building-subcategory${styleSection === 'background' ? ' is-active' : ''}`} onClick={() => setStyleSection('background')}>Фони</button>
                </div>
              )}
              {visibleCategory === 'styles' && styleSection === 'grass' && grassStyles.map((style) => {
                const isActive = (grassStyle ?? 'classic') === style.id;
                return (
                  <article key={style.id} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(style.name)}px` }}>{style.name}</h3>
                    <div className="inventory-image-box" style={styles.imageBox}>
                      <img src={style.image} alt="" style={styles.farmItemImage} draggable={false} />
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}>
                      <span>{isActive ? 'Застосовано на фермі' : 'Відкрито'}</span>
                      <strong>✓</strong>
                    </div>
                    <button
                      type="button"
                      className="inventory-sell-button"
                      style={styles.sellButton}
                      onClick={() => void applyGrassStyle(style.id)}
                      disabled={isActive || applyingGrassStyle !== null}
                    >
                      {applyingGrassStyle === style.id ? 'Застосовуємо…' : isActive ? 'Активний вигляд' : 'Застосувати'}
                    </button>
                  </article>
                );
              })}
              {visibleCategory === 'styles' && styleSection === 'background' && backgroundStyles.map((style) => {
                const isActive = backgroundStyle === style.id;
                return (
                  <article key={style.id} className="game-modal-card" style={styles.card}>
                    <h3 className="inventory-card-title" style={{ ...styles.cardTitle, fontSize: `${getTitleFontSize(style.name)}px` }}>{style.name}</h3>
                    <div className="inventory-image-box" style={{ ...styles.imageBox, position: 'relative' }}>
                      <img src={style.image} alt="" style={styles.farmItemImage} draggable={false} />
                      <button
                        type="button"
                        className="inventory-background-mode-toggle"
                        aria-label={backgroundIsNight ? 'Перемкнути на день' : 'Перемкнути на ніч'}
                        title={backgroundIsNight ? 'День' : 'Ніч'}
                        onClick={() => void applyBackgroundStyle(style.id, !backgroundIsNight)}
                        disabled={applyingBackgroundStyle !== null}
                      >
                        {backgroundIsNight ? <Sun size={16} /> : <Moon size={16} />}
                      </button>
                    </div>
                    <div className="inventory-stock-line" style={styles.stockLine}>
                      <span>{isActive ? `Активний · ${backgroundIsNight ? 'Ніч' : 'День'}` : 'Відкрито'}</span>
                      <strong>{isActive ? (backgroundIsNight ? <Moon size={15} /> : <Sun size={15} />) : '✓'}</strong>
                    </div>
                    <button
                      type="button"
                      className="inventory-sell-button"
                      style={styles.sellButton}
                      onClick={() => void applyBackgroundStyle(style.id)}
                      disabled={isActive || applyingBackgroundStyle !== null}
                    >
                      {applyingBackgroundStyle === style.id ? 'Застосовуємо…' : isActive ? 'Активний фон' : 'Застосувати'}
                    </button>
                  </article>
                );
              })}
              {((visibleCategory === 'harvest' && harvestList.length === 0) ||
                (visibleCategory === 'farm' && stockedPlaceableItems.length === 0) ||
                (visibleCategory === 'other' && stockedOtherItems.length === 0) ||
                (visibleCategory === 'styles' && (styleSection === 'grass' ? grassStyles.length === 0 : backgroundStyles.length === 0))) && (
                <div className="inventory-category-empty">
                  <span className="inventory-category-empty-icon"><PackageOpen size={30} strokeWidth={1.8} /></span>
                  <strong>{visibleCategory === 'harvest' && stockedItems.length > 0 ? 'Нічого не знайдено' : 'У цій категорії поки що порожньо'}</strong>
                  <span>{visibleCategory === 'harvest' && stockedItems.length > 0 ? 'Спробуй інший запит' : 'Тут з’являться ваші предмети'}</span>
                </div>
              )}
          </div>
          {visibleCategory === 'harvest' && stockedItems.length > 0 && (
            <div className="inventory-footer">
              <button type="button" className="inventory-sell-all-bar" onClick={() => void sellSelected()} disabled={selectedItems.length === 0 || sellingSelected}>
                <img className="inventory-btn-icon" src="/assets/ui/inventory/skl7.png" alt="" draggable={false} />
                <span className="inventory-sell-copy"><b>{sellingSelected ? 'Продаємо…' : 'Продати все'}</b><small>+{selectedTotal.toLocaleString('uk-UA')} <img className="inventory-coin" src="/assets/ui/coin.png" alt="" draggable={false} /></small></span>
              </button>
              <div className="inventory-selected-info">
                <img className="inventory-btn-icon" src="/assets/ui/inventory/skl1.png" alt="" draggable={false} />
                <span className="inventory-sell-copy"><b>Вибрано: {selectedItems.length}</b><small>На суму: {selectedTotal.toLocaleString('uk-UA')} <img className="inventory-coin" src="/assets/ui/coin.png" alt="" draggable={false} /></small></span>
              </div>
            </div>
          )}
          </>
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
    overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px',
    borderBottom: '1px solid rgba(132, 83, 39, 0.22)',
  },
  titleBlock: { display: 'flex', alignItems: 'center', gap: 8 },
  headerIcon: { fontSize: 22 },
  title: { margin: 0, color: '#1f2e42', fontFamily: 'Georgia, serif', fontSize: 19, fontWeight: 900 },
  resources: { display: 'flex', alignItems: 'center', gap: 7 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 12, padding: 16, overflowY: 'auto', flex: '1 1 auto', minHeight: 0, alignContent: 'start' },
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
