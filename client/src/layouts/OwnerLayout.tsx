import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageSearch,
  ReceiptText,
  Settings,
  Store as StoreIcon,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../lib/realtime";
import { Avatar, BrandMark, LiveIndicator } from "../components/ui";

const navigation = [
  { to: "/owner", end: true, label: "Dashboard", icon: LayoutDashboard },
  { to: "/owner/products", label: "Produk", icon: PackageSearch },
  { to: "/owner/stock", label: "Stok & Riwayat", icon: Boxes },
  { to: "/owner/transactions", label: "Transaksi", icon: ReceiptText },
  { to: "/owner/cash-sessions", label: "Sesi Kas", icon: Wallet },
  { to: "/owner/employees", label: "Karyawan", icon: UsersRound },
  { to: "/owner/settings", label: "Pengaturan", icon: Settings },
];

export function OwnerLayout() {
  const { user, store, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const realtimeStatus = useRealtime(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="owner-shell">
      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Tutup menu navigasi"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`owner-sidebar${menuOpen ? " owner-sidebar--open" : ""}`}>
        <div className="owner-sidebar__brand">
          <BrandMark />
          <div>
            <strong>KASIR</strong>
            <span>{store.storeName}</span>
          </div>
          <button
            type="button"
            className="owner-sidebar__close"
            aria-label="Tutup menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <div className="owner-sidebar__store">
          <span className="owner-sidebar__store-icon">
            <StoreIcon size={16} />
          </span>
          <div>
            <span>Dashboard Pemilik</span>
            <strong>{store.storeName}</strong>
          </div>
        </div>

        <nav className="owner-nav" aria-label="Navigasi pemilik">
          <p className="owner-nav__label">Menu utama</p>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `owner-nav__link${isActive ? " owner-nav__link--active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="owner-sidebar__foot">
          <div className="owner-sidebar__account">
            <Avatar name={user?.name || "Owner"} />
            <div>
              <strong>{user?.name}</strong>
              <span>Pemilik Toko</span>
            </div>
          </div>
          <button type="button" className="owner-sidebar__logout" onClick={handleLogout}>
            <LogOut size={17} />
            Keluar
          </button>
        </div>
      </aside>

      <div className="owner-main-wrap">
        <header className="owner-topbar">
          <button
            type="button"
            className="owner-topbar__menu"
            aria-label="Buka menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="owner-topbar__mobile-brand">
            <BrandMark size="sm" />
            <span>KASIR</span>
          </div>
          <div className="owner-topbar__spacer" />
          <LiveIndicator status={realtimeStatus} />
          <div className="owner-topbar__user">
            <Avatar name={user?.name || "Owner"} size="sm" />
            <div>
              <strong>{user?.name}</strong>
              <span>Owner</span>
            </div>
          </div>
        </header>

        <main className="owner-main" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
