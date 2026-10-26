namespace Fms.Api.Domain;

public class User
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public UserRole Role { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Perniagaan: Nenas, Sawit, Kedai Runcit, dll.</summary>
public class BusinessUnit
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public string? Color { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    // Maklumat yang dicetak pada sebut harga / invois / resit
    public string? LegalName { get; set; }
    public string? RegistrationNo { get; set; }
    public string? Address { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    /// <summary>Contoh: "Maybank 1234 5678 9012 (Ali bin Abu)"</summary>
    public string? PaymentInfo { get; set; }
    public string? DocumentFooter { get; set; }
}

/// <summary>Tempat simpan duit: tunai atau akaun bank.</summary>
public class Account
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public AccountType Type { get; set; }
    public decimal OpeningBalance { get; set; }

    /// <summary>Jika diisi, akaun ini milik perniagaan tertentu. Kosong = akaun dikongsi.</summary>
    public int? BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Category
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public CategoryType Type { get; set; }

    /// <summary>Kosong = kategori boleh digunakan oleh semua perniagaan.</summary>
    public int? BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>Ahli keluarga yang boleh ambil duit atau masukkan modal.</summary>
public class FamilyMember
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Relationship { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Transaction
{
    public int Id { get; set; }
    public DateOnly Date { get; set; }
    public TransactionType Type { get; set; }
    public decimal Amount { get; set; }

    /// <summary>Perniagaan. Untuk InternalLoan: perniagaan yang memberi pinjam.</summary>
    public int? BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }

    /// <summary>Hanya untuk InternalLoan: perniagaan yang meminjam.</summary>
    public int? ToBusinessUnitId { get; set; }
    public BusinessUnit? ToBusinessUnit { get; set; }

    /// <summary>Akaun duit masuk/keluar. Untuk Transfer/InternalLoan: akaun asal.</summary>
    public int AccountId { get; set; }
    public Account? Account { get; set; }

    /// <summary>Hanya untuk Transfer/InternalLoan: akaun destinasi.</summary>
    public int? ToAccountId { get; set; }
    public Account? ToAccount { get; set; }

    public int? CategoryId { get; set; }
    public Category? Category { get; set; }

    public int? FamilyMemberId { get; set; }
    public FamilyMember? FamilyMember { get; set; }

    /// <summary>Pelanggan atau pembekal (teks bebas untuk Fasa 1).</summary>
    public string? Party { get; set; }
    public string? Reference { get; set; }
    public string? Description { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    public bool IsDeleted { get; set; }
}

public class AuditLog
{
    public long Id { get; set; }
    public int? UserId { get; set; }
    public string Username { get; set; } = "";
    public string Action { get; set; } = "";
    public string Entity { get; set; } = "";
    public string EntityId { get; set; } = "";
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}
