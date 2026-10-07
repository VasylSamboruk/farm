import React from 'react';
import { createPortal } from 'react-dom';
import { Check, Gift, X } from 'lucide-react';
import type { ReceivedSocialGift } from '../../api/social.api';

interface ReceivedGiftModalProps {
  gift: ReceivedSocialGift;
  busy: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

export const ReceivedGiftModal: React.FC<ReceivedGiftModalProps> = ({
  gift, busy, onClose, onAccept, onReject,
}) => createPortal(
  <div className="gift-shop-overlay received-gift-overlay" onClick={onClose}>
    <section className="game-modal-window received-gift-window" role="dialog" aria-modal="true" aria-labelledby="received-gift-title" onClick={(event) => event.stopPropagation()}>
      <header className="gift-shop-header">
        <div><Gift size={21} /><div><h2 id="received-gift-title">Для тебе є подарунок!</h2><span>Відкрий і додай його до своєї ферми</span></div></div>
        <button className="game-modal-close" type="button" onClick={onClose} aria-label="Закрити подарунок"><X size={18} /></button>
      </header>
      <div className="received-gift-detail">
        <div className="received-gift-sender">
          <div className="received-gift-sender-avatar">
            {gift.senderAvatar ? <img src={gift.senderAvatar} alt="" /> : <span>{gift.senderName.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div><small>ПОДАРУВАВ</small><strong>{gift.senderName}</strong></div>
          <span className="received-gift-level"><img src="/assets/ui/lvl_ico.png" alt="" /> Рівень {gift.senderLevel}</span>
        </div>
        <div className="received-gift-present">
          <div className="received-gift-present-image">{gift.image ? <img src={gift.image} alt="" draggable={false} /> : <Gift size={38} />}</div>
          <strong>{gift.itemName}</strong>
          <span>Особливий подарунок для твоєї ферми</span>
        </div>
        <div className="received-gift-modal-actions">
          <button className="received-gift-reject" type="button" onClick={onReject} disabled={busy}><X size={16} />Відхилити</button>
          <button className="received-gift-accept" type="button" onClick={onAccept} disabled={busy}><Check size={16} />{busy ? 'Зачекай…' : 'Прийняти подарунок'}</button>
        </div>
      </div>
    </section>
  </div>,
  document.querySelector('.app-shell') ?? document.body
);
