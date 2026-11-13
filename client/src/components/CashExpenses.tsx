import { FormEvent, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Calculator,
  CircleAlert,
  Package,
  Plus,
  ReceiptText,
  ShoppingBag,
  Trash2,
  Truck,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { CashExpense, CashSession, ExpenseCategory } from "../types";
import {
  createClientReference,
  formatDateTime,
  formatExpenseCategory,
  formatMoney,
  getErrorMessage,
  roundMoneyValue,
} from "../lib/utils";
import { Badge, Button, ConfirmDialog, EmptyState, Field, Modal, PageError, PageLoader } from "./ui";

const expenseCategories: Array<{
  id: ExpenseCategory;
  label: string;
  hint: string;
  icon: React.ReactNode;
}> = [
  {
    id: "supplies",
    label: "Perlengkapan",
    hint: "Plastik, kertas, kantong",
    icon: <ShoppingBag size={16} />,
  },
  {
    id: "equipment",
    label: "Peralatan",
    hint: "Alat & kebutuhan toko",
    icon: <Wrench size={16} />,
  },
  {
    id: "transport",
    label: "Transport",
    hint: "Ongkos angkut / kirim",
    icon: <Truck size={16} />,
  },
  {
    id: "other",
    label: "Lainnya",
    hint: "Keperluan lain",
    icon: <Wallet size={16} />,
  },
];

const quickAmounts = [10_000, 20_000, 50_000, 100_000];

function categoryTone(category: ExpenseCategory): "blue" | "purple" | "amber" | "gray" {
  switch (category) {
    case "supplies":
      return "blue";
    case "equipment":
      return "purple";
    case "transport":
      return "amber";
    default:
      return "gray";
  }
}

export function CashExpensesModal({
  session,
  onClose,
}: {
  session: CashSession;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("supplies");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CashExpense | null>(null);
  const clientReference = useRef(createClientReference());

  const expensesQuery = useQuery({
    queryKey: ["expenses", { sessionId: session.id }],
    queryFn: () => api.expenses.list({ sessionId: session.id, page: 1, limit: 100 }),
  });

  const items = expensesQuery.data?.items ?? [];
  const totalExpenses = expensesQuery.data?.summary.totalAmount ?? session.totalExpenses;
  const expectedCash = roundMoneyValue(session.openingCash + session.cashSales - totalExpenses);
  const amountValue = Number(amount);
  const canSubmit =
    amount.trim() !== "" &&
    Number.isFinite(amountValue) &&
    amountValue > 0 &&
    description.trim().length >= 3;

  const refreshCashData = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["cash-session"] });
  };

  const createMutation = useMutation({
    mutationFn: api.expenses.create,
    onSuccess: (result) => {
      toast.success(result.message);
      setAmount("");
      setDescription("");
      setCategory("supplies");
      setError("");
      clientReference.current = createClientReference();
      refreshCashData();
    },
    onError: (submitError) => {
      setError(getErrorMessage(submitError));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.expenses.remove(id),
    onSuccess: (result) => {
      toast.success(result.message);
      setDeleteTarget(null);
      refreshCashData();
    },
    onError: (deleteError) => {
      toast.error(getErrorMessage(deleteError));
      setDeleteTarget(null);
    },
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (amount.trim() === "" || !Number.isFinite(amountValue) || amountValue <= 0) {
      setError("Masukkan nominal pengeluaran yang valid.");
      return;
    }
    if (description.trim().length < 3) {
      setError("Keterangan pengeluaran minimal 3 karakter.");
      return;
    }

    createMutation.mutate({
      amount: roundMoneyValue(amountValue),
      category,
      description: description.trim(),
      clientReference: clientReference.current,
    });
  };

  const summaryCards = useMemo(
    () => [
      {
        label: "Total pengeluaran",
        value: formatMoney(totalExpenses),
        className: "expense-summary__card expense-summary__card--expense",
        icon: <ReceiptText size={17} />,
      },
      {
        label: "Penjualan tunai",
        value: formatMoney(session.cashSales),
        className: "expense-summary__card",
        icon: <Banknote size={17} />,
      },
      {
        label: "Estimasi laci",
        value: formatMoney(expectedCash),
        className: "expense-summary__card expense-summary__card--expected",
        icon: <Calculator size={17} />,
      },
    ],
    [totalExpenses, session.cashSales, expectedCash],
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Pengeluaran Kas"
      subtitle="Catat pembelian perlengkapan atau keperluan toko agar uang laci tetap klop."
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Tutup
        </Button>
      }
    >
      <div className="expense-summary">
        {summaryCards.map((card) => (
          <div className={card.className} key={card.label}>
            <span className="expense-summary__icon">{card.icon}</span>
            <div>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="expense-formula">
        <Calculator size={15} />
        <p>
          Uang laci seharusnya = kas awal {formatMoney(session.openingCash)} + penjualan tunai{" "}
          {formatMoney(session.cashSales)} − pengeluaran {formatMoney(totalExpenses)} =
          <strong> {formatMoney(expectedCash)}</strong>
        </p>
      </div>

      <form className="expense-form" onSubmit={handleSubmit} noValidate>
        <div className="expense-form__head">
          <span className="expense-form__icon">
            <Plus size={17} />
          </span>
          <div>
            <strong>Catat pengeluaran baru</strong>
            <p>Uang tunai yang keluar dari laci untuk keperluan toko.</p>
          </div>
        </div>

        <div className="expense-form__grid">
          <Field
            label="Nominal"
            htmlFor="expense-amount"
            hint="Contoh: beli plastik 25.000"
            required
          >
            <div className="payment-input">
              <span>Rp</span>
              <input
                id="expense-amount"
                type="number"
                inputMode="decimal"
                min="1"
                step="100"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError("");
                }}
                placeholder="0"
              />
            </div>
          </Field>

          <Field label="Kategori" htmlFor="expense-category" required>
            <select
              id="expense-category"
              className="select"
              value={category}
              onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
            >
              {expenseCategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="expense-quick-amounts">
          {quickAmounts.map((value) => (
            <button
              key={value}
              type="button"
              className={`expense-quick-amount${
                Number(amount) === value ? " expense-quick-amount--active" : ""
              }`}
              onClick={() => {
                setAmount(String(value));
                setError("");
              }}
            >
              {formatMoney(value)}
            </button>
          ))}
        </div>

        <Field
          label="Keterangan"
          htmlFor="expense-description"
          hint="Tuliskan detail pembelian agar mudah diperiksa pemilik."
          required
        >
          <input
            id="expense-description"
            className="input"
            type="text"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError("");
            }}
            placeholder="Contoh: beli plastik kemasan 1 pack"
            maxLength={300}
          />
        </Field>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        <Button
          type="submit"
          block
          loading={createMutation.isPending}
          disabled={!canSubmit}
          icon={!createMutation.isPending ? <Plus size={17} /> : undefined}
        >
          Simpan Pengeluaran
        </Button>
      </form>

      <div className="expense-list">
        <div className="expense-list__head">
          <div>
            <strong>Pengeluaran sesi ini</strong>
            <span>
              {items.length > 0 ? `${items.length} catatan` : "Belum ada pengeluaran"}
            </span>
          </div>
          <Badge tone={totalExpenses > 0 ? "amber" : "gray"}>
            Total {formatMoney(totalExpenses)}
          </Badge>
        </div>

        {expensesQuery.isLoading ? (
          <PageLoader label="Memuat pengeluaran..." />
        ) : expensesQuery.isError ? (
          <PageError
            message={getErrorMessage(expensesQuery.error)}
            onRetry={() => expensesQuery.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            compact
            icon={<Package size={22} />}
            title="Belum ada pengeluaran"
            description="Setiap pembelian dari uang laci yang dicatat di sini akan mengurangi estimasi uang laci saat tutup kas."
          />
        ) : (
          <ul className="expense-items">
            {items.map((expense) => {
              const canDelete = expense.createdBy.id === user?.id;
              return (
                <li className="expense-item" key={expense.id}>
                  <span className="expense-item__icon">
                    {expenseCategories.find((item) => item.id === expense.category)?.icon || (
                      <Wallet size={16} />
                    )}
                  </span>
                  <div className="expense-item__body">
                    <div className="expense-item__title">
                      <strong>{expense.description}</strong>
                      <Badge tone={categoryTone(expense.category)}>
                        {formatExpenseCategory(expense.category)}
                      </Badge>
                    </div>
                    <span className="expense-item__meta">
                      {formatDateTime(expense.createdAt)} · {expense.createdBy.name}
                    </span>
                  </div>
                  <div className="expense-item__amount">
                    <strong>−{formatMoney(expense.amount)}</strong>
                    {canDelete ? (
                      <button
                        type="button"
                        className="expense-item__delete"
                        onClick={() => setDeleteTarget(expense)}
                        aria-label={`Hapus pengeluaran ${expense.description}`}
                        title="Hapus pengeluaran"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <span className="expense-item__locked" title="Hanya pembuat catatan yang dapat menghapus">
                        <CircleAlert size={12} />
                        Oleh {expense.createdBy.name}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus pengeluaran?"
        description={
          deleteTarget
            ? `Catatan "${deleteTarget.description}" sebesar ${formatMoney(
                deleteTarget.amount,
              )} akan dihapus dan estimasi uang laci bertambah kembali.`
            : ""
        }
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onClose={() => !deleteMutation.isPending && setDeleteTarget(null)}
      />
    </Modal>
  );
}
