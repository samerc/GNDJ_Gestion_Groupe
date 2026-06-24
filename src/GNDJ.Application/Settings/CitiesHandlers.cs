using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Settings;

// Update the managed list of cities (member.cities). Gated at the controller by maitrise.manage so a
// Chef de Groupe (and super-admin) can curate the list without full settings access. Upserts the row
// so it works even on installs predating the seed.
public record UpdateCitiesCommand(List<string> Cities) : IRequest<Result<bool>>;

public class UpdateCitiesCommandHandler : IRequestHandler<UpdateCitiesCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateCitiesCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateCitiesCommand request, CancellationToken cancellationToken)
    {
        var cities = (request.Cities ?? new List<string>())
            .Select(c => (c ?? string.Empty).Trim())
            .Where(c => c.Length > 0)
            .ToList();

        if (cities.Any(c => c.Length > 100))
            return Result<bool>.Failure("Un nom de ville est trop long (max 100 caractères).");
        if (cities.Any(c => c.Contains('<') || c.Contains('>')))
            return Result<bool>.Failure("Un nom de ville contient des caractères interdits.");
        if (cities.Count > 2000)
            return Result<bool>.Failure("Trop de villes (max 2000).");

        // De-duplicate, accent/case-insensitive, keeping first spelling; sort for a tidy stored list.
        var seen = new HashSet<string>();
        var deduped = new List<string>();
        foreach (var c in cities)
        {
            var key = RemoveDiacritics(c).ToLowerInvariant();
            if (seen.Add(key)) deduped.Add(c);
        }
        deduped.Sort(StringComparer.OrdinalIgnoreCase);

        var value = JsonSerializer.Serialize(deduped);

        var entity = await _context.Settings.FindAsync(["member.cities"], cancellationToken);
        var oldValue = entity?.Value;
        if (entity is null)
        {
            _context.Settings.Add(new Domain.Entities.Setting
            {
                Key = "member.cities",
                Value = value,
                Category = "members",
                Label = "Villes",
                Description = "Liste des villes disponibles dans les formulaires d'adresse",
                ValueType = "json_array"
            });
        }
        else
        {
            entity.Value = value;
        }

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "Setting", null,
            oldValues: new { Key = "member.cities", Value = oldValue },
            newValues: new { Key = "member.cities", Value = value }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }

    private static string RemoveDiacritics(string text)
    {
        var normalized = text.Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder();
        foreach (var ch in normalized)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark)
                sb.Append(ch);
        }
        return sb.ToString().Normalize(System.Text.NormalizationForm.FormC);
    }
}
