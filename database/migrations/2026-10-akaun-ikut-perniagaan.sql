-- =====================================================================
-- FMS: tukar kepada SATU AKAUN BAGI SETIAP PERNIAGAAN (sekali sahaja)
--
-- Sebelum:  akaun dikongsi — Tunai Kebun, Tunai Kedai, Maybank, CIMB, ...
-- Selepas:  akaun "Nenas", "Sawit", "Kedai Runcit", ... (satu bagi setiap perniagaan)
--           Tunai / Bank disimpan sebagai label pada setiap rekod (Transactions.Channel)
--
-- Apa yang skrip ini buat (dalam satu transaksi — gagal = tiada apa berubah):
--   1. Semak keselamatan (lihat di bawah). Jika gagal, skrip berhenti tanpa ubah apa-apa.
--   2. Isi label Tunai/Bank untuk rekod lama ikut jenis akaun asal.
--   3. Cipta satu akaun bagi setiap perniagaan (jika belum ada).
--   4. Pindahkan semua rekod (duit, resit, baucar, gaji, bil, tuntutan) ke akaun perniagaan masing-masing.
--   5. Nyahaktif akaun dikongsi yang lama.
--
-- Berhenti (tiada perubahan) jika:
--   - akaun dikongsi lama ada Baki awal bukan 0 (tidak tahu nak pecah ke perniagaan mana), atau
--   - ada rekod Pindah Duit / Pinjaman Antara Perniagaan yang guna akaun dikongsi.
--   Dalam kes itu, betulkan di aplikasi dahulu (atau minta bantuan), kemudian jalankan semula.
--
-- Cara jalankan di server (selepas versi baru aplikasi sudah di-deploy):
--   sudo /usr/local/bin/fms-backup.sh                        # backup dahulu
--   sudo mysql fms < 2026-10-akaun-ikut-perniagaan.sql
--   sudo systemctl restart fms-api
-- Selamat dijalankan semula: jika sudah ditukar, tiada apa berubah.
-- =====================================================================

DROP PROCEDURE IF EXISTS fms_akaun_ikut_perniagaan;

