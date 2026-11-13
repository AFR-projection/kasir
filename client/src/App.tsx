import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LoadingScreen } from "./components/ui";
import { ApiError } from "./lib/api";
import { OwnerLayout } from "./layouts/OwnerLayout";
import { CashierLayout } from "./layouts/CashierLayout";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { OwnerDashboardPage } from "./pages/OwnerDashboardPage";
import { OwnerProductsPage } from "./pages/OwnerProductsPage";
import { OwnerStockPage } from "./pages/OwnerStockPage";
import { OwnerTransactionsPage } from "./pages/OwnerTransactionsPage";
import { OwnerCashSessionsPage } from "./pages/OwnerCashSessionsPage";
import { OwnerEmployeesPage } from "./pages/OwnerEmployeesPage";
import { OwnerSettingsPage } from "./pages/OwnerSettingsPage";
import { CashierPage } from "./pages/CashierPage";
import { CashierHistoryPage } from "./pages/CashierHistoryPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});

function ProtectedRoute({
  role,
  children,
}: {
  role: "owner" | "cashier";
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === "owner" ? "/owner" : "/cashier"} replace />;
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "owner" ? "/owner" : "/cashier"} replace />;
}

function NotFoundPage() {
  return (
    <div className="not-found-page">
      <div className="not-found-page__code">404</div>
      <h1>Halaman tidak ditemukan</h1>
      <p>Halaman yang Anda cari sudah dipindahkan atau tidak tersedia.</p>
      <a href="/" className="btn btn--primary btn--md">
        Kembali ke dashboard
      </a>
    </div>
  );
}

const routeTitles: Array<[RegExp, string]> = [
  [/^\/owner$/, "Dashboard"],
  [/^\/owner\/products/, "Produk"],
  [/^\/owner\/stock/, "Stok & Riwayat"],
  [/^\/owner\/transactions/, "Transaksi"],
  [/^\/owner\/cash-sessions/, "Sesi Kas"],
  [/^\/owner\/employees/, "Karyawan"],
  [/^\/owner\/settings/, "Pengaturan"],
  [/^\/cashier\/history/, "Riwayat Transaksi"],
  [/^\/cashier$/, "Kasir"],
  [/^\/login$/, "Masuk"],
  [/^\/setup$/, "Setup Awal"],
];

function DocumentTitle() {
  const location = useLocation();

  useEffect(() => {
    const match = routeTitles.find(([pattern]) => pattern.test(location.pathname));
    document.title = `${match ? match[1] : "Aplikasi"} · KASIR`;
  }, [location.pathname]);

  return null;
}

function AppRoutes() {
  return (
    <>
      <DocumentTitle />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />

        <Route
          path="/owner"
          element={
            <ProtectedRoute role="owner">
              <OwnerLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<OwnerDashboardPage />} />
          <Route path="products" element={<OwnerProductsPage />} />
          <Route path="stock" element={<OwnerStockPage />} />
          <Route path="transactions" element={<OwnerTransactionsPage />} />
          <Route path="cash-sessions" element={<OwnerCashSessionsPage />} />
          <Route path="employees" element={<OwnerEmployeesPage />} />
          <Route path="settings" element={<OwnerSettingsPage />} />
        </Route>

        <Route
          path="/cashier"
          element={
            <ProtectedRoute role="cashier">
              <CashierLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<CashierPage />} />
          <Route path="history" element={<CashierHistoryPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
