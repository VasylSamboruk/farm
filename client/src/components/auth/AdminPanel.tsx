import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Coins, PackagePlus, Search, ShieldCheck, Sparkles, Sprout, UserRound, Users } from 'lucide-react';
import { adminApi, type AdminCatalogItem, type AdminUser } from '../../api/admin.api';
import { getLevelProgress } from '../../config/progression';

interface AdminPanelProps {
  onBack: () => void;
}

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Не вдалося виконати запит.';
  }
  return error instanceof Error ? error.message : 'Сталася невідома помилка.';
};

const formatNumber = (value: number) => value.toLocaleString('uk-UA');

export const AdminPanel: React.FC<AdminPanelProps> = ({ onBack }) => {
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([adminApi.getCatalog(), adminApi.getUsers('', 1)])
      .then(([loadedCatalog, result]) => {
        if (!active) return;
        setCatalog(loadedCatalog);
        setUsers(result.users);
        setTotal(result.total);
        setPages(Math.max(1, result.pages));
        setSelectedUserId(result.users[0]?.id ?? '');
      })
      .catch((requestError: unknown) => {
        if (active) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const selectedUser = users.find((entry) => entry.id === selectedUserId) ?? null;
  const productCatalog = catalog.filter((item) => item.yieldItem);
  const farmCatalog = catalog.filter((item) => ['TREE', 'CROP', 'ANIMAL', 'BUILDING'].includes(item.type));

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    setSearch(nextSearch);
    setPage(1);
    setError('');
    await refreshUsers(nextSearch, 1, '');
  };

  const runAction = async (action: () => Promise<unknown>, successMessage: string) => {
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refreshUsers(search, page, selectedUser.id);
      setNotice(successMessage);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
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
      setError('Введи цілу ненульову зміну монет або XP.');
      return;
    }
    await runAction(() => adminApi.updateStats(selectedUser.id, coins, xp), 'Баланс та досвід оновлено.');
    setCoinsDelta('');
    setXpDelta('');
  };

  const handleInventory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !inventoryItemId) {
      setError('Обери продукт для інвентарю.');
      return;
    }
    const amount = Number(inventoryDelta);
    if (!Number.isSafeInteger(amount) || amount === 0) {
      setError('Кількість має бути ненульовим цілим числом.');
      return;
    }
    await runAction(() => adminApi.updateInventory(selectedUser.id, inventoryItemId, amount), 'Інвентар гравця оновлено.');
  };

  const handleFarmItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUser || !farmItemId) {
      setError('Обери предмет для ферми.');
      return;
    }
    await runAction(() => adminApi.addFarmItem(selectedUser.id, farmItemId), 'Предмет безкоштовно додано на ферму.');
  };

  return (
    <main className="profile-screen scenic-screen farmer-lobby admin-lobby">
      <div className="farmer-main">
        <header className="farmer-topbar admin-topbar">
          <div className="wood-logo admin-logo"><Sprout size={20} /><span>FARM<span>CANVAS</span></span><Sprout size={20} /></div>
          <div className="admin-topbar-title"><ShieldCheck size={19} /><span>Адмін-панель</span><strong>{formatNumber(total)} гравців</strong></div>
          <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft size={17} /><span>До профілю</span></button>
        </header>

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
                  <button key={entry.id} className={entry.id === selectedUserId ? 'admin-user-row is-selected' : 'admin-user-row'} type="button" onClick={() => { setSelectedUserId(entry.id); setNotice(''); setError(''); }}>
                    <span className="admin-avatar">{entry.avatar ? <img src={entry.avatar} alt="" /> : entry.username.slice(0, 1).toUpperCase()}</span>
                    <span className="admin-user-copy"><strong>{entry.username}</strong><small>ID: {entry.id}</small></span>
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
                    <div className="admin-action-title"><Sprout size={18} /><h3>Ферма гравця</h3></div>
                    {selectedUser.farmItems.length === 0 ? <p>На фермі поки немає розміщених предметів.</p> : (
                      <ul>{selectedUser.farmItems.map((item, index) => <li key={`${item.itemId}-${item.x}-${item.y}-${item.quadrant}-${index}`}><span>{item.name}<small>{item.type} · колонка {item.x + 1}, ряд {item.y + 1}</small></span><strong>{item.itemId}</strong></li>)}</ul>
                    )}
                  </section>

                  <section className="admin-action-card admin-inventory-list">
                    <div className="admin-action-title"><PackagePlus size={18} /><h3>Інвентар гравця</h3></div>
                    {Object.entries(selectedUser.inventory).filter(([, amount]) => amount > 0).length === 0 ? <p>Інвентар порожній.</p> : (
                      <ul>{Object.entries(selectedUser.inventory).filter(([, amount]) => amount > 0).map(([itemId, amount]) => <li key={itemId}><span>{productCatalog.find((item) => item.yieldItem === itemId)?.yieldName ?? itemId}</span><strong>{formatNumber(amount)}</strong></li>)}</ul>
                    )}
                  </section>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};