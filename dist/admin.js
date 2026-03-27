import { JsonDatabase } from './shared/db.js';
import { escapeHtml, formatCurrency, formatDateTime, getCategoryMap, normalizeText, parsePrice, tagsToText } from './shared/utils.js';
const db = new JsonDatabase();
const state = {
    snapshot: null,
    filterCategoryId: 'all',
    search: '',
    editingCategoryId: null,
    editingProductId: null,
    productSpecs: []
};
const elements = {
    adminStats: document.getElementById('admin-stats'),
    categoryList: document.getElementById('category-list'),
    categoryForm: document.getElementById('category-form'),
    categoryName: document.getElementById('category-name'),
    categoryCode: document.getElementById('category-code'),
    categoryAccent: document.getElementById('category-accent'),
    categoryOrder: document.getElementById('category-order'),
    categoryDescription: document.getElementById('category-description'),
    newCategoryBtn: document.getElementById('new-category-btn'),
    deleteCategoryBtn: document.getElementById('delete-category-btn'),
    categoryFilter: document.getElementById('category-filter'),
    adminSearch: document.getElementById('admin-search'),
    newProductBtn: document.getElementById('new-product-btn'),
    productTableBody: document.getElementById('product-table-body'),
    productForm: document.getElementById('product-form'),
    productFormTitle: document.getElementById('product-form-title'),
    productCategory: document.getElementById('product-category'),
    productName: document.getElementById('product-name'),
    productBrand: document.getElementById('product-brand'),
    productModelId: document.getElementById('product-model-id'),
    productHp: document.getElementById('product-hp'),
    productGuidePrice: document.getElementById('product-guide-price'),
    productOfficialPrice: document.getElementById('product-official-price'),
    productHot: document.getElementById('product-hot'),
    productSummary: document.getElementById('product-summary'),
    productTags: document.getElementById('product-tags'),
    productImage: document.getElementById('product-image'),
    specList: document.getElementById('spec-list'),
    addSpecRowBtn: document.getElementById('add-spec-row-btn'),
    deleteProductBtn: document.getElementById('delete-product-btn'),
    resetProductFormBtn: document.getElementById('reset-product-form-btn'),
    saveStatus: document.getElementById('save-status'),
    adminNote: document.getElementById('admin-note'),
    exportBtn: document.getElementById('export-json-btn'),
    importInput: document.getElementById('import-json-input'),
    resetDbBtn: document.getElementById('reset-db-btn')
};
function getSnapshot() {
    if (!state.snapshot) {
        throw new Error('Admin data is not loaded yet.');
    }
    return state.snapshot;
}
function setSaveStatus(message, mode = 'neutral') {
    if (!elements.saveStatus) {
        return;
    }
    elements.saveStatus.textContent = message;
    elements.saveStatus.className = `status-chip ${mode !== 'neutral' ? `is-${mode}` : ''}`;
}
function setNote(message) {
    if (elements.adminNote) {
        elements.adminNote.textContent = message;
    }
}
function nextCategoryOrder() {
    return getSnapshot().categories.reduce((max, category)=>Math.max(max, category.order), 0) + 1;
}
function ensureState() {
    const snapshot = getSnapshot();
    if (state.filterCategoryId !== 'all' && !snapshot.categories.some((category)=>category.id === state.filterCategoryId)) {
        state.filterCategoryId = 'all';
    }
    if (state.editingCategoryId && !snapshot.categories.some((category)=>category.id === state.editingCategoryId)) {
        clearCategoryForm();
    }
    if (state.editingProductId && !snapshot.products.some((product)=>product.id === state.editingProductId)) {
        clearProductForm();
    }
    if (elements.categoryFilter) {
        elements.categoryFilter.value = state.filterCategoryId;
    }
    if (elements.adminSearch) {
        elements.adminSearch.value = state.search;
    }
}
function renderAdminStats() {
    if (!elements.adminStats) {
        return;
    }
    const snapshot = getSnapshot();
    const hotCount = snapshot.products.filter((product)=>product.hot).length;
    elements.adminStats.innerHTML = `
    <article class="stat-card">
      <span class="stat-label">数据库模式</span>
      <strong class="stat-value">JSON</strong>
      <span class="stat-note">本地 JSON 文件 + 浏览器同步镜像</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">分类 / 商品</span>
      <strong class="stat-value">${snapshot.categories.length} / ${snapshot.products.length}</strong>
      <span class="stat-note">${hotCount} 个热门商品</span>
    </article>
    <article class="stat-card">
      <span class="stat-label">最近写入</span>
      <strong class="stat-value">${escapeHtml(formatDateTime(snapshot.meta.updatedAt))}</strong>
      <span class="stat-note">当前修改会直接写入 data/database.json</span>
    </article>
  `;
}
function renderCategoryList() {
    if (!elements.categoryList) {
        return;
    }
    const snapshot = getSnapshot();
    elements.categoryList.innerHTML = snapshot.categories.map((category)=>{
        const count = snapshot.products.filter((product)=>product.categoryId === category.id).length;
        return `
        <button
          type="button"
          class="category-list-item ${state.editingCategoryId === category.id ? 'active' : ''}"
          data-category-id="${escapeHtml(category.id)}"
          style="--accent:${escapeHtml(category.accent)}"
        >
          <strong>${escapeHtml(category.name)}</strong>
          <span>${escapeHtml(category.description || '暂无描述')}</span>
          <small>${count} 个商品 / 排序 ${category.order}</small>
        </button>
      `;
    }).join('');
}
function renderCategoryOptions() {
    const snapshot = getSnapshot();
    const options = snapshot.categories.map((category)=>`<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)} (${escapeHtml(category.code)})</option>`).join('');
    if (elements.categoryFilter) {
        elements.categoryFilter.innerHTML = `<option value="all">全部分类</option>${options}`;
        elements.categoryFilter.value = state.filterCategoryId;
    }
    if (elements.productCategory) {
        const currentValue = elements.productCategory.value;
        elements.productCategory.innerHTML = options;
        elements.productCategory.value = currentValue && snapshot.categories.some((category)=>category.id === currentValue) ? currentValue : snapshot.categories[0]?.id || '';
    }
}
function getFilteredProducts() {
    const snapshot = getSnapshot();
    const query = normalizeText(state.search).toLowerCase();
    return snapshot.products.filter((product)=>{
        if (state.filterCategoryId !== 'all' && product.categoryId !== state.filterCategoryId) {
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
            product.specs.map((spec)=>`${spec.label} ${spec.value}`).join(' ')
        ].join(' ').toLowerCase();
        return searchable.includes(query);
    });
}
function renderProductTable() {
    if (!elements.productTableBody) {
        return;
    }
    const snapshot = getSnapshot();
    const categoryMap = getCategoryMap(snapshot.categories);
    const products = getFilteredProducts();
    if (products.length === 0) {
        elements.productTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="table-empty">当前筛选条件下没有商品。</td>
      </tr>
    `;
        return;
    }
    elements.productTableBody.innerHTML = products.map((product)=>{
        const category = categoryMap.get(product.categoryId);
        return `
        <tr class="${state.editingProductId === product.id ? 'active' : ''}" data-product-id="${escapeHtml(product.id)}">
          <td>
            <strong>${escapeHtml(product.name)}</strong>
            <span class="table-sub">${escapeHtml(product.modelId || '型号待补充')}</span>
          </td>
          <td>${escapeHtml(category?.name || '未分类')}</td>
          <td>${escapeHtml(product.hp || '--')}</td>
          <td>${escapeHtml(formatCurrency(product.guidePrice))}</td>
          <td>${product.hot ? '<span class="mini-badge mini-badge-warm">热门</span>' : '<span class="table-sub">普通</span>'}</td>
          <td>${escapeHtml(formatDateTime(product.updatedAt))}</td>
        </tr>
      `;
    }).join('');
}
function renderSpecRows() {
    if (!elements.specList) {
        return;
    }
    if (state.productSpecs.length === 0) {
        elements.specList.innerHTML = '<div class="empty-state compact">还没有额外规格，点“新增规格”即可。</div>';
        return;
    }
    elements.specList.innerHTML = state.productSpecs.map((spec, index)=>`
        <div class="spec-row">
          <input type="text" data-spec-index="${index}" data-spec-field="label" value="${escapeHtml(spec.label)}" placeholder="规格名称，如：APF" />
          <input type="text" data-spec-index="${index}" data-spec-field="value" value="${escapeHtml(spec.value)}" placeholder="规格值，如：5.27" />
          <button class="icon-button" type="button" data-remove-spec="${index}">删除</button>
        </div>
      `).join('');
}
function clearCategoryForm() {
    state.editingCategoryId = null;
    if (elements.categoryName) elements.categoryName.value = '';
    if (elements.categoryCode) elements.categoryCode.value = '';
    if (elements.categoryAccent) elements.categoryAccent.value = '#2563eb';
    if (elements.categoryOrder) elements.categoryOrder.value = String(nextCategoryOrder());
    if (elements.categoryDescription) elements.categoryDescription.value = '';
}
function fillCategoryForm(category) {
    state.editingCategoryId = category.id;
    if (elements.categoryName) elements.categoryName.value = category.name;
    if (elements.categoryCode) elements.categoryCode.value = category.code;
    if (elements.categoryAccent) elements.categoryAccent.value = category.accent;
    if (elements.categoryOrder) elements.categoryOrder.value = String(category.order);
    if (elements.categoryDescription) elements.categoryDescription.value = category.description;
}
function clearProductForm(preferredCategoryId) {
    const snapshot = getSnapshot();
    state.editingProductId = null;
    state.productSpecs = [];
    if (elements.productFormTitle) {
        elements.productFormTitle.textContent = '新建商品';
    }
    if (elements.productCategory) {
        elements.productCategory.value = preferredCategoryId || (state.filterCategoryId !== 'all' ? state.filterCategoryId : snapshot.categories[0]?.id || '');
    }
    if (elements.productName) elements.productName.value = '';
    if (elements.productBrand) elements.productBrand.value = '';
    if (elements.productModelId) elements.productModelId.value = '';
    if (elements.productHp) elements.productHp.value = '';
    if (elements.productGuidePrice) elements.productGuidePrice.value = '';
    if (elements.productOfficialPrice) elements.productOfficialPrice.value = '';
    if (elements.productHot) elements.productHot.checked = false;
    if (elements.productSummary) elements.productSummary.value = '';
    if (elements.productTags) elements.productTags.value = '';
    if (elements.productImage) elements.productImage.value = '';
    renderSpecRows();
    setSaveStatus('未保存', 'neutral');
}
function fillProductForm(product) {
    state.editingProductId = product.id;
    state.productSpecs = product.specs.map((spec)=>({
            ...spec
        }));
    if (elements.productFormTitle) {
        elements.productFormTitle.textContent = `编辑商品 / ${product.name}`;
    }
    if (elements.productCategory) elements.productCategory.value = product.categoryId;
    if (elements.productName) elements.productName.value = product.name;
    if (elements.productBrand) elements.productBrand.value = product.brand;
    if (elements.productModelId) elements.productModelId.value = product.modelId;
    if (elements.productHp) elements.productHp.value = product.hp;
    if (elements.productGuidePrice) elements.productGuidePrice.value = product.guidePrice === null ? '' : String(product.guidePrice);
    if (elements.productOfficialPrice) elements.productOfficialPrice.value = product.officialPrice === null ? '' : String(product.officialPrice);
    if (elements.productHot) elements.productHot.checked = product.hot;
    if (elements.productSummary) elements.productSummary.value = product.summary;
    if (elements.productTags) elements.productTags.value = tagsToText(product.tags);
    if (elements.productImage) elements.productImage.value = product.image;
    renderSpecRows();
    setSaveStatus('已加载', 'neutral');
}
function readCategoryDraft() {
    return {
        id: state.editingCategoryId || undefined,
        name: normalizeText(elements.categoryName?.value),
        code: normalizeText(elements.categoryCode?.value),
        accent: normalizeText(elements.categoryAccent?.value) || '#2563eb',
        order: Number(elements.categoryOrder?.value) || nextCategoryOrder(),
        description: normalizeText(elements.categoryDescription?.value)
    };
}
function readProductDraft() {
    return {
        id: state.editingProductId || undefined,
        categoryId: normalizeText(elements.productCategory?.value),
        name: normalizeText(elements.productName?.value),
        brand: normalizeText(elements.productBrand?.value),
        modelId: normalizeText(elements.productModelId?.value),
        hp: normalizeText(elements.productHp?.value),
        guidePrice: parsePrice(elements.productGuidePrice?.value || ''),
        officialPrice: parsePrice(elements.productOfficialPrice?.value || ''),
        hot: Boolean(elements.productHot?.checked),
        summary: normalizeText(elements.productSummary?.value),
        tags: normalizeText(elements.productTags?.value).split(/[|,，\n]/).map((item)=>item.trim()).filter(Boolean),
        image: normalizeText(elements.productImage?.value),
        specs: state.productSpecs.map((spec, index)=>({
                id: spec.id,
                label: normalizeText(spec.label),
                value: normalizeText(spec.value),
                order: index + 1
            }))
    };
}
function downloadFile(fileName, content) {
    const blob = new Blob([
        content
    ], {
        type: 'application/json;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}
function renderAll() {
    renderAdminStats();
    renderCategoryList();
    renderCategoryOptions();
    renderProductTable();
    renderSpecRows();
}
function bindEvents() {
    elements.newCategoryBtn?.addEventListener('click', ()=>{
        clearCategoryForm();
        setNote('可以直接新建分类，保存后会写入 data/database.json。');
    });
    elements.categoryList?.addEventListener('click', (event)=>{
        const target = event.target;
        const button = target.closest('[data-category-id]');
        if (!button?.dataset.categoryId) {
            return;
        }
        const category = getSnapshot().categories.find((item)=>item.id === button.dataset.categoryId);
        if (!category) {
            return;
        }
        fillCategoryForm(category);
        renderCategoryList();
        setNote(`正在编辑分类“${category.name}”。`);
    });
    elements.categoryForm?.addEventListener('submit', (event)=>{
        event.preventDefault();
        try {
            const category = db.saveCategory(readCategoryDraft());
            state.snapshot = db.getSnapshot();
            ensureState();
            fillCategoryForm(category);
            renderAll();
            setSaveStatus('分类已保存', 'success');
            setNote(`分类“${category.name}”已写入 data/database.json。`);
        } catch (error) {
            console.error(error);
            setSaveStatus('分类保存失败', 'danger');
            setNote(error instanceof Error ? error.message : '分类保存失败。');
        }
    });
    elements.deleteCategoryBtn?.addEventListener('click', ()=>{
        if (!state.editingCategoryId) {
            setNote('请先选择要删除的分类。');
            return;
        }
        if (!window.confirm('删除该分类前，请先确保这个分类下没有商品。确定继续吗？')) {
            return;
        }
        try {
            db.deleteCategory(state.editingCategoryId);
            state.snapshot = db.getSnapshot();
            clearCategoryForm();
            ensureState();
            renderAll();
            setSaveStatus('分类已删除', 'success');
            setNote('分类已删除。');
        } catch (error) {
            console.error(error);
            setSaveStatus('分类删除失败', 'danger');
            setNote(error instanceof Error ? error.message : '分类删除失败。');
        }
    });
    elements.categoryFilter?.addEventListener('change', (event)=>{
        state.filterCategoryId = event.currentTarget.value;
        renderProductTable();
    });
    elements.adminSearch?.addEventListener('input', (event)=>{
        state.search = event.currentTarget.value;
        renderProductTable();
    });
    elements.newProductBtn?.addEventListener('click', ()=>{
        clearProductForm();
        setNote('商品表单已重置，可以新建商品。');
    });
    elements.productTableBody?.addEventListener('click', (event)=>{
        const target = event.target;
        const row = target.closest('[data-product-id]');
        if (!row?.dataset.productId) {
            return;
        }
        const product = getSnapshot().products.find((item)=>item.id === row.dataset.productId);
        if (!product) {
            return;
        }
        fillProductForm(product);
        renderProductTable();
        setNote(`正在编辑商品“${product.name}”。`);
    });
    elements.addSpecRowBtn?.addEventListener('click', ()=>{
        state.productSpecs.push({
            label: '',
            value: '',
            order: state.productSpecs.length + 1
        });
        renderSpecRows();
    });
    elements.specList?.addEventListener('input', (event)=>{
        const target = event.target;
        const index = Number(target.dataset.specIndex);
        const field = target.dataset.specField;
        if (!Number.isFinite(index) || !field || !state.productSpecs[index]) {
            return;
        }
        if (field === 'label') {
            state.productSpecs[index].label = target.value;
        }
        if (field === 'value') {
            state.productSpecs[index].value = target.value;
        }
    });
    elements.specList?.addEventListener('click', (event)=>{
        const target = event.target;
        const button = target.closest('[data-remove-spec]');
        if (!button?.dataset.removeSpec) {
            return;
        }
        const index = Number(button.dataset.removeSpec);
        state.productSpecs.splice(index, 1);
        renderSpecRows();
    });
    elements.productForm?.addEventListener('submit', (event)=>{
        event.preventDefault();
        try {
            const product = db.saveProduct(readProductDraft());
            state.snapshot = db.getSnapshot();
            ensureState();
            fillProductForm(product);
            renderAll();
            setSaveStatus('商品已保存', 'success');
            setNote(`商品“${product.name}”已写入 data/database.json。`);
        } catch (error) {
            console.error(error);
            setSaveStatus('商品保存失败', 'danger');
            setNote(error instanceof Error ? error.message : '商品保存失败。');
        }
    });
    elements.deleteProductBtn?.addEventListener('click', ()=>{
        if (!state.editingProductId) {
            setNote('请先选择要删除的商品。');
            return;
        }
        if (!window.confirm('确定删除这个商品吗？')) {
            return;
        }
        try {
            db.deleteProduct(state.editingProductId);
            state.snapshot = db.getSnapshot();
            clearProductForm();
            renderAll();
            setSaveStatus('商品已删除', 'success');
            setNote('商品已删除。');
        } catch (error) {
            console.error(error);
            setSaveStatus('商品删除失败', 'danger');
            setNote(error instanceof Error ? error.message : '商品删除失败。');
        }
    });
    elements.resetProductFormBtn?.addEventListener('click', ()=>{
        clearProductForm();
        setNote('商品表单已清空。');
    });
    elements.exportBtn?.addEventListener('click', ()=>{
        const fileName = `air-guide-database-${new Date().toISOString().slice(0, 10)}.json`;
        downloadFile(fileName, db.exportJson());
        setNote('已导出当前 JSON 数据库。');
    });
    elements.importInput?.addEventListener('change', async (event)=>{
        const input = event.currentTarget;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        try {
            const text = await file.text();
            db.importJson(JSON.parse(text));
            state.snapshot = db.getSnapshot();
            ensureState();
            clearCategoryForm();
            clearProductForm();
            renderAll();
            setSaveStatus('已导入 JSON', 'success');
            setNote(`已导入 ${file.name}。`);
        } catch (error) {
            console.error(error);
            setSaveStatus('导入失败', 'danger');
            setNote(error instanceof Error ? error.message : '导入 JSON 失败。');
        } finally{
            input.value = '';
        }
    });
    elements.resetDbBtn?.addEventListener('click', ()=>{
        if (!window.confirm('这会把当前数据重置为 data/database.seed.json，确定继续吗？')) {
            return;
        }
        state.snapshot = db.resetToSeed();
        ensureState();
        clearCategoryForm();
        clearProductForm();
        renderAll();
        setSaveStatus('已恢复种子数据', 'success');
        setNote('已恢复到初始 JSON 数据。');
    });
}
async function init() {
    state.snapshot = await db.load();
    ensureState();
    bindEvents();
    clearCategoryForm();
    clearProductForm();
    renderAll();
    setNote('后台已加载。读取和保存都直接对应 data/database.json。');
    db.subscribe(()=>{
        state.snapshot = db.getSnapshot();
        ensureState();
        renderAll();
    });
}
init().catch((error)=>{
    console.error(error);
    setSaveStatus('初始化失败', 'danger');
    setNote(error instanceof Error ? error.message : '后台初始化失败。');
});


//# sourceURL=admin.ts