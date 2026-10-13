export interface ShoppingItem {
  id: string;
  name: string;
  quantity: string | null;
  categoryId: string | null;
  checked: boolean;
  checkedAt: string | null;
  addedBy: string | null;
  createdAt: string;
}

export interface TemplateItem {
  id?: string;
  name: string;
  quantity: string | null;
  categoryId: string | null;
}

export interface ShoppingTemplate {
  id: string;
  name: string;
  icon: string;
  items: TemplateItem[];
}
