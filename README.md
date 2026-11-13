# KASIR — Pengelolaan Produk, Stok, Sesi Kas & Kasir

Aplikasi web satu toko untuk mengelola produk, kategori, stok, transaksi penjualan, sesi kas, dan akun pegawai. Terdiri dari dua peran:

- **Owner** — mengelola katalog, stok, transaksi, sesi kas, pegawai, pengaturan toko, dan gambar produk.
- **Kasir** — membuka/menutup kas, memproses pembayaran, mencetak/melihat struk, dan melihat riwayat transaksinya sendiri.

Semua data disimpan di **Neon PostgreSQL**. Tidak ada data dummy atau penyimpanan lokal sebagai sumber utama. Setiap perubahan stok dan transaksi divalidasi di backend dan dijalankan dalam transaksi database. Aplikasi siap dijalankan di Vercel (fungsi serverless + Vercel Blob).

---

## Fitur Utama

- Setup pertama kali: membuat akun owner dan identitas toko lewat `/setup` (tanpa akun bawaan).
- Login aman dengan cookie `httpOnly`, sesi 12 jam, pembatasan percobaan login.
- RBAC: kasir tidak dapat mengakses halaman maupun API pengelolaan.
- Manajemen kategori dan produk, termasuk soft-delete produk agar riwayat transaksi tetap utuh.
- Stok masuk/keluar dengan pencatatan `stock_movements` dan penolakan stok negatif.
- **Sesi kas buka/tutup toko**: kasir mencatat uang awal laci, sistem menghitung uang laci seharusnya, lalu kasir menghitung fisik uang saat tutup kas. Selisih wajib dijelaskan.
- Checkout atomik: penguncian baris produk, pengurangan stok, nomor invoice berurutan, dan snapshot harga/nama produk.
- Checkout diblokir selama kas belum dibuka atau sudah ditutup.
- Idempotensi checkout melalui `clientReference` untuk mencegah transaksi ganda.
- Real-time sync dengan SSE pada server biasa, dan polling otomatis pada Vercel/serverless.
- Dashboard owner: ringkasan penjualan, produk terlaris, stok menipis, dan transaksi terbaru.
- Riwayat transaksi owner dan riwayat pribadi kasir.
- Riwayat dan audit sesi kas untuk owner.
- Upload gambar produk (khusus owner) ke folder lokal `uploads/` atau **Vercel Blob** saat deploy.
- Struk ramah printer thermal 80 mm, termasuk tampilan print-only.
- UI responsif untuk desktop, tablet, dan ponsel; seluruh teks antarmuka berbahasa Indonesia.

---

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Backend | Node.js, Express, TypeScript |
| Database | Neon PostgreSQL, driver `pg` |
| Frontend | React 18, Vite, React Router, TanStack Query |
| Auth | JWT di cookie `httpOnly`, bcrypt |
| Realtime | Server-Sent Events (lokal/VPS), polling 12 detik (Vercel) |
| Validasi | Zod |
| Upload | Multer (maks. 5 MB), Vercel Blob atau folder lokal |
| Deploy | Vercel Functions + Vercel Blob |

---

## Prasyarat

