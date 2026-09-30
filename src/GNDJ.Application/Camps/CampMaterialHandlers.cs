using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — the « liste de matériel » of each game: what the étape needs (item + optional quantity). Stored as a
// small JSON array on the game (CampGame.MaterialsJson); the page sends the whole list on every add / remove.
// Edited by the commission with Jeux "edit" and by the étapistes of THAT game (they know what they need);
// read-only once the camp is archived. Shown on the game card, on the étapistes' « Mes jeux » and in the game PDF.

public record CampGameMaterialDto(string Name, int? Quantity);

public static class CampMaterials
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static IReadOnlyList<CampGameMaterialDto> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<CampGameMaterialDto>>(json, Json) ?? []; }
        catch (JsonException) { return []; }
    }

    public static string? Serialize(IEnumerable<CampGameMaterialDto> items)
    {
        var list = items.ToList();
        return list.Count == 0 ? null : JsonSerializer.Serialize(list, Json);
    }
}

public record SetCampGameMaterialsCommand(Guid GameId, IReadOnlyList<CampGameMaterialDto> Items) : IRequest<Result<IReadOnlyList<CampGameMaterialDto>>>;

public class SetCampGameMaterialsCommandValidator : AbstractValidator<SetCampGameMaterialsCommand>
{
    public SetCampGameMaterialsCommandValidator()
    {
        RuleFor(x => x.GameId).NotEmpty();
        RuleFor(x => x.Items).NotNull().Must(i => i.Count <= 200).WithMessage("La liste de matériel est limitée à 200 éléments.");
        RuleForEach(x => x.Items).ChildRules(i =>
        {
            i.RuleFor(m => m.Name).NotEmpty().WithMessage("Le nom du matériel est requis.").MaximumLength(150).NoHtml();
            i.RuleFor(m => m.Quantity).InclusiveBetween(1, 100000).When(m => m.Quantity != null)
                .WithMessage("La quantité doit être un nombre positif.");
        });
    }
}

public class SetCampGameMaterialsCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SetCampGameMaterialsCommand, Result<IReadOnlyList<CampGameMaterialDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampGameMaterialDto>>> Handle(SetCampGameMaterialsCommand request, CancellationToken ct)
    {
        var g = await context.CampGames.Include(x => x.Camp).FirstOrDefaultAsync(x => x.Id == request.GameId && !x.IsDeleted, ct);
        if (g is null) return Result<IReadOnlyList<CampGameMaterialDto>>.Failure("Jeu introuvable.");
        if (g.Camp.IsArchived) return Result<IReadOnlyList<CampGameMaterialDto>>.Failure("Ce camp est archivé.");

        // Commission with Jeux "edit", or an étapiste of this game.
        var isEtapiste = currentUser.MemberId is { } me
            && await context.CampGameEtapistes.AnyAsync(e => e.CampGameId == g.Id && e.MemberId == me && !e.IsDeleted, ct);
        if (!isEtapiste && await CampAccess.DenyAsync(context, currentUser, g.CampId, CampArea.Jeux, true, ct) is { } denied)
            return Result<IReadOnlyList<CampGameMaterialDto>>.Failure(denied);

        var items = request.Items
            .Select(i => new CampGameMaterialDto(i.Name.Trim(), i.Quantity))
            .Where(i => i.Name.Length > 0).ToList();
        g.MaterialsJson = CampMaterials.Serialize(items);
        await context.SaveChangesAsync(ct);
        return Result<IReadOnlyList<CampGameMaterialDto>>.Success(items);
    }
}
