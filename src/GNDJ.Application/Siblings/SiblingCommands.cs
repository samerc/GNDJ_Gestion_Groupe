using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── Approve a suggested/curated family → create the SiblingGroup AND reconcile the family data ──
// Reconcile = dedupe the parents onto the CG-chosen canonical father/mother (merging the duplicate guardians'
// phones/emails onto the canonical, then dropping the now-orphaned duplicate guardians), and copy the chosen
// home address to every sibling. This is what actually cleans the import's duplicate/inconsistent parent records.
public record ApproveSiblingGroupCommand(
    IReadOnlyList<Guid> MemberIds,
    Guid? FatherGuardianId,
    Guid? MotherGuardianId,
    Guid? AddressId) : IRequest<Result<Guid>>;

public class ApproveSiblingGroupCommandValidator : AbstractValidator<ApproveSiblingGroupCommand>
{
    public ApproveSiblingGroupCommandValidator()
    {
        RuleFor(x => x.MemberIds).NotEmpty();
    }
}

public class ApproveSiblingGroupCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<ApproveSiblingGroupCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(ApproveSiblingGroupCommand request, CancellationToken ct)
    {
        var memberIds = request.MemberIds.Distinct().ToList();
        if (memberIds.Count < 2) return Result<Guid>.Failure("Sélectionnez au moins deux membres.");

        var members = await context.Members
            .Include(m => m.GuardianLinks)
            .Include(m => m.Addresses)
            .Where(m => memberIds.Contains(m.Id) && !m.IsDeleted)
            .ToListAsync(ct);
        if (members.Count != memberIds.Count) return Result<Guid>.Failure("Un ou plusieurs membres sont introuvables.");

        await using var tx = await context.BeginTransactionAsync(ct);
        try
        {
            var group = await ResolveGroupAsync(members, ct);

            var touchedDupGuardians = new HashSet<Guid>();
            if (request.FatherGuardianId is Guid fId) await ReconcileParentAsync(members, fId, "Père", touchedDupGuardians, ct);
            if (request.MotherGuardianId is Guid mId) await ReconcileParentAsync(members, mId, "Mère", touchedDupGuardians, ct);
            if (request.AddressId is Guid aId) await ReconcileAddressAsync(members, aId, ct);

            // They're confirmed siblings now → drop any "not siblings" tombstones among them.
            var idSet = members.Select(m => m.Id).ToList();
            var tombstones = await context.SiblingRejections
                .Where(r => idSet.Contains(r.MemberAId) && idSet.Contains(r.MemberBId)).ToListAsync(ct);
            context.SiblingRejections.RemoveRange(tombstones);

            await context.SaveChangesAsync(ct);

            // Second pass: soft-delete guardians left with no links after the dedupe (+ their contacts).
            if (touchedDupGuardians.Count > 0)
            {
                var orphans = await context.Guardians
                    .Include(g => g.Phones).Include(g => g.Emails)
                    .Where(g => touchedDupGuardians.Contains(g.Id) && !g.Links.Any())
                    .ToListAsync(ct);
                foreach (var o in orphans)
                {
                    context.GuardianPhones.RemoveRange(o.Phones);
                    context.GuardianEmails.RemoveRange(o.Emails);
                    context.Guardians.Remove(o);
                }
                if (orphans.Count > 0) await context.SaveChangesAsync(ct);
            }

            await tx.CommitAsync(ct);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }

        await audit.LogAsync("ApproveSiblingGroup", "SiblingGroup", null,
            newValues: new { memberIds, request.FatherGuardianId, request.MotherGuardianId, request.AddressId }, cancellationToken: ct);
        // group.Id is stable (UUIDv7 assigned on construction / loaded), returned for the UI.
        return Result<Guid>.Success(members[0].SiblingGroupId ?? Guid.Empty);
    }

    // Resolve the target group: reuse/merge any existing group(s) among the selected members, else create one.
    private async Task<SiblingGroup> ResolveGroupAsync(List<Member> members, CancellationToken ct)
    {
        var existing = members.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();
        SiblingGroup group;
        if (existing.Count > 0)
        {
            var keepId = existing[0];
            group = await context.SiblingGroups.FirstAsync(g => g.Id == keepId, ct);
            if (existing.Count > 1)
            {
                var others = existing.Skip(1).ToList();
                var toMove = await context.Members.Where(m => m.SiblingGroupId != null && others.Contains(m.SiblingGroupId!.Value)).ToListAsync(ct);
                foreach (var m in toMove) m.SiblingGroupId = keepId;
                var emptied = await context.SiblingGroups.Where(g => others.Contains(g.Id)).ToListAsync(ct);
                context.SiblingGroups.RemoveRange(emptied);
            }
        }
        else
        {
            group = new SiblingGroup();
            context.SiblingGroups.Add(group);
        }
        foreach (var m in members) m.SiblingGroupId = group.Id;
        return group;
    }

    // Point every sibling at the one canonical parent, absorbing the duplicate parents' contacts + links.
    private async Task ReconcileParentAsync(List<Member> members, Guid canonicalId, string roleLabel, HashSet<Guid> touched, CancellationToken ct)
    {
        var role = SiblingUtil.NormRole(roleLabel);
        if (!await context.Guardians.AnyAsync(g => g.Id == canonicalId, ct)) return;

        // The canonical guardian's existing contact keys, for dedup. We do NOT load/mutate the canonical's nav
        // collections — mutating a tracked parent's child collection triggers a spurious parent UPDATE that fails
        // with a DbUpdateConcurrencyException (same gotcha as the multi-page documents feature). All new contacts
        // are inserted straight through the DbSet with the FK set; these HashSets carry the dedup across the batch.
        var phoneKeys = (await context.GuardianPhones.Where(p => p.GuardianId == canonicalId).Select(p => p.Number).ToListAsync(ct))
            .Select(SiblingUtil.Digits).Where(d => d.Length >= 4).ToHashSet();
        var emailKeys = (await context.GuardianEmails.Where(e => e.GuardianId == canonicalId).Select(e => e.Address).ToListAsync(ct))
            .Select(SiblingUtil.NormEmail).Where(n => n.Length > 0).ToHashSet();

        foreach (var member in members)
        {
            if (!member.GuardianLinks.Any(l => l.GuardianId == canonicalId))
                context.GuardianLinks.Add(new GuardianLink { GuardianId = canonicalId, MemberId = member.Id, RelationshipType = roleLabel });

            // Duplicate same-role parents (a different guardian record for the same père/mère).
            var dupLinks = member.GuardianLinks
                .Where(l => l.GuardianId != canonicalId && SiblingUtil.NormRole(l.RelationshipType) == role).ToList();
            foreach (var dup in dupLinks)
            {
                touched.Add(dup.GuardianId);
                await MergeGuardianContactsAsync(canonicalId, dup.GuardianId, phoneKeys, emailKeys, ct);
                context.GuardianLinks.Remove(dup);
            }
        }
    }

    // Copy the duplicate guardian's phones/emails onto the canonical one, deduped (digits / lowercased). New rows
    // are added via the DbSet (with the canonical FK), NOT by mutating a tracked parent nav collection.
    private async Task MergeGuardianContactsAsync(Guid canonicalId, Guid dupGuardianId, HashSet<string> phoneKeys, HashSet<string> emailKeys, CancellationToken ct)
    {
        var dupPhones = await context.GuardianPhones.Where(p => p.GuardianId == dupGuardianId).ToListAsync(ct);
        foreach (var p in dupPhones)
        {
            var d = SiblingUtil.Digits(p.Number);
            if (d.Length >= 4 && phoneKeys.Add(d))
                context.GuardianPhones.Add(new GuardianPhone { GuardianId = canonicalId, CountryCode = p.CountryCode, Number = p.Number, Type = p.Type, IsPrimary = false });
        }
        var dupEmails = await context.GuardianEmails.Where(e => e.GuardianId == dupGuardianId).ToListAsync(ct);
        foreach (var e in dupEmails)
        {
            var n = SiblingUtil.NormEmail(e.Address);
            if (n.Length > 0 && emailKeys.Add(n))
                context.GuardianEmails.Add(new GuardianEmail { GuardianId = canonicalId, Address = e.Address, Type = e.Type, IsPrimary = false });
        }
    }

    // Copy the chosen home address onto every sibling that doesn't already have an equivalent one (as primary).
    private async Task ReconcileAddressAsync(List<Member> members, Guid addressId, CancellationToken ct)
    {
        var src = await context.MemberAddresses.FirstOrDefaultAsync(a => a.Id == addressId, ct);
        if (src is null) return;
        var nCity = TextNormalization.NormalizeKey(src.City);
        var nDetails = TextNormalization.NormalizeKey(src.Details ?? "");
        var nCountry = TextNormalization.NormalizeKey(src.Country);

        foreach (var member in members)
        {
            var has = member.Addresses.Any(a =>
                TextNormalization.NormalizeKey(a.City) == nCity
                && TextNormalization.NormalizeKey(a.Details ?? "") == nDetails
                && TextNormalization.NormalizeKey(a.Country) == nCountry);
            if (!has)
            {
                foreach (var a in member.Addresses) a.IsPrimary = false;
                context.MemberAddresses.Add(new MemberAddress
                {
                    MemberId = member.Id, Type = string.IsNullOrWhiteSpace(src.Type) ? "Domicile" : src.Type,
                    Country = src.Country, City = src.City, Details = src.Details, IsPrimary = true
                });
            }
        }
    }
}

