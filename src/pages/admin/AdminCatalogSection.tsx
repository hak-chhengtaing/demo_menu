import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Upload, X } from 'lucide-react';
import { apiRequest } from '../../services/api';
import { FoodImage } from '../../components/FoodImage';
import type { Category, MenuItem } from '../../types';

interface AdminCatalogSectionProps {
  mode: 'menu' | 'categories';
  categories: Category[];
  menuItems: MenuItem[];
  onRefresh: () => Promise<void>;
}

interface OptionDraft {
  name: string;
  name_km: string;
  selection_type: 'single' | 'multiple';
  is_required: boolean;
  values: Array<{ label: string; label_km: string; price_delta: number; is_default: boolean }>;
}

export function AdminCatalogSection({ mode, categories, menuItems, onRefresh }: AdminCatalogSectionProps) {
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Menu Item Modal
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemCatId, setItemCatId] = useState<number>(categories[0]?.category_id || 1);
  const [itemPrice, setItemPrice] = useState('5.00');
  const [itemPrep, setItemPrep] = useState('12');
  const [itemImageUrl, setItemImageUrl] = useState('/menu-images/food_beef_burger_1794534818679.jpg');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemPopular, setItemPopular] = useState(false);
  const [itemRecommended, setItemRecommended] = useState(false);
  const [itemNameEn, setItemNameEn] = useState('');
  const [itemDescEn, setItemDescEn] = useState('');
  const [itemNameKm, setItemNameKm] = useState('');
  const [itemDescKm, setItemDescKm] = useState('');
  const [itemOptions, setItemOptions] = useState<OptionDraft[]>([]);
  const [uploading, setUploading] = useState(false);

  // Category Modal
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catOrder, setCatOrder] = useState('1');
  const [catActive, setCatActive] = useState(true);
  const [catImageUrl, setCatImageUrl] = useState('/menu-images/food_spring_rolls_1794534821800.jpg');
  const [catNameEn, setCatNameEn] = useState('');
  const [catDescEn, setCatDescEn] = useState('');
  const [catNameKm, setCatNameKm] = useState('');
  const [catDescKm, setCatDescKm] = useState('');

  const handleImageUpload = async (file: File, setter: (url: string) => void) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiRequest<{ url: string }>('/api/admin/upload', { method: 'POST', body: fd });
      setter(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openNewItem = () => {
    setEditingItem(null);
    setItemCatId(categories[0]?.category_id || 1);
    setItemPrice('5.00');
    setItemPrep('12');
    setItemImageUrl('/menu-images/food_beef_burger_1794534818679.jpg');
    setItemAvailable(true);
    setItemPopular(false);
    setItemRecommended(false);
    setItemNameEn('');
    setItemDescEn('');
    setItemNameKm('');
    setItemDescKm('');
    setItemOptions([]);
    setShowItemForm(true);
  };

  const openEditItem = (item: MenuItem) => {
    setEditingItem(item);
    setItemCatId(item.category_id);
    setItemPrice(String(item.price));
    setItemPrep(String(item.prep_time_minutes || 12));
    setItemImageUrl(item.image_url || '');
    setItemAvailable(Boolean(item.is_available));
    setItemPopular(Boolean(item.is_popular));
    setItemRecommended(Boolean(item.is_recommended));
    const tEn = item.translations?.find((t) => t.language_code === 'en');
    const tKm = item.translations?.find((t) => t.language_code === 'km');
    setItemNameEn(tEn?.name || item.name);
    setItemDescEn(tEn?.description || item.description);
    setItemNameKm(tKm?.name || '');
    setItemDescKm(tKm?.description || '');
    setItemOptions(
      (item.options || []).map((o) => ({
        name: o.name,
        name_km: o.name_km || '',
        selection_type: o.selection_type,
        is_required: Boolean(o.is_required),
        values: (o.values || []).map((v) => ({
          label: v.label,
          label_km: v.label_km || '',
          price_delta: Number(v.price_delta || 0),
          is_default: Boolean(v.is_default),
        })),
      }))
    );
    setShowItemForm(true);
  };

  const saveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        category_id: itemCatId,
        price: Number(itemPrice),
        prep_time_minutes: Number(itemPrep),
        image_url: itemImageUrl,
        is_available: itemAvailable,
        is_popular: itemPopular,
        is_recommended: itemRecommended,
        translations: [
          { language_code: 'en', name: itemNameEn, description: itemDescEn },
          ...(itemNameKm.trim() ? [{ language_code: 'km', name: itemNameKm, description: itemDescKm }] : []),
        ],
        options: itemOptions,
      };
      if (editingItem) {
        await apiRequest(`/api/admin/menu-items/${editingItem.menu_item_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatusMsg(`Updated "${itemNameEn}"`);
      } else {
        await apiRequest('/api/admin/menu-items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatusMsg(`Created "${itemNameEn}"`);
      }
      setShowItemForm(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save menu item.');
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    await apiRequest(`/api/admin/menu-items/${item.menu_item_id}`, {
      method: 'PUT',
      body: JSON.stringify({ is_available: !item.is_available }),
    });
    await onRefresh();
  };

  const deleteMenuItem = async (item: MenuItem) => {
    const res = await apiRequest<{ message?: string }>(`/api/admin/menu-items/${item.menu_item_id}`, { method: 'DELETE' });
    setStatusMsg(res.message || `Deleted "${item.name}"`);
    await onRefresh();
  };

  const openNewCategory = () => {
    setEditingCat(null);
    setCatOrder(String(categories.length + 1));
    setCatActive(true);
    setCatImageUrl('/menu-images/food_spring_rolls_1794534821800.jpg');
    setCatNameEn('');
    setCatDescEn('');
    setCatNameKm('');
    setCatDescKm('');
    setShowCatForm(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCat(cat);
    setCatOrder(String(cat.display_order));
    setCatActive(Boolean(cat.is_active));
    setCatImageUrl(cat.image_url || '');
    const tEn = cat.translations?.find((t) => t.language_code === 'en');
    const tKm = cat.translations?.find((t) => t.language_code === 'km');
    setCatNameEn(tEn?.name || cat.name);
    setCatDescEn(tEn?.description || cat.description);
    setCatNameKm(tKm?.name || '');
    setCatDescKm(tKm?.description || '');
    setShowCatForm(true);
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        display_order: Number(catOrder),
        is_active: catActive,
        image_url: catImageUrl,
        translations: [
          { language_code: 'en', name: catNameEn, description: catDescEn },
          ...(catNameKm.trim() ? [{ language_code: 'km', name: catNameKm, description: catDescKm }] : []),
        ],
      };
      if (editingCat) {
        await apiRequest(`/api/admin/categories/${editingCat.category_id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setStatusMsg(`Updated category "${catNameEn}"`);
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setStatusMsg(`Created category "${catNameEn}"`);
      }
      setShowCatForm(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category.');
    }
  };

  const deleteCategory = async (cat: Category) => {
    setError('');
    try {
      await apiRequest(`/api/admin/categories/${cat.category_id}`, { method: 'DELETE' });
      setStatusMsg(`Deleted category "${cat.name}"`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot delete category.');
    }
  };

  return (
    <div className="space-y-5">
      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex justify-between">
          <span>{statusMsg}</span>
          <button onClick={() => setStatusMsg('')} className="cursor-pointer">Dismiss</button>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="cursor-pointer">Dismiss</button>
        </div>
      )}

      {mode === 'menu' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Menu Items ({menuItems.length})</h2>
              <p className="text-xs text-slate-500">Manage dishes, pricing, availability, multilingual names, and modifiers</p>
            </div>
            <button
              onClick={openNewItem}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Food Item
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Dish</th>
                  <th className="text-left py-3 px-4 font-semibold">Category</th>
                  <th className="text-right py-3 px-4 font-semibold">Price</th>
                  <th className="text-center py-3 px-4 font-semibold">Modifiers</th>
                  <th className="text-center py-3 px-4 font-semibold">Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {menuItems.map((item) => (
                  <tr key={item.menu_item_id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                          <FoodImage src={item.image_url} alt={item.name} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500 line-clamp-1 max-w-xs">{item.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs">{item.category_name}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">${Number(item.price).toFixed(2)}</td>
                    <td className="py-3 px-4 text-center text-xs font-mono text-slate-600">{item.options?.length || 0}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => void toggleAvailability(item)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                          item.is_available ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => openEditItem(item)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteMenuItem(item)}
                        className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Categories ({categories.length})</h2>
              <p className="text-xs text-slate-500">Set display order, visibility, and multilingual category names</p>
            </div>
            <button
              onClick={openNewCategory}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Category
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="text-left py-3 px-4 font-semibold">Category</th>
                  <th className="text-center py-3 px-4 font-semibold">Order</th>
                  <th className="text-center py-3 px-4 font-semibold">Dishes</th>
                  <th className="text-center py-3 px-4 font-semibold">Status</th>
                  <th className="text-right py-3 px-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((cat) => (
                  <tr key={cat.category_id}>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                          <FoodImage src={cat.image_url} alt={cat.name} />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{cat.name}</div>
                          <div className="text-xs text-slate-500">{cat.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center font-mono">{cat.display_order}</td>
                    <td className="py-3 px-4 text-center font-mono">{cat.item_count || 0}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cat.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {cat.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => openEditCategory(cat)}
                        className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void deleteCategory(cat)}
                        className="p-1.5 rounded-lg border border-red-200 hover:bg-red-50 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Menu Item Form Modal */}
      {showItemForm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={saveMenuItem}
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editingItem ? 'Edit Menu Item' : 'Add Menu Item'}</h3>
              <button type="button" onClick={() => setShowItemForm(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={itemCatId}
                    onChange={(e) => setItemCatId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    {categories.map((c) => (
                      <option key={c.category_id} value={c.category_id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prep Time (min)</label>
                  <input
                    type="number"
                    min="1"
                    value={itemPrep}
                    onChange={(e) => setItemPrep(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name (English)</label>
                  <input
                    type="text"
                    required
                    value={itemNameEn}
                    onChange={(e) => setItemNameEn(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name (Khmer / ភាសាខ្មែរ)</label>
                  <input
                    type="text"
                    value={itemNameKm}
                    onChange={(e) => setItemNameKm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description (English)</label>
                  <textarea rows={2} value={itemDescEn} onChange={(e) => setItemDescEn(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Khmer)</label>
                  <textarea rows={2} value={itemDescKm} onChange={(e) => setItemDescKm(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={itemAvailable} onChange={(e) => setItemAvailable(e.target.checked)} />
                  Available to Order
                </label>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={itemPopular} onChange={(e) => setItemPopular(e.target.checked)} />
                  Popular Dish
                </label>
                <label className="flex items-center gap-2 text-xs font-medium">
                  <input type="checkbox" checked={itemRecommended} onChange={(e) => setItemRecommended(e.target.checked)} />
                  Chef Recommended
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Dish Image</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={itemImageUrl}
                    onChange={(e) => setItemImageUrl(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-xs font-mono"
                  />
                  <label className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploading ? 'Uploading...' : 'Upload'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleImageUpload(f, setItemImageUrl);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Modifiers Builder */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Customization & Modifier Groups</span>
                  <button
                    type="button"
                    onClick={() =>
                      setItemOptions((prev) => [
                        ...prev,
                        { name: 'Size', name_km: 'ទំហំ', selection_type: 'single', is_required: false, values: [{ label: 'Regular', label_km: 'ធម្មតា', price_delta: 0, is_default: true }] },
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold cursor-pointer"
                  >
                    + Add Modifier Group
                  </button>
                </div>

                {itemOptions.map((opt, oIdx) => (
                  <div key={oIdx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Group Name (e.g. Spice Level)"
                        value={opt.name}
                        onChange={(e) => {
                          const next = [...itemOptions];
                          next[oIdx].name = e.target.value;
                          setItemOptions(next);
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                      />
                      <select
                        value={opt.selection_type}
                        onChange={(e) => {
                          const next = [...itemOptions];
                          next[oIdx].selection_type = e.target.value as 'single' | 'multiple';
                          setItemOptions(next);
                        }}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                      >
                        <option value="single">Single Pick</option>
                        <option value="multiple">Multi Pick</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setItemOptions((prev) => prev.filter((_, idx) => idx !== oIdx))}
                        className="text-red-600 text-xs px-2 cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="space-y-1.5 pl-2">
                      {opt.values.map((val, vIdx) => (
                        <div key={vIdx} className="flex items-center gap-2">
                          <input
                            placeholder="Option label"
                            value={val.label}
                            onChange={(e) => {
                              const next = [...itemOptions];
                              next[oIdx].values[vIdx].label = e.target.value;
                              setItemOptions(next);
                            }}
                            className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs"
                          />
                          <input
                            type="number"
                            step="0.25"
                            placeholder="+$"
                            value={val.price_delta}
                            onChange={(e) => {
                              const next = [...itemOptions];
                              next[oIdx].values[vIdx].price_delta = Number(e.target.value);
                              setItemOptions(next);
                            }}
                            className="w-20 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = [...itemOptions];
                              next[oIdx].values = next[oIdx].values.filter((_, idx) => idx !== vIdx);
                              setItemOptions(next);
                            }}
                            className="text-slate-400 hover:text-red-600 text-xs cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...itemOptions];
                          next[oIdx].values.push({ label: '', label_km: '', price_delta: 0, is_default: false });
                          setItemOptions(next);
                        }}
                        className="text-xs font-semibold text-indigo-600 cursor-pointer"
                      >
                        + Add Option Choice
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button type="button" onClick={() => setShowItemForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">
                Save Dish
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Category Form Modal */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={saveCategory} className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{editingCat ? 'Edit Category' : 'Add Category'}</h3>
              <button type="button" onClick={() => setShowCatForm(false)} className="cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name (English)</label>
                  <input required value={catNameEn} onChange={(e) => setCatNameEn(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Name (Khmer)</label>
                  <input value={catNameKm} onChange={(e) => setCatNameKm(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description (English)</label>
                <input value={catDescEn} onChange={(e) => setCatDescEn(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Display Order</label>
                  <input type="number" value={catOrder} onChange={(e) => setCatOrder(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono" />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input type="checkbox" checked={catActive} onChange={(e) => setCatActive(e.target.checked)} />
                    Active Category
                  </label>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button type="button" onClick={() => setShowCatForm(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold cursor-pointer">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer">Save Category</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
