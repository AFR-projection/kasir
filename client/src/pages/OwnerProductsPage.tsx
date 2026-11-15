import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  Camera,
  FolderCog,
  Loader2,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { ApiError, api } from "../lib/api";
import type { Category, Product, ProductInput } from "../types";
import { useDebouncedValue } from "../lib/hooks";
import { classNames, compressImage, getErrorMessage, roundMoneyValue, roundQuantityValue, unitOptions } from "../lib/utils";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  PageError,
  PageHeader,
  PageLoader,
  Pagination,
  SearchField,
} from "../components/ui";
import { ProductImage } from "../components/ProductImage";

const PAGE_LIMIT = 12;

export function OwnerProductsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
  });

  const productQuery = useQuery({
    queryKey: ["products", { search: debouncedSearch, categoryId, status, page }],
    queryFn: () =>
      api.products.list({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        status,
        page,
        limit: PAGE_LIMIT,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, status]);

  const refreshLists = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    ]);
  };

  const openCreate = () => {
    setEditingProduct(null);
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setFormOpen(true);
  };

  const handleToggleStatus = async (product: Product) => {
    setTogglingId(product.id);
    try {
      const result = await api.products.setStatus(product.id, !product.isActive);
      toast.success(result.message);
      await refreshLists();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    setDeleting(true);
    try {
      const result = await api.products.remove(deletingProduct.id);
      toast.success(result.message);
      setDeletingProduct(null);
      await refreshLists();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  };

  const categories = categoriesQuery.data?.categories || [];
  const canAddProduct = categories.length > 0;

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Katalog toko"
        title="Produk"
        description="Atur informasi produk, harga, satuan, dan status jual dalam satu tempat."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<FolderCog size={17} />}
              onClick={() => setCategoryModalOpen(true)}
            >
              Kategori
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={17} />}
              onClick={openCreate}
              disabled={!canAddProduct}
              title={!canAddProduct ? "Buat kategori terlebih dahulu" : undefined}
            >
              Produk Baru
            </Button>
          </>
        }
      />

      {!categoriesQuery.isLoading && categories.length === 0 && (
        <div className="inline-banner inline-banner--amber">
          <FolderCog size={19} />
          <div>
            <strong>Mulai dengan membuat kategori</strong>
            <p>Setiap produk perlu masuk ke kategori agar katalog lebih rapi.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setCategoryModalOpen(true)}>
            Buat kategori
          </Button>
        </div>
      )}

      <section className="panel products-panel">
        <div className="filter-bar">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Cari nama produk..."
            className="filter-bar__search"
            ariaLabel="Cari produk"
          />
          <select
            className="select"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-label="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-label="Filter status"
          >
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </select>
          {productQuery.isFetching && <Loader2 size={17} className="spin filter-bar__spinner" />}
        </div>

        {productQuery.isLoading ? (
          <PageLoader label="Memuat produk..." />
        ) : productQuery.isError ? (
          <PageError message={getErrorMessage(productQuery.error)} onRetry={() => void productQuery.refetch()} />
        ) : productQuery.data?.items.length === 0 ? (
          <EmptyState
            icon={<PackageOpen size={25} />}
            title={search || categoryId || status !== "all" ? "Produk tidak ditemukan" : "Belum ada produk"}
            description={
              search || categoryId || status !== "all"
                ? "Coba ubah kata kunci atau filter untuk menemukan produk lain."
                : "Tambahkan produk pertama Anda agar dapat dijual di halaman kasir."
            }
            action={
              canAddProduct && search === "" && categoryId === "" && status === "all" ? (
                <Button icon={<Plus size={17} />} onClick={openCreate}>
                  Tambah Produk
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="product-admin-grid">
              {productQuery.data?.items.map((product) => (
                <article className={classNames("product-admin-card", !product.isActive && "product-admin-card--inactive")} key={product.id}>
                  <ProductImage
                    src={product.imageUrl}
                    name={product.name}
                    size="lg"
                    className="product-admin-card__image"
                  />

                  <div className="product-admin-card__content">
                    <div className="product-admin-card__heading">
                      <div className="product-admin-card__title">
                        <h2>{product.name}</h2>
                        <Badge tone={product.isActive ? "green" : "gray"} dot>
                          {product.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <p className="product-admin-card__meta">
                        {product.categoryName}
                        <span aria-hidden="true">·</span>
                        per {product.unit}
                      </p>
                    </div>

                    <div className="product-admin-card__metrics">
                      <div>
                        <span>Harga modal</span>
                        <strong>
                          {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(product.costPrice)}
                        </strong>
                      </div>
                      <div>
                        <span>Harga jual</span>
                        <strong className="price-highlight">
                          {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(product.sellingPrice)}
                        </strong>
                      </div>
                      <div>
                        <span>Stok tersedia</span>
                        <strong className={!product.lowStock ? "" : "stock-warning-text"}>
                          {new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(product.stock)} {product.unit}
                        </strong>
                      </div>
                    </div>

                    <div className="product-admin-card__footer">
                      <span className="low-stock-note">
                        {product.lowStock ? (
                          <>
                            <Badge tone={product.stock === 0 ? "red" : "amber"} dot>
                              {product.stock === 0 ? "Habis" : "Stok menipis"}
                            </Badge>
                            <span>Minimum {product.minStock} {product.unit}</span>
                          </>
                        ) : (
                          <span>Minimum stok {product.minStock} {product.unit}</span>
                        )}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={product.isActive}
                        aria-label={product.isActive ? "Nonaktifkan produk" : "Aktifkan produk"}
                        className={`switch${product.isActive ? " switch--on" : ""}`}
                        onClick={() => void handleToggleStatus(product)}
                        disabled={togglingId === product.id}
                      >
                        <span />
                      </button>
                    </div>
                  </div>

                  <div className="product-admin-card__tools">
                    <IconButton label={`Edit ${product.name}`} onClick={() => openEdit(product)}>
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label={`Hapus ${product.name}`} tone="danger" onClick={() => setDeletingProduct(product)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              page={productQuery.data?.page || 1}
              limit={productQuery.data?.limit || PAGE_LIMIT}
              total={productQuery.data?.total || 0}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <ProductFormModal
        open={formOpen}
        initialProduct={editingProduct}
        categories={categories}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          setFormOpen(false);
          await refreshLists();
        }}
      />

      <CategoryManagerModal
        open={categoryModalOpen}
        categories={categories}
        onClose={() => setCategoryModalOpen(false)}
        onChange={refreshLists}
      />

      <ConfirmDialog
        open={Boolean(deletingProduct)}
        title="Hapus produk?"
        description={
          deletingProduct
            ? `"${deletingProduct.name}" akan dihapus dari katalog dan kasir. Riwayat transaksi serta stok tetap tersimpan untuk audit.`
            : ""
        }
        confirmLabel="Hapus Produk"
        loading={deleting}
        onClose={() => !deleting && setDeletingProduct(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

interface ProductFormModalProps {
  open: boolean;
  initialProduct: Product | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}

interface ProductFormState {
  name: string;
  categoryId: string;
  costPrice: string;
  sellingPrice: string;
  stock: string;
  minStock: string;
  unit: string;
  imageUrl: string | null;
  isActive: boolean;
}

function ProductFormModal({ open, initialProduct, categories, onClose, onSaved }: ProductFormModalProps) {
  const toast = useToast();
  const fileInputId = useId();
  const unitListId = useId();
  const [form, setForm] = useState<ProductFormState>({
    name: "",
    categoryId: "",
    costPrice: "",
    sellingPrice: "",
    stock: "",
    minStock: "",
    unit: "pcs",
    imageUrl: null,
    isActive: true,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: initialProduct?.name || "",
      categoryId: initialProduct?.categoryId || categories[0]?.id || "",
      costPrice: initialProduct ? String(initialProduct.costPrice) : "",
      sellingPrice: initialProduct ? String(initialProduct.sellingPrice) : "",
      stock: initialProduct ? String(initialProduct.stock) : "",
      minStock: initialProduct ? String(initialProduct.minStock) : "5",
      unit: initialProduct?.unit || "pcs",
      imageUrl: initialProduct?.imageUrl || null,
      isActive: initialProduct?.isActive ?? true,
    });
    setImageFile(null);
    setImagePreview(null);
    setFormError("");
    setFieldErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Only reset the form when the modal opens or the edited product changes.
    // Category refetches must not discard in-progress input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialProduct]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const update = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleSelectFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Pilih file gambar JPG, PNG, atau WEBP.");
      return;
    }
    setImageFile(file);
    setFormError("");
  };

  const removeImage = () => {
    setImageFile(null);
    update("imageUrl", null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError("");
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Nama produk wajib diisi.";
    if (!form.categoryId) errors.categoryId = "Pilih kategori produk.";
    if (!form.unit.trim()) errors.unit = "Satuan wajib diisi.";
    if (form.costPrice === "" || Number.isNaN(Number(form.costPrice))) errors.costPrice = "Harga modal wajib diisi.";
    if (form.sellingPrice === "" || Number.isNaN(Number(form.sellingPrice)))
      errors.sellingPrice = "Harga jual wajib diisi.";
    if (form.minStock === "" || Number.isNaN(Number(form.minStock))) errors.minStock = "Minimum stok wajib diisi.";
    if (!initialProduct && (form.stock === "" || Number.isNaN(Number(form.stock))))
      errors.stock = "Jumlah stok awal wajib diisi.";
    if (Number(form.costPrice) < 0) errors.costPrice = "Harga tidak boleh negatif.";
    if (Number(form.sellingPrice) < 0) errors.sellingPrice = "Harga tidak boleh negatif.";
    if (Number(form.minStock) < 0) errors.minStock = "Minimum stok tidak boleh negatif.";
    if (!initialProduct && Number(form.stock) < 0) errors.stock = "Stok tidak boleh negatif.";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) {
        const compressed = await compressImage(imageFile);
        const uploaded = await api.uploads.productImage(compressed);
        imageUrl = uploaded.url;
      }

      const payload: ProductInput = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        costPrice: roundMoneyValue(Number(form.costPrice)),
        sellingPrice: roundMoneyValue(Number(form.sellingPrice)),
        minStock: roundQuantityValue(Number(form.minStock)),
        unit: form.unit.trim(),
        imageUrl,
        isActive: form.isActive,
      };

      if (initialProduct) {
        await api.products.update(initialProduct.id, payload);
        toast.success("Produk berhasil diperbarui.");
      } else {
        await api.products.create({
          ...payload,
          stock: roundQuantityValue(Number(form.stock)),
        });
        toast.success("Produk baru berhasil ditambahkan.");
      }
      await onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        setFieldErrors(error.details);
      }
      setFormError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={initialProduct ? "Edit Produk" : "Produk Baru"}
      subtitle={initialProduct ? "Perbarui informasi produk yang tampil di kasir." : "Tambahkan produk ke katalog toko Anda."}
      size="lg"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" form="product-form" loading={submitting} icon={!submitting ? <Plus size={17} /> : undefined}>
            {initialProduct ? "Simpan Perubahan" : "Tambah Produk"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="form-stack" noValidate>
        <div className="product-form-layout">
          <div className="product-photo-field">
            <span className="field__label">Foto produk</span>
            <div className="product-photo-box">
              {imagePreview || form.imageUrl ? (
                <img src={imagePreview || form.imageUrl || ""} alt="Pratinjau produk" />
              ) : (
                <div className="product-photo-box__empty">
                  <Camera size={24} />
                  <span>Belum ada foto</span>
                </div>
              )}
              {(imagePreview || form.imageUrl) && (
                <button type="button" className="product-photo-box__remove" onClick={removeImage} aria-label="Hapus foto">
                  <X size={15} />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              onChange={(event) => handleSelectFile(event.target.files?.[0])}
            />
            <label htmlFor={fileInputId} className="btn btn--secondary btn--sm product-photo-button">
              <Camera size={15} /> {imagePreview || form.imageUrl ? "Ganti foto" : "Pilih foto"}
            </label>
            <p className="field__message">JPG, PNG, atau WEBP. Otomatis dioptimalkan.</p>
          </div>

          <div className="product-form-fields">
            <Field label="Nama produk" htmlFor="product-name" required error={fieldErrors.name}>
              <input
                id="product-name"
                className="input"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Contoh: Apel Fuji"
                maxLength={150}
                autoFocus
              />
            </Field>

            <div className="form-grid form-grid--2">
              <Field label="Kategori" htmlFor="product-category" required error={fieldErrors.categoryId}>
                <select
                  id="product-category"
                  className="select"
                  value={form.categoryId}
                  onChange={(event) => update("categoryId", event.target.value)}
                >
                  <option value="">Pilih kategori</option>
                  {categories.map((category) => (
                    <option value={category.id} key={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Satuan" htmlFor="product-unit" required error={fieldErrors.unit} hint="kg, pcs, ikat, liter, dll.">
                <input
                  id="product-unit"
                  className="input"
                  list={unitListId}
                  value={form.unit}
                  onChange={(event) => update("unit", event.target.value)}
                  maxLength={30}
                />
                <datalist id={unitListId}>
                  {unitOptions.map((unit) => (
                    <option value={unit} key={unit} />
                  ))}
                </datalist>
              </Field>
            </div>

            <div className="form-grid form-grid--2">
              <Field label="Harga modal" htmlFor="product-cost" required error={fieldErrors.costPrice}>
                <div className="input-prefix">
                  <span>Rp</span>
                  <input
                    id="product-cost"
                    type="number"
                    min="0"
                    step="100"
                    inputMode="decimal"
                    value={form.costPrice}
                    onChange={(event) => update("costPrice", event.target.value)}
                    placeholder="0"
                  />
                </div>
              </Field>

              <Field label="Harga jual" htmlFor="product-selling" required error={fieldErrors.sellingPrice}>
                <div className="input-prefix">
                  <span>Rp</span>
                  <input
                    id="product-selling"
                    type="number"
                    min="0"
                    step="100"
                    inputMode="decimal"
                    value={form.sellingPrice}
                    onChange={(event) => update("sellingPrice", event.target.value)}
                    placeholder="0"
                  />
                </div>
              </Field>
            </div>

            <div className="form-grid form-grid--2">
              <Field
                label={initialProduct ? "Stok saat ini" : "Stok awal"}
                htmlFor="product-stock"
                required={!initialProduct}
                error={fieldErrors.stock}
                hint={
                  initialProduct ? (
                    <>
                      Stok dikunci agar riwayat tetap akurat.{" "}
                      <Link className="field__hint-link" to={`/owner/stock?product=${initialProduct.id}`}>
                        Sesuaikan stok
                      </Link>
                    </>
                  ) : undefined
                }
              >
                <div className="input-suffix">
                  <input
                    id="product-stock"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={form.stock}
                    onChange={(event) => update("stock", event.target.value)}
                    placeholder="0"
                    disabled={Boolean(initialProduct)}
                  />
                  <span>{form.unit || "unit"}</span>
                </div>
              </Field>

              <Field label="Minimum stok" htmlFor="product-min-stock" required error={fieldErrors.minStock} hint="Peringatan muncul saat stok mencapai batas ini.">
                <div className="input-suffix">
                  <input
                    id="product-min-stock"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={form.minStock}
                    onChange={(event) => update("minStock", event.target.value)}
                    placeholder="5"
                  />
                  <span>{form.unit || "unit"}</span>
                </div>
              </Field>
            </div>

            <label className="switch-row">
              <div>
                <strong>Produk aktif</strong>
                <span>Produk aktif langsung tersedia di halaman kasir.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                className={`switch${form.isActive ? " switch--on" : ""}`}
                onClick={() => update("isActive", !form.isActive)}
              >
                <span />
              </button>
            </label>
          </div>
        </div>

        {formError && <div className="auth-alert auth-alert--error">{formError}</div>}
      </form>
    </Modal>
  );
}

interface CategoryManagerModalProps {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onChange: () => Promise<void>;
}

function CategoryManagerModal({ open, categories, onClose, onChange }: CategoryManagerModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setEditingId(null);
      setEditingName("");
    }
  }, [open]);

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.categories.create(name.trim());
      setName("");
      toast.success("Kategori berhasil ditambahkan.");
      await onChange();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (category: Category) => {
    if (!editingName.trim()) return;
    setSaving(true);
    try {
      await api.categories.update(category.id, editingName.trim());
      setEditingId(null);
      toast.success("Kategori berhasil diperbarui.");
      await onChange();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;
    setBusyId(deletingCategory.id);
    try {
      await api.categories.remove(deletingCategory.id);
      toast.success("Kategori berhasil dihapus.");
      setDeletingCategory(null);
      await onChange();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Kelola Kategori"
        subtitle="Kategori membantu owner dan kasir menemukan produk lebih cepat."
        size="md"
        footer={
          <Button variant="secondary" onClick={onClose}>
            Selesai
          </Button>
        }
      >
        <form className="category-add-form" onSubmit={handleAdd}>
          <div className="input-with-icon">
            <Boxes size={17} />
            <input
              type="text"
              placeholder="Nama kategori baru..."
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="Nama kategori baru"
            />
          </div>
          <Button type="submit" icon={<Plus size={16} />} loading={saving && !editingId} disabled={!name.trim()}>
            Tambah
          </Button>
        </form>

        {categories.length === 0 ? (
          <EmptyState
            compact
            icon={<Boxes size={22} />}
            title="Belum ada kategori"
            description="Buat kategori pertama, lalu tambahkan produk ke dalamnya."
          />
        ) : (
          <div className="category-list">
            {categories.map((category) => (
              <div className="category-item" key={category.id}>
                {editingId === category.id ? (
                  <>
                    <input
                      className="input"
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      loading={saving}
                      onClick={() => void handleUpdate(category)}
                      disabled={!editingName.trim()}
                    >
                      Simpan
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Batal
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="category-item__info">
                      <span className="category-item__icon">
                        <Boxes size={16} />
                      </span>
                      <div>
                        <strong>{category.name}</strong>
                        <span>
                          {category.activeProductCount} aktif
                          {category.productCount - category.activeProductCount > 0
                            ? ` · ${category.productCount - category.activeProductCount} arsip`
                            : ""}
                        </span>
                      </div>
                    </div>
                    <div className="category-item__actions">
                      <IconButton
                        label={`Edit kategori ${category.name}`}
                        onClick={() => {
                          setEditingId(category.id);
                          setEditingName(category.name);
                        }}
                      >
                        <Pencil size={15} />
                      </IconButton>
                      <IconButton
                        label={`Hapus kategori ${category.name}`}
                        tone="danger"
                        onClick={() => setDeletingCategory(category)}
                        disabled={category.productCount > 0}
                        title={
                          category.productCount > 0
                            ? "Kategori masih digunakan produk (termasuk arsip) dan tidak dapat dihapus."
                            : "Hapus kategori"
                        }
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingCategory)}
        title="Hapus kategori?"
        description={
          deletingCategory
            ? `Kategori "${deletingCategory.name}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Hapus Kategori"
        loading={busyId === deletingCategory?.id}
        onClose={() => !busyId && setDeletingCategory(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
