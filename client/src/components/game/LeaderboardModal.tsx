import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Award, ChevronLeft, ChevronRight, House, Trophy } from 'lucide-react';
import { leaderboardApi, type CompetitionReward, type LeaderboardData, type LeaderboardPlayer } from '../../api/leaderboard.api';
import { getLevelIcon } from '../../config/levelIcons';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { LevelReward } from '../../types/game';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVisitPlayer: (player: LeaderboardPlayer) => void;
}

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося завантажити рейтинг.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';

const formatNumber = (value: number) => value.toLocaleString('uk-UA');
const formatLastOnline = (lastOnlineAt: string | null, isOnline: boolean, now: number) => {
  if (isOnline) return 'Онлайн';
  if (!lastOnlineAt) return 'Немає даних';
  const elapsed = Math.max(0, now - new Date(lastOnlineAt).getTime());
  if (!Number.isFinite(elapsed)) return 'Немає даних';
  if (elapsed < 60_000) return 'Щойно';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} хв тому`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} год тому`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} дн тому`;
  return new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'short' }).format(new Date(lastOnlineAt));
};
const formatTimeLeft = (milliseconds: number) => {
  if (milliseconds <= 0) return 'завершується';
  const days = Math.floor(milliseconds / 86_400_000);
  const hours = Math.floor((milliseconds % 86_400_000) / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${days}д ${String(hours).padStart(2, '0')}г ${String(minutes).padStart(2, '0')}х`;
};
const formatDate = (timestamp: number | null) => timestamp
  ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
  : '';

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ isOpen, onClose, onVisitPlayer }) => {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const gameItems = useGameConfigStore((state) => state.items);
  const levelIcons = useGameConfigStore((state) => state.levelIcons);
  const [type, setType] = useState<'total' | 'competition'>('total');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [pendingRewards, setPendingRewards] = useState<CompetitionReward[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const loaded: Promise<[LeaderboardData, CompetitionReward[]]> = type === 'competition'
        ? Promise.all([leaderboardApi.get(type, page), leaderboardApi.getPendingRewards()])
        : leaderboardApi.get(type, page).then((ranking): [LeaderboardData, CompetitionReward[]] => [ranking, []]);
      void loaded
        .then(([ranking, rewards]) => {
          if (!active) return;
          setData(ranking);
          setPendingRewards(rewards);
          setNow(Date.now());
        })
        .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [isOpen, page, type]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [isOpen]);

  const claimReward = async (reward: CompetitionReward) => {
    if (claimingId) return;
    setClaimingId(reward.competitionId);
    setError('');
    try {
      const result = await leaderboardApi.claimReward(reward.competitionId);
      updateUser({
        coins: result.coins,
        rubies: result.rubies,
        xp: result.xp,
        inventory: result.inventory,
        itemInventory: result.itemInventory,
      });
      setPendingRewards((current) => current.filter((entry) => entry.competitionId !== reward.competitionId));
    } catch (claimError) {
      setError(getErrorMessage(claimError));
    } finally {
      setClaimingId('');
    }
  };

  if (!isOpen) return null;

  const prizeForRank = (rank: number) => data?.prizeRanges?.find((range) => rank >= range.rankFrom && rank <= range.rankTo)?.rewards ?? [];
  const rewardList = (rewards: LevelReward[]) => rewards.map((reward, index) => {
    const item = reward.kind === 'item' ? gameItems[reward.itemId] : undefined;
    const image = reward.kind === 'coins'
      ? '/assets/ui/coin.png'
      : reward.kind === 'rubies'
        ? '/assets/ui/rubin.png'
        : item?.shopImage ?? item?.growthImages?.at(-1) ?? item?.yieldImage;
    const title = reward.kind === 'item'
      ? `${item?.name ?? reward.itemId} ×${reward.amount}`
      : `${formatNumber(reward.amount)} ${reward.kind === 'coins' ? 'монет' : 'рубінів'}`;
    return (
      <span className="leaderboard-prize-chip" key={`${reward.kind}-${index}`} title={title}>
        {image ? <img src={image} alt="" draggable={false} /> : <span aria-hidden="true">{item?.shopIcon ?? '🎁'}</span>}
        <span>{title}</span>
      </span>
    );
  });
  const renderEntry = (player: LeaderboardPlayer, own = false) => (
    <article className={`leaderboard-row${player.rank <= 3 ? ` is-podium place-${player.rank}` : ''}${own ? ' is-self' : ''}${type === 'competition' && prizeForRank(player.rank).length > 0 ? ' has-prizes' : ''}`} key={player.id}>
      <span className="leaderboard-rank">
        {player.rank <= 3
          ? <img src={`/assets/ui/top${player.rank}.png`} alt={`Місце ${player.rank}`} draggable={false} />
          : `#${player.rank}`}
      </span>
      <span className="leaderboard-avatar-wrap">
        <span className="leaderboard-avatar">{player.avatar ? <img src={player.avatar} alt="" /> : player.username.slice(0, 1).toUpperCase()}</span>
        <span className="leaderboard-level-badge" title={`Рівень ${player.level}`} aria-label={`Рівень ${player.level}`}>
          <img src={getLevelIcon(player.level, levelIcons)} alt="" draggable={false} />
          <b>{player.level}</b>
        </span>
      </span>
      <span className="leaderboard-player-copy">
        <strong>{player.username}</strong>
        <span className={`leaderboard-presence${player.isOnline ? ' is-online' : ''}`} title={player.lastOnlineAt ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(player.lastOnlineAt)) : 'Час останньої активності невідомий'}>
          <i aria-hidden="true" />
          {formatLastOnline(player.lastOnlineAt, player.isOnline, now)}
        </span>
      </span>
      <strong className="leaderboard-xp">{formatNumber(player.xp)} <small>XP</small></strong>
      <button type="button" className="leaderboard-visit" onClick={() => onVisitPlayer(player)} aria-label={`Відвідати профіль ${player.username}`} title="Відвідати профіль"><House size={16} /><span>В гості</span></button>
      {type === 'competition' && prizeForRank(player.rank).length > 0 && (
        <div className="leaderboard-row-prizes" aria-label="Призи за це місце">
          <span className="leaderboard-row-prizes-label">Нагорода</span>
          {rewardList(prizeForRank(player.rank))}
        </div>
      )}
    </article>
  );
  const competitionStatus = data?.competitionStatus;
  const timeTarget = competitionStatus === 'scheduled' ? data?.competitionStartAt : data?.competitionEndAt;
  const statusLabel = competitionStatus === 'scheduled'
    ? `Початок через ${formatTimeLeft((timeTarget ?? 0) - now)}`
    : competitionStatus === 'active'
      ? `Завершення через ${formatTimeLeft((timeTarget ?? 0) - now)}`
      : competitionStatus === 'ended' ? 'Змагання завершено' : 'Змагання ще не заплановане';

  return createPortal(
    <div className="leaderboard-overlay" onClick={onClose}>
      <section className="leaderboard-dialog game-modal-window social-modal-window" role="dialog" aria-modal="true" aria-label="Рейтинг гравців" onClick={(event) => event.stopPropagation()}>
        <header className="shared-modal-header game-modal-header social-modal-header modal-header-single-row leaderboard-header">
          <div className="modal-header-summary">
            <img className="leaderboard-title-banner" src="/assets/ui/rating_banner.png" alt="Рейтинг гравців" draggable={false} />
            <span className="modal-title-divider" aria-hidden="true" />
            <div className="leaderboard-resources">
              <span className="modal-resource-chip"><img src="/assets/ui/coin.png" alt="" draggable={false} />{(user?.coins ?? 0).toLocaleString('uk-UA')}</span>
              <span className="modal-resource-chip"><img src="/assets/ui/rubin.png" alt="" draggable={false} />{(user?.rubies ?? 0).toLocaleString('uk-UA')}</span>
            </div>
          </div>
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити рейтинг">✕</button>
        </header>
        <div className="social-modal-content leaderboard-content">
          <nav className="leaderboard-tabs" aria-label="Тип рейтингу">
            <button type="button" className={type === 'total' ? 'is-active' : ''} onClick={() => { setType('total'); setPage(1); }}><img src="/assets/ui/leaderboard-total.png" alt="" draggable={false} />Загальний</button>
            <button type="button" className={type === 'competition' ? 'is-active' : ''} onClick={() => { setType('competition'); setPage(1); }}><img src="/assets/ui/leaderboard-competition.png" alt="" draggable={false} />Змагання</button>
          </nav>
          {error && <p className="leaderboard-error" role="alert">{error}</p>}
          {type === 'competition' && pendingRewards.length > 0 && (
            <div className="leaderboard-pending-list">
              {pendingRewards.map((reward) => (
                <section className="leaderboard-claim-banner" key={reward.competitionId}>
                  <div><strong>Твоє #{reward.rank} місце!</strong><span>{rewardList(reward.rewards)}</span></div>
                  <button type="button" onClick={() => void claimReward(reward)} disabled={Boolean(claimingId)}><Trophy size={16} />{claimingId === reward.competitionId ? 'Забираємо…' : 'Забрати приз'}</button>
                </section>
              ))}
            </div>
          )}
          {loading ? <div className="leaderboard-state">Завантажуємо рейтинг…</div> : data && (
            <>
              {type === 'total' && <div className="leaderboard-summary"><span>Увесь зароблений XP</span><strong>{formatNumber(data.total)} гравців</strong></div>}
              {type === 'competition' && <div className="leaderboard-summary"><span>XP за період змагання</span><strong>{formatNumber(data.total)} гравців</strong></div>}
              <div className="leaderboard-list">
                {data.entries
                  .filter((player) => player.rank <= 3 || player.id !== user?.id)
                  .map((player) => renderEntry(player, player.id === user?.id))}
                {data.entries.length === 0 && (
                  <div className="leaderboard-state">
                    {competitionStatus === 'not_configured'
                      ? 'Наступне змагання ще не заплановане.'
                      : competitionStatus === 'scheduled'
                        ? 'Змагання ще не почалося. Підготуйся позмагатися за призи!'
                        : 'Поки немає результатів. Заробляй XP, щоб потрапити до рейтингу!'}
                  </div>
                )}
              </div>
              {data.pages > 1 && <nav className="leaderboard-pagination" aria-label="Сторінки рейтингу">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}><ChevronLeft size={16} />Назад</button>
                <span>{data.page} / {data.pages}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(data.pages, current + 1))} disabled={page >= data.pages}>Далі<ChevronRight size={16} /></button>
              </nav>}
              {data.self && <div className="leaderboard-my-rank"><span>ТВОЄ МІСЦЕ</span><strong>#{data.self.rank}</strong><span className="leaderboard-avatar">{data.self.avatar ? <img src={data.self.avatar} alt="" /> : data.self.username.slice(0, 1).toUpperCase()}</span><span>{data.self.username}</span><b>{formatNumber(data.self.xp)} XP</b></div>}
              {type === 'competition' && data.competitionStartAt && data.competitionEndAt && (
                <div className="leaderboard-competition-timing">
                  <div className={`leaderboard-countdown is-${competitionStatus}`}>{statusLabel}</div>
                  <div className="leaderboard-dates">
                    <span><small><img src="/assets/ui/leaderboard-start.png" alt="" draggable={false} />ПОЧАТОК</small>{formatDate(data.competitionStartAt)}</span>
                    <span><small><img src="/assets/ui/leaderboard-cup.png" alt="" draggable={false} />ЗАВЕРШЕННЯ</small>{formatDate(data.competitionEndAt)}</span>
                  </div>
                </div>
              )}
            </>
          )}
          <footer className="leaderboard-footer"><Award size={15} />{type === 'competition' ? 'Рейтинг рахує XP лише між датами змагання. Призи можна забрати після завершення.' : 'Загальний рейтинг формується за весь зароблений XP.'}</footer>
        </div>
      </section>
    </div>,
    document.querySelector('.app-shell') ?? document.body
  );
};
