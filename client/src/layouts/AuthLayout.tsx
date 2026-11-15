import type { ReactNode } from "react";
import { BrandMark } from "../components/ui";

interface AuthLayoutProps {
  eyebrow: string;
  headline: string;
  description: string;
  features: string[];
  children: ReactNode;
}

export function AuthLayout({ eyebrow, headline, description, features, children }: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <section className="auth-showcase">
        <div className="auth-showcase__brand">
          <BrandMark size="lg" />
          <div>
            <strong>KASIR</strong>
            <span>Product & Stock Management</span>
          </div>
        </div>

        <div className="auth-showcase__content">
          <p className="auth-showcase__eyebrow">{eyebrow}</p>
          <h1>{headline}</h1>
          <p className="auth-showcase__description">{description}</p>

          <ul className="auth-feature-list">
            {features.map((feature, index) => (
              <li key={feature}>
                <span className="auth-feature-list__index">{String(index + 1).padStart(2, "0")}</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="auth-showcase__footer">
          <span>Dibangun untuk toko yang ingin tumbuh lebih rapi.</span>
          <span>© {new Date().getFullYear()} KASIR</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel__mobile-brand">
          <BrandMark />
          <strong>KASIR</strong>
        </div>
        <div className="auth-card">{children}</div>
        <p className="auth-panel__footnote">Sistem kasir & stok sederhana untuk toko Anda.</p>
      </section>
    </div>
  );
}
