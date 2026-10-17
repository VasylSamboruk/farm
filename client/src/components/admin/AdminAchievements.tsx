import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Award, Save } from 'lucide-react';
import { adminApi } from '../../api/admin.api';
import type { GardenAchievement } from '../../types/game';
import { AdminImageUrlInput } from './AdminImageUrlInput';
import { useAdminToast } from './adminToast';

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося зберегти налаштування досягнення.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';

export const AdminAchievements: React.FC = () => {
  const showToast = useAdminToast();
  const [achievements, setAchievements] = useState<GardenAchievement[]>([]);
  const [assetBaseUrl, setAssetBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([adminApi.getAchievements(), adminApi.getMediaSettings()])
      .then(([config, settings]) => {
        if (!active) return;
        setAchievements(config);
        setAssetBaseUrl(settings.assetBaseUrl);
      })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const updateAchievement = (achievementId: string, changes: Partial<GardenAchievement>) => {
    setAchievements((current) => current.map((entry) =>
      entry.id === achievementId ? { ...entry, ...changes } : entry
    ));
  };

  const updateTier = (achievementId: string, index: number, changes: Partial<GardenAchievement['tiers'][number]>) => {
    setAchievements((current) => current.map((entry) => entry.id === achievementId ? {
      ...entry,
      tiers: entry.tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...changes } : tier),
    } : entry));
  };

  const save = async (event: React.FormEvent, achievement: GardenAchievement) => {
    event.preventDefault();
    if (achievement.title.trim().length < 2 || !achievement.description.trim() ||
        !achievement.image.trim() || achievement.tiers.length !== 3 ||
        achievement.tiers.some((tier, index) =>
          !Number.isSafeInteger(tier.requiredCount) || tier.requiredCount < 1 ||
          !Number.isSafeInteger(tier.rubies) || tier.rubies < 1 || !tier.image.trim() ||
          (index > 0 && tier.requiredCount <= achievement.tiers[index - 1].requiredCount)
        )) {
      setError('Перевір назву, зображення, суми рубінів і послідовність порогів.');
      return;
    }
    setSavingId(achievement.id);
    setError('');
    try {
      const saved = await adminApi.saveAchievements({
        ...achievement,
        title: achievement.title.trim(),
        description: achievement.description.trim(),
        image: achievement.image.trim(),
        tiers: achievement.tiers.map((tier) => ({ ...tier, image: tier.image.trim() })),
      });
      setAchievements((current) => current.map((entry) => entry.id === saved.id ? saved : entry));
      showToast('success', `Досягнення «${saved.title}» збережено.`);
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setSavingId('');
    }
  };

  return (
    <section className="admin-achievements-page" aria-labelledby="admin-achievements-title">
      <header className="admin-shop-heading">
        <div>
          <span className="admin-eyebrow">ІГРОВИЙ ПРОГРЕС</span>
          <h1 id="admin-achievements-title">Досягнення</h1>
          <p>Налаштовуй назву, зображення, пороги та рубінові нагороди фіксованих механік.</p>
        </div>
        <div className="admin-shop-total"><Award size={18} /><strong>{achievements.length}</strong><span>досягнення</span></div>
      </header>
      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {loading ? <div className="admin-state"><Award size={24} /><span>Завантажуємо досягнення…</span></div> : achievements.map((achievement) => (
        <form className="admin-achievement-editor" key={achievement.id} onSubmit={(event) => void save(event, achievement)}>
          <h2 className="admin-achievement-form-title">{achievement.title}</h2>
          <div className="admin-achievement-main-fields">
            <label>Назва досягнення<input maxLength={80} value={achievement.title} onChange={(event) => updateAchievement(achievement.id, { title: event.target.value })} /></label>
            <label>Опис<input maxLength={200} value={achievement.description} onChange={(event) => updateAchievement(achievement.id, { description: event.target.value })} /></label>
            <AdminImageUrlInput label="Зображення досягнення" value={achievement.image} assetBaseUrl={assetBaseUrl} onChange={(image) => updateAchievement(achievement.id, { image })} />
          </div>
          <div className="admin-achievement-tiers">
            {achievement.tiers.map((tier, index) => (
              <fieldset className="admin-achievement-tier" key={tier.id}>
                <legend>{tier.label}</legend>
                <div className="admin-achievement-tier-values">
                  <label>{achievement.kind === 'animals' ? 'Потрібно виставити' : 'Потрібно посадити'}<input type="number" min="1" max="1000000000" value={tier.requiredCount} onChange={(event) => updateTier(achievement.id, index, { requiredCount: Number(event.target.value) })} /><span>шт.</span></label>
                  <label>Нагорода<input type="number" min="1" max="100000" value={tier.rubies} onChange={(event) => updateTier(achievement.id, index, { rubies: Number(event.target.value) })} /><span>рубінів</span></label>
                </div>
                <AdminImageUrlInput label={`Іконка рівня «${tier.label}»`} value={tier.image} assetBaseUrl={assetBaseUrl} onChange={(image) => updateTier(achievement.id, index, { image })} />
                <img className="admin-achievement-tier-preview" src={tier.image} alt={`Попередній перегляд: ${tier.label}`} />
              </fieldset>
            ))}
          </div>
          <p className="admin-achievement-note">Механіка фіксована: {achievement.kind === 'crops' ? 'зараховується кожне успішне садіння культури на фермі.' : achievement.kind === 'trees' ? 'зараховується кожне успішне висадження дерева на фермі, зокрема з інвентаря.' : 'зараховується кожне успішне виставлення тварини на ферму незалежно від джерела (магазин, інвентар або подарунок).'} Порогів і рівнів нагород має бути три.</p>
          <button className="admin-primary-button" type="submit" disabled={Boolean(savingId)}>
            <Save size={16} />{savingId === achievement.id ? 'Зберігаємо…' : 'Зберегти досягнення'}
          </button>
        </form>
      ))}
    </section>
  );
};
