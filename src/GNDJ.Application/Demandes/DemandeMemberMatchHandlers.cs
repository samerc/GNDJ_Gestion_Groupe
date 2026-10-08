using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members;
using GNDJ.Domain.Enums;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Demandes;

// The CG's answer to a « Déjà membre ? » flag (see DemandeMemberMatch). Group managers only (demande.manage at the
// controller).
//   Confirm, demande NOT sent yet → stored; « Envoyer les réponses » then updates that member (demande data wins)
//            instead of creating a new file, and the acceptance email carries the member's existing identifiant.
//   Confirm, demande ALREADY sent (a second file exists) → that new file is merged into the existing member right away
//            (demande data wins, existing identifiant / SDL card / photo kept), then the access email (identifiant +
//            set-password link) goes to the family — no trip to Fratries → Doublons.
//   Reject  → this member is never suggested again for this demande; if the demande was sent, the two files are also
//            marked « pas des doublons » so the Doublons tab doesn't flag them.
public record ConfirmDemandeMemberMatchCommand(Guid DemandeId, Guid MemberId) : IRequest<Result<ConfirmMemberMatchResult>>;
public record ConfirmMemberMatchResult(bool Merged, bool AccessSent, string? Note);

public class ConfirmDemandeMemberMatchCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser,
    IMemberMergeService mergeService, IMediator mediator, IAuditService audit)
    : IRequestHandler<ConfirmDemandeMemberMatchCommand, Result<ConfirmMemberMatchResult>>
{
    public async ValueTask<Result<ConfirmMemberMatchResult>> Handle(ConfirmDemandeMemberMatchCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<ConfirmMemberMatchResult>.Failure("Accès réservé au chef de groupe.");

        var d = await context.Demandes.FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<ConfirmMemberMatchResult>.Failure("Demande introuvable.");
        var keeper = await context.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == request.MemberId, ct);
        if (keeper is null) return Result<ConfirmMemberMatchResult>.Failure("Membre introuvable.");
        // Another demande of this year already tied to the same member → almost certainly a duplicate demande.
        var other = await context.Demandes.AnyAsync(x => x.Id != d.Id && x.ScoutYear == d.ScoutYear
            && (x.CreatedMemberId == keeper.Id || (x.MemberMatchId == keeper.Id && x.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed)), ct);
        if (other)
            return Result<ConfirmMemberMatchResult>.Failure("Ce membre est déjà rattaché à une autre demande de cette année (doublon de demande ?).");

        d.MemberMatchId = keeper.Id;
        d.MemberMatchStatus = DemandeMemberMatchStatus.Confirmed;

        // Not converted yet (or refused / not sent): the send will use the existing member.
        if (d.CreatedMemberId is null || d.CreatedMemberId == keeper.Id)
        {
            await context.SaveChangesAsync(ct);
            await LogAsync(d.Id, keeper.Id, merged: false, ct);
            return Result<ConfirmMemberMatchResult>.Success(new ConfirmMemberMatchResult(false, false, null));
        }

        // Already sent: merge the new file (loser) into the existing member (keeper). The demande wins for the data it
        // gave; the existing identifiant, SDL card number and photo are kept.
        var loser = await context.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == d.CreatedMemberId, ct);
        if (loser is null)
        {
            // The new file was deleted meanwhile: just point the demande at the existing member.
            d.CreatedMemberId = keeper.Id;
            await context.SaveChangesAsync(ct);
            await LogAsync(d.Id, keeper.Id, merged: false, ct);
            return Result<ConfirmMemberMatchResult>.Success(new ConfirmMemberMatchResult(false, false, null));
        }

        static string? Win(string? fromDemande, string? existing) => string.IsNullOrWhiteSpace(fromDemande) ? existing : fromDemande;
        var fields = new MemberMergeFields(
            Win(loser.FirstName, keeper.FirstName), Win(loser.LastName, keeper.LastName),
            loser.DateOfBirth ?? keeper.DateOfBirth, Win(loser.Gender, keeper.Gender),
            Win(keeper.ExternalCardNumber, loser.ExternalCardNumber),
            Win(loser.BloodType, keeper.BloodType), Win(loser.Nationality, keeper.Nationality),
            Win(loser.School, keeper.School), Win(loser.Classe, keeper.Classe), Win(loser.Section, keeper.Section),
            Win(keeper.ProfessionDomain, loser.ProfessionDomain), Win(keeper.Profession, loser.Profession),
            Win(loser.MedicalNotes, keeper.MedicalNotes), Win(loser.Allergies, keeper.Allergies),
            Win(keeper.Notes, loser.Notes), Win(loser.PrimaryContactEmail, keeper.PrimaryContactEmail),
            Win(keeper.PhotoPath, loser.PhotoPath),
            Username: null); // keep the existing member's identifiant
        var loserId = loser.Id;
        d.CreatedMemberId = keeper.Id; // saved inside the merge transaction
        await mergeService.MergeAsync(keeper.Id, [loserId], fields, ct);
        await LogAsync(d.Id, keeper.Id, merged: true, ct);

        // The family's acceptance email pointed at the new identifiant, now switched off → send the existing one.
        var access = await mediator.Send(new SendAccessEmailsCommand([keeper.Id]), ct);
        if (!access.IsSuccess)
            return Result<ConfirmMemberMatchResult>.Success(new ConfirmMemberMatchResult(true, false, access.Error));
        var r = access.Value!;
        var note = r.Sent > 0 ? null
            : r.NoEmail > 0 ? "Aucun email sur la fiche : envoyez l'accès à la main (Actions → Envoyer l'accès) une fois un email ajouté."
            : r.NoAccount > 0 ? "La fiche n'a pas de compte de connexion."
            : "L'email d'accès n'a pas pu être envoyé.";
        return Result<ConfirmMemberMatchResult>.Success(new ConfirmMemberMatchResult(true, r.Sent > 0, note));
    }

    private async Task LogAsync(Guid demandeId, Guid memberId, bool merged, CancellationToken ct) =>
        await audit.LogAsync("ConfirmMemberMatch", "Demande", demandeId,
            newValues: new { Member = await AuditNames.MemberAsync(context, memberId, ct), Merged = merged }, cancellationToken: ct);
}

