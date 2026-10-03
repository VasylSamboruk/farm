import React from 'react';
import type { DurationParts } from '../../game/durationInput';

interface AdminDurationInputProps {
  value: DurationParts;
  onChange: (value: DurationParts) => void;
  label: string;
}

const fields: { key: keyof DurationParts; label: string; maxLength: number }[] = [
  { key: 'hours', label: 'год', maxLength: 6 },
  { key: 'minutes', label: 'хв', maxLength: 2 },
  { key: 'seconds', label: 'сек', maxLength: 2 },
];

export const AdminDurationInput: React.FC<AdminDurationInputProps> = ({ value, onChange, label }) => (
  <div className="admin-duration-input" role="group" aria-label={label}>
    {fields.map((field, index) => (
      <React.Fragment key={field.key}>
        {index > 0 && <span className="admin-duration-separator" aria-hidden="true">:</span>}
        <label className="admin-duration-segment">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={field.maxLength}
            aria-label={`${label}: ${field.label}`}
            placeholder="00"
            value={value[field.key]}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value.replace(/\D/g, '').slice(0, field.maxLength) })}
          />
          <span>{field.label}</span>
        </label>
      </React.Fragment>
    ))}
  </div>
);