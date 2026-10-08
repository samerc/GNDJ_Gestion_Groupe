using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// « Décisions à vérifier » — the page warns about refusals that look inconsistent (a brother/sister already in the
// group, a previous demande, a family with another child accepted). When the refusal is intended, the CG says so:
// the demande keeps the confirmed status in DecisionCheckedAs and the warning goes away. Changing the decision later
// makes it come back (the stored status no longer matches). Checked = false removes the answer.
public record SetDemandeDecisionCheckedCommand(Guid DemandeId, bool Checked) : IRequest<Result<bool>>;

public class SetDemandeDecisionCheckedCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit)
    : IRequestHandler<SetDemandeDecisionCheckedCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetDemandeDecisionCheckedCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser)) return Result<bool>.Failure("Accès réservé au chef de groupe.");
        var d = await context.Demandes.FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<bool>.Failure("Demande introuvable.");
        if (request.Checked && d.Status != DemandeStatus.Declined)
            return Result<bool>.Failure("Seul un refus peut être confirmé.");

        d.DecisionCheckedAs = request.Checked ? d.Status : null;
        await context.SaveChangesAsync(ct);
        await audit.LogAsync(request.Checked ? "CheckDecision" : "UncheckDecision", "Demande", d.Id,
            newValues: new { Child = $"{d.FirstName} {d.LastName}", d.Status }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
