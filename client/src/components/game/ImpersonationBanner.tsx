import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, X } from 'lucide-react';
import { useImpersonationStore } from '../../store/impersonationStore';
import { useAuthStore } from '../../store/authStore';
import { useGameConfigStore } from '../../store/useGameConfigStore';
import { stopImpersonation } from '../../game/adminImpersonation';
import { adminApi } from '../../api/admin.api';
import { AdminPlayersModal } from './AdminPlayersModal';
import type { AdminGiftReward } from '../../types/game';

type Tool = 'inventory' | 'message' | 'ban' | 'players';
type NoticeKind = 'message' | 'warning' | 'gift';

const BAN_OPTIONS: { label: string; value: number | null }[] = [
  { label: '10 хвилин', value: 10 },
  { label: '1 година', value: 60 },
  { label: '1 доба', value: 1440 },
  { label: '7 днів', value: 10080 },
  { label: '30 днів', value: 43200 },
  { label: 'Назавжди', value: null },
];

const KIND_META: Record<NoticeKind, { label: string; icon: string; titlePlaceholder: string; textPlaceholder: string; hint: string }> = {
  message: { label: 'Повідомлення', icon: 'mail', titlePlaceholder: 'Наприклад: Звістка від адміністрації', textPlaceholder: 'Текст повідомлення для гравця', hint: 'Гравець побачить звичайне повідомлення і натисне «Зрозуміло».' },
  warning: { label: 'Попередження', icon: 'warning', titlePlaceholder: 'Наприклад: Порушення правил гри', textPlaceholder: 'Що саме порушено і що буде, якщо це повториться', hint: 'Гравець побачить червоне попередження і має підтвердити, що прочитав.' },
  gift: { label: 'Подарунок', icon: 'gift', titlePlaceholder: 'Наприклад: Подарунок до свята', textPlaceholder: 'Побажання або пояснення (необов’язково)', hint: 'Гравець побачить вікно подарунка і сам натисне «Забрати».' },
};

const errorText = (error: unknown) => {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? (error instanceof Error ? error.message : 'Щось пішло не так.');
};

export const AdminIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 20 }) => (
  <img className="admin-icon" src={name.startsWith('/') ? name : `/assets/ui/admin/${name}.png`} width={size} height={size} alt="" draggable={false} />
);

const ToolDialog: React.FC<{ title: string; icon: string; onClose: () => void; children: React.ReactNode }> = ({ title, icon, onClose, children }) => createPortal(
  <div className="imp-tool-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="imp-tool-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <header className="imp-tool-header">
        <span><AdminIcon name={icon} size={26} /> {title}</span>
        <button type="button" className="imp-tool-close" onClick={onClose} aria-label="Закрити"><X size={16} /></button>
      </header>
      <div className="imp-tool-body">{children}</div>
    </section>
  </div>,
  document.body,
);

