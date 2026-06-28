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
    public static async Task<bool> CanAccessMember(IApplicationDbContext context, ICurrentUserService currentUser, Guid memberId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
        var authorizedUnitIds = currentUser.AuthorizedUnitIds;
        return await context.MemberAssignments.AnyAsync(a =>
            a.MemberId == memberId && !a.IsDeleted && a.EndDate == null && authorizedUnitIds.Contains(a.UnitId), ct);
    }

    public static async Task<bool> CanAccessGuardian(IApplicationDbContext context, ICurrentUserService currentUser, Guid guardianId, CancellationToken ct)
    {
        if (currentUser.IsSuperAdmin) return true;
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
        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, request.MemberId, cancellationToken))
            return Result<IReadOnlyList<GuardianLinkDto>>.Failure("Accès refusé.");

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

// Create guardian + link (unit-scoped)
public record CreateGuardianCommand(
    Guid MemberId, string FirstName, string LastName, string? Profession, string? ProfessionDomain, bool IsDeceased,
    string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact, string? Notes
) : IRequest<Result<Guid>>;

public class CreateGuardianCommandHandler : IRequestHandler<CreateGuardianCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public CreateGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

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
    public UpdateGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<bool>> Handle(UpdateGuardianCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.Id, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        var entity = await _context.Guardians.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Parent introuvable.");

        entity.FirstName = request.FirstName;
        entity.LastName = request.LastName;
        entity.Profession = request.Profession;
        entity.ProfessionDomain = request.ProfessionDomain;
        entity.IsDeceased = request.IsDeceased;
        entity.Notes = request.Notes;

        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Update guardian link (relationship type, contact flags)
public record UpdateGuardianLinkCommand(
    Guid LinkId, string RelationshipType, bool IsPrimaryContact, bool IsEmergencyContact
) : IRequest<Result<bool>>;

public class UpdateGuardianLinkCommandHandler : IRequestHandler<UpdateGuardianLinkCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public UpdateGuardianLinkCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<bool>> Handle(UpdateGuardianLinkCommand request, CancellationToken cancellationToken)
    {
        var link = await _context.GuardianLinks.FindAsync([request.LinkId], cancellationToken);
        if (link is null) return Result<bool>.Failure("Lien introuvable.");

        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, link.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        link.RelationshipType = request.RelationshipType;
        link.IsPrimaryContact = request.IsPrimaryContact;
        link.IsEmergencyContact = request.IsEmergencyContact;

        await _context.SaveChangesAsync(cancellationToken);
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
    public LinkGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

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
        return Result<Guid>.Success(link.Id);
    }
}

// Unlink (unit-scoped)
public record UnlinkGuardianCommand(Guid LinkId) : IRequest<Result<bool>>;

public class UnlinkGuardianCommandHandler : IRequestHandler<UnlinkGuardianCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public UnlinkGuardianCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<bool>> Handle(UnlinkGuardianCommand request, CancellationToken cancellationToken)
    {
        var link = await _context.GuardianLinks.FindAsync([request.LinkId], cancellationToken);
        if (link is null) return Result<bool>.Failure("Lien introuvable.");

        if (!await GuardianAccessHelper.CanAccessMember(_context, _currentUser, link.MemberId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");

        _context.GuardianLinks.Remove(link);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Add phone (scoped via guardian access)
public record AddGuardianPhoneCommand(Guid GuardianId, string CountryCode, string Number, string Type, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddGuardianPhoneCommandHandler : IRequestHandler<AddGuardianPhoneCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public AddGuardianPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<Guid>> Handle(AddGuardianPhoneCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.GuardianId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        var entity = new GuardianPhone { GuardianId = request.GuardianId, CountryCode = request.CountryCode, Number = request.Number, Type = request.Type, IsPrimary = request.IsPrimary };
        _context.GuardianPhones.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}

// Add email (scoped)
public record AddGuardianEmailCommand(Guid GuardianId, string Address, string Type, bool IsPrimary) : IRequest<Result<Guid>>;

public class AddGuardianEmailCommandHandler : IRequestHandler<AddGuardianEmailCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public AddGuardianEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }

    public async ValueTask<Result<Guid>> Handle(AddGuardianEmailCommand request, CancellationToken cancellationToken)
    {
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, request.GuardianId, cancellationToken))
            return Result<Guid>.Failure("Accès refusé.");

        var entity = new GuardianEmail { GuardianId = request.GuardianId, Address = request.Address, Type = request.Type, IsPrimary = request.IsPrimary };
        _context.GuardianEmails.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<Guid>.Success(entity.Id);
    }
}

// Delete phone (scoped)
public record DeleteGuardianPhoneCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteGuardianPhoneCommandHandler : IRequestHandler<DeleteGuardianPhoneCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public DeleteGuardianPhoneCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }
    public async ValueTask<Result<bool>> Handle(DeleteGuardianPhoneCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianPhones.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Téléphone introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        _context.GuardianPhones.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}

// Delete email (scoped)
public record DeleteGuardianEmailCommand(Guid Id) : IRequest<Result<bool>>;
public class DeleteGuardianEmailCommandHandler : IRequestHandler<DeleteGuardianEmailCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;
    public DeleteGuardianEmailCommandHandler(IApplicationDbContext context, ICurrentUserService currentUser) { _context = context; _currentUser = currentUser; }
    public async ValueTask<Result<bool>> Handle(DeleteGuardianEmailCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.GuardianEmails.FindAsync([request.Id], cancellationToken);
        if (entity is null) return Result<bool>.Failure("Courriel introuvable.");
        if (!await GuardianAccessHelper.CanAccessGuardian(_context, _currentUser, entity.GuardianId, cancellationToken))
            return Result<bool>.Failure("Accès refusé.");
        _context.GuardianEmails.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }
}
