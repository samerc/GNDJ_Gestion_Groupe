using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Guardians;

// DTOs
// A parent/tutor. Guardians are SHARED across siblings — one Guardian, many GuardianLinks (one per child).
public record GuardianDto(
    Guid Id, string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased, string? Notes,
    IReadOnlyList<GuardianPhoneDto> Phones, IReadOnlyList<GuardianEmailDto> Emails
);
public record GuardianPhoneDto(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary);
public record GuardianEmailDto(Guid Id, string Address, string Type, bool IsPrimary);

// One guardian↔member link: the relationship (Père/Mère/…) + contact flags for THIS child.
public record GuardianLinkDto(
    Guid LinkId, Guid GuardianId, string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact,
    GuardianDto Guardian
);

public record GuardianSearchDto(Guid Id, string FirstName, string LastName, string? Profession);

// Unit-scoping helpers. Two flavours because a guardian is shared: member access = active assignment in
// an authorized unit; guardian access = linked to AT LEAST ONE such member.
static class GuardianAccessHelper
{
    public static Task<bool> CanAccessMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
        => MemberAccess.CanAccessMemberAsync(context, currentUser, memberId, ct); // a member can see their own family; else leader of the member's unit

    // READ-only (list a member's parents): members.view is enough.
    public static Task<bool> CanViewMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
        => MemberAccess.CanViewMemberAsync(context, currentUser, memberId, ct);

    public static async Task<bool> CanAccessGuardian(IApplicationDbContext context, ICurrentUserService currentUser, Guid guardianId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        // Guardian mutations are leader actions (controllers also gate on members.edit) — enforce it here too.
        if (!currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit)) return false;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        // Guardian is accessible if linked to at least one member the user can see
        return await context.GuardianLinks.AnyAsync(gl =>
            gl.GuardianId == guardianId && !gl.IsDeleted &&
            context.MemberAssignments.Any(a => a.MemberId == gl.MemberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)), ct);
    }
}

// Get guardians for a member (unit-scoped)
public record GetMemberGuardiansQuery(Guid MemberId) : IRequest<Result<IReadOnlyList<GuardianLinkDto>>>;

public class GetMemberGuardiansQueryHandler : IRequestHandler<GetMemberGuardiansQuery, Result<IReadOnlyList<GuardianLinkDto>>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public GetMemberGuardiansQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<IReadOnlyList<GuardianLinkDto>>> Handle(GetMemberGuardiansQuery request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanViewMember(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<IReadOnlyList<GuardianLinkDto>>.Failure("Accès refusé.");

        // Guardian Notes are a STAFF-only annotation (CG/CU). CanAccessMember also lets a member view their OWN
        // family (Ma fiche), so gate Notes on the leader signal (members.edit; super-admin holds it) — a member
        // must never receive a note written about their parent.
        var isLeader = MemberAccess.HasMemberRead(_currentUser) && _currentUser.MemberId != request.MemberId; // staff viewer (not the member's own fiche)

        var result = await _context.GuardianLinks
            .Where(gl => gl.MemberId == request.MemberId && !gl.IsDeleted)
            .Select(gl => new GuardianLinkDto(
                gl.Id, gl.GuardianId, gl.RelationshipType, gl.IsPrimaryContact, gl.IsEmergencyContact,
                new GuardianDto(
                    gl.Guardian.Id, gl.Guardian.FirstName, gl.Guardian.LastName, gl.Guardian.Profession, gl.Guardian.ProfessionDomain, gl.Guardian.IsDeceased, gl.Guardian.Notes,
                    gl.Guardian.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary).Select(p => new GuardianPhoneDto(p.Id, p.CountryCode, p.Number, p.Type, p.IsPrimary)).ToList(),
                    gl.Guardian.Emails.Where(e => !e.IsDeleted).OrderByDescending(e => e.IsPrimary).Select(e => new GuardianEmailDto(e.Id, e.Address, e.Type, e.IsPrimary)).ToList()
                )
            ))
            .ToListAsync(cancellationToken);

        // Strip Notes for non-leaders (fetched above, withheld here — never leaves the server to a member).
        if (!isLeader)
            result = result.Select(gl => gl with { Guardian = gl.Guardian with { Notes = null } }).ToList();

        return Result<IReadOnlyList<GuardianLinkDto>>.Success(result);
    }
}

