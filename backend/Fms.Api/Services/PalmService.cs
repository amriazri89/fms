using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Fms.Api.Services;

/// <summary>
/// Agihan hasil sawit (lihat Domain/PalmEntities.cs untuk aliran perakaunan).
///
///   Draft  : bayaran kilang + tiket boleh diubah. Tiada kesan pada akaun.
///   Posted : Duit Masuk (caj = pendapatan) + PalmIn (duit pemilik) direkod. Pemilik boleh dibayar.
///            Buka semula / batal hanya jika belum ada pemilik dibayar.
///   Bayar  : satu bayaran bagi setiap pemilik dalam satu bayaran kilang = jumlah bersih tiketnya.
/// </summary>
public class PalmService(
    AppDbContext db,
    CurrentUser user,
    AuditService audit,
    IOptions<DocumentOptions> documentOptions,
    IOptions<AppOptions> appOptions)
{
    private readonly DocumentOptions _doc = documentOptions.Value;
    private static SemaphoreSlim WriteLock => DocumentNumbers.WriteLock;

    public DateOnly Today => Clock.Today(appOptions.Value.TimeZone);

    // =====================================================================
    // Pemilik sawit
    // =====================================================================

    public async Task<IReadOnlyList<PalmOwnerDto>> ListOwnersAsync(bool includeInactive)
    {
        var owners = await db.PalmOwners.AsNoTracking()
            .Where(o => includeInactive || o.IsActive)
            .OrderBy(o => o.Name).ToListAsync();

        var unpaid = (await UnpaidSharesAsync()).GroupBy(s => s.OwnerId).ToDictionary(g => g.Key, g => g.Sum(s => s.Net));

        // Kadar caj daripada tiket terakhir setiap pemilik
        // (dikira di memori — senarai tiket kecil; elak terjemahan SQL "top 1 per kumpulan")
        var lastTickets = (await db.PalmTickets.AsNoTracking()
                .Where(t => t.Batch!.Status != PalmBatchStatus.Cancelled)
                .Select(t => new { t.Id, t.OwnerId, t.Date })
                .ToListAsync())
            .GroupBy(t => t.OwnerId)
            .Select(g => g.OrderByDescending(t => t.Date).ThenByDescending(t => t.Id).First().Id)
            .ToList();
        var lastCharges = (await db.PalmTicketCharges.AsNoTracking()
                .Where(c => lastTickets.Contains(c.TicketId))
                .Select(c => new { c.Ticket!.OwnerId, c.ChargeTypeId, c.Method, c.Rate })
                .ToListAsync())
            .GroupBy(c => c.OwnerId)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<PalmLastChargeDto>)g.Select(c => new PalmLastChargeDto(c.ChargeTypeId, c.Method, c.Rate)).ToList());

        return owners.Select(o => new PalmOwnerDto(o.Id, o.Name, o.Phone, o.IcNumber, o.BankInfo, o.Notes, o.IsActive,
                unpaid.GetValueOrDefault(o.Id), lastCharges.GetValueOrDefault(o.Id) ?? []))
            .ToList();
    }

    public async Task<int> SaveOwnerAsync(int? id, PalmOwnerInput i)
    {
        var name = i.Name.Trim();
        new Check()
            .Field(name.Length > 0, "name", "Nama diperlukan.")
            .Field(!await db.PalmOwners.AnyAsync(o => o.Name == name && o.Id != id), "name", "Nama pemilik sudah wujud.")
            .ThrowIfAny();

        var o = id is int existing ? await db.PalmOwners.FirstOrDefaultAsync(x => x.Id == existing) ?? throw new NotFoundException() : new PalmOwner();
        var old = id is null ? null : new { o.Name, o.Phone, o.IcNumber, o.BankInfo, o.IsActive };
        o.Name = name;
        o.Phone = Clean(i.Phone);
        o.IcNumber = Clean(i.IcNumber);
        o.BankInfo = Clean(i.BankInfo);
        o.Notes = Clean(i.Notes);
        o.IsActive = i.IsActive;
        if (id is null) db.PalmOwners.Add(o);
        await db.SaveChangesAsync();
        audit.Log(id is null ? AuditActions.Create : AuditActions.Update, "PalmOwner", o.Id, old, new { o.Name, o.Phone, o.IcNumber, o.BankInfo, o.IsActive });
        await db.SaveChangesAsync();
        return o.Id;
    }

    /// <summary>Padam jika belum digunakan; jika sudah ada tiket, nyahaktif sahaja.</summary>
    public async Task DeleteOwnerAsync(int id)
    {
        var o = await db.PalmOwners.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        var used = await db.PalmTickets.AnyAsync(t => t.OwnerId == id);
        if (used) o.IsActive = false; else db.PalmOwners.Remove(o);
        audit.Log(AuditActions.Delete, "PalmOwner", id, new { o.Name }, new { deactivatedOnly = used });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Jenis caj
    // =====================================================================

    public async Task<IReadOnlyList<PalmChargeTypeDto>> ListChargeTypesAsync(bool includeInactive) =>
        await db.PalmChargeTypes.AsNoTracking()
            .Where(c => includeInactive || c.IsActive)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name)
            .Select(c => new PalmChargeTypeDto(c.Id, c.Name, c.CategoryId, c.Category!.Name, c.DefaultMethod, c.DefaultRate, c.SortOrder, c.IsActive))
            .ToListAsync();

    public async Task<int> SaveChargeTypeAsync(int? id, PalmChargeTypeInput i)
    {
        var name = i.Name.Trim();
        new Check()
            .Field(name.Length > 0, "name", "Nama diperlukan.")
            .Field(!await db.PalmChargeTypes.AnyAsync(c => c.Name == name && c.Id != id), "name", "Nama caj sudah wujud.")
            .Field(await db.Categories.AnyAsync(c => c.Id == i.CategoryId && c.IsActive && c.Type == CategoryType.Income),
                "categoryId", "Pilih kategori Duit Masuk (pendapatan caj ini).")
            .Field(Enum.IsDefined(i.DefaultMethod), "defaultMethod", "Pilih cara kira.")
            .Field(i.DefaultRate >= 0, "defaultRate", "Kadar tidak boleh negatif.")
            .ThrowIfAny();

        var c = id is int existing ? await db.PalmChargeTypes.FirstOrDefaultAsync(x => x.Id == existing) ?? throw new NotFoundException() : new PalmChargeType();
        c.Name = name;
        c.CategoryId = i.CategoryId;
        c.DefaultMethod = i.DefaultMethod;
        c.DefaultRate = i.DefaultRate;
        c.SortOrder = i.SortOrder;
        c.IsActive = i.IsActive;
        if (id is null) db.PalmChargeTypes.Add(c);
        await db.SaveChangesAsync();
        audit.Log(id is null ? AuditActions.Create : AuditActions.Update, "PalmChargeType", c.Id, newValue: i);
        await db.SaveChangesAsync();
        return c.Id;
    }

    public async Task DeleteChargeTypeAsync(int id)
    {
        var c = await db.PalmChargeTypes.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        var used = await db.PalmTicketCharges.AnyAsync(x => x.ChargeTypeId == id);
        if (used) c.IsActive = false; else db.PalmChargeTypes.Remove(c);
        audit.Log(AuditActions.Delete, "PalmChargeType", id, new { c.Name }, new { deactivatedOnly = used });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Bayaran kilang
    // =====================================================================

    /// <summary>Bahagian pemilik dalam bayaran kilang yang disahkan dan belum dibayar.</summary>
    private async Task<List<(int BatchId, int OwnerId, decimal Net)>> UnpaidSharesAsync()
    {
        var shares = await db.PalmTickets.AsNoTracking()
            .Where(t => t.Batch!.Status == PalmBatchStatus.Posted)
            .GroupBy(t => new { t.BatchId, t.OwnerId })
            .Select(g => new { g.Key.BatchId, g.Key.OwnerId, Net = g.Sum(t => t.Net) })
            .ToListAsync();
        var paid = (await db.PalmPayouts.AsNoTracking().Where(p => !p.IsVoided).Select(p => new { p.BatchId, p.OwnerId }).ToListAsync())
            .ToHashSet();
        return shares.Where(s => s.Net > 0 && !paid.Contains(new { s.BatchId, s.OwnerId }))
            .Select(s => (s.BatchId, s.OwnerId, s.Net)).ToList();
    }

    public async Task<PalmSummaryDto> ListAsync(PalmBatchQuery f)
    {
        var q = db.PalmBatches.AsNoTracking().Include(b => b.BusinessUnit).AsQueryable();
        if (f.From is DateOnly from) q = q.Where(b => b.Date >= from);
        if (f.To is DateOnly to) q = q.Where(b => b.Date <= to);
        if (Enum.TryParse<PalmBatchStatus>(f.Status, true, out var st)) q = q.Where(b => b.Status == st);
        if (f.OwnerId is int owner) q = q.Where(b => b.Tickets.Any(t => t.OwnerId == owner));
        var batches = await q.OrderByDescending(b => b.Date).ThenByDescending(b => b.Id).ToListAsync();
        var ids = batches.Select(b => b.Id).ToList();

        var tickets = await db.PalmTickets.AsNoTracking().Where(t => ids.Contains(t.BatchId))
            .Select(t => new { t.BatchId, t.OwnerId, t.Gross, t.Net }).ToListAsync();
        var paidOwners = (await db.PalmPayouts.AsNoTracking().Where(p => ids.Contains(p.BatchId) && !p.IsVoided)
                .Select(p => new { p.BatchId, p.OwnerId }).ToListAsync())
            .GroupBy(p => p.BatchId).ToDictionary(g => g.Key, g => g.Select(p => p.OwnerId).ToHashSet());

        var rows = batches.Select(b =>
        {
            var bt = tickets.Where(t => t.BatchId == b.Id).ToList();
            var owners = bt.GroupBy(t => t.OwnerId).Select(g => new { OwnerId = g.Key, Net = g.Sum(t => t.Net) }).ToList();
            var paid = paidOwners.GetValueOrDefault(b.Id) ?? [];
            var unpaid = b.Status == PalmBatchStatus.Posted ? owners.Where(o => !paid.Contains(o.OwnerId)).Sum(o => o.Net) : 0;
            return new PalmBatchListItem(b.Id, b.Number, b.MillName, b.Date, b.AmountReceived, b.BusinessUnit?.Name ?? "",
                b.Status, bt.Count, owners.Count, owners.Count(o => paid.Contains(o.OwnerId)),
                bt.Sum(t => t.Gross - t.Net), unpaid);
        }).ToList();

        var allUnpaid = await UnpaidSharesAsync();
        return new PalmSummaryDto(allUnpaid.Sum(s => s.Net), allUnpaid.Select(s => s.OwnerId).Distinct().Count(), rows);
    }

    public async Task<PalmBatchDto> GetAsync(int id)
    {
        var b = await db.PalmBatches.AsNoTracking()
            .Include(x => x.BusinessUnit).Include(x => x.Account).Include(x => x.CreatedBy)
            .Include(x => x.Tickets).ThenInclude(t => t.Owner)
            .Include(x => x.Tickets).ThenInclude(t => t.Charges).ThenInclude(c => c.ChargeType)
            .AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();

        var payouts = await db.PalmPayouts.AsNoTracking().Include(p => p.Owner).Include(p => p.Account).Include(p => p.CreatedBy)
            .Where(p => p.BatchId == id && !p.IsVoided).ToListAsync();

        var tickets = b.Tickets.OrderBy(t => t.SortOrder).ThenBy(t => t.Id).Select(t => new PalmTicketDto(
            t.Id, t.OwnerId, t.Owner?.Name ?? "", t.TicketNo, t.Date, t.WeightKg, t.PricePerTonne, t.Gross, t.Net,
            t.Charges.OrderBy(c => c.ChargeType?.SortOrder).Select(c => new PalmChargeDto(c.ChargeTypeId, c.ChargeType?.Name ?? "", c.Method, c.Rate, c.Amount)).ToList()
        )).ToList();

        var owners = b.Tickets.GroupBy(t => t.OwnerId).Select(g =>
        {
            var o = g.First().Owner!;
            var payout = payouts.FirstOrDefault(p => p.OwnerId == g.Key);
            return new PalmOwnerShareDto(o.Id, o.Name, o.Phone, o.BankInfo, g.Count(), g.Sum(t => t.WeightKg),
                g.Sum(t => t.Gross), g.Sum(t => t.Gross - t.Net), g.Sum(t => t.Net),
                payout is null ? null : ToDto(payout, b.Number));
        }).OrderBy(o => o.OwnerName).ToList();

        var chargeTotals = b.Tickets.SelectMany(t => t.Charges)
            .GroupBy(c => new { c.ChargeTypeId, Name = c.ChargeType?.Name ?? "", Sort = c.ChargeType?.SortOrder ?? 0 })
            .OrderBy(g => g.Key.Sort)
            .Select(g => new PalmChargeTotalDto(g.Key.ChargeTypeId, g.Key.Name, g.Sum(c => c.Amount))).ToList();

        var totalGross = b.Tickets.Sum(t => t.Gross);
        var totalNet = b.Tickets.Sum(t => t.Net);
        var paidToOwners = owners.Where(o => o.Payout is not null).Sum(o => o.Net);
        return new PalmBatchDto(
            b.Id, b.Number, b.MillName, b.Date, b.AmountReceived,
            b.BusinessUnitId, b.BusinessUnit?.Name ?? "", b.AccountId, b.Account?.Name ?? "", b.Channel,
            b.Reference, b.Notes, b.Status, b.CancelReason,
            totalGross, totalGross - totalNet, totalNet, b.Tickets.Sum(t => t.WeightKg),
            b.AmountReceived - totalGross,
            paidToOwners, b.Status == PalmBatchStatus.Posted ? totalNet - paidToOwners : 0,
            chargeTotals, tickets, owners,
            b.CreatedBy?.FullName ?? "", b.CreatedAt);
    }

    public async Task<int> CreateAsync(PalmBatchInput i)
    {
        await WriteLock.WaitAsync();
        try
        {
            var tickets = await ValidateAsync(i);
            var b = new PalmBatch
            {
                Number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.PalmBatch, i.Date),
                CreatedById = user.Id,
            };
            ApplyHeader(b, i);
            b.Tickets = tickets;
            db.PalmBatches.Add(b);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "PalmBatch", b.Id, newValue: Snapshot(b));
            await db.SaveChangesAsync();
            return b.Id;
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task UpdateAsync(int id, PalmBatchInput i)
    {
        var b = await db.PalmBatches.Include(x => x.Tickets).ThenInclude(t => t.Charges).FirstOrDefaultAsync(x => x.Id == id)
                ?? throw new NotFoundException();
        if (b.Status != PalmBatchStatus.Draft)
            throw new SalesException("Hanya draf boleh diubah. Buka semula bayaran kilang ini dahulu.");
        var tickets = await ValidateAsync(i);
        var old = Snapshot(b);
        ApplyHeader(b, i);
        db.PalmTickets.RemoveRange(b.Tickets);
        b.Tickets = tickets;
        b.UpdatedAt = DateTime.UtcNow;
        audit.Log(AuditActions.Update, "PalmBatch", id, old, Snapshot(b));
        await db.SaveChangesAsync();
    }

    /// <summary>Padam draf terus (belum ada kesan pada akaun).</summary>
    public async Task DeleteDraftAsync(int id)
    {
        var b = await db.PalmBatches.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (b.Status != PalmBatchStatus.Draft) throw new SalesException("Hanya draf boleh dipadam. Guna Batal untuk bayaran yang sudah disahkan.");
        db.PalmBatches.Remove(b);
        audit.Log(AuditActions.Delete, "PalmBatch", id, new { b.Number, b.MillName, b.AmountReceived });
        await db.SaveChangesAsync();
    }

    /// <summary>Sahkan: rekod pendapatan caj + duit pemilik ke akaun.</summary>
    public async Task PostAsync(int id)
    {
        await WriteLock.WaitAsync();
        try
        {
            var b = await db.PalmBatches.Include(x => x.Tickets).ThenInclude(t => t.Charges).ThenInclude(c => c.ChargeType)
                        .FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
            if (b.Status != PalmBatchStatus.Draft) throw new SalesException("Bayaran kilang ini sudah disahkan atau dibatalkan.");
            if (b.Tickets.Count == 0) throw new SalesException("Masukkan sekurang-kurangnya satu tiket.");
            var gross = b.Tickets.Sum(t => t.Gross);
            if (gross != b.AmountReceived)
                throw new SalesException($"Jumlah tiket (RM{gross:N2}) tidak sama dengan amaun diterima dari kilang (RM{b.AmountReceived:N2}). Betulkan dahulu.");

            var txs = new List<Transaction>();
            foreach (var g in b.Tickets.SelectMany(t => t.Charges).Where(c => c.Amount != 0).GroupBy(c => c.ChargeTypeId))
            {
                var type = g.First().ChargeType!;
                txs.Add(NewTransaction(b, TransactionType.Income, g.Sum(c => c.Amount), type.CategoryId,
                    $"{type.Name} — bayaran kilang {b.Number}"));
            }
            var net = b.Tickets.Sum(t => t.Net);
            if (net > 0) txs.Add(NewTransaction(b, TransactionType.PalmIn, net, null, $"Duit pemilik sawit — bayaran kilang {b.Number}"));

            foreach (var t in txs) b.Postings.Add(new PalmBatchTransaction { Transaction = t });
            b.Status = PalmBatchStatus.Posted;
            b.PostedAt = DateTime.UtcNow;
            audit.Log(AuditActions.Approve, "PalmBatch", id, newValue: new { b.Number, Charges = gross - net, OwnersNet = net });
            await db.SaveChangesAsync();
        }
        finally
        {
            WriteLock.Release();
        }
    }

    /// <summary>Buka semula untuk diubah (hanya jika belum ada pemilik dibayar). Rekod duit dipadam.</summary>
    public async Task ReopenAsync(int id)
    {
        await WriteLock.WaitAsync();
        try
        {
            var b = await LoadForUnpostAsync(id);
            await RemovePostingsAsync(b);
            b.Status = PalmBatchStatus.Draft;
            b.PostedAt = null;
            b.UpdatedAt = DateTime.UtcNow;
            audit.Log(AuditActions.Update, "PalmBatch", id, newValue: new { b.Number, Reopened = true });
            await db.SaveChangesAsync();
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task CancelAsync(int id, string reason)
    {
        await WriteLock.WaitAsync();
        try
        {
            var b = await db.PalmBatches.Include(x => x.Postings).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
            if (b.Status == PalmBatchStatus.Cancelled) throw new SalesException("Bayaran kilang ini sudah dibatalkan.");
            if (b.Status == PalmBatchStatus.Posted)
            {
                b = await LoadForUnpostAsync(id);
                await RemovePostingsAsync(b);
            }
            b.Status = PalmBatchStatus.Cancelled;
            b.CancelReason = reason.Trim();
            b.UpdatedAt = DateTime.UtcNow;
            audit.Log(AuditActions.Cancel, "PalmBatch", id, newValue: new { b.Number, Reason = b.CancelReason });
            await db.SaveChangesAsync();
        }
        finally
        {
            WriteLock.Release();
        }
    }

    private async Task<PalmBatch> LoadForUnpostAsync(int id)
    {
        var b = await db.PalmBatches.Include(x => x.Postings).FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (b.Status != PalmBatchStatus.Posted) throw new SalesException("Bayaran kilang ini belum disahkan.");
        if (await db.PalmPayouts.AnyAsync(p => p.BatchId == id && !p.IsVoided))
            throw new SalesException("Sudah ada pemilik dibayar. Batalkan bayaran pemilik dahulu.");
        return b;
    }

    private async Task RemovePostingsAsync(PalmBatch b)
    {
        var txIds = b.Postings.Select(p => p.TransactionId).ToList();
        foreach (var t in await db.Transactions.Where(t => txIds.Contains(t.Id)).ToListAsync())
        {
            t.IsDeleted = true;
            t.UpdatedAt = DateTime.UtcNow;
        }
        db.PalmBatchTransactions.RemoveRange(b.Postings);
        b.Postings.Clear();
    }

    // =====================================================================
    // Bayar pemilik
    // =====================================================================

    public async Task<PalmPayoutDto> PayAsync(PalmPayoutInput i)
    {
        await WriteLock.WaitAsync();
        try
        {
            await using var dbTx = await db.Database.BeginTransactionAsync();
            var b = await db.PalmBatches.FirstOrDefaultAsync(x => x.Id == i.BatchId) ?? throw new NotFoundException();
            if (b.Status != PalmBatchStatus.Posted) throw new SalesException("Sahkan bayaran kilang dahulu sebelum bayar pemilik.");
            var owner = await db.PalmOwners.FirstOrDefaultAsync(o => o.Id == i.OwnerId) ?? throw new NotFoundException();
            var amount = await db.PalmTickets.Where(t => t.BatchId == b.Id && t.OwnerId == owner.Id).SumAsync(t => (decimal?)t.Net) ?? 0;

            new Check()
                .Field(amount > 0, "ownerId", "Tiada amaun untuk dibayar kepada pemilik ini.")
                .Field(!await db.PalmPayouts.AnyAsync(p => p.BatchId == b.Id && p.OwnerId == owner.Id && !p.IsVoided), "ownerId", "Pemilik ini sudah dibayar.")
                .Field(i.Date != default && i.Date <= Today, "date", "Tarikh tidak boleh selepas hari ini.")
                .Field(Enum.IsDefined(i.Method), "method", "Pilih kaedah bayaran.")
                .Field(await AccountValidAsync(i.AccountId, b.BusinessUnitId), "accountId", "Pilih akaun perniagaan ini.")
                .ThrowIfAny();

            var number = await DocumentNumbers.NextAsync(db, _doc, DocumentType.PalmPayout, i.Date);
            var payout = new PalmPayout
            {
                Number = number, BatchId = b.Id, OwnerId = owner.Id, Date = i.Date, Amount = amount,
                AccountId = i.AccountId, Method = i.Method, Reference = Clean(i.Reference), CreatedById = user.Id,
                Transaction = new Transaction
                {
                    Date = i.Date, Type = TransactionType.PalmPayout, Amount = amount, BusinessUnitId = b.BusinessUnitId,
                    AccountId = i.AccountId, Channel = Ledger.ChannelFor(i.Method), Party = owner.Name, Reference = number,
                    Description = $"Bayaran sawit — bayaran kilang {b.Number}", CreatedById = user.Id,
                },
            };
            db.PalmPayouts.Add(payout);
            await db.SaveChangesAsync();
            audit.Log(AuditActions.Create, "PalmPayout", payout.Id, newValue: new { payout.Number, Batch = b.Number, Owner = owner.Name, payout.Amount, payout.Method });
            await db.SaveChangesAsync();
            await dbTx.CommitAsync();

            var saved = await db.PalmPayouts.AsNoTracking().Include(p => p.Owner).Include(p => p.Account).Include(p => p.CreatedBy)
                .FirstAsync(p => p.Id == payout.Id);
            return ToDto(saved, b.Number);
        }
        finally
        {
            WriteLock.Release();
        }
    }

    public async Task VoidPayoutAsync(int id, string reason)
    {
        var p = await db.PalmPayouts.FirstOrDefaultAsync(x => x.Id == id) ?? throw new NotFoundException();
        if (p.IsVoided) throw new SalesException("Bayaran ini sudah dibatalkan.");
        p.IsVoided = true;
        p.VoidReason = reason.Trim();
        p.VoidedAt = DateTime.UtcNow;
        if (p.TransactionId is int tid && await db.Transactions.FirstOrDefaultAsync(t => t.Id == tid) is { } t)
        {
            t.IsDeleted = true;
            t.UpdatedAt = DateTime.UtcNow;
        }
        audit.Log(AuditActions.Void, "PalmPayout", id, newValue: new { p.Number, Reason = p.VoidReason });
        await db.SaveChangesAsync();
    }

    // =====================================================================
    // Helpers
    // =====================================================================

    private async Task<List<PalmTicket>> ValidateAsync(PalmBatchInput i)
    {
        var v = new Check()
            .Field(!string.IsNullOrWhiteSpace(i.MillName), "millName", "Nama kilang diperlukan.")
            .Field(i.Date != default && i.Date <= Today, "date", "Tarikh tidak boleh selepas hari ini.")
            .Field(Math.Round(i.AmountReceived, 2) > 0, "amountReceived", "Masukkan amaun yang diterima dari kilang.")
            .Field(await db.BusinessUnits.AnyAsync(u => u.Id == i.BusinessUnitId && u.IsActive), "businessUnitId", "Pilih perniagaan / servis.")
            .Field(await AccountValidAsync(i.AccountId, i.BusinessUnitId), "accountId", "Pilih akaun perniagaan ini.")
            .Field(Enum.IsDefined(i.Channel), "channel", "Pilih Tunai atau Bank.");

        var ownerIds = i.Tickets.Select(t => t.OwnerId).Distinct().ToList();
        var activeOwners = await db.PalmOwners.Where(o => ownerIds.Contains(o.Id) && o.IsActive).Select(o => o.Id).ToListAsync();
        var typeIds = i.Tickets.SelectMany(t => t.Charges).Select(c => c.ChargeTypeId).Distinct().ToList();
        var activeTypes = await db.PalmChargeTypes.Where(c => typeIds.Contains(c.Id) && c.IsActive).Select(c => c.Id).ToListAsync();

        var tickets = new List<PalmTicket>();
        for (var n = 0; n < i.Tickets.Count; n++)
        {
            var t = i.Tickets[n];
            var row = $"Tiket {n + 1}";
            var weight = Math.Round(t.WeightKg, 2);
            var gross = Math.Round(t.Gross, 2);
            if (gross <= 0 && t.PricePerTonne is decimal p && weight > 0) gross = PalmMath.Gross(weight, p);

            v.Field(activeOwners.Contains(t.OwnerId), $"tickets.{n}.ownerId", $"{row}: pilih pemilik.")
             .Field(t.Date != default && t.Date <= Today, $"tickets.{n}.date", $"{row}: tarikh tidak sah.")
             .Field(weight >= 0, $"tickets.{n}.weightKg", $"{row}: berat tidak boleh negatif.")
             .Field(t.PricePerTonne is null or >= 0, $"tickets.{n}.pricePerTonne", $"{row}: harga tidak boleh negatif.")
             .Field(gross > 0, $"tickets.{n}.gross", $"{row}: masukkan amaun (RM).")
             .Field(t.Charges.Select(c => c.ChargeTypeId).Distinct().Count() == t.Charges.Count, $"tickets.{n}.charges", $"{row}: caj berulang.");

            var charges = new List<PalmTicketCharge>();
            foreach (var c in t.Charges)
            {
                v.Field(activeTypes.Contains(c.ChargeTypeId), $"tickets.{n}.charges", $"{row}: jenis caj tidak sah.")
                 .Field(Enum.IsDefined(c.Method), $"tickets.{n}.charges", $"{row}: cara kira caj tidak sah.")
                 .Field(c.Rate >= 0, $"tickets.{n}.charges", $"{row}: kadar caj tidak boleh negatif.")
                 .Field(c.Method != ChargeMethod.PerTonne || weight > 0, $"tickets.{n}.weightKg", $"{row}: masukkan berat untuk caj per tan.");
                var amount = PalmMath.Charge(c.Method, c.Rate, weight, gross);
                if (amount != 0) charges.Add(new PalmTicketCharge { ChargeTypeId = c.ChargeTypeId, Method = c.Method, Rate = c.Rate, Amount = amount });
            }
            var net = gross - charges.Sum(c => c.Amount);
            v.Field(net >= 0, $"tickets.{n}.charges", $"{row}: caj melebihi amaun tiket.");

            tickets.Add(new PalmTicket
            {
                OwnerId = t.OwnerId, TicketNo = Clean(t.TicketNo), Date = t.Date, WeightKg = weight, PricePerTonne = t.PricePerTonne,
                Gross = gross, Net = net, SortOrder = n + 1, Charges = charges,
            });
        }
        v.ThrowIfAny();
        return tickets;
    }

    /// <summary>Akaun aktif milik perniagaan ini (atau akaun dikongsi lama).</summary>
    private Task<bool> AccountValidAsync(int accountId, int businessUnitId) =>
        db.Accounts.AnyAsync(a => a.Id == accountId && a.IsActive && (a.BusinessUnitId == null || a.BusinessUnitId == businessUnitId));

    private static void ApplyHeader(PalmBatch b, PalmBatchInput i)
    {
        b.MillName = i.MillName.Trim();
        b.Date = i.Date;
        b.AmountReceived = Math.Round(i.AmountReceived, 2);
        b.BusinessUnitId = i.BusinessUnitId;
        b.AccountId = i.AccountId;
        b.Channel = i.Channel;
        b.Reference = Clean(i.Reference);
        b.Notes = Clean(i.Notes);
    }

    private Transaction NewTransaction(PalmBatch b, TransactionType type, decimal amount, int? categoryId, string description) => new()
    {
        Date = b.Date, Type = type, Amount = amount, BusinessUnitId = b.BusinessUnitId, AccountId = b.AccountId,
        Channel = b.Channel, CategoryId = categoryId, Party = b.MillName, Reference = b.Number, Description = description,
        CreatedById = user.Id,
    };

    private static object Snapshot(PalmBatch b) => new
    {
        b.Number, b.MillName, b.Date, b.AmountReceived, b.BusinessUnitId, b.AccountId, b.Channel,
        Tickets = b.Tickets.Count, Gross = b.Tickets.Sum(t => t.Gross), Net = b.Tickets.Sum(t => t.Net),
    };

    private static PalmPayoutDto ToDto(PalmPayout p, string batchNumber) => new(
        p.Id, p.Number, p.BatchId, batchNumber, p.OwnerId, p.Owner?.Name ?? "", p.Date, p.Amount,
        p.AccountId, p.Account?.Name ?? "", p.Method, p.Reference, p.IsVoided, p.VoidReason, p.CreatedBy?.FullName ?? "", p.CreatedAt);

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
