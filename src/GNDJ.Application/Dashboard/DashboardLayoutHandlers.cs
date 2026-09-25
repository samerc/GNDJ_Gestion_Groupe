using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Dashboard;

// Per-user customization of the group "Accueil" dashboard (widget order + visibility + width). Stored as an
// opaque JSON string on the caller's OWN login account (User.DashboardLayoutJson) — id resolved server-side,
// never supplied. The frontend owns the widget schema and merges the saved layout against its registry on
// load, so this layer only stores/returns the string (with a length + valid-JSON-array guard). Auth-only.

// ── Read the caller's saved layout (null = use the default) ──
public record GetDashboardLayoutQuery : IRequest<string?>;

public class GetDashboardLayoutQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetDashboardLayoutQuery, string?>
{
    public async ValueTask<string?> Handle(GetDashboardLayoutQuery request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return null;
        return await context.Users.Where(u => u.Id == userId).Select(u => u.DashboardLayoutJson).FirstOrDefaultAsync(ct);
    }
}

// ── Save (or clear) the caller's layout ──
// LayoutJson empty/null = reset to the default (clears the stored value).
public record UpdateDashboardLayoutCommand(string? LayoutJson) : IRequest<Result<bool>>;

public class UpdateDashboardLayoutCommandValidator : AbstractValidator<UpdateDashboardLayoutCommand>
{
    public UpdateDashboardLayoutCommandValidator()
    {
        // A user's own private prefs, never rendered as HTML (parsed as JSON config on the client). Guard only
        // against abuse: bounded size + must be a JSON array when present.
        RuleFor(x => x.LayoutJson)
            .MaximumLength(4000).WithMessage("Configuration du tableau de bord trop volumineuse.")
            .Must(BeJsonArray).WithMessage("Configuration du tableau de bord invalide.")
            .When(x => !string.IsNullOrWhiteSpace(x.LayoutJson));
    }

    private static bool BeJsonArray(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return true;
        try { return JsonDocument.Parse(json).RootElement.ValueKind == JsonValueKind.Array; }
        catch { return false; }
    }
}

public class UpdateDashboardLayoutCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateDashboardLayoutCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateDashboardLayoutCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return Result<bool>.Failure("Non authentifié.");
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Result<bool>.Failure("Compte introuvable.");

        // Empty = reset to the default layout (store null so a future default change is picked up).
        user.DashboardLayoutJson = string.IsNullOrWhiteSpace(request.LayoutJson) ? null : request.LayoutJson;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// ── CU unit roster ("Mon unité") preferences: button bar order/visibility, what each roster row shows, grouping.
// Same model as the group layout above, but a JSON OBJECT stored on User.UnitDashboardPrefsJson. Auth-only, own account.
public record GetUnitDashboardPrefsQuery : IRequest<string?>;

public class GetUnitDashboardPrefsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetUnitDashboardPrefsQuery, string?>
{
    public async ValueTask<string?> Handle(GetUnitDashboardPrefsQuery request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return null;
        return await context.Users.Where(u => u.Id == userId).Select(u => u.UnitDashboardPrefsJson).FirstOrDefaultAsync(ct);
    }
}

// PrefsJson empty/null = reset to the defaults.
public record UpdateUnitDashboardPrefsCommand(string? PrefsJson) : IRequest<Result<bool>>;

public class UpdateUnitDashboardPrefsCommandValidator : AbstractValidator<UpdateUnitDashboardPrefsCommand>
{
    public UpdateUnitDashboardPrefsCommandValidator()
    {
        // Private prefs parsed as JSON config on the client (never rendered as HTML): bounded size + a JSON object.
        RuleFor(x => x.PrefsJson)
            .MaximumLength(4000).WithMessage("Préférences trop volumineuses.")
            .Must(BeJsonObject).WithMessage("Préférences invalides.")
            .When(x => !string.IsNullOrWhiteSpace(x.PrefsJson));
    }

    private static bool BeJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return true;
        try { return JsonDocument.Parse(json).RootElement.ValueKind == JsonValueKind.Object; }
        catch { return false; }
    }
}

public class UpdateUnitDashboardPrefsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<UpdateUnitDashboardPrefsCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateUnitDashboardPrefsCommand request, CancellationToken ct)
    {
        if (currentUser.UserId is not Guid userId) return Result<bool>.Failure("Non authentifié.");
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return Result<bool>.Failure("Compte introuvable.");
        user.UnitDashboardPrefsJson = string.IsNullOrWhiteSpace(request.PrefsJson) ? null : request.PrefsJson;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
