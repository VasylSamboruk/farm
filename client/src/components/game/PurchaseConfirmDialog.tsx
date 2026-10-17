import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Plus, X } from 'lucide-react';
import './PurchaseConfirmDialog.css';

interface PurchaseConfirmDialogProps {
  itemName: string;
  price: number;
  currency: 'coins' | 'rubies';
  image?: string;
  description?: string;
  balance?: number;
  quantitySelection?: boolean;
  showPrice?: boolean;
  dialogTitle?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm: (quantity: number) => void;
  onCancel: () => void;
}

const MAX_QUANTITY = 10_000;

export const PurchaseConfirmDialog: React.FC<PurchaseConfirmDialogProps> = ({
  itemName,
  price,
  currency,
  image,
  description,
  balance,
  quantitySelection = false,
  showPrice = true,
  dialogTitle = 'Підтвердження покупки',
  cancelLabel = 'Скасувати',
  confirmLabel = 'Підтвердити покупку',
  confirmDisabled = false,
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const [quantity, setQuantity] = useState('1');
  const parsedQuantity = Number(quantity);
  const validQuantity = !quantitySelection || (
    Number.isSafeInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= MAX_QUANTITY
  );
  const purchaseQuantity = quantitySelection ? parsedQuantity : 1;
  const totalPrice = price * purchaseQuantity;
  const affordable = validQuantity && Number.isSafeInteger(totalPrice) &&
    (balance === undefined || totalPrice <= balance);
  const currencyIcon = currency === 'rubies' ? '/assets/ui/rubin.png' : '/assets/ui/coin.png';

  const dialog = (
    <div className="purchase-confirm-backdrop" onClick={() => !busy && onCancel()}>
      <section
        className="game-modal-window purchase-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shared-modal-header game-modal-header purchase-confirm-header">
          <div>
            <span className="purchase-confirm-eyebrow">МАГАЗИН ФЕРМИ</span>
            <h2 id="purchase-confirm-title">{dialogTitle}</h2>
          </div>
          <button className="game-modal-close" type="button" onClick={onCancel} disabled={busy} aria-label="Скасувати">
            <X size={17} />
          </button>
        </header>
        <div className={`purchase-confirm-product${quantitySelection ? ' has-quantity' : ''}`}>
          <div className="purchase-confirm-preview">
            {image ? <img src={image} alt="" draggable={false} /> : <span>🌱</span>}
          </div>
          <div className="purchase-confirm-product-copy">
            <span className="purchase-confirm-label">Ви обрали</span>
            <h3>{itemName}</h3>
            {description && <p>{description}</p>}
            {showPrice && quantitySelection && (
              <strong className="purchase-confirm-unit-price">
                {price.toLocaleString('uk-UA')}
                <img src={currencyIcon} alt={currency === 'rubies' ? 'рубінів' : 'монет'} />
                <small>за одиницю</small>
              </strong>
            )}
            {showPrice && (
              <>
                <div className="purchase-confirm-total">
                  <span>{quantitySelection ? 'Разом до сплати' : 'До сплати'}</span>
                  <strong>{validQuantity && Number.isSafeInteger(totalPrice) ? totalPrice.toLocaleString('uk-UA') : '—'}</strong>
                  <img src={currencyIcon} alt="" />
                </div>
                {!affordable && (
                  <p className="purchase-confirm-warning" role="status">
                    {!validQuantity
                      ? `Вкажи цілу кількість від 1 до ${MAX_QUANTITY.toLocaleString('uk-UA')}.`
                      : `Недостатньо ${currency === 'rubies' ? 'рубінів' : 'монет'} для цієї покупки.`}
                  </p>
                )}
              </>
            )}
            <footer className="purchase-confirm-actions">
              <button type="button" className="purchase-confirm-cancel" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
              <button
                type="button"
                className="purchase-confirm-accept"
                onClick={() => affordable && onConfirm(purchaseQuantity)}
                disabled={busy || (showPrice && !affordable) || confirmDisabled}
              >
                <Check size={16} />{busy ? 'Обробляємо…' : confirmLabel}
              </button>
            </footer>
          </div>
        </div>
        {quantitySelection && (
          <div className="purchase-confirm-quantity">
            <label htmlFor="purchase-quantity">Кількість на склад</label>
            <div className="purchase-confirm-stepper">
              <button type="button" onClick={() => setQuantity(String(Math.max(1, parsedQuantity - 1)))} disabled={busy || !validQuantity || parsedQuantity <= 1} aria-label="Зменшити кількість">
                <Minus size={15} />
              </button>
              <input
                id="purchase-quantity"
                type="number"
                min={1}
                max={MAX_QUANTITY}
                step={1}
                inputMode="numeric"
                value={quantity}
                disabled={busy}
                onChange={(event) => setQuantity(event.target.value)}
              />
              <button type="button" onClick={() => setQuantity(String(Math.min(MAX_QUANTITY, (validQuantity ? parsedQuantity : 0) + 1)))} disabled={busy || (validQuantity && parsedQuantity >= MAX_QUANTITY)} aria-label="Збільшити кількість">
                <Plus size={15} />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  return createPortal(dialog, document.querySelector('.app-shell') ?? document.body);
};
