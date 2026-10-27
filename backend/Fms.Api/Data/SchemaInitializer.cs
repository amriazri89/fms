using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace Fms.Api.Data;

/// <summary>Cipta pangkalan data MySQL (contoh: "fms") jika belum wujud.</summary>
public static class DatabaseBootstrap
{
    public static void EnsureDatabase(string connectionString)
    {
        var builder = new MySqlConnectionStringBuilder(connectionString);
        var database = builder.Database;
        if (string.IsNullOrWhiteSpace(database))
            throw new InvalidOperationException("Nyatakan nama pangkalan data dalam connection string, contoh: Database=fms;");

        builder.Database = "";   // sambung ke server dahulu tanpa DB
        using var conn = new MySqlConnection(builder.ConnectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = $"CREATE DATABASE IF NOT EXISTS `{database.Replace("`", "")}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;";
        cmd.ExecuteNonQuery();
    }
}

/// <summary>Jalankan database/schema.sql (dibenamkan dalam DLL) setiap kali aplikasi bermula.</summary>
public static class SchemaInitializer
{
    private const string ResourceName = "schema.sql";

    /// <summary>
    /// Kolum baru untuk jadual lama. Contoh: ("Employees", "Email", "VARCHAR(100) NULL", null).
    /// Backfill (pilihan) dijalankan SEKALI sahaja, sejurus selepas kolum ditambah.
    /// </summary>
    private static readonly (string Table, string Column, string Definition, string? Backfill)[] AddedColumns =
    [
        ("Payments", "IsCreditPayment", "TINYINT(1) NOT NULL DEFAULT 0", null),  // buku hutang kedai (555)
        // Label Tunai / Bank. Rekod lama: ikut jenis akaun yang digunakan.
        ("Transactions", "Channel", "VARCHAR(10) NULL",
            "UPDATE `Transactions` t JOIN `Accounts` a ON a.`Id` = t.`AccountId` SET t.`Channel` = a.`Type` WHERE t.`Channel` IS NULL;"),
    ];

    public static void Apply(AppDbContext db, ILogger logger)
    {
        var conn = db.Database.GetDbConnection();
        if (conn.State != ConnectionState.Open) conn.Open();

        Execute(conn, ReadSchema());   // CREATE TABLE IF NOT EXISTS ... (22 jadual)

        foreach (var (table, column, definition, backfill) in AddedColumns)
        {
            if (ColumnExists(conn, table, column)) continue;
            Execute(conn, $"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition};");
            if (backfill is not null) Execute(conn, backfill);
            logger.LogInformation("Kolum {Table}.{Column} ditambah.", table, column);
        }
    }

    private static string ReadSchema()
    {
        using var stream = typeof(SchemaInitializer).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Resource '{ResourceName}' tidak dijumpai.");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    private static void Execute(DbConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static bool ColumnExists(DbConnection conn, string table, string column)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "SELECT COUNT(*) FROM information_schema.COLUMNS " +
                          $"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}';";
        return Convert.ToInt32(cmd.ExecuteScalar()) > 0;
    }
}