import React, { useEffect, useState } from 'react';
import { Gift, Plus, Save, Trash2 } from 'lucide-react';
import axios from 'axios';
import { adminApi, type AdminCatalogItem } from '../../api/admin.api';
import type { LevelReward, LevelRewardEntry } from '../../types/game';
import { useAdminToast } from './adminToast';

interface RewardDraft {
  kind: LevelReward['kind'];
  amount: string;
  itemId: string;
}

const asDrafts = (rewards: LevelReward[] = []): RewardDraft[] => rewards.map((reward) => ({
  kind: reward.kind,
  amount: String(reward.amount),
  itemId: reward.kind === 'item' ? reward.itemId : '',
}));

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося зберегти нагороди.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';

export const AdminLevelRewards: React.FC = () => {
  const showToast = useAdminToast();
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [savedLevels, setSavedLevels] = useState<LevelRewardEntry[]>([]);
  const [drafts, setDrafts] = useState<Record<number, RewardDraft[]>>({});
  const [levelInput, setLevelInput] = useState('2');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([adminApi.getCatalog(), adminApi.getLevelRewards()])
      .then(([items, levels]) => {
        if (!active) return;
        setCatalog(items.filter((item) => !item.disabled));
        setSavedLevels(levels);
      })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const level = Number(levelInput);
  const currentRewards = drafts[level] ?? asDrafts(savedLevels.find((entry) => entry.level === level)?.rewards);
  const updateCurrent = (next: RewardDraft[]) => setDrafts((current) => ({ ...current, [level]: next }));

  const saveRewards = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!Number.isSafeInteger(level) || level < 2 || level > 999 || currentRewards.length > 20) {
      setError('Рівень має бути від 2 до 999, а нагород може бути не більше 20.');
      return;
    }
    const rewards: LevelReward[] = [];
    for (const reward of currentRewards) {
      const amount = Number(reward.amount);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000 ||
          (reward.kind === 'item' && !catalog.some((item) => item.id === reward.itemId))) {
        setError('Перевір кількість і вибір предметів у нагородах.');
        return;
      }
      rewards.push(reward.kind === 'item'
        ? { kind: 'item', itemId: reward.itemId, amount }
        : { kind: reward.kind, amount });
    }

    setSaving(true);
    setError('');
    try {
      const saved = await adminApi.saveLevelRewards(level, rewards);
      setSavedLevels((current) => [...current.filter((entry) => entry.level !== level), saved].sort((a, b) => a.level - b.level));
      setDrafts((current) => ({ ...current, [level]: asDrafts(saved.rewards) }));
      showToast('success', `Нагороди для рівня ${level} збережено.`);
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-level-rewards-page" aria-labelledby="admin-level-rewards-title">
      <header className="admin-shop-heading">
        <div><span className="admin-eyebrow">ПРОГРЕС ГРАВЦІВ</span><h1 id="admin-level-rewards-title">Нагороди рівнів</h1><p>Налаштуй подарунки, які гравець забирає після досягнення рівня</p></div>
        <div className="admin-shop-total"><Gift size={18} /><strong>{savedLevels.length}</strong><span>рівнів</span></div>
      </header>
      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {loading ? <div className="admin-state"><Gift size={24} /><span>Завантажуємо нагороди…</span></div> : (
        <form className="admin-level-rewards-editor" onSubmit={(event) => void saveRewards(event)}>
          <label className="admin-level-select">Рівень нагороди<input type="number" min="2" max="999" value={levelInput} onChange={(event) => setLevelInput(event.target.value)} /></label>
          <div className="admin-level-reward-list">
            {currentRewards.map((reward, index) => (
              <div className="admin-level-reward-row" key={`${level}-${index}`}>
                <label>Подарунок
                  <select value={reward.kind} onChange={(event) => updateCurrent(currentRewards.map((entry, row) => row === index ? { ...entry, kind: event.target.value as RewardDraft['kind'], itemId: '' } : entry))}>
                    <option value="coins">Монети</option><option value="rubies">Рубіни</option><option value="item">Предмет із магазину</option>
                  </select>
                </label>
                {reward.kind === 'item' && <label className="admin-level-reward-item">Товар
                  <select value={reward.itemId} onChange={(event) => updateCurrent(currentRewards.map((entry, row) => row === index ? { ...entry, itemId: event.target.value } : entry))}>
                    <option value="">Обери товар</option>{catalog.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.type}</option>)}
                  </select>
                </label>}
                <label>Кількість<input type="number" min="1" max="100000" value={reward.amount} onChange={(event) => updateCurrent(currentRewards.map((entry, row) => row === index ? { ...entry, amount: event.target.value } : entry))} /></label>
                <button className="admin-level-reward-remove" type="button" onClick={() => updateCurrent(currentRewards.filter((_, row) => row !== index))} aria-label={`Видалити нагороду ${index + 1}`}><Trash2 size={16} /></button>
              </div>
            ))}
            {currentRewards.length === 0 && <p className="admin-level-rewards-empty">Для цього рівня нагороди ще не задані.</p>}
          </div>
          <div className="admin-level-reward-actions">
            <button className="admin-secondary-button" type="button" onClick={() => updateCurrent([...currentRewards, { kind: 'coins', amount: '100', itemId: '' }])} disabled={currentRewards.length >= 20}><Plus size={15} />Додати подарунок</button>
            <button className="admin-primary-button" type="submit" disabled={saving}><Save size={15} />{saving ? 'Зберігаємо…' : 'Зберегти нагороди'}</button>
          </div>
        </form>
      )}
      {savedLevels.length > 0 && <div className="admin-level-reward-saved-list"><h2>Налаштовані рівні</h2>{savedLevels.map((entry) => <button type="button" key={entry.level} onClick={() => setLevelInput(String(entry.level))}><strong>Рівень {entry.level}</strong><span>{entry.rewards.length} {entry.rewards.length === 1 ? 'подарунок' : 'подарунків'}</span></button>)}</div>}
    </section>
  );
};