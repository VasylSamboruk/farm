import React from 'react';
import { FriendsPanel } from '../auth/FriendsPanel';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestCountChange: (count: number) => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({ isOpen, onClose, onRequestCountChange }) => {
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
          <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити друзів">✕</button>
        </header>
        <div className="social-modal-content">
          <FriendsPanel isInGame onRequestCountChange={onRequestCountChange} />
        </div>
      </section>
    </div>
  );
};
