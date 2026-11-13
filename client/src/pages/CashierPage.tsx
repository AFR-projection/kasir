import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  ChevronDown,
  CreditCard,
  Minus,
  PackageSearch,
  Plus,
  QrCode,
  SearchX,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import type {
  CashSession,
  CashSessionCurrentResponse,
  PaymentMethod,
  Product,
  TransactionDetail,
} from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
  getErrorMessage,
  isFractionalUnit,
  quantityStep,
  roundMoneyValue,
  roundQuantityValue,
} from "../lib/utils";
import { useToast } from "../context/ToastContext";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageError,
  PageLoader,
  SearchField,
} from "../components/ui";
import { ProductImage } from "../components/ProductImage";
import { ReceiptModal } from "../components/Receipt";
import { CashSessionBar, CloseCashSessionModal, OpenCashSessionGate } from "../components/CashSession";

interface CartLine {
  productId: string;
  quantity: number;
}

interface CartView {
  productId: string;
  quantity: number;
  product?: Product;
  lineTotal: number;
}

const paymentOptions: Array<{
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: "cash", label: "Tunai", icon: <Banknote size={18} /> },
  { id: "qris", label: "QRIS", icon: <QrCode size={18} /> },
  { id: "debit", label: "Debit", icon: <CreditCard size={18} /> },
  { id: "transfer", label: "Transfer", icon: <ArrowLeftRight size={18} /> },
];

