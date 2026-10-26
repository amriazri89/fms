using Fms.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<BusinessUnit> BusinessUnits => Set<BusinessUnit>();
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<FamilyMember> FamilyMembers => Set<FamilyMember>();
    public DbSet<Transaction> Transactions => Set<Transaction>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

    // Jualan & pelanggan
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<CustomerActivity> CustomerActivities => Set<CustomerActivity>();
    public DbSet<Quotation> Quotations => Set<Quotation>();
    public DbSet<QuotationItem> QuotationItems => Set<QuotationItem>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceItem> InvoiceItems => Set<InvoiceItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<DocumentSequence> DocumentSequences => Set<DocumentSequence>();
    public DbSet<CreditSale> CreditSales => Set<CreditSale>();

    // Pembekal & hutang kita
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<Payable> Payables => Set<Payable>();
    public DbSet<PayablePayment> PayablePayments => Set<PayablePayment>();
    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Wage> Wages => Set<Wage>();
    public DbSet<UtilityBill> UtilityBills => Set<UtilityBill>();
    public DbSet<FinancialClaim> Claims => Set<FinancialClaim>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<User>(e =>
        {
            e.HasIndex(x => x.Username).IsUnique();
            e.Property(x => x.Username).HasMaxLength(50).IsRequired();
            e.Property(x => x.FullName).HasMaxLength(100).IsRequired();
            e.Property(x => x.Role).HasConversion<string>().HasMaxLength(20);
        });

        b.Entity<BusinessUnit>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Color).HasMaxLength(20);
            e.Property(x => x.LegalName).HasMaxLength(150);
            e.Property(x => x.RegistrationNo).HasMaxLength(50);
            e.Property(x => x.Address).HasMaxLength(300);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(100);
            e.Property(x => x.PaymentInfo).HasMaxLength(300);
            e.Property(x => x.DocumentFooter).HasMaxLength(300);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<Account>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.OpeningBalance).HasPrecision(18, 2);
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<Category>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(100).IsRequired();
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        });

        b.Entity<FamilyMember>(e => e.Property(x => x.Name).HasMaxLength(100).IsRequired());

        b.Entity<Transaction>(e =>
        {
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Party).HasMaxLength(150);
            e.Property(x => x.Reference).HasMaxLength(50);
            e.Property(x => x.Description).HasMaxLength(500);
            e.HasIndex(x => x.Date);
            e.HasIndex(x => new { x.BusinessUnitId, x.Date });

            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ToBusinessUnit).WithMany().HasForeignKey(x => x.ToBusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ToAccount).WithMany().HasForeignKey(x => x.ToAccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.FamilyMember).WithMany().HasForeignKey(x => x.FamilyMemberId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
            e.HasQueryFilter(x => !x.IsDeleted);
        });

        b.Entity<AuditLog>(e =>
        {
            e.Property(x => x.Action).HasMaxLength(30);
            e.Property(x => x.Entity).HasMaxLength(50);
            e.Property(x => x.EntityId).HasMaxLength(50);
            e.Property(x => x.Username).HasMaxLength(50);
            e.HasIndex(x => x.Timestamp);
        });

        ConfigureSales(b);
        ConfigurePayables(b);
        ConfigureStaff(b);
    }

    private static void ConfigureStaff(ModelBuilder b)
    {
        b.Entity<Employee>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(150).IsRequired();
            e.Property(x => x.IcNo).HasMaxLength(20);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.Property(x => x.Position).HasMaxLength(100);
            e.Property(x => x.EmploymentType).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.BasicRate).HasPrecision(18, 2);
            e.Property(x => x.BankName).HasMaxLength(50);
            e.Property(x => x.BankAccountNo).HasMaxLength(30);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Wage>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.Property(x => x.PeriodMonth).HasMaxLength(7).IsRequired();
            e.HasIndex(x => new { x.EmployeeId, x.PeriodMonth });
            e.HasIndex(x => x.PayDate);
            e.Property(x => x.BasicPay).HasPrecision(18, 2);
            e.Property(x => x.Allowance).HasPrecision(18, 2);
            e.Property(x => x.Overtime).HasPrecision(18, 2);
            e.Property(x => x.Deduction).HasPrecision(18, 2);
            e.Property(x => x.NetPay).HasPrecision(18, 2);
            e.Property(x => x.DaysWorked).HasPrecision(6, 2);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.Property(x => x.VoidReason).HasMaxLength(300);
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Transaction).WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<UtilityBill>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Provider).HasMaxLength(100);
            e.Property(x => x.AccountNo).HasMaxLength(50);
            e.Property(x => x.PeriodMonth).HasMaxLength(7).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Reference).HasMaxLength(50);
            e.Property(x => x.Notes).HasMaxLength(500);
            e.HasIndex(x => x.BillDate);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PaidAccount).WithMany().HasForeignKey(x => x.PaidAccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Transaction).WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<FinancialClaim>(e =>
        {
            e.ToTable("Claims");
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Description).HasMaxLength(300).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.ReviewRemark).HasMaxLength(300);
            e.HasIndex(x => x.Status);
            e.HasOne(x => x.RequestedBy).WithMany().HasForeignKey(x => x.RequestedById).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReviewedBy).WithMany().HasForeignKey(x => x.ReviewedById).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Employee).WithMany().HasForeignKey(x => x.EmployeeId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PaidAccount).WithMany().HasForeignKey(x => x.PaidAccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Transaction).WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigurePayables(ModelBuilder b)
    {
        b.Entity<Supplier>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(150).IsRequired();
            e.Property(x => x.ContactPerson).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(100);
            e.Property(x => x.Address).HasMaxLength(300);
            e.Property(x => x.Tag).HasMaxLength(50);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasIndex(x => x.Name);
        });

        b.Entity<Payable>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => x.DueDate);
            e.Property(x => x.Kind).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Description).HasMaxLength(300).IsRequired();
            e.Property(x => x.SupplierReference).HasMaxLength(50);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.Property(x => x.CancelReason).HasMaxLength(300);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.AmountPaid).HasPrecision(18, 2);
            e.Property(x => x.InstallmentAmount).HasPrecision(18, 2);
            e.HasOne(x => x.Supplier).WithMany().HasForeignKey(x => x.SupplierId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.ReceivedTransaction).WithMany().HasForeignKey(x => x.ReceivedTransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Payments).WithOne(p => p.Payable).HasForeignKey(p => p.PayableId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<PayablePayment>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => x.Date);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.InterestAmount).HasPrecision(18, 2);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Reference).HasMaxLength(50);
            e.Property(x => x.Notes).HasMaxLength(300);
            e.Property(x => x.VoidReason).HasMaxLength(300);
            e.HasOne(x => x.InterestCategory).WithMany().HasForeignKey(x => x.InterestCategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.PrincipalTransaction).WithMany().HasForeignKey(x => x.PrincipalTransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.InterestTransaction).WithMany().HasForeignKey(x => x.InterestTransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });
    }

    private static void ConfigureSales(ModelBuilder b)
    {
        b.Entity<Customer>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(150).IsRequired();
            e.Property(x => x.ContactPerson).HasMaxLength(100);
            e.Property(x => x.Phone).HasMaxLength(50);
            e.Property(x => x.Email).HasMaxLength(100);
            e.Property(x => x.Address).HasMaxLength(300);
            e.Property(x => x.RegistrationNo).HasMaxLength(50);
            e.Property(x => x.Tag).HasMaxLength(50);
            e.Property(x => x.Notes).HasMaxLength(1000);
            e.HasIndex(x => x.Name);
        });

        b.Entity<CustomerActivity>(e =>
        {
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.Note).HasMaxLength(1000).IsRequired();
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Cascade);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.CustomerId, x.Date });
            e.HasIndex(x => x.FollowUpDate);
        });

        ConfigureDocument<Quotation>(b);
        ConfigureDocument<Invoice>(b);

        b.Entity<Quotation>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.HasMany(x => x.Items).WithOne().HasForeignKey(i => i.QuotationId).OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<Invoice>(e =>
        {
            e.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.AmountPaid).HasPrecision(18, 2);
            e.Property(x => x.CancelReason).HasMaxLength(300);
            e.HasMany(x => x.Items).WithOne().HasForeignKey(i => i.InvoiceId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Payments).WithOne(p => p.Invoice).HasForeignKey(p => p.InvoiceId).OnDelete(DeleteBehavior.Restrict);
        });

        ConfigureLine<QuotationItem>(b);
        ConfigureLine<InvoiceItem>(b);

        b.Entity<Payment>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => x.Date);
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.Method).HasConversion<string>().HasMaxLength(20);
            e.Property(x => x.ReceivedFrom).HasMaxLength(150).IsRequired();
            e.Property(x => x.Reference).HasMaxLength(50);
            e.Property(x => x.Description).HasMaxLength(300);
            e.Property(x => x.VoidReason).HasMaxLength(300);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Transaction).WithMany().HasForeignKey(x => x.TransactionId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });

        // Buku hutang kedai (555)
        b.Entity<CreditSale>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(300).IsRequired();
            e.Property(x => x.Amount).HasPrecision(18, 2);
            e.Property(x => x.VoidReason).HasMaxLength(300);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
            e.HasIndex(x => new { x.CustomerId, x.BusinessUnitId });
            e.HasIndex(x => x.Date);
        });

        b.Entity<DocumentSequence>(e =>
        {
            e.HasKey(x => new { x.Type, x.Year });
            e.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        });
    }

    private static void ConfigureDocument<T>(ModelBuilder b) where T : SalesDocument =>
        b.Entity<T>(e =>
        {
            e.Property(x => x.Number).HasMaxLength(30).IsRequired();
            e.HasIndex(x => x.Number).IsUnique();
            e.HasIndex(x => x.Date);
            e.Property(x => x.Subject).HasMaxLength(200);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.Terms).HasMaxLength(2000);
            e.Property(x => x.Subtotal).HasPrecision(18, 2);
            e.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            e.Property(x => x.TaxRate).HasPrecision(5, 2);
            e.Property(x => x.TaxAmount).HasPrecision(18, 2);
            e.Property(x => x.Total).HasPrecision(18, 2);
            e.HasOne(x => x.BusinessUnit).WithMany().HasForeignKey(x => x.BusinessUnitId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            e.HasOne(x => x.CreatedBy).WithMany().HasForeignKey(x => x.CreatedById).OnDelete(DeleteBehavior.Restrict);
        });

    private static void ConfigureLine<T>(ModelBuilder b) where T : DocumentLine =>
        b.Entity<T>(e =>
        {
            e.Property(x => x.Description).HasMaxLength(300).IsRequired();
            e.Property(x => x.Unit).HasMaxLength(20);
            e.Property(x => x.Quantity).HasPrecision(18, 3);
            e.Property(x => x.UnitPrice).HasPrecision(18, 2);
            e.Property(x => x.Amount).HasPrecision(18, 2);
        });
}
