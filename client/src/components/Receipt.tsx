import { Printer } from "lucide-react";
import type { TransactionDetail } from "../types";
import {
  formatDateTime,
  formatMoney,
  formatPaymentMethod,
  formatQuantity,
} from "../lib/utils";
import { Button, Modal } from "./ui";

function DashedLine() {
  return <div className="receipt-line" aria-hidden="true" />;
}

export function Receipt({ transaction }: { transaction: TransactionDetail }) {
  const { store } = transaction;

  return (
    <div id="receipt-print-area" className="receipt">
      <div className="receipt__store">
        <h2>{store.storeName}</h2>
        {store.storeAddress && <p>{store.storeAddress}</p>}
        {store.storePhone && <p>{store.storePhone}</p>}
      </div>

      <DashedLine />

      <div className="receipt__meta">
        <div>
          <span>No. Nota</span>
          <strong>{transaction.invoiceNumber}</strong>
        </div>
        <div>
          <span>Waktu</span>
          <strong>{formatDateTime(transaction.createdAt)}</strong>
        </div>
        <div>
          <span>Kasir</span>
          <strong>{transaction.cashierName}</strong>
        </div>
      </div>

      <DashedLine />

      <div className="receipt__items">
        {transaction.items.map((item) => (
          <div className="receipt__item" key={item.id}>
            <div className="receipt__item-name">{item.productName}</div>
            <div className="receipt__item-detail">
              <span>
                {formatQuantity(item.quantity)} {item.unit} × {formatMoney(item.unitPrice)}
              </span>
              <strong>{formatMoney(item.lineTotal)}</strong>
            </div>
          </div>
        ))}
      </div>

      <DashedLine />

      <div className="receipt__totals">
        <div>
          <span>Subtotal</span>
          <span>{formatMoney(transaction.subtotal)}</span>
        </div>
        <div className="receipt__total-row">
          <span>TOTAL</span>
          <strong>{formatMoney(transaction.total)}</strong>
        </div>
        <div>
          <span>Bayar ({formatPaymentMethod(transaction.paymentMethod)})</span>
          <span>{formatMoney(transaction.amountPaid)}</span>
        </div>
        <div>
          <span>Kembalian</span>
          <span>{formatMoney(transaction.changeDue)}</span>
        </div>
      </div>

      {transaction.notes && (
        <>
          <DashedLine />
          <p className="receipt__notes">Catatan: {transaction.notes}</p>
        </>
      )}

      <DashedLine />

      <p className="receipt__footer">{store.receiptFooter || "Terima kasih telah berbelanja."}</p>
      <p className="receipt__powered">Dicetak dari KASIR</p>
    </div>
  );
}

interface ReceiptModalProps {
  transaction: TransactionDetail | null;
  onClose: () => void;
}

export function ReceiptModal({ transaction, onClose }: ReceiptModalProps) {
  if (!transaction) return null;

  const handlePrint = () => {
    const previousTitle = document.title;
    document.title = `Struk ${transaction.invoiceNumber}`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 800);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Struk Transaksi"
      subtitle={transaction.invoiceNumber}
      size="sm"
      className="receipt-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Tutup
          </Button>
          <Button variant="primary" icon={<Printer size={17} />} onClick={handlePrint}>
            Cetak Struk
          </Button>
        </>
      }
    >
      <Receipt transaction={transaction} />
    </Modal>
  );
}
