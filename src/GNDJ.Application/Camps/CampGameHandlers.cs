using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

// Camp BP — games stage: define the camp's jeux and assign each one its set of étapistes (the leaders
// who run/score it). Phase 2 (actually scoring the games) is not built yet.

public record CampGameDto(Guid Id, string Name, string? Description, IReadOnlyList<EtapisteDto> Etapistes);
public record EtapisteDto(Guid MemberId, string FirstName, string LastName, string? UnitName);
// IsAine = an older youth (routier / caravelle / JEM, not maîtrise) — only offered when the setting
// camp.etapistes_aines is on, and shown apart in the picker.
public record EtapisteCandidateDto(Guid MemberId, string FirstName, string LastName, string? UnitName, string? UnitCode, string? RoleName,
    bool IsAine = false, string? Branch = null);

// ─── Games ───────────────────────────────────────────────────────────────────
public record GetCampGamesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<CampGameDto>>>;
public class GetCampGamesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetCampGamesQuery, Result<IReadOnlyList<CampGameDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampGameDto>>> Handle(GetCampGamesQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is { } denied) return Result<IReadOnlyList<CampGameDto>>.Failure(denied);
        var games = await context.CampGames.Where(g => g.CampId == request.CampId && !g.IsDeleted)
            .OrderBy(g => g.Name)
            .Select(g => new CampGameDto(g.Id, g.Name, g.Description,
                g.Etapistes.Where(e => !e.IsDeleted).Select(e => new EtapisteDto(
                    e.MemberId, e.Member.FirstName, e.Member.LastName,
                    e.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault())).ToList()))
            .ToListAsync(ct);
        return Result<IReadOnlyList<CampGameDto>>.Success(games);
    }
}

public record CreateCampGameCommand(Guid CampId, string Name, string? Description) : IRequest<Result<Guid>>;
public class CreateCampGameCommandValidator : AbstractValidator<CreateCampGameCommand>
{
    public CreateCampGameCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).NoHtml();
        // Rich text (TipTap HTML) — sanitized with DOMPurify when displayed, so no NoHtml here (like the CMS bodies).
        RuleFor(x => x.Description).MaximumLength(50000);
    }
}
public class CreateCampGameCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<CreateCampGameCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCampGameCommand request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<Guid>.Failure(denied);
        if (string.IsNullOrWhiteSpace(request.Name)) return Result<Guid>.Failure("Le nom du jeu est requis.");
        var g = new CampGame { CampId = request.CampId, Name = request.Name.Trim(), Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim() };
        context.CampGames.Add(g);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(g.Id);
    }
}

