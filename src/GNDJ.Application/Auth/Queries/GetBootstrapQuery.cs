using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Demandes;
using GNDJ.Application.ChangeRequests;
using GNDJ.Application.Settings;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Queries;

// One-shot "app bootstrap" for the authenticated shell. The frontend used to fire ~5 separate XHRs on first
// paint — /auth/me, /settings/ui.role_colors, /settings/passage.scout_year, /demandes/pending-count,
// /change-requests/pending/count — each a full round-trip (~150-400ms on a mobile link through Cloudflare).
// This folds them into ONE call; the client primes its query cache from the result so the individual hooks
// read from cache instead of re-fetching. Nothing new is exposed: single-key settings are already readable by
// any authenticated user, and the two counts reuse their existing (permission-gated) handlers.
public record GetBootstrapQuery : IRequest<Result<BootstrapResponse>>;

public record BootstrapResponse(
    MeResponse Me,
    SettingDto? RoleColors,      // ui.role_colors — header/sidebar theme
    SettingDto? ScoutYear,       // passage.scout_year — current year (dashboard, badges)
    int PendingDemandes,         // 0 unless the user can view demandes
    int PendingChangeRequests);  // 0 unless the user can review (self-gated by its handler)

public class GetBootstrapQueryHandler : IRequestHandler<GetBootstrapQuery, Result<BootstrapResponse>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IMediator _mediator;

    public GetBootstrapQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMediator mediator)
    {
        _context = context;
        _currentUser = currentUser;
        _mediator = mediator;
    }

    public async ValueTask<Result<BootstrapResponse>> Handle(GetBootstrapQuery request, CancellationToken ct)
    {
        // Reuse the exact /auth/me logic — identity/permissions/unit-access/flags — so the two never drift.
        var me = await _mediator.Send(new GetMeQuery(), ct);
        if (!me.IsSuccess || me.Value is null)
            return Result<BootstrapResponse>.Failure(me.Error ?? "Non authentifié.");

        // Both shell settings in ONE query (was two single-key round-trips).
        var settings = await _context.Settings
            .Where(s => s.Key == "ui.role_colors" || s.Key == "passage.scout_year")
            .Select(s => new SettingDto(s.Key, s.Value, s.Category, s.Label, s.Description, s.ValueType))
            .ToListAsync(ct);
        var roleColors = settings.FirstOrDefault(s => s.Key == "ui.role_colors");
        var scoutYear = settings.FirstOrDefault(s => s.Key == "passage.scout_year");

        // Sidebar badge counts. Demande count has no in-handler gate (the controller attribute guards it), so
        // only compute it when the user can view demandes; the change-request count self-gates to 0 otherwise.
        var pendingDemandes = 0;
        if (_currentUser.IsSuperAdmin || _currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.DemandeView))
        {
            var dc = await _mediator.Send(new GetPendingDemandeCountQuery(), ct);
            pendingDemandes = dc.IsSuccess ? dc.Value : 0;
        }
        var pendingChangeRequests = await _mediator.Send(new GetPendingChangeRequestsCountQuery(), ct);

        return Result<BootstrapResponse>.Success(new BootstrapResponse(
            me.Value, roleColors, scoutYear, pendingDemandes, pendingChangeRequests));
    }
}
