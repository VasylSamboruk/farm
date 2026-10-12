import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Award, Plus, Save, Trash2, Power, CalendarPlus, Eye, EyeOff, Search, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { adminApi, type AdminCatalogItem, type AdminLeaderboardCompetition, type AdminLeaderboardPlayer, type AdminLeaderboardPlayers, type LeaderboardPrizeRange } from '../../api/admin.api';
import type { LevelReward } from '../../types/game';
import { useAdminToast } from './adminToast';

interface RewardDraft {
  kind: LevelReward['kind'];
  amount: string;
  itemId: string;
}

interface RangeDraft {
  id: number;
  rankFrom: string;
  rankTo: string;
  rewards: RewardDraft[];
}

const toDateTimeLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const formatCompetitionDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Не задано';

const toRangeDrafts = (prizeRanges: LeaderboardPrizeRange[]): RangeDraft[] => prizeRanges.map((range, id) => ({
  id,
  rankFrom: String(range.rankFrom),
  rankTo: String(range.rankTo),
  rewards: range.rewards.map((reward) => ({
    kind: reward.kind,
    amount: String(reward.amount),
    itemId: reward.kind === 'item' ? reward.itemId : '',
  })),
}));

const getErrorMessage = (error: unknown) => axios.isAxiosError<{ message?: string }>(error)
  ? error.response?.data?.message ?? 'Не вдалося зберегти призи рейтингу.'
  : error instanceof Error ? error.message : 'Сталася невідома помилка.';

