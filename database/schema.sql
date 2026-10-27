-- =====================================================================
-- FMS: Sistem Pengurusan Kewangan Ajib Business
-- Skema pangkalan data MySQL 8 / MariaDB 10.4+
--
-- SATU-SATUNYA sumber struktur DB. Fail ini dibenamkan ke dalam backend dan
-- dijalankan setiap kali aplikasi bermula (Data/SchemaInitializer.cs), jadi semua
-- arahan mesti "IF NOT EXISTS". Pangkalan data (contoh: fms) dicipta automatik.
--
-- Mesti selari dengan model EF Core: backend/Fms.Api/Data/AppDbContext.cs
--
-- Cipta DB secara manual (pilihan):
--   mysql -u root -p -e "CREATE DATABASE fms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
--   mysql -u root -p fms < schema.sql
--   mysql -u root -p fms < seed.sql
--   mysql -u root -p fms < demo-data.sql      (pilihan: data contoh)
-- =====================================================================


-- Pengguna sistem ------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Users` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Username` VARCHAR(50) NOT NULL,  -- huruf kecil, unik
    `FullName` VARCHAR(100) NOT NULL,
    `PasswordHash` LONGTEXT NOT NULL,  -- BCrypt
    `Role` VARCHAR(20) NOT NULL,  -- Manager (Pengurus) | Clerk (Kerani)
    `IsActive` TINYINT(1) NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Users_Username` (`Username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Maklumat dicetak pada dokumen jualan
