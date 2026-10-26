# FMS: Finance Management System
**Sistem Pengurusan Kewangan Ajib Business**

Sistem kewangan untuk perniagaan keluarga dengan **2 pengguna**:

| Peranan | Siapa | Log masuk (development) |
|---|---|---|
| **Pengurus** (Manager) | Ayah | `pengurus` / `Pengurus@123` |
| **Kerani** (Clerk) | Anak | `kerani` / `Kerani@123` |

Tukar kata laluan selepas log masuk pertama (Akaun saya). Untuk production, tetapkan `App__ManagerPassword` dan `App__ClerkPassword` sebelum aplikasi dijalankan kali pertama.

**Modul use case diagram:** Laporan Jualan, Invois pembekal (dengan Pembekal), Penyata Untung Rugi (lihat dan cetak), Pekerja, Bil Utiliti, Tuntutan Kewangan (mohon → lulus → bayar) dan Gaji Pekerja dengan slip gaji. Lihat bahagian 9.

**Kewangan:** log masuk, ringkasan, perniagaan, duit masuk / keluar, akaun tunai & bank,
pindah duit, ambilan keluarga, modal, pinjaman antara perniagaan, laporan, pengguna & peranan,
log perubahan.

**Jualan & pelanggan (CRM):** pelanggan, catatan & tindakan susulan, sebut harga → invois,
terima bayaran → resit, cetak A4 / PDF / resit kecil 80mm, hantar melalui WhatsApp,
senarai "orang hutang kita" di skrin utama.

| Bahagian | Teknologi |
|---|---|
| Backend | ASP.NET Core 8 Web API, EF Core 8, SQLite, JWT, BCrypt |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts |

---

## 1. Jalankan (development)

Keperluan: **.NET 8 SDK** dan **Node.js 20+**.

```bash
# Terminal 1 — backend (http://localhost:5080, Swagger di /swagger)
cd backend/Fms.Api
dotnet run

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Kali pertama backend dijalankan, fail `fms.db` dicipta dan data asas dimasukkan
(perniagaan, akaun, kategori). Dalam mod Development, data contoh 6 bulan juga dimasukkan,
termasuk 4 pelanggan, sebut harga, invois dan resit.

**Log masuk contoh (Development sahaja):**

| Pengguna | Kata laluan | Peranan |
|---|---|---|
| `pengurus` | `Pengurus@123` | Pengurus (ayah) |
| `kerani` | `Kerani@123` | Kerani (anak) |

Untuk mula semula dengan data kosong: padam `fms.db`, set `App:SeedDemoData` kepada `false`, jalankan semula.

**Sudah ada `fms.db` dari versi sebelum ini?** Tidak perlu padam. Semasa bermula, backend
menambah jadual jualan dan kolum baru secara automatik — data sedia ada kekal.

---

## 2. Deploy (production)

Satu aplikasi sahaja — frontend di-build terus ke `wwwroot` backend.

```bash
cd frontend && npm ci && npm run build      # output ke backend/Fms.Api/wwwroot
cd ../backend/Fms.Api
dotnet publish -c Release -o ../../publish
```

Tetapkan konfigurasi melalui environment variable (jangan commit `appsettings.Production.json`):

| Variable | Contoh / nota |
|---|---|
| `Jwt__Key` | Rentetan rawak **sekurang-kurangnya 32 aksara** |
| `App__ManagerPassword`, `App__ClerkPassword` | Kata laluan awal `pengurus` dan `kerani` (hanya digunakan semasa DB kosong). Tukar selepas log masuk. |
| `App__CompanyName` | Nama yang dicetak pada Penyata Untung Rugi dan Laporan Jualan (lalai: Ajib Business) |
| `App__UploadFolder` | Folder simpanan resit tuntutan (lalai `uploads`). Masukkan dalam backup. |
| `ConnectionStrings__Default` | `Data Source=/data/fms.db` — letak di folder yang di-backup |
| `App__TimeZone` | `Asia/Kuala_Lumpur` (default) |
| `App__LowBalanceThreshold` | `500` — akaun bawah nilai ini diberi amaran |
| `Documents__DefaultTaxRate` | `0` — tukar ke `6` / `8` jika berdaftar SST |

Jika di-host di bawah sub-folder (contoh `/fms/`), set `VITE_BASE_PATH=/fms/`
dalam `frontend/.env` sebelum `npm run build`.

**Backup:** cukup salin fail `.db` setiap hari (contoh: cron + rclone ke Google Drive).

---

## 3. Jualan & pelanggan

### Aliran

```
Pelanggan ──► Sebut harga ──(Tukar ke invois)──► Invois ──(Terima bayaran)──► Resit
                                                   │                           │
                                                   └── baki & status ◄─────────┘
                                                                               │
                                                        Rekod Duit Masuk ◄─────┘ (automatik)
