import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BadgePercent,
  Banknote,
  ChevronDown,
  CircleAlert,
  CirclePause,
  ClipboardList,
  CopyPlus,
  CreditCard,
  Minus,
  PackageSearch,
  Pencil,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Scale,
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
  HeldCart,
  PaymentMethod,
  Product,
  TransactionDetail,
} from "../types";
import { useDebouncedValue } from "../lib/hooks";
import {
  createClientReference,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatQuantity,
  formatSignedMoney,
  getErrorMessage,
  isFractionalUnit,
  isScaleUnit,
  quantityStep,
  roundMoneyValue,
  roundQuantityValue,
  roundToScaleStepValue,
} from "../lib/utils";
import { useAuth } from "../context/AuthContext";
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
import { CashExpensesModal } from "../components/CashExpenses";

interface CartLine {
  lineId: string;
  productId: string;
  quantity: number;
  negotiatedPrice?: number;
  negotiatedTotal?: number;
}

interface CartView {
  lineId: string;
  productId: string;
  quantity: number;
  product?: Product;
  listUnitPrice: number;
  unitPrice: number;
  listLineTotal: number;
  roundingAmount: number;
  lineTotal: number;
  discountAmount: number;
  negotiated: boolean;
  negotiationMode: "unit" | "total" | null;
}

function createLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cartToCheckoutItems(cart: CartView[]) {
  return cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.negotiationMode === "unit" ? line.unitPrice : undefined,
    negotiatedTotal: line.negotiationMode === "total" ? line.lineTotal : undefined,
  }));
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

