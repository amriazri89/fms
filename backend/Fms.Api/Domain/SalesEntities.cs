namespace Fms.Api.Domain;

public enum CustomerActivityType
{
    Note = 1,
    Call = 2,
    WhatsApp = 3,
    Visit = 4,
    Email = 5,
    Meeting = 6
}

public enum QuotationStatus
{
    Draft = 1,
    Sent = 2,
    Accepted = 3,
    Rejected = 4,
    /// <summary>Sudah ditukar ke invois. Tidak boleh diubah lagi.</summary>
    Converted = 5
}

/// <summary>Status bayaran dikira semula setiap kali resit dibuat / dibatalkan.</summary>
public enum InvoiceStatus
{
    Unpaid = 1,
    PartiallyPaid = 2,
    Paid = 3,
    Cancelled = 4
}

public enum PaymentMethod
{
    Cash = 1,
    BankTransfer = 2,
    DuitNow = 3,
    Cheque = 4,
    Card = 5,
    Other = 6
}

public enum DocumentType
{
    Quotation = 1,
    Invoice = 2,
    Receipt = 3,
    Payable = 4,
    PayablePayment = 5,
    Payslip = 6,
    UtilityBill = 7,
    Claim = 8
}

/// <summary>Pelanggan (CRM).</summary>
public class Customer
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? ContactPerson { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    /// <summary>No. SSM / pendaftaran syarikat (pilihan).</summary>
    public string? RegistrationNo { get; set; }
    /// <summary>Label bebas, contoh: Pemborong, Kilang, Restoran.</summary>
    public string? Tag { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Catatan interaksi dengan pelanggan + tindakan susulan.</summary>
public class CustomerActivity
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public DateOnly Date { get; set; }
    public CustomerActivityType Type { get; set; }
    public string Note { get; set; } = "";
    public DateOnly? FollowUpDate { get; set; }
    public bool FollowUpDone { get; set; }
    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Baris item untuk sebut harga / invois. Bukan entiti sendiri.</summary>
public abstract class DocumentLine
{
    public int Id { get; set; }
    public int SortOrder { get; set; }
    public string Description { get; set; } = "";
    public decimal Quantity { get; set; }
    public string? Unit { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Amount { get; set; }
}

public class QuotationItem : DocumentLine
{
    public int QuotationId { get; set; }
}

public class InvoiceItem : DocumentLine
{
    public int InvoiceId { get; set; }
}

/// <summary>Medan yang dikongsi oleh sebut harga dan invois. Bukan entiti sendiri.</summary>
public abstract class SalesDocument
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public DateOnly Date { get; set; }
    public string? Subject { get; set; }
    public string? Notes { get; set; }
    public string? Terms { get; set; }
    public decimal Subtotal { get; set; }
    public decimal DiscountAmount { get; set; }
    /// <summary>Peratus cukai (contoh 6 untuk 6%). 0 = tiada cukai.</summary>
    public decimal TaxRate { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal Total { get; set; }
    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

public class Quotation : SalesDocument
{
    public DateOnly ValidUntil { get; set; }
    public QuotationStatus Status { get; set; } = QuotationStatus.Draft;
    /// <summary>Invois yang dijana dari sebut harga ini.</summary>
    public int? InvoiceId { get; set; }
    public List<QuotationItem> Items { get; set; } = new();
}

public class Invoice : SalesDocument
{
    public DateOnly DueDate { get; set; }
    public InvoiceStatus Status { get; set; } = InvoiceStatus.Unpaid;
    /// <summary>Sebut harga asal (jika ada).</summary>
    public int? QuotationId { get; set; }
    /// <summary>Jumlah resit yang aktif. Dikira semula oleh SalesService.</summary>
    public decimal AmountPaid { get; set; }
    public string? CancelReason { get; set; }
    public List<InvoiceItem> Items { get; set; } = new();
    public List<Payment> Payments { get; set; } = new();
}

/// <summary>
/// Bayaran diterima = resit. Setiap resit menjana satu rekod Duit Masuk (Transaction)
/// supaya aliran tunai dan untung sentiasa selari.
/// </summary>
public class Payment
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public DateOnly Date { get; set; }
    public decimal Amount { get; set; }
    public PaymentMethod Method { get; set; }

    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    public int? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    /// <summary>Nama yang dicetak pada resit (pelanggan atau orang lalu).</summary>
    public string ReceivedFrom { get; set; } = "";

    public int? InvoiceId { get; set; }
    public Invoice? Invoice { get; set; }

    public int AccountId { get; set; }
    public Account? Account { get; set; }

    public int CategoryId { get; set; }
    public Category? Category { get; set; }

    public int? TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public string? Reference { get; set; }
    public string? Description { get; set; }

    public bool IsVoided { get; set; }
    public string? VoidReason { get; set; }
    public DateTime? VoidedAt { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Kaunter nombor dokumen setahun, contoh INV-2026-0001.</summary>
public class DocumentSequence
{
    public DocumentType Type { get; set; }
    public int Year { get; set; }
    public int LastNumber { get; set; }
}

public static class DocumentMath
{
    public static decimal LineAmount(decimal quantity, decimal unitPrice) =>
        Math.Round(quantity * unitPrice, 2, MidpointRounding.AwayFromZero);

    /// <summary>Kira jumlah kecil, diskaun, cukai dan jumlah besar.</summary>
    public static void ApplyTotals(SalesDocument d, IEnumerable<DocumentLine> lines)
    {
        d.Subtotal = lines.Sum(l => l.Amount);
        d.DiscountAmount = Math.Round(Math.Clamp(d.DiscountAmount, 0m, d.Subtotal), 2);
        var taxable = d.Subtotal - d.DiscountAmount;
        d.TaxAmount = Math.Round(taxable * d.TaxRate / 100m, 2, MidpointRounding.AwayFromZero);
        d.Total = taxable + d.TaxAmount;
    }

    public static InvoiceStatus PaymentStatus(decimal total, decimal paid) =>
        paid <= 0 ? InvoiceStatus.Unpaid : paid >= total ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid;
}
