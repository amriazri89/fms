namespace Fms.Api.Domain;

/// <summary>
/// Buku hutang kedai (555): pelanggan ambil barang dahulu, bayar kemudian.
///
/// Rekod ini BELUM dikira jualan — sistem ikut asas tunai, sama seperti invois.
/// Jualan dikira apabila pelanggan membayar: bayaran ialah resit biasa (Payment) dengan
/// IsCreditPayment = true, yang menjana rekod Duit Masuk pada tarikh bayar.
///
/// Baki dikira ikut pelanggan + perniagaan:
///   baki = jumlah CreditSale aktif − jumlah Payment (IsCreditPayment) aktif.
/// </summary>
public class CreditSale
{
    public int Id { get; set; }

    public int CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    public DateOnly Date { get; set; }
    /// <summary>Barang yang diambil, contoh "Beras 10kg, minyak masak 2kg".</summary>
    public string Description { get; set; } = "";
    public decimal Amount { get; set; }

    public bool IsVoided { get; set; }
    public string? VoidReason { get; set; }
    public DateTime? VoidedAt { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
