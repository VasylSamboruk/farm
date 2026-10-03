export interface DurationParts {
  hours: string;
  minutes: string;
  seconds: string;
}

export const EMPTY_DURATION: DurationParts = { hours: '', minutes: '', seconds: '' };

export const durationPartsToMilliseconds = ({ hours, minutes, seconds }: DurationParts) => {
  const parts = [hours, minutes, seconds];
  if (parts.every((part) => !part.trim())) return null;
  if (parts.some((part) => part.trim() && !/^\d+$/.test(part))) return null;

  const hourCount = Number(hours || 0);
  const minuteCount = Number(minutes || 0);
  const secondCount = Number(seconds || 0);
  if (minuteCount > 59 || secondCount > 59) return null;

  const milliseconds = ((hourCount * 60 + minuteCount) * 60 + secondCount) * 1000;
  return Number.isSafeInteger(milliseconds) ? milliseconds : null;
};

export const millisecondsToDurationParts = (milliseconds?: number | null): DurationParts => {
  if (!Number.isSafeInteger(milliseconds) || !milliseconds || milliseconds < 0) return { ...EMPTY_DURATION };
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
};