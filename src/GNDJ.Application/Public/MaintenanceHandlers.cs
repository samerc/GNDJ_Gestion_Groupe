using GNDJ.Application.Common.Interfaces;
using Mediator;

namespace GNDJ.Application.Public;

// Anonymous maintenance status for the three frontends (public site, applicant portal, member app) so each
// can show a "Sous maintenance" page. Mirrors the server-side gate (MaintenanceMiddleware).
public record GetMaintenanceStatusQuery : IRequest<MaintenanceState>;

public class GetMaintenanceStatusQueryHandler(IMaintenanceProvider provider)
    : IRequestHandler<GetMaintenanceStatusQuery, MaintenanceState>
{
    public async ValueTask<MaintenanceState> Handle(GetMaintenanceStatusQuery request, CancellationToken ct)
        => await provider.GetAsync(ct);
}