- Node.js 20 atau lebih baru
- npm 10 atau lebih baru
- Akun [Neon](https://neon.tech) dan database PostgreSQL
- Akun [Vercel](https://vercel.com) (untuk deployment)
- Vercel Blob (untuk upload gambar di production)

---

## 1. Menyiapkan Database Neon

1. Buat project baru di Neon, lalu buat database (misalnya `neondb`).
2. Buka **Connection Details** dan salin **Pooled connection**.
3. Pastikan connection string memakai SSL, misalnya:

   ```text
   postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```

> Aplikasi ini tidak membutuhkan extension khusus. Migrasi membuat tabel, indeks, constraint, dan sequence yang diperlukan secara otomatis.

---

## 2. Konfigurasi Environment

Salin `.env.example` menjadi `.env`, lalu isi nilainya:

```powershell
Copy-Item .env.example .env
```

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | Ya | Connection string Neon (disarankan pooled). |
| `JWT_SECRET` | Ya | Minimal 32 karakter acak. |
| `NODE_ENV` | Tidak | `development` (default), `production`, atau `test`. |
| `PORT` | Tidak | Port API/server, default `4000`. |
| `STORE_TIMEZONE` | Tidak | Zona waktu laporan, default `Asia/Jakarta`. |
| `RUN_MIGRATIONS_ON_START` | Tidak | Default `true`. Set `false` bila migrasi dijalankan manual. |
| `REALTIME_MODE` | Tidak | `auto` (default), `sse`, atau `polling`. |
| `UPLOAD_DIR` | Tidak | Folder upload lokal; default `uploads/` di root proyek. |
| `BLOB_READ_WRITE_TOKEN` | Untuk Vercel | Token Vercel Blob agar upload gambar tersimpan permanen. |

Membuat `JWT_SECRET` acak:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Jangan pernah commit file `.env`. File tersebut sudah masuk `.gitignore`.

---

## 3. Instalasi & Migrasi

```powershell
npm install
npm run db:migrate
```

Migrasi juga berjalan otomatis saat server dimulai jika `RUN_MIGRATIONS_ON_START=true`.

Migrasi dijalankan dalam satu transaksi dengan `pg_advisory_xact_lock`, sehingga aman untuk Neon/PgBouncer dan beberapa instance serverless yang melakukan cold start bersamaan. Riwayat migrasi tersimpan di tabel `schema_migrations`.

---

## 4. Menjalankan Aplikasi

### Development

```powershell
npm run dev
```

- API: <http://localhost:4000>
- Frontend: <http://localhost:5173> (proxy `/api` dan `/uploads` ke port 4000)

### Produksi Lokal / VPS

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

Build frontend masuk ke `client/dist`, build server ke `server/dist`. Pada mode produksi, Express menyajikan frontend dan API dari origin yang sama.

### Setup Pertama Kali

Buka aplikasi, lalu ikuti halaman `/setup` untuk membuat:

1. Nama toko
2. Nama owner
3. Email dan password owner

Setelah owner dibuat, halaman setup tidak dapat dijalankan lagi. Akun kasir dibuat oleh owner melalui menu **Pegawai**.

---

## Peran & Hak Akses

| Kemampuan | Owner | Kasir |
| --- | --- | --- |
| Dashboard penjualan | Ya | Tidak |
| Melihat katalog produk | Ya | Ya (produk aktif) |
| Membuat/mengubah/menghapus produk | Ya | Tidak |
| Mengelola kategori | Ya | Tidak |
| Menyesuaikan stok & melihat riwayat stok | Ya | Tidak |
| Membuka & menutup sesi kas | Tidak | Ya |
| Melihat riwayat semua sesi kas | Ya | Tidak |
| Melakukan checkout | Tidak | Ya |
| Melihat semua transaksi | Ya | Tidak |
| Melihat riwayat transaksi sendiri | Ya | Ya |
| Mengelola akun pegawai | Ya | Tidak |
| Mengubah pengaturan toko | Ya | Tidak |
| Upload gambar produk | Ya | Tidak |

Pembatasan diterapkan di backend melalui `requireAuth`, `requireOwner`, dan `requireCashier`, bukan hanya di antarmuka.

---

## Alur Sesi Kas (Buka & Tutup Toko)

Sesi kas bersifat **satu toko, satu sesi aktif**. Sesi dibuka dan ditutup oleh kasir; owner hanya dapat melihat riwayat.

### 1. Buka kas

Kasir membuka halaman **Kasir**, lalu mengisi:

- **Uang awal di laci** — total uang tunai yang sudah ada sebelum transaksi pertama.
- **Catatan pembukaan** — opsional.

Selama belum ada sesi aktif:

- Katalog dan keranjang tidak ditampilkan.
- Checkout ditolak server dengan kode `CASH_SESSION_CLOSED`.

### 2. Selama toko buka

Semua transaksi otomatis terhubung ke sesi kas aktif (`transactions.cash_session_id`). Halaman kasir menampilkan bar sesi:

- Kas awal
- Penjualan tunai
- Estimasi uang laci

**Rumus uang laci seharusnya:**

```text
Uang laci seharusnya = kas awal + seluruh penjualan tunai
```

Penjualan QRIS, debit, dan transfer tetap tercatat sebagai transaksi, tetapi **tidak** menambah uang tunai di laci.

### 3. Tutup kas

Saat toko tutup, kasir menekan **Tutup Kas**, lalu:

1. Menghitung fisik uang di laci.
2. Memasukkan jumlah **uang tunai hasil hitung laci**.
3. Sistem menampilkan selisih:

   ```text
   Selisih = uang dihitung − uang laci seharusnya
   ```

4. Jika selisih ≠ 0, **catatan penjelasan wajib diisi**. Tanpa catatan, server menolak penutupan dengan kode `CASH_DIFFERENCE_NOTE_REQUIRED`.
5. Setelah kas ditutup, transaksi baru diblokir sampai kas dibuka kembali.

Contoh:

| Komponen | Nominal |
| --- | ---: |
| Kas awal | Rp200.000 |
| Penjualan tunai | Rp30.000 |
| Uang laci seharusnya | Rp230.000 |
| Uang hasil hitung | Rp225.000 |
| **Selisih** | **−Rp5.000** |
| Catatan | Wajib, misalnya "salah kembalian" |

### 4. Audit owner

Owner membuka menu **Sesi Kas** untuk melihat:

- Sesi yang sedang berjalan.
- Kas awal, penjualan tunai, uang seharusnya, uang dihitung, dan selisih.
- Nama kasir yang membuka/menutup.
- Catatan selisih dan total selisih seluruh sesi.

### Konsistensi & konkurensi

- Checkout memakai `SELECT ... FOR SHARE` pada sesi aktif.
- Penutupan kas memakai `SELECT ... FOR UPDATE`.
- Penutupan menunggu checkout yang sedang berjalan, dan checkout baru tidak dapat dimulai setelah status sesi berubah menjadi `closed`.
- Indeks unik parsial `cash_sessions_one_open_idx` mencegah dua sesi aktif terbuka bersamaan.

---

## Alur Checkout & Konsistensi Data

1. Kasir mengirim item, jumlah, uang diterima, dan `clientReference` unik.
2. Server memulai transaksi database, memastikan ada sesi kas aktif, lalu mengunci baris produk (`SELECT ... FOR UPDATE`).
3. Produk yang tidak aktif, sudah dihapus, atau stoknya kurang akan ditolak.
4. Nomor invoice diambil dari sequence database.
5. Stok dikurangi, transaksi dan snapshot item disimpan, lalu `stock_movements` dicatat.
6. Bila `clientReference` yang sama dikirim ulang, server mengembalikan transaksi yang sudah ada tanpa mengurangi stok lagi.
7. Permintaan bersamaan untuk produk yang sama diproses berurutan sehingga stok tidak bisa menjadi negatif.

Produk memakai **soft delete** (`deleted_at`) agar produk yang sudah pernah terjual tetap dapat ditampilkan pada riwayat transaksi.

---

## Upload Gambar

- Endpoint upload hanya dapat diakses owner.
- Format gambar divalidasi; ukuran maksimum 5 MB.
- File diproses di memori (`multer.memoryStorage()`), sehingga kompatibel dengan filesystem serverless yang read-only.

### Lokal / VPS

- File ditulis ke folder `uploads/` dan disajikan melalui `/uploads/...`.
- Folder `uploads/` harus persisten (volume/disk) dan ikut di-backup.
- Untuk produksi multi-instance, gunakan object storage bersama.

### Vercel

- Sambungkan **Vercel Blob** ke project, lalu set `BLOB_READ_WRITE_TOKEN`.
- File diunggah ke Blob dan URL publiknya disimpan pada produk.
- Jika token belum diisi, endpoint mengembalikan `503` dengan kode `UPLOAD_STORAGE_UNAVAILABLE` — bukan menyimpan file ke filesystem sementara.
- Folder `uploads/` lokal tidak dipakai dan tidak persisten di Vercel.

---

## Struk 80 mm

Struk dirancang untuk printer thermal 80 mm:

- Lebar konten disesuaikan agar tidak terpotong.
- Hanya area struk yang dicetak; elemen aplikasi lain disembunyikan lewat CSS `@media print`.
- Gunakan dialog print browser dan pilih printer thermal, ukuran kertas 80 mm, margin minimum.
- Nama toko, alamat, nomor invoice, kasir, item, total, pembayaran, kembalian, dan footer diambil dari data transaksi.
- Cetak struk tersedia langsung setelah pembayaran dan dari riwayat transaksi.

---

## Realtime (SSE & Polling)

Frontend memperbarui data otomatis melalui dua mode:

| Mode | Kapan dipakai | Perilaku |
| --- | --- | --- |
| `sse` | Server biasa/VPS, `REALTIME_MODE=sse` | Berlangganan `/api/events`; server mengirim event setelah perubahan produk, stok, transaksi, atau sesi kas. |
| `polling` | Vercel/serverless, `REALTIME_MODE=polling` | React Query melakukan invalidasi cache setiap 12 detik. Indikator menampilkan **Sinkron berkala**. |

Pada Vercel, mode `auto` otomatis memilih polling karena koneksi SSE tidak cocok untuk fungsi serverless. Endpoint `/api/events` tetap mengembalikan `503` dengan kode `SSE_UNAVAILABLE` jika SSE dinonaktifkan.

**Catatan skala SSE:** implementasi SSE bersifat in-memory dan dirancang untuk **satu instance server**. Bila aplikasi dijalankan di beberapa instance:

- Gunakan shared pub/sub (misalnya Redis) untuk menyebarkan event, atau
- Arahkan semua koneksi SSE ke satu instance dengan sticky session.

---

## Deploy ke Vercel

Aplikasi memakai satu project Vercel:

- **Frontend** — Vite build di `client/dist`, disajikan sebagai static asset/CDN.
- **Backend** — Express dibungkus sebagai Vercel Function melalui `api/index.ts`.
- **Database** — Neon PostgreSQL.
- **Upload** — Vercel Blob.

### 1. Siapkan database

Gunakan database Neon yang sama dengan data produksi. **Jangan** menjalankan reset/truncate pada database produksi.

Jalankan migrasi sebelum deploy pertama:

```powershell
$env:DATABASE_URL = "postgresql://...neon.tech/neondb?sslmode=require"
npm run db:migrate
```

Atau biarkan migrasi berjalan otomatis (lihat bagian berikut).

### 2. Import project ke Vercel

1. Push repository ke GitHub/GitLab/Bitbucket.
2. Di Vercel, pilih **Add New → Project**, lalu import repository.
3. Framework preset: **Vite**.
4. Build command: `npm run build:client`.
5. Output directory: `client/dist`.
6. Jangan mengubah Root Directory.

Konfigurasi tersebut sudah ditulis di `vercel.json`:

```json
{
  "framework": "vite",
  "buildCommand": "npm run build:client",
  "outputDirectory": "client/dist",
  "functions": {
    "api/index.ts": { "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" },
    { "source": "/:path*", "destination": "/index.html" }
  ]
}
```

- `/api/*` diarahkan ke fungsi Express `api/index.ts`.
- Path lain diarahkan ke SPA `index.html` agar React Router bekerja saat refresh.

### 3. Environment Variables di Vercel

Tambahkan di **Project → Settings → Environment Variables**:

| Variabel | Nilai |
| --- | --- |
| `DATABASE_URL` | Connection string Neon pooled. |
| `JWT_SECRET` | Secret acak minimal 32 karakter. |
| `NODE_ENV` | `production`. |
| `STORE_TIMEZONE` | `Asia/Jakarta` (atau zona toko). |
| `RUN_MIGRATIONS_ON_START` | `true` untuk deploy pertama; boleh `false` setelah migrasi stabil. |
| `REALTIME_MODE` | `auto` atau `polling`. |
| `BLOB_READ_WRITE_TOKEN` | Token dari Vercel Blob. |

Jangan mengisi `PORT`; Vercel mengatur port fungsi secara otomatis.

### 4. Aktifkan Vercel Blob

1. Buka **Storage → Create Database → Blob**.
2. Hubungkan Blob store ke project.
3. Salin `BLOB_READ_WRITE_TOKEN` ke Environment Variables (biasanya ditambahkan otomatis).
4. Redeploy.

Tanpa Blob, aplikasi tetap berjalan, tetapi upload gambar produk akan mengembalikan `503`.

### 5. Migrasi di Vercel (lazy migration)

Fungsi serverless tidak menjalankan `server/index.ts`, sehingga migrasi dijalankan secara **lazy** pada request `/api` pertama di setiap instance:

- `runMigrations()` dijalankan sekali per instance dan hasilnya di-cache.
- Semua migrasi berjalan dalam satu transaksi dengan advisory lock.
- Beberapa cold start bersamaan tetap aman; instance lain menunggu lock dan melihat migrasi yang sudah diterapkan.
- Jika migrasi gagal, request mengembalikan error dan percobaan berikutnya akan mengulang.

Untuk kontrol penuh, jalankan `npm run db:migrate` secara manual dari mesin lokal/CI sebelum deploy, lalu set `RUN_MIGRATIONS_ON_START=false`.

### 6. Hal yang perlu diketahui di Vercel

- **SSE dinonaktifkan**; aplikasi otomatis memakai polling 12 detik.
- **Filesystem read-only**; gunakan Vercel Blob untuk gambar.
- **Upload diproses di memori**; batas 5 MB per gambar.
- **Fungsi memiliki batas durasi**; `maxDuration` diset 30 detik.
- **Cookie sesi `secure`** aktif karena `NODE_ENV=production`; akses harus melalui HTTPS (domain Vercel sudah HTTPS).
- **Neon pooled connection** disarankan karena fungsi serverless membuka/menutup koneksi secara dinamis.
- **Pool database dibatasi 3 koneksi per instance** untuk mengurangi tekanan ke Neon.
- **Jangan menyimpan file ke `uploads/`** di Vercel; file tersebut tidak persisten.

### 7. Checklist setelah deploy

1. Buka `https://domain-anda.vercel.app/api/health` — pastikan `database: connected` dan `realtime: polling`.
2. Buka halaman login dan masuk sebagai owner.
3. Cek menu **Produk**, **Transaksi**, dan **Sesi Kas**.
4. Upload satu gambar produk untuk memastikan Blob aktif.
5. Masuk sebagai kasir, buka kas, lakukan satu transaksi, lalu tutup kas.
6. Pastikan uang laci seharusnya = kas awal + penjualan tunai.
7. Cetak struk 80 mm dari transaksi.

---

## Skrip npm

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Menjalankan API dan frontend development sekaligus. |
| `npm run dev:server` | Menjalankan API dengan watch mode. |
| `npm run dev:client` | Menjalankan Vite dev server. |
| `npm run typecheck` | Type-check server dan client. |
| `npm run build` | Build frontend dan server untuk produksi. |
| `npm run build:client` | Build frontend saja (dipakai Vercel). |
| `npm run build:server` | Build server saja. |
| `npm start` | Menjalankan server produksi dari `server/dist`. |
| `npm run db:migrate` | Menjalankan migrasi database. |

---

## Struktur Proyek

```text
KASIR/
├── api/
│   └── index.ts             # Entry point Vercel Function (Express)
├── client/
│   ├── src/
│   │   ├── components/      # Komponen UI bersama + CashSession
│   │   ├── context/         # Auth & toast
│   │   ├── layouts/         # Layout owner, kasir, auth
│   │   ├── lib/             # API client, util, realtime
│   │   ├── pages/           # Halaman aplikasi + OwnerCashSessionsPage
│   │   ├── styles/          # CSS (base, komponen, owner, kasir, struk, print)
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── dist/                # Hasil build frontend
├── server/
│   ├── db/                  # Pool, migrasi, skema
│   ├── lib/                 # Auth, HTTP, realtime, store
│   ├── routes/              # Endpoint API + cash-sessions
│   ├── app.ts               # Express app + lazy migration Vercel
│   ├── config.ts            # Validasi environment
│   └── index.ts             # Entry point server lokal
├── uploads/                 # File gambar produk (hanya lokal/VPS)
├── .env.example
├── package.json
├── tsconfig.client.json
├── tsconfig.server.json
├── vercel.json
└── vite.config.ts
```

---

## Ringkasan API

Semua endpoint berada di bawah `/api`. Endpoint selain setup dan login memerlukan sesi aktif.

| Grup | Akses | Keterangan |
| --- | --- | --- |
| `/api/health` | Publik | Status server, koneksi database, dan mode realtime. |
| `/api/setup` | Publik | Status setup dan pembuatan owner pertama. |
| `/api/auth` | Publik/terautentikasi | Login, logout, sesi saat ini. |
| `/api/categories` | Owner/Kasir | Kasir dapat membaca; perubahan khusus owner. |
| `/api/products` | Owner/Kasir | Kasir hanya melihat produk aktif; perubahan khusus owner. |
| `/api/stock-movements` | Owner | Riwayat dan penyesuaian stok. |
| `/api/cash-sessions/current` | Owner/Kasir | Sesi aktif dan sesi terakhir yang ditutup. |
| `/api/cash-sessions/open` | Kasir | Membuka sesi kas dengan uang awal. |
| `/api/cash-sessions/:id/close` | Kasir | Menutup sesi dengan uang hitung dan catatan selisih. |
| `/api/cash-sessions` | Owner | Riwayat dan ringkasan seluruh sesi kas. |
| `/api/transactions` | Owner/Kasir | Checkout khusus kasir; owner melihat semua, kasir hanya miliknya. |
| `/api/dashboard` | Owner | Ringkasan penjualan dan stok. |
| `/api/users` | Owner | Pengelolaan akun pegawai. |
| `/api/settings` | Owner/Kasir | Kasir membaca identitas toko; perubahan khusus owner. |
| `/api/uploads` | Owner | Upload gambar produk (lokal atau Vercel Blob). |
| `/api/events` | Terautentikasi | Stream SSE; `503` saat mode polling. |

---

## Keamanan

- Password di-hash dengan bcrypt.
- Sesi JWT disimpan pada cookie `httpOnly` dan `SameSite`.
- Cookie `secure` aktif pada produksi (gunakan HTTPS).
- Helmet memasang header keamanan dan Content Security Policy.
- Rate limit global per IP serta rate limit khusus login.
- Semua input divalidasi dengan Zod di server.
- Query database memakai parameterized query.
- Operasi stok, checkout, dan tutup kas memakai transaksi dan row lock.
- Selisih kas wajib memiliki catatan; keputusan tidak hanya divalidasi di UI.
- RBAC diterapkan di backend untuk setiap endpoint sensitif.

---

## Troubleshooting

**Server gagal start: `DATABASE_URL wajib diisi`**
Pastikan file `.env` ada di root proyek dan `DATABASE_URL` terisi.

**`JWT_SECRET minimal 32 karakter`**
Ganti dengan secret acak yang lebih panjang.

**Peringatan SSL `sslmode=prefer/require` dari driver `pg`**
Ini peringatan kompatibilitas. Untuk perilaku verifikasi penuh saat ini, gunakan `sslmode=verify-full` pada connection string Neon.

**Koneksi Neon terputus saat idle**
Neon dapat menutup koneksi idle. Pool `pg` akan membuat koneksi baru pada permintaan berikutnya. Pastikan server tidak dihentikan paksa saat masih melayani permintaan.

**Gambar produk tidak tampil setelah deploy ke Vercel**
Pastikan Vercel Blob sudah terhubung dan `BLOB_READ_WRITE_TOKEN` terisi. Upload tanpa token akan mengembalikan `503 UPLOAD_STORAGE_UNAVAILABLE`.

**Gambar produk hilang setelah restart di VPS**
Folder `uploads/` harus persisten dan di-backup. Untuk multi-instance, gunakan object storage bersama.

**Perubahan tidak muncul di perangkat lain**
- Di Vercel, indikator akan menampilkan **Sinkron berkala** (polling 12 detik), bukan **Tersinkron**.
- Di server biasa, periksa koneksi SSE ke `/api/events` dan pastikan hanya satu instance atau gunakan pub/sub.
- Cek juga koneksi internet perangkat.

**Login berhasil di lokal tetapi gagal di Vercel**
Pastikan `NODE_ENV=production` dan akses melalui HTTPS. Cookie sesi memakai atribut `Secure` sehingga tidak dikirim melalui HTTP biasa.

**Checkout ditolak `CASH_SESSION_CLOSED`**
Kas belum dibuka atau sudah ditutup. Minta kasir membuka sesi kas terlebih dahulu di halaman **Kasir**.

**Tutup kas ditolak `CASH_DIFFERENCE_NOTE_REQUIRED`**
Uang hitung laci berbeda dari perhitungan sistem. Isi catatan penjelasan sebelum menutup kas.

**Migrasi gagal saat cold start Vercel**
Periksa connection string Neon, izin database, dan log fungsi. Untuk kontrol penuh, jalankan `npm run db:migrate` manual lalu set `RUN_MIGRATIONS_ON_START=false`.

**Build Vercel gagal**
Pastikan Node.js 20+, `package-lock.json` ikut di-commit, dan build command `npm run build:client` dengan output `client/dist`.

---

## Lisensi

Proyek privat untuk kebutuhan toko. Silakan sesuaikan sesuai kebutuhan internal.
