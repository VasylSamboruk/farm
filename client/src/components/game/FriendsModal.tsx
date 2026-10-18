import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { FriendsPanel } from '../auth/FriendsPanel';
import { AdminPlayersModal } from './AdminPlayersModal';
import { useAuthStore } from '../../store/authStore';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestCountChange: (count: number) => void;
  visitPlayerId?: string | null;
  onVisitHandled?: () => void;
  onReturnFromInitialVisit: () => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({ isOpen, onClose, onRequestCountChange, visitPlayerId, onVisitHandled, onReturnFromInitialVisit }) => {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const [adminOpen, setAdminOpen] = useState(false);
  if (!isOpen) return null;

  return (
    <div className="social-modal-overlay" onClick={onClose}>
      <section
        className="game-modal-window social-modal-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="social-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shared-modal-header game-modal-header social-modal-header modal-header-single-row">
          <div className="modal-header-summary">
            <div className="social-modal-title">
              <img className="modal-brand-banner" id="social-modal-title" src="/assets/ui/friends_banner.png" alt="Друзі" draggable={false} />
            </div>
            <span className="modal-title-divider" aria-hidden="true" />
            <span className="social-modal-subtitle">Знайомся, додавай і відвідуй ферми</span>
          </div>
          <div className="modal-header-actions">
            {isAdmin && (
              <button type="button" className={`admin-settings-gear${adminOpen ? ' is-open' : ''}`} onClick={() => setAdminOpen((open) => !open)} title="Керування гравцями (тільки адмін)" aria-label="Керування гравцями">
                <Settings size={18} strokeWidth={2.4} />
              </button>
            )}
            <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити друзів">✕</button>
          </div>
        </header>
        <div className="social-modal-content">
          <FriendsPanel isInGame onRequestCountChange={onRequestCountChange} initialVisitUserId={visitPlayerId} onInitialVisitHandled={onVisitHandled} onReturnFromInitialVisit={onReturnFromInitialVisit} />
        </div>
        {isAdmin && adminOpen && <AdminPlayersModal onClose={() => setAdminOpen(false)} />}
      </section>
    </div>
  );
};
