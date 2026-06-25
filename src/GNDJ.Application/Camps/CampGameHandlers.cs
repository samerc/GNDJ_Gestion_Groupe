using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Camps;

public record CampGameDto(Guid Id, string Name, string? Description, IReadOnlyList<EtapisteDto> Etapistes);
public record EtapisteDto(Guid MemberId, string FirstName, string LastName, string? UnitName);
public record EtapisteCandidateDto(Guid MemberId, string FirstName, string LastName, string? UnitName, string? RoleName);

// ─── Games ───────────────────────────────────────────────────────────────────
public record GetCampGamesQuery(Guid CampId) : IRequest<Result<IReadOnlyList<CampGameDto>>>;
public class GetCampGamesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetCampGamesQuery, Result<IReadOnlyList<CampGameDto>>>
{
    public async ValueTask<Result<IReadOnlyList<CampGameDto>>> Handle(GetCampGamesQuery request, CancellationToken ct)
    {
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
public class CreateCampGameCommandHandler(IApplicationDbContext context) : IRequestHandler<CreateCampGameCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateCampGameCommand request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) return Result<Guid>.Failure("Le nom du jeu est requis.");
        var g = new CampGame { CampId = request.CampId, Name = request.Name.Trim(), Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim() };
        context.CampGames.Add(g);
        await context.SaveChangesAsync(ct);
        return Result<Guid>.Success(g.Id);
    }
}

public record UpdateCampGameCommand(Guid Id, string Name, string? Description) : IRequest<Result<bool>>;
public class UpdateCampGameCommandHandler(IApplicationDbContext context) : IRequestHandler<UpdateCampGameCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateCampGameCommand request, CancellationToken ct)
    {
        var g = await context.CampGames.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct);
        if (g is null) return Result<bool>.Failure("Jeu introuvable.");
        if (string.IsNullOrWhiteSpace(request.Name)) return Result<bool>.Failure("Le nom du jeu est requis.");
        g.Name = request.Name.Trim();
        g.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

public record DeleteCampGameCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteCampGameCommandHandler(IApplicationDbContext context) : IRequestHandler<DeleteCampGameCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteCampGameCommand request, CancellationToken ct)
    {
        var g = await context.CampGames.FirstOrDefaultAsync(x => x.Id == request.Id && !x.IsDeleted, ct);
        if (g is null) return Result<bool>.Failure("Jeu introuvable.");
        context.CampGames.Remove(g);
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Set the étapiste set for a game (replace).
public record SetGameEtapistesCommand(Guid GameId, IReadOnlyList<Guid> MemberIds) : IRequest<Result<bool>>;
public class SetGameEtapistesCommandHandler(IApplicationDbContext context) : IRequestHandler<SetGameEtapistesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetGameEtapistesCommand request, CancellationToken ct)
    {
        var game = await context.CampGames.FirstOrDefaultAsync(g => g.Id == request.GameId && !g.IsDeleted, ct);
        if (game is null) return Result<bool>.Failure("Jeu introuvable.");

        var existing = await context.CampGameEtapistes.Where(e => e.CampGameId == request.GameId && !e.IsDeleted).ToListAsync(ct);
        context.CampGameEtapistes.RemoveRange(existing);
        foreach (var mid in request.MemberIds.Distinct())
            context.CampGameEtapistes.Add(new CampGameEtapiste { CampGameId = request.GameId, MemberId = mid });
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Candidate étapistes = active leaders (members holding a maîtrise/leadership functional role).
public record GetEtapisteCandidatesQuery() : IRequest<Result<IReadOnlyList<EtapisteCandidateDto>>>;
public class GetEtapisteCandidatesQueryHandler(IApplicationDbContext context) : IRequestHandler<GetEtapisteCandidatesQuery, Result<IReadOnlyList<EtapisteCandidateDto>>>
{
    public async ValueTask<Result<IReadOnlyList<EtapisteCandidateDto>>> Handle(GetEtapisteCandidatesQuery request, CancellationToken ct)
    {
        var leaders = await context.MemberAssignments
            .Where(a => !a.IsDeleted && a.EndDate == null && a.FunctionalRole.IsMaitrise)
            .Select(a => new EtapisteCandidateDto(a.MemberId, a.Member.FirstName, a.Member.LastName, a.Unit.Name, a.FunctionalRole.Name))
            .ToListAsync(ct);
        var result = leaders.GroupBy(c => c.MemberId).Select(g => g.First())
            .OrderBy(c => c.LastName).ThenBy(c => c.FirstName).ToList();
        return Result<IReadOnlyList<EtapisteCandidateDto>>.Success(result);
    }
}
