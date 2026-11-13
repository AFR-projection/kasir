export interface Migration {
  name: string;
  sql: string;
}

const initialSchema: Migration = {
  name: "001_initial_schema",
  sql: `
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'cashier',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      auth_version INTEGER NOT NULL DEFAULT 0,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_role_check CHECK (role IN ('owner', 'cashier')),
      CONSTRAINT users_name_length_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
      CONSTRAINT users_email_lower_check CHECK (email = lower(email))
    );

    CREATE UNIQUE INDEX users_email_unique_idx ON users (lower(email));
    CREATE INDEX users_role_active_idx ON users (role, is_active);

    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(80) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT categories_name_length_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
    );

    CREATE UNIQUE INDEX categories_name_unique_idx ON categories (lower(name));

    CREATE TRIGGER categories_set_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
      stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
      min_stock NUMERIC(14, 3) NOT NULL DEFAULT 0,
      unit VARCHAR(30) NOT NULL,
      image_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT products_name_length_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 150),
      CONSTRAINT products_cost_price_check CHECK (cost_price >= 0),
      CONSTRAINT products_selling_price_check CHECK (selling_price >= 0),
      CONSTRAINT products_stock_check CHECK (stock >= 0),
      CONSTRAINT products_min_stock_check CHECK (min_stock >= 0),
      CONSTRAINT products_unit_length_check CHECK (char_length(btrim(unit)) BETWEEN 1 AND 30)
    );

    CREATE INDEX products_category_idx ON products (category_id);
    CREATE INDEX products_active_idx ON products (is_active) WHERE deleted_at IS NULL;
    CREATE INDEX products_low_stock_idx ON products (stock) WHERE deleted_at IS NULL AND is_active = TRUE;
    CREATE INDEX products_name_trgm_idx ON products USING GIN (lower(name) gin_trgm_ops);

    CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE SEQUENCE invoice_number_seq START WITH 1;

    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number VARCHAR(40) NOT NULL UNIQUE,
      cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      subtotal NUMERIC(14, 2) NOT NULL,
      total NUMERIC(14, 2) NOT NULL,
      payment_method VARCHAR(20) NOT NULL,
      amount_paid NUMERIC(14, 2) NOT NULL,
      change_due NUMERIC(14, 2) NOT NULL DEFAULT 0,
      notes VARCHAR(500),
      client_reference UUID NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT transactions_subtotal_check CHECK (subtotal >= 0),
      CONSTRAINT transactions_total_check CHECK (total >= 0),
      CONSTRAINT transactions_amount_paid_check CHECK (amount_paid >= 0),
      CONSTRAINT transactions_change_due_check CHECK (change_due >= 0),
      CONSTRAINT transactions_payment_method_check CHECK (payment_method IN ('cash', 'qris', 'debit', 'transfer'))
    );

    CREATE INDEX transactions_created_at_idx ON transactions (created_at DESC);
    CREATE INDEX transactions_cashier_created_idx ON transactions (cashier_id, created_at DESC);

    CREATE TABLE transaction_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name VARCHAR(150) NOT NULL,
      unit VARCHAR(30) NOT NULL,
      quantity NUMERIC(14, 3) NOT NULL,
      unit_price NUMERIC(14, 2) NOT NULL,
      unit_cost NUMERIC(14, 2) NOT NULL,
      line_total NUMERIC(14, 2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT transaction_items_quantity_check CHECK (quantity > 0),
      CONSTRAINT transaction_items_unit_price_check CHECK (unit_price >= 0),
      CONSTRAINT transaction_items_unit_cost_check CHECK (unit_cost >= 0),
      CONSTRAINT transaction_items_line_total_check CHECK (line_total >= 0)
    );

    CREATE INDEX transaction_items_transaction_idx ON transaction_items (transaction_id);
    CREATE INDEX transaction_items_product_idx ON transaction_items (product_id);

    CREATE TABLE stock_movements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
      movement_type VARCHAR(20) NOT NULL,
      quantity NUMERIC(14, 3) NOT NULL,
      previous_stock NUMERIC(14, 3) NOT NULL,
      current_stock NUMERIC(14, 3) NOT NULL,
      notes VARCHAR(500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT stock_movements_type_check CHECK (movement_type IN ('in', 'out', 'adjustment', 'sale')),
      CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0),
      CONSTRAINT stock_movements_previous_stock_check CHECK (previous_stock >= 0),
      CONSTRAINT stock_movements_current_stock_check CHECK (current_stock >= 0)
    );

    CREATE INDEX stock_movements_product_created_idx ON stock_movements (product_id, created_at DESC);
    CREATE INDEX stock_movements_created_at_idx ON stock_movements (created_at DESC);
    CREATE INDEX stock_movements_user_idx ON stock_movements (user_id);
    CREATE INDEX stock_movements_transaction_idx ON stock_movements (transaction_id);

    CREATE TABLE store_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      store_name VARCHAR(120) NOT NULL DEFAULT 'Toko Saya',
      store_address TEXT,
      store_phone VARCHAR(50),
      receipt_footer TEXT DEFAULT 'Terima kasih telah berbelanja.',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT store_settings_singleton_check CHECK (id = 1)
    );

    INSERT INTO store_settings (id, store_name, receipt_footer)
    VALUES (1, 'Toko Saya', 'Terima kasih telah berbelanja.')
    ON CONFLICT (id) DO NOTHING;

    CREATE TRIGGER store_settings_set_updated_at
    BEFORE UPDATE ON store_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `,
};

