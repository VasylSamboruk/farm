import React, { useEffect, useState } from 'react';
import { Calculator, RefreshCw, Save, Sprout, TreePine, PawPrint } from 'lucide-react';
import { adminApi, type AdminCatalogItem } from '../../api/admin.api';
import { AdminDurationInput } from './AdminDurationInput';
import { useAdminToast } from './adminToast';
import { durationPartsToMilliseconds, type DurationParts } from '../../game/durationInput';
import { estimateItemPricing, type PricingCategory } from '../../game/pricingCalculator';
import { formatGameDuration } from '../../game/trees';

type CategoryOption = {
  type: PricingCategory;
  label: string;
  icon: React.ReactNode;
};

const categoryOptions: CategoryOption[] = [
  { type: 'TREE', label: 'Дерева й кущі', icon: <TreePine size={17} /> },
  { type: 'CROP', label: 'Рослини', icon: <Sprout size={17} /> },
  { type: 'ANIMAL', label: 'Тварини', icon: <PawPrint size={17} /> },
];

const formatPrice = (price: number) => price.toLocaleString('uk-UA');

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response;
    if (typeof response === 'object' && response !== null && 'data' in response) {
      const data = response.data;
      if (typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string') return data.message;
    }
  }
  return error instanceof Error ? error.message : 'Не вдалося виконати дію.';
};

