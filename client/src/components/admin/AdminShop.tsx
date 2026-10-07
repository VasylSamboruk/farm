import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowDown, ArrowUp, PackagePlus, PackageSearch, RotateCcw, Save, ShoppingBasket, Trash2 } from 'lucide-react';
import { adminApi, type AdminCatalogItem, type AdminGiftShopItem } from '../../api/admin.api';
import { AdminImageUrlInput } from './AdminImageUrlInput';
import { AdminDurationInput } from './AdminDurationInput';
import { useAdminToast } from './adminToast';
import { resolveImageUrl } from '../../game/assetUrls';
import { durationPartsToMilliseconds, millisecondsToDurationParts, type DurationParts } from '../../game/durationInput';

type AdminShopCategory = 'ALL' | AdminCatalogItem['type'] | 'DECOR' | 'HOUSING_BUILDING' | 'GIFTS';

const categories: { type: AdminShopCategory; label: string }[] = [
  { type: 'ALL', label: 'Усі товари' },
  { type: 'TREE', label: 'Дерева' },
  { type: 'CROP', label: 'Рослини' },
  { type: 'ANIMAL', label: 'Тварини' },
  { type: 'DECOR', label: 'Декор' },
  { type: 'HOUSING_BUILDING', label: 'Будівлі' },
  { type: 'OTHER', label: 'Інше' },
  { type: 'GIFTS', label: 'Подарунки' },
];

interface ItemDraft {
  name: string;
  price: string;
  priceCurrency: 'coins' | 'rubies';
  sellPrice: string;
  plantingXp: string;
  requiredLevel: string;
  sortOrder: string;
  productionTime: DurationParts;
  mechanic: 'expand_farm' | 'accelerate_growth' | 'none';
  acceleration: DurationParts;
  yieldItem: string;
  yieldName: string;
  yieldIcon: string;
  yieldAmount: string;
  placementSurface: 'grass' | 'soil';
  flipX: boolean;
  canFlip: boolean;
  footprintWidth: string;
  footprintHeight: string;
  largeFootprintWidth: string;
  largeFootprintHeight: string;
  access: 'all' | 'admin' | 'gift';
  shopImage: string;
  shopIcon: string;
  yieldImage: string;
  spriteScale: string;
  growthImages: string[];
  housingEnabled: boolean;
  housingCapacity: string;
  housingAnimalTypes: string[];
}

const createDraft = (item: AdminCatalogItem): ItemDraft => {
  const durationParts = millisecondsToDurationParts(item.productionTimeMs);
  return {
  name: item.name,
  price: String(item.price),
  priceCurrency: item.priceCurrency ?? 'coins',
  sellPrice: String(item.sellPrice ?? ''),
  plantingXp: String(item.plantingXp ?? 0),
  requiredLevel: String(item.requiredLevel ?? 1),
  sortOrder: String(item.sortOrder ?? 1),
  productionTime: durationParts,
  mechanic: item.mechanic ?? 'none',
  acceleration: millisecondsToDurationParts(item.accelerationMs),
  yieldItem: item.yieldItem ?? '',
  yieldName: item.yieldName ?? '',
  yieldIcon: item.yieldIcon ?? '',
  yieldAmount: String(item.yieldAmount ?? ''),
  placementSurface: item.placementSurface ?? 'grass',
  flipX: item.flipX ?? false,
  canFlip: item.canFlip ?? true,
  footprintWidth: String(item.footprint?.width ?? 1),
  footprintHeight: String(item.footprint?.height ?? 1),
  largeFootprintWidth: String(item.largeFootprint?.width ?? ''),
  largeFootprintHeight: String(item.largeFootprint?.height ?? ''),
  access: item.giftOnly ? 'gift' : item.access ?? 'all',
  shopImage: item.shopImage ?? '',
  shopIcon: item.shopIcon ?? '',
  yieldImage: item.yieldImage ?? '',
  spriteScale: String(item.spriteScale ?? 1),
  growthImages: [...(item.growthImages ?? [])],
  housingEnabled: Boolean(item.housing),
  housingCapacity: String(item.housing?.capacity ?? 40),
  housingAnimalTypes: [...(item.housing?.animalTypes ?? [])],
  };
};

