import type { Category, CategoryDraft, Database, DatabaseMeta, Product, ProductDraft, ProductSpec } from './types.ts';
import { cloneDeep, createId, normalizeSpecs, normalizeText, parseTags, slugify, sortCategories, sortProducts } from './utils.ts';

const STORAGE_KEY = 'air-guide-json-db';
const UPDATED_EVENT = 'air-guide-db-updated';
const REMOTE_DATABASE_URL = '/api/database';
const STATIC_DATABASE_URL = '/data/database.json';
const STATIC_SEED_URL = '/data/database.seed.json';

const FALLBACK_CATEGORIES: Category[] = [
  {
    id: 'wall-split',
    name: '壁挂机',
    code: 'WG',
    description: '适合卧室与小客厅的常规挂机产品。',
    accent: '#1d4ed8',
    order: 1,
    createdAt: '2026-03-27T00:00:00.000Z',
    updatedAt: '2026-03-27T00:00:00.000Z',
  },
  {
    id: 'floor-stand',
    name: '立柜式',
    code: 'LG',
    description: '适合大客厅、门店和开放空间。',
    accent: '#0891b2',
    order: 2,
    createdAt: '2026-03-27T00:00:00.000Z',
    updatedAt: '2026-03-27T00:00:00.000Z',
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeCategory(raw: unknown, index: number): Category {
  const item = raw && typeof raw === 'object' ? (raw as Partial<Category>) : {};
  const timestamp = normalizeText(item.updatedAt) || nowIso();
  const name = normalizeText(item.name) || `分类 ${index + 1}`;

  return {
    id: normalizeText(item.id) || slugify(name, `category-${index + 1}`),
    name,
    code: normalizeText(item.code) || `C${index + 1}`,
    description: normalizeText(item.description),
    accent: normalizeText(item.accent) || '#2563eb',
    order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index + 1,
    createdAt: normalizeText(item.createdAt) || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeSpec(raw: unknown, index: number): ProductSpec | null {
  const item = raw && typeof raw === 'object' ? (raw as Partial<ProductSpec>) : {};
  const label = normalizeText(item.label);
  const value = normalizeText(item.value);

  if (!label || !value) {
    return null;
  }

  return {
    id: normalizeText(item.id) || createId('spec'),
    label,
    value,
    order: typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : index + 1,
  };
}

function normalizeProduct(raw: unknown, index: number, categories: Category[]): Product {
  const item = raw && typeof raw === 'object' ? (raw as Partial<Product>) : {};
  const categoryId = normalizeText(item.categoryId);
  const fallbackCategoryId = categories[0]?.id || FALLBACK_CATEGORIES[0].id;
  const timestamp = normalizeText(item.updatedAt) || nowIso();

  return {
    id: normalizeText(item.id) || createId('product'),
    categoryId: categories.some((category) => category.id === categoryId) ? categoryId : fallbackCategoryId,
    name: normalizeText(item.name) || `未命名商品 ${index + 1}`,
    brand: normalizeText(item.brand),
    modelId: normalizeText(item.modelId),
    hp: normalizeText(item.hp),
    guidePrice: typeof item.guidePrice === 'number' && Number.isFinite(item.guidePrice) ? item.guidePrice : null,
    officialPrice: typeof item.officialPrice === 'number' && Number.isFinite(item.officialPrice) ? item.officialPrice : null,
    hot: Boolean(item.hot),
    summary: normalizeText(item.summary),
    tags: Array.isArray(item.tags) ? parseTags(item.tags.join(',')) : [],
    image: normalizeText(item.image),
    specs: normalizeSpecs(
      (Array.isArray(item.specs) ? item.specs : [])
        .map((spec, specIndex) => normalizeSpec(spec, specIndex))
        .filter(Boolean) as ProductSpec[],
    ),
    createdAt: normalizeText(item.createdAt) || timestamp,
    updatedAt: timestamp,
  };
}

function normalizeDatabase(raw: unknown): Database {
  const source = raw && typeof raw === 'object' ? (raw as Partial<Database>) : {};
  const categories = sortCategories(
    (Array.isArray(source.categories) ? source.categories : FALLBACK_CATEGORIES).map(normalizeCategory),
  );
  const products = sortProducts(
    (Array.isArray(source.products) ? source.products : []).map((product, index) =>
      normalizeProduct(product, index, categories),
    ),
  );
  const meta = source.meta && typeof source.meta === 'object' ? (source.meta as Partial<DatabaseMeta>) : {};

  return {
    meta: {
      version: typeof meta.version === 'number' && Number.isFinite(meta.version) ? meta.version : 1,
      name: normalizeText(meta.name) || '空调选购指南',
      storageMode: normalizeText(meta.storageMode) || 'json-file + local mirror',
      updatedAt: normalizeText(meta.updatedAt) || nowIso(),
    },
    categories,
    products,
  };
}

function canUseBrowserStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function syncRequest(method: 'GET' | 'PUT', url: string, payload?: string): XMLHttpRequest | null {
  if (typeof XMLHttpRequest === 'undefined') {
    return null;
  }

  try {
    const request = new XMLHttpRequest();
    request.open(method, url, false);
    if (payload) {
      request.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
    }
    request.send(payload);
    return request;
  } catch (error) {
    console.warn(`Synchronous ${method} ${url} failed.`, error);
    return null;
  }
}

export class JsonDatabase {
  private seed: Database | null = null;
  private snapshot: Database | null = null;
  private remoteMode = false;

  async load(force = false): Promise<Database> {
    if (this.snapshot && !force) {
      return cloneDeep(this.snapshot);
    }

    const remoteData = await this.fetchJson(REMOTE_DATABASE_URL);
    const staticData = (await this.fetchJson(STATIC_DATABASE_URL)) || this.readMirror() || normalizeDatabase({});
    const seedData = (await this.fetchJson(STATIC_SEED_URL)) || cloneDeep(staticData);

    this.remoteMode = Boolean(remoteData);
    this.seed = normalizeDatabase(seedData);
    this.snapshot = normalizeDatabase(remoteData || staticData);
    this.persistMirror();

    return cloneDeep(this.snapshot);
  }

  getSnapshot(): Database {
    this.assertLoaded();
    return cloneDeep(this.snapshot as Database);
  }

  getCategory(categoryId: string): Category | undefined {
    this.assertLoaded();
    return cloneDeep((this.snapshot as Database).categories.find((category) => category.id === categoryId));
  }

  getProduct(productId: string): Product | undefined {
    this.assertLoaded();
    return cloneDeep((this.snapshot as Database).products.find((product) => product.id === productId));
  }

  saveCategory(draft: CategoryDraft): Category {
    this.assertLoaded();
    const categoryName = normalizeText(draft.name);
    if (!categoryName) {
      throw new Error('分类名称不能为空。');
    }

    const categories = (this.snapshot as Database).categories;
    const timestamp = nowIso();
    const currentId = normalizeText(draft.id);
    const duplicated = categories.find(
      (category) => category.id !== currentId && category.name === categoryName,
    );
    if (duplicated) {
      throw new Error('分类名称已存在。');
    }

    let category = categories.find((item) => item.id === currentId);
    if (category) {
      category.name = categoryName;
      category.code = normalizeText(draft.code) || category.code;
      category.description = normalizeText(draft.description);
      category.accent = normalizeText(draft.accent) || category.accent;
      category.order = Number.isFinite(draft.order) ? draft.order : category.order;
      category.updatedAt = timestamp;
    } else {
      category = {
        id: createId('category'),
        name: categoryName,
        code: normalizeText(draft.code) || categoryName.slice(0, 2).toUpperCase(),
        description: normalizeText(draft.description),
        accent: normalizeText(draft.accent) || '#2563eb',
        order: Number.isFinite(draft.order) ? draft.order : categories.length + 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      categories.push(category);
    }

    (this.snapshot as Database).categories = sortCategories(categories);
    this.commit();
    return cloneDeep(category);
  }

  deleteCategory(categoryId: string): void {
    this.assertLoaded();
    const snapshot = this.snapshot as Database;
    const hasProducts = snapshot.products.some((product) => product.categoryId === categoryId);
    if (hasProducts) {
      throw new Error('请先移走或删除该分类下的商品。');
    }

    snapshot.categories = snapshot.categories.filter((category) => category.id !== categoryId);
    if (snapshot.categories.length === 0) {
      snapshot.categories = cloneDeep(FALLBACK_CATEGORIES);
    }
    this.commit();
  }

  saveProduct(draft: ProductDraft): Product {
    this.assertLoaded();
    const snapshot = this.snapshot as Database;
    const categoryId = normalizeText(draft.categoryId);
    if (!snapshot.categories.some((category) => category.id === categoryId)) {
      throw new Error('请选择有效的商品分类。');
    }

    const name = normalizeText(draft.name);
    if (!name) {
      throw new Error('商品名称不能为空。');
    }

    const timestamp = nowIso();
    const specs = normalizeSpecs(
      draft.specs.map((spec, index) => ({
        id: normalizeText(spec.id) || createId('spec'),
        label: normalizeText(spec.label),
        value: normalizeText(spec.value),
        order: Number.isFinite(spec.order) ? spec.order : index + 1,
      })),
    );
    const tags = parseTags(draft.tags.join(','));

    let product = snapshot.products.find((item) => item.id === draft.id);
    if (product) {
      product.categoryId = categoryId;
      product.name = name;
      product.brand = normalizeText(draft.brand);
      product.modelId = normalizeText(draft.modelId);
      product.hp = normalizeText(draft.hp);
      product.guidePrice = draft.guidePrice;
      product.officialPrice = draft.officialPrice;
      product.hot = Boolean(draft.hot);
      product.summary = normalizeText(draft.summary);
      product.tags = tags;
      product.image = normalizeText(draft.image);
      product.specs = specs;
      product.updatedAt = timestamp;
    } else {
      product = {
        id: createId('product'),
        categoryId,
        name,
        brand: normalizeText(draft.brand),
        modelId: normalizeText(draft.modelId),
        hp: normalizeText(draft.hp),
        guidePrice: draft.guidePrice,
        officialPrice: draft.officialPrice,
        hot: Boolean(draft.hot),
        summary: normalizeText(draft.summary),
        tags,
        image: normalizeText(draft.image),
        specs,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      snapshot.products.push(product);
    }

    snapshot.products = sortProducts(snapshot.products);
    this.commit();
    return cloneDeep(product);
  }

  deleteProduct(productId: string): void {
    this.assertLoaded();
    const snapshot = this.snapshot as Database;
    snapshot.products = snapshot.products.filter((product) => product.id !== productId);
    this.commit();
  }

  importJson(raw: unknown): Database {
    this.assertLoaded();
    this.snapshot = normalizeDatabase(raw);
    this.commit();
    return this.getSnapshot();
  }

  exportJson(): string {
    return JSON.stringify(this.getSnapshot(), null, 2);
  }

  resetToSeed(): Database {
    this.assertLoaded();
    this.snapshot = cloneDeep(this.seed as Database);
    this.commit();
    return this.getSnapshot();
  }

  subscribe(listener: () => void): () => void {
    const handleUpdated = () => listener();
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      if (event.newValue) {
        try {
          this.snapshot = normalizeDatabase(JSON.parse(event.newValue));
        } catch (error) {
          console.warn('Syncing mirror storage failed.', error);
          this.snapshot = cloneDeep(this.seed || normalizeDatabase({}));
        }
      } else {
        this.snapshot = cloneDeep(this.seed || normalizeDatabase({}));
      }

      listener();
    };

    window.addEventListener(UPDATED_EVENT, handleUpdated);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(UPDATED_EVENT, handleUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }

  private async fetchJson(url: string): Promise<Database | null> {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        return null;
      }
      return normalizeDatabase(await response.json());
    } catch (error) {
      console.warn(`Fetching ${url} failed.`, error);
      return null;
    }
  }

  private assertLoaded(): void {
    if (!this.snapshot) {
      throw new Error('数据库尚未初始化，请先调用 load()。');
    }
  }

  private commit(): void {
    (this.snapshot as Database).meta.updatedAt = nowIso();
    this.writeRemote();
    this.persistMirror();
    this.emit();
  }

  private writeRemote(): void {
    const payload = JSON.stringify(this.snapshot);
    const request = syncRequest('PUT', REMOTE_DATABASE_URL, payload);

    if (!request) {
      throw new Error('无法连接本地后端，当前修改没有写入 data/database.json。');
    }

    if (request.status < 200 || request.status >= 300) {
      const message = normalizeText(request.responseText) || `HTTP ${request.status}`;
      throw new Error(`写入 data/database.json 失败：${message}`);
    }

    this.remoteMode = true;
  }

  private persistMirror(): void {
    if (!canUseBrowserStorage()) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    } catch (error) {
      console.warn('Writing local mirror failed.', error);
    }
  }

  private emit(): void {
    window.dispatchEvent(new CustomEvent(UPDATED_EVENT));
  }

  private readMirror(): Database | null {
    if (!canUseBrowserStorage()) {
      return null;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      return normalizeDatabase(JSON.parse(raw));
    } catch (error) {
      console.warn('Reading local mirror failed.', error);
      return null;
    }
  }
}