export const AdminPricing: React.FC = () => {
  const showToast = useAdminToast();
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [category, setCategory] = useState<PricingCategory>('TREE');
  const [duration, setDuration] = useState<DurationParts>({ hours: '01', minutes: '00', seconds: '00' });
  const [markupPercent, setMarkupPercent] = useState('100');
  const [manualPrice, setManualPrice] = useState<string | null>(null);
  const [manualSellPrice, setManualSellPrice] = useState<string | null>(null);
  const [applyItemId, setApplyItemId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void adminApi.getCatalog()
      .then((items) => { if (active) setCatalog(items); })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const durationMs = durationPartsToMilliseconds(duration);
  const references = catalog.filter((item) => item.type === category && !item.disabled && item.yieldItem &&
    Number.isSafeInteger(item.productionTimeMs) && (item.productionTimeMs ?? 0) > 0 &&
    Number.isSafeInteger(item.price) && Number.isSafeInteger(item.sellPrice) && (item.sellPrice ?? -1) >= 0);
  const estimate = durationMs !== null && durationMs >= 1000
    ? estimateItemPricing(references, category, durationMs)
    : null;
  const parsedMarkup = Number(markupPercent);
  const safeMarkup = Number.isFinite(parsedMarkup) && parsedMarkup > 0 ? parsedMarkup : 100;
  const suggestedPrice = estimate ? Math.round(estimate.price * safeMarkup / 100) : null;
  const suggestedSellPrice = estimate ? Math.round(estimate.sellPrice * safeMarkup / 100) : null;
  const purchasePrice = manualPrice === null ? suggestedPrice : Number(manualPrice);
  const proportionalSellPrice = estimate && purchasePrice !== null && estimate.price > 0
    ? Math.round(estimate.sellPrice * purchasePrice / estimate.price)
    : suggestedSellPrice;
  const sellPrice = manualSellPrice === null ? proportionalSellPrice : Number(manualSellPrice);
  const categoryItems = catalog.filter((item) => item.type === category && !item.disabled && item.yieldItem);
  const selectedItem = categoryItems.find((item) => item.id === applyItemId);

  const resetManualPrices = () => {
    setManualPrice(null);
    setManualSellPrice(null);
  };

  const changeMarkup = (value: string) => {
    setMarkupPercent(value);
    resetManualPrices();
  };

  const applyPricing = async () => {
    if (!selectedItem || durationMs === null || durationMs < 1000 || purchasePrice === null || sellPrice === null ||
        !Number.isSafeInteger(purchasePrice) || purchasePrice < 0 ||
        !Number.isSafeInteger(sellPrice) || sellPrice < 0) {
      setError('Обери товар, коректний час і цілі невід’ємні ціни.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await adminApi.updateConfig(selectedItem.id, {
        price: purchasePrice,
        sellPrice,
        productionTimeMs: durationMs,
      });
      setCatalog(await adminApi.getCatalog());
      setNotice(`Для «${updated.name}» застосовано ${formatGameDuration(durationMs)}, ${formatPrice(purchasePrice)} монет за покупку та ${formatPrice(sellPrice)} за врожай.`);
      showToast('success', `Ціни «${updated.name}» оновлено.`);
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-pricing-page" aria-labelledby="admin-pricing-title">
      <header className="admin-pricing-heading">
        <div>
          <span className="admin-eyebrow">ЕКОНОМІКА ГРИ</span>
          <h1 id="admin-pricing-title">Ціноутворення</h1>
          <p>Оцінка ціни за актуальними товарами каталогу</p>
        </div>
        <Calculator size={23} aria-hidden="true" />
      </header>

      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {notice && <p className="admin-alert is-success" role="status">{notice}</p>}

      {loading ? <div className="admin-state"><Calculator size={23} /><span>Завантажуємо каталог для розрахунку…</span></div> : (
        <div className="admin-pricing-layout">
          <section className="admin-pricing-controls">
            <div className="admin-pricing-section-title"><span>01</span><div><h2>Параметри</h2><p>Категорія та час виробництва</p></div></div>

            <fieldset className="admin-pricing-category">
              <legend>Тип товару</legend>
              <div className="admin-pricing-category-options">
                {categoryOptions.map((option) => (
                  <button key={option.type} type="button" className={category === option.type ? 'is-active' : ''} aria-pressed={category === option.type} onClick={() => { setCategory(option.type); setApplyItemId(''); resetManualPrices(); }}>
                    {option.icon}<span>{option.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="admin-pricing-duration">
              <span>Час до одного врожаю</span>
              <AdminDurationInput label="Час до врожаю" value={duration} onChange={(value) => { setDuration(value); resetManualPrices(); }} />
            </div>

            <label className="admin-pricing-markup">
              <span><strong>Множник ціни</strong><b>{markupPercent || '0'}%</b></span>
              <input type="range" min="25" max="400" step="5" value={Math.min(400, Math.max(25, Number(markupPercent) || 25))} onChange={(event) => changeMarkup(event.target.value)} />
              <small>Змінює ціну покупки й пропорційну ціну продажу врожаю</small>
            </label>

            {estimate && (
              <div className="admin-pricing-manual-grid">
                <label>Ціна покупки<input type="number" min="0" step="1" value={purchasePrice ?? ''} onChange={(event) => { setManualPrice(event.target.value); setManualSellPrice(null); }} /></label>
                <label>Продаж одиниці врожаю<input type="number" min="0" step="1" value={sellPrice ?? ''} onChange={(event) => setManualSellPrice(event.target.value)} /></label>
              </div>
            )}

            <label className="admin-pricing-apply-select">Застосувати до товару
              <select value={applyItemId} onChange={(event) => setApplyItemId(event.target.value)}>
                <option value="">Обери товар або скопіюй розрахунок вручну</option>
                {categoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
              </select>
            </label>

            <div className="admin-pricing-actions">
              <button className="admin-primary-button" type="button" onClick={() => void applyPricing()} disabled={busy || !selectedItem || !estimate}>
                <Save size={15} />{busy ? 'Застосовуємо…' : 'Застосувати ціни й час'}
              </button>
              <button className="admin-secondary-button" type="button" onClick={() => { setMarkupPercent('100'); resetManualPrices(); }} disabled={busy}>
                <RefreshCw size={14} />Скинути множник
              </button>
            </div>
          </section>

          <section className="admin-pricing-results" aria-live="polite">
            <div className="admin-pricing-section-title"><span>02</span><div><h2>Розрахунок</h2><p>{durationMs && durationMs >= 1000 ? formatGameDuration(durationMs) : 'Вкажи час від 1 секунди'}</p></div></div>
            {estimate ? (
              <>
                <div className="admin-pricing-result-grid">
                  <article><span>Покупка в магазині</span><strong>{purchasePrice === null ? '—' : formatPrice(purchasePrice)}</strong><small>монет за товар</small></article>
                  <article><span>Продаж врожаю</span><strong>{sellPrice === null ? '—' : formatPrice(sellPrice)}</strong><small>монет за одиницю</small></article>
                </div>
                <p className="admin-pricing-formula">{estimate.exactTimeMatch
                  ? 'Є товари цієї категорії з таким самим часом: за основу взято медіанну ціну.'
                  : 'Оцінка зважена за трьома найближчими таймерами каталогу; вплив часу масштабується через квадратний корінь, щоб довгий цикл не роздував ціну лінійно.'}</p>
                <div className="admin-pricing-reference-list">
                  <h3>Орієнтири з каталогу <span>{estimate.references.length}</span></h3>
                  {estimate.references.map((reference) => (
                    <div key={reference.item.id}>
                      <span><strong>{reference.item.name}</strong><small>{formatGameDuration(reference.item.productionTimeMs ?? 0)}</small></span>
                      <span><b>{formatPrice(reference.item.price)}</b><small>покупка</small></span>
                      <span><b>{formatPrice(reference.item.sellPrice ?? 0)}</b><small>продаж</small></span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="admin-pricing-empty"><Calculator size={25} /><p>{references.length === 0
                ? 'У цій категорії немає товарів з налаштованою ціною продажу для порівняння.'
                : 'Вкажи коректний час від 1 секунди, щоб отримати рекомендацію.'}</p></div>
            )}
          </section>
        </div>
      )}
    </section>
  );
};
