import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, LogIn, Mail, Store } from "lucide-react";
import { AuthLayout } from "../layouts/AuthLayout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { api } from "../lib/api";
import { getErrorMessage } from "../lib/utils";
import { Button, Field } from "../components/ui";

export function LoginPage() {
  const navigate = useNavigate();
  const { user, refreshAuth } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const setupQuery = useQuery({
    queryKey: ["setup", "status"],
    queryFn: api.setup.status,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (user) {
      navigate(user.role === "owner" ? "/owner" : "/cashier", { replace: true });
    } else if (setupQuery.data?.needsSetup) {
      navigate("/setup", { replace: true });
    }
  }, [user, setupQuery.data?.needsSetup, navigate]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Email dan password wajib diisi.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await api.auth.login({ email: email.trim(), password });
      const authenticatedUser = await refreshAuth();
      toast.success("Selamat datang kembali!");
      navigate(authenticatedUser?.role === "cashier" ? "/cashier" : "/owner", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Operasional toko, tanpa ribet"
      headline="Produk rapi, stok terkontrol, kasir melaju cepat."
      description="Kelola produk dan stok dari satu dashboard. Transaksi karyawan langsung memperbarui stok dan laporan pemilik secara otomatis."
      features={[
        "Katalog produk dan stok selalu sinkron",
        "Kasir cepat dengan pembayaran dan struk",
        "Riwayat stok yang jelas dan dapat diaudit",
      ]}
    >
      <div className="auth-heading">
        <span className="auth-heading__icon">
          <LogIn size={19} />
        </span>
        <div>
          <p>Selamat datang</p>
          <h1>Masuk ke akun Anda</h1>
        </div>
      </div>

      <p className="auth-subheading">
        Gunakan akun pemilik atau karyawan yang sudah terdaftar. Hubungi pemilik toko jika belum memiliki akses.
      </p>

      {setupQuery.isError && (
        <div className="auth-alert auth-alert--warning">
          Server atau database belum dapat dihubungi. Periksa konfigurasi koneksi.
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Field label="Alamat email" htmlFor="login-email" required>
          <div className="input-with-icon">
            <Mail size={17} />
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="nama@tokoanda.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
            />
          </div>
        </Field>

        <Field label="Password" htmlFor="login-password" required>
          <div className="input-with-icon input-with-icon--action">
            <Store size={17} aria-hidden="true" className="input-icon-hidden" />
            <span className="visually-hidden">Password</span>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Masukkan password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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

        {error && <div className="auth-alert auth-alert--error">{error}</div>}

        <Button type="submit" size="lg" block loading={submitting} icon={!submitting ? <LogIn size={18} /> : undefined}>
          Masuk
        </Button>
      </form>

      <div className="auth-divider">
        <span>Akses aman dengan peran pengguna</span>
      </div>

      <div className="auth-roles">
        <div>
          <strong>Pemilik</strong>
          <span>Produk, stok, laporan</span>
        </div>
        <div>
          <strong>Karyawan</strong>
          <span>Kasir & riwayat pribadi</span>
        </div>
      </div>

      {setupQuery.isLoading && (
        <div className="auth-loading-note">
          <Loader2 size={14} className="spin" /> Memeriksa status toko...
        </div>
      )}
    </AuthLayout>
  );
}
