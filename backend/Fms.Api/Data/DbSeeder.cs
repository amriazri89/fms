using Fms.Api.Services;
using Fms.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Data;

/// <summary>
/// Data asas yang dimasukkan sekali sahaja bila pangkalan data masih kosong.
/// Semua nilai boleh diubah kemudian melalui skrin Tetapan.
/// </summary>
public static class DbSeeder
{
    private record BusinessSeed(string Name, string Color, string Description, string[] ExpenseCategories);

    private static readonly BusinessSeed[] Businesses =
    [
        new("Nenas", "#C98A12", "Jual nenas kepada pemborong",
            ["Benih / Tanaman", "Baja", "Racun", "Upah pekerja", "Pengangkutan", "Sewa tanah", "Jentera", "Penyelenggaraan", "Elektrik / Air"]),
        new("Sawit", "#1F6F4A", "Jual buah sawit ke kilang / peraih",
            ["Baja", "Upah tuai", "Upah pekerja", "Pengangkutan", "Penyelenggaraan", "Sewa tanah", "Peralatan"]),
        new("Kedai Runcit", "#2F6FB0", "Jual barang keperluan harian",
            ["Beli stok barang", "Elektrik", "Air", "Sewa kedai", "Gaji pekerja", "Pengangkutan", "Penyelenggaraan", "Pembungkusan"]),
        new("Ternakan", "#9A5B2E", "Ayam, kambing, lembu",
            ["Makanan ternakan", "Ubat & vaksin", "Upah pekerja", "Pengangkutan", "Penyelenggaraan kandang"]),
        new("Sewa", "#7A4FA0", "Sewa rumah, tanah atau kedai",
            ["Penyelenggaraan", "Cukai tanah / taksiran", "Insurans"]),
        new("Lain-lain", "#6B7280", "Projek kecil-kecilan", []),
    ];

    private static readonly (string Name, AccountType Type)[] AccountSeeds =
    [
        ("Tunai Kebun", AccountType.Cash),
        ("Tunai Kedai", AccountType.Cash),
        ("Maybank", AccountType.Bank),
        ("CIMB", AccountType.Bank),
        ("Bank Islam", AccountType.Bank),
        ("RHB", AccountType.Bank),
    ];

    public static async Task SeedAsync(AppDbContext db, AppOptions options, DocumentOptions documents, ILogger logger)
    {
        if (await db.Users.AnyAsync()) return;

        if (string.IsNullOrWhiteSpace(options.ManagerPassword) || string.IsNullOrWhiteSpace(options.ClerkPassword))
            throw new InvalidOperationException("App:ManagerPassword dan App:ClerkPassword mesti diisi untuk seed pertama.");

        // Dua pengguna sahaja: Pengurus (ayah) dan Kerani (anak)
        var admin = new User
        {
            Username = options.ManagerUsername.Trim().ToLowerInvariant(),
            FullName = options.ManagerFullName,
            Role = UserRole.Manager,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(options.ManagerPassword),
        };
        var clerk = new User
        {
            Username = options.ClerkUsername.Trim().ToLowerInvariant(),
            FullName = options.ClerkFullName,
            Role = UserRole.Clerk,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(options.ClerkPassword),
        };
        db.Users.AddRange(admin, clerk);

        var units = Businesses.Select((b, i) => new BusinessUnit
        {
            Name = b.Name, Color = b.Color, Description = b.Description, SortOrder = i + 1
        }).ToList();
        db.BusinessUnits.AddRange(units);
        await db.SaveChangesAsync();

        var cats = new List<Category>
        {
            new() { Name = "Jualan", Type = CategoryType.Income, SortOrder = 1 },
            new() { Name = "Sewa diterima", Type = CategoryType.Income, SortOrder = 2, BusinessUnitId = units.Single(u => u.Name == "Sewa").Id },
            new() { Name = "Lain-lain pendapatan", Type = CategoryType.Income, SortOrder = 99 },
            new() { Name = "Gaji & upah pekerja", Type = CategoryType.Expense, SortOrder = 80 },
            new() { Name = "Bil utiliti", Type = CategoryType.Expense, SortOrder = 81 },
            new() { Name = "Tuntutan: minyak, tol & perjalanan", Type = CategoryType.Expense, SortOrder = 82 },
            new() { Name = "Faedah & caj pinjaman", Type = CategoryType.Expense, SortOrder = 90 },
            new() { Name = "Lain-lain belanja", Type = CategoryType.Expense, SortOrder = 99 },
        };
        foreach (var (seed, unit) in Businesses.Zip(units))
        {
            cats.AddRange(seed.ExpenseCategories.Select((name, i) => new Category
            {
                Name = name, Type = CategoryType.Expense, BusinessUnitId = unit.Id, SortOrder = i + 1
            }));
        }
        db.Categories.AddRange(cats);

        var accounts = AccountSeeds.Select((a, i) => new Account { Name = a.Name, Type = a.Type, SortOrder = i + 1 }).ToList();
        db.Accounts.AddRange(accounts);

        var members = new List<FamilyMember>
        {
            new() { Name = "Ayah", Relationship = "Bapa" },
            new() { Name = "Mak", Relationship = "Ibu" },
        };
        db.FamilyMembers.AddRange(members);
        await db.SaveChangesAsync();

        logger.LogWarning("Pengguna '{Manager}' (Pengurus) dan '{Clerk}' (Kerani) dicipta. Sila tukar kata laluan selepas log masuk.", admin.Username, clerk.Username);

        if (options.SeedDemoData)
        {
            await SeedDemoAsync(db, options, admin, units, cats, accounts, members);
            await SeedSalesDemoAsync(db, options, documents, admin, clerk, units, cats, accounts);
        }
    }

