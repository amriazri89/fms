-- =====================================================================
-- FMS: pindah data sawit yang tersalah masuk sebagai INVOIS → modul AGIHAN SAWIT
--
-- Skop: INV-2026-0001 hingga INV-2026-0024 (perniagaan SAWIT) sahaja.
--
-- Apa yang dibuat (satu transaksi — jika gagal, TIADA apa berubah):
--   1. Cipta pemilik sawit daripada nama pelanggan invois.
--   2. Cipta 2 BAYARAN KILANG sebagai DRAF (tiada kesan pada akaun):
--        A. tiket yang ada tarikh dalam keterangan (Oktober)
--        B. tiket tanpa tarikh (INV-0023 Mamat, INV-0024 Ibrahim) — tarikh tiket = tarikh invois
--      Setiap baris invois = satu tiket: berat = tan × 1000, harga/tan, amaun = amaun baris.
--      Caj (upah potong, transport) dikira ikut kadar lalai di Tetapan → Caj sawit.
--      Amaun diterima = jumlah tiket (ubah dalam app jika amaun kilang berbeza).
--   3. Batalkan 24 invois tersebut, dan batalkan resit RS-2026-0001 (pendapatan palsu RM5,744.20).
--
-- Selepas ini, dalam app → Agihan sawit: semak setiap draf (nama kilang, caj), kemudian Sahkan,
-- kemudian Bayar pemilik.
--
-- Jalankan:
--   sudo /usr/local/bin/fms-backup.sh
--   sudo mysql fms < pindah-invois-ke-sawit.sql
-- Selamat dijalankan semula: jika sudah dipindahkan, skrip berhenti tanpa ubah apa-apa.
-- =====================================================================

DROP PROCEDURE IF EXISTS fms_pindah_sawit;

