namespace Fms.Api.Domain;

/// <summary>Dua pengguna: Pengurus (ayah) dan Kerani (anak).</summary>
public enum UserRole
{
    /// <summary>Pengurus: semua tetapan, lulus tuntutan, padam rekod.</summary>
    Manager = 1,

    /// <summary>Kerani: semua kemasukan data harian dan laporan.</summary>
    Clerk = 2
}

public enum AccountType
{
    Cash = 1,
    Bank = 2
}

/// <summary>Jenis unit: perniagaan (contoh Nenas, Kedai) atau servis (contoh Transport).</summary>
public enum UnitKind
{
    Business = 1,
    Service = 2
}

/// <summary>
/// Label Tunai / Bank pada setiap rekod duit (untuk tapisan & laporan).
/// Baki tetap dikira ikut akaun — satu akaun bagi setiap perniagaan.
/// </summary>
public enum MoneyChannel
{
    Cash = 1,
    Bank = 2
}

public enum CategoryType
{
    Income = 1,
    Expense = 2
}

/// <summary>
/// Jenis rekod. Hanya Income dan Expense dikira dalam untung/rugi perniagaan.
/// </summary>
public enum TransactionType
{
    /// <summary>Duit masuk (pendapatan perniagaan).</summary>
    Income = 1,

    /// <summary>Duit keluar (belanja perniagaan).</summary>
    Expense = 2,

    /// <summary>Pindah duit antara akaun (contoh: Maybank ke Tunai). Bukan untung/rugi.</summary>
    Transfer = 3,

    /// <summary>Ahli keluarga ambil duit untuk kegunaan sendiri. Bukan belanja perniagaan.</summary>
    OwnerWithdrawal = 4,

    /// <summary>Ahli keluarga masukkan modal ke perniagaan. Bukan pendapatan.</summary>
    OwnerCapital = 5,

    /// <summary>Satu perniagaan pinjam duit dari perniagaan lain. Bukan untung/rugi.</summary>
    InternalLoan = 6,

    /// <summary>Duit pinjaman (bank / orang luar) masuk ke akaun. Bukan pendapatan. Hanya dari modul Hutang.</summary>
    LoanIn = 7,

    /// <summary>Bayar balik pokok pinjaman. Bukan belanja (faedah direkod berasingan sebagai Duit keluar). Hanya dari modul Hutang.</summary>
    LoanRepayment = 8
}