// Search guardians — scoped to guardians linked to members the user can access
public record SearchGuardiansQuery(string Search) : IRequest<IReadOnlyList<GuardianSearchDto>>;

public class SearchGuardiansQueryHandler : IRequestHandler<SearchGuardiansQuery, IReadOnlyList<GuardianSearchDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public SearchGuardiansQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<IReadOnlyList<GuardianSearchDto>> Handle(SearchGuardiansQuery request, CancellationToken cancellationToken)
    {
        var search = request.Search.ToLower();
        var query = _context.Guardians
            .Where(g => g.FirstName.ToLower().Contains(search) || g.LastName.ToLower().Contains(search));

        // Scope: only guardians linked to members the user can see
        if (!_currentUser.IsSuperAdmin)
        {
            var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
            query = query.Where(g => g.Links.Any(gl => !gl.IsDeleted &&
                _context.MemberAssignments.Any(a => a.MemberId == gl.MemberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId))));
        }

        return await query
            .OrderBy(g => g.LastName).ThenBy(g => g.FirstName)
            .Take(20)
            .Select(g => new GuardianSearchDto(g.Id, g.FirstName, g.LastName, g.Profession))
            .ToListAsync(cancellationToken);
    }
}

// ── Global parent search (Ctrl-K palette) ────────────────────────────────────────────────────────────────
// Use case: a mother emails us without saying who her child is — we search her name/email/phone and see her
// children so we know who she's writing about before replying. Distinct from SearchGuardiansQuery (name-only,
// returns guardians for sibling-linking): this searches NAME + EMAIL + PHONE and returns the linked CHILDREN
// (member + current unit), one row per (guardian, child). Parent contact + child identity is member data, so:
// leaders (members.edit) only; super-admin / Chef de Groupe see the whole group; a Chef d'unité sees only
// children active in their own units; a non-manager gets nothing.
public record ParentSearchResultDto(Guid GuardianId, string GuardianName, string Relationship,
    Guid MemberId, string MemberName, string? UnitName);

public record SearchParentsQuery(string Search) : IRequest<IReadOnlyList<ParentSearchResultDto>>;

public class SearchParentsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<SearchParentsQuery, IReadOnlyList<ParentSearchResultDto>>
{
    public async ValueTask<IReadOnlyList<ParentSearchResultDto>> Handle(SearchParentsQuery request, CancellationToken ct)
    {
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MembersEdit))
            return [];

        var q = request.Search.Trim().ToLower();
        // Phone matching is digit-only (numbers are stored formatted with spaces, e.g. "76 123 456"); a short
        // digit run would match too much, so require ≥ 4 digits to search by phone.
        var digits = new string(q.Where(char.IsDigit).ToArray());

        var links = context.GuardianLinks
            .Where(l => !l.IsDeleted && !l.Guardian.IsDeleted && !l.Member.IsDeleted)
            .Where(l =>
                DbFns.Unaccent(l.Guardian.FirstName.ToLower()).Contains(DbFns.Unaccent(q))
                || DbFns.Unaccent(l.Guardian.LastName.ToLower()).Contains(DbFns.Unaccent(q))
                || DbFns.Unaccent((l.Guardian.FirstName + " " + l.Guardian.LastName).ToLower()).Contains(DbFns.Unaccent(q))
                || l.Guardian.Emails.Any(e => !e.IsDeleted && e.Address.ToLower().Contains(q))
                || (digits.Length >= 4 && l.Guardian.Phones.Any(p => !p.IsDeleted
                    && p.Number.Replace(" ", "").Replace("-", "").Contains(digits))));

        // Scope the CHILDREN: super-admin / Chef de Groupe (maitrise.manage) see the whole group; a CU only sees
        // children with an active assignment in one of their units.
        var isGroupLevel = currentUser.IsSuperAdmin
            || currentUser.Permissions.Contains(GNDJ.Domain.Enums.Permissions.MaitriseManage);
        if (!isGroupLevel)
        {
            var authorized = currentUser.AuthorizedUnitIds;
            links = links.Where(l => l.Member.Assignments.Any(a =>
                a.EndDate == null && !a.IsDeleted && authorized.Contains(a.UnitId)));
        }

        return await links
            .OrderBy(l => l.Member.LastName).ThenBy(l => l.Member.FirstName)
            .Take(25)
            .Select(l => new ParentSearchResultDto(
                l.GuardianId,
                l.Guardian.FirstName + " " + l.Guardian.LastName,
                l.RelationshipType,
                l.MemberId,
                l.Member.FirstName + " " + l.Member.LastName,
                // Current unit for context (correlated sub-select, so a soft-deleted unit just yields null — the
                // row is never dropped).
                l.Member.Assignments
                    .Where(a => a.EndDate == null && !a.IsDeleted)
                    .Select(a => a.Unit.Name)
                    .FirstOrDefault()))
            .ToListAsync(ct);
    }
}