const InventoryTool: React.FC<{ targetId: string }> = ({ targetId }) => {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const items = useGameConfigStore((state) => state.items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = [
    ...Object.entries(user?.inventory ?? {}).map(([id, amount]) => ({ scope: 'harvest' as const, id, amount })),
    ...Object.entries(user?.itemInventory ?? {}).map(([id, amount]) => ({ scope: 'items' as const, id, amount })),
  ].filter((row) => row.amount > 0);

  const run = async (scope: 'harvest' | 'items' | 'all', itemId?: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.removeInventory(targetId, scope, itemId);
      updateUser({ inventory: result.inventory, itemInventory: result.itemInventory });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {rows.length === 0 ? <p className="imp-empty">Склад порожній.</p> : (
        <ul className="imp-inventory-list">
          {rows.map((row) => {
            const item = items[row.id];
            const image = item?.shopImage ?? item?.growthImages?.at(-1);
            return (
              <li key={`${row.scope}-${row.id}`}>
                <span className="imp-inventory-icon">{image ? <img src={image} alt="" draggable={false} /> : (item?.shopIcon ?? '📦')}</span>
                <span className="imp-inventory-name">{item?.name ?? row.id}</span>
                <strong>× {row.amount}</strong>
                <button type="button" className="imp-icon-btn" disabled={busy} onClick={() => void run(row.scope, row.id)} aria-label="Видалити" title="Видалити"><AdminIcon name="trash" size={26} /></button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="imp-error">{error}</p>}
      <button type="button" className="imp-danger-btn" disabled={busy || rows.length === 0} onClick={() => { if (window.confirm('Очистити весь склад гравця?')) void run('all'); }}>
        <AdminIcon name="trash" size={22} /> Очистити весь склад
      </button>
    </>
  );
};

const MessageTool: React.FC<{ targetId: string; onDone: (kind: NoticeKind) => void }> = ({ targetId, onDone }) => {
  const items = useGameConfigStore((state) => state.items);
  const [kind, setKind] = useState<NoticeKind>('message');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [coins, setCoins] = useState('');
  const [rubies, setRubies] = useState('');
  const [xp, setXp] = useState('');
  const [giftItems, setGiftItems] = useState<{ itemId: string; amount: string }[]>([{ itemId: '', amount: '1' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const meta = KIND_META[kind];

  const buildRewards = () => {
    const rewards: AdminGiftReward[] = [];
    const push = (rewardKind: 'coins' | 'rubies' | 'xp', value: string) => {
      const amount = Math.floor(Number(value));
      if (amount > 0) rewards.push({ kind: rewardKind, amount });
    };
    push('coins', coins);
    push('rubies', rubies);
    push('xp', xp);
    const merged = new Map<string, number>();
    for (const entry of giftItems) {
      const amount = Math.floor(Number(entry.amount));
      if (entry.itemId && amount > 0) merged.set(entry.itemId, (merged.get(entry.itemId) ?? 0) + amount);
    }
    for (const [itemId, amount] of merged) rewards.push({ kind: 'item', itemId, amount });
    return rewards;
  };

  const rewards = kind === 'gift' ? buildRewards() : [];
  const canSend = title.trim().length >= 2 && (kind === 'gift' ? rewards.length > 0 : text.trim().length > 0);

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.sendGift(targetId, { title, description: text, kind, items: rewards });
      onDone(kind);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="imp-segment" role="radiogroup" aria-label="Тип">
        {(Object.keys(KIND_META) as NoticeKind[]).map((value) => (
          <button key={value} type="button" role="radio" aria-checked={kind === value} className={kind === value ? `active kind-${value}` : ''} onClick={() => setKind(value)}>
            <AdminIcon name={KIND_META[value].icon} size={22} /> {KIND_META[value].label}
          </button>
        ))}
      </div>
      <label className="imp-field"><span>Заголовок</span><input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} placeholder={meta.titlePlaceholder} /></label>
      <label className="imp-field"><span>Текст</span><textarea value={text} maxLength={300} rows={3} onChange={(event) => setText(event.target.value)} placeholder={meta.textPlaceholder} /></label>
      {kind === 'gift' && (
        <>
          <div className="imp-reward-grid">
            <label className="imp-field"><span><img src="/assets/ui/coin.png" alt="" /> Монети</span><input type="number" min={0} value={coins} onChange={(event) => setCoins(event.target.value)} /></label>
            <label className="imp-field"><span><img src="/assets/ui/rubin.png" alt="" /> Рубіни</span><input type="number" min={0} value={rubies} onChange={(event) => setRubies(event.target.value)} /></label>
            <label className="imp-field"><span>⭐ Досвід</span><input type="number" min={0} value={xp} onChange={(event) => setXp(event.target.value)} /></label>
          </div>
          <div className="imp-gift-items">
            <span className="imp-gift-items-title">Предмети ({giftItems.length})</span>
            {giftItems.map((entry, index) => (
              <div className="imp-gift-item-row" key={index}>
                <select value={entry.itemId} onChange={(event) => setGiftItems((rows) => rows.map((row, i) => (i === index ? { ...row, itemId: event.target.value } : row)))}>
                  <option value="">— обери предмет —</option>
                  {Object.values(items).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <input type="number" min={1} value={entry.amount} aria-label="Кількість" onChange={(event) => setGiftItems((rows) => rows.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row)))} />
                <button type="button" className="imp-icon-btn" disabled={giftItems.length === 1 && !entry.itemId} onClick={() => setGiftItems((rows) => (rows.length === 1 ? [{ itemId: '', amount: '1' }] : rows.filter((_, i) => i !== index)))} aria-label="Прибрати" title="Прибрати"><AdminIcon name="trash" size={24} /></button>
              </div>
            ))}
            <button type="button" className="imp-add-item" disabled={giftItems.length >= 15} onClick={() => setGiftItems((rows) => [...rows, { itemId: '', amount: '1' }])}>+ Додати ще предмет</button>
          </div>
        </>
      )}
      <p className="imp-hint">{meta.hint}</p>
      {error && <p className="imp-error">{error}</p>}
      <button type="button" className={`imp-primary-btn kind-${kind}`} disabled={busy || !canSend} onClick={() => void send()}>
        <AdminIcon name={meta.icon} size={22} /> {busy ? 'Надсилаємо…' : `Надіслати: ${meta.label.toLowerCase()}`}
      </button>
    </>
  );
};

const BanTool: React.FC<{ targetId: string; targetName: string; onDone: () => void }> = ({ targetId, targetName, onDone }) => {
  const [duration, setDuration] = useState<number | null>(1440);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ban = async () => {
    setBusy(true);
    setError('');
    try {
      await adminApi.banUser(targetId, duration, reason.trim());
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="imp-warning-text"><AdminIcon name="warning" size={26} /> <span>Гравець <strong>{targetName}</strong> побачить вікно блокування і не зможе грати. Ти й надалі зможеш керувати його фермою.</span></p>
      <div className="imp-segment imp-segment-wrap" role="radiogroup" aria-label="Тривалість">
        {BAN_OPTIONS.map((option) => (
          <button key={option.label} type="button" role="radio" aria-checked={duration === option.value} className={duration === option.value ? 'active' : ''} onClick={() => setDuration(option.value)}>{option.label}</button>
        ))}
      </div>
      <label className="imp-field"><span>Причина (побачить гравець)</span><textarea value={reason} maxLength={300} rows={3} onChange={(event) => setReason(event.target.value)} /></label>
      {error && <p className="imp-error">{error}</p>}
      <button type="button" className="imp-danger-btn" disabled={busy} onClick={() => void ban()}>
        <AdminIcon name="ban" size={22} /> {busy ? 'Блокуємо…' : 'Заблокувати гравця'}
      </button>
    </>
  );
};

export const ImpersonationBanner: React.FC = () => {
  const targetId = useImpersonationStore((state) => state.targetId);
  const targetName = useImpersonationStore((state) => state.targetName);
  const [tool, setTool] = useState<Tool | null>(null);
  const [notice, setNotice] = useState('');
  const [banned, setBanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshBan = useCallback((id: string) => {
    void adminApi.getUsers(id)
      .then((result) => setBanned(Boolean(result.users.find((entry) => entry.id === id)?.isBanned)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (targetId) refreshBan(targetId);
  }, [targetId, refreshBan]);

  if (!targetId) return null;

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3500);
  };

  const unban = async () => {
    setBusy(true);
    try {
      await adminApi.unbanUser(targetId);
      setBanned(false);
      showNotice('Гравця розблоковано.');
    } catch (err) {
      showNotice(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`impersonation-banner${menuOpen ? ' is-open' : ''}`} role="status">
        <button type="button" className="imp-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label="Меню адміна"><img className="admin-icon" src="/assets/ui/admin/admin-badge.png" width={30} height={30} alt="" draggable={false} /></button>
        <span className="imp-title">Режим адміна: ферма <strong>{targetName}</strong>{banned && <em className="imp-banned-tag">заблоковано</em>}</span>
        <div className="imp-actions" onClick={() => setMenuOpen(false)}>
        <button type="button" onClick={() => setTool('inventory')}><AdminIcon name="/assets/ui/cklad.png" size={18} /> <span className="imp-label">Склад</span></button>
        <button type="button" onClick={() => setTool('message')}><AdminIcon name="mail-gift" size={18} /> <span className="imp-label">Повідомити</span></button>
        {banned
          ? <button type="button" className="imp-unban-btn" disabled={busy} onClick={() => void unban()}><AdminIcon name="unlock" size={18} /> <span className="imp-label">Розблокувати</span></button>
          : <button type="button" className="imp-ban-btn" onClick={() => setTool('ban')}><AdminIcon name="ban" size={18} /> <span className="imp-label">Бан</span></button>}
        <button type="button" onClick={() => setTool('players')}><AdminIcon name="gear" size={18} /> <span className="imp-label">Керування</span></button>
        <button type="button" onClick={stopImpersonation}><LogOut size={14} /> <span className="imp-label">Вийти на свою</span></button>
        </div>
      </div>
      {notice && createPortal(<div className="imp-toast" role="status">{notice}</div>, document.body)}
      {tool === 'inventory' && <ToolDialog title={`Склад: ${targetName}`} icon="/assets/ui/cklad.png" onClose={() => setTool(null)}><InventoryTool targetId={targetId} /></ToolDialog>}
      {tool === 'message' && <ToolDialog title="Повідомлення гравцю" icon="mail-gift" onClose={() => setTool(null)}><MessageTool targetId={targetId} onDone={(kind) => { setTool(null); showNotice(kind === 'gift' ? 'Подарунок надіслано.' : kind === 'warning' ? 'Попередження надіслано.' : 'Повідомлення надіслано.'); }} /></ToolDialog>}
      {tool === 'ban' && <ToolDialog title="Блокування гравця" icon="ban" onClose={() => setTool(null)}><BanTool targetId={targetId} targetName={targetName} onDone={() => { setTool(null); setBanned(true); showNotice('Гравця заблоковано.'); }} /></ToolDialog>}
      {tool === 'players' && <AdminPlayersModal focusUserId={targetId} canEnterFarm={false} onClose={() => { setTool(null); refreshBan(targetId); }} />}
    </>
  );
};
