using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Passages;

// « Publier le passage » at a chosen date and time (Lebanon time) instead of by hand. The scheduled-runs job (every
// minute) runs EXACTLY the same FinalizePassagesCommand (for passage.scout_year) once the moment has passed — same
// gates: if a member has no line or a unit hasn't finished, NOTHING is published and the managers are told why.
// Runs as the system (no signed-in user): FinalizePassagesCommand.Automatic skips the caller check, and that flag
// can't be set through the API (the controller builds the command itself).
public static class PassageFinalizeSchedule
{
    public static readonly ScheduledRunKeys Keys = new("passage.finalize_scheduled_at", "passage.finalize_schedule_status",
        "passage", "Publication programmée du passage");

    public static Task<string?> RunDueAsync(IApplicationDbContext context, IMediator mediator, INotificationService notifications, CancellationToken ct) =>
        ScheduledRun.RunDueAsync(context, Keys,
            async c =>
            {
                var year = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(c) ?? "";
                var result = await mediator.Send(new FinalizePassagesCommand(year, Automatic: true), c);
                return result.IsSuccess
                    ? (true, $"Passage {year} publié : {result.Value} ligne(s).")
                    : (false, result.Error ?? "Échec de la publication.");
            },
            (ok, message) => notifications.NotifyGroupManagersAsync("info",
                ok ? "Passage publié" : "Publication programmée du passage : échec",
                ok ? message : $"{message} Rien n'a été publié : corrigez puis publiez à la main ou reprogrammez.",
                "/admin/passage-validation", ct: ct),
            ct);
}

public record GetPassageFinalizeScheduleQuery() : IRequest<Result<ScheduledRunDto>>;

public class GetPassageFinalizeScheduleQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetPassageFinalizeScheduleQuery, Result<ScheduledRunDto>>
{
    public async ValueTask<Result<ScheduledRunDto>> Handle(GetPassageFinalizeScheduleQuery request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser)) return Result<ScheduledRunDto>.Failure("Accès réservé à la maîtrise de groupe.");
        return Result<ScheduledRunDto>.Success(await ScheduledRun.ReadAsync(context, PassageFinalizeSchedule.Keys, ct));
    }
}

// Sets (or, with an empty value, cancels) the scheduled publication. Refused once the year's passage is published.
public record SchedulePassageFinalizeCommand(string? ScheduledAt) : IRequest<Result<bool>>;

public class SchedulePassageFinalizeCommandValidator : AbstractValidator<SchedulePassageFinalizeCommand>
{
    public SchedulePassageFinalizeCommandValidator() => ScheduledRunValidation.Apply(RuleFor(x => x.ScheduledAt));
}

public class SchedulePassageFinalizeCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SchedulePassageFinalizeCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SchedulePassageFinalizeCommand request, CancellationToken ct)
    {
        if (!PassageLocks.IsManager(currentUser)) return Result<bool>.Failure("Accès réservé à la maîtrise de groupe.");
        var empty = string.IsNullOrWhiteSpace(request.ScheduledAt);
        if (!empty)
        {
            var year = await context.Settings.Where(s => s.Key == "passage.scout_year").Select(s => s.Value).FirstOrDefaultAsync(ct) ?? "";
            if (await PassageScope.Lines(context).AnyAsync(p => p.ScoutYear == year && p.Status == Domain.Enums.PassageStatus.Finalized, ct))
                return Result<bool>.Failure("Le passage de cette année est déjà publié.");
        }
        await ScheduledRun.SaveAsync(context, PassageFinalizeSchedule.Keys, request.ScheduledAt, ct);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(empty ? "UnscheduleFinalize" : "ScheduleFinalize", "Passage", null,
            newValues: new { ScheduledAt = empty ? null : request.ScheduledAt!.Trim() }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