DELIMITER //
CREATE PROCEDURE fms_pindah_sawit()
BEGIN
    DECLARE v_unit INT;
    DECLARE v_account INT;
    DECLARE v_user INT;
    DECLARE v_year INT DEFAULT 2026;
    DECLARE v_seq INT;
    DECLARE v_batch_a INT;
    DECLARE v_batch_b INT;
    DECLARE v_inv_count INT;
    DECLARE v_inv_total DECIMAL(18,2);
    DECLARE v_ticket_total DECIMAL(18,2);
    DECLARE v_ticket_count INT;
    DECLARE v_item_count INT;
    DECLARE v_marker VARCHAR(60) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'Dipindah dari invois INV-2026-0001..0024';

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- ---------- Semakan ----------
    IF EXISTS (SELECT 1 FROM PalmBatches WHERE Notes = v_marker) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Data ini sudah dipindahkan sebelum ini. Tiada perubahan dibuat.';
    END IF;

    DROP TEMPORARY TABLE IF EXISTS tmp_inv;
    CREATE TEMPORARY TABLE tmp_inv AS
        SELECT i.Id, i.Number, i.Date, i.CustomerId, i.BusinessUnitId, i.Total, TRIM(c.Name) AS OwnerName
        FROM Invoices i JOIN Customers c ON c.Id = i.CustomerId
        WHERE i.Number BETWEEN 'INV-2026-0001' AND 'INV-2026-0024' AND i.Status <> 'Cancelled';

    SELECT COUNT(*), SUM(Total) INTO v_inv_count, v_inv_total FROM tmp_inv;
    IF v_inv_count <> 24 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jangkaan 24 invois aktif (INV-2026-0001..0024) tidak dijumpai. Tiada perubahan dibuat.';
    END IF;
    IF (SELECT COUNT(DISTINCT BusinessUnitId) FROM tmp_inv) <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invois bukan dari satu perniagaan sahaja. Tiada perubahan dibuat.';
    END IF;
    SELECT MIN(BusinessUnitId) INTO v_unit FROM tmp_inv;

    -- Akaun perniagaan SAWIT (satu akaun bagi setiap perniagaan)
    SELECT MIN(Id) INTO v_account FROM Accounts WHERE BusinessUnitId = v_unit AND IsActive = 1;
    IF v_account IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Akaun untuk perniagaan SAWIT tidak dijumpai (Tetapan → Akaun). Tiada perubahan dibuat.';
    END IF;
    SELECT MIN(Id) INTO v_user FROM Users WHERE Role = 'Manager' AND IsActive = 1;

    -- ---------- Tiket daripada baris invois ----------
    DROP TEMPORARY TABLE IF EXISTS tmp_items;
    CREATE TEMPORARY TABLE tmp_items AS
        SELECT it.Id AS ItemId, it.SortOrder, inv.Id AS InvoiceId, inv.Number, inv.Date AS InvDate, inv.OwnerName,
               it.Description, it.Quantity, it.UnitPrice, it.Amount,
               -- tarikh dalam keterangan, contoh "BTS 11/10 /2026" atau "28/`10/2026"
               STR_TO_DATE(REPLACE(REPLACE(REGEXP_SUBSTR(it.Description, '[0-9]{1,2} */ *`?[0-9]{1,2} */ *[0-9]{4}'), ' ', ''), '`', ''), '%d/%m/%Y') AS TicketDate,
               -- lokasi / catatan tiket (buang "BTS" dan tarikh), contoh "BETENG RUMAH"
               NULLIF(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(it.Description, '[0-9]{1,2} */ *`?[0-9]{1,2} */ *[0-9]{4}', ''), '^ *BTS *', ''), ' {2,}', ' ')), '') AS Place
        FROM InvoiceItems it JOIN tmp_inv inv ON inv.Id = it.InvoiceId;

    SELECT COUNT(*) INTO v_item_count FROM tmp_items;
    IF EXISTS (SELECT 1 FROM tmp_items WHERE TicketDate IS NOT NULL AND (TicketDate < '2026-09-01' OR TicketDate > CURDATE())) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ada tarikh tiket yang pelik (bukan 2026). Tiada perubahan dibuat.';
    END IF;

    START TRANSACTION;

    -- 1. Pemilik sawit
    INSERT INTO PalmOwners (Name, IsActive, CreatedAt, Notes)
    SELECT DISTINCT OwnerName, 1, UTC_TIMESTAMP(6), 'Dipindah dari invois'
    FROM tmp_inv t
    WHERE NOT EXISTS (SELECT 1 FROM PalmOwners o WHERE o.Name = t.OwnerName);

    -- 2. Nombor dokumen SW-2026-NNNN
    INSERT INTO DocumentSequences (Type, Year, LastNumber) VALUES ('PalmBatch', v_year, 0)
        ON DUPLICATE KEY UPDATE LastNumber = LastNumber;
    SELECT LastNumber INTO v_seq FROM DocumentSequences WHERE Type = 'PalmBatch' AND Year = v_year FOR UPDATE;

    -- Bayaran kilang A: tiket bertarikh
    INSERT INTO PalmBatches (Number, MillName, Date, AmountReceived, BusinessUnitId, AccountId, Channel, Reference, Notes, Status, CreatedById, CreatedAt)
    SELECT CONCAT('SW-', v_year, '-', LPAD(v_seq + 1, 4, '0')), 'KILANG SAWIT (sila kemas kini)', MAX(TicketDate), SUM(Amount),
           v_unit, v_account, 'Bank', NULL, v_marker, 'Draft', v_user, UTC_TIMESTAMP(6)
    FROM tmp_items WHERE TicketDate IS NOT NULL;
    SET v_batch_a = LAST_INSERT_ID();

    -- Bayaran kilang B: tiket tanpa tarikh (tarikh = tarikh invois)
    INSERT INTO PalmBatches (Number, MillName, Date, AmountReceived, BusinessUnitId, AccountId, Channel, Reference, Notes, Status, CreatedById, CreatedAt)
    SELECT CONCAT('SW-', v_year, '-', LPAD(v_seq + 2, 4, '0')), 'KILANG SAWIT (sila kemas kini)', MAX(InvDate), SUM(Amount),
           v_unit, v_account, 'Bank', 'Tiket tanpa tarikh', v_marker, 'Draft', v_user, UTC_TIMESTAMP(6)
    FROM tmp_items WHERE TicketDate IS NULL;
    SET v_batch_b = LAST_INSERT_ID();

    UPDATE DocumentSequences SET LastNumber = v_seq + 2 WHERE Type = 'PalmBatch' AND Year = v_year;

    -- Tiket (Net dikira selepas caj di bawah)
    INSERT INTO PalmTickets (BatchId, OwnerId, TicketNo, Date, WeightKg, PricePerTonne, Gross, Net, SortOrder)
    SELECT IF(t.TicketDate IS NULL, v_batch_b, v_batch_a), o.Id, LEFT(t.Place, 50), COALESCE(t.TicketDate, t.InvDate),
           ROUND(t.Quantity * 1000, 2), t.UnitPrice, t.Amount, t.Amount,
           ROW_NUMBER() OVER (PARTITION BY (t.TicketDate IS NULL) ORDER BY t.Number, t.SortOrder)
    FROM tmp_items t JOIN PalmOwners o ON o.Name = t.OwnerName;

    -- Caj ikut kadar lalai (formula sama seperti Domain/PalmEntities.cs PalmMath)
    INSERT INTO PalmTicketCharges (TicketId, ChargeTypeId, Method, Rate, Amount)
    SELECT x.TicketId, x.ChargeTypeId, x.Method, x.Rate, x.Amount FROM (
        SELECT pt.Id AS TicketId, ct.Id AS ChargeTypeId, ct.DefaultMethod AS Method, ct.DefaultRate AS Rate,
               CASE ct.DefaultMethod
                   WHEN 'PerTonne' THEN ROUND(pt.WeightKg / 1000 * ct.DefaultRate, 2)
                   WHEN 'Fixed'    THEN ROUND(ct.DefaultRate, 2)
                   WHEN 'Percent'  THEN ROUND(pt.Gross * ct.DefaultRate / 100, 2)
                   ELSE 0 END AS Amount
        FROM PalmTickets pt CROSS JOIN PalmChargeTypes ct
        WHERE pt.BatchId IN (v_batch_a, v_batch_b) AND ct.IsActive = 1
    ) x WHERE x.Amount <> 0;

    UPDATE PalmTickets pt
    SET pt.Net = pt.Gross - COALESCE((SELECT SUM(c.Amount) FROM PalmTicketCharges c WHERE c.TicketId = pt.Id), 0)
    WHERE pt.BatchId IN (v_batch_a, v_batch_b);

    -- Semakan: semua baris invois jadi tiket, jumlah sama
    SELECT COUNT(*), SUM(Gross) INTO v_ticket_count, v_ticket_total FROM PalmTickets WHERE BatchId IN (v_batch_a, v_batch_b);
    IF v_ticket_count <> v_item_count OR v_ticket_total <> v_inv_total THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Jumlah tiket tidak sama dengan jumlah invois. Tiada perubahan dibuat.';
    END IF;
    IF EXISTS (SELECT 1 FROM PalmTickets WHERE BatchId IN (v_batch_a, v_batch_b) AND Net < 0) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Caj lalai melebihi amaun tiket. Semak Tetapan → Caj sawit. Tiada perubahan dibuat.';
    END IF;

    -- 3. Batal resit RS untuk invois ini (bukan pendapatan) + rekod Duit Masuknya
    UPDATE Transactions t JOIN Payments p ON p.TransactionId = t.Id JOIN tmp_inv i ON i.Id = p.InvoiceId
    SET t.IsDeleted = 1, t.UpdatedAt = UTC_TIMESTAMP(6)
    WHERE p.IsVoided = 0;
    INSERT INTO AuditLogs (UserId, Username, Action, Entity, EntityId, OldValue, NewValue, Timestamp)
    SELECT v_user, 'sistem', 'Void', 'Payment', p.Id, NULL, JSON_OBJECT('Number', p.Number, 'Reason', 'Data sawit dipindah ke Agihan sawit'), UTC_TIMESTAMP(6)
    FROM Payments p JOIN tmp_inv i ON i.Id = p.InvoiceId WHERE p.IsVoided = 0;
    UPDATE Payments p JOIN tmp_inv i ON i.Id = p.InvoiceId
    SET p.IsVoided = 1, p.VoidReason = 'Data sawit dipindah ke Agihan sawit', p.VoidedAt = UTC_TIMESTAMP(6)
    WHERE p.IsVoided = 0;

    -- Batal invois
    UPDATE Invoices i JOIN tmp_inv t ON t.Id = i.Id
    SET i.Status = 'Cancelled', i.AmountPaid = 0, i.CancelReason = 'Tersalah masuk — dipindah ke Agihan sawit', i.UpdatedAt = UTC_TIMESTAMP(6);
    INSERT INTO AuditLogs (UserId, Username, Action, Entity, EntityId, OldValue, NewValue, Timestamp)
    SELECT v_user, 'sistem', 'Cancel', 'Invoice', Id, NULL, JSON_OBJECT('Number', Number, 'Reason', 'Dipindah ke Agihan sawit'), UTC_TIMESTAMP(6) FROM tmp_inv;
    INSERT INTO AuditLogs (UserId, Username, Action, Entity, EntityId, OldValue, NewValue, Timestamp)
    SELECT v_user, 'sistem', 'Create', 'PalmBatch', Id, NULL, JSON_OBJECT('Number', Number, 'Source', v_marker), UTC_TIMESTAMP(6)
    FROM PalmBatches WHERE Id IN (v_batch_a, v_batch_b);

    COMMIT;

    DROP TEMPORARY TABLE IF EXISTS tmp_items;
    DROP TEMPORARY TABLE IF EXISTS tmp_inv;
END //
DELIMITER ;

CALL fms_pindah_sawit();
DROP PROCEDURE IF EXISTS fms_pindah_sawit;

-- ---------- Ringkasan ----------
SELECT b.Number AS BayaranKilang, b.Date AS Tarikh, b.Status, COUNT(t.Id) AS Tiket,
       COUNT(DISTINCT t.OwnerId) AS Pemilik, ROUND(SUM(t.WeightKg) / 1000, 3) AS Tan,
       SUM(t.Gross) AS AmaunKilang, SUM(t.Gross - t.Net) AS Caj, SUM(t.Net) AS UntukPemilik
FROM PalmBatches b JOIN PalmTickets t ON t.BatchId = b.Id
WHERE b.Notes = 'Dipindah dari invois INV-2026-0001..0024'
GROUP BY b.Id ORDER BY b.Number;

SELECT COUNT(*) AS InvoisDibatalkan FROM Invoices WHERE CancelReason = 'Tersalah masuk — dipindah ke Agihan sawit';
