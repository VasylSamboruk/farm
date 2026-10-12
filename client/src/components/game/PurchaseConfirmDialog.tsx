import React from 'react';
import { Check, X } from 'lucide-react';
import './PurchaseConfirmDialog.css';

interface PurchaseConfirmDialogProps {
  itemName: string;
  price: number;
  currency: 'coins' | 'rubies';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const PurchaseConfirmDialog: React.FC<PurchaseConfirmDialogProps> = ({
  itemName,
  price,
  currency,
  busy = false,
  onConfirm,
  onCancel,
}) => (
  <div className="purchase-confirm-backdrop" onClick={() => !busy && onCancel()}>
    <section
      className="purchase-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-confirm-title"
      onClick={(event) => event.stopPropagation()}
    >
      <button className="purchase-confirm-close" type="button" onClick={onCancel} disabled={busy} aria-label="Скасувати">
        <X size={17} />
      </button>
      <span className="purchase-confirm-icon">
        <img src={currency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt="" />
      </span>
      <h3 id="purchase-confirm-title">Підтвердити покупку?</h3>
      <p>Ви точно хочете придбати «{itemName}»?</p>
      <strong className="purchase-confirm-price">
        {price.toLocaleString('uk-UA')}
        <img src={currency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png'} alt={currency === 'rubies' ? 'рубінів' : 'монет'} />
      </strong>
      <div className="purchase-confirm-actions">
        <button type="button" onClick={onCancel} disabled={busy}>Скасувати</button>
        <button type="button" className="is-confirm" onClick={onConfirm} disabled={busy}>
          <Check size={16} />{busy ? 'Купуємо…' : 'Так, купити'}
        </button>
      </div>
    </section>
  </div>
);