const isImageSource = (source: string) => {
  if (!source) return true;
  if (/^\/?(?:assets\/)?[A-Za-z0-9_./-]+$/.test(source) && !source.includes('..')) return true;
  try {
    return new URL(source).protocol === 'https:';
  } catch {
    return false;
  }
};

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося виконати запит.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';

interface AdminShopProps {
  onAddItem: () => void;
}

export const AdminShop: React.FC<AdminShopProps> = ({ onAddItem }) => {
  const showToast = useAdminToast();
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [giftSettings, setGiftSettings] = useState<Record<string, AdminGiftShopItem>>({});
  const [assetBaseUrl, setAssetBaseUrl] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({});
  const [category, setCategory] = useState<AdminShopCategory>('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [confirmPermanentDeleteId, setConfirmPermanentDeleteId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshCatalog = async (savedItemId: string) => {
    const [items, giftItems] = await Promise.all([adminApi.getCatalog(), adminApi.getGiftShop()]);
    setCatalog(items);
    setGiftSettings(Object.fromEntries(giftItems.map((item) => [item.itemId, item])));
    setDrafts((current) => Object.fromEntries(items.map((item) => [
      item.id,
      item.id === savedItemId ? createDraft(item) : current[item.id] ?? createDraft(item),
    ])));
  };

  useEffect(() => {
    let active = true;
    void Promise.all([adminApi.getCatalog(), adminApi.getMediaSettings(), adminApi.getGiftShop()])
      .then(([items, mediaSettings, giftItems]) => {
        if (!active) return;
        setAssetBaseUrl(mediaSettings.assetBaseUrl);
        setCatalog(items);
        setGiftSettings(Object.fromEntries(giftItems.map((item) => [item.itemId, item])));
        setDrafts(Object.fromEntries(items.map((item) => [item.id, createDraft(item)])));
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        const message = getErrorMessage(loadError);
        setError(message);
        showToast('error', message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showToast]);

  const updateDraft = (itemId: string, changes: Partial<ItemDraft>) => {
    setDrafts((current) => ({ ...current, [itemId]: { ...current[itemId], ...changes } }));
  };

  const updateStage = (itemId: string, index: number, source: string) => {
    const stages = [...(drafts[itemId]?.growthImages ?? [])];
    stages[index] = source;
    updateDraft(itemId, { growthImages: stages });
  };

  const moveStage = (itemId: string, index: number, direction: -1 | 1) => {
    const stages = [...(drafts[itemId]?.growthImages ?? [])];
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    [stages[index], stages[target]] = [stages[target], stages[index]];
    updateDraft(itemId, { growthImages: stages });
  };

  const saveItem = async (item: AdminCatalogItem) => {
    const draft = drafts[item.id];
    if (!draft) return;
    const price = Number(draft.price);
    const sellPrice = draft.sellPrice.trim() ? Number(draft.sellPrice) : null;
    const requiredLevel = Number(draft.requiredLevel);
    const sortOrder = Number(draft.sortOrder);
    const plantingXp = Number(draft.plantingXp);
    const yieldAmount = draft.yieldAmount.trim() ? Number(draft.yieldAmount) : 0;
    const productionTimeMs = durationPartsToMilliseconds(draft.productionTime);
    const accelerationMs = durationPartsToMilliseconds(draft.acceleration);
    const footprintWidth = Number(draft.footprintWidth);
    const footprintHeight = Number(draft.footprintHeight);
    const largeWidth = draft.largeFootprintWidth.trim() ? Number(draft.largeFootprintWidth) : null;
    const largeHeight = draft.largeFootprintHeight.trim() ? Number(draft.largeFootprintHeight) : null;
    const spriteScale = Number(draft.spriteScale);
    const housingCapacity = Number(draft.housingCapacity);
    const isGiftItem = draft.access === 'gift';
    const giftSetting = giftSettings[item.id];
    const giftPrice = giftSetting?.price ?? item.price;
    const giftPriceCurrency = giftSetting?.priceCurrency ?? item.priceCurrency ?? 'coins';
    const giftEnabled = giftSetting?.enabled ?? true;
    const validOptionalFootprint = (value: number | null) => value === null || (Number.isInteger(value) && value >= 1 && value <= 8);

    if (!draft.name.trim() || !Number.isSafeInteger(price) || price < 0 ||
      (sellPrice !== null && (!Number.isSafeInteger(sellPrice) || sellPrice < 0)) ||
      !Number.isSafeInteger(requiredLevel) || requiredLevel < 1 || requiredLevel > 999 ||
      !Number.isSafeInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999 ||
      !Number.isSafeInteger(plantingXp) || plantingXp < 0 || !Number.isSafeInteger(yieldAmount) || yieldAmount < 0 ||
      (productionTimeMs !== null && (!Number.isSafeInteger(productionTimeMs) || productionTimeMs < 1000)) ||
      !Number.isInteger(footprintWidth) || footprintWidth < 1 || footprintWidth > 2 ||
      !Number.isInteger(footprintHeight) || footprintHeight < 1 || footprintHeight > 2 ||
      !validOptionalFootprint(largeWidth) || !validOptionalFootprint(largeHeight) ||
      ((largeWidth === null) !== (largeHeight === null)) ||
      !Number.isFinite(spriteScale) || spriteScale < 0.1 || spriteScale > 5 ||
      (draft.housingEnabled && (!Number.isSafeInteger(housingCapacity) || housingCapacity < 1 || housingCapacity > 1000 ||
        draft.housingAnimalTypes.length === 0 ||
        draft.housingAnimalTypes.some((animalId) => !catalog.some((entry) => entry.id === animalId && entry.type === 'ANIMAL')))) ||
      draft.growthImages.length > 12 || draft.growthImages.some((source) => !source.trim() || !isImageSource(source.trim())) ||
      !isImageSource(draft.shopImage.trim()) || !isImageSource(draft.yieldImage.trim()) ||
      (isGiftItem && (!Number.isSafeInteger(giftPrice) || giftPrice < 0)) ||
      (isGiftItem && item.type === 'OTHER') ||
      (item.type === 'OTHER' && draft.mechanic === 'accelerate_growth' &&
        (!Number.isSafeInteger(accelerationMs) || (accelerationMs ?? 0) < 1000 || (accelerationMs ?? 0) > 2_592_000_000)) ||
      (item.type === 'ANIMAL' && ((!draft.growthImages[0] && !draft.shopImage.trim()) || !draft.yieldImage.trim()))) {
      setError('Перевір назву, ціни, рівень, позицію, час росту й розміри предмета.');
      showToast('error', item.type === 'ANIMAL'
        ? 'Для тварини обов’язково потрібні її зображення та окреме зображення продукції.'
        : 'Не вдалося зберегти товар: перевір поля та URL зображень.');
      return;
    }

    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      const updated = await adminApi.updateConfig(item.id, {
        name: draft.name.trim(), price, sellPrice, priceCurrency: draft.priceCurrency,
        plantingXp, requiredLevel, sortOrder, productionTimeMs,
        yieldItem: draft.yieldItem.trim(), yieldName: draft.yieldName.trim(), yieldIcon: draft.yieldIcon.trim(), yieldAmount,
        placementSurface: draft.placementSurface, flipX: draft.flipX, canFlip: draft.canFlip,
        spriteScale,
        shopImage: draft.shopImage.trim() || null,
        shopIcon: draft.shopIcon.trim(),
        yieldImage: draft.yieldImage.trim() || null,
        growthImages: draft.growthImages.map((source) => source.trim()),
        footprint: { width: footprintWidth, height: footprintHeight },
        largeFootprint: largeWidth === null || largeHeight === null ? null : { width: largeWidth, height: largeHeight },
        housing: draft.housingEnabled ? { capacity: housingCapacity, animalTypes: draft.housingAnimalTypes } : null,
        access: draft.access === 'gift' ? 'all' : draft.access,
        giftOnly: draft.access === 'gift',
        ...(item.type === 'OTHER' ? {
          mechanic: draft.mechanic === 'none' ? null : draft.mechanic,
          accelerationMs: draft.mechanic === 'accelerate_growth' ? accelerationMs : null,
        } : {}),
      });
      if (isGiftItem) {
        const savedGift = await adminApi.updateGiftShopItem(item.id, {
          price: giftPrice,
          priceCurrency: giftPriceCurrency,
          enabled: giftEnabled,
        });
        setGiftSettings((current) => ({ ...current, [item.id]: savedGift }));
      }
      await refreshCatalog(item.id);
      setNotice(`Зміни для «${updated.name}» збережено.`);
      showToast('success', `Зміни для «${updated.name}» збережено.`);
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setBusyId(null);
    }
  };

  const archiveItem = async (item: AdminCatalogItem) => {
    const busyKey = `${item.id}:archive`;
    setBusyId(busyKey);
    setError('');
    try {
      await adminApi.archiveItem(item.id);
      await refreshCatalog(item.id);
      setConfirmArchiveId(null);
      setNotice(`«${item.name}» приховано з магазину. Його можна відновити.`);
      showToast('success', `«${item.name}» прибрано з магазину.`);
    } catch (archiveError) {
      const message = getErrorMessage(archiveError);
      setError(message);
      showToast('error', message);
    } finally {
      setBusyId(null);
    }
  };

  const restoreItem = async (item: AdminCatalogItem) => {
    setBusyId(`${item.id}:restore`);
    setError('');
    try {
      await adminApi.updateConfig(item.id, { disabled: false });
      await refreshCatalog(item.id);
      setNotice(`«${item.name}» повернуто в магазин.`);
      showToast('success', `«${item.name}» відновлено.`);
    } catch (restoreError) {
      const message = getErrorMessage(restoreError);
      setError(message);
      showToast('error', message);
    } finally {
      setBusyId(null);
    }
  };

  const permanentlyDeleteItem = async (item: AdminCatalogItem) => {
    setBusyId(`${item.id}:permanent`);
    setError('');
    try {
      await adminApi.permanentlyDeleteItem(item.id);
      await refreshCatalog(item.id);
      setConfirmPermanentDeleteId(null);
      setNotice(`«${item.name}» остаточно видалено з магазину та ферм.`);
      showToast('success', `«${item.name}» видалено з магазину й усіх ферм.`);
    } catch (deleteError) {
      const message = getErrorMessage(deleteError);
      setError(message);
      showToast('error', message);
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = catalog.filter((item) =>
    category === 'GIFTS' ? Boolean(item.giftOnly)
      : category === 'ALL' ? true
      : item.giftOnly ? false
      : category === 'DECOR' ? item.type === 'BUILDING' && !item.housing
        : category === 'HOUSING_BUILDING' ? item.type === 'BUILDING' && Boolean(item.housing)
          : item.type === category
  )
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const getCategoryCount = (categoryType: AdminShopCategory) => categoryType === 'ALL' ? catalog.length
    : categoryType === 'GIFTS' ? catalog.filter((item) => item.giftOnly).length
      : categoryType === 'DECOR' ? catalog.filter((item) => !item.giftOnly && item.type === 'BUILDING' && !item.housing).length
        : categoryType === 'HOUSING_BUILDING' ? catalog.filter((item) => !item.giftOnly && item.type === 'BUILDING' && item.housing).length
          : catalog.filter((item) => !item.giftOnly && item.type === categoryType).length;

  return (
    <section className="admin-shop-page" aria-labelledby="admin-shop-title">
      <header className="admin-shop-heading">
        <div><span className="admin-eyebrow">КАТАЛОГ ГРИ</span><h1 id="admin-shop-title">Магазин</h1><p>Налаштовуй товари, доступ і подарунковий асортимент</p></div>
        <div className="admin-shop-heading-actions"><button className="admin-create-link" type="button" onClick={onAddItem}><PackagePlus size={16} />Додати товар</button><div className="admin-shop-total"><ShoppingBasket size={18} /><strong>{catalog.length}</strong><span>товарів</span></div></div>
      </header>
      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {notice && <p className="admin-alert is-success" role="status">{notice}</p>}
      <nav className="admin-category-tabs" aria-label="Категорії магазину">
        {categories.map((entry) => (
          <button key={entry.type} className={category === entry.type ? 'is-active' : ''} type="button" onClick={() => setCategory(entry.type)}>
            {entry.label}<span>{getCategoryCount(entry.type)}</span>
          </button>
        ))}
      </nav>
      {loading ? <div className="admin-state"><PackageSearch size={24} /><span>Завантажуємо каталог…</span></div> : visibleItems.length === 0 ? (
        <div className="admin-state"><PackageSearch size={24} /><span>У цій категорії поки немає товарів.</span></div>
      ) : (
        <div className="admin-product-grid">
          {visibleItems.map((item) => {
            const draft = drafts[item.id] ?? createDraft(item);
            const giftSetting = giftSettings[item.id];
            const isGiftItem = draft.access === 'gift';
            return (
              <article className={`admin-product${item.disabled ? ' is-disabled' : ''}`} key={item.id}>
                <header className="admin-product-header">
                  <div className="admin-product-image">{item.shopImage ? <img src={item.shopImage} alt="" /> : <span>{item.shopIcon ?? item.yieldIcon ?? '🌱'}</span>}</div>
                  <div className="admin-product-title"><span>{item.type} · {item.id}{item.disabled ? ' · ПРИХОВАНО' : ''}</span><strong>{item.name}</strong></div>
                </header>
                <div className="admin-product-fields">
                  {item.type === 'OTHER' && <>
                    <label>Механіка<select value={draft.mechanic} onChange={(event) => updateDraft(item.id, { mechanic: event.target.value as ItemDraft['mechanic'] })}>
                      <option value="none">Без активної механіки</option>
                      <option value="expand_farm">Розширення ферми вперед</option>
                      <option value="accelerate_growth">Добриво — прискорення таймера</option>
                    </select></label>
                    {draft.mechanic === 'accelerate_growth' && <div className="admin-duration-form-field admin-product-duration"><span>Прискорення часу</span><AdminDurationInput label={`Прискорення добрива для ${item.name}`} value={draft.acceleration} onChange={(acceleration) => updateDraft(item.id, { acceleration })} /></div>}
                  </>}
                  <label>Назва<input value={draft.name} maxLength={120} onChange={(event) => updateDraft(item.id, { name: event.target.value })} /></label>
                  {!isGiftItem ? <>
                    <label>Ціна покупки<input type="number" min="0" step="1" value={draft.price} onChange={(event) => updateDraft(item.id, { price: event.target.value })} /></label>
                    <label>Валюта<select value={draft.priceCurrency} onChange={(event) => updateDraft(item.id, { priceCurrency: event.target.value as ItemDraft['priceCurrency'] })}><option value="coins">Монети</option><option value="rubies">Рубіни</option></select></label>
                    <label>Ціна продажу<input type="number" min="0" step="1" value={draft.sellPrice} placeholder="Не продається" onChange={(event) => updateDraft(item.id, { sellPrice: event.target.value })} /></label>
                  </> : <>
                    <label>Ціна подарунка<input type="number" min="0" step="1" value={giftSetting?.price ?? item.price} onChange={(event) => setGiftSettings((current) => ({ ...current, [item.id]: { itemId: item.id, name: item.name, type: item.type, image: item.shopImage ?? '', icon: item.shopIcon ?? '', price: Number(event.target.value), priceCurrency: current[item.id]?.priceCurrency ?? item.priceCurrency ?? 'coins', enabled: current[item.id]?.enabled ?? true } }))} /></label>
                    <label>Валюта подарунка<select value={giftSetting?.priceCurrency ?? item.priceCurrency ?? 'coins'} onChange={(event) => setGiftSettings((current) => ({ ...current, [item.id]: { itemId: item.id, name: item.name, type: item.type, image: item.shopImage ?? '', icon: item.shopIcon ?? '', price: current[item.id]?.price ?? item.price, priceCurrency: event.target.value as AdminGiftShopItem['priceCurrency'], enabled: current[item.id]?.enabled ?? true } }))}><option value="coins">Монети</option><option value="rubies">Рубіни</option></select></label>
                    <label className="admin-check-field"><input type="checkbox" checked={giftSetting?.enabled ?? true} onChange={(event) => setGiftSettings((current) => ({ ...current, [item.id]: { itemId: item.id, name: item.name, type: item.type, image: item.shopImage ?? '', icon: item.shopIcon ?? '', price: current[item.id]?.price ?? item.price, priceCurrency: current[item.id]?.priceCurrency ?? item.priceCurrency ?? 'coins', enabled: event.target.checked } }))} />У подарунковому магазині</label>
                  </>}
                  <label>Мінімальний рівень<input type="number" min="1" max="999" value={draft.requiredLevel} onChange={(event) => updateDraft(item.id, { requiredLevel: event.target.value })} /></label>
                  <label>Позиція у списку<input type="number" min="1" max="9999" value={draft.sortOrder} onChange={(event) => updateDraft(item.id, { sortOrder: event.target.value })} /></label>
                </div>
                <details className="admin-product-advanced">
                  <summary>Додаткові параметри</summary>
                  <div className="admin-product-fields">
                    <label>Досвід за посадку<input type="number" min="0" value={draft.plantingXp} onChange={(event) => updateDraft(item.id, { plantingXp: event.target.value })} /></label>
                    <div className="admin-duration-form-field admin-product-duration"><span>Час до врожаю</span><AdminDurationInput label={`Час до врожаю для ${item.name}`} value={draft.productionTime} onChange={(productionTime) => updateDraft(item.id, { productionTime })} /></div>
                    {item.type === 'ANIMAL' && <p className="admin-product-fields-note">Зображення тварини використовується на фермі та в курнику; іконка й картинка врожаю — для готової продукції.</p>}
                    <label>Кількість урожаю<input type="number" min="0" value={draft.yieldAmount} onChange={(event) => updateDraft(item.id, { yieldAmount: event.target.value })} /></label>
                    <label>ID урожаю<input value={draft.yieldItem} onChange={(event) => updateDraft(item.id, { yieldItem: event.target.value })} /></label>
                    <label>Назва урожаю<input value={draft.yieldName} onChange={(event) => updateDraft(item.id, { yieldName: event.target.value })} /></label>
                    <label>{item.type === 'ANIMAL' ? 'Іконка продукції' : 'Іконка урожаю'}<input value={draft.yieldIcon} maxLength={16} onChange={(event) => updateDraft(item.id, { yieldIcon: event.target.value })} placeholder="🍎" /></label>
                    <label>Доступ<select value={draft.access} onChange={(event) => updateDraft(item.id, { access: event.target.value as ItemDraft['access'] })}><option value="all">Усім гравцям</option><option value="admin">Лише адміністратору</option>{item.type !== 'OTHER' && <option value="gift">Лише як подарунок</option>}</select></label>
                    <label>Поверхня<select value={draft.placementSurface} onChange={(event) => updateDraft(item.id, { placementSurface: event.target.value as ItemDraft['placementSurface'] })}><option value="grass">Трава</option><option value="soil">Грядка</option></select></label>
                    <div className="admin-product-footprint-editor">
                      <div className="admin-product-footprint-heading">
                        <strong>Зайнята площа на фермі</strong>
                        <span>Натисни клітинку: буде виділений прямокутник від лівого верхнього кута.</span>
                      </div>
                      <div className="admin-product-footprint-groups">
                        <div className="admin-product-footprint-group">
                          <div className="admin-product-footprint-subheading">
                            <strong>Малі сектори</strong>
                            <span>{draft.footprintWidth} × {draft.footprintHeight}</span>
                          </div>
                          <div className="admin-product-footprint-mini-grid" role="group" aria-label={`Малі сектори для ${item.name}`}>
                            {Array.from({ length: 4 }, (_, index) => {
                              const x = index % 2;
                              const y = Math.floor(index / 2);
                              const selected = x < Number(draft.footprintWidth) && y < Number(draft.footprintHeight);
                              return <button
                                key={index}
                                className={selected ? 'is-selected' : ''}
                                type="button"
                                aria-label={`Малий сектор ${index + 1}`}
                                aria-pressed={selected}
                                onClick={() => updateDraft(item.id, {
                                  footprintWidth: String(x + 1),
                                  footprintHeight: String(y + 1),
                                })}
                              />;
                            })}
                          </div>
                        </div>
                        <div className="admin-product-footprint-group admin-product-footprint-large-group">
                          <div className="admin-product-footprint-subheading">
                            <strong>Великі клітинки</strong>
                            <span>{draft.largeFootprintWidth && draft.largeFootprintHeight
                              ? `${draft.largeFootprintWidth} × ${draft.largeFootprintHeight}`
                              : 'не задано'}</span>
                            {(draft.largeFootprintWidth || draft.largeFootprintHeight) && <button
                              type="button"
                              onClick={() => updateDraft(item.id, { largeFootprintWidth: '', largeFootprintHeight: '' })}
                            >Очистити</button>}
                          </div>
                          <div className="admin-product-footprint-large-grid" role="group" aria-label={`Великі клітинки для ${item.name}`}>
                            {Array.from({ length: 64 }, (_, index) => {
                              const x = index % 8;
                              const y = Math.floor(index / 8);
                              const width = Number(draft.largeFootprintWidth) || 0;
                              const height = Number(draft.largeFootprintHeight) || 0;
                              const selected = x < width && y < height;
                              return <button
                                key={index}
                                className={selected ? 'is-selected' : ''}
                                type="button"
                                aria-label={`Велика клітинка ${x + 1}, ${y + 1}`}
                                aria-pressed={selected}
                                onClick={() => updateDraft(item.id, {
                                  largeFootprintWidth: String(x + 1),
                                  largeFootprintHeight: String(y + 1),
                                })}
                              />;
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    {category === 'HOUSING_BUILDING' && <>
                      <label className="admin-check-field"><input type="checkbox" checked={draft.housingEnabled} onChange={(event) => updateDraft(item.id, { housingEnabled: event.target.checked })} />Приміщення для тварин</label>
                      {draft.housingEnabled && <>
                        <label>Місткість тварин<input type="number" min="1" max="1000" value={draft.housingCapacity} onChange={(event) => updateDraft(item.id, { housingCapacity: event.target.value })} /></label>
                        {catalog.filter((entry) => entry.type === 'ANIMAL').map((animal) => (
                          <label className="admin-check-field" key={`${item.id}-${animal.id}`}>
                            <input type="checkbox" checked={draft.housingAnimalTypes.includes(animal.id)} onChange={(event) => updateDraft(item.id, {
                              housingAnimalTypes: event.target.checked
                                ? [...draft.housingAnimalTypes, animal.id]
                                : draft.housingAnimalTypes.filter((animalId) => animalId !== animal.id),
                            })} />
                            {animal.name}
                          </label>
                        ))}
                      </>}
                    </>}
                    <label>Масштаб зображення<input type="number" min="0.1" max="5" step="0.1" value={draft.spriteScale} onChange={(event) => updateDraft(item.id, { spriteScale: event.target.value })} /></label>
                    <AdminImageUrlInput key={`${item.id}-shop-${assetBaseUrl}`} label={item.type === 'ANIMAL' ? 'Зображення тварини в магазині' : 'Зображення магазину'} value={draft.shopImage} assetBaseUrl={assetBaseUrl} onChange={(value) => updateDraft(item.id, { shopImage: value })} />
                    <label>{item.type === 'ANIMAL' ? 'Запасна іконка тварини' : 'Іконка магазину'}<input value={draft.shopIcon} maxLength={16} onChange={(event) => updateDraft(item.id, { shopIcon: event.target.value })} placeholder={item.type === 'ANIMAL' ? '🐔' : '🌱'} /></label>
                    <AdminImageUrlInput key={`${item.id}-yield-${assetBaseUrl}`} label={item.type === 'ANIMAL' ? 'Зображення продукції (яйце, молоко тощо)' : 'Зображення врожаю'} value={draft.yieldImage} assetBaseUrl={assetBaseUrl} onChange={(value) => updateDraft(item.id, { yieldImage: value })} />
                    <label className="admin-check-field"><input type="checkbox" checked={draft.flipX} onChange={(event) => updateDraft(item.id, { flipX: event.target.checked })} /> Дзеркальний спрайт</label>
                    <label className="admin-check-field"><input type="checkbox" checked={draft.canFlip} onChange={(event) => updateDraft(item.id, { canFlip: event.target.checked })} /> Дозволити перевертання</label>
                    <div className="admin-stage-editor">
                      <div className="admin-stage-heading"><strong>{item.type === 'ANIMAL' ? 'Зображення тварини на фермі та в курнику' : 'Стадії зображення на полі'}</strong><button type="button" onClick={() => updateDraft(item.id, { growthImages: [...draft.growthImages, ''] })} disabled={draft.growthImages.length >= 12}>Додати стадію</button></div>
                      {draft.growthImages.map((source, index) => <div className="admin-stage-row" key={`${item.id}-stage-${index}`}>
                        <span className="admin-stage-number">{index + 1}</span>
                        <div className="admin-stage-thumb">{source ? <img src={resolveImageUrl(source, assetBaseUrl)} alt={`Стадія ${index + 1}`} /> : <span>URL</span>}</div>
                        <AdminImageUrlInput key={`${item.id}-stage-${index}-${assetBaseUrl}`} label={`Стадія ${index + 1} для ${item.name}`} value={source} assetBaseUrl={assetBaseUrl} onChange={(value) => updateStage(item.id, index, value)} />
                        <button type="button" onClick={() => moveStage(item.id, index, -1)} disabled={index === 0} aria-label={`Перемістити стадію ${index + 1} вгору`}><ArrowUp size={15} /></button>
                        <button type="button" onClick={() => moveStage(item.id, index, 1)} disabled={index === draft.growthImages.length - 1} aria-label={`Перемістити стадію ${index + 1} вниз`}><ArrowDown size={15} /></button>
                        <button type="button" onClick={() => updateDraft(item.id, { growthImages: draft.growthImages.filter((_, stageIndex) => stageIndex !== index) })} aria-label={`Видалити стадію ${index + 1}`}><Trash2 size={15} /></button>
                      </div>)}
                      {draft.growthImages.length === 0 && <p>Стадії не задані</p>}
                    </div>
                  </div>
                </details>
                <div className="admin-product-actions">
                  <button className="admin-save-button" type="button" onClick={() => void saveItem(item)} disabled={busyId === item.id}>
                    <Save size={16} />{busyId === item.id ? 'Зберігаємо…' : 'Зберегти зміни'}
                  </button>
                  {item.disabled
                    ? <button className="admin-restore-button" type="button" onClick={() => void restoreItem(item)} disabled={busyId === `${item.id}:restore`}><RotateCcw size={15} />Відновити</button>
                    : confirmArchiveId === item.id
                      ? <div className="admin-archive-confirm"><span>Приховати товар? Уже посаджені залишаться.</span><button type="button" onClick={() => void archiveItem(item)} disabled={busyId === `${item.id}:archive`}>Підтвердити</button><button type="button" onClick={() => setConfirmArchiveId(null)}>Скасувати</button></div>
                      : <button className="admin-archive-button" type="button" onClick={() => setConfirmArchiveId(item.id)}><Trash2 size={15} />Видалити з магазину</button>}
                  {confirmPermanentDeleteId === item.id
                    ? <div className="admin-permanent-confirm"><span>Буде видалено з усіх ферм{item.yieldItem ? ' та запасів урожаю, якщо його не дає інший товар' : ''}. Назад не повернути.</span><button type="button" onClick={() => void permanentlyDeleteItem(item)} disabled={busyId === `${item.id}:permanent`}>Видалити назавжди</button><button type="button" onClick={() => setConfirmPermanentDeleteId(null)}>Скасувати</button></div>
                    : <button className="admin-permanent-button" type="button" onClick={() => { setConfirmArchiveId(null); setConfirmPermanentDeleteId(item.id); }}><Trash2 size={14} />Видалити назавжди</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};