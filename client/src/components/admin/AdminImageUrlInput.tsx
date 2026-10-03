import React, { useState } from 'react';
import { getImageSourceMode, getR2ObjectKey, type ImageSourceMode } from '../../game/assetUrls';

interface AdminImageUrlInputProps {
  label: string;
  value: string;
  assetBaseUrl: string;
  onChange: (value: string) => void;
  className?: string;
}

const modeLabels: { value: ImageSourceMode; label: string }[] = [
  { value: 'r2', label: 'R2' },
  { value: 'game', label: 'Ігрові assets' },
  { value: 'external', label: 'Зовнішнє URL' },
];

export const AdminImageUrlInput: React.FC<AdminImageUrlInputProps> = ({ label, value, assetBaseUrl, onChange, className = '' }) => {
  const [mode, setMode] = useState<ImageSourceMode>(() => getImageSourceMode(value, assetBaseUrl));
  const inputValue = mode === 'game'
    ? value.startsWith('/assets/') ? value.slice('/assets/'.length) : value
    : mode === 'r2' ? getR2ObjectKey(value, assetBaseUrl) : value;

  const changeMode = (nextMode: ImageSourceMode) => {
    if (nextMode === mode) return;
    if (nextMode === 'r2') {
      onChange(mode === 'game' ? inputValue : mode === 'external' ? '' : getR2ObjectKey(value, assetBaseUrl));
    } else if (nextMode === 'game') {
      const key = mode === 'r2' ? getR2ObjectKey(value, assetBaseUrl) : '';
      onChange(`/assets/${key}`);
    } else {
      onChange(/^https?:\/\//i.test(value) ? value : '');
    }
    setMode(nextMode);
  };

  const updateValue = (nextValue: string) => {
    if (mode === 'game') {
      onChange(`/assets/${nextValue.replace(/^\/+/, '').replace(/^assets\//, '')}`);
      return;
    }
    if (mode === 'r2' && /^https?:\/\//i.test(nextValue)) {
      onChange(nextValue);
      setMode(getImageSourceMode(nextValue, assetBaseUrl));
      return;
    }
    onChange(mode === 'r2' ? nextValue.replace(/^\/+/, '') : nextValue);
  };

  const prefix = mode === 'game'
    ? '/assets/'
    : mode === 'r2' ? assetBaseUrl || 'R2 base не задано' : '';

  return (
    <div className={`admin-image-url-field ${className}`}>
      <span className="admin-image-url-label">{label}</span>
      <div className="admin-image-url-modes" role="group" aria-label={`${label}: тип джерела`}>
        {modeLabels.map((option) => (
          <button key={option.value} type="button" className={mode === option.value ? 'is-active' : ''} aria-pressed={mode === option.value} onClick={() => changeMode(option.value)}>
            {option.label}
          </button>
        ))}
      </div>
      <div className="admin-image-url-entry">
        {prefix && <code>{prefix}</code>}
        <input
          aria-label={label}
          type="text"
          value={inputValue}
          onChange={(event) => updateValue(event.target.value)}
          placeholder={mode === 'r2' ? 'animals/dek3.png' : mode === 'game' ? 'animals/dek3.png' : 'https://…'}
        />
      </div>
    </div>
  );
};