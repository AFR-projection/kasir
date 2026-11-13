import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { AuthLayout } from "../layouts/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/utils";
import { Button, Field, PageLoader } from "../components/ui";

export function SetupPage() {
  const navigate = useNavigate();
  const { user, refreshAuth } = useAuth();
  const toast = useToast();
  const [storeName, setStoreName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const setupQuery = useQuery({
    queryKey: ["setup", "status"],
    queryFn: api.setup.status,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (user) {
      navigate(user.role === "owner" ? "/owner" : "/cashier", { replace: true });
    } else if (setupQuery.data && !setupQuery.data.needsSetup) {
      navigate("/login", { replace: true });
    }
  }, [user, setupQuery.data, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeName.trim() || !ownerName.trim() || !email.trim() || !password) {
      setError("Semua kolom wajib diisi.");
      return;
    }
    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.setup.create({
        storeName: storeName.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        password,
      });
      await refreshAuth();
      toast.success("Toko Anda siap digunakan!");
      navigate("/owner", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  if (setupQuery.isLoading) {
    return <PageLoader label="Menyiapkan halaman pendaftaran..." />;
  }

  return (
    <AuthLayout
      eyebrow="Langkah pertama"
      headline="Siapkan toko Anda dalam satu menit."
      description="Buat akun pemilik pertama. Setelah itu, Anda dapat menambahkan produk, mengatur stok, dan membuat akun kasir untuk karyawan."
      features={[
        "Akun owner pertama dibuat secara aman",
        "Kelola produk, kategori, dan stok dari satu tempat",
        "Tambahkan akun kasir kapan pun dibutuhkan",
      ]}
    >
      <div className="auth-heading">
        <span className="auth-heading__icon">
          <Building2 size={19} />
        </span>
        <div>
          <p>Setup awal</p>
          <h1>Buat akun pemilik</h1>
        </div>
      </div>

      <p className="auth-subheading">
        Data toko ini akan muncul pada dashboard dan struk transaksi. Anda dapat mengubahnya nanti di Pengaturan.
      </p>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Field label="Nama toko" htmlFor="setup-store" required>
          <div className="input-with-icon">
            <Building2 size={17} />
            <input
              id="setup-store"
              type="text"
              placeholder="Contoh: Toko Segar Makmur"
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
        </Field>

        <Field label="Nama pemilik" htmlFor="setup-owner" required>
          <div className="input-with-icon">
            <UserRound size={17} />
            <input
              id="setup-owner"
              type="text"
              placeholder="Nama lengkap Anda"
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              maxLength={100}
            />
          </div>
        </Field>

        <Field label="Alamat email" htmlFor="setup-email" required hint="Email ini dipakai untuk masuk ke dashboard.">
          <div className="input-with-icon">
            <Mail size={17} />
            <input
              id="setup-email"
              type="email"
              placeholder="nama@tokoanda.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>
        </Field>

        <div className="form-grid form-grid--2">
          <Field label="Password" htmlFor="setup-password" required hint="Minimal 8 karakter.">
            <div className="input-with-icon input-with-icon--action">
              <LockKeyhole size={17} />
              <input
                id="setup-password"
                type={showPassword ? "text" : "password"}
                placeholder="Buat password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                maxLength={72}
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </Field>

          <Field label="Ulangi password" htmlFor="setup-password-confirm" required>
            <div className="input-with-icon">
              <LockKeyhole size={17} />
              <input
                id="setup-password-confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Ketik ulang password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                autoComplete="new-password"
                maxLength={72}
              />
            </div>
          </Field>
        </div>

        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        <Button
          type="submit"
          size="lg"
          block
          loading={submitting}
          icon={!submitting ? <ArrowRight size={18} /> : undefined}
        >
          Buat Toko & Masuk
        </Button>
      </form>

      <p className="auth-secure-note">
        <LockKeyhole size={14} />
        Password disimpan dengan enkripsi dan hanya Anda yang mengetahuiinya.
      </p>
    </AuthLayout>
  );
}