```

- **Resit = Duit Masuk.** Setiap resit menjana satu rekod Duit Masuk (no. rujukan = no. resit),
  jadi baki akaun, untung dan laporan sentiasa selari. Rekod itu dikunci — untuk ubah,
  **batalkan resit** (rekod duit masuk ikut terbatal) dan buat semula.
- **Status invois** dikira sendiri: Belum bayar → Bayar sebahagian → Lunas. *Tertunggak* jika
  lepas tarikh akhir bayaran.
- **Jualan tunai:** semasa cipta invois, tanda "Pelanggan sudah bayar penuh sekarang" — invois
  dan resit dijana serentak.
- **Resit tanpa invois** (contoh deposit) dibenarkan.
- Invois yang ada resit aktif tidak boleh diubah / dibatalkan. Batal invois yang datang dari
  sebut harga akan membuka semula sebut harga itu.
- Nombor dokumen: `SH-2026-0001`, `INV-2026-0001`, `RS-2026-0001` (bermula semula setiap tahun).

### Cetak & PDF

Butang **Cetak / PDF** membuka halaman cetak. Tekan *Cetak*, kemudian:
- pilih pencetak biasa (A4), atau
- pilih **"Simpan sebagai PDF"** — nama fail ialah nombor dokumen.

**Resit kecil 80mm** (pencetak thermal kedai): buka resit → *Resit kecil 80mm* → Cetak.
Panjang kertas dikira ikut panjang resit. Dalam tetapan pencetak, set margin = Tiada / Minimum.

Nama, alamat, no. SSM, maklumat akaun bank dan nota kaki yang dicetak diambil dari
**Tetapan → Perniagaan** (setiap perniagaan boleh ada maklumat sendiri). Warna perniagaan
digunakan sebagai warna dokumen.

### WhatsApp

Butang WhatsApp membuka WhatsApp dengan mesej ringkas (jumlah, baki, tarikh akhir, cara bayaran)
ke nombor telefon pelanggan. Untuk hantar dokumen penuh, simpan sebagai PDF dahulu dan lampirkan.

### Tetapan dokumen (`appsettings.json` → `Documents`)

| Kunci | Lalai | Nota |
|---|---|---|
| `QuotationPrefix` / `InvoicePrefix` / `ReceiptPrefix` | `SH` / `INV` / `RS` | Awalan nombor dokumen |
| `TaxLabel` | `SST` | Label cukai pada dokumen |
| `DefaultTaxRate` | `0` | % cukai lalai untuk dokumen baru (boleh ubah setiap dokumen) |
| `QuotationValidDays` | `14` | Tempoh sah sebut harga |
| `PaymentTermDays` | `30` | Tempoh bayaran invois |
| `DefaultQuotationTerms` / `DefaultInvoiceTerms` | — | Terma lalai yang dicetak |

---

## 4. Pangkalan data

SQLite — satu fail sahaja, tiada server DB perlu dipasang.

**`database/schema.sql` ialah satu-satunya sumber struktur DB.** Fail ini dibenamkan ke dalam
backend dan dijalankan setiap kali aplikasi bermula (`Data/SchemaInitializer.cs`). Semua arahan
`IF NOT EXISTS`, jadi DB baru dicipta dan DB lama dikemas kini secara automatik.

| Fail | Isi |
|---|---|
| `fms.db` | Kosong + data asas (perniagaan, akaun, kategori, ahli keluarga, `pengurus` & `kerani`). **Guna ini untuk data sebenar.** |
| `fms-demo.db` | Sama + ~150 rekod kewangan (Mei–Okt 2026), pelanggan, sebut harga, invois, resit, pembekal & hutang, 2 pekerja, gaji, bil utiliti dan tuntutan |
| `schema.sql` | Struktur semua jadual |
| `seed.sql` | Data asas |
| `demo-data.sql` | Rekod contoh |

Cara guna: salin fail `.db` ke `backend/Fms.Api/` dan namakan `fms.db`
(atau tukar `ConnectionStrings:Default`). Kata laluan: `pengurus` / `Pengurus@123`, `kerani` / `Kerani@123`. Tukar segera.

```bash
sqlite3 fms.db < database/schema.sql
sqlite3 fms.db < database/seed.sql
sqlite3 fms.db < database/demo-data.sql   # pilihan
```

Untuk buka / semak data: [DB Browser for SQLite](https://sqlitebrowser.org/).

**Tambah kolum pada jadual sedia ada:** tambah dalam `schema.sql` (untuk DB baru) *dan* dalam
senarai `AddedColumns` dalam `Data/SchemaInitializer.cs` (untuk DB lama), serta dalam entiti /
`AppDbContext`.

---

## 5. Struktur

```
backend/Fms.Api/
  Domain/
    Entities.cs            Entiti kewangan
    SalesEntities.cs       Entiti jualan + DocumentMath (kiraan jumlah / cukai / status bayaran)
    Ledger.cs              ★ Kesan setiap jenis rekod kepada baki & untung
    TransactionRules.cs    ★ Medan wajib setiap jenis rekod
  Data/                    DbContext, SchemaInitializer, seeder
  Services/
    SalesService.cs        ★ Semua logik sebut harga / invois / resit / pelanggan
    ReportService.cs       Ringkasan & laporan
  Controllers/             Auth, Users, master data, Transactions, Reports, Sales