function createClientReference(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function CashierPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [receipt, setReceipt] = useState<TransactionDetail | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["cash-session", "current"],
    queryFn: api.cashSessions.current,
    staleTime: 0,
  });
  const activeSession = sessionQuery.data?.session ?? null;

  const productsQuery = useQuery({
    queryKey: ["products", { pos: true }],
    queryFn: () => api.products.list({ status: "active", page: 1, limit: 500 }),
    enabled: Boolean(activeSession),
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: api.categories.list,
    enabled: Boolean(activeSession),
  });

  useEffect(() => {
    if (sessionQuery.data && !sessionQuery.data.session) {
      setCart([]);
      setPaymentOpen(false);
      setCartOpen(false);
    }
  }, [sessionQuery.data]);

  const products = productsQuery.data?.items || [];
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredProducts = useMemo(() => {
    const keyword = debouncedSearch.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !keyword || product.name.toLowerCase().includes(keyword);
      const matchesCategory = !categoryId || product.categoryId === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearch, categoryId]);

  const cartView: CartView[] = useMemo(
    () =>
      cart.map((line) => {
        const product = productsById.get(line.productId);
        return {
          productId: line.productId,
          quantity: line.quantity,
          product,
          lineTotal: product ? roundMoneyValue(product.sellingPrice * line.quantity) : 0,
        };
      }),
    [cart, productsById],
  );

  const total = roundMoneyValue(cartView.reduce((sum, item) => sum + item.lineTotal, 0));
  const totalQuantity = roundQuantityValue(cartView.reduce((sum, item) => sum + item.quantity, 0));
  const hasInvalidLine = cartView.some(
    (line) => !line.product || !line.product.isActive || line.quantity <= 0 || line.quantity > line.product.stock,
  );
  const cartLineCount = cartView.length;

  const addToCart = (product: Product) => {
    if (product.stock <= 0 || !product.isActive) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        const nextQuantity = roundQuantityValue(existing.quantity + 1);
        if (nextQuantity > product.stock) {
          toast.info(`Stok ${product.name} hanya tersisa ${formatQuantity(product.stock)} ${product.unit}.`);
          return current;
        }
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: nextQuantity } : line,
        );
      }
      return [...current, { productId: product.id, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    const product = productsById.get(productId);
    if (!product) return;
    const sanitized = roundQuantityValue(quantity);
    if (sanitized <= 0) return;
    if (sanitized > product.stock) {
      toast.info(`Stok ${product.name} hanya tersisa ${formatQuantity(product.stock)} ${product.unit}.`);
    }
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity: sanitized } : line)),
    );
  };

  const changeQuantity = (productId: string, direction: 1 | -1) => {
    const line = cart.find((item) => item.productId === productId);
    const product = productsById.get(productId);
    if (!line || !product) return;
    const step = quantityStep(product.unit);
    const nextQuantity = roundQuantityValue(line.quantity + step * direction);
    if (nextQuantity <= 0) {
      removeLine(productId);
      return;
    }
    updateQuantity(productId, nextQuantity);
  };

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.productId !== productId));
  };

  const handlePaymentSuccess = async (transaction: TransactionDetail) => {
    setCart([]);
    setPaymentOpen(false);
    setCartOpen(false);
    setReceipt(transaction);
    toast.success(`Pembayaran ${transaction.invoiceNumber} berhasil.`);
    void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
  };

  const handleSessionOpened = (session: CashSession) => {
    queryClient.setQueryData<CashSessionCurrentResponse>(["cash-session", "current"], {
      session,
      lastClosed: sessionQuery.data?.lastClosed ?? null,
    });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  };

  const handleSessionClosed = (closedSession: CashSession) => {
    setCloseSessionOpen(false);
    setCart([]);
    setPaymentOpen(false);
    setCartOpen(false);
    setReceipt(null);
    queryClient.setQueryData<CashSessionCurrentResponse>(["cash-session", "current"], {
      session: null,
      lastClosed: closedSession,
    });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const relevantCategories = categoriesQuery.data?.categories || [];
  const visibleStock = products.reduce((count, product) => count + (product.stock > 0 ? 1 : 0), 0);

  if (sessionQuery.isLoading) {
    return (
      <div className="cashier-loading">
        <PageLoader label="Memeriksa status kas..." />
      </div>
    );
  }

  if (sessionQuery.isError) {
    return (
      <div className="cashier-loading">
        <PageError
          message={getErrorMessage(sessionQuery.error)}
          onRetry={() => void sessionQuery.refetch()}
        />
      </div>
    );
  }

  if (!activeSession) {
    return (
      <OpenCashSessionGate
        lastClosed={sessionQuery.data?.lastClosed ?? null}
        onOpened={handleSessionOpened}
      />
    );
  }

  if (productsQuery.isLoading) {
    return (
      <div className="cashier-loading">
        <PageLoader label="Menyiapkan katalog dan stok terbaru..." />
      </div>
    );
  }

  if (productsQuery.isError) {
    return (
      <div className="cashier-loading">
        <PageError
          message={getErrorMessage(productsQuery.error)}
          onRetry={() => void productsQuery.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="pos-page">
      <div className="pos-catalog">
        <CashSessionBar session={activeSession} onClose={() => setCloseSessionOpen(true)} />

        <header className="pos-heading">
          <div>
            <p className="page-header__eyebrow">Kasir</p>
            <h1>Pilih Produk</h1>
            <p>
              {products.length} produk aktif · {visibleStock} tersedia
            </p>
          </div>
          <div className="pos-heading__badge">
            <ShoppingBasket size={18} />
            <span>{cartLineCount} produk di keranjang</span>
          </div>
        </header>

        <div className="pos-tools">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Cari produk berdasarkan nama..."
            ariaLabel="Cari produk di kasir"
            className="pos-search"
          />
          <div className="category-chips" role="group" aria-label="Filter kategori">
            <button
              type="button"
              className={`category-chip${categoryId === "" ? " category-chip--active" : ""}`}
              onClick={() => setCategoryId("")}
            >
              Semua
            </button>
            {relevantCategories.map((category) => (
              <button
                type="button"
                key={category.id}
                className={`category-chip${categoryId === category.id ? " category-chip--active" : ""}`}
                onClick={() => setCategoryId(category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <EmptyState
            icon={search || categoryId ? <SearchX size={25} /> : <PackageSearch size={25} />}
            title={search || categoryId ? "Produk tidak ditemukan" : "Belum ada produk aktif"}
            description={
              search || categoryId
                ? "Coba kata kunci lain atau pilih kategori yang berbeda."
                : "Hubungi pemilik toko untuk menambahkan produk yang dapat dijual."
            }
            action={
              search || categoryId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                  }}
                >
                  Tampilkan semua
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="pos-product-grid">
            {filteredProducts.map((product) => {
              const inCart = cart.find((line) => line.productId === product.id)?.quantity || 0;
              const soldOut = product.stock <= 0;
              return (
                <button
                  type="button"
                  className={`pos-product-card${soldOut ? " pos-product-card--soldout" : ""}`}
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={soldOut}
                  aria-label={`Tambah ${product.name} ke keranjang`}
                >
                  <div className="pos-product-card__image-wrap">
                    <ProductImage src={product.imageUrl} name={product.name} size="lg" />
                    {soldOut ? (
                      <span className="pos-product-card__stock pos-product-card__stock--out">Habis</span>
                    ) : product.lowStock ? (
                      <span className="pos-product-card__stock pos-product-card__stock--low">
                        Sisa {formatQuantity(product.stock)} {product.unit}
                      </span>
                    ) : (
                      <span className="pos-product-card__stock">
                        {formatQuantity(product.stock)} {product.unit}
                      </span>
                    )}
                    {inCart > 0 && (
                      <span className="pos-product-card__in-cart">{formatQuantity(inCart)} di keranjang</span>
                    )}
                  </div>
                  <div className="pos-product-card__body">
                    <span className="pos-product-card__category">{product.categoryName}</span>
                    <strong>{product.name}</strong>
                    <div className="pos-product-card__price">
                      <span>
                        {formatMoney(product.sellingPrice)}
                        <small> / {product.unit}</small>
                      </span>
                      {!soldOut && (
                        <span className="pos-product-card__add">
                          <Plus size={16} />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cartOpen && (
        <button
          type="button"
          className="cart-backdrop"
          aria-label="Tutup keranjang"
          onClick={() => setCartOpen(false)}
        />
      )}

      <aside className={`pos-cart${cartOpen ? " pos-cart--open" : ""}`}>
        <div className="pos-cart__header">
          <div>
            <h2>Keranjang</h2>
            <span>{cartLineCount > 0 ? `${cartLineCount} produk dipilih` : "Belum ada produk"}</span>
          </div>
          <div className="pos-cart__header-actions">
            {cart.length > 0 && (
              <button type="button" className="pos-cart__clear" onClick={() => setClearConfirmOpen(true)}>
                Kosongkan
              </button>
            )}
            <button
              type="button"
              className="pos-cart__close"
              onClick={() => setCartOpen(false)}
              aria-label="Tutup keranjang"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="pos-cart__empty">
            <div className="pos-cart__empty-icon">
              <ShoppingBasket size={28} />
            </div>
            <h3>Keranjang masih kosong</h3>
            <p>Pilih produk di katalog untuk memulai transaksi baru.</p>
          </div>
        ) : (
          <div className="pos-cart__lines">
            {cartView.map((line) => {
              if (!line.product) {
                return (
                  <div className="cart-line cart-line--invalid" key={line.productId}>
                    <div className="cart-line__invalid-message">
                      Produk ini tidak lagi tersedia.
                    </div>
                    <button
                      type="button"
                      className="cart-line__remove"
                      onClick={() => removeLine(line.productId)}
                      aria-label="Hapus produk tidak tersedia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              }

              const product = line.product;
              const overStock = line.quantity > product.stock;
              const step = quantityStep(product.unit);
              return (
                <div className={`cart-line${overStock ? " cart-line--overstock" : ""}`} key={line.productId}>
                  <ProductImage src={product.imageUrl} name={product.name} size="sm" />
                  <div className="cart-line__content">
                    <div className="cart-line__title">
                      <div>
                        <strong>{product.name}</strong>
                        <span>
                          {formatMoney(product.sellingPrice)} / {product.unit}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="cart-line__remove"
                        onClick={() => removeLine(product.id)}
                        aria-label={`Hapus ${product.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="cart-line__footer">
                      <div className="quantity-control">
                        <button
                          type="button"
                          onClick={() => changeQuantity(product.id, -1)}
                          aria-label={`Kurangi jumlah ${product.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <CartQuantityInput
                          value={line.quantity}
                          unit={product.unit}
                          onChange={(value) => updateQuantity(product.id, value)}
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(product.id, 1)}
                          disabled={line.quantity >= product.stock}
                          aria-label={`Tambah jumlah ${product.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong className="cart-line__total">{formatMoney(line.lineTotal)}</strong>
                    </div>

                    {overStock && (
                      <p className="cart-line__warning">
                        Melebihi stok tersisa ({formatQuantity(product.stock)} {product.unit}). Kurangi jumlah
                        sebelum membayar.
                      </p>
                    )}
                    {!overStock && isFractionalUnit(product.unit) && line.quantity < step && (
                      <p className="cart-line__warning">
                        Jumlah minimum untuk satuan {product.unit} adalah {step}.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="pos-cart__summary">
          <div className="cart-summary-row">
            <span>Jumlah item</span>
            <span>
              {formatQuantity(totalQuantity)} unit · {cartLineCount} produk
            </span>
          </div>
          <div className="cart-summary-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          {hasInvalidLine && cart.length > 0 && (
            <p className="cart-summary-warning">Periksa kembali jumlah atau ketersediaan produk.</p>
          )}
          <Button
            size="lg"
            block
            icon={<Wallet size={18} />}
            disabled={cart.length === 0 || hasInvalidLine}
            onClick={() => setPaymentOpen(true)}
          >
            Bayar Sekarang
          </Button>
          <p className="pos-cart__hint">Harga dan stok divalidasi ulang oleh server saat pembayaran.</p>
        </div>
      </aside>

      {cart.length > 0 && (
        <button type="button" className="mobile-cart-bar" onClick={() => setCartOpen(true)}>
          <span className="mobile-cart-bar__icon">
            <ShoppingCart size={19} />
            <span className="mobile-cart-bar__count">{cartLineCount}</span>
          </span>
          <span className="mobile-cart-bar__label">
            <strong>Lihat Keranjang</strong>
            <small>{formatMoney(total)}</small>
          </span>
          <ChevronDown size={18} className="mobile-cart-bar__chevron" />
        </button>
      )}

      {paymentOpen && (
        <PaymentModal
          cart={cartView}
          total={total}
          onClose={() => setPaymentOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <ReceiptModal transaction={receipt} onClose={() => setReceipt(null)} />

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Kosongkan keranjang?"
        description="Semua produk dalam keranjang akan dihapus. Transaksi belum dibuat."
        confirmLabel="Kosongkan"
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setCart([]);
          setClearConfirmOpen(false);
        }}
      />

      {closeSessionOpen && (
        <CloseCashSessionModal
          session={activeSession}
          cartItemCount={cartLineCount}
          onClose={() => setCloseSessionOpen(false)}
          onClosed={handleSessionClosed}
        />
      )}
    </div>
  );
}

function CartQuantityInput({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const [inputValue, setInputValue] = useState(String(value));

  useEffect(() => {
    if (Number(inputValue) !== value) {
      setInputValue(String(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      step={isFractionalUnit(unit) ? "0.001" : "1"}
      min="0"
      value={inputValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        setInputValue(nextValue);
        const numeric = Number(nextValue);
        if (nextValue !== "" && Number.isFinite(numeric) && numeric > 0) {
          onChange(numeric);
        }
      }}
      onBlur={() => setInputValue(String(value))}
      aria-label="Jumlah produk"
    />
  );
}

interface PaymentModalProps {
  cart: CartView[];
  total: number;
  onClose: () => void;
  onSuccess: (transaction: TransactionDetail) => void;
}

function PaymentModal({ cart, total, onClose, onSuccess }: PaymentModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const clientReference = useRef(createClientReference());

  const amountPaid = method === "cash" ? Number(paid || 0) : total;
  const changeDue = roundMoneyValue(Math.max(0, amountPaid - total));
  const sufficient = method !== "cash" || amountPaid >= total;
  const totalItems = roundQuantityValue(cart.reduce((sum, line) => sum + line.quantity, 0));

  const suggestions = useMemo(() => {
    const values = new Set<number>();
    if (total >= 0) values.add(total);
    for (const denomination of [5000, 10000, 20000, 50000, 100000]) {
      const rounded = Math.ceil((total + 1) / denomination) * denomination;
      if (rounded > total) values.add(rounded);
    }
    return Array.from(values).slice(0, 5);
  }, [total]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!sufficient) {
      setError("Uang yang dibayarkan belum mencukupi total transaksi.");
      return;
    }
    if (method === "cash" && paid === "") {
      setError("Masukkan jumlah uang yang diterima.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.transactions.checkout({
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod: method,
        amountPaid: method === "cash" ? roundMoneyValue(amountPaid) : total,
        notes: notes.trim() || undefined,
        clientReference: clientReference.current,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-movements"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["cash-session"] }),
      ]);
      if (result.alreadyProcessed) {
        toast.info("Transaksi sebelumnya sudah tersimpan. Struk ditampilkan ulang.");
      }
      onSuccess(result.transaction);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["cash-session"] }),
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      title="Pembayaran"
      subtitle={`${formatQuantity(totalItems)} unit · ${cart.length} produk`}
      size="md"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            form="payment-form"
            loading={submitting}
            disabled={!sufficient}
            icon={!submitting ? <Wallet size={17} /> : undefined}
          >
            Selesaikan Pembayaran
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={handleSubmit} className="form-stack" noValidate>
        <div className="payment-total-card">
          <span>Total tagihan</span>
          <strong>{formatMoney(total)}</strong>
          <p>{formatQuantity(totalItems)} unit dari {cart.length} produk</p>
        </div>

        <div>
          <span className="field__label">Metode pembayaran</span>
          <div className="payment-methods">
            {paymentOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`payment-method${method === option.id ? " payment-method--active" : ""}`}
                onClick={() => {
                  setMethod(option.id);
                  setError("");
                }}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {method === "cash" ? (
          <>
            <Field label="Uang diterima" htmlFor="payment-paid" required>
              <div className="payment-input">
                <span>Rp</span>
                <input
                  id="payment-paid"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  value={paid}
                  onChange={(event) => {
                    setPaid(event.target.value);
                    setError("");
                  }}
                  placeholder="0"
                  autoFocus
                />
              </div>
            </Field>

            <div className="payment-suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  className={`payment-suggestion${Number(paid) === suggestion ? " payment-suggestion--active" : ""}`}
                  onClick={() => {
                    setPaid(String(suggestion));
                    setError("");
                  }}
                >
                  {index === 0 ? "Uang pas" : formatMoneyCompact(suggestion)}
                </button>
              ))}
            </div>

            <div className={`change-card${sufficient && Number(paid) > 0 ? " change-card--active" : ""}`}>
              <div>
                <span>Kembalian</span>
                <strong>{formatMoney(changeDue)}</strong>
              </div>
              {Number(paid) > 0 && Number(paid) < total && (
                <p>Kurang {formatMoney(total - Number(paid))}</p>
              )}
            </div>
          </>
        ) : (
          <div className="noncash-note">
            <span>{paymentOptions.find((option) => option.id === method)?.icon}</span>
            <div>
              <strong>Pembayaran {paymentOptions.find((option) => option.id === method)?.label}</strong>
              <p>Nominal pembayaran tercatat sebesar {formatMoney(total)}.</p>
            </div>
          </div>
        )}

        <Field label="Catatan transaksi" htmlFor="payment-notes" hint="Opsional, misalnya nama pelanggan atau catatan pesanan.">
          <textarea
            id="payment-notes"
            className="textarea"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Tambahkan catatan..."
            maxLength={500}
          />
        </Field>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}
