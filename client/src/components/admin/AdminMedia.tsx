import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, FolderOpen, Link2, RotateCcw, Save } from 'lucide-react';
import { adminApi, type AdminMediaSettings } from '../../api/admin.api';
import { useAdminToast } from './adminToast';

type PendingAction = 'save' | 'restore' | null;

export const AdminMedia: React.FC = () => {
  const showToast = useAdminToast();
  const [settings, setSettings] = useState<AdminMediaSettings | null>(null);
  const [baseUrlDraft, setBaseUrlDraft] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void adminApi.getMediaSettings()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setBaseUrlDraft(loaded.assetBaseUrl);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Не вдалося завантажити налаштування.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const runPendingAction = async () => {
    if (!pendingAction) return;
    setBusy(true);
    setError('');
    try {
      const updated = pendingAction === 'restore'
        ? await adminApi.restoreMediaBaseUrl()
        : await adminApi.updateMediaBaseUrl(baseUrlDraft.trim());
      setSettings(updated);
      setBaseUrlDraft(updated.assetBaseUrl);
      setPendingAction(null);
      showToast('success', pendingAction === 'restore' ? 'Попередню адресу відновлено.' : 'Базову адресу зображень змінено.');
    } catch (requestError) {
      const message = typeof requestError === 'object' && requestError !== null && 'response' in requestError
        ? (requestError as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message || (requestError instanceof Error ? requestError.message : 'Не вдалося змінити адресу.'));
      showToast('error', message || 'Не вдалося змінити адресу.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="admin-media-page"><p className="admin-empty">Завантажуємо налаштування сховища…</p></div>;

  return (
    <section className="admin-media-page" aria-labelledby="admin-media-title">
      <header className="admin-create-heading">
        <div>
          <span className="admin-eyebrow">R2 OBJECT STORAGE</span>
          <h1 id="admin-media-title">Зображення</h1>
          <p>Посилання на файли у твоєму Cloudflare R2 bucket</p>
        </div>
      </header>

      {error && <p className="admin-alert is-error" role="alert">{error}</p>}

      <div className="admin-media-grid">
        <section className="admin-media-section">
          <div className="admin-action-title"><FolderOpen size={18} /><h2>Файли у Cloudflare</h2></div>
          <p>Завантажуй картинки безпосередньо в Cloudflare Dashboard → R2 → свій bucket. Структуру папок і назви файлів визначаєш там.</p>
          <div className="admin-media-path-example">
            <span>Приклад ключа в bucket</span>
            <code>animals/chicken/stage1.png</code>
            <span>Посилання для поля URL</span>
            <code>https://твій-домен/animals/chicken/stage1.png</code>
          </div>
          <p className="admin-media-note">У полі зображення вибери R2: домен буде показаний поруч, а ти введеш лише ключ об’єкта. Для файлів, що лежать у клієнтській папці `public/assets`, вибери «Ігрові assets».</p>
        </section>

        <section className="admin-media-section">
          <div className="admin-action-title"><Link2 size={18} /><h2>Базова адреса файлів</h2></div>
          <p>У базі зберігається шлях об’єкта, наприклад <code>/animals/chicken/dek3-a1b2.png</code>. Тут змінюється лише домен-початок.</p>
          <label className="admin-media-url-field">Публічна HTTPS адреса бакета
            <input value={baseUrlDraft} onChange={(event) => setBaseUrlDraft(event.target.value)} placeholder="https://pub-....r2.dev/" inputMode="url" />
          </label>
          {settings?.assetBaseUrl && <p className="admin-media-current"><span>Зараз використовується</span><code>{settings.assetBaseUrl}</code></p>}
          <div className="admin-media-actions">
            <button className="admin-primary-button" type="button" onClick={() => setPendingAction('save')} disabled={busy || baseUrlDraft.trim() === (settings?.assetBaseUrl ?? '')}>
              <Save size={15} />Змінити адресу
            </button>
            <button className="admin-secondary-button" type="button" onClick={() => setPendingAction('restore')} disabled={busy || !settings?.previousAssetBaseUrl} title={settings?.previousAssetBaseUrl || 'Попередньої адреси немає'}>
              <RotateCcw size={15} />Повернути попередню
            </button>
          </div>
          {settings?.previousAssetBaseUrl && <p className="admin-media-previous">Адреса для відкату: <code>{settings.previousAssetBaseUrl}</code></p>}
        </section>
      </div>

      {pendingAction && <div className="admin-media-confirm-backdrop" role="presentation" onClick={() => !busy && setPendingAction(null)}>
        <section className="admin-media-confirm" role="dialog" aria-modal="true" aria-labelledby="media-confirm-title" onClick={(event) => event.stopPropagation()}>
          <AlertTriangle size={23} />
          <h2 id="media-confirm-title">{pendingAction === 'restore' ? 'Відновити попередню адресу?' : 'Змінити адресу зображень?'}</h2>
          <p>Зміна одразу вплине на всі зображення R2. Файли та їхні шляхи не переміщуються. Переконайся, що новий домен веде до того самого бакета й зберігає структуру шляхів.</p>
          <div className="admin-media-confirm-path"><span>Нова адреса</span><code>{pendingAction === 'restore' ? settings?.previousAssetBaseUrl : baseUrlDraft.trim()}</code></div>
          <footer>
            <button className="admin-secondary-button" type="button" onClick={() => setPendingAction(null)} disabled={busy}>Скасувати</button>
            <button className="admin-primary-button" type="button" onClick={() => void runPendingAction()} disabled={busy}><Check size={15} />{busy ? 'Застосовуємо…' : 'Так, змінити'}</button>
          </footer>
        </section>
      </div>}
    </section>
  );
};