export function CashierPage() {
  const toast = useToast();
  const { store } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);
  const [categoryId, setCategoryId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);
  const [expensesOpen, setExpensesOpen] = useState(false);
  const [holdCartOpen, setHoldCartOpen] = useState(false);
  const [heldCartsOpen, setHeldCartsOpen] = useState(false);
  const [resumeTarget, setResumeTarget] = useState<HeldCart | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HeldCart | null>(null);
  const [resumingHoldId, setResumingHoldId] = useState<string | null>(null);
  const [deletingHoldId, setDeletingHoldId] = useState<string | null>(null);
  const [negotiatingLineId, setNegotiatingLineId] = useState<string | null>(null);
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
  const heldCartsQuery = useQuery({
    queryKey: ["held-carts"],
    queryFn: api.heldCarts.list,
    enabled: Boolean(activeSession),
    staleTime: 0,
  });
  const heldCarts = heldCartsQuery.data?.items ?? [];

  useEffect(() => {
    if (sessionQuery.data && !sessionQuery.data.session) {
      setCart([]);
      setPaymentOpen(false);
      setCartOpen(false);
      setExpensesOpen(false);
      setHoldCartOpen(false);
      setHeldCartsOpen(false);
      setResumeTarget(null);
      setDeleteTarget(null);
      setNegotiatingLineId(null);
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
        if (!product) {
          return {
            lineId: line.lineId,
            productId: line.productId,
            quantity: line.quantity,
            listUnitPrice: 0,
            unitPrice: 0,
            listLineTotal: 0,
            roundingAmount: 0,
            lineTotal: 0,
            discountAmount: 0,
            negotiated: false,
            negotiationMode: null,
          };
        }

        const listUnitPrice = roundMoneyValue(product.sellingPrice);
        const listLineTotal = roundMoneyValue(listUnitPrice * line.quantity);
        const hasNegotiatedTotal = line.negotiatedTotal !== undefined;
        const hasNegotiatedPrice = line.negotiatedPrice !== undefined;
        let unitPrice = listUnitPrice;
        let lineTotal = listLineTotal;
        let discountAmount = 0;
        let roundingAmount = 0;
        let negotiationMode: "unit" | "total" | null = null;

        if (hasNegotiatedTotal) {
          lineTotal = roundMoneyValue(
            Math.min(listLineTotal, Math.max(0, line.negotiatedTotal ?? 0)),
          );
          unitPrice = roundMoneyValue(lineTotal / line.quantity);
          discountAmount = roundMoneyValue(listLineTotal - lineTotal);
          negotiationMode = lineTotal < listLineTotal ? "total" : null;
        } else {
          unitPrice = hasNegotiatedPrice
            ? roundMoneyValue(Math.min(listUnitPrice, Math.max(0, line.negotiatedPrice ?? 0)))
            : listUnitPrice;
          const exactLineTotal = roundMoneyValue(unitPrice * line.quantity);
          discountAmount = roundMoneyValue(listLineTotal - exactLineTotal);
          roundingAmount =
            !hasNegotiatedPrice && store.scaleRounding > 0 && isScaleUnit(product.unit)
              ? roundMoneyValue(roundToScaleStepValue(exactLineTotal, store.scaleRounding) - exactLineTotal)
              : 0;
          lineTotal = roundMoneyValue(exactLineTotal + roundingAmount);
          negotiationMode = hasNegotiatedPrice && unitPrice < listUnitPrice ? "unit" : null;
        }

        return {
          lineId: line.lineId,
          productId: line.productId,
          quantity: line.quantity,
          product,
          listUnitPrice,
          unitPrice,
          listLineTotal,
          roundingAmount,
          lineTotal,
          discountAmount,
          negotiated: discountAmount > 0,
          negotiationMode,
        };
      }),
    [cart, productsById, store.scaleRounding],
  );

  const subtotal = roundMoneyValue(cartView.reduce((sum, item) => sum + item.listLineTotal, 0));
  const discountTotal = roundMoneyValue(cartView.reduce((sum, item) => sum + item.discountAmount, 0));
  const roundingTotal = roundMoneyValue(cartView.reduce((sum, item) => sum + item.roundingAmount, 0));
  const total = roundMoneyValue(subtotal - discountTotal + roundingTotal);
  const totalQuantity = roundQuantityValue(cartView.reduce((sum, item) => sum + item.quantity, 0));
  const cartQuantityByProduct = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const line of cartView) {
      quantities.set(
        line.productId,
        roundQuantityValue((quantities.get(line.productId) ?? 0) + line.quantity),
      );
    }
    return quantities;
  }, [cartView]);
  const negotiatingLine =
    cartView.find((line) => line.lineId === negotiatingLineId) ?? null;
  const hasInvalidLine =
    cartView.some((line) => !line.product || !line.product.isActive || line.quantity <= 0) ||
    Array.from(cartQuantityByProduct.entries()).some(([productId, quantity]) => {
      const product = productsById.get(productId);
      return !product || quantity > product.stock;
    });
  const cartLineCount = cartView.length;

  const addToCart = (product: Product) => {
    if (product.stock <= 0 || !product.isActive) return;
    setCart((current) => {
      const step = quantityStep(product.unit);
      const lines = current.filter((line) => line.productId === product.id);
      const aggregate = roundQuantityValue(
        lines.reduce((sum, line) => sum + line.quantity, 0),
      );
      if (aggregate >= product.stock) {
        toast.info(`Stok ${product.name} hanya tersisa ${formatQuantity(product.stock)} ${product.unit}.`);
        return current;
      }

      const target = lines[lines.length - 1];
      if (target) {
        const remainingForTarget = roundQuantityValue(product.stock - (aggregate - target.quantity));
        const nextQuantity = roundQuantityValue(Math.min(target.quantity + step, remainingForTarget));
        if (nextQuantity <= target.quantity) {
          toast.info(`Stok ${product.name} hanya tersisa ${formatQuantity(product.stock)} ${product.unit}.`);
          return current;
        }
        if (target.negotiatedTotal !== undefined) {
          toast.info(`Nego total ${product.name} direset karena jumlah berubah.`);
        }
        return current.map((line) =>
          line.lineId === target.lineId
            ? { ...line, quantity: nextQuantity, negotiatedTotal: undefined }
            : line,
        );
      }

      const initialQuantity = roundQuantityValue(Math.min(step, product.stock));
      return [
        ...current,
        { lineId: createLineId(), productId: product.id, quantity: initialQuantity },
      ];
    });
  };

  const addNewLine = (product: Product) => {
    if (product.stock <= 0 || !product.isActive) return;
    setCart((current) => {
      const step = quantityStep(product.unit);
      const aggregate = roundQuantityValue(
        current
          .filter((line) => line.productId === product.id)
          .reduce((sum, line) => sum + line.quantity, 0),
      );
      const remaining = roundQuantityValue(product.stock - aggregate);
      if (remaining <= 0) {
        toast.info(`Stok ${product.name} sudah seluruhnya masuk keranjang.`);
        return current;
      }
      const initialQuantity = roundQuantityValue(Math.min(step, remaining));
      toast.info(`Baris terpisah untuk ${product.name} ditambahkan.`);
      return [
        ...current,
        { lineId: createLineId(), productId: product.id, quantity: initialQuantity },
      ];
    });
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    setCart((current) => {
      const line = current.find((item) => item.lineId === lineId);
      if (!line) return current;
      const product = productsById.get(line.productId);
      if (!product) return current;

      const sanitized = roundQuantityValue(quantity);
      if (sanitized <= 0) return current;

      const otherQuantity = roundQuantityValue(
        current
          .filter((item) => item.productId === line.productId && item.lineId !== lineId)
          .reduce((sum, item) => sum + item.quantity, 0),
      );
      if (sanitized + otherQuantity > product.stock) {
        toast.info(
          `Total ${product.name} di keranjang melebihi stok ${formatQuantity(product.stock)} ${product.unit}.`,
        );
      }
      if (line.negotiatedTotal !== undefined && sanitized !== line.quantity) {
        toast.info(`Nego total ${product.name} direset karena jumlah berubah.`);
      }

      return current.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              quantity: sanitized,
              negotiatedTotal:
                sanitized === item.quantity ? item.negotiatedTotal : undefined,
            }
          : item,
      );
    });
  };

  const setLineNegotiation = (
    lineId: string,
    negotiation: { mode: "unit" | "total"; value: number } | null,
  ) => {
    setCart((current) =>
      current.map((line) => {
        if (line.lineId !== lineId) return line;
        if (!negotiation) {
          return { ...line, negotiatedPrice: undefined, negotiatedTotal: undefined };
        }
        if (negotiation.mode === "unit") {
          return {
            ...line,
            negotiatedPrice: roundMoneyValue(negotiation.value),
            negotiatedTotal: undefined,
          };
        }
        return {
          ...line,
          negotiatedTotal: roundMoneyValue(negotiation.value),
          negotiatedPrice: undefined,
        };
      }),
    );
  };

  const changeQuantity = (lineId: string, direction: 1 | -1) => {
    const line = cart.find((item) => item.lineId === lineId);
    if (!line) return;
    const product = productsById.get(line.productId);
    if (!product) return;
    const step = quantityStep(product.unit);
    const nextQuantity = roundQuantityValue(line.quantity + step * direction);
    if (nextQuantity <= 0) {
      removeLine(lineId);
      return;
    }
    updateQuantity(lineId, nextQuantity);
  };

  const removeLine = (lineId: string) => {
    setCart((current) => current.filter((line) => line.lineId !== lineId));
  };

  const handleHoldSaved = (message: string) => {
    setCart([]);
    setHoldCartOpen(false);
    setNegotiatingLineId(null);
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ["held-carts"] });
    void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
  };

  const applyHeldCart = (
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice?: number;
      negotiatedTotal?: number;
    }>,
  ) => {
    setCart(
      items.map((item) => ({
        lineId: createLineId(),
        productId: item.productId,
        quantity: item.quantity,
        negotiatedPrice: item.unitPrice ?? undefined,
        negotiatedTotal: item.negotiatedTotal ?? undefined,
      })),
    );
    setPaymentOpen(false);
    setNegotiatingLineId(null);
    setHeldCartsOpen(false);
    setResumeTarget(null);
    setCartOpen(true);
    void queryClient.invalidateQueries({ queryKey: ["held-carts"] });
    void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
  };

  const handleResumeHold = async (hold: HeldCart) => {
    setResumingHoldId(hold.id);
    try {
      const result = await api.heldCarts.resume(hold.id);
      applyHeldCart(result.items);
      toast.success(result.message);
    } catch (error) {
      toast.error(getErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ["held-carts"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
    } finally {
      setResumingHoldId(null);
      setResumeTarget(null);
    }
  };

  const handleDeleteHold = async (hold: HeldCart) => {
    setDeletingHoldId(hold.id);
    try {
      const result = await api.heldCarts.remove(hold.id);
      toast.success(result.message);
      void queryClient.invalidateQueries({ queryKey: ["held-carts"] });
      void queryClient.invalidateQueries({ queryKey: ["cash-session"] });
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeletingHoldId(null);
      setDeleteTarget(null);
    }
  };

  const handlePaymentSuccess = async (transaction: TransactionDetail) => {
    setCart([]);
    setPaymentOpen(false);
    setCartOpen(false);
    setNegotiatingLineId(null);
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
    setExpensesOpen(false);
    setHoldCartOpen(false);
    setHeldCartsOpen(false);
    setResumeTarget(null);
    setDeleteTarget(null);
    setNegotiatingLineId(null);
    setReceipt(null);
    queryClient.setQueryData<CashSessionCurrentResponse>(["cash-session", "current"], {
      session: null,
      lastClosed: closedSession,
    });
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["held-carts"] });
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
        <CashSessionBar
          session={activeSession}
          onExpenses={() => setExpensesOpen(true)}
          onClose={() => setCloseSessionOpen(true)}
        />

        <header className="pos-heading">
          <div>
            <p className="page-header__eyebrow">Kasir</p>
            <h1>Pilih Produk</h1>
            <p>
              {products.length} produk aktif · {visibleStock} tersedia
            </p>
          </div>
          <div className="pos-heading__actions">
            <div className="pos-heading__badge">
              <ShoppingBasket size={18} />
              <span>{cartLineCount} baris di keranjang</span>
            </div>
            <button
              type="button"
              className={`pos-hold-button${heldCarts.length > 0 ? " pos-hold-button--active" : ""}`}
              onClick={() => setHeldCartsOpen(true)}
            >
              <ClipboardList size={17} />
              <span>Keranjang ditahan</span>
              <b>{heldCarts.length}</b>
            </button>
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
              const inCart = cartQuantityByProduct.get(product.id) ?? 0;
              const soldOut = product.stock <= 0;
              return (
                <div className="pos-product-card-wrap" key={product.id}>
                  <button
                    type="button"
                    className={`pos-product-card${soldOut ? " pos-product-card--soldout" : ""}`}
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
                  {inCart > 0 && !soldOut && inCart < product.stock && (
                    <button
                      type="button"
                      className="pos-product-card__new-line"
                      onClick={() => addNewLine(product)}
                      aria-label={`Tambah baris terpisah untuk ${product.name}`}
                      title="Tambah baris dengan jumlah dan nego terpisah"
                    >
                      <CopyPlus size={13} />
                      Baris baru
                    </button>
                  )}
                </div>
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
            <span>{cartLineCount > 0 ? `${cartLineCount} baris dipilih` : "Belum ada produk"}</span>
          </div>
          <div className="pos-cart__header-actions">
            {cart.length > 0 && (
              <button
                type="button"
                className="pos-cart__clear pos-cart__hold-action"
                onClick={() => setHoldCartOpen(true)}
              >
                <CirclePause size={13} />
                Tahan
              </button>
            )}
            {heldCarts.length > 0 && (
              <button
                type="button"
                className="pos-cart__clear pos-cart__hold-action"
                onClick={() => setHeldCartsOpen(true)}
              >
                <ClipboardList size={13} />
                {heldCarts.length} ditahan
              </button>
            )}
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
                  <div className="cart-line cart-line--invalid" key={line.lineId}>
                    <div className="cart-line__invalid-message">
                      Produk ini tidak lagi tersedia.
                    </div>
                    <button
                      type="button"
                      className="cart-line__remove"
                      onClick={() => removeLine(line.lineId)}
                      aria-label="Hapus produk tidak tersedia"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              }

              const product = line.product;
              const aggregateQuantity = cartQuantityByProduct.get(product.id) ?? line.quantity;
              const overStock = aggregateQuantity > product.stock;
              const step = quantityStep(product.unit);
              return (
                <div className={`cart-line${overStock ? " cart-line--overstock" : ""}`} key={line.lineId}>
                  <ProductImage src={product.imageUrl} name={product.name} size="sm" />
                  <div className="cart-line__content">
                    <div className="cart-line__title">
                      <div>
                        <div className="cart-line__name-row">
                          <strong>{product.name}</strong>
                          {cartView.filter((item) => item.productId === product.id).length > 1 && (
                            <span className="cart-line__split-badge">
                              Baris{" "}
                              {cartView
                                .filter((item) => item.productId === product.id)
                                .findIndex((item) => item.lineId === line.lineId) + 1}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`cart-line__price${line.negotiated ? " cart-line__price--negotiated" : ""}`}
                          onClick={() => setNegotiatingLineId(line.lineId)}
                          aria-label={`Atur harga nego ${product.name}`}
                        >
                          {line.negotiationMode === "total" ? (
                            <span>Nego total</span>
                          ) : line.negotiationMode === "unit" ? (
                            <>
                              <s>{formatMoney(line.listUnitPrice)}</s>
                              <strong>{formatMoney(line.unitPrice)}</strong>
                              <span>/ {product.unit}</span>
                            </>
                          ) : (
                            <span>
                              {formatMoney(line.listUnitPrice)} / {product.unit}
                            </span>
                          )}
                          <span className="cart-line__nego">
                            <Pencil size={10} />
                            Nego
                          </span>
                        </button>
                        {line.discountAmount > 0 && (
                          <span className="cart-line__savings">
                            Hemat {formatMoney(line.discountAmount)}
                            {line.negotiationMode === "total" &&
                              ` · setara ${formatMoney(line.unitPrice)}/${product.unit}`}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="cart-line__remove"
                        onClick={() => removeLine(line.lineId)}
                        aria-label={`Hapus ${product.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="cart-line__footer">
                      <div className="quantity-control">
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.lineId, -1)}
                          aria-label={`Kurangi jumlah ${product.name}`}
                        >
                          <Minus size={14} />
                        </button>
                        <CartQuantityInput
                          value={line.quantity}
                          unit={product.unit}
                          onChange={(value) => updateQuantity(line.lineId, value)}
                        />
                        <button
                          type="button"
                          onClick={() => changeQuantity(line.lineId, 1)}
                          disabled={aggregateQuantity >= product.stock}
                          aria-label={`Tambah jumlah ${product.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <span className="cart-line__amount">
                        {line.negotiated && <s>{formatMoney(line.listLineTotal)}</s>}
                        <strong className="cart-line__total">{formatMoney(line.lineTotal)}</strong>
                      </span>
                    </div>

                    {line.roundingAmount !== 0 && (
                      <p className="cart-line__rounding">
                        Pembulatan timbangan <strong>{formatSignedMoney(line.roundingAmount)}</strong>
                      </p>
                    )}

                    {overStock && (
                      <p className="cart-line__warning">
                        Total {product.name} di keranjang melebihi stok tersisa (
                        {formatQuantity(product.stock)} {product.unit}). Kurangi jumlah sebelum membayar.
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
              {formatQuantity(totalQuantity)} unit · {cartLineCount} baris
            </span>
          </div>
          {(discountTotal > 0 || roundingTotal !== 0) && (
            <div className="cart-summary-row">
              <span>Harga normal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          )}
          {discountTotal > 0 && (
            <div className="cart-summary-row cart-summary-row--discount">
              <span>Diskon nego</span>
              <span>−{formatMoney(discountTotal)}</span>
            </div>
          )}
          {roundingTotal !== 0 && (
            <div className="cart-summary-row cart-summary-row--rounding">
              <span>Pembulatan timbangan</span>
              <span>{formatSignedMoney(roundingTotal)}</span>
            </div>
          )}
          <div className="cart-summary-total">
            <span>Total</span>
            <span className="cart-summary-total__value">
              {discountTotal > 0 && <small>Hemat {formatMoney(discountTotal)}</small>}
              <strong>{formatMoney(total)}</strong>
            </span>
          </div>
          {hasInvalidLine && cart.length > 0 && (
            <p className="cart-summary-warning">Periksa kembali jumlah atau ketersediaan produk.</p>
          )}
          <div className="pos-cart__actions">
            <Button
              variant="secondary"
              size="lg"
              icon={<CirclePause size={17} />}
              disabled={cart.length === 0 || hasInvalidLine}
              onClick={() => setHoldCartOpen(true)}
            >
              Tahan
            </Button>
            <Button
              size="lg"
              icon={<Wallet size={18} />}
              disabled={cart.length === 0 || hasInvalidLine}
              onClick={() => setPaymentOpen(true)}
            >
              Bayar Sekarang
            </Button>
          </div>
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
          subtotal={subtotal}
          discountTotal={discountTotal}
          roundingTotal={roundingTotal}
          total={total}
          onClose={() => setPaymentOpen(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {negotiatingLine && (
        <PriceNegotiationModal
          line={negotiatingLine}
          onClose={() => setNegotiatingLineId(null)}
          onApply={(negotiation) => {
            setLineNegotiation(negotiatingLine.lineId, negotiation);
            setNegotiatingLineId(null);
          }}
        />
      )}

      {holdCartOpen && (
        <HoldCartModal
          cart={cartView}
          total={total}
          onClose={() => setHoldCartOpen(false)}
          onSaved={handleHoldSaved}
        />
      )}

      {heldCartsOpen && (
        <HeldCartsModal
          items={heldCarts}
          loading={heldCartsQuery.isLoading}
          currentCartCount={cartLineCount}
          resumingHoldId={resumingHoldId}
          deletingHoldId={deletingHoldId}
          onClose={() => setHeldCartsOpen(false)}
          onRefresh={() => void heldCartsQuery.refetch()}
          onResume={(hold) => setResumeTarget(hold)}
          onDelete={(hold) => setDeleteTarget(hold)}
        />
      )}

      <ConfirmDialog
        open={resumeTarget !== null}
        title="Lanjutkan keranjang ditahan?"
        description={
          resumeTarget
            ? `Keranjang "${resumeTarget.label}" akan dipindahkan ke kasir. ${
                cartLineCount > 0
                  ? "Keranjang yang sedang aktif akan diganti."
                  : "Keranjang akan dimuat ke layar kasir."
              }`
            : ""
        }
        confirmLabel="Lanjutkan"
        tone="primary"
        loading={resumingHoldId !== null}
        onClose={() => setResumeTarget(null)}
        onConfirm={() => {
          if (resumeTarget) void handleResumeHold(resumeTarget);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus keranjang ditahan?"
        description={
          deleteTarget
            ? `Keranjang "${deleteTarget.label}" berisi ${deleteTarget.itemCount} baris akan dihapus permanen.`
            : ""
        }
        confirmLabel="Hapus"
        tone="danger"
        loading={deletingHoldId !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void handleDeleteHold(deleteTarget);
        }}
      />

      {expensesOpen && (
        <CashExpensesModal session={activeSession} onClose={() => setExpensesOpen(false)} />
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
          heldCartCount={heldCarts.length}
          onOpenHeldCarts={() => {
            setCloseSessionOpen(false);
            setHeldCartsOpen(true);
          }}
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
  subtotal: number;
  discountTotal: number;
  roundingTotal: number;
  total: number;
  onClose: () => void;
  onSuccess: (transaction: TransactionDetail) => void;
}

interface NegotiationResult {
  mode: "unit" | "total";
  value: number;
}

interface PriceNegotiationModalProps {
  line: CartView;
  onClose: () => void;
  onApply: (negotiation: NegotiationResult | null) => void;
}

function PriceNegotiationModal({ line, onClose, onApply }: PriceNegotiationModalProps) {
  const product = line.product;
  const initialMode: "unit" | "total" =
    line.negotiationMode ?? (product && isScaleUnit(product.unit) ? "total" : "unit");
  const initialValue =
    initialMode === "total"
      ? line.negotiationMode === "total"
        ? line.lineTotal
        : line.listLineTotal
      : line.negotiationMode === "unit"
        ? line.unitPrice
        : line.listUnitPrice;
  const [mode, setMode] = useState<"unit" | "total">(initialMode);
  const [input, setInput] = useState(String(initialValue));
  const [error, setError] = useState("");

  if (!product) return null;

  const normalPrice = line.listUnitPrice;
  const normalTotal = line.listLineTotal;
  const costPrice = roundMoneyValue(product.costPrice);
  const costTotal = roundMoneyValue(costPrice * line.quantity);
  const baseValue = mode === "unit" ? normalPrice : normalTotal;
  const floorValue = mode === "unit" ? (costPrice > 0 ? costPrice : 0) : costPrice > 0 ? costTotal : 0;
  const numericValue = Number(input);
  const hasInput = input.trim() !== "" && Number.isFinite(numericValue);
  const previewValue = hasInput
    ? roundMoneyValue(Math.min(baseValue, Math.max(0, numericValue)))
    : mode === "unit"
      ? line.listUnitPrice
      : line.listLineTotal;
  const previewUnitPrice =
    mode === "unit" ? previewValue : roundMoneyValue(previewValue / line.quantity);
  const previewLineTotal =
    mode === "unit" ? roundMoneyValue(previewUnitPrice * line.quantity) : previewValue;
  const saving = roundMoneyValue(normalTotal - previewLineTotal);
  const savingPercent =
    normalTotal > 0 ? Math.max(0, Math.round((saving / normalTotal) * 100)) : 0;
  const isDiscounted =
    mode === "unit" ? previewUnitPrice < normalPrice : previewLineTotal < normalTotal;

  const switchMode = (nextMode: "unit" | "total") => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setInput(String(nextMode === "unit" ? previewUnitPrice : previewLineTotal));
    setError("");
  };

  const validate = (): string => {
    if (input.trim() === "" || !Number.isFinite(numericValue)) {
      return mode === "unit" ? "Masukkan harga nego yang valid." : "Masukkan total nego yang valid.";
    }
    if (numericValue < 0) return "Nilai nego tidak boleh negatif.";
    if (mode === "unit") {
      if (numericValue > normalPrice) {
        return `Harga nego tidak boleh melebihi harga normal (${formatMoney(normalPrice)}).`;
      }
      if (costPrice > 0 && numericValue < costPrice) {
        return `Harga nego di bawah harga modal. Harga minimal ${formatMoney(costPrice)}.`;
      }
      return "";
    }
    if (numericValue > normalTotal) {
      return `Total nego tidak boleh melebihi harga normal (${formatMoney(normalTotal)}).`;
    }
    if (costPrice > 0 && numericValue < costTotal) {
      return `Total nego di bawah harga modal. Minimal ${formatMoney(costTotal)}.`;
    }
    return "";
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    onApply(isDiscounted ? { mode, value: roundMoneyValue(numericValue) } : null);
  };

  const quickDiscounts = [5, 10, 15, 20];

  return (
    <Modal
      open
      onClose={onClose}
      title="Nego Harga"
      subtitle={`${product.name} · ${formatQuantity(product.stock)} ${product.unit} tersedia`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form="price-negotiation-form"
            icon={<BadgePercent size={17} />}
          >
            Terapkan Nego
          </Button>
        </>
      }
    >
      <form id="price-negotiation-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="price-negotiation__product">
          <ProductImage src={product.imageUrl} name={product.name} size="sm" />
          <div>
            <strong>{product.name}</strong>
            <span>
              Harga normal <b>{formatMoney(normalPrice)}</b> / {product.unit}
            </span>
            <span>
              Total {formatQuantity(line.quantity)} {product.unit} · <b>{formatMoney(normalTotal)}</b>
            </span>
          </div>
        </div>

        <div className="price-negotiation__modes" role="tablist" aria-label="Cara nego">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "unit"}
            className={`price-negotiation__mode${mode === "unit" ? " price-negotiation__mode--active" : ""}`}
            onClick={() => switchMode("unit")}
          >
            Harga per {product.unit}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "total"}
            className={`price-negotiation__mode${mode === "total" ? " price-negotiation__mode--active" : ""}`}
            onClick={() => switchMode("total")}
          >
            Total item
          </button>
        </div>

        <Field
          label={mode === "unit" ? `Harga nego per ${product.unit}` : "Total nego untuk item ini"}
          htmlFor="negotiated-value"
          hint={
            mode === "unit"
              ? costPrice > 0
                ? `Harga minimal ${formatMoney(costPrice)} (harga modal).`
                : "Harga modal belum diatur. Harga nego maksimal sebesar harga normal."
              : costPrice > 0
                ? `Total minimal ${formatMoney(costTotal)} (harga modal). Cocok untuk barang kurang segar.`
                : "Total nego maksimal sebesar harga normal item."
          }
          required
        >
          <div className="payment-input">
            <span>Rp</span>
            <input
              id="negotiated-value"
              type="number"
              inputMode="decimal"
              min={floorValue}
              max={baseValue}
              step="100"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError("");
              }}
              autoFocus
            />
          </div>
        </Field>

        <div className="price-negotiation__quick" aria-label="Diskon cepat">
          {quickDiscounts.map((percent) => {
            const price = Math.max(floorValue, Math.round(baseValue * (1 - percent / 100)));
            return (
              <button
                key={percent}
                type="button"
                className={`price-negotiation__quick-btn${
                  roundMoneyValue(numericValue) === price ? " price-negotiation__quick-btn--active" : ""
                }`}
                onClick={() => {
                  setInput(String(price));
                  setError("");
                }}
                disabled={price >= baseValue}
              >
                <strong>−{percent}%</strong>
                <span>{formatMoneyCompact(price)}</span>
              </button>
            );
          })}
        </div>

        <div className="price-negotiation__preview">
          <div>
            <span>{mode === "unit" ? "Harga normal" : "Total normal"}</span>
            <strong>
              <s>{formatMoney(baseValue)}</s>
            </strong>
          </div>
          <div>
            <span>{mode === "unit" ? "Harga nego" : "Total nego"}</span>
            <strong>{formatMoney(previewValue)}</strong>
          </div>
          <div className="price-negotiation__preview-saving">
            <span>Hemat</span>
            <strong>
              {formatMoney(saving)} {savingPercent > 0 && <small>({savingPercent}%)</small>}
            </strong>
          </div>
        </div>

        <div className="price-negotiation__line-total">
          <span>
            {mode === "unit"
              ? `${formatQuantity(line.quantity)} ${product.unit} × ${formatMoney(previewUnitPrice)}`
              : `${formatQuantity(line.quantity)} ${product.unit} · setara ${formatMoney(previewUnitPrice)} / ${product.unit}`}
          </span>
          <strong>{formatMoney(previewLineTotal)}</strong>
        </div>

        <p className="price-negotiation__note">
          {mode === "total"
            ? "Total nego dipakai apa adanya dan tidak ikut pembulatan timbangan."
            : isScaleUnit(product.unit)
              ? "Harga nego dihitung presisi dan tidak ikut pembulatan timbangan."
              : "Nego harga satuan berlaku untuk semua jumlah di baris ini."}
        </p>

        {line.negotiated && (
          <button
            type="button"
            className="price-negotiation__reset"
            onClick={() => onApply(null)}
          >
            <RotateCcw size={13} />
            Kembalikan ke harga normal
          </button>
        )}

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}

interface HoldCartModalProps {
  cart: CartView[];
  total: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function HoldCartModal({ cart, total, onClose, onSaved }: HoldCartModalProps) {
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const totalQuantity = roundQuantityValue(cart.reduce((sum, line) => sum + line.quantity, 0));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const trimmedLabel = label.trim();
    if (trimmedLabel.length === 0) {
      setError("Beri nama keranjang agar mudah ditemukan kembali.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.heldCarts.create({
        label: trimmedLabel,
        note: note.trim() || undefined,
        items: cartToCheckoutItems(cart),
      });
      onSaved(result.message);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !submitting && onClose()}
      title="Tahan Keranjang"
      subtitle="Lanjutkan nanti tanpa kehilangan jumlah dan nego"
      size="sm"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            form="hold-cart-form"
            loading={submitting}
            icon={!submitting ? <CirclePause size={17} /> : undefined}
          >
            Tahan Keranjang
          </Button>
        </>
      }
    >
      <form id="hold-cart-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        <div className="hold-cart-summary">
          <span className="hold-cart-summary__icon">
            <ShoppingBasket size={18} />
          </span>
          <div>
            <strong>
              {cart.length} baris · {formatQuantity(totalQuantity)} unit
            </strong>
            <p>Perkiraan total {formatMoney(total)}. Stok baru dipotong saat pembayaran.</p>
          </div>
        </div>

        <Field
          label="Nama keranjang"
          htmlFor="hold-cart-label"
          hint="Contoh: Ibu Rina, pesanan meja 2, atau belanja RT."
          required
        >
          <input
            id="hold-cart-label"
            type="text"
            maxLength={120}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setError("");
            }}
            placeholder="Nama pelanggan atau catatan singkat"
            autoFocus
          />
        </Field>

        <Field
          label="Catatan tambahan"
          htmlFor="hold-cart-note"
          hint={`Opsional, maksimal 300 karakter. ${note.length}/300`}
        >
          <textarea
            id="hold-cart-note"
            rows={3}
            maxLength={300}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Misalnya: diambil sore, minta pisang matang"
          />
        </Field>

        <p className="hold-cart-note">
          Keranjang ditahan terikat pada sesi kas yang sedang terbuka dan tidak dapat ditutup
          sebelum keranjang ini dilanjutkan atau dihapus.
        </p>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}

interface HeldCartsModalProps {
  items: HeldCart[];
  loading: boolean;
  currentCartCount: number;
  resumingHoldId: string | null;
  deletingHoldId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onResume: (hold: HeldCart) => void;
  onDelete: (hold: HeldCart) => void;
}

function HeldCartsModal({
  items,
  loading,
  currentCartCount,
  resumingHoldId,
  deletingHoldId,
  onClose,
  onRefresh,
  onResume,
  onDelete,
}: HeldCartsModalProps) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Keranjang Ditahan"
      subtitle={
        items.length > 0
          ? `${items.length} keranjang menunggu dilanjutkan`
          : "Belum ada keranjang yang ditahan"
      }
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button variant="secondary" onClick={onRefresh} disabled={loading}>
            Muat ulang
          </Button>
        </>
      }
    >
      {loading ? (
        <PageLoader label="Memuat keranjang ditahan..." />
      ) : items.length === 0 ? (
        <div className="held-carts-empty">
          <span>
            <CirclePause size={26} />
          </span>
          <h3>Belum ada keranjang ditahan</h3>
          <p>
            Saat pelanggan ingin melanjutkan nanti, tekan tombol Tahan pada keranjang.
            Keranjang tetap tersimpan selama kas masih terbuka.
          </p>
        </div>
      ) : (
        <div className="held-carts-list">
          {currentCartCount > 0 && (
            <div className="held-carts-warning">
              <CircleAlert size={16} />
              <p>
                Keranjang aktif saat ini ({currentCartCount} baris) akan diganti jika Anda
                melanjutkan salah satu keranjang di bawah.
              </p>
            </div>
          )}
          {items.map((hold) => {
            const hasIssue = hold.items.some(
              (item) => !item.isActive || item.availableStock < item.quantity,
            );
            return (
              <article className="held-cart-card" key={hold.id}>
                <header className="held-cart-card__head">
                  <div>
                    <strong>{hold.label}</strong>
                    <span>
                      {hold.createdBy.name} · {formatDateTime(hold.createdAt)}
                    </span>
                  </div>
                  <div className="held-cart-card__badges">
                    <Badge tone={hasIssue ? "amber" : "green"}>
                      {hasIssue ? "Perlu dicek" : "Siap"}
                    </Badge>
                    <Badge tone="gray">{hold.itemCount} baris</Badge>
                  </div>
                </header>

                <div className="held-cart-card__meta">
                  <span>{formatQuantity(hold.totalQuantity)} unit</span>
                  <strong>± {formatMoney(hold.estimatedTotal)}</strong>
                </div>

                {hold.note && <p className="held-cart-card__note">{hold.note}</p>}

                <ul className="held-cart-card__items">
                  {hold.items.map((item, index) => (
                    <li key={`${hold.id}-${item.productId}-${index}`}>
                      <span>
                        {item.productName}
                        {hold.items.filter((entry) => entry.productId === item.productId).length > 1 && (
                          <small>
                            {" "}· baris{" "}
                            {hold.items
                              .filter((entry) => entry.productId === item.productId)
                              .findIndex((entry) => entry === item) + 1}
                          </small>
                        )}
                      </span>
                      <strong>
                        {formatQuantity(item.quantity)} {item.unit}
                      </strong>
                      <em>{formatMoney(item.lineTotal)}</em>
                      {(!item.isActive || item.availableStock < item.quantity) && (
                        <small className="held-cart-card__issue">
                          {!item.isActive
                            ? "Produk tidak aktif"
                            : `Stok ${formatQuantity(item.availableStock)} ${item.unit}`}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="held-cart-card__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    loading={deletingHoldId === hold.id}
                    disabled={resumingHoldId !== null || deletingHoldId !== null}
                    onClick={() => onDelete(hold)}
                  >
                    Hapus
                  </Button>
                  <Button
                    size="sm"
                    icon={<Play size={14} />}
                    loading={resumingHoldId === hold.id}
                    disabled={resumingHoldId !== null || deletingHoldId !== null}
                    onClick={() => onResume(hold)}
                  >
                    Lanjutkan
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function PaymentModal({
  cart,
  subtotal,
  discountTotal,
  roundingTotal,
  total,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paid, setPaid] = useState("");
  const [notes, setNotes] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const clientReference = useRef(createClientReference());

  const amountPaid = method === "cash" ? Number(paid || 0) : total;
  const changeDue = roundMoneyValue(Math.max(0, amountPaid - total));
  const sufficient = method !== "cash" || amountPaid >= total;
  const totalItems = roundQuantityValue(cart.reduce((sum, line) => sum + line.quantity, 0));
  const negotiatedLines = useMemo(
    () => cart.filter((line) => line.discountAmount > 0 && line.product),
    [cart],
  );

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
        items: cart.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.negotiationMode === "unit" ? line.unitPrice : undefined,
          negotiatedTotal: line.negotiationMode === "total" ? line.lineTotal : undefined,
        })),
        paymentMethod: method,
        amountPaid: method === "cash" ? roundMoneyValue(amountPaid) : total,
        notes: notes.trim() || undefined,
        discountReason: discountTotal > 0 ? discountReason.trim() || undefined : undefined,
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
      subtitle={`${formatQuantity(totalItems)} unit · ${cart.length} baris`}
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
          <span>{discountTotal > 0 ? "Total setelah nego" : "Total tagihan"}</span>
          <strong>{formatMoney(total)}</strong>
          {discountTotal > 0 ? (
            <p>
              Harga normal <s>{formatMoney(subtotal)}</s> · Hemat {formatMoney(discountTotal)}
              {roundingTotal !== 0 && <> · Bulat {formatSignedMoney(roundingTotal)}</>}
            </p>
          ) : roundingTotal !== 0 ? (
            <p>
              Harga normal {formatMoney(subtotal)} · Pembulatan {formatSignedMoney(roundingTotal)}
            </p>
          ) : (
            <p>{formatQuantity(totalItems)} unit dari {cart.length} baris</p>
          )}
        </div>

        {roundingTotal !== 0 && (
          <div className="payment-rounding-card">
            <span className="payment-rounding-card__icon">
              <Scale size={17} />
            </span>
            <div>
              <strong>Pembulatan timbangan</strong>
              <p>Total disesuaikan agar sama dengan layar timbangan buah.</p>
            </div>
            <span className="payment-rounding-card__amount">
              {formatSignedMoney(roundingTotal)}
            </span>
          </div>
        )}

        {negotiatedLines.length > 0 && (
          <div className="payment-negotiation-card">
            <div className="payment-negotiation-card__head">
              <BadgePercent size={16} />
              <strong>Rincian harga nego</strong>
              <span>{negotiatedLines.length} baris</span>
            </div>
            <div className="payment-negotiation-list">
              {negotiatedLines.map((line) => (
                <div className="payment-negotiation-item" key={line.lineId}>
                  <div>
                    <strong>{line.product?.name}</strong>
                    <span>
                      {formatQuantity(line.quantity)} {line.product?.unit}
                    </span>
                  </div>
                  <div className="payment-negotiation-item__price">
                    {line.negotiationMode === "total" ? (
                      <>
                        <s>{formatMoney(line.listLineTotal)}</s>
                        <strong>{formatMoney(line.lineTotal)}</strong>
                        <span>total item</span>
                      </>
                    ) : (
                      <>
                        <s>{formatMoney(line.listUnitPrice)}</s>
                        <strong>{formatMoney(line.unitPrice)}</strong>
                        <span>/ {line.product?.unit}</span>
                      </>
                    )}
                  </div>
                  <span className="payment-negotiation-item__saving">
                    −{formatMoney(line.discountAmount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="payment-negotiation-card__total">
              <span>Total diskon nego</span>
              <strong>−{formatMoney(discountTotal)}</strong>
            </div>
          </div>
        )}

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

        {discountTotal > 0 && (
          <Field
            label="Catatan nego / diskon"
            htmlFor="payment-discount-reason"
            hint="Opsional, misalnya nama pelanggan atau alasan harga turun."
          >
            <input
              id="payment-discount-reason"
              className="input"
              type="text"
              value={discountReason}
              onChange={(event) => setDiscountReason(event.target.value)}
              placeholder="Contoh: langganan, beli banyak, buah sedikit lecet..."
              maxLength={300}
            />
          </Field>
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
