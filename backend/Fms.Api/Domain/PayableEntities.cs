namespace Fms.Api.Domain;

/// <summary>Jenis hutang kita.</summary>
public enum PayableKind
{
    /// <summary>Bil pembekal — barang / servis diambil dulu, bayar kemudian. Bayaran = Duit keluar (dikira belanja).</summary>
    Bill = 1,

    /// <summary>Pinjaman (bank / orang). Duit masuk & bayar balik pokok tidak dikira untung; faedah dikira belanja.</summary>
    Loan = 2
}

public enum PayableStatus
{
    Unpaid = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Cancelled = 4
}

/// <summary>Pembekal / pemiutang — sesiapa yang kita berhutang.</summary>
public class Supplier
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? ContactPerson { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public string? Tag { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Satu hutang: bil pembekal atau pinjaman.</summary>
public class Payable
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public PayableKind Kind { get; set; }

    public int SupplierId { get; set; }
    public Supplier? Supplier { get; set; }

    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    /// <summary>Kategori belanja (bil sahaja). Bayaran direkod dengan kategori ini.</summary>
    public int? CategoryId { get; set; }
    public Category? Category { get; set; }

    public DateOnly Date { get; set; }
    public DateOnly DueDate { get; set; }
    public string Description { get; set; } = "";
    /// <summary>No. bil / invois pembekal atau no. akaun pinjaman.</summary>
    public string? SupplierReference { get; set; }
    public decimal Amount { get; set; }
    /// <summary>Jumlah pokok yang telah dibayar (bayaran aktif). Dikira semula oleh PayablesService.</summary>
    public decimal AmountPaid { get; set; }
    /// <summary>Ansuran bulanan (pinjaman, untuk paparan sahaja).</summary>
    public decimal? InstallmentAmount { get; set; }
    public PayableStatus Status { get; set; } = PayableStatus.Unpaid;
    public string? Notes { get; set; }
    public string? CancelReason { get; set; }

    /// <summary>Pinjaman: rekod "Pinjaman diterima" jika duit masuk ke akaun melalui sistem.</summary>
    public int? ReceivedTransactionId { get; set; }
    public Transaction? ReceivedTransaction { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public List<PayablePayment> Payments { get; set; } = new();
}

/// <summary>Bayaran hutang (baucar bayaran). Menjana rekod Duit keluar / Bayar balik pinjaman.</summary>
public class PayablePayment
{
    public int Id { get; set; }
    public string Number { get; set; } = "";

    public int PayableId { get; set; }
    public Payable? Payable { get; set; }

    public DateOnly Date { get; set; }
    /// <summary>Bayaran pokok (mengurangkan baki hutang).</summary>
    public decimal Amount { get; set; }
    /// <summary>Faedah / caj (pinjaman sahaja). Direkod sebagai Duit keluar, tidak mengurangkan baki.</summary>
    public decimal InterestAmount { get; set; }
    public int? InterestCategoryId { get; set; }
    public Category? InterestCategory { get; set; }

    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public PaymentMethod Method { get; set; }
    public string? Reference { get; set; }
    public string? Notes { get; set; }

    public int? PrincipalTransactionId { get; set; }
    public Transaction? PrincipalTransaction { get; set; }
    public int? InterestTransactionId { get; set; }
    public Transaction? InterestTransaction { get; set; }

    public bool IsVoided { get; set; }
    public string? VoidReason { get; set; }
    public DateTime? VoidedAt { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class PayableMath
{
    public static PayableStatus Status(decimal amount, decimal paid) =>
        paid <= 0 ? PayableStatus.Unpaid : paid >= amount ? PayableStatus.Paid : PayableStatus.PartiallyPaid;
}
