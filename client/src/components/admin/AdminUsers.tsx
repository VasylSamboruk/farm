import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Ban, Coins, Eye, PackagePlus, Pencil, RotateCcw, Search, ShieldOff, Sparkles, Sprout, Trash2, UserRound, Users, X } from 'lucide-react';
import { adminApi, type AdminCatalogItem, type AdminFarmItem, type AdminUser } from '../../api/admin.api';
import { getLevelProgress } from '../../config/progression';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import type { TileData } from '../../store/useFarmStore';
import { loadGameImage, preloadGameImages } from '../../game/sprites';
import { FarmCanvas } from '../game/FarmCanvas';
import { useAdminToast } from './adminToast';

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Не вдалося виконати запит.';
  }
  return error instanceof Error ? error.message : 'Сталася невідома помилка.';
};

const formatNumber = (value: number) => value.toLocaleString('uk-UA');

const toFarmPreviewTiles = (farmItems: AdminFarmItem[]): Record<string, TileData> => {
  const tiles: Record<string, TileData> = {};
  for (const item of farmItems) {
    if (item.isDirt) {
      tiles[`${item.y},${item.x},-1`] = { type: 'dirt', flipX: item.flipX ?? false };
    } else {
      tiles[`${item.y},${item.x},${item.quadrant}`] = {
        type: 'item',
        itemId: item.itemId,
        stage: item.stage,
        quadrant: item.quadrant,
        occupiedQuadrants: item.occupiedQuadrants,
        occupiedCells: item.occupiedCells?.map((cell) => ({ row: cell.y, col: cell.x, quadrant: cell.quadrant })),
        flipX: item.flipX,
        placedAt: item.placedAt,
        lastHarvestedAt: item.lastHarvestedAt,
      };
    }
  }
  return tiles;
};

