namespace Fms.Api.Domain;

// =====================================================================
// Modul daripada use case diagram FMS:
//   Manage Employee, Manage Employee Wages, Manage Utility Expenses,
//   Manage Financial Claim Request / Approve Financial Claim.
//
// Setiap bayaran (gaji, bil utiliti, tuntutan) menjana satu rekod Duit Keluar
// (Transaction jenis Expense) yang dikunci. Untung rugi dan baki akaun dikira
// daripada rekod tersebut, sama seperti modul lain.
// =====================================================================

public enum EmploymentType
{
    /// <summary>Gaji bulanan tetap.</summary>
    Monthly = 1,
    /// <summary>Upah harian (hari bekerja × kadar).</summary>
    Daily = 2
}

public enum UtilityType { Electricity = 1, Water = 2, Internet = 3, Phone = 4, Rent = 5, Gas = 6, Other = 7 }

public enum UtilityBillStatus { Unpaid = 1, Paid = 2 }

public enum ClaimStatus
{
    /// <summary>Menunggu kelulusan Pengurus.</summary>
    Pending = 1,
    /// <summary>Diluluskan, belum dibayar.</summary>
    Approved = 2,
    Rejected = 3,
    /// <summary>Sudah dibayar balik (rekod Duit Keluar dicipta).</summary>
    Paid = 4
}

/// <summary>Pekerja.</summary>
public class Employee
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? IcNo { get; set; }
    public string? Phone { get; set; }
    public string? Position { get; set; }
    /// <summary>Perniagaan tempat bekerja (lalai untuk rekod gaji).</summary>
    public int? BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    public EmploymentType EmploymentType { get; set; } = EmploymentType.Monthly;
    /// <summary>Gaji bulanan, atau kadar upah sehari.</summary>
    public decimal BasicRate { get; set; }
    public DateOnly? JoinDate { get; set; }
    public string? BankName { get; set; }
    public string? BankAccountNo { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Bayaran gaji (slip gaji). Menjana Duit Keluar sebanyak gaji bersih.</summary>
public class Wage
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public int EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    /// <summary>Bulan gaji, "yyyy-MM".</summary>
    public string PeriodMonth { get; set; } = "";
    public decimal? DaysWorked { get; set; }
    public decimal BasicPay { get; set; }
    public decimal Allowance { get; set; }
    public decimal Overtime { get; set; }
    /// <summary>Potongan (contoh: pendahuluan gaji).</summary>
    public decimal Deduction { get; set; }
    public decimal NetPay { get; set; }
    public DateOnly PayDate { get; set; }

    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    public int AccountId { get; set; }
    public Account? Account { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public PaymentMethod Method { get; set; } = PaymentMethod.Cash;
    public string? Notes { get; set; }

    public int? TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public bool IsVoided { get; set; }
    public string? VoidReason { get; set; }
    public DateTime? VoidedAt { get; set; }
    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Bil utiliti. Bila dibayar, Duit Keluar dicipta dengan kategori bil.</summary>
public class UtilityBill
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public UtilityType Type { get; set; }
    public string? Provider { get; set; }
    public string? AccountNo { get; set; }
    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public DateOnly BillDate { get; set; }
    public DateOnly DueDate { get; set; }
    /// <summary>Bulan penggunaan, "yyyy-MM".</summary>
    public string PeriodMonth { get; set; } = "";
    public decimal Amount { get; set; }
    public UtilityBillStatus Status { get; set; } = UtilityBillStatus.Unpaid;

    public DateOnly? PaidDate { get; set; }
    public int? PaidAccountId { get; set; }
    public Account? PaidAccount { get; set; }
    public PaymentMethod? Method { get; set; }
    public string? Reference { get; set; }
    public string? Notes { get; set; }
    public int? TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public int CreatedById { get; set; }
    public User? CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>Tuntutan kewangan: Kerani mohon → Pengurus lulus / tolak → bayar balik.</summary>
public class FinancialClaim
{
    public int Id { get; set; }
    public string Number { get; set; } = "";
    public int RequestedById { get; set; }
    public User? RequestedBy { get; set; }
    /// <summary>Tuntutan bagi pihak pekerja. Kosong = tuntutan pemohon sendiri.</summary>
    public int? EmployeeId { get; set; }
    public Employee? Employee { get; set; }
    public DateOnly ClaimDate { get; set; }
    public int BusinessUnitId { get; set; }
    public BusinessUnit? BusinessUnit { get; set; }
    /// <summary>Kategori belanja (contoh: Minyak & tol).</summary>
    public int CategoryId { get; set; }
    public Category? Category { get; set; }
    public string Description { get; set; } = "";
    public decimal Amount { get; set; }
    public string? ReceiptFile { get; set; }
    public string? ReceiptOriginalName { get; set; }

    public ClaimStatus Status { get; set; } = ClaimStatus.Pending;
    public int? ReviewedById { get; set; }
    public User? ReviewedBy { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewRemark { get; set; }

    public DateOnly? PaidDate { get; set; }
    public int? PaidAccountId { get; set; }
    public Account? PaidAccount { get; set; }
    public PaymentMethod? Method { get; set; }
    public int? TransactionId { get; set; }
    public Transaction? Transaction { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}
