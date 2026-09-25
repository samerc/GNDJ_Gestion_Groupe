using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Email;

// Bounce / complaint reports from the email providers (see EmailBounce). The webhook endpoints (EmailWebhooks
// controller) authenticate the provider and hand the parsed report here.
public static class EmailBounceKinds
{
    public const string Hard = "hard", Soft = "soft", Complaint = "complaint";
    // A soft bounce (mailbox full, temporary failure) only suppresses the address after this many reports.
    public const int SoftSuppressAfter = 3;
    private static int Rank(string k) => k == Complaint ? 3 : k == Hard ? 2 : 1;
    public static string Worst(string a, string b) => Rank(a) >= Rank(b) ? a : b;
}

public record RecordEmailBounceCommand(string Provider, string Address, string Kind, string? Reason) : IRequest<Result<bool>>;

public class RecordEmailBounceCommandHandler(IApplicationDbContext context) : IRequestHandler<RecordEmailBounceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RecordEmailBounceCommand request, CancellationToken ct)
    {
        var address = (request.Address ?? "").Trim().ToLowerInvariant();
        if (address.Length is 0 or > 254 || !address.Contains('@')) return Result<bool>.Success(false);
        var now = DateTime.UtcNow;
        var reason = request.Reason is { Length: > 500 } r ? r[..500] : request.Reason;

        var row = await context.EmailBounces.FirstOrDefaultAsync(b => b.Address == address, ct);
        if (row is null)
        {
            row = new EmailBounce { Address = address, Kind = request.Kind, FirstAt = now };
            context.EmailBounces.Add(row);
        }
        row.Kind = row.Count == 0 ? request.Kind : EmailBounceKinds.Worst(row.Kind, request.Kind);
        row.Provider = request.Provider;
        row.Reason = reason;
        row.Count++;
        row.LastAt = now;
        row.Suppressed = row.Kind != EmailBounceKinds.Soft || row.Count >= EmailBounceKinds.SoftSuppressAfter;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// "Réactiver": the address was corrected (or the mailbox fixed) — forget the bounce so mail goes out again.
public record ClearEmailBounceCommand(Guid Id) : IRequest<Result<bool>>;

public class ClearEmailBounceCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<ClearEmailBounceCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ClearEmailBounceCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) throw new UnauthorizedAccessException("Accès réservé au chef de groupe.");
        var row = await context.EmailBounces.FirstOrDefaultAsync(b => b.Id == request.Id, ct);
        if (row is null) return Result<bool>.Failure("Introuvable.");
        context.EmailBounces.Remove(row);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("ClearEmailBounce", "EmailBounce", row.Id, oldValues: new { row.Address, row.Kind }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
