import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { ApiError, api } from "../lib/api";
import type { AccountUser } from "../types";
import { formatDate, formatDateTime, getErrorMessage } from "../lib/utils";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  Avatar,
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
} from "../components/ui";

export function OwnerEmployeesPage() {
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AccountUser | null>(null);
  const [statusTarget, setStatusTarget] = useState<AccountUser | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: api.users.list,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const cashiers = (usersQuery.data?.users || []).filter((user) => user.role === "cashier");
  const activeCashiers = cashiers.filter((user) => user.isActive).length;

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    setStatusSaving(true);
    try {
      await api.users.update(statusTarget.id, { isActive: !statusTarget.isActive });
      toast.success(
        statusTarget.isActive
          ? "Akun karyawan dinonaktifkan dan sesi aktifnya telah dihentikan."
          : "Akun karyawan diaktifkan kembali.",
      );
      setStatusTarget(null);
      await refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setStatusSaving(false);
    }
  };

  const openCreate = () => {
    setEditingUser(null);
    setFormOpen(true);
  };

  const openEdit = (user: AccountUser) => {
    setEditingUser(user);
    setFormOpen(true);
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tim toko"
        title="Karyawan"
        description="Kelola akun kasir, atur akses masuk, dan reset password tanpa mengubah data penjualan."
        actions={
          <Button icon={<Plus size={17} />} onClick={openCreate}>
            Tambah Karyawan
          </Button>
        }
      />

      <div className="staff-summary">
        <div className="staff-summary__icon">
          <UsersRound size={22} />
        </div>
        <div>
          <strong>{cashiers.length} akun karyawan</strong>
          <span>{activeCashiers} aktif · {cashiers.length - activeCashiers} nonaktif</span>
        </div>
        <div className="staff-summary__security">
          <ShieldCheck size={16} />
          Karyawan hanya memiliki akses kasir dan riwayat transaksinya sendiri.
        </div>
      </div>

      {usersQuery.isLoading ? (
        <PageLoader label="Memuat akun karyawan..." />
      ) : usersQuery.isError ? (
        <PageError message={getErrorMessage(usersQuery.error)} onRetry={() => void usersQuery.refetch()} />
      ) : (
        <div className="staff-layout">
          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Akun pemilik</p>
                <h2>Pemilik Toko</h2>
              </div>
              <Badge tone="green" dot>
                Akses penuh
              </Badge>
            </div>
            {currentUser && (
              <div className="owner-account-card">
                <Avatar name={currentUser.name} size="lg" />
                <div>
                  <strong>{currentUser.name}</strong>
                  <span>{currentUser.email}</span>
                </div>
                <div className="owner-account-card__lock">
                  <ShieldCheck size={17} />
                  Akun owner hanya dapat diubah dari menu Pengaturan.
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Akses kasir</p>
                <h2>Daftar Karyawan</h2>
              </div>
              <span className="panel__count">{cashiers.length}</span>
            </div>

            {cashiers.length === 0 ? (
              <EmptyState
                icon={<UsersRound size={24} />}
                title="Belum ada karyawan"
                description="Buat akun kasir agar karyawan dapat mulai melayani transaksi di toko."
                action={
                  <Button icon={<Plus size={17} />} onClick={openCreate}>
                    Tambah Karyawan Pertama
                  </Button>
                }
              />
            ) : (
              <div className="staff-list">
                {cashiers.map((cashier) => (
                  <article className={`staff-card${!cashier.isActive ? " staff-card--inactive" : ""}`} key={cashier.id}>
                    <Avatar name={cashier.name} />
                    <div className="staff-card__identity">
                      <div>
                        <strong>{cashier.name}</strong>
                        <Badge tone={cashier.isActive ? "green" : "gray"} dot>
                          {cashier.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <span>
                        <Mail size={13} /> {cashier.email}
                      </span>
                      <span>
                        <CalendarDays size={13} /> Terakhir masuk:{" "}
                        {cashier.lastLoginAt ? formatDateTime(cashier.lastLoginAt) : "Belum pernah"}
                      </span>
                    </div>
                    <div className="staff-card__meta">
                      <span>Bergabung {formatDate(cashier.createdAt)}</span>
                    </div>
                    <div className="staff-card__actions">
                      <IconButton label={`Edit ${cashier.name}`} onClick={() => openEdit(cashier)}>
                        <Pencil size={16} />
                      </IconButton>
                      <button
                        type="button"
                        className={`staff-status-button${cashier.isActive ? " staff-status-button--deactivate" : ""}`}
                        onClick={() => setStatusTarget(cashier)}
                      >
                        {cashier.isActive ? <UserRoundX size={16} /> : <UserRoundCheck size={16} />}
                        {cashier.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <EmployeeFormModal
        open={formOpen}
        initialUser={editingUser}
        onClose={() => setFormOpen(false)}
        onSaved={async () => {
          setFormOpen(false);
          await refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={statusTarget?.isActive ? "Nonaktifkan akun?" : "Aktifkan akun?"}
        description={
          statusTarget?.isActive
            ? `${statusTarget?.name} tidak akan bisa masuk ke kasir dan sesi aktifnya akan langsung berakhir. Riwayat transaksi tetap tersimpan.`
            : `${statusTarget?.name} akan dapat kembali masuk dan menggunakan kasir.`
        }
        confirmLabel={statusTarget?.isActive ? "Nonaktifkan" : "Aktifkan"}
        tone={statusTarget?.isActive ? "danger" : "primary"}
        loading={statusSaving}
        onClose={() => !statusSaving && setStatusTarget(null)}
        onConfirm={() => void handleToggleStatus()}
      />
    </div>
  );
}

interface EmployeeFormModalProps {
  open: boolean;
  initialUser: AccountUser | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function EmployeeFormModal({ open, initialUser, onClose, onSaved }: EmployeeFormModalProps) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(initialUser?.name || "");
    setEmail(initialUser?.email || "");
    setPassword("");
    setPasswordConfirmation("");
    setError("");
    setFieldErrors({});
  }, [open, initialUser]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (name.trim().length < 2) errors.name = "Nama minimal 2 karakter.";
    if (!email.trim()) errors.email = "Email wajib diisi.";
    if (!initialUser && password.length < 8) errors.password = "Password minimal 8 karakter.";
    if (initialUser && password && password.length < 8) errors.password = "Password minimal 8 karakter.";
    if ((!initialUser || password) && password !== passwordConfirmation) {
      errors.passwordConfirmation = "Konfirmasi password tidak cocok.";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      if (initialUser) {
        await api.users.update(initialUser.id, {
          name: name.trim(),
          email: email.trim(),
          ...(password ? { password } : {}),
        });
        toast.success(
          password ? "Data karyawan dan password berhasil diperbarui." : "Data karyawan berhasil diperbarui.",
        );
      } else {
        await api.users.create({ name: name.trim(), email: email.trim(), password });
        toast.success("Akun karyawan berhasil dibuat.");
      }
      await onSaved();
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.details) setFieldErrors(submitError.details);
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={initialUser ? "Edit Karyawan" : "Tambah Karyawan"}
      subtitle={
        initialUser
          ? "Perbarui identitas akun kasir. Kosongkan password jika tidak ingin menggantinya."
          : "Buat akun kasir baru untuk anggota tim Anda."
      }
      size="md"
      closeOnOverlay={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" form="employee-form" loading={submitting}>
            {initialUser ? "Simpan Perubahan" : "Buat Akun"}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="form-stack" noValidate>
        <Field label="Nama lengkap" htmlFor="employee-name" required error={fieldErrors.name}>
          <input
            id="employee-name"
            className="input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFieldErrors((current) => ({ ...current, name: "" }));
            }}
            placeholder="Nama karyawan"
            maxLength={100}
            autoFocus
          />
        </Field>

        <Field
          label="Alamat email"
          htmlFor="employee-email"
          required
          error={fieldErrors.email}
          hint="Email digunakan untuk masuk ke halaman kasir."
        >
          <input
            id="employee-email"
            className="input"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: "" }));
            }}
            placeholder="kasir@tokoanda.com"
            maxLength={255}
            autoComplete="off"
          />
        </Field>

        <div className="form-grid form-grid--2">
          <Field
            label={initialUser ? "Password baru" : "Password"}
            htmlFor="employee-password"
            required={!initialUser}
            error={fieldErrors.password}
            hint={initialUser ? "Opsional. Minimal 8 karakter." : "Minimal 8 karakter."}
          >
            <div className="input-with-icon">
              <KeyRound size={17} />
              <input
                id="employee-password"
                className="input-with-icon__input"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setFieldErrors((current) => ({ ...current, password: "" }));
                }}
                placeholder={initialUser ? "Biarkan kosong jika tetap" : "Buat password"}
                maxLength={72}
                autoComplete="new-password"
              />
            </div>
          </Field>

          <Field label="Ulangi password" htmlFor="employee-password-confirm" error={fieldErrors.passwordConfirmation}>
            <input
              id="employee-password-confirm"
              className="input"
              type="password"
              value={passwordConfirmation}
              onChange={(event) => {
                setPasswordConfirmation(event.target.value);
                setFieldErrors((current) => ({ ...current, passwordConfirmation: "" }));
              }}
              placeholder="Ketik ulang password"
              maxLength={72}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {initialUser && (
          <div className="inline-banner inline-banner--blue">
            <KeyRound size={18} />
            <div>
              <strong>Reset password</strong>
              <p>Jika password diubah, sesi login karyawan tersebut akan otomatis berakhir.</p>
            </div>
          </div>
        )}

        {error && <div className="auth-alert auth-alert--error">{error}</div>}
      </form>
    </Modal>
  );
}
