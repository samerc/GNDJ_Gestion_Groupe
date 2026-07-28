namespace GNDJ.Application.Common.Interfaces;

// Current maintenance/kill-switch state. Site = whole site; the three modules are gated individually. Public
// is named PublicSite because `public` is a C# keyword (serializes to JSON "publicSite").
public record MaintenanceState(bool Site, bool PublicSite, bool Demande, bool Membres, string Message);

// Reads the maintenance.* settings, cached briefly so it can be checked on every request cheaply.
public interface IMaintenanceProvider
{
    Task<MaintenanceState> GetAsync(CancellationToken ct = default);
}
