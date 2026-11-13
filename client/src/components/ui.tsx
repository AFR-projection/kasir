import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  ShoppingBasket,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { getInitials } from "../lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  icon,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`btn btn--${variant} btn--${size}${block ? " btn--block" : ""} ${className}`.trim()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={17} className="spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: "default" | "danger";
}

export function IconButton({ label, tone = "default", className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${tone} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <Loader2 size={size} className="spin" aria-label="Memuat" />;
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <div className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <ShoppingBasket size={size === "lg" ? 28 : size === "sm" ? 18 : 22} />
    </div>
  );
}

export function LoadingScreen({ message = "Menyiapkan toko Anda..." }: { message?: string }) {
  return (
    <div className="loading-screen">
      <div className="loading-screen__mark">
        <BrandMark size="lg" />
      </div>
      <div className="loading-screen__spinner">
        <Spinner size={22} />
      </div>
      <p>{message}</p>
    </div>
  );
}

export function PageLoader({ label = "Memuat data..." }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="page-error">
      <div className="page-error__icon">
        <AlertTriangle size={22} />
      </div>
      <div>
        <strong>Data belum dapat dimuat</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      )}
    </div>
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, children, className = "" }: FieldProps) {
  return (
    <div className={`field ${className}`.trim()}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field__required">*</span>}
      </label>
      {children}
      {error ? (
        <p className="field__message field__message--error">{error}</p>
      ) : hint ? (
        <p className="field__message">{hint}</p>
      ) : null}
    </div>
  );
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? " empty-state--compact" : ""}`}>
      <div className="empty-state__icon">{icon || <ShoppingBasket size={24} />}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

export type BadgeTone = "green" | "amber" | "red" | "gray" | "blue" | "purple";

export function Badge({
  tone = "gray",
  children,
  dot = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return <span className={`avatar avatar--${size}`}>{getInitials(name)}</span>;
}

export type RealtimeStatus = "connecting" | "online" | "polling" | "reconnecting";

export function LiveIndicator({ status }: { status: RealtimeStatus }) {
  const label =
    status === "online"
      ? "Tersinkron"
      : status === "polling"
        ? "Sinkron berkala"
        : status === "reconnecting"
          ? "Menyambung ulang"
          : "Menghubungkan";
  const title =
    status === "polling"
      ? "Data diperbarui otomatis setiap beberapa detik"
      : "Status sinkronisasi data real-time";
  return (
    <span className={`live-indicator live-indicator--${status}`} title={title}>
      <span className="live-indicator__dot" />
      {label}
    </span>
  );
}

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function SearchField({
  value,
  onChange,
  placeholder = "Cari...",
  className = "",
  ariaLabel = "Cari",
}: SearchFieldProps) {
  return (
    <div className={`search-field ${className}`.trim()}>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
      {value && (
        <button type="button" className="search-field__clear" onClick={() => onChange("")} aria-label="Hapus pencarian">
          <X size={15} />
        </button>
      )}
    </div>
  );
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  closeOnOverlay?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  className = "",
  closeOnOverlay = true,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal-layer">
      <div
        className="modal-overlay"
        onMouseDown={(event) => {
          if (closeOnOverlay && event.target === event.currentTarget) onClose();
        }}
      >
        <section
          className={`modal modal--${size} ${className}`.trim()}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <header className="modal__header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <IconButton autoFocus label="Tutup dialog" onClick={onClose} className="modal__close">
              <X size={19} />
            </IconButton>
          </header>
          <div className="modal__body">{children}</div>
          {footer && <footer className="modal__footer">{footer}</footer>}
        </section>
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Konfirmasi",
  cancelLabel = "Batal",
  tone = "danger",
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      closeOnOverlay={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-description">{description}</p>
    </Modal>
  );
}

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="page-header__eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-header__description">{description}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  if (total === 0) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="pagination">
      <span className="pagination__info">
        {start}–{end} dari {total}
      </span>
      <div className="pagination__actions">
        <IconButton label="Halaman sebelumnya" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={18} />
        </IconButton>
        <span className="pagination__page">
          {page} / {totalPages}
        </span>
        <IconButton
          label="Halaman berikutnya"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          <ChevronRight size={18} />
        </IconButton>
      </div>
    </div>
  );
}
