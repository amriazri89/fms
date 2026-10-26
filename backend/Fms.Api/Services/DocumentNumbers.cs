using Fms.Api.Data;
using Fms.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Fms.Api.Services;

/// <summary>
/// Penjana nombor dokumen (SH / INV / RS / HT / BB / SG / BU / TK - tahun - turutan) yang dikongsi
/// oleh semua modul. Panggil dalam WriteLock supaya dua permintaan serentak tidak
/// mendapat nombor yang sama (sesuai untuk satu instance aplikasi).
/// </summary>
public static class DocumentNumbers
{
    public static readonly SemaphoreSlim WriteLock = new(1, 1);

    public static string Prefix(DocumentOptions o, DocumentType type) => type switch
    {
        DocumentType.Quotation => o.QuotationPrefix,
        DocumentType.Invoice => o.InvoicePrefix,
        DocumentType.Receipt => o.ReceiptPrefix,
        DocumentType.Payable => o.PayablePrefix,
        DocumentType.PayablePayment => o.PaymentVoucherPrefix,
        DocumentType.Payslip => o.PayslipPrefix,
        DocumentType.UtilityBill => o.UtilityBillPrefix,
        DocumentType.Claim => o.ClaimPrefix,
        _ => throw new ArgumentOutOfRangeException(nameof(type)),
    };

    public static async Task<string> NextAsync(AppDbContext db, DocumentOptions o, DocumentType type, DateOnly date)
    {
        var seq = db.DocumentSequences.Local.FirstOrDefault(s => s.Type == type && s.Year == date.Year)
                  ?? await db.DocumentSequences.FirstOrDefaultAsync(s => s.Type == type && s.Year == date.Year);
        if (seq is null)
        {
            seq = new DocumentSequence { Type = type, Year = date.Year, LastNumber = 0 };
            db.DocumentSequences.Add(seq);
        }
        seq.LastNumber++;
        return $"{Prefix(o, type)}-{date.Year}-{seq.LastNumber:D4}";
    }
}