// Create guardian + link (unit-scoped)
public record CreateGuardianCommand(
    Guid MemberId, string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased,
    string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact, string? Notes
) : IRequest<Result<Guid>>;

public class CreateGuardianCommandHandler : IRequestHandler<CreateGuardianCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public CreateGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<Guid>> Handle(CreateGuardianCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        var guardian = new Guardian
        {
            FirstName = request.FirstName, LastName = request.LastName,
            Profession = request.Profession, ProfessionDomain = request.ProfessionDomain, IsDeceased = request.IsDeceased, Notes = request.Notes,
        };
        _context.Guardians.Add(guardian);

        _context.GuardianLinks.Add(new GuardianLink
        {
            GuardianId = guardian.Id, MemberId = request.MemberId,
            RelationshipType = request.RelationshipType,
            IsPrimaryContact = request.IsPrimaryContact, IsEmergencyContact = request.IsEmergencyContact,
        });

        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Create", "Guardian", guardian.Id, newValues: new
        {
            Parent = $"{request.FirstName} {request.LastName}".Trim(),
            Member = await AuditNames.MemberAsync(_context, request.MemberId, cancellationToken),
            request.RelationshipType, request.Profession, request.ProfessionDomain
        }, cancellationToken: cancellationToken);
        return Result<Guid>.Success(guardian.Id);
    }
}

// Update guardian info (unit-scoped)
public record UpdateGuardianCommand(
    Guid Id, string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased, string? Notes
) : IRequest<Result<bool>>;

public class UpdateGuardianCommandHandler : IRequestHandler<UpdateGuardianCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public UpdateGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<bool>> Handle(UpdateGuardianCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.Id, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        var entity = await _context.Guardians.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Parent introuvable.");

        // Snapshot before applying, so the audit logs exactly which parent fields changed.
        var before = GuardianSnapshot(entity);

        entity.FirstName = request.FirstName;
        entity.LastName = request.LastName;
        entity.Profession = request.Profession;
        entity.ProfessionDomain = request.ProfessionDomain;
        entity.IsDeceased = request.IsDeceased;
        entity.Notes = request.Notes;

        await _context.SaveChangesAsync(cancellationToken);

        var (oldValues, newValues) = MemberAuditSnapshot.Diff(before, GuardianSnapshot(entity));
        // Always carry the parent's name for context (even when only e.g. the profession changed).
        var parent = $"{entity.FirstName} {entity.LastName}".Trim();
        oldValues["Parent"] = parent; newValues["Parent"] = parent;
        await _audit.LogAsync("Update", "Guardian", entity.Id, oldValues: oldValues, newValues: newValues, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }

    private static Dictionary<string, object?> GuardianSnapshot(Guardian g) => new()
    {
        ["FirstName"] = g.FirstName, ["LastName"] = g.LastName,
        ["Profession"] = g.Profession, ["ProfessionDomain"] = g.ProfessionDomain,
        ["IsDeceased"] = g.IsDeceased, ["Notes"] = g.Notes,
    };
}

// Update guardian link (relationship type, contact flags)
public record UpdateGuardianLinkCommand(
    Guid LinkId, string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact
) : IRequest<Result<bool>>;

