namespace Fms.Api.Domain;

// =====================================================================
// Agihan hasil sawit
//
// Kilang sawit bayar satu jumlah (contoh RM70k) kepada Ajib untuk banyak tiket timbang.
// Setiap tiket milik seorang pemilik sawit. Ajib bayar setiap pemilik amaun tiketnya,
// selepas tolak caj (contoh upah potong, transport) yang menjadi PENDAPATAN Ajib.
//
// Perakaunan apabila bayaran kilang disahkan (Post):
//   - Setiap jenis caj  → Duit Masuk (Income) dengan kategori caj itu   = untung Ajib
//   - Baki bersih tiket → PalmIn  (duit pemilik dipegang, BUKAN untung)
//   Jumlah kedua-duanya = amaun yang diterima dari kilang.
// Apabila pemilik dibayar → PalmPayout (BUKAN belanja).
// Duit pemilik belum dibayar = PalmIn − PalmPayout.
// =====================================================================

/// <summary>Cara kira caj pada tiket.</summary>
public enum ChargeMethod
{
    /// <summary>RM × berat (tan).</summary>
    PerTonne = 1,
    /// <summary>Amaun tetap (RM).</summary>
    Fixed = 2,
    /// <summary>Peratus daripada amaun kasar tiket.</summary>
    Percent = 3
}

public enum PalmBatchStatus
{
    /// <summary>Masih boleh diubah. Tiada kesan pada akaun.</summary>
    Draft = 1,
    /// <summary>Disahkan: duit kilang direkod, pemilik boleh dibayar.</summary>
    Posted = 2,
    /// <summary>Dibatalkan.</summary>
    Cancelled = 3
}

/// <summary>Satu-satunya formula caj tiket. Frontend menyalin formula sama dalam src/lib/palmMath.ts.</summary>
public static class PalmMath
{
    public static decimal Gross(decimal weightKg, decimal pricePerTonne) => Math.Round(weightKg / 1000m * pricePerTonne, 2);

    public static decimal Charge(ChargeMethod method, decimal rate, decimal weightKg, decimal gross) => method switch
    {
        ChargeMethod.PerTonne => Math.Round(weightKg / 1000m * rate, 2),
        ChargeMethod.Fixed => Math.Round(rate, 2),
        ChargeMethod.Percent => Math.Round(gross * rate / 100m, 2),
        _ => 0m,
    };
}

/// <summary>Pemilik sawit yang dibayar oleh Ajib.</summary>
public class PalmOwner
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Phone { get; set; }
    public string? IcNumber { get; set; }
    /// <summary>Maklumat bank untuk pindahan, contoh "Maybank 1122 3344 5566".</summary>
    public string? BankInfo { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Jenis caj yang ditolak daripada tiket (contoh Upah potong, Transport). Pendapatan Ajib.</summary>
public class PalmChargeType
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    /// <summary>Kategori Duit Masuk untuk pendapatan caj ini.</summary>
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public ChargeMethod DefaultMethod { get; set; } = ChargeMethod.PerTonne;
    public decimal DefaultRate { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>Satu bayaran dari kilang yang meliputi banyak tiket.</summary>
public class PalmBatch
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public string MillName { get; set; } = "";
    public DateOnly Date { get; set; }
    public decimal AmountReceived { get; set; }

    /// <summary>Perniagaan / servis yang menerima duit dan pendapatan caj.</summary>
    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public MoneyChannel Channel { get; set; } = MoneyChannel.Bank;

    public string? Reference { get; set; }
    public string? Notes { get; set; }

    public PalmBatchStatus Status { get; set; } = PalmBatchStatus.Draft;
    public DateTime? PostedAt { get; set; }
    public string? CancelReason { get; set; }

    public List<PalmTicket> Tickets { get; set; } = [];
    /// <summary>Rekod duit yang dijana semasa disahkan.</summary>
    public List<PalmBatchTransaction> Postings { get; set; } = [];

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>Tiket timbang kilang: berat buah seorang pemilik.</summary>
public class PalmTicket
{
    public int Id { get; set; }
    public int BatchId { get; set; }
    public PalmBatch? Batch { get; set; }
    public int OwnerId { get; set; }
    public PalmOwner? Owner { get; set; }

    public string? TicketNo { get; set; }
    public DateOnly Date { get; set; }
    public decimal WeightKg { get; set; }
    public decimal? PricePerTonne { get; set; }
    /// <summary>Amaun kilang untuk tiket ini (RM).</summary>
    public decimal Gross { get; set; }
    /// <summary>Gross − jumlah caj. Amaun yang dibayar kepada pemilik.</summary>
    public decimal Net { get; set; }
    public int SortOrder { get; set; }

    public List<PalmTicketCharge> Charges { get; set; } = [];
}

public class PalmTicketCharge
{
    public int Id { get; set; }
    public int TicketId { get; set; }
    public PalmTicket? Ticket { get; set; }
    public int ChargeTypeId { get; set; }
    public PalmChargeType? ChargeType { get; set; }
    public ChargeMethod Method { get; set; }
    public decimal Rate { get; set; }
    public decimal Amount { get; set; }
}

/// <summary>Pautan bayaran kilang → rekod duit yang dijana (pendapatan caj & duit pemilik).</summary>
public class PalmBatchTransaction
{
    public int Id { get; set; }
    public int BatchId { get; set; }
    public PalmBatch? Batch { get; set; }
    public int TransactionId { get; set; }
    public Transaction? Transaction { get; set; }
}

/// <summary>Bayaran kepada seorang pemilik untuk semua tiketnya dalam satu bayaran kilang.</summary>
public class PalmPayout
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public int BatchId { get; set; }
    public PalmBatch? Batch { get; set; }
    public int OwnerId { get; set; }
    public PalmOwner? Owner { get; set; }

    public DateOnly Date { get; set; }
    public decimal Amount { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public PaymentMethod Method { get; set; }
    public string? Reference { get; set; }

    public int? TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public bool IsVoided { get; set; }
    public string? VoidReason { get; set; }
    public DateTime? VoidedAt { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
