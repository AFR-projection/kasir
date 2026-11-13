import { FormEvent, useState } from "react";
import {
  Banknote,
  Calculator,
  CircleAlert,
  CircleCheck,
  Clock3,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { api } from "../lib/api";
import type { CashSession } from "../types";
import { useToast } from "../context/ToastContext";
import {
  formatDateTime,
  formatMoney,
  formatTime,
  getErrorMessage,
  roundMoneyValue,
} from "../lib/utils";
import { Badge, Button, Field, Modal } from "./ui";

const openingSuggestions = [0, 100_000, 200_000, 500_000];

function signedMoney(value: number): string {
  if (value === 0) return formatMoney(0);
  return `${value > 0 ? "+" : "−"}${formatMoney(Math.abs(value))}`;
}

function differenceClass(value: number | null): string {
  if (value === null || value === 0) return "cash-difference--match";
  return value > 0 ? "cash-difference--over" : "cash-difference--short";
}

export function OpenCashSessionGate({
  lastClosed,
  onOpened,
}: {
  lastClosed: CashSession | null;
  onOpened: (session: CashSession) => void;
}) {
  const toast = useToast();
  const [openingCash, setOpeningCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (openingCash === "") {
      setError("Masukkan jumlah uang tunai awal di laci.");
      return;
    }
    const amount = Number(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Nominal uang awal tidak valid.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.cashSessions.open({
        openingCash: roundMoneyValue(amount),
        notes: notes.trim() || undefined,
      });
      toast.success(result.message);
      onOpened(result.session);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cash-gate">
      <section className="cash-gate__card">
        <span className="cash-gate__icon">
          <Unlock size={25} />
        </span>
        <p className="page-header__eyebrow">Sesi kas</p>
        <h1>Buka kas sebelum berjualan</h1>
        <p className="cash-gate__lead">
          Hitung uang tunai awal di laci, lalu masukkan jumlahnya. Semua penjualan selama toko buka akan
          tercatat dalam sesi ini.
        </p>

        <form className="cash-gate__form" onSubmit={handleSubmit} noValidate>
          <Field
            label="Uang awal di laci"
            htmlFor="opening-cash"
            hint="Masukkan total uang tunai yang sudah ada di laci sebelum transaksi pertama."
            required
          >
            <div className="payment-input">
              <span>Rp</span>
              <input
                id="opening-cash"
                type="number"
                inputMode="decimal"
                min="0"
                step="100"
                value={openingCash}
                onChange={(event) => {
                  setOpeningCash(event.target.value);
                  setError("");
                }}
                placeholder="0"
                autoFocus
              />
            </div>
          </Field>

          <div className="cash-gate__suggestions">
            {openingSuggestions.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`payment-suggestion${Number(openingCash) === amount && openingCash !== "" ? " payment-suggestion--active" : ""}`}
                onClick={() => {
                  setOpeningCash(String(amount));
                  setError("");
                }}
              >
                {amount === 0 ? "Tanpa uang awal" : formatMoney(amount)}
              </button>
            ))}
          </div>

          <Field label="Catatan pembukaan" htmlFor="opening-notes" hint="Opsional, misalnya nama kasir atau kondisi laci.">
            <textarea
              id="opening-notes"
              className="textarea"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Tambahkan catatan..."
              maxLength={500}
            />
          </Field>

          {error && <div className="auth-alert auth-alert--error">{error}</div>}

          <Button type="submit" size="lg" block loading={submitting} icon={!submitting ? <LockKeyhole size={18} /> : undefined}>
            Buka Kas
          </Button>
        </form>

        {lastClosed && lastClosed.closedAt && (
          <div className="cash-gate__last">
            <div className="cash-gate__last-head">
              <span className="cash-gate__last-icon">
                <Clock3 size={16} />
              </span>
              <div>
                <strong>Sesi terakhir</strong>
                <span>
                  {formatDateTime(lastClosed.closedAt)} · {lastClosed.closedBy?.name || lastClosed.openedBy.name}
                </span>
              </div>
            </div>
            <div className="cash-gate__last-values">
              <span>
                Dihitung <strong>{formatMoney(lastClosed.countedCash ?? 0)}</strong>
              </span>
              <span>
                Seharusnya <strong>{formatMoney(lastClosed.expectedCash)}</strong>
              </span>
              <span className={differenceClass(lastClosed.difference)}>
                Selisih <strong>{signedMoney(lastClosed.difference ?? 0)}</strong>
              </span>
            </div>
            {lastClosed.closingNotes && <p>{lastClosed.closingNotes}</p>}
          </div>
        )}
      </section>

      <aside className="cash-gate__aside">
        <div className="cash-gate__aside-head">
          <ShieldCheck size={20} />
          <h2>Bagaimana kas dicatat?</h2>
        </div>
        <ol className="cash-gate__steps">
          <li>
            <span>1</span>
            <div>
              <strong>Buka kas</strong>
              <p>Catat uang tunai awal yang ada di laci.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Layani transaksi</strong>
              <p>Penjualan tunai dan non-tunai tercatat otomatis dalam sesi.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Tutup kas</strong>
              <p>Hitung laci dan bandingkan dengan catatan sistem.</p>
            </div>
          </li>
        </ol>
        <div className="cash-gate__note">
          <Calculator size={17} />
          <p>Rumus uang laci: kas awal + seluruh penjualan tunai.</p>
        </div>
      </aside>
    </div>
  );
}

