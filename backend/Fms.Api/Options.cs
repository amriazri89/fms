namespace Fms.Api;

public class JwtOptions
{
    public string Issuer { get; set; } = "";
    public string Audience { get; set; } = "";
    public string Key { get; set; } = "";
    public int ExpiryHours { get; set; } = 12;
}

public class AppOptions
{
    /// <summary>IANA time zone untuk tentukan "hari ini" (contoh: Asia/Kuala_Lumpur).</summary>
    public string TimeZone { get; set; } = "Asia/Kuala_Lumpur";

    /// <summary>Nama sistem / syarikat yang dicetak pada laporan, slip gaji dan penyata.</summary>
    public string CompanyName { get; set; } = "Ajib Business";

    /// <summary>Pengurus (ayah) yang dicipta semasa seed pertama.</summary>
    public string ManagerUsername { get; set; } = "pengurus";
    public string ManagerFullName { get; set; } = "Ayah";
    public string ManagerPassword { get; set; } = "";

    /// <summary>Kerani (anak) yang dicipta semasa seed pertama.</summary>
    public string ClerkUsername { get; set; } = "kerani";
    public string ClerkFullName { get; set; } = "Anak";
    public string ClerkPassword { get; set; } = "";

    /// <summary>Folder simpanan resit tuntutan.</summary>
    public string UploadFolder { get; set; } = "uploads";

    /// <summary>Jika true, masukkan data contoh (pengguna, rekod 6 bulan) semasa pangkalan data kosong.</summary>
    public bool SeedDemoData { get; set; }

    /// <summary>Akaun dengan baki di bawah nilai ini akan dipaparkan sebagai amaran di skrin utama.</summary>
    public decimal LowBalanceThreshold { get; set; } = 500m;
}

/// <summary>Tetapan dokumen jualan (bahagian "Documents" dalam appsettings).</summary>
public class DocumentOptions
{
    public string QuotationPrefix { get; set; } = "SH";
    public string InvoicePrefix { get; set; } = "INV";
    public string ReceiptPrefix { get; set; } = "RS";
    /// <summary>Hutang kita (bil pembekal / pinjaman).</summary>
    public string PayablePrefix { get; set; } = "HT";
    /// <summary>Baucar bayaran hutang.</summary>
    public string PaymentVoucherPrefix { get; set; } = "BB";
    /// <summary>Slip gaji.</summary>
    public string PayslipPrefix { get; set; } = "SG";
    /// <summary>Bil utiliti.</summary>
    public string UtilityBillPrefix { get; set; } = "BU";
    /// <summary>Tuntutan kewangan.</summary>
    public string ClaimPrefix { get; set; } = "TK";

    /// <summary>Label cukai pada dokumen, contoh "SST".</summary>
    public string TaxLabel { get; set; } = "SST";

    /// <summary>Peratus cukai lalai untuk dokumen baru. 0 jika tidak berdaftar SST.</summary>
    public decimal DefaultTaxRate { get; set; }

    public int QuotationValidDays { get; set; } = 14;
    public int PaymentTermDays { get; set; } = 30;
    public string? DefaultQuotationTerms { get; set; }
    public string? DefaultInvoiceTerms { get; set; }
}

public static class Policies
{
    /// <summary>Pengurus sahaja (ayah).</summary>
    public const string Manager = "ManagerOnly";

    /// <summary>Pengurus atau Kerani.</summary>
    public const string AnyUser = "ManagerOrClerk";

    /// <summary>Kerani sahaja (anak), contohnya memohon tuntutan.</summary>
    public const string Clerk = "ClerkOnly";
}