public class UpdateGuardianLinkCommandHandler : IRequestHandler<UpdateGuardianLinkCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public UpdateGuardianLinkCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<bool>> Handle(UpdateGuardianLinkCommand request, CancellationToken cancellationToken)
    {
        var link = await _context.GuardianLinks.FindAsync([request.LinkId], cancellationToken);
        if (link is null) return Result<bool>.Failure("Lien introuvable.");

        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, link.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        var old = new { link.RelationshipType, link.IsPrimaryContact, link.IsEmergencyContact };

        link.RelationshipType = request.RelationshipType;
        link.IsPrimaryContact = request.IsPrimaryContact;
        link.IsEmergencyContact = request.IsEmergencyContact;

        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", link.GuardianId,
            oldValues: new { old.RelationshipType, old.IsPrimaryContact, old.IsEmergencyContact },
            newValues: new
            {
                Parent = await AuditNames.GuardianAsync(_context, link.GuardianId, cancellationToken),
                Member = await AuditNames.MemberAsync(_context, link.MemberId, cancellationToken),
                request.RelationshipType, request.IsPrimaryContact, request.IsEmergencyContact
            }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Link existing guardian (unit-scoped on both member and guardian)
public record LinkGuardianCommand(
    Guid MemberId, Guid GuardianId, string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact
) : IRequest<Result<Guid>>;

public class LinkGuardianCommandHandler : IRequestHandler<LinkGuardianCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public LinkGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<Guid>> Handle(LinkGuardianCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        // Prevent a duplicate link (same guardian + member + relationship). A guardian may legitimately
        // link to the same child under two different relationships, so RelationshipType is part of the key.
        var exists = await _context.GuardianLinks.AnyAsync(gl =>
            gl.GuardianId == request.GuardianId && gl.MemberId == request.MemberId && gl.RelationshipType == request.RelationshipType,
            cancellationToken);
        if (exists)
            return Result<Guid>.Failure("Ce parent est déjà lié à ce membre avec cette relation.");

        var link = new GuardianLink
        {
            GuardianId = request.GuardianId, MemberId = request.MemberId,
            RelationshipType = request.RelationshipType,
            IsPrimaryContact = request.IsPrimaryContact, IsEmergencyContact = request.IsEmergencyContact,
        };
        _context.GuardianLinks.Add(link);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Create", "Guardian", request.GuardianId, newValues: new
        {
            Parent = await AuditNames.GuardianAsync(_context, request.GuardianId, cancellationToken),
            Member = await AuditNames.MemberAsync(_context, request.MemberId, cancellationToken),
            request.RelationshipType
        }, cancellationToken: cancellationToken);
        return Result<Guid>.Success(link.Id);
    }
}

// Unlink (unit-scoped)
public record UnlinkGuardianCommand(Guid LinkId) : IRequest<Result<bool>>;

