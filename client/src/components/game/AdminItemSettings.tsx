import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { adminApi } from '../../api/admin.api';
import { useAuthStore } from '../../store/authStore';
import { useFarmStore } from '../../store/useFarmStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { GameItemConfig } from '../../types/game';

interface AdminItemSettingsProps {
  item: GameItemConfig;
}

interface TimeFieldsProps {
  label: string;
  valueMs: number;
  onChange: (ms: number) => void;
}

const TimeFields: React.FC<TimeFieldsProps> = ({ label, valueMs, onChange }) => {
  const total = Math.max(0, Math.round(valueMs / 1000));
  const parts = { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
  const update = (key: 'h' | 'm' | 's', raw: string) => {
    const next = { ...parts, [key]: Math.max(0, Math.floor(Number(raw) || 0)) };
    onChange((next.h * 3600 + next.m * 60 + next.s) * 1000);
  };
  return (
    <div className="admin-settings-field admin-settings-time">
      <span>{label}</span>
      <div className="admin-settings-time-inputs">
        {(['h', 'm', 's'] as const).map((key) => (
          <label key={key}>
            <input type="number" min={0} value={parts[key]} onChange={(event) => update(key, event.target.value)} onFocus={(event) => event.target.select()} />
            <small>{key === 'h' ? 'год' : key === 'm' ? 'хв' : 'сек'}</small>
          </label>
        ))}
      </div>
    </div>
  );
};

interface AnimalDraft { timeMs: number; xp: string }

export const AdminItemSettings: React.FC<AdminItemSettingsProps> = ({ item }) => {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const items = useGameConfigStore((state) => state.items);
  const loadItems = useGameConfigStore((state) => state.loadItems);
  const notify = useFarmStore((state) => state.notifyGameMessage);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [scale, setScale] = useState('1');
  const [timeMs, setTimeMs] = useState(0);
  const [capacity, setCapacity] = useState('');
  const [inputId, setInputId] = useState('');
  const [outPrice, setOutPrice] = useState('');
  const [inPrice, setInPrice] = useState('');
  const [animals, setAnimals] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Record<string, AnimalDraft>>({});

  if (!isAdmin) return null;

  const isFactory = item.buildingCategory === 'FACTORY';
  const isHousing = Boolean(item.housing);
  const hasCapacity = isFactory || isHousing;
  const allItems = Object.values(items);
  const inputOptions = allItems.filter((entry) => entry.yieldItem && ['TREE', 'CROP', 'ANIMAL'].includes(entry.type));
  const animalOptions = allItems.filter((entry) => entry.type === 'ANIMAL');

  const draftFor = (id: string): AnimalDraft => drafts[id] ?? {
    timeMs: items[id]?.productionTimeMs ?? 0,
    xp: String(items[id]?.plantingXp ?? 0),
  };

  const openEditor = () => {
    setName(item.name);
    setPrice(String(item.originalPrice ?? item.price));
    setScale(String(item.spriteScale ?? 1));
    setTimeMs(item.productionTimeMs ?? 0);
    setCapacity(String(isFactory ? item.factoryCapacity ?? 25 : item.housing?.capacity ?? ''));
    setInputId(item.factoryInputItemId ?? '');
    setOutPrice(item.sellPrice == null ? '' : String(item.sellPrice));
    const inputSell = items[item.factoryInputItemId ?? '']?.sellPrice;
    setInPrice(inputSell == null ? '' : String(inputSell));
    setAnimals(item.housing?.animalTypes ?? []);
    setDrafts({});
    setOpen(true);
  };

  const toggleAnimal = (id: string) => setAnimals((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const setDraft = (id: string, patch: Partial<AnimalDraft>) => setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));

  const save = async () => {
    if (saving) return;
    const trimmed = name.trim();
    const basePrice = Number(price);
    const spriteScale = Number(scale);
    if (!trimmed || trimmed.length > 80) { notify('Вкажи назву (до 80 символів).'); return; }
    if (!Number.isSafeInteger(basePrice) || basePrice < 0) { notify('Ціна має бути цілим числом.'); return; }
    if (!Number.isFinite(spriteScale) || spriteScale < 0.1 || spriteScale > 5) { notify('Розмір має бути від 0.1 до 5.'); return; }
    const config: Parameters<typeof adminApi.updateConfig>[1] = { name: trimmed, price: basePrice, spriteScale };
    if (item.productionTimeMs) {
      if (timeMs < 1000) { notify('Час має бути не менше 1 секунди.'); return; }
      config.productionTimeMs = timeMs;
    }
    if (hasCapacity) {
      const slots = Number(capacity);
      if (!Number.isSafeInteger(slots) || slots < 1 || slots > 1000) { notify('Місткість має бути від 1 до 1000.'); return; }
      if (isFactory) {
        config.factoryCapacity = slots;
        if (outPrice.trim() !== '') {
          const out = Number(outPrice);
          if (!Number.isSafeInteger(out) || out < 0) { notify('Ціна продукту має бути цілим числом.'); return; }
          config.sellPrice = out;
        }
        if (inputId && inputId !== item.factoryInputItemId) config.factoryInputItemId = inputId;
      } else if (item.housing) {
        if (animals.length < 1) { notify('Обери хоча б одну тварину для загону.'); return; }
        config.housing = { capacity: slots, animalTypes: animals };
      }
    }
    const animalUpdates: Array<{ id: string; plantingXp: number; productionTimeMs?: number }> = [];
    for (const id of isHousing ? animals : []) {
      const target = items[id];
      if (!target) continue;
      const draft = draftFor(id);
      const xp = Number(draft.xp);
      if (!Number.isSafeInteger(xp) || xp < 0 || (target.productionTimeMs && draft.timeMs < 1000)) {
        notify(`Перевір час і досвід: ${target.name}.`);
        return;
      }
      animalUpdates.push({ id, plantingXp: xp, ...(target.productionTimeMs ? { productionTimeMs: draft.timeMs } : {}) });
    }
    setSaving(true);
    try {
      await adminApi.updateConfig(item.id, config);
      if (isFactory && inputId && inPrice.trim() !== '') {
        const sell = Number(inPrice);
        if (Number.isSafeInteger(sell) && sell >= 0 && sell !== items[inputId]?.sellPrice) await adminApi.updateConfig(inputId, { sellPrice: sell });
      }
      for (const { id, ...rest } of animalUpdates) await adminApi.updateConfig(id, rest);
      await loadItems(true);
      setOpen(false);
    } catch (error) {
      console.error('Не вдалося зберегти налаштування:', error);
      notify('Не вдалося зберегти налаштування.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, onChange: (value: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="admin-settings-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );

  return (
    <div className="admin-settings" onClick={(event) => event.stopPropagation()}>
      <button type="button" className={`admin-settings-gear${open ? ' is-open' : ''}`} onClick={() => (open ? setOpen(false) : openEditor())} title="Налаштування (тільки адмін)" aria-label="Налаштування для адміна">
        <Settings size={18} strokeWidth={2.4} />
      </button>
      {open && createPortal(
        <div className="game-screen admin-settings-layer" onClick={(event) => event.stopPropagation()}>
          <div className="admin-settings-backdrop" onClick={() => setOpen(false)} />
          <div className="admin-settings-popover" role="dialog" aria-label="Налаштування адміна">
            <div className="admin-settings-title">⚙ Налаштування адміна</div>
            {field('Назва', name, setName, { maxLength: 80 })}
            <div className="admin-settings-row">
              {field('Ціна', price, setPrice, { type: 'number', min: 0 })}
              {field('Розмір', scale, setScale, { type: 'number', min: 0.1, max: 5, step: 0.1 })}
            </div>
            {item.productionTimeMs ? <TimeFields label={isFactory ? 'Час переробки одиниці' : 'Час'} valueMs={timeMs} onChange={setTimeMs} /> : null}
            {hasCapacity && field('Місткість', capacity, setCapacity, { type: 'number', min: 1, max: 1000 })}
            {isFactory && (
              <label className="admin-settings-field">
                <span>Що переробляє</span>
                <select value={inputId} onChange={(event) => setInputId(event.target.value)}>
                  {inputOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.yieldName ?? entry.name}</option>)}
                </select>
              </label>
            )}
            {isFactory && (
              <div className="admin-settings-row">
                {field('Ціна сировини', inPrice, setInPrice, { type: 'number', min: 0 })}
                {field('Ціна продукту', outPrice, setOutPrice, { type: 'number', min: 0 })}
              </div>
            )}
            {isHousing && (
              <>
                <div className="admin-settings-subtitle">Що вміщає загін</div>
                <div className="admin-settings-chips">
                  {animalOptions.map((entry) => (
                    <button key={entry.id} type="button" className={animals.includes(entry.id) ? 'is-on' : ''} onClick={() => toggleAnimal(entry.id)}>{entry.name}</button>
                  ))}
                </div>
                {animals.map((id) => {
                  const target = items[id];
                  if (!target) return null;
                  const draft = draftFor(id);
                  return (
                    <div key={id} className="admin-settings-animal">
                      <div className="admin-settings-subtitle">{target.name}</div>
                      {target.productionTimeMs ? <TimeFields label="Час" valueMs={draft.timeMs} onChange={(ms) => setDraft(id, { timeMs: ms })} /> : null}
                      {field('Досвід (XP)', draft.xp, (value) => setDraft(id, { xp: value }), { type: 'number', min: 0 })}
                    </div>
                  );
                })}
              </>
            )}
            <div className="admin-settings-actions">
              <button type="button" className="admin-settings-cancel" onClick={() => setOpen(false)}>Скасувати</button>
              <button type="button" className="admin-settings-save" disabled={saving} onClick={() => void save()}>{saving ? '…' : 'Зберегти'}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