CREATE TABLE IF NOT EXISTS `BusinessUnits` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Description` VARCHAR(500) NULL,
    `Color` VARCHAR(20) NULL,
    `SortOrder` INT NOT NULL,
    `IsActive` TINYINT(1) NOT NULL,
    `LegalName` VARCHAR(150) NULL,
    `RegistrationNo` VARCHAR(50) NULL,
    `Address` VARCHAR(300) NULL,
    `Phone` VARCHAR(50) NULL,
    `Email` VARCHAR(100) NULL,
    `PaymentInfo` VARCHAR(300) NULL,
    `DocumentFooter` VARCHAR(300) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_BusinessUnits_Name` (`Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Akaun tunai / bank ----------------------------------------------------
CREATE TABLE IF NOT EXISTS `Accounts` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Type` VARCHAR(20) NOT NULL,  -- Cash | Bank
    `OpeningBalance` DECIMAL(18,2) NOT NULL,  -- baki pada hari mula guna sistem = OpeningCash + OpeningBank
    `OpeningCash` DECIMAL(18,2) NOT NULL DEFAULT 0,  -- baki awal dalam tunai
    `OpeningBank` DECIMAL(18,2) NOT NULL DEFAULT 0,  -- baki awal dalam bank
    `BusinessUnitId` INT NULL,  -- NULL = akaun dikongsi
    `SortOrder` INT NOT NULL,
    `IsActive` TINYINT(1) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Accounts_Name` (`Name`),
    KEY `IX_Accounts_BusinessUnitId` (`BusinessUnitId`),
    CONSTRAINT `FK_Accounts_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kategori duit masuk / keluar -----------------------------------------
CREATE TABLE IF NOT EXISTS `Categories` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Type` VARCHAR(20) NOT NULL,  -- Income | Expense
    `BusinessUnitId` INT NULL,  -- NULL = semua perniagaan
    `SortOrder` INT NOT NULL,
    `IsActive` TINYINT(1) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_Categories_BusinessUnitId` (`BusinessUnitId`),
    CONSTRAINT `FK_Categories_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ahli keluarga (untuk ambilan & modal) --------------------------------
CREATE TABLE IF NOT EXISTS `FamilyMembers` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(100) NOT NULL,
    `Relationship` LONGTEXT NULL,
    `IsActive` TINYINT(1) NOT NULL,
    PRIMARY KEY (`Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--                   BusinessUnitId = pemberi, ToBusinessUnitId = peminjam
CREATE TABLE IF NOT EXISTS `Transactions` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Date` DATE NOT NULL,
    `Type` VARCHAR(20) NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    `BusinessUnitId` INT NULL,
    `ToBusinessUnitId` INT NULL,
    `AccountId` INT NOT NULL,
    `ToAccountId` INT NULL,
    `CategoryId` INT NULL,
    `Channel` VARCHAR(10) NULL,  -- Cash | Bank (label Tunai / Bank; pindahan: bahagian asal)
    `ToChannel` VARCHAR(10) NULL,  -- pindahan sahaja: Cash | Bank di destinasi
    `FamilyMemberId` INT NULL,
    `Party` VARCHAR(150) NULL,  -- pelanggan / pembekal
    `Reference` VARCHAR(50) NULL,  -- no. resit jika dari modul jualan
    `Description` VARCHAR(500) NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    `IsDeleted` TINYINT(1) NOT NULL,  -- soft delete
    PRIMARY KEY (`Id`),
    KEY `IX_Transactions_Date` (`Date`),
    KEY `IX_Transactions_BusinessUnitId_Date` (`BusinessUnitId`, `Date`),
    KEY `IX_Transactions_ToBusinessUnitId` (`ToBusinessUnitId`),
    KEY `IX_Transactions_AccountId` (`AccountId`),
    KEY `IX_Transactions_ToAccountId` (`ToAccountId`),
    KEY `IX_Transactions_CategoryId` (`CategoryId`),
    KEY `IX_Transactions_FamilyMemberId` (`FamilyMemberId`),
    KEY `IX_Transactions_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_Transactions_BusinessUnits_BusinessUnitId`   FOREIGN KEY (`BusinessUnitId`)   REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_BusinessUnits_ToBusinessUnitId` FOREIGN KEY (`ToBusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_Accounts_AccountId`             FOREIGN KEY (`AccountId`)        REFERENCES `Accounts` (`Id`)      ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_Accounts_ToAccountId`           FOREIGN KEY (`ToAccountId`)      REFERENCES `Accounts` (`Id`)      ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_Categories_CategoryId`          FOREIGN KEY (`CategoryId`)       REFERENCES `Categories` (`Id`)    ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_FamilyMembers_FamilyMemberId`   FOREIGN KEY (`FamilyMemberId`)   REFERENCES `FamilyMembers` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Transactions_Users_CreatedById`              FOREIGN KEY (`CreatedById`)      REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Log perubahan ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `AuditLogs` (
    `Id` BIGINT NOT NULL AUTO_INCREMENT,
    `UserId` INT NULL,
    `Username` VARCHAR(50) NOT NULL,
    `Action` VARCHAR(30) NOT NULL,  -- Create | Update | Delete | ResetPassword | Convert | Void | Cancel
    `Entity` VARCHAR(50) NOT NULL,
    `EntityId` VARCHAR(50) NOT NULL,
    `OldValue` LONGTEXT NULL,  -- JSON
    `NewValue` LONGTEXT NULL,  -- JSON
    `Timestamp` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_AuditLogs_Timestamp` (`Timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pelanggan -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Customers` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(150) NOT NULL,
    `ContactPerson` VARCHAR(100) NULL,
    `Phone` VARCHAR(50) NULL,
    `Email` VARCHAR(100) NULL,
    `Address` VARCHAR(300) NULL,
    `RegistrationNo` VARCHAR(50) NULL,  -- No. SSM
    `Tag` VARCHAR(50) NULL,  -- Pemborong, Kilang, Restoran ...
    `Notes` VARCHAR(1000) NULL,
    `IsActive` TINYINT(1) NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_Customers_Name` (`Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Catatan interaksi & tindakan susulan ----------------------------------
CREATE TABLE IF NOT EXISTS `CustomerActivities` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `CustomerId` INT NOT NULL,
    `Date` DATE NOT NULL,
    `Type` VARCHAR(20) NOT NULL,  -- Note | Call | WhatsApp | Visit | Email | Meeting
    `Note` VARCHAR(1000) NOT NULL,
    `FollowUpDate` DATE NULL,
    `FollowUpDone` TINYINT(1) NOT NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_CustomerActivities_CustomerId_Date` (`CustomerId`, `Date`),
    KEY `IX_CustomerActivities_FollowUpDate` (`FollowUpDate`),
    KEY `IX_CustomerActivities_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_CustomerActivities_Customers_CustomerId` FOREIGN KEY (`CustomerId`)  REFERENCES `Customers` (`Id`) ON DELETE CASCADE,
    CONSTRAINT `FK_CustomerActivities_Users_CreatedById`    FOREIGN KEY (`CreatedById`) REFERENCES `Users` (`Id`)     ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sebut harga -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Quotations` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- SH-2026-0001
    `BusinessUnitId` INT NOT NULL,
    `CustomerId` INT NOT NULL,
    `Date` DATE NOT NULL,
    `ValidUntil` DATE NOT NULL,
    `Status` VARCHAR(20) NOT NULL,  -- Draft | Sent | Accepted | Rejected | Converted
    `InvoiceId` INT NULL,  -- invois yang dijana
    `Subject` VARCHAR(200) NULL,
    `Notes` VARCHAR(1000) NULL,
    `Terms` VARCHAR(2000) NULL,
    `Subtotal` DECIMAL(18,2) NOT NULL,
    `DiscountAmount` DECIMAL(18,2) NOT NULL,
    `TaxRate` DECIMAL(5,2) NOT NULL,
    `TaxAmount` DECIMAL(18,2) NOT NULL,
    `Total` DECIMAL(18,2) NOT NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Quotations_Number` (`Number`),
    KEY `IX_Quotations_Date` (`Date`),
    KEY `IX_Quotations_CustomerId` (`CustomerId`),
    KEY `IX_Quotations_BusinessUnitId` (`BusinessUnitId`),
    KEY `IX_Quotations_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_Quotations_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Quotations_Customers_CustomerId`         FOREIGN KEY (`CustomerId`)     REFERENCES `Customers` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_Quotations_Users_CreatedById`            FOREIGN KEY (`CreatedById`)    REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `QuotationItems` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `QuotationId` INT NOT NULL,
    `SortOrder` INT NOT NULL,
    `Description` VARCHAR(500) NOT NULL,
    `Quantity` DECIMAL(18,3) NOT NULL,
    `Unit` VARCHAR(20) NULL,
    `UnitPrice` DECIMAL(18,2) NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_QuotationItems_QuotationId` (`QuotationId`),
    CONSTRAINT `FK_QuotationItems_Quotations_QuotationId` FOREIGN KEY (`QuotationId`) REFERENCES `Quotations` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invois ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `Invoices` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- INV-2026-0001
    `BusinessUnitId` INT NOT NULL,
    `CustomerId` INT NOT NULL,
    `Date` DATE NOT NULL,
    `DueDate` DATE NOT NULL,
    `Status` VARCHAR(20) NOT NULL,  -- Unpaid | PartiallyPaid | Paid | Cancelled
    `QuotationId` INT NULL,
    `AmountPaid` DECIMAL(18,2) NOT NULL,  -- jumlah resit aktif
    `CancelReason` VARCHAR(300) NULL,
    `Subject` VARCHAR(200) NULL,
    `Notes` VARCHAR(1000) NULL,
    `Terms` VARCHAR(2000) NULL,
    `Subtotal` DECIMAL(18,2) NOT NULL,
    `DiscountAmount` DECIMAL(18,2) NOT NULL,
    `TaxRate` DECIMAL(5,2) NOT NULL,
    `TaxAmount` DECIMAL(18,2) NOT NULL,
    `Total` DECIMAL(18,2) NOT NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Invoices_Number` (`Number`),
    KEY `IX_Invoices_Date` (`Date`),
    KEY `IX_Invoices_CustomerId` (`CustomerId`),
    KEY `IX_Invoices_BusinessUnitId` (`BusinessUnitId`),
    KEY `IX_Invoices_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_Invoices_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Invoices_Customers_CustomerId`         FOREIGN KEY (`CustomerId`)     REFERENCES `Customers` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_Invoices_Users_CreatedById`            FOREIGN KEY (`CreatedById`)    REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `InvoiceItems` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `InvoiceId` INT NOT NULL,
    `SortOrder` INT NOT NULL,
    `Description` VARCHAR(500) NOT NULL,
    `Quantity` DECIMAL(18,3) NOT NULL,
    `Unit` VARCHAR(20) NULL,
    `UnitPrice` DECIMAL(18,2) NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_InvoiceItems_InvoiceId` (`InvoiceId`),
    CONSTRAINT `FK_InvoiceItems_Invoices_InvoiceId` FOREIGN KEY (`InvoiceId`) REFERENCES `Invoices` (`Id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- IsVoided = 1 dan rekod Transactions berkaitan di-soft-delete.
CREATE TABLE IF NOT EXISTS `Payments` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- RS-2026-0001
    `Date` DATE NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    `Method` VARCHAR(20) NOT NULL,  -- Cash | BankTransfer | DuitNow | Cheque | Card | Other
    `BusinessUnitId` INT NOT NULL,
    `CustomerId` INT NULL,
    `ReceivedFrom` VARCHAR(150) NOT NULL,
    `InvoiceId` INT NULL,
    `AccountId` INT NOT NULL,
    `CategoryId` INT NOT NULL,
    `TransactionId` INT NULL,
    `Reference` VARCHAR(50) NULL,
    `Description` VARCHAR(300) NULL,
    `IsCreditPayment` TINYINT(1) NOT NULL DEFAULT 0,  -- bayaran buku hutang kedai (555)
    `IsVoided` TINYINT(1) NOT NULL,
    `VoidReason` VARCHAR(300) NULL,
    `VoidedAt` DATETIME(6) NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Payments_Number` (`Number`),
    KEY `IX_Payments_Date` (`Date`),
    KEY `IX_Payments_InvoiceId` (`InvoiceId`),
    KEY `IX_Payments_CustomerId` (`CustomerId`),
    KEY `IX_Payments_BusinessUnitId` (`BusinessUnitId`),
    KEY `IX_Payments_AccountId` (`AccountId`),
    KEY `IX_Payments_CategoryId` (`CategoryId`),
    KEY `IX_Payments_TransactionId` (`TransactionId`),
    KEY `IX_Payments_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_Payments_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Customers_CustomerId`         FOREIGN KEY (`CustomerId`)     REFERENCES `Customers` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Invoices_InvoiceId`           FOREIGN KEY (`InvoiceId`)      REFERENCES `Invoices` (`Id`)      ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Accounts_AccountId`           FOREIGN KEY (`AccountId`)      REFERENCES `Accounts` (`Id`)      ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Categories_CategoryId`        FOREIGN KEY (`CategoryId`)     REFERENCES `Categories` (`Id`)    ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Transactions_TransactionId`   FOREIGN KEY (`TransactionId`)  REFERENCES `Transactions` (`Id`)  ON DELETE RESTRICT,
    CONSTRAINT `FK_Payments_Users_CreatedById`            FOREIGN KEY (`CreatedById`)    REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kaunter nombor dokumen -------------------------------------------------
CREATE TABLE IF NOT EXISTS `DocumentSequences` (
    `Type` VARCHAR(20) NOT NULL,  -- Quotation | Invoice | Receipt
    `Year` INT NOT NULL,
    `LastNumber` INT NOT NULL,
    CONSTRAINT `PK_DocumentSequences` PRIMARY KEY (`Type`, `Year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pembekal / pemiutang ---------------------------------------------------
CREATE TABLE IF NOT EXISTS `Suppliers` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(150) NOT NULL,
    `ContactPerson` VARCHAR(100) NULL,
    `Phone` VARCHAR(50) NULL,
    `Email` VARCHAR(100) NULL,
    `Address` VARCHAR(300) NULL,
    `Tag` VARCHAR(50) NULL,  -- Baja, Pengangkutan, Bank ...
    `Notes` VARCHAR(1000) NULL,
    `IsActive` TINYINT(1) NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_Suppliers_Name` (`Name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kind = Loan : duit masuk → 'LoanIn'; bayar pokok → 'LoanRepayment'; faedah → 'Expense'
CREATE TABLE IF NOT EXISTS `Payables` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- HT-2026-0001
    `Kind` VARCHAR(20) NOT NULL,  -- Bill | Loan
    `SupplierId` INT NOT NULL,
    `BusinessUnitId` INT NOT NULL,
    `CategoryId` INT NULL,  -- bil sahaja
    `Date` DATE NOT NULL,
    `DueDate` DATE NOT NULL,
    `Description` VARCHAR(300) NOT NULL,
    `SupplierReference` VARCHAR(50) NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    `AmountPaid` DECIMAL(18,2) NOT NULL,  -- pokok yang telah dibayar
    `InstallmentAmount` DECIMAL(18,2) NULL,
    `Status` VARCHAR(20) NOT NULL,  -- Unpaid | PartiallyPaid | Paid | Cancelled
    `Notes` VARCHAR(1000) NULL,
    `CancelReason` VARCHAR(300) NULL,
    `ReceivedTransactionId` INT NULL,  -- pinjaman: rekod duit pinjaman masuk
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Payables_Number` (`Number`),
    KEY `IX_Payables_DueDate` (`DueDate`),
    KEY `IX_Payables_SupplierId` (`SupplierId`),
    KEY `IX_Payables_BusinessUnitId` (`BusinessUnitId`),
    KEY `IX_Payables_CategoryId` (`CategoryId`),
    KEY `IX_Payables_ReceivedTransactionId` (`ReceivedTransactionId`),
    KEY `IX_Payables_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_Payables_Suppliers_SupplierId`                 FOREIGN KEY (`SupplierId`)            REFERENCES `Suppliers` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_Payables_BusinessUnits_BusinessUnitId`         FOREIGN KEY (`BusinessUnitId`)        REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Payables_Categories_CategoryId`                FOREIGN KEY (`CategoryId`)            REFERENCES `Categories` (`Id`)    ON DELETE RESTRICT,
    CONSTRAINT `FK_Payables_Transactions_ReceivedTransactionId`   FOREIGN KEY (`ReceivedTransactionId`) REFERENCES `Transactions` (`Id`)  ON DELETE RESTRICT,
    CONSTRAINT `FK_Payables_Users_CreatedById`                    FOREIGN KEY (`CreatedById`)           REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bayaran hutang (baucar bayaran) ---------------------------------------
CREATE TABLE IF NOT EXISTS `PayablePayments` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- BB-2026-0001
    `PayableId` INT NOT NULL,
    `Date` DATE NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,  -- pokok
    `InterestAmount` DECIMAL(18,2) NOT NULL,  -- faedah / caj (pinjaman)
    `InterestCategoryId` INT NULL,
    `AccountId` INT NOT NULL,
    `Method` VARCHAR(20) NOT NULL,
    `Reference` VARCHAR(50) NULL,
    `Notes` VARCHAR(300) NULL,
    `PrincipalTransactionId` INT NULL,
    `InterestTransactionId` INT NULL,
    `IsVoided` TINYINT(1) NOT NULL,
    `VoidReason` VARCHAR(300) NULL,
    `VoidedAt` DATETIME(6) NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_PayablePayments_Number` (`Number`),
    KEY `IX_PayablePayments_Date` (`Date`),
    KEY `IX_PayablePayments_PayableId` (`PayableId`),
    KEY `IX_PayablePayments_InterestCategoryId` (`InterestCategoryId`),
    KEY `IX_PayablePayments_AccountId` (`AccountId`),
    KEY `IX_PayablePayments_PrincipalTransactionId` (`PrincipalTransactionId`),
    KEY `IX_PayablePayments_InterestTransactionId` (`InterestTransactionId`),
    KEY `IX_PayablePayments_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_PayablePayments_Payables_PayableId`                 FOREIGN KEY (`PayableId`)              REFERENCES `Payables` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_PayablePayments_Categories_InterestCategoryId`      FOREIGN KEY (`InterestCategoryId`)     REFERENCES `Categories` (`Id`)   ON DELETE RESTRICT,
    CONSTRAINT `FK_PayablePayments_Accounts_AccountId`                 FOREIGN KEY (`AccountId`)              REFERENCES `Accounts` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_PayablePayments_Transactions_PrincipalTransactionId` FOREIGN KEY (`PrincipalTransactionId`) REFERENCES `Transactions` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_PayablePayments_Transactions_InterestTransactionId`  FOREIGN KEY (`InterestTransactionId`)  REFERENCES `Transactions` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_PayablePayments_Users_CreatedById`                  FOREIGN KEY (`CreatedById`)            REFERENCES `Users` (`Id`)        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pekerja (Manage Employee) --------------------------------------------
CREATE TABLE IF NOT EXISTS `Employees` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Name` VARCHAR(150) NOT NULL,
    `IcNo` VARCHAR(20) NULL,
    `Phone` VARCHAR(50) NULL,
    `Position` VARCHAR(100) NULL,
    `BusinessUnitId` INT NULL,  -- perniagaan tempat bekerja (lalai untuk gaji)
    `EmploymentType` VARCHAR(20) NOT NULL,  -- Monthly (bulanan) | Daily (harian)
    `BasicRate` DECIMAL(18,2) NOT NULL,  -- gaji sebulan atau kadar sehari
    `JoinDate` DATE NULL,
    `BankName` VARCHAR(50) NULL,
    `BankAccountNo` VARCHAR(30) NULL,
    `Notes` VARCHAR(1000) NULL,
    `IsActive` TINYINT(1) NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_Employees_BusinessUnitId` (`BusinessUnitId`),
    CONSTRAINT `FK_Employees_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Gaji (Manage Employee Wages) -----------------------------------------
CREATE TABLE IF NOT EXISTS `Wages` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- SG-yyyy-NNNN (slip gaji)
    `EmployeeId` INT NOT NULL,
    `PeriodMonth` VARCHAR(7) NOT NULL,  -- yyyy-MM
    `DaysWorked` DECIMAL(6,2) NULL,
    `BasicPay` DECIMAL(18,2) NOT NULL,
    `Allowance` DECIMAL(18,2) NOT NULL,
    `Overtime` DECIMAL(18,2) NOT NULL,
    `Deduction` DECIMAL(18,2) NOT NULL,
    `NetPay` DECIMAL(18,2) NOT NULL,  -- = Duit Keluar
    `PayDate` DATE NOT NULL,
    `BusinessUnitId` INT NOT NULL,
    `AccountId` INT NOT NULL,
    `CategoryId` INT NOT NULL,
    `Method` VARCHAR(20) NOT NULL,
    `Notes` VARCHAR(500) NULL,
    `TransactionId` INT NULL,
    `IsVoided` TINYINT(1) NOT NULL,
    `VoidReason` VARCHAR(300) NULL,
    `VoidedAt` DATETIME(6) NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Wages_Number` (`Number`),
    KEY `IX_Wages_EmployeeId_PeriodMonth` (`EmployeeId`, `PeriodMonth`),
    KEY `IX_Wages_PayDate` (`PayDate`),
    CONSTRAINT `FK_Wages_Employees_EmployeeId` FOREIGN KEY (`EmployeeId`) REFERENCES `Employees` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Wages_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Wages_Accounts_AccountId` FOREIGN KEY (`AccountId`) REFERENCES `Accounts` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Wages_Categories_CategoryId` FOREIGN KEY (`CategoryId`) REFERENCES `Categories` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Wages_Transactions_TransactionId` FOREIGN KEY (`TransactionId`) REFERENCES `Transactions` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Wages_Users_CreatedById` FOREIGN KEY (`CreatedById`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bil utiliti (Manage Utility Expenses) --------------------------------
CREATE TABLE IF NOT EXISTS `UtilityBills` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- BU-yyyy-NNNN
    `Type` VARCHAR(20) NOT NULL,  -- Electricity | Water | Internet | Phone | Rent | Gas | Other
    `Provider` VARCHAR(100) NULL,
    `AccountNo` VARCHAR(50) NULL,
    `BusinessUnitId` INT NOT NULL,
    `CategoryId` INT NOT NULL,
    `BillDate` DATE NOT NULL,
    `DueDate` DATE NOT NULL,
    `PeriodMonth` VARCHAR(7) NOT NULL,  -- bulan penggunaan yyyy-MM
    `Amount` DECIMAL(18,2) NOT NULL,
    `Status` VARCHAR(20) NOT NULL,  -- Unpaid | Paid
    `PaidDate` DATE NULL,
    `PaidAccountId` INT NULL,
    `Method` VARCHAR(20) NULL,
    `Reference` VARCHAR(50) NULL,
    `Notes` VARCHAR(500) NULL,
    `TransactionId` INT NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_UtilityBills_Number` (`Number`),
    KEY `IX_UtilityBills_BillDate` (`BillDate`),
    CONSTRAINT `FK_UtilityBills_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_UtilityBills_Categories_CategoryId` FOREIGN KEY (`CategoryId`) REFERENCES `Categories` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_UtilityBills_Accounts_PaidAccountId` FOREIGN KEY (`PaidAccountId`) REFERENCES `Accounts` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_UtilityBills_Transactions_TransactionId` FOREIGN KEY (`TransactionId`) REFERENCES `Transactions` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_UtilityBills_Users_CreatedById` FOREIGN KEY (`CreatedById`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tuntutan kewangan (Claim Request → Approve) -------------------------
CREATE TABLE IF NOT EXISTS `Claims` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `Number` VARCHAR(30) NOT NULL,  -- TK-yyyy-NNNN
    `RequestedById` INT NOT NULL,
    `EmployeeId` INT NULL,  -- bagi pihak pekerja
    `ClaimDate` DATE NOT NULL,
    `BusinessUnitId` INT NOT NULL,
    `CategoryId` INT NOT NULL,
    `Description` VARCHAR(300) NOT NULL,
    `Amount` DECIMAL(18,2) NOT NULL,
    `ReceiptFile` LONGTEXT NULL,
    `ReceiptOriginalName` LONGTEXT NULL,
    `Status` VARCHAR(20) NOT NULL,  -- Pending | Approved | Rejected | Paid
    `ReviewedById` INT NULL,
    `ReviewedAt` DATETIME(6) NULL,
    `ReviewRemark` VARCHAR(300) NULL,
    `PaidDate` DATE NULL,
    `PaidAccountId` INT NULL,
    `Method` VARCHAR(20) NULL,
    `TransactionId` INT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    `UpdatedAt` DATETIME(6) NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `IX_Claims_Number` (`Number`),
    KEY `IX_Claims_Status` (`Status`),
    KEY `IX_Claims_RequestedById` (`RequestedById`),
    CONSTRAINT `FK_Claims_Users_RequestedById` FOREIGN KEY (`RequestedById`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_Users_ReviewedById` FOREIGN KEY (`ReviewedById`) REFERENCES `Users` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_Employees_EmployeeId` FOREIGN KEY (`EmployeeId`) REFERENCES `Employees` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_Categories_CategoryId` FOREIGN KEY (`CategoryId`) REFERENCES `Categories` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_Accounts_PaidAccountId` FOREIGN KEY (`PaidAccountId`) REFERENCES `Accounts` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_Claims_Transactions_TransactionId` FOREIGN KEY (`TransactionId`) REFERENCES `Transactions` (`Id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Buku hutang kedai (555): pelanggan ambil barang dahulu, bayar kemudian.
-- Rekod ini belum dikira jualan. Bayaran = Payments.IsCreditPayment = 1
-- (resit biasa yang menjana Duit Masuk). Baki = hutang aktif - bayaran aktif.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `CreditSales` (
    `Id` INT NOT NULL AUTO_INCREMENT,
    `CustomerId` INT NOT NULL,
    `BusinessUnitId` INT NOT NULL,
    `Date` DATE NOT NULL,
    `Description` VARCHAR(300) NOT NULL,  -- barang yang diambil
    `Amount` DECIMAL(18,2) NOT NULL,
    `IsVoided` TINYINT(1) NOT NULL,
    `VoidReason` VARCHAR(300) NULL,
    `VoidedAt` DATETIME(6) NULL,
    `CreatedById` INT NOT NULL,
    `CreatedAt` DATETIME(6) NOT NULL,
    PRIMARY KEY (`Id`),
    KEY `IX_CreditSales_CustomerId_BusinessUnitId` (`CustomerId`, `BusinessUnitId`),
    KEY `IX_CreditSales_BusinessUnitId` (`BusinessUnitId`),
    KEY `IX_CreditSales_Date` (`Date`),
    KEY `IX_CreditSales_CreatedById` (`CreatedById`),
    CONSTRAINT `FK_CreditSales_Customers_CustomerId`         FOREIGN KEY (`CustomerId`)     REFERENCES `Customers` (`Id`)     ON DELETE RESTRICT,
    CONSTRAINT `FK_CreditSales_BusinessUnits_BusinessUnitId` FOREIGN KEY (`BusinessUnitId`) REFERENCES `BusinessUnits` (`Id`) ON DELETE RESTRICT,
    CONSTRAINT `FK_CreditSales_Users_CreatedById`            FOREIGN KEY (`CreatedById`)    REFERENCES `Users` (`Id`)         ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
