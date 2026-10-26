using System.Text;
using System.Text.Json.Serialization;
using Fms.Api;
using Fms.Api.Data;
using Fms.Api.Domain;
using Fms.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

// ---------- Konfigurasi ----------
builder.Services.Configure<JwtOptions>(config.GetSection("Jwt"));
builder.Services.Configure<AppOptions>(config.GetSection("App"));
builder.Services.Configure<DocumentOptions>(config.GetSection("Documents"));
var jwt = config.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
if (jwt.Key.Length < 32)
    throw new InvalidOperationException("Jwt:Key mesti sekurang-kurangnya 32 aksara. Tetapkan dalam appsettings atau environment variable Jwt__Key.");

// ---------- Pangkalan data ----------
// MySQL / MariaDB. Pangkalan data dicipta jika belum wujud, kemudian versi server dikesan sekali.
var connectionString = config.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default belum diisi dalam appsettings.json.");
DatabaseBootstrap.EnsureDatabase(connectionString);
var serverVersion = ServerVersion.AutoDetect(connectionString);
builder.Services.AddDbContext<AppDbContext>(o => o.UseMySql(connectionString, serverVersion));

// ---------- Servis ----------
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuditService>();
builder.Services.AddScoped<ReportService>();
builder.Services.AddScoped<SalesService>();
builder.Services.AddScoped<PayablesService>();
builder.Services.AddScoped<StaffService>();
builder.Services.AddScoped<ClaimService>();
builder.Services.AddScoped<StatementService>();

// ---------- Auth ----------
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o => o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwt.Issuer,
        ValidateAudience = true,
        ValidAudience = jwt.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Key)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.FromMinutes(1),
    });

builder.Services.AddAuthorization(o =>
{
    o.AddPolicy(Policies.Manager, p => p.RequireRole(nameof(UserRole.Manager)));
    o.AddPolicy(Policies.AnyUser, p => p.RequireRole(nameof(UserRole.Manager), nameof(UserRole.Clerk)));
    o.AddPolicy(Policies.Clerk, p => p.RequireRole(nameof(UserRole.Clerk)));
});

// ---------- API ----------
builder.Services.AddControllers()
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();

var corsOrigins = config.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod()));

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "FMS API", Version = "v1" });
    var scheme = new OpenApiSecurityScheme
    {
        Name = "Authorization", Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
    };
    c.AddSecurityDefinition("Bearer", scheme);
    c.AddSecurityRequirement(new OpenApiSecurityRequirement { [scheme] = Array.Empty<string>() });
});

var app = builder.Build();

// ---------- Cipta pangkalan data & data asas ----------
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    SchemaInitializer.Apply(db, logger);
    await DbSeeder.SeedAsync(db,
        scope.ServiceProvider.GetRequiredService<IOptions<AppOptions>>().Value,
        scope.ServiceProvider.GetRequiredService<IOptions<DocumentOptions>>().Value,
        logger);
}

// ---------- Pipeline ----------
app.UseCors(); // sebelum exception handler supaya ralat 500 masih bawa header CORS
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Frontend React yang sudah di-build (npm run build) diletak dalam wwwroot
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    }
});

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Laluan SPA (bukan /api) dihantar ke index.html
app.MapFallback(async ctx =>
{
    if (ctx.Request.Path.StartsWithSegments("/api"))
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }
    var index = Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html");
    if (!File.Exists(index))
    {
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
        await ctx.Response.WriteAsync("Frontend belum di-build. Jalankan 'npm run build' dalam folder frontend.");
        return;
    }
    ctx.Response.ContentType = "text/html; charset=utf-8";
    ctx.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    await ctx.Response.SendFileAsync(index);
});

app.Run();

public partial class Program { }