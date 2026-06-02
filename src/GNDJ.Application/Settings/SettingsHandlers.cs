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

        var oldValue = entity.Value;
        entity.Value = request.Value;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Setting", null, oldValues: new { entity.Key, Value = oldValue }, newValues: new { entity.Key, entity.Value }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}
