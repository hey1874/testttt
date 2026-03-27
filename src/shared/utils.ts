import type { Category, Product, ProductSpec } from './types.ts';

export function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function createId(prefix: string): string {
  const raw =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

  return `${prefix}_${raw}`;
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function slugify(value: string, fallback = 'item'): string {
  const cleaned = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned || fallback;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '面议';
  }

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function parsePrice(value: string): number | null {
  const normalized = normalizeText(value).replace(/[^\d.]/g, '');
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      normalizeText(value)
        .split(/[，,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function tagsToText(tags: string[]): string {
  return tags.join(', ');
}

export function getCategoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((category) => [category.id, category]));
}

export function sortCategories(categories: Category[]): Category[] {
  return [...categories].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function sortProducts(products: Product[]): Product[] {
  return [...products].sort((left, right) => {
    if (left.hot !== right.hot) {
      return Number(right.hot) - Number(left.hot);
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function normalizeSpecs(specs: ProductSpec[]): ProductSpec[] {
  return [...specs]
    .filter((spec) => normalizeText(spec.label) && normalizeText(spec.value))
    .sort((left, right) => left.order - right.order);
}

export function getProductImage(
  product: Pick<Product, 'name' | 'brand' | 'image'>,
  category?: Pick<Category, 'name' | 'accent' | 'code'>,
): string {
  const customImage = normalizeText(product.image);
  if (customImage) {
    return customImage;
  }

  const accent = category?.accent || '#2563eb';
  const brand = normalizeText(product.brand) || normalizeText(product.name) || '空调';
  const code = category?.code || 'AC';
  const categoryName = category?.name || '智能家电';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="#eef4ff" />
        </linearGradient>
      </defs>
      <rect width="640" height="420" rx="36" fill="url(#bg)" />
      <circle cx="540" cy="84" r="72" fill="${accent}" fill-opacity="0.12" />
      <circle cx="120" cy="336" r="96" fill="${accent}" fill-opacity="0.10" />
      <rect x="112" y="128" width="416" height="124" rx="28" fill="#ffffff" stroke="${accent}" stroke-width="6" />
      <rect x="140" y="178" width="360" height="10" rx="5" fill="${accent}" fill-opacity="0.30" />
      <text x="112" y="90" font-size="34" font-family="Avenir Next, Segoe UI Variable, PingFang SC, Microsoft YaHei, sans-serif" font-weight="700" fill="#0f172a">${brand}</text>
      <text x="112" y="300" font-size="54" font-family="Avenir Next, Segoe UI Variable, PingFang SC, Microsoft YaHei, sans-serif" font-weight="800" fill="#0f172a">${code}</text>
      <text x="112" y="346" font-size="22" font-family="Avenir Next, Segoe UI Variable, PingFang SC, Microsoft YaHei, sans-serif" fill="#475569">${categoryName}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