// ── Reject a suggested family: tombstone each pair so it's never re-suggested ──
public record RejectSiblingSuggestionCommand(IReadOnlyList<Guid> MemberIds) : IRequest<Result<bool>>;

public class RejectSiblingSuggestionCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<RejectSiblingSuggestionCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(RejectSiblingSuggestionCommand request, CancellationToken ct)
    {
        var ids = request.MemberIds.Distinct().ToList();
        if (ids.Count < 2) return Result<bool>.Failure("Sélectionnez au moins deux membres.");

        var existing = (await context.SiblingRejections.Select(r => new { r.MemberAId, r.MemberBId }).ToListAsync(ct))
            .Select(x => SiblingUtil.Pair(x.MemberAId, x.MemberBId)).ToHashSet();

        for (int i = 0; i < ids.Count; i++)
            for (int j = i + 1; j < ids.Count; j++)
            {
                var (a, b) = SiblingUtil.Pair(ids[i], ids[j]);
                if (existing.Add((a, b)))
                    context.SiblingRejections.Add(new SiblingRejection { MemberAId = a, MemberBId = b });
            }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("RejectSiblingSuggestion", "SiblingRejection", null, newValues: new { ids }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Manual link: put two members in the same fratrie (merging groups if needed) ──
public record LinkSiblingsCommand(Guid MemberId, Guid TargetMemberId) : IRequest<Result<Guid>>;

public class LinkSiblingsCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<LinkSiblingsCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(LinkSiblingsCommand request, CancellationToken ct)
    {
        if (request.MemberId == request.TargetMemberId) return Result<Guid>.Failure("Sélectionnez deux membres différents.");

        var members = await context.Members
            .Where(m => (m.Id == request.MemberId || m.Id == request.TargetMemberId) && !m.IsDeleted)
            .ToListAsync(ct);
        if (members.Count != 2) return Result<Guid>.Failure("Un ou plusieurs membres sont introuvables.");

        // Reuse/merge an existing group among the two, else create one.
        var existing = members.Where(m => m.SiblingGroupId != null).Select(m => m.SiblingGroupId!.Value).Distinct().ToList();
        Guid groupId;
        if (existing.Count > 0)
        {
            groupId = existing[0];
            if (existing.Count > 1)
            {
                var others = existing.Skip(1).ToList();
                var toMove = await context.Members.Where(m => m.SiblingGroupId != null && others.Contains(m.SiblingGroupId!.Value)).ToListAsync(ct);
                foreach (var m in toMove) m.SiblingGroupId = groupId;
                var emptied = await context.SiblingGroups.Where(g => others.Contains(g.Id)).ToListAsync(ct);
                context.SiblingGroups.RemoveRange(emptied);
            }
        }
        else
        {
            var group = new SiblingGroup();
            context.SiblingGroups.Add(group);
            groupId = group.Id;
        }
        foreach (var m in members) m.SiblingGroupId = groupId;

        // Remove a "not siblings" tombstone on this pair (the CG has now confirmed it).
        var (a, b) = SiblingUtil.Pair(request.MemberId, request.TargetMemberId);
        var tomb = await context.SiblingRejections.Where(r => r.MemberAId == a && r.MemberBId == b).ToListAsync(ct);
        context.SiblingRejections.RemoveRange(tomb);

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("LinkSiblings", "SiblingGroup", groupId, newValues: new { request.MemberId, request.TargetMemberId }, cancellationToken: ct);
        return Result<Guid>.Success(groupId);
    }
}

// ── Unlink a member from its fratrie (dissolving the group if fewer than 2 remain) ──
public record UnlinkSiblingCommand(Guid MemberId) : IRequest<Result<bool>>;

public class UnlinkSiblingCommandHandler(IApplicationDbContext context, IAuditService audit)
    : IRequestHandler<UnlinkSiblingCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UnlinkSiblingCommand request, CancellationToken ct)
    {
        var member = await context.Members.FirstOrDefaultAsync(m => m.Id == request.MemberId && !m.IsDeleted, ct);
        if (member is null) return Result<bool>.Failure("Membre introuvable.");
        if (member.SiblingGroupId is null) return Result<bool>.Success(true); // idempotent — nothing to do

        var gid = member.SiblingGroupId.Value;
        member.SiblingGroupId = null;
        await context.SaveChangesAsync(ct);

        // If the group now has fewer than 2 members, dissolve it.
        var remaining = await context.Members.Where(m => m.SiblingGroupId == gid).ToListAsync(ct);
        if (remaining.Count < 2)
        {
            foreach (var m in remaining) m.SiblingGroupId = null;
            var grp = await context.SiblingGroups.FirstOrDefaultAsync(g => g.Id == gid, ct);
            if (grp is not null) context.SiblingGroups.Remove(grp);
            await context.SaveChangesAsync(ct);
        }

        await audit.LogAsync("UnlinkSibling", "SiblingGroup", gid, newValues: new { request.MemberId }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