export function CashSessionBar({
  session,
  onClose,
}: {
  session: CashSession;
  onClose: () => void;
}) {
  return (
    <section className="cash-session-bar" aria-label="Status sesi kas">
      <div className="cash-session-bar__identity">
        <span className="cash-session-bar__icon">
          <Banknote size={20} />
        </span>
        <div>
          <div className="cash-session-bar__title">
            <strong>Kas dibuka</strong>
            <Badge tone="green" dot>
              Aktif
            </Badge>
          </div>
          <p>
            Sejak {formatTime(session.openedAt)} · oleh {session.openedBy.name}
          </p>
        </div>
      </div>

      <div className="cash-session-bar__metrics">
        <div>
          <span>Kas awal</span>
          <strong>{formatMoney(session.openingCash)}</strong>
        </div>
        <div>
          <span>Penjualan tunai</span>
          <strong>{formatMoney(session.cashSales)}</strong>
        </div>
        <div className="cash-session-bar__expected">
          <span>Estimasi laci</span>
          <strong>{formatMoney(session.expectedCash)}</strong>
        </div>
      </div>

      <Button variant="secondary" size="sm" icon={<LockKeyhole size={15} />} onClick={onClose}>
        Tutup Kas
      </Button>
    </section>
  );
}

export function CloseCashSessionModal({
  session,
  cartItemCount,
  onClose,
  onClosed,
}: {
  session: CashSession;
  cartItemCount: number;
  onClose: () => void;
  onClosed: (session: CashSession) => void;
}) {
  const toast = useToast();
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const countedValue = countedCash === "" ? null : Number(countedCash);
  const difference = countedValue === null ? null : roundMoneyValue(countedValue - session.expectedCash);
  const noteRequired = difference !== null && difference !== 0;
  const canSubmit =
    countedValue !== null &&
    Number.isFinite(countedValue) &&
    countedValue >= 0 &&
    (!noteRequired || notes.trim().length > 0);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0) {
      setError("Masukkan jumlah uang tunai hasil hitung laci.");
      return;
    }
    if (noteRequired && !notes.trim()) {
      setError("Selisih uang laci wajib disertai catatan penjelasan.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.cashSessions.close(session.id, {
        countedCash: roundMoneyValue(countedValue),
        notes: notes.trim() || undefined,
      });
      toast.success(result.message);
      onClosed(result.session);
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
      title="Tutup Kas"
      subtitle={`Dibuka ${formatDateTime(session.openedAt)} oleh ${session.openedBy.name}`}
      size="md"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button
            type="submit"
            form="close-cash-form"
            loading={submitting}
            disabled={!canSubmit}
            icon={!submitting ? <LockKeyhole size={17} /> : undefined}
          >
            Tutup Kas
          </Button>
        </>
      }
    >
      <form id="close-cash-form" onSubmit={handleSubmit} className="form-stack" noValidate>
        <div className="cash-close-summary">
          <div>
            <span>Kas awal</span>
            <strong>{formatMoney(session.openingCash)}</strong>
          </div>
          <div>
            <span>Penjualan tunai</span>
            <strong>{formatMoney(session.cashSales)}</strong>
          </div>
          <div>
            <span>Penjualan non-tunai</span>
            <strong>{formatMoney(session.nonCashSales)}</strong>
          </div>
          <div>
            <span>Transaksi</span>
            <strong>{session.transactionCount}</strong>
          </div>
        </div>

        <div className="cash-expected-card">
          <div>
            <span>Uang laci seharusnya</span>
            <strong>{formatMoney(session.expectedCash)}</strong>
            <p>Kas awal + seluruh penjualan tunai pada sesi ini.</p>
          </div>
          <Calculator size={26} />
        </div>

        <Field
          label="Uang tunai hasil hitung laci"
          htmlFor="counted-cash"
          hint="Hitung fisik uang di laci sekarang, lalu masukkan totalnya."
          required
        >
          <div className="payment-input">
            <span>Rp</span>
            <input
              id="counted-cash"
              type="number"
              inputMode="decimal"
              min="0"
              step="100"
              value={countedCash}
              onChange={(event) => {
                setCountedCash(event.target.value);
                setError("");
              }}
              placeholder="0"
              autoFocus
            />
          </div>
        </Field>

        {difference !== null && (
          <div className={`cash-difference ${differenceClass(difference)}`}>
            <span className="cash-difference__icon">
              {difference === 0 ? <CircleCheck size={20} /> : <CircleAlert size={20} />}
            </span>
            <div>
              <span>{difference === 0 ? "Uang laci cocok" : difference > 0 ? "Uang laci lebih" : "Uang laci kurang"}</span>
              <strong>{difference === 0 ? formatMoney(0) : signedMoney(difference)}</strong>
              <p>
                {difference === 0
                  ? "Jumlah fisik sesuai dengan catatan sistem."
                  : "Selisih wajib dijelaskan pada catatan sebelum kas ditutup."}
              </p>
            </div>
          </div>
        )}

        <Field
          label="Catatan penutupan"
          htmlFor="closing-notes"
          hint={
            noteRequired
              ? "Wajib diisi karena ada selisih uang laci."
              : "Opsional, misalnya kendala atau kejadian selama shift."
          }
          required={noteRequired}
        >
          <textarea
            id="closing-notes"
            className="textarea"
            rows={2}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              setError("");
            }}
            placeholder={noteRequired ? "Jelaskan penyebab selisih..." : "Tambahkan catatan..."}
            maxLength={500}
          />
        </Field>

        {cartItemCount > 0 && (
          <div className="cash-close-warning">
            <ReceiptText size={17} />
            <p>
              Keranjang masih berisi {cartItemCount} produk yang belum dibayar. Produk tersebut tidak akan
              menjadi transaksi dan keranjang akan dikosongkan saat kas ditutup.
            </p>
          </div>
        )}

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}