    private static async Task SeedDemoAsync(AppDbContext db, AppOptions options, User admin,
        List<BusinessUnit> units, List<Category> cats, List<Account> accounts, List<FamilyMember> members)
    {
        Account Acc(string n) => accounts.Single(a => a.Name == n);
        BusinessUnit Bu(string n) => units.Single(u => u.Name == n);

        Acc("Maybank").OpeningBalance = 12000m;
        Acc("CIMB").OpeningBalance = 5000m;
        Acc("Tunai Kebun").OpeningBalance = 1500m;
        Acc("Tunai Kedai").OpeningBalance = 800m;

        var rnd = new Random(42);
        var today = Clock.Today(options.TimeZone);
        var start = new DateOnly(today.Year, today.Month, 1).AddMonths(-5);
        var sale = cats.Single(c => c.Name == "Jualan");
        var rentIn = cats.Single(c => c.Name == "Sewa diterima");
        var tx = new List<Transaction>();

        Category ExpCat(BusinessUnit u) =>
            cats.Where(c => c.Type == CategoryType.Expense && c.BusinessUnitId == u.Id).OrderBy(_ => rnd.Next()).First();

        void Add(DateOnly d, TransactionType t, decimal amt, BusinessUnit? u, Account a, Category? c = null,
            string? party = null, string? desc = null, Account? toA = null, BusinessUnit? toU = null, FamilyMember? m = null)
        {
            if (d > today) return;
            tx.Add(new Transaction
            {
                Date = d, Type = t, Amount = Math.Round(amt, 2), BusinessUnitId = u?.Id, AccountId = a.Id,
                CategoryId = c?.Id, Party = party, Description = desc, ToAccountId = toA?.Id,
                ToBusinessUnitId = toU?.Id, FamilyMemberId = m?.Id, CreatedById = admin.Id
            });
        }

        for (var month = start; month <= today; month = month.AddMonths(1))
        {
            DateOnly Day(int d) => new(month.Year, month.Month, Math.Min(d, DateTime.DaysInMonth(month.Year, month.Month)));

            // Nenas
            for (var i = 0; i < 3; i++)
            {
                var qty = rnd.Next(300, 700);
                Add(Day(5 + i * 9), TransactionType.Income, qty * 5m, Bu("Nenas"), Acc("Maybank"), sale, "Ah Chong Trading", $"{qty} biji nenas");
            }
            for (var i = 0; i < 4; i++)
                Add(Day(3 + i * 7), TransactionType.Expense, rnd.Next(250, 1200), Bu("Nenas"), Acc(i % 2 == 0 ? "Tunai Kebun" : "Maybank"), ExpCat(Bu("Nenas")));

            // Sawit
            for (var i = 0; i < 2; i++)
            {
                var kg = rnd.Next(2000, 4500);
                Add(Day(10 + i * 14), TransactionType.Income, kg * 0.9m, Bu("Sawit"), Acc("CIMB"), sale, "Kilang Sawit Maju", $"{kg} kg buah sawit");
            }
            for (var i = 0; i < 3; i++)
                Add(Day(6 + i * 8), TransactionType.Expense, rnd.Next(200, 900), Bu("Sawit"), Acc("Tunai Kebun"), ExpCat(Bu("Sawit")));

            // Kedai runcit: jualan mingguan
            for (var w = 0; w < 4; w++)
                Add(Day(7 + w * 7), TransactionType.Income, rnd.Next(1500, 2600), Bu("Kedai Runcit"), Acc("Tunai Kedai"), sale, null, "Jualan minggu " + (w + 1));
            Add(Day(2), TransactionType.Expense, rnd.Next(3500, 5000), Bu("Kedai Runcit"), Acc("Maybank"), cats.Single(c => c.Name == "Beli stok barang" ), "Pemborong Barang Runcit");
            Add(Day(15), TransactionType.Expense, rnd.Next(1200, 1800), Bu("Kedai Runcit"), Acc("Tunai Kedai"), cats.Single(c => c.Name == "Beli stok barang"));

            // Sewa
            Add(Day(1), TransactionType.Income, 1400m, Bu("Sewa"), Acc("Maybank"), rentIn, "Penyewa rumah", "Sewa rumah");
            if (month.Month % 3 == 0)
                Add(Day(12), TransactionType.Expense, rnd.Next(300, 700), Bu("Sewa"), Acc("Maybank"), ExpCat(Bu("Sewa")));

            // Pindah, ambilan
            Add(Day(4), TransactionType.Transfer, 3500m, null, Acc("Maybank"), toA: Acc("Tunai Kebun"), desc: "Keluarkan tunai untuk upah");
            Add(Day(25), TransactionType.Transfer, 4500m, null, Acc("Tunai Kedai"), toA: Acc("Maybank"), desc: "Deposit hasil jualan kedai");
            Add(Day(28), TransactionType.OwnerWithdrawal, 1500m, Bu("Nenas"), Acc("Maybank"), m: members[0], desc: "Belanja rumah");
            Add(Day(28), TransactionType.OwnerWithdrawal, 800m, Bu("Kedai Runcit"), Acc("Tunai Kedai"), m: members[1], desc: "Belanja dapur");
        }

        Add(start.AddDays(20), TransactionType.InternalLoan, 3000m, Bu("Nenas"), Acc("Maybank"), toA: Acc("Maybank"), toU: Bu("Kedai Runcit"), desc: "Kedai pinjam untuk stok raya");

        db.Transactions.AddRange(tx);
        await db.SaveChangesAsync();
    }