frontend/src/
  config/modules.ts          ★ Senarai modul → navigasi, laluan, akses ikut peranan
  config/transactionTypes.ts ★ Label & medan setiap jenis rekod (cermin TransactionRules.cs)
  config/sales.ts            Label status, kaedah bayaran, jenis aktiviti
  components/sales/          Borang dokumen, borang bayaran, dokumen boleh cetak
  lib/words.ts               Jumlah dalam perkataan (Bahasa Melayu)
  pages/sales/               Pelanggan, sebut harga, invois, resit, halaman cetak
```

### Peraturan duit (Domain/Ledger.cs)

| Jenis | Baki akaun | Dikira untung? |
|---|---|---|
| Duit Masuk (termasuk resit) | + akaun | Ya |
| Duit Keluar | − akaun | Ya |
| Pindah Duit | − akaun asal, + akaun destinasi | Tidak |
| Ambilan Keluarga | − akaun | Tidak (dilapor berasingan) |
| Modal Masuk | + akaun | Tidak |
| Pinjaman Antara Perniagaan | − akaun asal, + akaun destinasi | Tidak (baki hutang dijejak) |

### Peranan

| Tindakan | Pengurus (ayah) | Kerani (anak) |
|---|---|---|
| Ringkasan, Penyata Untung Rugi, Laporan Jualan (lihat & cetak) | ✓ | ✓ |
| Rekod duit masuk / keluar, pindah, ambilan, modal | ✓ | ✓ |
| Pelanggan, sebut harga, invois, resit, pembekal & hutang | ✓ | ✓ |
| Pekerja, gaji & slip gaji, bil utiliti | ✓ | ✓ |
| Mohon tuntutan kewangan | — | ✓ |
| **Lulus / tolak tuntutan** | ✓ | — |
| Bayar balik tuntutan yang diluluskan | ✓ | ✓ |
| Padam rekod kewangan (soft delete) | ✓ | — |
| Tetapan, pengguna, log perubahan | ✓ | — |

Setiap tambah / ubah / padam / batal dicatat dalam log perubahan.

---

## 6. Nota teknikal

- **Tukar ke MySQL / SQL Server:** ganti pakej `Microsoft.EntityFrameworkCore.Sqlite`,
  `UseSqlite(...)` dalam `Program.cs`, dan tukar `SchemaInitializer` kepada EF migrations.
  Jumlah duit dikira dalam memori (SQLite tak sokong `SUM(decimal)`), jadi kod laporan tidak perlu diubah.
- Jika ubah `Domain/TransactionRules.cs`, ubah juga `frontend/src/config/transactionTypes.ts`.
- Nombor dokumen dijana dalam `SalesService` dengan kunci (lock) — sesuai untuk satu instance aplikasi.

## 7. Fasa seterusnya

- Pembekal & hutang kita (payable), gambar resit belanja, kelulusan belanja.
- Stok kedai runcit, plot & tuaian nenas, blok & timbangan sawit.
- Hantar PDF terus melalui e-mel / WhatsApp Business API.

## 8. Pembekal & hutang kita

Menu **Pembekal, hutang & bil** boleh digunakan oleh Pengurus dan Kerani.

- **Bil pembekal**: rekod barang atau servis yang diambil dahulu dan dibayar kemudian. Bil itu belum dikira belanja. Setiap bayaran mencipta rekod **Duit Keluar** dengan kategori bil, jadi dikira belanja pada tarikh bayar.
- **Pinjaman**: jika duit masuk ke akaun, rekod **Pinjaman Diterima** dicipta (menambah baki akaun, bukan pendapatan). Bayaran pokok dicipta sebagai **Bayar Balik Pinjaman** (bukan belanja). **Faedah** pula ialah Duit Keluar dan dikira belanja.
- Setiap bayaran menghasilkan **baucar bayaran** (BB-YYYY-NNNN) yang boleh dicetak atau disimpan sebagai PDF.
- Rekod duit yang dijana dikunci dalam Senarai rekod. Untuk membetulkan, batalkan bayaran dalam menu Hutang kita.
- Ringkasan menunjukkan kad **Kita hutang orang**, termasuk hutang yang lewat dan yang perlu dibayar dalam 30 hari.
- Pangkalan data lama dinaik taraf secara automatik semasa aplikasi dimulakan. Jadual Suppliers, Payables dan PayablePayments ditambah.

## 9. Modul FMS (use case diagram)

| Use case | Pelakon | Skrin |
|---|---|---|
| Manage Sales Report | Kerani | **Laporan Jualan** (`/laporan-jualan`): ikut hari / bulan, kategori, perniagaan, akaun. Boleh dicetak. Jualan direkod melalui Rekod baru, Invois atau Resit. |
| Manage Invoices «include» Manage Supplier | Kerani | **Hutang kita → Bil pembekal** dan **Pembekal** (`/hutang`, `/pembekal`). Invois jualan kepada pelanggan ada di **Invois**. |
| View Profit & Loss Statement «extend» Print | Kerani, Pengurus | **Penyata Untung Rugi** (`/penyata-untung-rugi`): semua atau satu perniagaan, ikut bulan, butang **Cetak / Simpan PDF** |
| Manage Employee | Kerani, Pengurus | **Pekerja** (`/pekerja`) |
| Manage Employee Wages | Kerani | **Gaji pekerja** (`/gaji`): gaji bulanan atau harian, elaun, lebih masa, potongan dan **slip gaji** (SG-YYYY-NNNN) |
| Manage Utility Expenses | Kerani | **Bil utiliti** (`/bil-utiliti`): elektrik, air, internet, telefon, sewa, gas (BU-YYYY-NNNN) |
| Manage Financial Claim Request | Kerani | **Tuntutan kewangan** (`/tuntutan`): mohon, lampir resit (gambar/PDF ≤ 5 MB), ubah atau padam semasa menunggu |
| Approve Financial Claim «include» View Financial Claim | Pengurus | **Tuntutan kewangan**: lihat semua tuntutan dan resit, kemudian **Lulus** atau **Tolak** (sebab wajib) |

### Aliran duit
- **Gaji** → Duit Keluar sebanyak *gaji bersih* (pokok + elaun + lebih masa − potongan). Batal rekod gaji membuang Duit Keluar itu.
- **Bil utiliti** → belum dikira belanja sehingga **dibayar**. Bila dibayar, Duit Keluar dicipta. *Batal bayaran* mengembalikan bil kepada belum bayar.
- **Tuntutan** → *Menunggu* → *Diluluskan* / *Ditolak* → *Dibayar* (Duit Keluar dicipta dengan kategori tuntutan).
- Semua rekod yang dijana dikunci dalam Senarai rekod dan perlu dibetulkan melalui modul asal.

### Penyata Untung Rugi
```
Hasil          = Duit Masuk ikut kategori (jualan, sewa, ...)
Perbelanjaan   = Duit Keluar ikut kategori (stok, baja, gaji, bil utiliti, tuntutan, bil pembekal, faedah ...)
Untung bersih  = Hasil − Perbelanjaan
```
Ambilan keluarga, modal masuk dan pinjaman (pokok) ditunjuk berasingan dan tidak dikira. Kiraan ada dalam `Services/StatementService.cs`.

### Kategori baru (umum, untuk semua perniagaan)
`Gaji & upah pekerja`, `Bil utiliti`, `Tuntutan: minyak, tol & perjalanan`, `Faedah & caj pinjaman`. Kategori khusus perniagaan (contoh *Elektrik*, *Upah pekerja*) dipilih dahulu jika ada.
