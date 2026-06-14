using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Settings;

public record SettingDto(string Key, string Value, string Category, string Label, string? Description, string ValueType);

// Get all settings
public record GetSettingsQuery : IRequest<IReadOnlyList<SettingDto>>;

public class GetSettingsQueryHandler : IRequestHandler<GetSettingsQuery, IReadOnlyList<SettingDto>>
{
    private readonly IApplicationDbContext _context;
    public GetSettingsQueryHandler(IApplicationDbContext context) => _context = context;

    public async ValueTask<IReadOnlyList<SettingDto>> Handle(GetSettingsQuery request, CancellationToken cancellationToken)
    {
        return await _context.Settings
            .OrderBy(s => s.Category).ThenBy(s => s.Label)
            .Select(s => new SettingDto(s.Key, s.Value, s.Category, s.Label, s.Description, s.ValueType))
            .ToListAsync(cancellationToken);
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

// Update setting
public record UpdateSettingCommand(string Key, string Value) : IRequest<Result<bool>>;

public class UpdateSettingCommandHandler : IRequestHandler<UpdateSettingCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateSettingCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateSettingCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.Settings.FindAsync([request.Key], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Paramètre introuvable.");

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
        }

        var oldValue = entity.Value;
        entity.Value = value;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Setting", null, oldValues: new { entity.Key, Value = oldValue }, newValues: new { entity.Key, entity.Value }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
