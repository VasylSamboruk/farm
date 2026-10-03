import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Calculator, Check, Image, Leaf, PackagePlus, ShieldCheck, Store, TriangleAlert, Users, X } from 'lucide-react';
import './Admin.css';
import { AdminToastContext, type AdminToast } from './adminToast';

export type AdminSection = 'users' | 'shop' | 'create' | 'media' | 'pricing';
interface AdminShellProps {
  section: AdminSection;
  username: string;
  onSectionChange: (section: AdminSection) => void;
  onBack: () => void;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({ section, username, onSectionChange, onBack, children }) => {
  const [toast, setToast] = useState<AdminToast | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((kind: AdminToast['kind'], message: string) => {
    setToast({ kind, message });
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  return (
    <AdminToastContext.Provider value={showToast}>
      <main className="admin-console">
        <aside className="admin-sidebar">
          <div className="admin-brand"><span className="admin-brand-mark"><Leaf size={19} /></span><span>FARM<span>CANVAS</span></span></div>
          <div className="admin-sidebar-label">КЕРУВАННЯ</div>
          <nav className="admin-sidebar-nav" aria-label="Розділи адміністратора">
            <button className={section === 'users' ? 'is-active' : ''} type="button" aria-current={section === 'users' ? 'page' : undefined} onClick={() => onSectionChange('users')}><Users size={18} /><span>Користувачі</span></button>
            <button className={section === 'shop' ? 'is-active' : ''} type="button" aria-current={section === 'shop' ? 'page' : undefined} onClick={() => onSectionChange('shop')}><Store size={18} /><span>Магазин</span></button>
            <button className={section === 'create' ? 'is-active' : ''} type="button" aria-current={section === 'create' ? 'page' : undefined} onClick={() => onSectionChange('create')}><PackagePlus size={18} /><span>Додати товар</span></button>
            <button className={section === 'pricing' ? 'is-active' : ''} type="button" aria-current={section === 'pricing' ? 'page' : undefined} onClick={() => onSectionChange('pricing')}><Calculator size={18} /><span>Ціноутворення</span></button>
            <button className={section === 'media' ? 'is-active' : ''} type="button" aria-current={section === 'media' ? 'page' : undefined} onClick={() => onSectionChange('media')}><Image size={18} /><span>Зображення</span></button>
          </nav>
          <div className="admin-sidebar-footer"><span className="admin-online-dot" /><span>Увійшов як</span><strong>{username}</strong></div>
        </aside>
        <div className="admin-main-column">
          <header className="admin-topbar">
            <div className="admin-topbar-heading"><span><ShieldCheck size={17} /> ПАНЕЛЬ АДМІНІСТРАТОРА</span><strong>{section === 'users' ? 'Користувачі' : section === 'shop' ? 'Магазин' : section === 'media' ? 'Зображення' : section === 'pricing' ? 'Ціноутворення' : 'Додати товар'}</strong></div>
            <button className="admin-back-button" type="button" onClick={onBack}><ArrowLeft size={16} /><span>До профілю</span></button>
          </header>
          <div className="admin-page-content" key={section}>{children}</div>
        </div>
        {toast && <div className={`admin-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          {toast.kind === 'success' ? <Check size={18} /> : <TriangleAlert size={18} />}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Закрити повідомлення"><X size={15} /></button>
        </div>}
      </main>
    </AdminToastContext.Provider>
  );
};