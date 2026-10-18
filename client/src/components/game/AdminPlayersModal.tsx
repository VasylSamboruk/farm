import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import '../admin/Admin.css';
import { AdminUsers } from '../admin/AdminUsers';
import type { AdminUser } from '../../api/admin.api';
import { startImpersonation } from '../../game/adminImpersonation';
import { AdminToastContext, type AdminToast } from '../admin/adminToast';

interface AdminPlayersModalProps {
  // ID гравця, якого потрібно одразу відкрити (режим адміна на чужій фермі).
  focusUserId?: string;
  canEnterFarm?: boolean;
  onClose: () => void;
}

export const AdminPlayersModal: React.FC<AdminPlayersModalProps> = ({ focusUserId, canEnterFarm = true, onClose }) => {
  const [toast, setToast] = useState<AdminToast | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showToast = useCallback((kind: AdminToast['kind'], message: string) => {
    setToast({ kind, message });
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const enterFarm = useCallback((player: AdminUser) => {
    startImpersonation(player.id, player.username).catch((error: unknown) => {
      showToast('error', error instanceof Error ? error.message : 'Не вдалося зайти на ферму.');
    });
  }, [showToast]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  return createPortal(
    <AdminToastContext.Provider value={showToast}>
      <div className="admin-players-overlay" role="dialog" aria-modal="true" aria-label="Керування гравцями" onClick={(event) => event.stopPropagation()}>
        <div className="admin-players-window">
          <header className="admin-players-header">
            <span><ShieldCheck size={18} /> Режим адміна{focusUserId ? ' · ферма гравця' : ' · гравці'}</span>
            <button type="button" onClick={onClose} aria-label="Вимкнути режим адміна">Вимкнути <X size={16} /></button>
          </header>
          <div className="admin-console admin-embedded">
            <AdminUsers initialSearch={focusUserId ?? ''} onEnterFarm={canEnterFarm ? enterFarm : undefined} />
          </div>
        </div>
        {toast && (
          <div className={`admin-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.kind === 'success' ? <Check size={18} /> : <TriangleAlert size={18} />}
            <span>{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Закрити повідомлення"><X size={15} /></button>
          </div>
        )}
      </div>
    </AdminToastContext.Provider>,
    document.body,
  );
};
