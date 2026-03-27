import type { Database, Product, ProductSpec } from './shared/types.ts';
import { JsonDatabase } from './shared/db.ts';
import { escapeHtml, formatCurrency, formatDateTime, getCategoryMap, getProductImage, normalizeText } from './shared/utils.ts';

const FRONT_STATE_KEY = 'air-guide-front-ui-state';

interface FrontUiState {
  budget: number;
  selectedProductIds: string[];
  activeCategoryId: string;
  query: string;
}

const db = new JsonDatabase();

const state: FrontUiState & {
  snapshot: Database | null;
  detailProductId: string | null;
} = {
  snapshot: null,
  detailProductId: null,
  budget: 38000,
  selectedProductIds: [],
  activeCategoryId: 'all',
  query: '',
};

const elements = {
  stats: document.getElementById('front-stats'),
  categoryTabs: document.getElementById('category-tabs'),
  hotList: document.getElementById('hot-list'),
  productGrid: document.getElementById('product-grid'),
  productCount: document.getElementById('product-count'),
  searchInput: document.getElementById('search-input') as HTMLInputElement | null,
  budgetInput: document.getElementById('budget-input') as HTMLInputElement | null,
  selectedList: document.getElementById('selected-list'),
  selectedSummary: document.getElementById('selected-summary'),
  clearSelection: document.getElementById('clear-selection'),
  productDialog: document.getElementById('product-dialog') as HTMLDialogElement | null,
  dialogContent: document.getElementById('product-dialog-content'),
};

