using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Settings;

// App configuration is a typed key/value store: each Setting carries a ValueType (number/boolean/
// json/json_array/date/string) that UpdateSetting validates the new Value against. Handlers below
// read/write rows; consumers resolve values per-key at use time (no central cache to invalidate).
public record SettingDto(string Key, string Value, string Category, string Label, string? Description, string ValueType);

// Get all settings — filtered by the caller's access: a full admin sees every setting, a Chef de Groupe
// sees only the operational categories they may edit (SettingsAccess), anyone else is denied.
public record GetSettingsQuery : IRequest<IReadOnlyList<SettingDto>>;

public class GetSettingsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetSettingsQuery, IReadOnlyList<SettingDto>>
{
    public async ValueTask<IReadOnlyList<SettingDto>> Handle(GetSettingsQuery request, CancellationToken cancellationToken)
    {
        if (!SettingsAccess.CanViewAny(currentUser))
            throw new UnauthorizedAccessException("Accès refusé.");

        // The settings table is tiny (~50 rows), so load then filter categories in memory (avoids an
        // EF IN-clause over a static set and keeps the access rule in one place).
        var all = await context.Settings
            .OrderBy(s => s.Category).ThenBy(s => s.Label)
            .Select(s => new SettingDto(s.Key, s.Value, s.Category, s.Label, s.Description, s.ValueType))
            .ToListAsync(cancellationToken);

        return SettingsAccess.IsAdmin(currentUser)
            ? all
            : all.Where(s => SettingsAccess.IsCgCategory(s.Category)).ToList();
    }
}

// Get single setting by key
public record GetSettingQuery(string Key) : IRequest<SettingDto?>;

public class GetSettingQueryHandler : IRequestHandler<GetSettingQuery, SettingDto?>
{
    private readonly IApplicationDbContext _context;
    public GetSettingQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<SettingDto?> Handle(GetSettingQuery request, CancellationToken cancellationToken)
    {
        return await _context.Settings
            .Where(s => s.Key == request.Key)
            .Select(s => new SettingDto(s.Key, s.Value, s.Category, s.Label, s.Description, s.ValueType))
            .FirstOrDefaultAsync(cancellationToken);
    }
}

// Update setting — Value is validated against the existing setting's declared ValueType (see switch
// below); the key/type itself is fixed by the seed and not created here.
public record UpdateSettingCommand(string Key, string Value) : IRequest<Result<bool>>;

public class UpdateSettingCommandHandler : IRequestHandler<UpdateSettingCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUser;

    public UpdateSettingCommandHandler(IApplicationDbContext context, IAuditService auditService, ICurrentUserService currentUser)
    {
        _context = context;
        _auditService = auditService;
        _currentUser = currentUser;
    }

    public async ValueTask<Result<bool>> Handle(UpdateSettingCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Settings.FindAsync([request.Key], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Paramètre introuvable.");

        // Per-category access: super-admin/associations.manage edit anything; a Chef de Groupe only the
        // operational categories (throws 403 on a crafted cross-category write — the UI never offers it).
        if (!SettingsAccess.CanEdit(entity.Category, _currentUser))
            throw new UnauthorizedAccessException("Vous n'avez pas l'autorisation de modifier ce paramètre.");

        var value = request.Value ?? string.Empty;
        if (value.Length > 10000)
            return Result<bool>.Failure("La valeur est trop longue (max 10000 caractères).");

        // Validate the value against the setting's declared type.
        switch (entity.ValueType)
        {
            case "number":
                if (!decimal.TryParse(value, System.Globalization.CultureInfo.InvariantCulture, out _))
                    return Result<bool>.Failure("Ce paramètre attend une valeur numérique.");
                break;
            case "boolean":
                if (value is not ("true" or "false"))
                    return Result<bool>.Failure("Ce paramètre attend « true » ou « false ».");
                break;
            case "json":
            case "json_array":
                try
                {
                    using var doc = System.Text.Json.JsonDocument.Parse(value);
                    if (entity.ValueType == "json_array" && doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array)
                        return Result<bool>.Failure("Ce paramètre attend un tableau JSON.");
                }
                catch (System.Text.Json.JsonException)
                {
                    return Result<bool>.Failure("Valeur JSON invalide.");
                }
                break;
            case "date":
                // Empty is allowed (means "use today"); otherwise must be an ISO date (yyyy-MM-dd).
                if (!string.IsNullOrWhiteSpace(value) &&
                    !DateOnly.TryParseExact(value, "yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _))
                    return Result<bool>.Failure("Ce paramètre attend une date (AAAA-MM-JJ).");
                break;
        }

        var oldValue = entity.Value;
        entity.Value = value;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Setting", null, oldValues: new { entity.Key, Value = oldValue }, newValues: new { entity.Key, entity.Value }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