public record RejectDemandeMemberMatchCommand(Guid DemandeId, Guid MemberId) : IRequest<Result<bool>>;

public class RejectDemandeMemberMatchCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IMediator mediator, IAuditService audit)
    : IRequestHandler<RejectDemandeMemberMatchCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RejectDemandeMemberMatchCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Accès réservé au chef de groupe.");
        var d = await context.Demandes.FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<bool>.Failure("Demande introuvable.");
        if (d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed && d.CreatedMemberId == d.MemberMatchId && d.CreatedMemberId != null)
            return Result<bool>.Failure("Les deux fiches ont déjà été fusionnées.");

        d.MemberMatchId = request.MemberId;
        d.MemberMatchStatus = DemandeMemberMatchStatus.Rejected;
        await context.SaveChangesAsync(ct);

        // Already sent: the two files exist → keep the Doublons tab quiet about them.
        if (d.CreatedMemberId is Guid created && created != request.MemberId)
            await mediator.Send(new RejectDuplicateMembersCommand([created, request.MemberId]), ct);

        await audit.LogAsync("RejectMemberMatch", "Demande", d.Id,
            newValues: new { Member = await AuditNames.MemberAsync(context, request.MemberId, ct) }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// Undo an answer given by mistake (only while nothing was merged): the flag is computed again.
public record ClearDemandeMemberMatchCommand(Guid DemandeId) : IRequest<Result<bool>>;

public class ClearDemandeMemberMatchCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<ClearDemandeMemberMatchCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ClearDemandeMemberMatchCommand request, CancellationToken ct)
    {
        if (!MemberAccess.IsGroupManager(currentUser))
            return Result<bool>.Failure("Accès réservé au chef de groupe.");
        var d = await context.Demandes.FirstOrDefaultAsync(x => x.Id == request.DemandeId, ct);
        if (d is null) return Result<bool>.Failure("Demande introuvable.");
        if (d.MemberMatchStatus == DemandeMemberMatchStatus.Confirmed && d.CreatedMemberId != null && d.CreatedMemberId == d.MemberMatchId)
            return Result<bool>.Failure("La demande a déjà été rattachée à ce membre : il n'est plus possible d'annuler.");
        d.MemberMatchId = null;
        d.MemberMatchStatus = null;
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}