DELIMITER //
CREATE PROCEDURE fms_akaun_ikut_perniagaan()
BEGIN
    DECLARE v_opening INT DEFAULT 0;
    DECLARE v_moves INT DEFAULT 0;
    DECLARE v_left INT DEFAULT 0;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Kolum Channel dicipta oleh aplikasi versi baru semasa ia bermula
    IF (SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Transactions' AND COLUMN_NAME = 'Channel') = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Deploy versi baru aplikasi dahulu (kolum Transactions.Channel belum wujud).';
    END IF;

    -- 1. Semakan keselamatan
    SELECT COUNT(*) INTO v_opening FROM `Accounts` WHERE `BusinessUnitId` IS NULL AND `OpeningBalance` <> 0;
    IF v_opening > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Akaun dikongsi lama ada Baki awal bukan 0. Tetapkan Baki awal pada akaun perniagaan secara manual. Tiada perubahan dibuat.';
    END IF;

    SELECT COUNT(*) INTO v_moves
    FROM `Transactions` t
    JOIN `Accounts` a ON a.`Id` = t.`AccountId` OR a.`Id` = t.`ToAccountId`
    WHERE t.`IsDeleted` = 0 AND a.`BusinessUnitId` IS NULL AND t.`Type` IN ('Transfer', 'InternalLoan');
    IF v_moves > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ada rekod Pindah Duit / Pinjaman Antara Perniagaan pada akaun dikongsi. Padam atau betulkan dahulu. Tiada perubahan dibuat.';
    END IF;

    START TRANSACTION;

    -- 2. Label Tunai / Bank untuk rekod lama (ikut jenis akaun asal)
    UPDATE `Transactions` t JOIN `Accounts` a ON a.`Id` = t.`AccountId`
    SET t.`Channel` = a.`Type`
    WHERE t.`Channel` IS NULL AND t.`Type` IN ('Income', 'Expense', 'OwnerWithdrawal', 'OwnerCapital');

    -- 3. Satu akaun bagi setiap perniagaan (nama = nama perniagaan; "Akaun <nama>" jika nama sudah dipakai)
    INSERT INTO `Accounts` (`Name`, `Type`, `OpeningBalance`, `BusinessUnitId`, `SortOrder`, `IsActive`)
    SELECT
        CASE WHEN EXISTS (SELECT 1 FROM `Accounts` x WHERE x.`Name` = b.`Name`) THEN CONCAT('Akaun ', b.`Name`) ELSE b.`Name` END,
        'Cash', 0, b.`Id`, b.`SortOrder`,
        -- Perniagaan tidak aktif yang ada rekod: akaun kekal aktif supaya bakinya masih dikira dalam jumlah
        IF(b.`IsActive` = 1 OR EXISTS (SELECT 1 FROM `Transactions` t WHERE t.`BusinessUnitId` = b.`Id` AND t.`IsDeleted` = 0), 1, 0)
    FROM `BusinessUnits` b
    WHERE NOT EXISTS (SELECT 1 FROM `Accounts` a WHERE a.`BusinessUnitId` = b.`Id`);

    -- Akaun sasaran bagi setiap perniagaan (yang pertama jika ada lebih daripada satu)
    DROP TEMPORARY TABLE IF EXISTS tmp_target;
    CREATE TEMPORARY TABLE tmp_target (BusinessUnitId INT PRIMARY KEY, AccountId INT NOT NULL)
    SELECT `BusinessUnitId`, MIN(`Id`) AS AccountId FROM `Accounts` WHERE `BusinessUnitId` IS NOT NULL GROUP BY `BusinessUnitId`;

    -- 4. Pindahkan rekod dari akaun dikongsi ke akaun perniagaan
    UPDATE `Transactions` t JOIN tmp_target g ON g.BusinessUnitId = t.`BusinessUnitId`
    SET t.`AccountId` = g.AccountId
    WHERE t.`AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    UPDATE `Payments` p JOIN tmp_target g ON g.BusinessUnitId = p.`BusinessUnitId`
    SET p.`AccountId` = g.AccountId
    WHERE p.`AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    UPDATE `PayablePayments` pp
    JOIN `Payables` py ON py.`Id` = pp.`PayableId`
    JOIN tmp_target g ON g.BusinessUnitId = py.`BusinessUnitId`
    SET pp.`AccountId` = g.AccountId
    WHERE pp.`AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    UPDATE `Wages` w JOIN tmp_target g ON g.BusinessUnitId = w.`BusinessUnitId`
    SET w.`AccountId` = g.AccountId
    WHERE w.`AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    UPDATE `UtilityBills` u JOIN tmp_target g ON g.BusinessUnitId = u.`BusinessUnitId`
    SET u.`PaidAccountId` = g.AccountId
    WHERE u.`PaidAccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    UPDATE `Claims` c JOIN tmp_target g ON g.BusinessUnitId = c.`BusinessUnitId`
    SET c.`PaidAccountId` = g.AccountId
    WHERE c.`PaidAccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL);

    -- Semua rekod aktif mesti sudah berpindah; jika tidak, batalkan semua
    SELECT
        (SELECT COUNT(*) FROM `Transactions` WHERE `IsDeleted` = 0 AND (`AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL) OR `ToAccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL)))
      + (SELECT COUNT(*) FROM `Payments` WHERE `IsVoided` = 0 AND `AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL))
      + (SELECT COUNT(*) FROM `PayablePayments` WHERE `IsVoided` = 0 AND `AccountId` IN (SELECT `Id` FROM `Accounts` WHERE `BusinessUnitId` IS NULL))
    INTO v_left;
    IF v_left > 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sebahagian rekod tidak dapat dipindahkan ke akaun perniagaan. Tiada perubahan dibuat.';
    END IF;

    -- 5. Nyahaktif akaun dikongsi lama (rekod sejarah kekal)
    UPDATE `Accounts` SET `IsActive` = 0 WHERE `BusinessUnitId` IS NULL;

    COMMIT;

    DROP TEMPORARY TABLE IF EXISTS tmp_target;
END //
DELIMITER ;

CALL fms_akaun_ikut_perniagaan();
DROP PROCEDURE IF EXISTS fms_akaun_ikut_perniagaan;

-- Ringkasan selepas tukar
SELECT a.`Name` AS Akaun, IFNULL(b.`Name`, '(dikongsi)') AS Perniagaan,
       IF(a.`IsActive` = 1, 'Aktif', 'Tidak aktif') AS Status,
       (SELECT COUNT(*) FROM `Transactions` t WHERE t.`AccountId` = a.`Id` AND t.`IsDeleted` = 0) AS Rekod
FROM `Accounts` a LEFT JOIN `BusinessUnits` b ON b.`Id` = a.`BusinessUnitId`
ORDER BY a.`IsActive` DESC, a.`SortOrder`;
