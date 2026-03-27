export interface Category {
  id: string;
  name: string;
  code: string;
  description: string;
  accent: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSpec {
  id: string;
  label: string;
  value: string;
  order: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  brand: string;
  modelId: string;
  hp: string;
  guidePrice: number | null;
  officialPrice: number | null;
  hot: boolean;
  summary: string;
  tags: string[];
  image: string;
  specs: ProductSpec[];
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseMeta {
  version: number;
  name: string;
  storageMode: string;
  updatedAt: string;
}

export interface Database {
  meta: DatabaseMeta;
  categories: Category[];
  products: Product[];
}

export interface CategoryDraft {
  id?: string;
  name: string;
  code: string;
  description: string;
  accent: string;
  order: number;
}

export interface ProductSpecDraft {
  id?: string;
  label: string;
  value: string;
  order: number;
}

export interface ProductDraft {
  id?: string;
  categoryId: string;
  name: string;
  brand: string;
  modelId: string;
  hp: string;
  guidePrice: number | null;
  officialPrice: number | null;
  hot: boolean;
  summary: string;
  tags: string[];
  image: string;
  specs: ProductSpecDraft[];
}