public class UnlinkGuardianCommandHandler : IRequestHandler<UnlinkGuardianCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public UnlinkGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<bool>> Handle(UnlinkGuardianCommand request, CancellationToken cancellationToken)
    {
        var link = await _context.GuardianLinks.FindAsync([request.LinkId], cancellationToken);
        if (link is null) return Result<bool>.Failure("Lien introuvable.");

        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, link.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        var audit = new
        {
            Parent = await AuditNames.GuardianAsync(_context, link.GuardianId, cancellationToken),
            Member = await AuditNames.MemberAsync(_context, link.MemberId, cancellationToken),
            link.RelationshipType
        };
        _context.GuardianLinks.Remove(link);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Delete", "Guardian", link.GuardianId, oldValues: audit, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Add phone (scoped via guardian access)
public record AddGuardianPhoneCommand(Guid GuardianId, string CountryCode, string Number, string Type, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddGuardianPhoneCommandHandler : IRequestHandler<AddGuardianPhoneCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public AddGuardianPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<Guid>> Handle(AddGuardianPhoneCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.GuardianId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        var entity = new GuardianPhone { GuardianId = request.GuardianId, CountryCode = request.CountryCode, Number = request.Number, Type = request.Type, IsPrimary = request.IsPrimary };
        _context.GuardianPhones.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", request.GuardianId, newValues: new
        {
            Parent = await AuditNames.GuardianAsync(_context, request.GuardianId, cancellationToken),
            Phone = $"{request.CountryCode} {request.Number}".Trim(), request.Type
        }, cancellationToken: cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}

// Add email (scoped)
public record AddGuardianEmailCommand(Guid GuardianId, string Address, string Type, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddGuardianEmailCommandHandler : IRequestHandler<AddGuardianEmailCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public AddGuardianEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }

    public async ValueTask<Result<Guid>> Handle(AddGuardianEmailCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.GuardianId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        var entity = new GuardianEmail { GuardianId = request.GuardianId, Address = request.Address, Type = request.Type, IsPrimary = request.IsPrimary };
        _context.GuardianEmails.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", request.GuardianId, newValues: new
        {
            Parent = await AuditNames.GuardianAsync(_context, request.GuardianId, cancellationToken),
            Email = request.Address, request.Type
        }, cancellationToken: cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}

// Update phone (scoped) — edit a guardian's phone in place (leaders). Own-scoped self-service equivalent lives
// in MyGuardianHandlers.
public record UpdateGuardianPhoneCommand(Guid Id, string CountryCode, string Number, string Type, bool IsPrimary) : IRequest<Result<bool>>;
public class UpdateGuardianPhoneCommandHandler : IRequestHandler<UpdateGuardianPhoneCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public UpdateGuardianPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }
    public async ValueTask<Result<bool>> Handle(UpdateGuardianPhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianPhones.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        var old = $"{entity.CountryCode} {entity.Number}".Trim();
        entity.CountryCode = request.CountryCode; entity.Number = request.Number; entity.Type = request.Type; entity.IsPrimary = request.IsPrimary;
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", entity.GuardianId, oldValues: new { Phone = old },
            newValues: new { Parent = await AuditNames.GuardianAsync(_context, entity.GuardianId, cancellationToken), Phone = $"{request.CountryCode} {request.Number}".Trim(), request.Type }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Update email (scoped)
public record UpdateGuardianEmailCommand(Guid Id, string Address, string Type, bool IsPrimary) : IRequest<Result<bool>>;
public class UpdateGuardianEmailCommandHandler : IRequestHandler<UpdateGuardianEmailCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public UpdateGuardianEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }
    public async ValueTask<Result<bool>> Handle(UpdateGuardianEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        var old = entity.Address;
        entity.Address = request.Address; entity.Type = request.Type; entity.IsPrimary = request.IsPrimary;
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", entity.GuardianId, oldValues: new { Email = old },
            newValues: new { Parent = await AuditNames.GuardianAsync(_context, entity.GuardianId, cancellationToken), Email = request.Address, request.Type }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Delete phone (scoped)
public record DeleteGuardianPhoneCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteGuardianPhoneCommandHandler : IRequestHandler<DeleteGuardianPhoneCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public DeleteGuardianPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }
    public async ValueTask<Result<bool>> Handle(DeleteGuardianPhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianPhones.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        var parent = await AuditNames.GuardianAsync(_context, entity.GuardianId, cancellationToken);
        var phone = $"{entity.CountryCode} {entity.Number}".Trim();
        _context.GuardianPhones.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", entity.GuardianId, oldValues: new { Parent = parent, Phone = phone }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Delete email (scoped)
public record DeleteGuardianEmailCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteGuardianEmailCommandHandler : IRequestHandler<DeleteGuardianEmailCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    private readonly IAuditService _audit;
    public DeleteGuardianEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser, IAuditService audit) { _context = context; _currentUser = currentUser; _audit = audit; }
    public async ValueTask<Result<bool>> Handle(DeleteGuardianEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        var parent = await AuditNames.GuardianAsync(_context, entity.GuardianId, cancellationToken);
        var email = entity.Address;
        _context.GuardianEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _audit.LogAsync("Update", "Guardian", entity.GuardianId, oldValues: new { Parent = parent, Email = email }, cancellationToken: cancellationToken);
        return Result<bool>.Success(true);
    }
}