const cashSessionsSchema: Migration = {
  name: "002_cash_sessions",
  sql: `
    CREATE TABLE cash_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status VARCHAR(10) NOT NULL DEFAULT 'open',
      opening_cash NUMERIC(14, 2) NOT NULL,
      counted_cash NUMERIC(14, 2),
      expected_cash NUMERIC(14, 2),
      difference NUMERIC(14, 2),
      opening_notes VARCHAR(500),
      closing_notes VARCHAR(500),
      opened_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      closed_by UUID REFERENCES users(id) ON DELETE RESTRICT,
      opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      CONSTRAINT cash_sessions_status_check CHECK (status IN ('open', 'closed')),
      CONSTRAINT cash_sessions_opening_cash_check CHECK (opening_cash >= 0),
      CONSTRAINT cash_sessions_counted_cash_check CHECK (counted_cash IS NULL OR counted_cash >= 0),
      CONSTRAINT cash_sessions_expected_cash_check CHECK (expected_cash IS NULL OR expected_cash >= 0),
      CONSTRAINT cash_sessions_difference_check CHECK (
        difference IS NULL
        OR difference = counted_cash - expected_cash
      ),
      CONSTRAINT cash_sessions_closed_fields_check CHECK (
        (
          status = 'open'
          AND closed_at IS NULL
          AND closed_by IS NULL
          AND counted_cash IS NULL
          AND expected_cash IS NULL
          AND difference IS NULL
        )
        OR (
          status = 'closed'
          AND closed_at IS NOT NULL
          AND closed_by IS NOT NULL
          AND counted_cash IS NOT NULL
          AND expected_cash IS NOT NULL
          AND difference IS NOT NULL
          AND closed_at >= opened_at
        )
      ),
      CONSTRAINT cash_sessions_difference_note_check CHECK (
        difference IS NULL
        OR difference = 0
        OR (closing_notes IS NOT NULL AND char_length(btrim(closing_notes)) > 0)
      )
    );

    CREATE UNIQUE INDEX cash_sessions_one_open_idx ON cash_sessions (status) WHERE status = 'open';
    CREATE INDEX cash_sessions_opened_at_idx ON cash_sessions (opened_at DESC);

    ALTER TABLE transactions
      ADD COLUMN cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE RESTRICT;

    CREATE INDEX transactions_cash_session_idx
      ON transactions (cash_session_id)
      WHERE cash_session_id IS NOT NULL;
  `,
};

export const migrations: Migration[] = [initialSchema, cashSessionsSchema];
