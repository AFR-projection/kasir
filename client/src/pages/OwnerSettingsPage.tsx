import { FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MapPin,
  Phone,
  ReceiptText,
  Save,
  ShieldCheck,
  Store as StoreIcon,
  UserRound,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { getErrorMessage } from "../lib/utils";
import type { Store, TransactionDetail } from "../types";
import { Button, Field, PageHeader } from "../components/ui";
import { Receipt } from "../components/Receipt";

const sampleReceipt: TransactionDetail = {
  id: "preview",
  invoiceNumber: "TRX-00000000-00001",
  cashierId: "preview",
  cashierName: "Contoh Kasir",
  subtotal: 35000,
  total: 35000,
  paymentMethod: "cash",
  amountPaid: 50000,
  changeDue: 15000,
  notes: null,
  itemCount: 2,
  createdAt: new Date().toISOString(),
  items: [
    {
      id: "preview-item-1",
      productId: "preview-product-1",
      productName: "Contoh Produk A",
      unit: "pcs",
      quantity: 2,
      unitPrice: 10000,
      lineTotal: 20000,
    },
    {
      id: "preview-item-2",
      productId: "preview-product-2",
      productName: "Contoh Produk B",
      unit: "kg",
      quantity: 1,
      unitPrice: 15000,
      lineTotal: 15000,
    },
  ],
  store: {
    storeName: "Toko Saya",
    storeAddress: null,
    storePhone: null,
    receiptFooter: "Terima kasih telah berbelanja.",
  },
};

export function OwnerSettingsPage() {
  const { user, store, refreshAuth } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [storeForm, setStoreForm] = useState({
    storeName: store.storeName,
    storeAddress: store.storeAddress || "",
    storePhone: store.storePhone || "",
    receiptFooter: store.receiptFooter || "",
  });
  const [storeSaving, setStoreSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: user?.name || "", email: user?.email || "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmation: "",
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setStoreForm({
      storeName: store.storeName,
      storeAddress: store.storeAddress || "",
      storePhone: store.storePhone || "",
      receiptFooter: store.receiptFooter || "",
    });
  }, [store]);

  useEffect(() => {
    setProfileForm({ name: user?.name || "", email: user?.email || "" });
  }, [user]);

  const updateStoreField = (key: keyof typeof storeForm, value: string) => {
    setStoreForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const handleStoreSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (storeForm.storeName.trim().length < 2) {
      setErrors({ storeName: "Nama toko minimal 2 karakter." });
      return;
    }

    setStoreSaving(true);
    setErrors((current) => ({ ...current, storeForm: "" }));
    try {
      const result = await api.settings.update({
        storeName: storeForm.storeName.trim(),
        storeAddress: storeForm.storeAddress.trim() || null,
        storePhone: storeForm.storePhone.trim() || null,
        receiptFooter: storeForm.receiptFooter.trim() || null,
      });
      queryClient.setQueryData(
        ["auth", "me"],
        (previous: { user: typeof user; store: Store } | undefined) =>
          previous ? { ...previous, store: result.store } : previous,
      );
      toast.success("Pengaturan toko berhasil disimpan.");
    } catch (error) {
      setErrors((current) => ({ ...current, storeForm: getErrorMessage(error) }));
    } finally {
      setStoreSaving(false);
    }
  };

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const newErrors: Record<string, string> = {};
    if (profileForm.name.trim().length < 2) newErrors.profileName = "Nama minimal 2 karakter.";
    if (!profileForm.email.trim()) newErrors.profileEmail = "Email wajib diisi.";
    if (Object.keys(newErrors).length > 0) {
      setErrors((current) => ({ ...current, ...newErrors }));
      return;
    }

    setProfileSaving(true);
    try {
      await api.auth.updateProfile({ name: profileForm.name.trim(), email: profileForm.email.trim() });
      await refreshAuth();
      toast.success("Profil owner berhasil diperbarui.");
    } catch (error) {
      setErrors((current) => ({ ...current, profileForm: getErrorMessage(error) }));
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrors((current) => ({ ...current, passwordForm: "" }));

    if (!passwordForm.currentPassword) {
      setErrors((current) => ({ ...current, currentPassword: "Password saat ini wajib diisi." }));
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setErrors((current) => ({ ...current, newPassword: "Password baru minimal 8 karakter." }));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmation) {
      setErrors((current) => ({ ...current, confirmation: "Konfirmasi password tidak cocok." }));
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await api.auth.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmation: "" });
      await refreshAuth();
      toast.success(result.message);
    } catch (error) {
      setErrors((current) => ({ ...current, passwordForm: getErrorMessage(error) }));
    } finally {
      setPasswordSaving(false);
    }
  };

  const previewStore: Store = {
    storeName: storeForm.storeName || "Toko Anda",
    storeAddress: storeForm.storeAddress || null,
    storePhone: storeForm.storePhone || null,
    receiptFooter: storeForm.receiptFooter || null,
  };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Konfigurasi toko"
        title="Pengaturan"
        description="Sesuaikan identitas toko, informasi struk, dan keamanan akun pemilik."
      />

      <div className="settings-layout">
        <div className="settings-column">
          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Identitas bisnis</p>
                <h2>Profil Toko</h2>
              </div>
              <span className="panel__icon">
                <StoreIcon size={19} />
              </span>
            </div>

            <form onSubmit={handleStoreSubmit} className="form-stack" noValidate>
              <Field label="Nama toko" htmlFor="settings-store-name" required error={errors.storeName}>
                <div className="input-with-icon">
                  <StoreIcon size={17} />
                  <input
                    id="settings-store-name"
                    value={storeForm.storeName}
                    onChange={(event) => updateStoreField("storeName", event.target.value)}
                    maxLength={120}
                  />
                </div>
              </Field>

              <Field label="Alamat toko" htmlFor="settings-address" hint="Ditampilkan pada struk transaksi.">
                <div className="input-with-icon input-with-icon--textarea">
                  <MapPin size={17} />
                  <textarea
                    id="settings-address"
                    rows={2}
                    value={storeForm.storeAddress}
                    onChange={(event) => updateStoreField("storeAddress", event.target.value)}
                    maxLength={500}
                    placeholder="Alamat lengkap toko (opsional)"
                  />
                </div>
              </Field>

              <Field label="Nomor telepon" htmlFor="settings-phone">
                <div className="input-with-icon">
                  <Phone size={17} />
                  <input
                    id="settings-phone"
                    value={storeForm.storePhone}
                    onChange={(event) => updateStoreField("storePhone", event.target.value)}
                    maxLength={50}
                    placeholder="08xx xxxx xxxx (opsional)"
                  />
                </div>
              </Field>

              <Field
                label="Pesan penutup struk"
                htmlFor="settings-footer"
                hint="Ucapan atau informasi singkat di bagian bawah struk."
              >
                <textarea
                  id="settings-footer"
                  className="textarea"
                  rows={2}
                  value={storeForm.receiptFooter}
                  onChange={(event) => updateStoreField("receiptFooter", event.target.value)}
                  maxLength={300}
                  placeholder="Terima kasih telah berbelanja."
                />
              </Field>

              {errors.storeForm && <div className="auth-alert auth-alert--error">{errors.storeForm}</div>}

              <div className="form-actions">
                <Button type="submit" icon={<Save size={17} />} loading={storeSaving}>
                  Simpan Pengaturan
                </Button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Tampilan cetak</p>
                <h2>Pratinjau Struk</h2>
              </div>
              <span className="panel__icon">
                <ReceiptText size={19} />
              </span>
            </div>
            <p className="panel__description">Perubahan nama, alamat, telepon, dan pesan penutup langsung terlihat di pratinjau ini.</p>
            <div className="receipt-preview">
              <Receipt transaction={{ ...sampleReceipt, store: previewStore }} />
            </div>
          </section>
        </div>

        <div className="settings-column">
          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Akun pemilik</p>
                <h2>Profil Saya</h2>
              </div>
              <span className="panel__icon">
                <UserRound size={19} />
              </span>
            </div>

            <form onSubmit={handleProfileSubmit} className="form-stack" noValidate>
              <Field label="Nama lengkap" htmlFor="settings-profile-name" required error={errors.profileName}>
                <input
                  id="settings-profile-name"
                  className="input"
                  value={profileForm.name}
                  onChange={(event) => {
                    setProfileForm((current) => ({ ...current, name: event.target.value }));
                    setErrors((current) => ({ ...current, profileName: "" }));
                  }}
                  maxLength={100}
                />
              </Field>

              <Field label="Alamat email" htmlFor="settings-profile-email" required error={errors.profileEmail}>
                <input
                  id="settings-profile-email"
                  className="input"
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => {
                    setProfileForm((current) => ({ ...current, email: event.target.value }));
                    setErrors((current) => ({ ...current, profileEmail: "" }));
                  }}
                  autoComplete="email"
                />
              </Field>

              {errors.profileForm && <div className="auth-alert auth-alert--error">{errors.profileForm}</div>}

              <div className="form-actions">
                <Button type="submit" variant="secondary" icon={<Save size={17} />} loading={profileSaving}>
                  Simpan Profil
                </Button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel__header">
              <div>
                <p className="panel__eyebrow">Keamanan akun</p>
                <h2>Ganti Password</h2>
              </div>
              <span className="panel__icon">
                <ShieldCheck size={19} />
              </span>
            </div>
            <p className="panel__description">
              Gunakan password yang kuat dan tidak dipakai di layanan lain. Sesi saat ini akan tetap aktif setelah perubahan.
            </p>

            <form onSubmit={handlePasswordSubmit} className="form-stack" noValidate>
              <Field label="Password saat ini" htmlFor="settings-current-password" required error={errors.currentPassword}>
                <div className="input-with-icon">
                  <LockKeyhole size={17} />
                  <input
                    id="settings-current-password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
              </Field>

              <Field label="Password baru" htmlFor="settings-new-password" required error={errors.newPassword} hint="Minimal 8 karakter.">
                <div className="input-with-icon input-with-icon--action">
                  <KeyRound size={17} />
                  <input
                    id="settings-new-password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                    autoComplete="new-password"
                    maxLength={72}
                  />
                  <button
                    type="button"
                    className="input-action"
                    onClick={() => setShowPasswords((value) => !value)}
                    aria-label={showPasswords ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showPasswords ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </Field>

              <Field label="Ulangi password baru" htmlFor="settings-confirm-password" required error={errors.confirmation}>
                <div className="input-with-icon">
                  <CheckCircle2 size={17} />
                  <input
                    id="settings-confirm-password"
                    type={showPasswords ? "text" : "password"}
                    value={passwordForm.confirmation}
                    onChange={(event) => setPasswordForm((current) => ({ ...current, confirmation: event.target.value }))}
                    autoComplete="new-password"
                    maxLength={72}
                  />
                </div>
              </Field>

              {errors.passwordForm && <div className="auth-alert auth-alert--error">{errors.passwordForm}</div>}

              <div className="form-actions">
                <Button type="submit" variant="secondary" icon={<KeyRound size={17} />} loading={passwordSaving}>
                  Perbarui Password
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