function loadUiState(): void {
  try {
    const raw = localStorage.getItem(FRONT_STATE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as Partial<FrontUiState>;
    if (typeof parsed.budget === 'number' && Number.isFinite(parsed.budget)) {
      state.budget = parsed.budget;
    }
    if (Array.isArray(parsed.selectedProductIds)) {
      state.selectedProductIds = parsed.selectedProductIds.filter((item) => typeof item === 'string');
    }
    if (typeof parsed.activeCategoryId === 'string') {
      state.activeCategoryId = parsed.activeCategoryId;
    }
    if (typeof parsed.query === 'string') {
      state.query = parsed.query;
    }
  } catch (error) {
    console.warn('读取前台状态失败，已忽略。', error);
  }
}

function persistUiState(): void {
  try {
    localStorage.setItem(
      FRONT_STATE_KEY,
      JSON.stringify({
        budget: state.budget,
        selectedProductIds: state.selectedProductIds,
        activeCategoryId: state.activeCategoryId,
        query: state.query,
      }),
    );
  } catch (error) {
    console.warn('写入前台状态失败。', error);
  }
}

function getSnapshot(): Database {
  if (!state.snapshot) {
    throw new Error('前台数据库尚未加载。');
  }
  return state.snapshot;
}

function ensureState(): void {
  const snapshot = getSnapshot();
  const categoryExists =
    state.activeCategoryId === 'all' ||
    snapshot.categories.some((category) => category.id === state.activeCategoryId);

  if (!categoryExists) {
    state.activeCategoryId = 'all';
  }

  state.selectedProductIds = state.selectedProductIds.filter((productId) =>
    snapshot.products.some((product) => product.id === productId),
  );

  if (elements.searchInput) {
    elements.searchInput.value = state.query;
  }
  if (elements.budgetInput) {
    elements.budgetInput.value = String(state.budget);
  }
}

function getFilteredProducts(): Product[] {
  const snapshot = getSnapshot();
  const query = normalizeText(state.query).toLowerCase();

  return snapshot.products.filter((product) => {
    if (state.activeCategoryId !== 'all' && product.categoryId !== state.activeCategoryId) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      product.name,
      product.brand,
      product.modelId,
      product.hp,
      product.summary,
      product.tags.join(' '),
      product.specs.map((spec) => `${spec.label} ${spec.value}`).join(' '),
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  });
}

function buildDisplaySpecs(product: Product): ProductSpec[] {
  const specs: ProductSpec[] = [];
  if (product.brand) {
    specs.push({ id: 'brand', label: '品牌', value: product.brand, order: 0 });
  }
  if (product.modelId) {
    specs.push({ id: 'model', label: '型号', value: product.modelId, order: 1 });
  }
  if (product.hp) {
    specs.push({ id: 'hp', label: '匹数', value: product.hp, order: 2 });
  }
  return [...specs, ...product.specs];
}

function getSelectedProducts(): Product[] {
  const snapshot = getSnapshot();
  return state.selectedProductIds
    .map((productId) => snapshot.products.find((product) => product.id === productId))
    .filter(Boolean) as Product[];
}

function getSelectionTotal(): number {
  return getSelectedProducts().reduce((total, product) => total + (product.guidePrice || 0), 0);
}

function toggleSelection(productId: string): void {
  const exists = state.selectedProductIds.includes(productId);
  state.selectedProductIds = exists
    ? state.selectedProductIds.filter((item) => item !== productId)
    : [...state.selectedProductIds, productId];
  persistUiState();
  renderSelection();
  renderProductGrid();
  renderHotList();
  renderDialog();
}

function renderStats(): void {
  if (!elements.stats) {
    return;
  }

  const snapshot = getSnapshot();
  const selectedCount = state.selectedProductIds.length;
  const total = getSelectionTotal();
  const remaining = state.budget - total;

  elements.stats.innerHTML = `
    <article class="stat-card">
      <span class="stat-label">商品总数</span>
      <strong class="stat-value">${snapshot.products.length}</strong>
      <span class="stat-note">${snapshot.categories.length} 个分类</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">当前配置</span>
      <strong class="stat-value">${selectedCount}</strong>
      <span class="stat-note">已选金额 ${escapeHtml(formatCurrency(total))}</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">预算余额</span>
      <strong class="stat-value ${remaining < 0 ? 'is-danger' : ''}">${escapeHtml(formatCurrency(remaining))}</strong>
      <span class="stat-note">最后同步 ${escapeHtml(formatDateTime(snapshot.meta.updatedAt))}</span>
    </article>
  `;
}

function renderCategoryTabs(): void {
  if (!elements.categoryTabs) {
    return;
  }

  const snapshot = getSnapshot();
  const categoriesHtml = snapshot.categories
    .map((category) => {
      const count = snapshot.products.filter((product) => product.categoryId === category.id).length;
      return `
        <button
          class="tab-chip ${state.activeCategoryId === category.id ? 'active' : ''}"
          type="button"
          data-category-id="${escapeHtml(category.id)}"
          style="--accent:${escapeHtml(category.accent)}"
        >
          <span>${escapeHtml(category.name)}</span>
          <small>${count}</small>
        </button>
      `;
    })
    .join('');

  elements.categoryTabs.innerHTML = `
    <button class="tab-chip ${state.activeCategoryId === 'all' ? 'active' : ''}" type="button" data-category-id="all">
      <span>全部</span>
      <small>${snapshot.products.length}</small>
    </button>
    ${categoriesHtml}
  `;
}

function renderHotList(): void {
  if (!elements.hotList) {
    return;
  }

  const snapshot = getSnapshot();
  const categoryMap = getCategoryMap(snapshot.categories);
  const hotProducts = snapshot.products
    .filter((product) => product.hot)
    .filter((product) => state.activeCategoryId === 'all' || product.categoryId === state.activeCategoryId)
    .slice(0, 3);

  if (hotProducts.length === 0) {
    elements.hotList.innerHTML = '<div class="empty-state">当前分类还没有热门推荐，可以去后台把商品标记为热门。</div>';
    return;
  }

  elements.hotList.innerHTML = hotProducts
    .map((product) => {
      const category = categoryMap.get(product.categoryId);
      const selected = state.selectedProductIds.includes(product.id);
      return `
        <article class="hot-card">
          <img class="hot-card-image" src="${escapeHtml(getProductImage(product, category))}" alt="${escapeHtml(product.name)}" />
          <div class="hot-card-body">
            <span class="mini-badge" style="--accent:${escapeHtml(category?.accent || '#2563eb')}">${escapeHtml(category?.name || '未分类')}</span>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.summary)}</p>
            <div class="price-pair">
              <strong>${escapeHtml(formatCurrency(product.guidePrice))}</strong>
              <span>${escapeHtml(formatCurrency(product.officialPrice))}</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-secondary" type="button" data-action="detail" data-product-id="${escapeHtml(product.id)}">查看详情</button>
              <button class="btn ${selected ? 'btn-ghost' : 'btn-primary'}" type="button" data-action="toggle-select" data-product-id="${escapeHtml(product.id)}">
                ${selected ? '移出清单' : '加入配置'}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderProductGrid(): void {
  if (!elements.productGrid || !elements.productCount) {
    return;
  }

  const snapshot = getSnapshot();
  const categoryMap = getCategoryMap(snapshot.categories);
  const products = getFilteredProducts();

  elements.productCount.textContent = `${products.length} 个结果`;

  if (products.length === 0) {
    elements.productGrid.innerHTML = '<div class="empty-state">没有符合条件的商品，试试调整搜索词或切换分类。</div>';
    return;
  }

  elements.productGrid.innerHTML = products
    .map((product) => {
      const category = categoryMap.get(product.categoryId);
      const selected = state.selectedProductIds.includes(product.id);
      return `
        <article class="product-card">
          <div class="product-card-top">
            <span class="mini-badge" style="--accent:${escapeHtml(category?.accent || '#2563eb')}">${escapeHtml(category?.name || '未分类')}</span>
            ${product.hot ? '<span class="mini-badge mini-badge-warm">热门</span>' : ''}
          </div>
          <img class="product-image" src="${escapeHtml(getProductImage(product, category))}" alt="${escapeHtml(product.name)}" />
          <div class="product-card-body">
            <h3>${escapeHtml(product.name)}</h3>
            <p class="product-summary">${escapeHtml(product.summary)}</p>
            <div class="product-meta-line">
              <span>${escapeHtml(product.modelId || '型号待补充')}</span>
              <span>${escapeHtml(product.hp || '--')}</span>
            </div>
            <div class="tag-row">
              ${product.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="price-pair">
              <strong>${escapeHtml(formatCurrency(product.guidePrice))}</strong>
              <span>${escapeHtml(formatCurrency(product.officialPrice))}</span>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary" type="button" data-action="detail" data-product-id="${escapeHtml(product.id)}">查看详情</button>
            <button class="btn ${selected ? 'btn-ghost' : 'btn-primary'}" type="button" data-action="toggle-select" data-product-id="${escapeHtml(product.id)}">
              ${selected ? '移出清单' : '加入配置'}
            </button>
          </div>
        </article>
      `;
    })
    .join('');
}

function renderSelection(): void {
  if (!elements.selectedList || !elements.selectedSummary) {
    return;
  }

  const snapshot = getSnapshot();
  const categoryMap = getCategoryMap(snapshot.categories);
  const products = getSelectedProducts();
  const total = getSelectionTotal();
  const remaining = state.budget - total;

  elements.selectedSummary.innerHTML = `
    <div class="budget-box">
      <span>预算上限</span>
      <strong>${escapeHtml(formatCurrency(state.budget))}</strong>
    </div>
    <div class="budget-box">
      <span>当前合计</span>
      <strong>${escapeHtml(formatCurrency(total))}</strong>
    </div>
    <div class="budget-box">
      <span>剩余预算</span>
      <strong class="${remaining < 0 ? 'is-danger' : ''}">${escapeHtml(formatCurrency(remaining))}</strong>
    </div>
  `;

  if (products.length === 0) {
    elements.selectedList.innerHTML = '<div class="empty-state">还没有加入任何商品。前台这里只做选购展示，真正的增删改都在后台页完成。</div>';
    return;
  }

  elements.selectedList.innerHTML = products
    .map((product) => {
      const category = categoryMap.get(product.categoryId);
      return `
        <article class="selected-item">
          <img class="selected-item-image" src="${escapeHtml(getProductImage(product, category))}" alt="${escapeHtml(product.name)}" />
          <div class="selected-item-body">
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(category?.name || '未分类')} · ${escapeHtml(product.hp || '--')}</span>
            <span>${escapeHtml(formatCurrency(product.guidePrice))}</span>
          </div>
          <button class="icon-button" type="button" data-remove-id="${escapeHtml(product.id)}">移除</button>
        </article>
      `;
    })
    .join('');
}

function renderDialog(): void {
  if (!elements.dialogContent || !elements.productDialog) {
    return;
  }

  if (!state.detailProductId) {
    elements.dialogContent.innerHTML = '';
    return;
  }

  const snapshot = getSnapshot();
  const product = snapshot.products.find((item) => item.id === state.detailProductId);
  if (!product) {
    state.detailProductId = null;
    elements.productDialog.close();
    elements.dialogContent.innerHTML = '';
    return;
  }

  const category = snapshot.categories.find((item) => item.id === product.categoryId);
  const selected = state.selectedProductIds.includes(product.id);

  elements.dialogContent.innerHTML = `
    <div class="dialog-header">
      <div>
        <span class="mini-badge" style="--accent:${escapeHtml(category?.accent || '#2563eb')}">${escapeHtml(category?.name || '未分类')}</span>
        <h2>${escapeHtml(product.name)}</h2>
        <p>${escapeHtml(product.summary)}</p>
      </div>
      <button class="icon-button" type="button" data-close-dialog="true">关闭</button>
    </div>
    <div class="dialog-layout">
      <img class="dialog-image" src="${escapeHtml(getProductImage(product, category))}" alt="${escapeHtml(product.name)}" />
      <div class="dialog-side">
        <div class="price-pair">
          <strong>${escapeHtml(formatCurrency(product.guidePrice))}</strong>
          <span>${escapeHtml(formatCurrency(product.officialPrice))}</span>
        </div>
        <div class="tag-row">
          ${product.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
        <button class="btn ${selected ? 'btn-ghost' : 'btn-primary'}" type="button" data-action="toggle-select" data-product-id="${escapeHtml(product.id)}">
          ${selected ? '移出当前配置' : '加入当前配置'}
        </button>
      </div>
    </div>
    <div class="spec-grid">
      ${buildDisplaySpecs(product)
        .map(
          (spec) => `
            <article class="spec-card">
              <span>${escapeHtml(spec.label)}</span>
              <strong>${escapeHtml(spec.value)}</strong>
            </article>
          `,
        )
        .join('')}
    </div>
  `;
}

function renderAll(): void {
  renderStats();
  renderCategoryTabs();
  renderHotList();
  renderProductGrid();
  renderSelection();
  renderDialog();
}

function openDialog(productId: string): void {
  state.detailProductId = productId;
  renderDialog();
  if (elements.productDialog && !elements.productDialog.open) {
    elements.productDialog.showModal();
  }
}

function closeDialog(): void {
  state.detailProductId = null;
  if (elements.productDialog?.open) {
    elements.productDialog.close();
  }
  renderDialog();
}

function bindEvents(): void {
  elements.searchInput?.addEventListener('input', (event) => {
    state.query = (event.currentTarget as HTMLInputElement).value;
    persistUiState();
    renderProductGrid();
  });

  elements.budgetInput?.addEventListener('change', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    state.budget = Number.isFinite(value) && value > 0 ? value : 38000;
    persistUiState();
    renderStats();
    renderSelection();
  });

  elements.clearSelection?.addEventListener('click', () => {
    state.selectedProductIds = [];
    persistUiState();
    renderSelection();
    renderProductGrid();
    renderHotList();
    renderDialog();
    renderStats();
  });

  elements.categoryTabs?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-category-id]');
    if (!button) {
      return;
    }
    state.activeCategoryId = button.dataset.categoryId || 'all';
    persistUiState();
    renderCategoryTabs();
    renderHotList();
    renderProductGrid();
  });

  elements.hotList?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const actionButton = target.closest<HTMLButtonElement>('[data-action]');
    if (!actionButton) {
      return;
    }

    const productId = actionButton.dataset.productId;
    if (!productId) {
      return;
    }

    if (actionButton.dataset.action === 'detail') {
      openDialog(productId);
    }
    if (actionButton.dataset.action === 'toggle-select') {
      toggleSelection(productId);
      renderStats();
    }
  });

  elements.productGrid?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const actionButton = target.closest<HTMLButtonElement>('[data-action]');
    if (!actionButton) {
      return;
    }

    const productId = actionButton.dataset.productId;
    if (!productId) {
      return;
    }

    if (actionButton.dataset.action === 'detail') {
      openDialog(productId);
    }
    if (actionButton.dataset.action === 'toggle-select') {
      toggleSelection(productId);
      renderStats();
    }
  });

  elements.selectedList?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('[data-remove-id]');
    if (!button?.dataset.removeId) {
      return;
    }
    toggleSelection(button.dataset.removeId);
    renderStats();
  });

  elements.dialogContent?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const closeButton = target.closest<HTMLButtonElement>('[data-close-dialog]');
    if (closeButton) {
      closeDialog();
      return;
    }

    const actionButton = target.closest<HTMLButtonElement>('[data-action]');
    if (!actionButton?.dataset.productId) {
      return;
    }

    if (actionButton.dataset.action === 'toggle-select') {
      toggleSelection(actionButton.dataset.productId);
      renderStats();
    }
  });

  elements.productDialog?.addEventListener('click', (event) => {
    if (event.target === elements.productDialog) {
      closeDialog();
    }
  });

  elements.productDialog?.addEventListener('close', () => {
    state.detailProductId = null;
  });
}

async function init(): Promise<void> {
  loadUiState();
  state.snapshot = await db.load();
  ensureState();
  bindEvents();
  renderAll();

  db.subscribe(() => {
    state.snapshot = db.getSnapshot();
    ensureState();
    renderAll();
  });
}

init().catch((error) => {
  console.error(error);
  if (elements.productGrid) {
    elements.productGrid.innerHTML = `<div class="empty-state">页面初始化失败: ${escapeHtml(error instanceof Error ? error.message : '未知错误')}</div>`;
  }
});