export const AdminUsers: React.FC = () => {
  const showToast = useAdminToast();
  const loadGameItems = useGameConfigStore((state) => state.loadItems);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [catalog, setCatalog] = useState<AdminCatalogItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [coinsDelta, setCoinsDelta] = useState('');
  const [xpDelta, setXpDelta] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [inventoryDelta, setInventoryDelta] = useState('1');
  const [farmItemId, setFarmItemId] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState<'user' | 'admin'>('user');
  const [banDuration, setBanDuration] = useState('10');
  const [banReason, setBanReason] = useState('');
  const [showFarmPreview, setShowFarmPreview] = useState(false);
  const [confirmFarmClear, setConfirmFarmClear] = useState(false);
  const [confirmProgressReset, setConfirmProgressReset] = useState(false);
  const [confirmAccountDelete, setConfirmAccountDelete] = useState(false);
  const [confirmFarmItemId, setConfirmFarmItemId] = useState<string | null>(null);
  const [editingFarmItemId, setEditingFarmItemId] = useState<string | null>(null);
  const [farmItemDraft, setFarmItemDraft] = useState({ x: '', y: '', quadrant: '', flipX: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reportError = useCallback((message: string) => {
    setError(message);
    showToast('error', message);
  }, [showToast]);

  const refreshUsers = async (query = search, requestedPage = page, preferredUserId = selectedUserId) => {
    setLoading(true);
    try {
      const result = await adminApi.getUsers(query, requestedPage);
      setUsers(result.users);
      setTotal(result.total);
      setPages(Math.max(1, result.pages));
      setPage(result.page);
      setSelectedUserId(result.users.some((entry) => entry.id === preferredUserId)
        ? preferredUserId
        : result.users[0]?.id ?? '');
    } catch (requestError) {
      reportError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await loadGameItems(true);
      const [loadedCatalog, result] = await Promise.all([
        adminApi.getCatalog(),
        adminApi.getUsers('', 1),
      ]);
      const gameConfig = useGameConfigStore.getState();
      if (gameConfig.error) throw new Error(gameConfig.error);
      await Promise.all([
        loadGameImage('/assets/fonik1.png'),
        loadGameImage('/assets/tiles/grass_tile.png'),
        loadGameImage('/assets/tiles/dirt_tile.png'),
        preloadGameImages(Object.values(gameConfig.items)),
      ]);
      if (!active) return;
      setCatalog(loadedCatalog);
      setUsers(result.users);
      setTotal(result.total);
      setPages(Math.max(1, result.pages));
      setSelectedUserId(result.users[0]?.id ?? '');
      if (result.users[0]) {
        setUsernameDraft(result.users[0].username);
        setRoleDraft(result.users[0].role);
      }
      if (result.users[0]) {
        setUsernameDraft(result.users[0].username);
        setRoleDraft(result.users[0].role);
      }
    };
    void initialize()
      .catch((requestError: unknown) => { if (active) reportError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadGameItems, reportError]);

  const selectedUser = users.find((entry) => entry.id === selectedUserId) ?? null;
  const productCatalog = catalog.filter((item) => item.yieldItem);
  const farmCatalog = catalog.filter((item) => !item.disabled && ['TREE', 'CROP', 'ANIMAL', 'BUILDING'].includes(item.type));

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    setPage(1);
    setError('');
    await refreshUsers(nextSearch, 1, '');
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    if (!selectedUser) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refreshUsers(search, page, selectedUser.id);
      setNotice(successMessage);
      showToast('success', successMessage);
      return true;
    } catch (requestError) {
      reportError(getErrorMessage(requestError));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleStats = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    const coins = Number(coinsDelta || 0);
    const xp = Number(xpDelta || 0);
    if (!Number.isSafeInteger(coins) || !Number.isSafeInteger(xp) || (coins === 0 && xp === 0)) {
      reportError('Введи цілу ненульову зміну монет або XP.');
      return;
    }
    await runAction(() => adminApi.updateStats(selectedUser.id, coins, xp), 'Баланс та досвід оновлено.');
    setCoinsDelta('');
    setXpDelta('');
  };

  const handleInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !inventoryItemId) {
      reportError('Обери продукт для інвентарю.');
      return;
    }
    const amount = Number(inventoryDelta);
    if (!Number.isSafeInteger(amount) || amount === 0) {
      reportError('Кількість має бути ненульовим цілим числом.');
      return;
    }
    await runAction(() => adminApi.updateInventory(selectedUser.id, inventoryItemId, amount), 'Інвентар гравця оновлено.');
  };

  const handleFarmItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !farmItemId) {
      reportError('Обери предмет для ферми.');
      return;
    }
    await runAction(() => adminApi.addFarmItem(selectedUser.id, farmItemId), 'Предмет безкоштовно додано на ферму.');
  };

  const handleProfileUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    await runAction(() => adminApi.updateProfile(selectedUser.id, {
      username: usernameDraft.trim(),
      role: roleDraft,
    }), 'Профіль гравця оновлено.');
  };

  const handleBan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser) return;
    const duration = banDuration === 'permanent' ? null : Number(banDuration);
    await runAction(() => adminApi.banUser(selectedUser.id, duration, banReason), duration === null ? 'Гравця заблоковано безстроково.' : 'Гравця тимчасово заблоковано.');
    setBanReason('');
  };

  const handleUnban = async () => {
    if (!selectedUser) return;
    await runAction(() => adminApi.unbanUser(selectedUser.id), 'Гравця розблоковано.');
  };

  const handleClearFarm = async () => {
    if (!selectedUser) return;
    await runAction(() => adminApi.clearFarm(selectedUser.id), 'Ферму повністю очищено.');
    setConfirmFarmClear(false);
    setShowFarmPreview(false);
  };

  const handleProgressReset = async () => {
    if (!selectedUser) return;
    const wasReset = await runAction(
      () => adminApi.resetProgress(selectedUser.id),
      'Ігровий прогрес скинуто до стартового стану.'
    );
    if (!wasReset) return;
    setConfirmProgressReset(false);
    setShowFarmPreview(false);
  };

  const handleDeleteFarmItem = async (item: AdminFarmItem) => {
    if (!selectedUser) return;
    await runAction(() => adminApi.deleteFarmItem(selectedUser.id, item), 'Предмет видалено з ферми.');
    setConfirmFarmItemId(null);
  };

  const startFarmItemEdit = (item: AdminFarmItem) => {
    const key = `${item.x},${item.y},${item.quadrant}`;
    setEditingFarmItemId(key);
    setFarmItemDraft({ x: String(item.x), y: String(item.y), quadrant: String(item.quadrant), flipX: item.flipX ?? false });
    setConfirmFarmItemId(null);
  };

  const saveFarmItemEdit = async (item: AdminFarmItem) => {
    if (!selectedUser) return;
    const changes = {
      x: Number(farmItemDraft.x),
      y: Number(farmItemDraft.y),
      quadrant: Number(farmItemDraft.quadrant),
      flipX: farmItemDraft.flipX,
    };
    if (![changes.x, changes.y, changes.quadrant].every(Number.isInteger) ||
        changes.x < 0 || changes.x > 14 || changes.y < 0 || changes.y > 14 || changes.quadrant < 0 || changes.quadrant > 3) {
      reportError('Координати мають бути в межах поля, сектор — від 0 до 3.');
      return;
    }
    await runAction(() => adminApi.updateFarmItem(selectedUser.id, item, changes), 'Позицію предмета оновлено.');
    setEditingFarmItemId(null);
  };

  const handleDeleteAccount = async () => {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.deleteUser(selectedUser.id);
      setConfirmAccountDelete(false);
      await refreshUsers(search, Math.min(page, Math.max(1, pages)), '');
      setNotice('Акаунт і ферму видалено.');
      showToast('success', 'Акаунт і ферму видалено.');
    } catch (requestError) {
      reportError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const openFarmPreview = async () => {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    try {
      await loadGameItems(true);
      const config = useGameConfigStore.getState();
      if (config.error) throw new Error(config.error);
      await Promise.all([
        loadGameImage('/assets/fonik1.png'),
        loadGameImage('/assets/tiles/grass_tile.png'),
        loadGameImage('/assets/tiles/dirt_tile.png'),
        preloadGameImages(Object.values(config.items)),
      ]);
      setShowFarmPreview(true);
    } catch (requestError) {
      reportError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <div className="admin-workspace">
          <aside className="admin-users-panel">
            <div className="admin-section-heading"><div><span className="admin-kicker">ОБЛІКОВІ ЗАПИСИ</span><h1>Гравці</h1></div><span className="admin-count"><Users size={15} />{total}</span></div>
            <form className="admin-search" onSubmit={handleSearch}>
              <Search size={16} />
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Нік або ID" aria-label="Пошук гравця за ніком або ID" />
              <button type="submit" aria-label="Шукати гравців"><Search size={15} /></button>
            </form>
            {error && <p className="admin-message admin-error" role="alert">{error}</p>}
            {loading ? <p className="admin-empty">Завантажуємо гравців...</p> : users.length === 0 ? <p className="admin-empty">Гравців не знайдено.</p> : (
              <div className="admin-user-list">
                {users.map((entry) => (
                  <button key={entry.id} className={entry.id === selectedUserId ? 'admin-user-row is-selected' : 'admin-user-row'} type="button" onClick={() => { setSelectedUserId(entry.id); setUsernameDraft(entry.username); setRoleDraft(entry.role); setNotice(''); setError(''); }}>
                    <span className="admin-avatar">{entry.avatar ? <img src={entry.avatar} alt="" /> : entry.username.slice(0, 1).toUpperCase()}</span>
                    <span className="admin-user-copy"><strong>{entry.username}</strong><small>{entry.isBanned ? 'Заблокований' : `ID: ${entry.id}`}</small></span>
                    <span className="admin-user-level"><img src="/assets/ui/lvl_ico.png" alt="" /><strong>{entry.level}</strong></span>
                  </button>
                ))}
              </div>
            )}
            <footer className="admin-pagination">
              <button type="button" disabled={page <= 1 || loading} onClick={() => void refreshUsers(search, page - 1)}>←</button>
              <span>{page} / {pages}</span>
              <button type="button" disabled={page >= pages || loading} onClick={() => void refreshUsers(search, page + 1)}>→</button>
            </footer>
          </aside>

          <section className="admin-details-panel" aria-label="Деталі гравця">
            {!selectedUser ? (
              <div className="admin-no-selection"><UserRound size={32} /><p>Обери гравця зі списку</p></div>
            ) : (
              <>
                <header className="admin-player-card">
                  <span className="admin-avatar admin-avatar-large">{selectedUser.avatar ? <img src={selectedUser.avatar} alt="" /> : selectedUser.username.slice(0, 1).toUpperCase()}</span>
                  <div className="admin-player-name"><span className="admin-kicker">ПРОФІЛЬ ГРАВЦЯ</span><h2>{selectedUser.username}</h2><code>ID: {selectedUser.id}</code></div>
                  <div className="admin-player-level"><img src="/assets/ui/lvl_ico.png" alt="" /><strong>{getLevelProgress(selectedUser.xp).level}</strong><span>РІВЕНЬ</span></div>
                </header>

                <div className="admin-stat-grid">
                  <div className="admin-stat-card"><img src="/assets/ui/coin.png" alt="" /><span>Монети</span><strong>{formatNumber(selectedUser.coins)}</strong></div>
                  <div className="admin-stat-card"><Sparkles size={22} /><span>Досвід</span><strong>{formatNumber(selectedUser.xp)} XP</strong></div>
                  <div className="admin-stat-card"><PackagePlus size={22} /><span>Предметів у фермі</span><strong>{selectedUser.farmItems.length}</strong></div>
                </div>

                <div className="admin-action-grid admin-moderation-grid">
                  <form className="admin-action-card" onSubmit={handleProfileUpdate}>
                    <div className="admin-action-title"><UserRound size={18} /><h3>Профіль і права</h3></div>
                    <label>Нік<input value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} minLength={2} maxLength={24} required /></label>
                    <label>Роль<select value={roleDraft} onChange={(event) => setRoleDraft(event.target.value as 'user' | 'admin')}><option value="user">Гравець</option><option value="admin">Адміністратор</option></select></label>
                    <button className="admin-primary-button" type="submit" disabled={busy}>Зберегти профіль</button>
                  </form>

                  <section className="admin-action-card admin-ban-card">
                    <div className="admin-action-title"><Ban size={18} /><h3>Блокування</h3></div>
                    {selectedUser.isBanned ? (
                      <>
                        <p>{selectedUser.banUntil ? `Заблокований до ${new Date(selectedUser.banUntil).toLocaleString('uk-UA')}` : 'Безстрокове блокування'}{selectedUser.banReason ? ` · ${selectedUser.banReason}` : ''}</p>
                        <button className="admin-primary-button" type="button" onClick={() => void handleUnban()} disabled={busy}><ShieldOff size={15} /> Розблокувати</button>
                      </>
                    ) : (
                      <form className="admin-ban-form" onSubmit={handleBan}>
                        <label>Строк<select value={banDuration} onChange={(event) => setBanDuration(event.target.value)}><option value="10">10 хвилин</option><option value="60">1 година</option><option value="1440">1 день</option><option value="10080">1 тиждень</option><option value="43200">1 місяць</option><option value="permanent">Безстроково</option></select></label>
                        <label>Причина<input value={banReason} onChange={(event) => setBanReason(event.target.value)} maxLength={300} placeholder="Необов’язково" /></label>
                        <button className="admin-danger-button" type="submit" disabled={busy || selectedUser.role === 'admin'}><Ban size={15} /> Заблокувати</button>
                      </form>
                    )}
                  </section>
                </div>

                {notice && <p className="admin-message admin-success" role="status">{notice}</p>}
                {error && <p className="admin-message admin-error" role="alert">{error}</p>}

                <div className="admin-action-grid">
                  <form className="admin-action-card" onSubmit={handleStats}>
                    <div className="admin-action-title"><Coins size={18} /><h3>Монети та досвід</h3></div>
                    <p>Додатне число нарахує, від’ємне — зніме.</p>
                    <div className="admin-input-pair">
                      <label>Монети<input type="number" step="1" value={coinsDelta} onChange={(event) => setCoinsDelta(event.target.value)} placeholder="0" /></label>
                      <label>XP<input type="number" step="1" value={xpDelta} onChange={(event) => setXpDelta(event.target.value)} placeholder="0" /></label>
                    </div>
                    <button className="admin-primary-button" type="submit" disabled={busy}>Застосувати</button>
                  </form>

                  <form className="admin-action-card" onSubmit={handleInventory}>
                    <div className="admin-action-title"><PackagePlus size={18} /><h3>Продукти в інвентар</h3></div>
                    <label>Продукт<select value={inventoryItemId} onChange={(event) => setInventoryItemId(event.target.value)}><option value="">Обери продукт</option>{productCatalog.map((item) => <option key={`${item.id}-${item.yieldItem}`} value={item.yieldItem}>{item.yieldName ?? item.name} · {item.yieldItem}</option>)}</select></label>
                    <label>Кількість<input type="number" step="1" value={inventoryDelta} onChange={(event) => setInventoryDelta(event.target.value)} placeholder="1 або -1" /></label>
                    <button className="admin-primary-button" type="submit" disabled={busy}>Оновити інвентар</button>
                  </form>

                  <form className="admin-action-card" onSubmit={handleFarmItem}>
                    <div className="admin-action-title"><Sprout size={18} /><h3>Предмет на ферму</h3></div>
                    <label>Дерево, культура, тварина або будівля<select value={farmItemId} onChange={(event) => setFarmItemId(event.target.value)}><option value="">Обери предмет</option>{farmCatalog.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.type}</option>)}</select></label>
                    <p>Сервер сам знайде перше вільне місце з правильною поверхнею.</p>
                    <button className="admin-primary-button" type="submit" disabled={busy}>Додати безкоштовно</button>
                  </form>

                  <section className="admin-action-card admin-farm-items">
                    <div className="admin-farm-heading"><div className="admin-action-title"><Sprout size={18} /><h3>Ферма гравця</h3></div><div className="admin-farm-buttons"><button type="button" onClick={() => void openFarmPreview()} disabled={busy}><Eye size={14} /> Переглянути</button><button type="button" onClick={() => setConfirmFarmClear(true)} disabled={busy || selectedUser.farmItems.length === 0}><Trash2 size={14} /> Очистити</button></div></div>
                    {confirmFarmClear && <div className="admin-inline-confirm"><span>Видалити все з ферми?</span><button type="button" onClick={() => void handleClearFarm()} disabled={busy}>Так</button><button type="button" onClick={() => setConfirmFarmClear(false)}>Ні</button></div>}
                    {selectedUser.farmItems.length === 0 ? <p>На фермі поки немає розміщених предметів.</p> : (
                      <ul>{selectedUser.farmItems.map((item, index) => <li key={`${item.itemId}-${item.x}-${item.y}-${item.quadrant}-${index}`}>
                        <span className="admin-farm-item-identity">{item.image && <img src={item.image} alt="" />}<span>{item.name}<small>{item.type} · колонка {item.x + 1}, ряд {item.y + 1}</small></span></span>
                        <div className="admin-farm-row-actions"><button type="button" className="admin-remove-item" onClick={() => startFarmItemEdit(item)} aria-label={`Редагувати ${item.name}`} title="Змінити позицію"><Pencil size={14} /></button><button type="button" className="admin-remove-item" onClick={() => setConfirmFarmItemId(`${item.x},${item.y},${item.quadrant}`)} aria-label={`Видалити ${item.name}`} title="Видалити"><Trash2 size={14} /></button></div>
                        {editingFarmItemId === `${item.x},${item.y},${item.quadrant}` && <div className="admin-farm-item-editor">
                          <label>X<input type="number" min="0" max="14" value={farmItemDraft.x} onChange={(event) => setFarmItemDraft((current) => ({ ...current, x: event.target.value }))} /></label>
                          <label>Y<input type="number" min="0" max="14" value={farmItemDraft.y} onChange={(event) => setFarmItemDraft((current) => ({ ...current, y: event.target.value }))} /></label>
                          <label>Сектор<select value={farmItemDraft.quadrant} onChange={(event) => setFarmItemDraft((current) => ({ ...current, quadrant: event.target.value }))}><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
                          <label className="admin-flip-field"><input type="checkbox" checked={farmItemDraft.flipX} onChange={(event) => setFarmItemDraft((current) => ({ ...current, flipX: event.target.checked }))} />Перевернути</label>
                          <button className="admin-primary-button" type="button" onClick={() => void saveFarmItemEdit(item)} disabled={busy}>Зберегти позицію</button>
                          <button className="admin-cancel-edit" type="button" onClick={() => setEditingFarmItemId(null)}>Скасувати</button>
                        </div>}
                        {confirmFarmItemId === `${item.x},${item.y},${item.quadrant}` && <div className="admin-inline-confirm"><span>Видалити?</span><button type="button" onClick={() => void handleDeleteFarmItem(item)} disabled={busy}>Так</button><button type="button" onClick={() => setConfirmFarmItemId(null)}>Ні</button></div>}
                      </li>)}</ul>
                    )}
                  </section>

                  <section className="admin-action-card admin-inventory-list">
                    <div className="admin-action-title"><PackagePlus size={18} /><h3>Інвентар гравця</h3></div>
                    {Object.entries(selectedUser.inventory).filter(([, amount]) => amount > 0).length === 0 ? <p>Інвентар порожній.</p> : (
                      <ul>{Object.entries(selectedUser.inventory).filter(([, amount]) => amount > 0).map(([itemId, amount]) => <li key={itemId}><span>{productCatalog.find((item) => item.yieldItem === itemId)?.yieldName ?? itemId}</span><strong>{formatNumber(amount)}</strong></li>)}</ul>
                    )}
                  </section>

                  <section className="admin-action-card admin-progress-reset">
                    <div className="admin-action-title"><RotateCcw size={18} /><h3>Скинути ігровий прогрес</h3></div>
                    <p>Поверне гравцеві 1000 монет, рівень 1, 0 XP, порожній інвентар і стартову ферму. Логін, пароль, роль та соціальні зв’язки залишаться.</p>
                    {confirmProgressReset ? (
                      <div className="admin-inline-confirm">
                        <span>Скинути прогрес гравця {selectedUser.username}? Його ферма та інвентар будуть замінені стартовими.</span>
                        <button type="button" onClick={() => void handleProgressReset()} disabled={busy}>Скинути</button>
                        <button type="button" onClick={() => setConfirmProgressReset(false)} disabled={busy}>Скасувати</button>
                      </div>
                    ) : (
                      <button className="admin-danger-button" type="button" onClick={() => setConfirmProgressReset(true)} disabled={busy}>
                        <RotateCcw size={15} />Скинути прогрес
                      </button>
                    )}
                  </section>

                  <section className="admin-action-card admin-delete-account">
                    <div className="admin-action-title"><Trash2 size={18} /><h3>Видалення акаунта</h3></div>
                    <p>Видалить профіль і всю ферму. Адміністраторів видалити не можна.</p>
                    {confirmAccountDelete ? <div className="admin-inline-confirm"><span>Видалити {selectedUser.username}?</span><button type="button" onClick={() => void handleDeleteAccount()} disabled={busy}>Так, видалити</button><button type="button" onClick={() => setConfirmAccountDelete(false)}>Скасувати</button></div> : <button className="admin-danger-button" type="button" onClick={() => setConfirmAccountDelete(true)} disabled={selectedUser.role === 'admin'}><Trash2 size={15} /> Видалити акаунт</button>}
                  </section>

                </div>
              </>
            )}
          </section>

        </div>
        {showFarmPreview && selectedUser && <div className="admin-farm-overlay"><FarmCanvas readOnly previewTiles={toFarmPreviewTiles(selectedUser.farmItems)} /><header className="admin-farm-overlay-header"><div><strong>{selectedUser.username}</strong><small>ID: {selectedUser.id}</small></div><button type="button" onClick={() => setShowFarmPreview(false)} aria-label="Закрити перегляд ферми"><X size={18} /></button></header></div>}
    </>
  );
};