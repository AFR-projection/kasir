import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { History, LogOut, ShoppingCart } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../lib/realtime";
import { Avatar, BrandMark, LiveIndicator } from "../components/ui";

export function CashierLayout() {
  const { user, store, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const realtimeStatus = useRealtime(true);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="cashier-shell">
      <header className="cashier-header">
        <div className="cashier-header__brand">
          <BrandMark />
          <div>
            <strong>KASIR</strong>
            <span>{store.storeName}</span>
          </div>
        </div>

        <nav className="cashier-nav" aria-label="Navigasi kasir">
          <NavLink
            to="/cashier"
            end
            className={({ isActive }) => `cashier-nav__link${isActive ? " cashier-nav__link--active" : ""}`}
          >
            <ShoppingCart size={18} />
            Kasir
          </NavLink>
          <NavLink
            to="/cashier/history"
            className={({ isActive }) => `cashier-nav__link${isActive ? " cashier-nav__link--active" : ""}`}
          >
            <History size={18} />
            Riwayat
          </NavLink>
        </nav>

        <div className="cashier-header__right">
          <LiveIndicator status={realtimeStatus} />
          <div className="cashier-header__user">
            <Avatar name={user?.name || "Kasir"} size="sm" />
            <div>
              <strong>{user?.name}</strong>
              <span>Kasir</span>
            </div>
          </div>
          <button type="button" className="cashier-header__logout" onClick={handleLogout} aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="cashier-main" key={location.pathname}>
        <Outlet />
      </main>
    </div>
  );
}