export const AdminLeaderboard: React.FC = () => {
  const showToast = useAdminToast();
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [competitions, setCompetitions] = useState<AdminLeaderboardCompetition[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
  const [ranges, setRanges] = useState<RangeDraft[]>([]);
  const [competitionStartAt, setCompetitionStartAt] = useState('');
  const [competitionEndAt, setCompetitionEndAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);
  const [playerType, setPlayerType] = useState<'total' | 'competition'>('total');
  const [playerCompetitionId, setPlayerCompetitionId] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerPage, setPlayerPage] = useState(1);
  const [playerData, setPlayerData] = useState<AdminLeaderboardPlayers | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [updatingPlayerId, setUpdatingPlayerId] = useState('');

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setPlayersLoading(true);
      void adminApi.getLeaderboardPlayers({
        type: playerType,
        competitionId: playerType === 'competition' ? playerCompetitionId : undefined,
        page: playerPage,
        search: playerSearch,
      })
        .then((result) => { if (active) setPlayerData(result); })
        .catch((loadError: unknown) => {
          if (active) {
            const message = getErrorMessage(loadError);
            setError(message);
            showToast('error', message);
          }
        })
        .finally(() => { if (active) setPlayersLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [playerPage, playerSearch, playerType, playerCompetitionId, showToast]);

  useEffect(() => {
    let active = true;
    void Promise.all([adminApi.getCatalog(), adminApi.getLeaderboardCompetitions()])
      .then(([items, result]) => {
        if (!active) return;
        setCatalog(items.filter((item) => !item.disabled));
        setCompetitions(result.competitions);
        setPlayerCompetitionId(result.activeCompetitionId || result.competitions[0]?.competitionId || '');
        const initial = result.competitions.find((entry) => entry.competitionId === result.activeCompetitionId)
          ?? result.competitions[0];
        if (initial) {
          setSelectedCompetitionId(initial.competitionId);
          setCompetitionStartAt(toDateTimeLocal(initial.competitionStartAt));
          setCompetitionEndAt(toDateTimeLocal(initial.competitionEndAt));
          setRanges(toRangeDrafts(initial.prizeRanges));
        }
      })
      .catch((loadError: unknown) => { if (active) setError(getErrorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectCompetition = (competition: AdminLeaderboardCompetition) => {
    setSelectedCompetitionId(competition.competitionId);
    setCompetitionStartAt(toDateTimeLocal(competition.competitionStartAt));
    setCompetitionEndAt(toDateTimeLocal(competition.competitionEndAt));
    setRanges(toRangeDrafts(competition.prizeRanges));
    setError('');
  };

  const startNewCompetition = () => {
    setSelectedCompetitionId(null);
    setCompetitionStartAt('');
    setCompetitionEndAt('');
    setRanges([]);
    setError('');
  };

  const updateRange = (id: number, update: (range: RangeDraft) => RangeDraft) => {
    setRanges((current) => current.map((range) => range.id === id ? update(range) : range));
  };

  const addRange = () => {
    const id = Date.now();
    setRanges((current) => [...current, {
      id,
      rankFrom: '',
      rankTo: '',
      rewards: [{ kind: 'coins', amount: '1000', itemId: '' }],
    }]);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed: LeaderboardPrizeRange[] = [];
    for (const range of ranges) {
      const rankFrom = Number(range.rankFrom);
      const rankTo = Number(range.rankTo);
      if (!Number.isSafeInteger(rankFrom) || !Number.isSafeInteger(rankTo) || rankFrom < 1 || rankTo < rankFrom || rankTo > 1_000_000) {
        setError('Вкажи коректні місця в діапазоні від 1 до 1 000 000.');
        return;
      }
      if (range.rewards.length < 1 || range.rewards.length > 20) {
        setError('Для кожного діапазону додай від 1 до 20 призів.');
        return;
      }
      const rewards: LevelReward[] = [];
      for (const reward of range.rewards) {
        const amount = Number(reward.amount);
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100_000 ||
            (reward.kind === 'item' && !catalog.some((item) => item.id === reward.itemId))) {
          setError('Перевір кількість та вибір предметів у призах.');
          return;
        }
        rewards.push(reward.kind === 'item'
          ? { kind: 'item', itemId: reward.itemId, amount }
          : { kind: reward.kind, amount });
      }
      parsed.push({ rankFrom, rankTo, rewards });
    }
    parsed.sort((left, right) => left.rankFrom - right.rankFrom);
    if (parsed.some((range, index) => index > 0 && range.rankFrom <= parsed[index - 1].rankTo)) {
      setError('Діапазони місць не можуть перетинатися.');
      return;
    }
    if (!competitionStartAt || !competitionEndAt ||
        !Number.isFinite(new Date(competitionStartAt).getTime()) ||
        !Number.isFinite(new Date(competitionEndAt).getTime()) ||
        new Date(competitionEndAt) <= new Date(competitionStartAt)) {
      setError('Вкажи коректні дату й час початку та завершення змагання.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saveCompetition = selectedCompetitionId
        ? adminApi.updateLeaderboardCompetition.bind(adminApi, selectedCompetitionId)
        : adminApi.createLeaderboardCompetition;
      const saved = await saveCompetition(
        parsed,
        new Date(competitionStartAt).toISOString(),
        new Date(competitionEndAt).toISOString(),
      );
      setCompetitions(saved.competitions);
      const savedCompetition = saved.competitions.find((entry) => entry.competitionId === selectedCompetitionId)
        ?? saved.competitions.find((entry) => entry.competitionId === saved.activeCompetitionId);
      if (savedCompetition) selectCompetition(savedCompetition);
      showToast('success', selectedCompetitionId ? 'Змагання та призи оновлено.' : 'Нове змагання та призи створено.');
    } catch (saveError) {
      const message = getErrorMessage(saveError);
      setError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCompetition = async (competition: AdminLeaderboardCompetition) => {
    setSaving(true);
    setError('');
    try {
      const result = await adminApi.setLeaderboardCompetitionActive(competition.competitionId, !competition.isActive);
      setCompetitions(result.competitions);
      const updated = result.competitions.find((entry) => entry.competitionId === competition.competitionId);
      if (updated) selectCompetition(updated);
      showToast('success', updated?.isActive ? 'Змагання активовано.' : 'Змагання деактивовано.');
    } catch (toggleError) {
      const message = getErrorMessage(toggleError);
      setError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCompetition = async (competition: AdminLeaderboardCompetition) => {
    if (competition.isActive || !window.confirm('Видалити змагання назавжди? Будуть видалені всі його результати XP та невидані нагороди.')) return;
    setSaving(true);
    setError('');
    try {
      const result = await adminApi.deleteLeaderboardCompetition(competition.competitionId);
      setCompetitions(result.competitions);
      const next = result.competitions.find((entry) => entry.competitionId === result.activeCompetitionId)
        ?? result.competitions[0];
      if (next) selectCompetition(next);
      else startNewCompetition();
      showToast('success', 'Змагання, результати та невидані нагороди видалено.');
    } catch (deleteError) {
      const message = getErrorMessage(deleteError);
      setError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const togglePlayerVisibility = async (player: AdminLeaderboardPlayer) => {
    setUpdatingPlayerId(player.id);
    try {
      await adminApi.setLeaderboardPlayerVisibility(player.id, {
        type: playerType,
        competitionId: playerType === 'competition' ? playerCompetitionId : undefined,
        hidden: !player.hidden,
      });
      const result = await adminApi.getLeaderboardPlayers({
        type: playerType,
        competitionId: playerType === 'competition' ? playerCompetitionId : undefined,
        page: playerPage,
        search: playerSearch,
      });
      setPlayerData(result);
      showToast('success', player.hidden ? 'Гравця повернуто до рейтингу.' : 'Гравця приховано з рейтингу.');
    } catch (visibilityError) {
      const message = getErrorMessage(visibilityError);
      setError(message);
      showToast('error', message);
    } finally {
      setUpdatingPlayerId('');
    }
  };

  const selectedCompetition = competitions.find((entry) => entry.competitionId === selectedCompetitionId) ?? null;
  const competitionIsActive = Boolean(
    selectedCompetition?.isActive &&
    competitionStartAt && competitionEndAt &&
    now >= new Date(competitionStartAt).getTime() &&
    now < new Date(competitionEndAt).getTime(),
  );
  const competitionHasEnded = Boolean(competitionEndAt && now >= new Date(competitionEndAt).getTime());

  return (
    <section className="admin-leaderboard-page" aria-labelledby="admin-leaderboard-title">
      <header className="admin-shop-heading">
        <div><span className="admin-eyebrow">ЗМАГАННЯ ГРАВЦІВ</span><h1 id="admin-leaderboard-title">Рейтинг і призи</h1><p>Заплануй одне змагання XP, налаштуй нагороди за місця. Після завершення переможці зможуть забрати приз у грі.</p></div>
        <div className="admin-shop-total"><Award size={18} /><strong>{ranges.length}</strong><span>діапазонів</span></div>
      </header>
      {error && <p className="admin-alert is-error" role="alert">{error}</p>}
      {loading ? <div className="admin-state"><Award size={24} /><span>Завантажуємо призи рейтингу…</span></div> : (
        <form className="admin-leaderboard-editor" onSubmit={(event) => void save(event)}>
          <section className="admin-leaderboard-range admin-leaderboard-competition-list">
            <header>
              <strong>Змагання</strong>
              <button className="admin-secondary-button" type="button" onClick={startNewCompetition} disabled={saving}>
                <CalendarPlus size={15} />Нове змагання
              </button>
            </header>
            {competitions.length === 0
              ? <p className="admin-level-rewards-empty">Змагань ще немає. Створи перше змагання та налаштуй його призи.</p>
              : <div className="admin-leaderboard-competition-items">
                {competitions.map((competition) => {
                  const starts = competition.competitionStartAt ? new Date(competition.competitionStartAt).getTime() : 0;
                  const ends = competition.competitionEndAt ? new Date(competition.competitionEndAt).getTime() : 0;
                  const running = competition.isActive && now >= starts && now < ends;
                  const ended = now >= ends;
                  return (
                    <article className={`admin-leaderboard-competition-item${selectedCompetitionId === competition.competitionId ? ' is-selected' : ''}`} key={competition.competitionId}>
                      <button className="admin-leaderboard-competition-select" type="button" onClick={() => selectCompetition(competition)}>
                        <strong>{formatCompetitionDate(competition.competitionStartAt)}</strong>
                        <span>до {formatCompetitionDate(competition.competitionEndAt)}</span>
                        <small>{running ? 'Триває' : ended ? 'Завершено' : competition.isActive ? 'Заплановано' : 'Неактивне'} · {competition.prizeRanges.length} діапазонів призів</small>
                        <span className="admin-leaderboard-edit-hint"><Pencil size={12} />Редагувати призи й терміни</span>
                      </button>
                      <button className="admin-secondary-button" type="button" onClick={() => void toggleCompetition(competition)} disabled={saving || (!competition.isActive && (competition.prizesApplied || ended))} aria-label={competition.isActive ? 'Деактивувати змагання' : 'Активувати змагання'} title={competition.isActive ? 'Деактивувати' : 'Активувати'}>
                        <Power size={15} />
                        <span>{competition.isActive ? 'Деактивувати' : 'Активувати'}</span>
                      </button>
                      <button className="admin-level-reward-remove" type="button" onClick={() => void deleteCompetition(competition)} disabled={saving || competition.isActive} aria-label="Видалити змагання" title={competition.isActive ? 'Спочатку деактивуй змагання' : 'Видалити змагання'}>
                        <Trash2 size={15} />
                      </button>
                    </article>
                  );
                })}
              </div>}
          </section>
          <section className="admin-leaderboard-range admin-leaderboard-schedule">
            <header><strong>{selectedCompetitionId ? 'Редагування змагання' : 'Нове змагання'}</strong><span>{competitionIsActive ? 'Змагання триває' : competitionHasEnded ? 'Завершено' : selectedCompetition?.isActive ? 'Заплановано' : 'Неактивне'}</span></header>
            <div className="admin-leaderboard-ranks">
              <label>Початок<input type="datetime-local" required value={competitionStartAt} disabled={competitionIsActive || Boolean(selectedCompetition?.prizesApplied)} onChange={(event) => setCompetitionStartAt(event.target.value)} /></label>
              <label>Завершення<input type="datetime-local" required value={competitionEndAt} disabled={competitionIsActive || Boolean(selectedCompetition?.prizesApplied)} onChange={(event) => setCompetitionEndAt(event.target.value)} /></label>
            </div>
            <p>{competitionIsActive
              ? 'Під час змагання можна редагувати призи, але дати зафіксовані.'
              : selectedCompetition?.prizesApplied
                ? 'Змагання завершене, його результати та призи вже зафіксовано.'
                : 'Вкажи дату та час у своєму часовому поясі. Неактивне змагання не отримує XP.'}</p>
          </section>
          {ranges.map((range) => (
            <section className="admin-leaderboard-range" key={range.id}>
              <header>
                <strong>Діапазон місць</strong>
                <button className="admin-level-reward-remove" type="button" onClick={() => setRanges((current) => current.filter((entry) => entry.id !== range.id))} aria-label="Видалити діапазон"><Trash2 size={16} /></button>
              </header>
              <div className="admin-leaderboard-ranks">
                <label>Місце від<input type="number" min="1" max="1000000" value={range.rankFrom} onChange={(event) => updateRange(range.id, (entry) => ({ ...entry, rankFrom: event.target.value }))} placeholder="1" /></label>
                <label>Місце до<input type="number" min="1" max="1000000" value={range.rankTo} onChange={(event) => updateRange(range.id, (entry) => ({ ...entry, rankTo: event.target.value }))} placeholder="1" /></label>
              </div>
              <div className="admin-leaderboard-rewards">
                {range.rewards.map((reward, index) => (
                  <div className={`admin-leaderboard-reward-row${reward.kind === 'item' ? ' has-item' : ''}`} key={`${range.id}-${index}`}>
                    <label>Приз
                      <select value={reward.kind} onChange={(event) => updateRange(range.id, (entry) => ({
                        ...entry,
                        rewards: entry.rewards.map((item, row) => row === index ? { ...item, kind: event.target.value as RewardDraft['kind'], itemId: '' } : item),
                      }))}>
                        <option value="coins">Монети</option><option value="rubies">Рубіни</option><option value="item">Предмет</option>
                      </select>
                    </label>
                    {reward.kind === 'item' && <label>Предмет
                      <select value={reward.itemId} onChange={(event) => updateRange(range.id, (entry) => ({
                        ...entry,
                        rewards: entry.rewards.map((item, row) => row === index ? { ...item, itemId: event.target.value } : item),
                      }))}>
                        <option value="">Обери предмет</option>{catalog.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                      </select>
                    </label>}
                    <label>Кількість<input type="number" min="1" max="100000" value={reward.amount} onChange={(event) => updateRange(range.id, (entry) => ({
                      ...entry,
                      rewards: entry.rewards.map((item, row) => row === index ? { ...item, amount: event.target.value } : item),
                    }))} /></label>
                    <button className="admin-level-reward-remove" type="button" onClick={() => updateRange(range.id, (entry) => ({ ...entry, rewards: entry.rewards.filter((_, row) => row !== index) }))} aria-label={`Видалити приз ${index + 1}`}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <button className="admin-secondary-button" type="button" onClick={() => updateRange(range.id, (entry) => ({ ...entry, rewards: [...entry.rewards, { kind: 'coins', amount: '1000', itemId: '' }] }))} disabled={range.rewards.length >= 20}><Plus size={14} />Додати приз</button>
            </section>
          ))}
          {ranges.length === 0 && <p className="admin-level-rewards-empty">Призів ще немає. Додай діапазон місць, наприклад 1–1, 2–3 або 5–10.</p>}
          <footer className="admin-level-reward-actions">
            <button className="admin-secondary-button" type="button" onClick={addRange} disabled={ranges.length >= 100}><Plus size={15} />Додати діапазон місць</button>
            <button className="admin-primary-button" type="submit" disabled={saving || Boolean(selectedCompetition?.prizesApplied)}><Save size={15} />{saving ? 'Зберігаємо…' : selectedCompetitionId ? 'Зберегти змагання' : 'Створити змагання'}</button>
          </footer>
        </form>
      )}
      <section className="admin-leaderboard-range admin-leaderboard-players">
        <header className="admin-leaderboard-players-heading">
          <div><strong>Гравці рейтингу</strong><span>Приховування змінює лише видимість — XP та отримані нагороди зберігаються.</span></div>
          <b>{playerData?.total ?? 0} гравців</b>
        </header>
        <div className="admin-leaderboard-player-filters">
          <label>Рейтинг
            <select value={playerType} onChange={(event) => { setPlayerType(event.target.value as 'total' | 'competition'); setPlayerPage(1); }}>
              <option value="total">Загальний</option>
              <option value="competition">Змагання</option>
            </select>
          </label>
          {playerType === 'competition' && <label>Змагання
            <select value={playerCompetitionId} onChange={(event) => { setPlayerCompetitionId(event.target.value); setPlayerPage(1); }}>
              <option value="">Обери змагання</option>
              {competitions.map((competition) => <option value={competition.competitionId} key={competition.competitionId}>
                {formatCompetitionDate(competition.competitionStartAt)} · {competition.isActive ? 'активне' : competition.prizesApplied ? 'завершене' : 'неактивне'}
              </option>)}
            </select>
          </label>}
          <label className="admin-leaderboard-player-search"><span>Пошук гравця</span><div><Search size={15} /><input value={playerSearch} onChange={(event) => { setPlayerSearch(event.target.value); setPlayerPage(1); }} placeholder="Ім’я гравця" /></div></label>
        </div>
        {playersLoading ? <div className="admin-state"><Award size={20} /><span>Завантажуємо гравців…</span></div>
          : playerType === 'competition' && !playerCompetitionId ? <p className="admin-level-rewards-empty">Обери змагання, щоб переглянути його учасників.</p>
            : !playerData?.entries.length ? <p className="admin-level-rewards-empty">Гравців не знайдено.</p>
              : <div className="admin-leaderboard-player-list">
                {playerData.entries.map((player) => (
                  <article className={`admin-leaderboard-player${player.hidden ? ' is-hidden' : ''}`} key={player.id}>
                    <span className="admin-leaderboard-player-rank">{player.hidden ? 'Приховано' : `#${player.rank ?? '—'}`}</span>
                    <span className="admin-leaderboard-player-avatar">{player.avatar ? <img src={player.avatar} alt="" /> : player.username.slice(0, 1).toUpperCase()}</span>
                    <span className="admin-leaderboard-player-copy"><strong>{player.username}</strong><small>Рівень {player.level} · {player.xp.toLocaleString('uk-UA')} XP{player.isOnline ? ' · Онлайн' : ''}</small></span>
                    <button className="admin-secondary-button" type="button" onClick={() => void togglePlayerVisibility(player)} disabled={Boolean(updatingPlayerId)} title={player.hidden ? 'Повернути в рейтинг' : 'Приховати з рейтингу'}>
                      {player.hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                      <span>{updatingPlayerId === player.id ? 'Зберігаємо…' : player.hidden ? 'Показати' : 'Приховати'}</span>
                    </button>
                  </article>
                ))}
              </div>}
        {playerData && playerData.pages > 1 && <nav className="admin-leaderboard-player-pagination" aria-label="Сторінки гравців рейтингу">
          <button className="admin-secondary-button" type="button" onClick={() => setPlayerPage((page) => Math.max(1, page - 1))} disabled={playerPage <= 1 || playersLoading}><ChevronLeft size={15} />Назад</button>
          <span>{playerData.page} / {playerData.pages}</span>
          <button className="admin-secondary-button" type="button" onClick={() => setPlayerPage((page) => Math.min(playerData.pages, page + 1))} disabled={playerPage >= playerData.pages || playersLoading}>Далі<ChevronRight size={15} /></button>
        </nav>}
      </section>
    </section>
  );
};
