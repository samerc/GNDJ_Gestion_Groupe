using FluentValidation;
using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Siblings;

// ── Approve a suggested/curated family → create the SiblingGroup AND reconcile the family data ──
// Reconcile = dedupe the parents onto the CG-chosen canonical father/mother, then drop the now-orphaned duplicate
// guardians, and share the chosen home address(es) to every sibling. This is what actually cleans the import's
// duplicate/inconsistent parent records.
//
// CHERRY-PICK: KeepPhoneIds/KeepEmailIds carry the guardian-contact rows the CG chose to keep on the merged
// canonical parent — chosen from the FULL union of that role's records (the canonical's own + the duplicates').
// When non-null they are AUTHORITATIVE: the canonical ends with EXACTLY the checked contacts — checked duplicate
// contacts are copied on, and any of the canonical's OWN contacts the CG un-checked are dropped too (so a wrong
// email that happened to sit on the main record can be removed, not force-kept). When null (e.g. an old client),
// ALL duplicate parents' contacts are merged onto the canonical (previous blind-merge behaviour). AddressIds lets
// the CG keep MORE THAN ONE address (e.g. two homes) — each is shared to every sibling; the first is the primary.
public record ApproveSiblingGroupCommand(
    IReadOnlyList<Guid> MemberIds,
    Guid? FatherGuardianId,
    Guid? MotherGuardianId,
    IReadOnlyList<Guid>? AddressIds,
    IReadOnlyList<Guid>? KeepPhoneIds = null,
    IReadOnlyList<Guid>? KeepEmailIds = null) : IRequest<Result<Guid>>;

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
            if (request.FatherGuardianId is Guid fId) await ReconcileParentAsync(members, fId, "Père", request.KeepPhoneIds, request.KeepEmailIds, touchedDupGuardians, ct);
            if (request.MotherGuardianId is Guid mId) await ReconcileParentAsync(members, mId, "Mère", request.KeepPhoneIds, request.KeepEmailIds, touchedDupGuardians, ct);
            if (request.AddressIds is { Count: > 0 } addressIds)
            {
                await ReconcileAddressesAsync(members, addressIds, ct);
                group.AddressNeedsReview = false; // the CG picked the canonical address → clears the worklist flag
            }

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
            newValues: new
            {
                Members = await AuditNames.MembersAsync(context, memberIds, ct),
                Father = await AuditNames.GuardianAsync(context, request.FatherGuardianId, ct),
                Mother = await AuditNames.GuardianAsync(context, request.MotherGuardianId, ct),
            }, cancellationToken: ct);
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
    // keepPhoneIds/keepEmailIds (when non-null) = the CG's cherry-picked contacts to keep on the canonical.
    private async Task ReconcileParentAsync(List<Member> members, Guid canonicalId, string roleLabel,
        IReadOnlyList<Guid>? keepPhoneIds, IReadOnlyList<Guid>? keepEmailIds, HashSet<Guid> touched, CancellationToken ct)
    {
        var role = SiblingUtil.NormRole(roleLabel);
        if (!await context.Guardians.AnyAsync(g => g.Id == canonicalId, ct)) return;

        // The same-role candidate parents among these members = the contact pool the CG could pick from. We only
        // ever touch contacts within this pool (so a stray id can't pull in / drop an unrelated contact).
        var poolGuardianIds = members.SelectMany(m => m.GuardianLinks)
            .Where(l => SiblingUtil.NormRole(l.RelationshipType) == role)
            .Select(l => l.GuardianId).Distinct().ToHashSet();

        var cherryPick = keepPhoneIds is not null || keepEmailIds is not null;
        if (cherryPick)
            await ApplyCherryPickedContactsAsync(canonicalId, poolGuardianIds, keepPhoneIds ?? [], keepEmailIds ?? [], ct);

        // For the non-cherry (blind-merge) path we dedup against the canonical's CURRENT contacts. We do NOT
        // load/mutate the canonical's nav collections — mutating a tracked parent's child collection triggers a
        // spurious parent UPDATE that fails with DbUpdateConcurrencyException (same gotcha as multi-page documents);
        // new rows are inserted straight through the DbSet with the FK set.
        HashSet<string> phoneKeys = [], emailKeys = [];
        if (!cherryPick)
        {
            phoneKeys = (await context.GuardianPhones.Where(p => p.GuardianId == canonicalId).Select(p => p.Number).ToListAsync(ct))
                .Select(SiblingUtil.Digits).Where(d => d.Length >= 4).ToHashSet();
            emailKeys = (await context.GuardianEmails.Where(e => e.GuardianId == canonicalId).Select(e => e.Address).ToListAsync(ct))
                .Select(SiblingUtil.NormEmail).Where(n => n.Length > 0).ToHashSet();
        }

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
                // Without cherry-pick, absorb ALL of the duplicate's contacts (previous behaviour).
                if (!cherryPick) await MergeGuardianContactsAsync(canonicalId, dup.GuardianId, phoneKeys, emailKeys, ct);
                context.GuardianLinks.Remove(dup);
            }
        }
    }

    // AUTHORITATIVE cherry-pick: the canonical parent ends with EXACTLY the contacts the CG checked, chosen from the
    // full union of the role's records. keepPhoneIds/keepEmailIds are row ids across the whole pool (canonical's own
    // + duplicates'). We keep the canonical's own rows whose value is checked, DROP its own rows that were un-checked,
    // and copy on the checked duplicate contacts (deduped by value). Contacts are soft-deleted (reversible).
    private async Task ApplyCherryPickedContactsAsync(Guid canonicalId, HashSet<Guid> poolGuardianIds,
        IReadOnlyList<Guid> keepPhoneIds, IReadOnlyList<Guid> keepEmailIds, CancellationToken ct)
    {
        var keepP = keepPhoneIds.ToHashSet();
        var keepE = keepEmailIds.ToHashSet();

        var poolPhones = await context.GuardianPhones.Where(p => poolGuardianIds.Contains(p.GuardianId)).ToListAsync(ct);
        var poolEmails = await context.GuardianEmails.Where(e => poolGuardianIds.Contains(e.GuardianId)).ToListAsync(ct);

        // The normalized values the CG chose to keep (only rows whose id was checked count).
        var keptPhoneVals = poolPhones.Where(p => keepP.Contains(p.Id)).Select(p => SiblingUtil.Digits(p.Number)).Where(d => d.Length >= 4).ToHashSet();
        var keptEmailVals = poolEmails.Where(e => keepE.Contains(e.Id)).Select(e => SiblingUtil.NormEmail(e.Address)).Where(n => n.Length > 0).ToHashSet();

        // Canonical's own rows: keep the ones whose value is chosen, remove the rest (this is what lets the CG drop a
        // wrong contact that sat on the main record). `have` tracks values already present so dups aren't re-added.
        var have = new HashSet<string>();
        foreach (var p in poolPhones.Where(p => p.GuardianId == canonicalId))
        {
            var d = SiblingUtil.Digits(p.Number);
            if (d.Length >= 4 && keptPhoneVals.Contains(d)) have.Add(d);
            else context.GuardianPhones.Remove(p);
        }
        var haveE = new HashSet<string>();
        foreach (var e in poolEmails.Where(e => e.GuardianId == canonicalId))
        {
            var n = SiblingUtil.NormEmail(e.Address);
            if (n.Length > 0 && keptEmailVals.Contains(n)) haveE.Add(n);
            else context.GuardianEmails.Remove(e);
        }

        // Copy on the checked contacts from the OTHER (duplicate) records, deduped by value.
        foreach (var p in poolPhones.Where(p => p.GuardianId != canonicalId && keepP.Contains(p.Id)))
        {
            var d = SiblingUtil.Digits(p.Number);
            if (d.Length >= 4 && have.Add(d))
                context.GuardianPhones.Add(new GuardianPhone { GuardianId = canonicalId, CountryCode = p.CountryCode, Number = p.Number, Type = p.Type, IsPrimary = false });
        }
        foreach (var e in poolEmails.Where(e => e.GuardianId != canonicalId && keepE.Contains(e.Id)))
        {
            var n = SiblingUtil.NormEmail(e.Address);
            if (n.Length > 0 && haveE.Add(n))
                context.GuardianEmails.Add(new GuardianEmail { GuardianId = canonicalId, Address = e.Address, Type = e.Type, IsPrimary = false });
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

    // Share the chosen home address(es) with every sibling — the CG can keep more than one (e.g. two homes). Each
    // selected address is copied onto siblings that don't already have an equivalent; the FIRST selected is the
    // primary (matches the CG's main-home pick). An address a sibling already has is left in place.
    private async Task ReconcileAddressesAsync(List<Member> members, IReadOnlyList<Guid> addressIds, CancellationToken ct)
    {
        var ids = addressIds.Distinct().ToList();
        var sources = await context.MemberAddresses.Where(a => ids.Contains(a.Id)).ToListAsync(ct);
        // Preserve the CG's order (first selected = the main/primary home).
        var ordered = ids.Select(id => sources.FirstOrDefault(s => s.Id == id)).OfType<MemberAddress>().ToList();
        if (ordered.Count == 0) return;

        static string Key(MemberAddress a) =>
            TextNormalization.NormalizeKey(a.City) + "|" + TextNormalization.NormalizeKey(a.Details ?? "") + "|" + TextNormalization.NormalizeKey(a.Country);
        var primaryKey = Key(ordered[0]);

        foreach (var member in members)
        {
            var toAdd = ordered.Where(src => member.Addresses.All(a => Key(a) != Key(src))).ToList();
            var addingPrimary = toAdd.Any(src => Key(src) == primaryKey);
            var hasPrimaryExisting = member.Addresses.Any(a => Key(a) == primaryKey);

            // Re-point the primary flag to the chosen main home only when it's part of this reconcile.
            if (addingPrimary || hasPrimaryExisting)
                foreach (var a in member.Addresses) a.IsPrimary = false;

            foreach (var src in toAdd)
                context.MemberAddresses.Add(new MemberAddress
                {
                    MemberId = member.Id, Type = string.IsNullOrWhiteSpace(src.Type) ? "Domicile" : src.Type,
                    Country = src.Country, City = src.City, Details = src.Details,
                    IsPrimary = Key(src) == primaryKey
                });

            // If the member already had the main-home address (not re-added), mark that existing one primary.
            if (!addingPrimary && hasPrimaryExisting)
                foreach (var a in member.Addresses.Where(a => Key(a) == primaryKey)) a.IsPrimary = true;
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
        await audit.LogAsync("LinkSiblings", "SiblingGroup", groupId, newValues: new
        {
            Member = await AuditNames.MemberAsync(context, request.MemberId, ct),
            Target = await AuditNames.MemberAsync(context, request.TargetMemberId, ct),
        }, cancellationToken: ct);
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

        await audit.LogAsync("UnlinkSibling", "SiblingGroup", gid, newValues: new { Member = member.FirstName + " " + member.LastName }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
