export type ImageSourceMode = 'r2' | 'game' | 'external';

export const getImageSourceMode = (source: string, assetBaseUrl: string): ImageSourceMode => {
  if (source.startsWith('/assets/')) return 'game';
  if (source && assetBaseUrl && source.startsWith(assetBaseUrl)) return 'r2';
  if (source.startsWith('/') || (source && !/^https?:\/\//i.test(source))) return 'r2';
  return source ? 'external' : 'r2';
};

export const getR2ObjectKey = (source: string, assetBaseUrl: string) => {
  if (assetBaseUrl && source.startsWith(assetBaseUrl)) return source.slice(assetBaseUrl.length).replace(/^\/+/, '');
  return source.replace(/^\/+/, '');
};

export const resolveImageUrl = (source: string, assetBaseUrl: string) => {
  if (!source || source.startsWith('/assets/') || /^https?:\/\//i.test(source)) return source;
  const base = assetBaseUrl.replace(/\/+$/, '');
  const key = source.replace(/^\/+/, '');
  return base ? `${base}/${key}` : `/${key}`;
};