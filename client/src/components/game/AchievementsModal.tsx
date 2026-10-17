import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Check, ChevronDown, X } from 'lucide-react';
import { achievementsApi, getClaimableAchievementCount, type PlayerAchievements } from '../../api/achievements.api';
import { useAuthStore } from '../../store/authStore';

interface AchievementsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaimableCountChange: (count: number) => void;
}

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося завантажити досягнення.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';
const formatNumber = (value: number) => value.toLocaleString('uk-UA');

export const AchievementsModal: React.FC<AchievementsModalProps> = ({ isOpen, onClose, onClaimableCountChange }) => {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [data, setData] = useState<PlayerAchievements | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingTier, setClaimingTier] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedAchievements, setExpandedAchievements] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setData(null);
      setError('');
      setNotice('');
      void achievementsApi.get()
        .then((result) => {
          if (!active) return;
          setData(result);
          onClaimableCountChange(getClaimableAchievementCount(result));
        })
        .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, onClaimableCountChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const claimTier = async (achievementId: string, tierId: string) => {
    const currentData = data;
    const entry = currentData?.achievements.find(({ achievement }) => achievement.id === achievementId);
    if (!currentData || !entry || claimingTier) return;
    const claimKey = `${entry.achievement.id}:${tierId}`;
    setClaimingTier(claimKey);
    setError('');
    setNotice('');
    try {
      const progress = await achievementsApi.claim(entry.achievement.id, tierId);
      const updatedData: PlayerAchievements = {
        ...currentData,
        achievements: currentData.achievements.map((currentEntry) => ({
          ...currentEntry,
          progress: {
            ...currentEntry.progress,
            ...(currentEntry.achievement.id === entry.achievement.id ? { count: progress.count } : {}),
            claimedTiers: progress.claimedTiers,
            rubies: progress.rubies,
          },
        })),
      };
      setData(updatedData);
      onClaimableCountChange(getClaimableAchievementCount(updatedData));
      updateUser({ rubies: progress.rubies });
      const claimedTier = entry.achievement.tiers.find((tier) => tier.id === tierId);
      setNotice(`Зараховано +${claimedTier?.rubies ?? 0} рубінів!`);
    } catch (claimError) {
      setError(getErrorMessage(claimError));
    } finally {
      setClaimingTier('');
    }
  };

  if (!isOpen) return null;
  const content = (
    <div className="achievements-overlay" onClick={onClose}>
      <section className="game-modal-window achievements-window" role="dialog" aria-modal="true" aria-labelledby="achievements-title" onClick={(event) => event.stopPropagation()}>
        <header className="achievements-header">
          <img className="achievements-banner" src="/assets/ui/dosiag_banner.png" alt="Досягнення" draggable={false} />
          <div className="achievements-wallet">
            <span><img src="/assets/ui/coin.png" alt="" draggable={false} />{formatNumber(user?.coins ?? 0)}</span>
            <span><img src="/assets/ui/rubin.png" alt="" draggable={false} />{formatNumber(data?.achievements[0]?.progress.rubies ?? user?.rubies ?? 0)}</span>
          </div>
          <button
            className="game-modal-close"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Закрити досягнення"
          >
            <X size={19} />
          </button>
        </header>
        <div className="achievements-content">
          <h2 id="achievements-title" className="visually-hidden">Досягнення</h2>
          {error && <p className="achievements-message is-error" role="alert">{error}</p>}
          {notice && <p className="achievements-message is-success" role="status"><Check size={15} />{notice}</p>}
          {loading ? <div className="achievements-state">Завантажуємо досягнення…</div> : data && (
            <div className="achievement-list">
              {data.achievements.map(({ achievement, progress }) => {
                const nextTier = achievement.tiers.find((tier) => progress.count < tier.requiredCount)
                  ?? achievement.tiers[achievement.tiers.length - 1];
                return (
                <article className={`achievement-card${expandedAchievements.includes(achievement.id) ? ' is-expanded' : ''}`} key={achievement.id}>
                  <button
                    className="achievement-heading"
                    type="button"
                    aria-expanded={expandedAchievements.includes(achievement.id)}
                    aria-controls={`achievement-details-${achievement.id}`}
                    onClick={() => setExpandedAchievements((current) => current.includes(achievement.id)
                      ? current.filter((id) => id !== achievement.id)
                      : [...current, achievement.id])}
                  >
                    <img className="achievement-heading-icon" src={achievement.image} alt="" draggable={false} />
                    <div className="achievement-heading-copy">
                      <h3>{achievement.title}</h3>
                      <p>{achievement.description}</p>
                    </div>
                    <span className="achievement-heading-medals" aria-label="Статус нагород">
                      {achievement.tiers.map((tier) => {
                        const claimId = `${achievement.id}:${tier.id}`;
                        const claimed = progress.claimedTiers.includes(claimId);
                        const achieved = progress.count >= tier.requiredCount;
                        return (
                          <img
                            className={`achievement-heading-medal${claimed ? ' is-claimed' : achieved ? ' is-achieved' : ''}`}
                            src={tier.image}
                            alt={`${tier.label}: ${claimed ? 'нагороду забрано' : achieved ? 'нагорода доступна' : 'ще не досягнуто'}`}
                            title={`${tier.label}: ${claimed ? 'забрано' : achieved ? 'нагорода доступна' : formatNumber(tier.requiredCount)}`}
                            draggable={false}
                            key={tier.id}
                          />
                        );
                      })}
                    </span>
                    <span className="achievement-heading-progress">{formatNumber(progress.count)} / {formatNumber(nextTier?.requiredCount ?? 0)}</span>
                    <ChevronDown className="achievement-heading-chevron" size={18} />
                  </button>
                  {expandedAchievements.includes(achievement.id) && <div className="achievement-details" id={`achievement-details-${achievement.id}`} aria-label={`${achievement.title}: нагороди`}>
                  <div className="achievement-tiers">
                    {achievement.tiers.map((tier) => {
                      const claimId = `${achievement.id}:${tier.id}`;
                      const achieved = progress.count >= tier.requiredCount;
                      const claimed = progress.claimedTiers.includes(claimId);
                      const isClaiming = claimingTier === claimId;
                      return (
                        <section className={`achievement-tier is-${tier.id}${claimed ? ' is-claimed' : achieved ? ' is-achieved' : ''}`} key={tier.id}>
                          <img className="achievement-tier-medal" src={tier.image} alt={tier.label} draggable={false} />
                          <strong className="achievement-tier-count">{formatNumber(tier.requiredCount)} шт.</strong>
                          <span className="achievement-tier-reward"><img src="/assets/ui/rubin.png" alt="" draggable={false} />×{tier.rubies}</span>
                          <button
                            className="achievement-claim-button"
                            type="button"
                            onClick={() => void claimTier(achievement.id, tier.id)}
                            disabled={!achieved || claimed || Boolean(claimingTier)}
                            aria-label={claimed ? `${tier.label}: нагороду забрано` : `Забрати ${tier.rubies} рубінів за рівень ${tier.label}`}
                            title={claimed ? 'Нагороду вже забрано' : achieved ? 'Забрати нагороду' : `Потрібно ${formatNumber(tier.requiredCount)} одиниць`}
                          >
                            {claimed ? <Check size={17} /> : <img src="/assets/ui/gift.png" alt="" draggable={false} />}
                            <span>{claimed ? 'Забрано' : isClaiming ? '…' : 'Забрати'}</span>
                          </button>
                        </section>
                      );
                    })}
                  </div>
                  {(() => {
                    const nextTier = achievement.tiers.find((tier) => progress.count < tier.requiredCount)
                      ?? achievement.tiers[achievement.tiers.length - 1];
                    const current = Math.min(progress.count, nextTier.requiredCount);
                    const percent = nextTier.requiredCount > 0 ? (current / nextTier.requiredCount) * 100 : 0;
                    return (
                      <div className="achievement-progress">
                        <div className="achievement-progress-track" role="progressbar" aria-label={`Прогрес до рівня ${nextTier.label}`} aria-valuemin={0} aria-valuemax={nextTier.requiredCount} aria-valuenow={current}>
                          <span style={{ width: `${percent}%` }} />
                          <strong>{formatNumber(progress.count)} / {formatNumber(nextTier.requiredCount)}</strong>
                        </div>
                        <small>{achievement.countLabel}</small>
                      </div>
                    );
                  })()}
                  </div>}
                </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
  return createPortal(content, document.body);
};