    /// <summary>Contoh pelanggan, sebut harga, invois dan resit (mod Development).</summary>
    private static async Task SeedSalesDemoAsync(AppDbContext db, AppOptions options, DocumentOptions documents, User admin, User clerk,
        List<BusinessUnit> units, List<Category> cats, List<Account> accounts)
    {
        var today = Clock.Today(options.TimeZone);
        BusinessUnit Bu(string n) => units.Single(u => u.Name == n);
        Account Acc(string n) => accounts.Single(a => a.Name == n);
        var sale = cats.Single(c => c.Name == "Jualan");

        // Maklumat cetakan contoh (rekaan)
        Bu("Nenas").LegalName = "Ladang Nenas Keluarga";
        Bu("Nenas").Address = "Lot 123, Jalan Kebun, Kampung Contoh, 81000 Kulai, Johor";
        Bu("Nenas").Phone = "012-345 6789";
        Bu("Nenas").PaymentInfo = "Maybank 1122 3344 5566 (Ladang Nenas Keluarga)";
        Bu("Nenas").DocumentFooter = "Terima kasih atas sokongan anda.";
        Bu("Sawit").LegalName = "Kebun Sawit Keluarga";
        Bu("Sawit").Address = "Lot 456, Kampung Contoh, 81000 Kulai, Johor";
        Bu("Sawit").PaymentInfo = "CIMB 8000 1234 5678 (Kebun Sawit Keluarga)";

        var customers = new List<Customer>
        {
            new() { Name = "Ah Chong Trading", ContactPerson = "Encik Ah Chong", Phone = "0127778899", Address = "No. 12, Jalan Pasar, 81000 Kulai, Johor", Tag = "Pemborong" },
            new() { Name = "Kedai Maju Jaya", ContactPerson = "Puan Rohani", Phone = "0198765432", Tag = "Peruncit" },
            new() { Name = "Kilang Sawit Maju Sdn Bhd", ContactPerson = "Encik Ravi", Phone = "075551234", Email = "akaun@kilangmaju.example", Address = "Lot 55, Kawasan Perindustrian, 86200 Simpang Renggam, Johor", RegistrationNo = "201901012345", Tag = "Kilang" },
            new() { Name = "Restoran Selera Kampung", ContactPerson = "Kak Yah", Phone = "0134567890", Tag = "Restoran" },
        };
        db.Customers.AddRange(customers);
        await db.SaveChangesAsync();
        Customer Cust(string n) => customers.Single(c => c.Name == n);

        var counters = new Dictionary<(DocumentType, int), int>();
        string Next(DocumentType type, DateOnly date)
        {
            var key = (type, date.Year);
            counters[key] = counters.GetValueOrDefault(key) + 1;
            return $"{DocumentNumbers.Prefix(documents, type)}-{date.Year}-{counters[key]:D4}";
        }

        static List<T> Lines<T>(params (string Desc, decimal Qty, string Unit, decimal Price)[] rows) where T : DocumentLine, new() =>
            rows.Select((r, i) => new T
            {
                SortOrder = i + 1, Description = r.Desc, Quantity = r.Qty, Unit = r.Unit, UnitPrice = r.Price,
                Amount = DocumentMath.LineAmount(r.Qty, r.Price),
            }).ToList();

        Quotation NewQuotation(Customer c, BusinessUnit b, DateOnly date, QuotationStatus status, string subject, List<QuotationItem> items)
        {
            var q = new Quotation
            {
                Number = Next(DocumentType.Quotation, date), CustomerId = c.Id, BusinessUnitId = b.Id, Date = date,
                ValidUntil = date.AddDays(documents.QuotationValidDays), Status = status, Subject = subject,
                Terms = documents.DefaultQuotationTerms, Items = items, CreatedById = admin.Id,
            };
            DocumentMath.ApplyTotals(q, q.Items);
            db.Quotations.Add(q);
            return q;
        }

        Invoice NewInvoice(Customer c, BusinessUnit b, DateOnly date, int termDays, string subject, List<InvoiceItem> items, int? quotationId = null)
        {
            var inv = new Invoice
            {
                Number = Next(DocumentType.Invoice, date), CustomerId = c.Id, BusinessUnitId = b.Id, Date = date,
                DueDate = date.AddDays(termDays), Status = InvoiceStatus.Unpaid, Subject = subject,
                Terms = documents.DefaultInvoiceTerms, Items = items, QuotationId = quotationId, CreatedById = admin.Id,
            };
            DocumentMath.ApplyTotals(inv, inv.Items);
            db.Invoices.Add(inv);
            return inv;
        }

        void Pay(Invoice? inv, Customer? c, BusinessUnit b, DateOnly date, decimal amount, PaymentMethod method, Account acc, string? desc = null)
        {
            var p = new Payment
            {
                Number = Next(DocumentType.Receipt, date), Date = date, Amount = amount, Method = method,
                BusinessUnitId = b.Id, CustomerId = c?.Id, ReceivedFrom = c?.Name ?? "Pelanggan tunai", Invoice = inv,
                AccountId = acc.Id, CategoryId = sale.Id, Description = desc, CreatedById = admin.Id,
            };
            p.Transaction = new Transaction
            {
                Date = date, Type = TransactionType.Income, Amount = amount, BusinessUnitId = b.Id, AccountId = acc.Id,
                CategoryId = sale.Id, Party = p.ReceivedFrom, Reference = p.Number,
                Description = inv is not null ? $"Bayaran {inv.Number}" : desc, CreatedById = admin.Id,
            };
            db.Payments.Add(p);
            if (inv is not null)
            {
                inv.Payments.Add(p);
                inv.AmountPaid = inv.Payments.Sum(x => x.Amount);
                inv.Status = DocumentMath.PaymentStatus(inv.Total, inv.AmountPaid);
            }
        }

        // 1) Sebut harga Ah Chong -> diterima -> invois -> bayar sebahagian
        var q1 = NewQuotation(Cust("Ah Chong Trading"), Bu("Nenas"), today.AddDays(-20), QuotationStatus.Converted, "Bekalan nenas Oktober",
            Lines<QuotationItem>(("Nenas MD2 Gred A", 1000, "biji", 2.80m), ("Nenas MD2 Gred B", 500, "biji", 1.80m), ("Kos penghantaran", 1, "trip", 80m)));
        await db.SaveChangesAsync();
        var inv1 = NewInvoice(Cust("Ah Chong Trading"), Bu("Nenas"), today.AddDays(-12), documents.PaymentTermDays, "Bekalan nenas Oktober",
            Lines<InvoiceItem>(("Nenas MD2 Gred A", 1000, "biji", 2.80m), ("Nenas MD2 Gred B", 500, "biji", 1.80m), ("Kos penghantaran", 1, "trip", 80m)), q1.Id);
        await db.SaveChangesAsync();
        q1.InvoiceId = inv1.Id;
        Pay(inv1, Cust("Ah Chong Trading"), Bu("Nenas"), today.AddDays(-5), 2000m, PaymentMethod.BankTransfer, Acc("Maybank"));

        // 2) Sebut harga restoran, menunggu jawapan
        NewQuotation(Cust("Restoran Selera Kampung"), Bu("Nenas"), today.AddDays(-3), QuotationStatus.Sent, "Nenas untuk menu minggu depan",
            Lines<QuotationItem>(("Nenas MD2 Gred A", 100, "biji", 3.00m), ("Hantar ke premis", 1, "trip", 20m)));

        // 3) Invois kilang sawit, tertunggak
        NewInvoice(Cust("Kilang Sawit Maju Sdn Bhd"), Bu("Sawit"), today.AddDays(-40), documents.PaymentTermDays, "Buah tandan segar (BTS)",
            Lines<InvoiceItem>(("Buah tandan segar (BTS)", 3200, "kg", 0.92m)));

        // 4) Jualan tunai Kedai Maju Jaya, terus lunas
        var inv4 = NewInvoice(Cust("Kedai Maju Jaya"), Bu("Nenas"), today.AddDays(-8), 0, "Nenas untuk dijual semula",
            Lines<InvoiceItem>(("Nenas MD2 Gred B", 200, "biji", 2.50m)));
        Pay(inv4, Cust("Kedai Maju Jaya"), Bu("Nenas"), today.AddDays(-8), inv4.Total, PaymentMethod.Cash, Acc("Tunai Kebun"));

        // 5) Resit tanpa invois (deposit)
        Pay(null, Cust("Restoran Selera Kampung"), Bu("Nenas"), today.AddDays(-2), 100m, PaymentMethod.DuitNow, Acc("Maybank"), "Deposit tempahan nenas");

        db.CustomerActivities.AddRange(
            new CustomerActivity { CustomerId = Cust("Ah Chong Trading").Id, Date = today.AddDays(-21), Type = CustomerActivityType.Call, Note = "Minta harga untuk 1,500 biji minggu depan.", CreatedById = admin.Id },
            new CustomerActivity { CustomerId = Cust("Ah Chong Trading").Id, Date = today.AddDays(-3), Type = CustomerActivityType.WhatsApp, Note = "Ingatkan baki bayaran invois.", FollowUpDate = today.AddDays(2), CreatedById = admin.Id },
            new CustomerActivity { CustomerId = Cust("Kilang Sawit Maju Sdn Bhd").Id, Date = today.AddDays(-9), Type = CustomerActivityType.Visit, Note = "Jumpa Encik Ravi, bayaran dijanji minggu ini.", FollowUpDate = today.AddDays(-1), CreatedById = admin.Id },
            new CustomerActivity { CustomerId = Cust("Restoran Selera Kampung").Id, Date = today.AddDays(-3), Type = CustomerActivityType.Note, Note = "Hantar sebut harga melalui WhatsApp.", FollowUpDate = today.AddDays(4), CreatedById = admin.Id });

        // ---------- Pembekal & hutang kita ----------
        var suppliers = new List<Supplier>
        {
            new() { Name = "Kedai Baja Tani Jaya", ContactPerson = "Encik Lim", Phone = "0127001122", Tag = "Baja & racun" },
            new() { Name = "Pemborong Barang Runcit", ContactPerson = "Encik Kumar", Phone = "0168889900", Tag = "Stok kedai" },
            new() { Name = "Lori Hantar Hamid", ContactPerson = "Hamid", Phone = "0193334455", Tag = "Pengangkutan" },
            new() { Name = "Bank Rakyat", Phone = "1300805454", Tag = "Bank", Notes = "Pinjaman peribadi-i untuk modal kebun" },
            new() { Name = "Pak Long", Phone = "0112223344", Tag = "Keluarga" },
        };
        db.Suppliers.AddRange(suppliers);
        await db.SaveChangesAsync();
        Supplier Sup(string n) => suppliers.Single(x => x.Name == n);
        Category Cat(string bu, string name) => cats.Single(c => c.BusinessUnitId == Bu(bu).Id && c.Name == name);
        var interestCat = cats.Single(c => c.Name == "Faedah & caj pinjaman");

        Payable NewPayable(PayableKind kind, Supplier sup, BusinessUnit b, Category? cat, DateOnly date, DateOnly due, string desc,
            decimal amount, string? reference = null, decimal? installment = null, Account? receivedInto = null)
        {
            var p = new Payable
            {
                Number = Next(DocumentType.Payable, date), Kind = kind, SupplierId = sup.Id, BusinessUnitId = b.Id, CategoryId = cat?.Id,
                Date = date, DueDate = due, Description = desc, SupplierReference = reference, Amount = amount,
                InstallmentAmount = installment, CreatedById = admin.Id,
            };
            if (receivedInto is not null)
            {
                p.ReceivedTransaction = new Transaction
                {
                    Date = date, Type = TransactionType.LoanIn, Amount = amount, BusinessUnitId = b.Id, AccountId = receivedInto.Id,
                    Party = sup.Name, Reference = p.Number, Description = $"Pinjaman: {desc}", CreatedById = admin.Id,
                };
            }
            db.Payables.Add(p);
            return p;
        }

        void PayPayable(Payable p, Supplier sup, DateOnly date, decimal principal, decimal interest, Account acc, PaymentMethod method)
        {
            var pay = new PayablePayment
            {
                Number = Next(DocumentType.PayablePayment, date), Date = date, Amount = principal, InterestAmount = interest,
                InterestCategoryId = interest > 0 ? interestCat.Id : null, AccountId = acc.Id, Method = method, CreatedById = admin.Id,
            };
            if (principal > 0)
            {
                pay.PrincipalTransaction = new Transaction
                {
                    Date = date, Type = p.Kind == PayableKind.Bill ? TransactionType.Expense : TransactionType.LoanRepayment,
                    Amount = principal, BusinessUnitId = p.BusinessUnitId, AccountId = acc.Id,
                    CategoryId = p.Kind == PayableKind.Bill ? p.CategoryId : null,
                    Party = sup.Name, Reference = pay.Number, Description = $"Bayar {p.Number}: {p.Description}", CreatedById = admin.Id,
                };
            }
            if (interest > 0)
            {
                pay.InterestTransaction = new Transaction
                {
                    Date = date, Type = TransactionType.Expense, Amount = interest, BusinessUnitId = p.BusinessUnitId, AccountId = acc.Id,
                    CategoryId = interestCat.Id, Party = sup.Name, Reference = pay.Number,
                    Description = $"Faedah / caj {p.Number}: {p.Description}", CreatedById = admin.Id,
                };
            }
            p.Payments.Add(pay);
            p.AmountPaid = p.Payments.Sum(x => x.Amount);
            p.Status = PayableMath.Status(p.Amount, p.AmountPaid);
        }

        // Bil lama, sudah lunas
        var b0 = NewPayable(PayableKind.Bill, Sup("Kedai Baja Tani Jaya"), Bu("Nenas"), Cat("Nenas", "Racun"),
            today.AddDays(-50), today.AddDays(-20), "Racun rumpai 10 tong", 420m, "BT-55120");
        PayPayable(b0, Sup("Kedai Baja Tani Jaya"), today.AddDays(-22), 420m, 0, Acc("Tunai Kebun"), PaymentMethod.Cash);

        // Bil baja, bayar sebahagian
        var b1 = NewPayable(PayableKind.Bill, Sup("Kedai Baja Tani Jaya"), Bu("Nenas"), Cat("Nenas", "Baja"),
            today.AddDays(-18), today.AddDays(12), "Baja NPK 30 beg", 1850m, "BT-56031");
        PayPayable(b1, Sup("Kedai Baja Tani Jaya"), today.AddDays(-6), 850m, 0, Acc("Maybank"), PaymentMethod.BankTransfer);

        // Bil stok kedai, sudah lewat
        NewPayable(PayableKind.Bill, Sup("Pemborong Barang Runcit"), Bu("Kedai Runcit"), Cat("Kedai Runcit", "Beli stok barang"),
            today.AddDays(-35), today.AddDays(-5), "Stok beras, minyak & gula (kredit 30 hari)", 2400m, "PBR-8812");

        // Bil lori, hampir tiba tarikh
        NewPayable(PayableKind.Bill, Sup("Lori Hantar Hamid"), Bu("Sawit"), Cat("Sawit", "Pengangkutan"),
            today.AddDays(-10), today.AddDays(4), "Hantar BTS ke kilang (4 trip)", 600m);

        // Pinjaman bank sebelum guna sistem (tiada rekod duit masuk) + satu ansuran
        var loan1 = NewPayable(PayableKind.Loan, Sup("Bank Rakyat"), Bu("Nenas"), null,
            today.AddDays(-200), today.AddYears(3), "Pinjaman modal kebun nenas", 30000m, "PP-001234567", 650m);
        PayPayable(loan1, Sup("Bank Rakyat"), today.AddDays(-7), 520m, 130m, Acc("Maybank"), PaymentMethod.BankTransfer);

        // Pinjaman keluarga, duit masuk ke Maybank
        NewPayable(PayableKind.Loan, Sup("Pak Long"), Bu("Ternakan"), null,
            today.AddDays(-25), today.AddDays(65), "Pinjam untuk beli anak kambing", 5000m, receivedInto: Acc("Maybank"));

        await db.SaveChangesAsync();

        // ---------- Pekerja, gaji, bil utiliti, tuntutan (modul FMS) ----------
        Category GlobalCat(string n) => cats.Single(c => c.Name == n && c.BusinessUnitId is null);
        Transaction Out(DateOnly date, decimal amount, BusinessUnit b, Account acc, Category cat, string? party, string reference, string desc) => new()
        {
            Date = date, Type = TransactionType.Expense, Amount = amount, BusinessUnitId = b.Id, AccountId = acc.Id, CategoryId = cat.Id,
            Party = party, Reference = reference, Description = desc, CreatedById = clerk.Id,
        };
        var monthStart = new DateOnly(today.Year, today.Month, 1);

        var ali = new Employee { Name = "Ali bin Ahmad", Position = "Pekerja kebun", BusinessUnitId = Bu("Nenas").Id, EmploymentType = EmploymentType.Monthly,
            BasicRate = 1700, JoinDate = monthStart.AddMonths(-14), Phone = "0191234567", BankName = "Maybank", BankAccountNo = "1122 3344 5566" };
        var siti = new Employee { Name = "Siti Aminah", Position = "Pembantu kedai", BusinessUnitId = Bu("Kedai Runcit").Id, EmploymentType = EmploymentType.Daily,
            BasicRate = 60, JoinDate = monthStart.AddMonths(-4), Phone = "0139876543" };
        db.Employees.AddRange(ali, siti);
        await db.SaveChangesAsync();

        // Gaji 3 bulan lepas (dibayar hari terakhir bulan)
        for (var m = monthStart.AddMonths(-3); m < monthStart; m = m.AddMonths(1))
        {
            var payDay = m.AddMonths(1).AddDays(-1);
            var period = $"{m.Year:D4}-{m.Month:D2}";
            var days = 20 + m.Month % 4;
            foreach (var (emp, basic, allowance, deduction, acc, method) in new[]
            {
                (ali, 1700m, 100m, 0m, Acc("Maybank"), PaymentMethod.BankTransfer),
                (siti, days * 60m, 0m, m.Month % 2 == 0 ? 100m : 0m, Acc("Tunai Kedai"), PaymentMethod.Cash),
            })
            {
                var w = new Wage
                {
                    Number = Next(DocumentType.Payslip, payDay), EmployeeId = emp.Id, PeriodMonth = period,
                    DaysWorked = emp.EmploymentType == EmploymentType.Daily ? days : null, BasicPay = basic, Allowance = allowance,
                    Deduction = deduction, NetPay = basic + allowance - deduction, PayDate = payDay, BusinessUnitId = emp.BusinessUnitId!.Value,
                    AccountId = acc.Id, CategoryId = GlobalCat("Gaji & upah pekerja").Id, Method = method,
                    Notes = deduction > 0 ? "Potongan = pendahuluan gaji" : null, CreatedById = clerk.Id,
                };
                w.Transaction = Out(payDay, w.NetPay, units.Single(u => u.Id == w.BusinessUnitId), acc, GlobalCat("Gaji & upah pekerja"),
                    emp.Name, w.Number, $"Gaji {emp.Name} ({period})");
                db.Wages.Add(w);
            }
        }

        // Bil utiliti Kedai Runcit: 3 bulan lepas dibayar, bulan ini belum
        for (var m = monthStart.AddMonths(-3); m <= monthStart; m = m.AddMonths(1))
        {
            var usage = m.AddMonths(-1);
            var period = $"{usage.Year:D4}-{usage.Month:D2}";
            var paid = m < monthStart;
            foreach (var (type, provider, accountNo, day, amount) in new[]
            {
                (UtilityType.Electricity, "TNB", "220012345678", 6, 210m + m.Month * 7),
                (UtilityType.Water, "Ranhill SAJ", "J0123456", 9, 48m + m.Month),
                (UtilityType.Internet, "Unifi", "unifi-889123", 2, 129m),
            })
            {
                var billDate = m.AddDays(day - 1);
                if (billDate > today) continue;
                var u = new UtilityBill
                {
                    Number = Next(DocumentType.UtilityBill, billDate), Type = type, Provider = provider, AccountNo = accountNo,
                    BusinessUnitId = Bu("Kedai Runcit").Id, CategoryId = GlobalCat("Bil utiliti").Id, BillDate = billDate,
                    DueDate = billDate.AddDays(21), PeriodMonth = period, Amount = amount, CreatedById = clerk.Id,
                };
                if (paid)
                {
                    u.Status = UtilityBillStatus.Paid;
                    u.PaidDate = billDate.AddDays(5);
                    u.PaidAccountId = Acc("Maybank").Id;
                    u.Method = PaymentMethod.BankTransfer;
                    u.Transaction = Out(u.PaidDate.Value, amount, Bu("Kedai Runcit"), Acc("Maybank"), GlobalCat("Bil utiliti"), provider, u.Number,
                        $"Bil {type} {period}");
                }
                db.UtilityBills.Add(u);
            }
        }

        // Tuntutan: dibayar, diluluskan, ditolak, menunggu
        var travel = GlobalCat("Tuntutan: minyak, tol & perjalanan");
        FinancialClaim Claim(int daysAgo, BusinessUnit b, Category cat, string desc, decimal amount, ClaimStatus status, Employee? emp = null, string? remark = null)
        {
            var date = today.AddDays(-daysAgo);
            var c = new FinancialClaim
            {
                Number = Next(DocumentType.Claim, date), RequestedById = clerk.Id, EmployeeId = emp?.Id, ClaimDate = date, BusinessUnitId = b.Id,
                CategoryId = cat.Id, Description = desc, Amount = amount, Status = status, ReviewRemark = remark,
                ReviewedById = status == ClaimStatus.Pending ? null : admin.Id,
                ReviewedAt = status == ClaimStatus.Pending ? null : DateTime.UtcNow.AddDays(-daysAgo + 1),
            };
            if (status == ClaimStatus.Paid)
            {
                c.PaidDate = date.AddDays(2);
                c.PaidAccountId = Acc("Tunai Kebun").Id;
                c.Method = PaymentMethod.Cash;
                c.Transaction = Out(c.PaidDate.Value, amount, b, Acc("Tunai Kebun"), cat, emp?.Name ?? clerk.FullName, c.Number, $"Tuntutan {c.Number}: {desc}");
            }
            db.Claims.Add(c);
            return c;
        }
        Claim(40, Bu("Nenas"), travel, "Minyak lori hantar nenas ke Johor Bahru", 85m, ClaimStatus.Paid);
        Claim(26, Bu("Sawit"), travel, "Tol & parkir ke kilang sawit", 23.60m, ClaimStatus.Paid, ali);
        Claim(15, Bu("Kedai Runcit"), cats.Single(c => c.Name == "Pembungkusan"), "Beg plastik kecemasan (kedai 99)", 32m, ClaimStatus.Approved, siti);
        Claim(11, Bu("Nenas"), travel, "Makan tengah hari dengan pembeli", 68m, ClaimStatus.Rejected, remark: "Belanja peribadi, bukan belanja perniagaan.");
        Claim(3, Bu("Nenas"), travel, "Minyak motosikal ke kebun (seminggu)", 45m, ClaimStatus.Pending);
        Claim(1, Bu("Kedai Runcit"), cats.Single(c => c.Name == "Penyelenggaraan" && c.BusinessUnitId == Bu("Kedai Runcit").Id),
            "Mentol & suis lampu kedai", 27.90m, ClaimStatus.Pending, siti);
        await db.SaveChangesAsync();

        db.DocumentSequences.AddRange(counters.Select(kv => new DocumentSequence { Type = kv.Key.Item1, Year = kv.Key.Item2, LastNumber = kv.Value }));
        await db.SaveChangesAsync();
    }
}