public record UpdateCampGameCommand(Guid Id, string Name, string? Description) : IRequest<Result<bool>>;
public class UpdateCampGameCommandValidator : AbstractValidator<UpdateCampGameCommand>
{
    public UpdateCampGameCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150).NoHtml();
        // Rich text (TipTap HTML) — sanitized with DOMPurify when displayed, so no NoHtml here (like the CMS bodies).
        RuleFor(x => x.Description).MaximumLength(50000);
    }
}
public class UpdateCampGameCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<UpdateCampGameCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCampGameCommand request, CancellationToken ct)
    {
        var g = await context.CampGames.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct);
        if (g is null) return Result<bool>.Failure("Jeu introuvable.");
        if (await CampAccess.DenyAsync(context, currentUser, g.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        if (string.IsNullOrWhiteSpace(request.Name)) return Result<bool>.Failure("Le nom du jeu est requis.");
        g.Name = request.Name.Trim();
        g.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteCampGameCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteCampGameCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<DeleteCampGameCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCampGameCommand request, CancellationToken ct)
    {
        var g = await context.CampGames.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct);
        if (g is null) return Result<bool>.Failure("Jeu introuvable.");
        if (await CampAccess.DenyAsync(context, currentUser, g.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        context.CampGames.Remove(g);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Set the étapiste set for a game (replace).
public record SetGameEtapistesCommand(Guid GameId, IReadOnlyList<Guid> MemberIds) : IRequest<Result<bool>>;
public class SetGameEtapistesCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<SetGameEtapistesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetGameEtapistesCommand request, CancellationToken ct)
    {
        var game = await context.CampGames.FirstOrDefaultAsync(g => g.Id == request.GameId && !g.IsDeleted, ct);
        if (game is null) return Result<bool>.Failure("Jeu introuvable.");
        if (await CampAccess.DenyAsync(context, currentUser, game.CampId, CampArea.Jeux, true, ct) is { } denied) return Result<bool>.Failure(denied);
        // Only members being ADDED are checked, so an étapiste already on the game (e.g. before the setting was turned
        // off) never blocks saving the others.
        var current = await context.CampGameEtapistes.Where(e => e.CampGameId == request.GameId && !e.IsDeleted).Select(e => e.MemberId).ToListAsync(ct);
        var eligible = (await EtapisteCandidates.LoadAsync(context, ct)).Select(c => c.MemberId).ToHashSet();
        if (request.MemberIds.Any(id => !current.Contains(id) && !eligible.Contains(id)))
            return Result<bool>.Failure("Seuls les membres de la maîtrise peuvent être étapistes (et les routiers, caravelles et JEM si le réglage l'autorise).");

        var existing = await context.CampGameEtapistes.Where(e => e.CampGameId == request.GameId && !e.IsDeleted).ToListAsync(ct);
        context.CampGameEtapistes.RemoveRange(existing);
        foreach (var mid in request.MemberIds.Distinct())
            context.CampGameEtapistes.Add(new CampGameEtapiste { CampGameId = request.GameId, MemberId = mid });
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Candidate étapistes = the maîtrise only (any active leadership role — an ACG or a commission member is listed
// because they are maîtrise, not because of that). When the setting camp.etapistes_aines is on, the older youth
// of the Clan (routiers), Caravelles and JEM are added too, flagged IsAine so the picker shows them apart.
public record GetEtapisteCandidatesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<EtapisteCandidateDto>>>;
public class GetEtapisteCandidatesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetEtapisteCandidatesQuery, Result<IReadOnlyList<EtapisteCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<EtapisteCandidateDto>>> Handle(GetEtapisteCandidatesQuery request, CancellationToken ct)
    {
        if (await CampAccess.DenyAsync(context, currentUser, request.CampId, CampArea.Jeux, false, ct) is { } denied) return Result<IReadOnlyList<EtapisteCandidateDto>>.Failure(denied);
        return Result<IReadOnlyList<EtapisteCandidateDto>>.Success(await EtapisteCandidates.LoadAsync(context, ct));
    }
}

// Who may be an étapiste (shared by the picker list and the save check).
static class EtapisteCandidates
{
    public const string AinesSetting = "camp.etapistes_aines";
    // Unit-type codes of the older youth branches that may be étapistes when the setting is on.
    private static readonly string[] AineBranches = ["CLAN", "CAR", "JEM"];

    public static async Task<List<EtapisteCandidateDto>> LoadAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var maitrise = await context.MemberAssignments
            .Where(a => !a.IsDeleted && a.EndDate == null && a.FunctionalRole.IsMaitrise && !a.Member.IsDeleted)
            .Select(a => new EtapisteCandidateDto(a.MemberId, a.Member.FirstName, a.Member.LastName, a.Unit.Name, a.Unit.Code,
                a.FunctionalRole.Name, false, null))
            .ToListAsync(ct);

        var allowAines = string.Equals(
            await context.Settings.Where(x => x.Key == AinesSetting).Select(x => x.Value).FirstOrDefaultAsync(ct), "true",
            StringComparison.OrdinalIgnoreCase);
        var aines = allowAines
            ? await context.MemberAssignments
                .Where(a => !a.IsDeleted && a.EndDate == null && !a.FunctionalRole.IsMaitrise && !a.Member.IsDeleted
                            && AineBranches.Contains(a.Unit.UnitType.Code))
                .Select(a => new EtapisteCandidateDto(a.MemberId, a.Member.FirstName, a.Member.LastName, a.Unit.Name, a.Unit.Code,
                    a.FunctionalRole.Name, true, a.Unit.UnitType.Name))
                .ToListAsync(ct)
            : [];

        // A member who is maîtrise somewhere is listed as maîtrise (not as an aîné).
        var maitriseIds = maitrise.Select(m => m.MemberId).ToHashSet();
        return maitrise.GroupBy(c => c.MemberId).Select(g => g.First())
            .Concat(aines.Where(c => !maitriseIds.Contains(c.MemberId)).GroupBy(c => c.MemberId).Select(g => g.First()))
            .OrderBy(c => c.IsAine).ThenBy(c => c.LastName).ThenBy(c => c.FirstName)
            .ToList();
    }
}

// ─── Étapistes: their own games (read the description to explain the game at the camp) ───
// The étapistes (heads of a game) may not be on the commission, so they can't open the Jeux tab: this lists the
// games of live camps where the caller is an étapiste, with the description and the other étapistes.
public record MyCampGameDto(Guid Id, Guid CampId, string CampName, string Name, string? Description, IReadOnlyList<EtapisteDto> Etapistes);
public record GetMyCampGamesQuery : IRequest<Result<IReadOnlyList<MyCampGameDto>>>;
public class GetMyCampGamesQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetMyCampGamesQuery, Result<IReadOnlyList<MyCampGameDto>>>
{
    public async ValueTask<Result<IReadOnlyList<MyCampGameDto>>> Handle(GetMyCampGamesQuery request, CancellationToken ct)
    {
        if (currentUser.MemberId is not { } me) return Result<IReadOnlyList<MyCampGameDto>>.Success([]);
        var games = await context.CampGames
            .Where(g => !g.IsDeleted && !g.Camp.IsDeleted && !g.Camp.IsArchived && g.Etapistes.Any(e => e.MemberId == me && !e.IsDeleted))
            .OrderBy(g => g.Camp.Name).ThenBy(g => g.Name)
            .Select(g => new MyCampGameDto(g.Id, g.CampId, g.Camp.Name, g.Name, g.Description,
                g.Etapistes.Where(e => !e.IsDeleted).Select(e => new EtapisteDto(
                    e.MemberId, e.Member.FirstName, e.Member.LastName,
                    e.Member.Assignments.Where(a => !a.IsDeleted && a.EndDate == null).Select(a => a.Unit.Name).FirstOrDefault())).ToList()))
            .ToListAsync(ct);
        return Result<IReadOnlyList<MyCampGameDto>>.Success(games);
    }
}

// Printable sheet of one game (name, camp, étapistes, then the formatted description) — to take to the camp.
// Allowed for the game's étapistes and for anyone who can view the camp's Jeux.
public record CampGamePdf(byte[] Data, string FileName);
public record GetCampGamePdfQuery(Guid GameId) : IRequest<Result<CampGamePdf>>;
public class GetCampGamePdfQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser, IDocumentTemplateRenderer renderer)
    : IRequestHandler<GetCampGamePdfQuery, Result<CampGamePdf>>
{
    public async ValueTask<Result<CampGamePdf>> Handle(GetCampGamePdfQuery request, CancellationToken ct)
    {
        var g = await context.CampGames.Where(x => x.Id == request.GameId && !x.IsDeleted && !x.Camp.IsDeleted)
            .Select(x => new
            {
                x.CampId, CampName = x.Camp.Name, x.Name, x.Description,
                Etapistes = x.Etapistes.Where(e => !e.IsDeleted).Select(e => new { e.MemberId, e.Member.FirstName, e.Member.LastName }).ToList(),
            })
            .FirstOrDefaultAsync(ct);
        if (g is null) return Result<CampGamePdf>.Failure("Jeu introuvable.");

        var isEtapiste = currentUser.MemberId is { } me && g.Etapistes.Any(e => e.MemberId == me);
        if (!isEtapiste && await CampAccess.DenyAsync(context, currentUser, g.CampId, CampArea.Jeux, false, ct) is { } denied)
            return Result<CampGamePdf>.Failure(denied);

        static string Enc(string s) => System.Net.WebUtility.HtmlEncode(s);
        var etapistes = g.Etapistes.Count == 0 ? "—"
            : string.Join(", ", g.Etapistes.OrderBy(e => e.LastName).Select(e => $"{e.FirstName} {e.LastName}"));
        var html = $"<h1>{Enc(g.Name)}</h1><p><strong>Camp :</strong> {Enc(g.CampName)}</p>"
                 + $"<p><strong>Étapistes :</strong> {Enc(etapistes)}</p><hr>"
                 + (string.IsNullOrWhiteSpace(g.Description) ? "<p><em>Pas encore de description.</em></p>" : g.Description);
        var pdf = renderer.Render(html, new Dictionary<string, string?>());
        var safe = string.Concat(g.Name.Where(c => !System.IO.Path.GetInvalidFileNameChars().Contains(c))).Trim();
        return Result<CampGamePdf>.Success(new CampGamePdf(pdf, $"Jeu - {(safe.Length > 0 ? safe : "jeu")}.pdf"));
    }
}

