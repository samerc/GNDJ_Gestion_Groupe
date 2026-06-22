using GNDJ.Application.Common.Content;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using GNDJ.Domain.Enums;
using FluentValidation;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Roles.Commands;

// Create — rank is auto-assigned (new functions go to the senior end, never the default); reorder by drag.
public record CreateFunctionalRoleCommand(string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId) : IRequest<Result<Guid>>;

public class CreateFunctionalRoleCommandValidator : AbstractValidator<CreateFunctionalRoleCommand>
{
    public CreateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.SecurityProfileId).NotEmpty().WithMessage("Le profil de sécurité est requis.");
    }
}

public class CreateFunctionalRoleCommandHandler : IRequestHandler<CreateFunctionalRoleCommand, Result<Guid>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public CreateFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<Guid>> Handle(CreateFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var codeExists = await _context.FunctionalRoles.AnyAsync(r => r.Code == request.Code, cancellationToken);
        if (codeExists)
            return Result<Guid>.Failure("Une fonction avec ce code existe déjà.");

        // New functions go to the senior end of their scope (max rank + 1) so they never become the
        // default-for-new-members by accident; the CG reorders them by drag afterwards.
        var maxRank = await _context.FunctionalRoles
            .Where(r => r.UnitTypeId == request.UnitTypeId)
            .Select(r => (int?)r.Rank).MaxAsync(cancellationToken) ?? -1;

        var entity = new FunctionalRole
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            SecurityProfileId = request.SecurityProfileId,
            UnitTypeId = request.UnitTypeId,
            Rank = maxRank + 1
        };

        _context.FunctionalRoles.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "FunctionalRole", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update — rank/default are managed separately (drag-reorder + set-default), not via this command.
public record UpdateFunctionalRoleCommand(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId) : IRequest<Result<bool>>;

public class UpdateFunctionalRoleCommandValidator : AbstractValidator<UpdateFunctionalRoleCommand>
{
    public UpdateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.SecurityProfileId).NotEmpty().WithMessage("Le profil de sécurité est requis.");
    }
}

public class UpdateFunctionalRoleCommandHandler : IRequestHandler<UpdateFunctionalRoleCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public UpdateFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(UpdateFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.FunctionalRoles.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Fonction introuvable.");

        var codeExists = await _context.FunctionalRoles.AnyAsync(r => r.Code == request.Code && r.Id != request.Id, cancellationToken);
        if (codeExists)
            return Result<bool>.Failure("Une fonction avec ce code existe déjà.");

        var oldValues = new { entity.Name, entity.Code };
        entity.Name = request.Name;
        entity.Code = request.Code;
        entity.Description = request.Description;
        entity.SecurityProfileId = request.SecurityProfileId;
        entity.UnitTypeId = request.UnitTypeId;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "FunctionalRole", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}

// Delete — if the function is used by any member (active or past), it is ARCHIVED (hidden from
// pickers but kept so it still shows on those members) instead of deleted. Unused functions are
// hard-deleted. Result value = true when archived, false when deleted.
public record DeleteFunctionalRoleCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteFunctionalRoleCommandHandler : IRequestHandler<DeleteFunctionalRoleCommand, Result<bool>>
{
    private readonly IApplicationDbContext _context;
    private readonly IAuditService _auditService;

    public DeleteFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    {
        _context = context;
        _auditService = auditService;
    }

    public async ValueTask<Result<bool>> Handle(DeleteFunctionalRoleCommand request, CancellationToken cancellationToken)
    {
        var entity = await _context.FunctionalRoles.FindAsync([request.Id], cancellationToken);
        if (entity is null)
            return Result<bool>.Failure("Fonction introuvable.");

        var usedByMembers = await _context.MemberAssignments.AnyAsync(a => a.FunctionalRoleId == request.Id, cancellationToken);
        if (usedByMembers)
        {
            if (!entity.IsArchived)
            {
                entity.IsArchived = true;
                await _context.SaveChangesAsync(cancellationToken);
                await _auditService.LogAsync("Archive", "FunctionalRole", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);
            }
            return Result<bool>.Success(true); // archived
        }

        _context.FunctionalRoles.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "FunctionalRole", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);
        return Result<bool>.Success(false); // deleted
    }
}

// Unarchive — restore an archived function so it shows in pickers again.
public record UnarchiveFunctionalRoleCommand(Guid Id) : IRequest<Result<bool>>;

public class UnarchiveFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    : IRequestHandler<UnarchiveFunctionalRoleCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UnarchiveFunctionalRoleCommand request, CancellationToken ct)
    {
        var entity = await context.FunctionalRoles.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Fonction introuvable.");
        if (entity.IsArchived)
        {
            entity.IsArchived = false;
            await context.SaveChangesAsync(ct);
            await auditService.LogAsync("Unarchive", "FunctionalRole", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: ct);
        }
        return Result<bool>.Success(true);
    }
}

// Reorder — the drag order on the unit-type page sets the rank. List is top→bottom = most senior →
// most junior, so the top item gets the HIGHEST rank (matches the rank-desc maîtrise displays).
public record ReorderFunctionalRolesCommand(List<Guid> OrderedIds) : IRequest<Result<bool>>;

public class ReorderFunctionalRolesCommandValidator : AbstractValidator<ReorderFunctionalRolesCommand>
{
    public ReorderFunctionalRolesCommandValidator()
        => RuleFor(x => x.OrderedIds).NotNull().Must(l => l.Count <= 1000).WithMessage("Trop d'éléments.");
}

public class ReorderFunctionalRolesCommandHandler(IApplicationDbContext context) : IRequestHandler<ReorderFunctionalRolesCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(ReorderFunctionalRolesCommand request, CancellationToken ct)
    {
        var roles = await context.FunctionalRoles.Where(r => request.OrderedIds.Contains(r.Id)).ToListAsync(ct);
        var n = request.OrderedIds.Count;
        for (var i = 0; i < n; i++)
        {
            var role = roles.FirstOrDefault(r => r.Id == request.OrderedIds[i]);
            if (role is not null) role.Rank = n - 1 - i; // top of the list = highest rank (most senior)
        }
        await context.SaveChangesAsync(ct);
        return Result<bool>.Success(true);
    }
}

// Set the "default for new members" function — exactly one per unit type (auto-assigned on demande admit).
public record SetDefaultFunctionalRoleCommand(Guid Id) : IRequest<Result<bool>>;

public class SetDefaultFunctionalRoleCommandHandler(IApplicationDbContext context, IAuditService auditService)
    : IRequestHandler<SetDefaultFunctionalRoleCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(SetDefaultFunctionalRoleCommand request, CancellationToken ct)
    {
        var entity = await context.FunctionalRoles.FindAsync([request.Id], ct);
        if (entity is null) return Result<bool>.Failure("Fonction introuvable.");
        if (entity.IsArchived) return Result<bool>.Failure("Impossible de définir une fonction archivée par défaut.");

        // One default per unit-type scope: clear the others, set this one.
        var siblings = await context.FunctionalRoles
            .Where(r => r.UnitTypeId == entity.UnitTypeId && r.IsDefaultForNewMembers && r.Id != entity.Id)
            .ToListAsync(ct);
        foreach (var s in siblings) s.IsDefaultForNewMembers = false;
        entity.IsDefaultForNewMembers = true;

        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("SetDefault", "FunctionalRole", entity.Id, newValues: new { entity.Name }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ════════════════════════════════════════════════════════════════
// Security profiles — create / delete (custom, non-system)
// ════════════════════════════════════════════════════════════════
public record CreateSecurityProfileCommand(string Name, string? Description, List<string> Permissions) : IRequest<Result<Guid>>;

public class CreateSecurityProfileCommandValidator : AbstractValidator<CreateSecurityProfileCommand>
{
    public CreateSecurityProfileCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.Permissions).NotNull().Must(p => p.Count <= 500).WithMessage("Trop de permissions.");
    }
}

public class CreateSecurityProfileCommandHandler(IApplicationDbContext context, IAuditService auditService)
    : IRequestHandler<CreateSecurityProfileCommand, Result<Guid>>
{
    public async ValueTask<Result<Guid>> Handle(CreateSecurityProfileCommand request, CancellationToken ct)
    {
        // Reject unknown permission strings (prevents garbage / escalation strings).
        var known = Permissions.All.ToHashSet();
        var invalid = request.Permissions.Where(p => !known.Contains(p)).Distinct().ToList();
        if (invalid.Count > 0)
            return Result<Guid>.Failure($"Permission(s) inconnue(s) : {string.Join(", ", invalid)}.");

        // Auto-generate a unique code from the name.
        var baseCode = ContentText.Slugify(request.Name);
        if (string.IsNullOrWhiteSpace(baseCode)) baseCode = "profil";
        if (baseCode.Length > 45) baseCode = baseCode[..45];
        var code = baseCode;
        for (var i = 2; await context.SecurityProfiles.AnyAsync(sp => sp.Code == code, ct); i++)
            code = $"{baseCode}-{i}";

        var profile = new SecurityProfile
        {
            Name = request.Name,
            Code = code,
            Description = request.Description,
            IsSystem = false,
        };
        foreach (var perm in request.Permissions.Distinct())
            profile.Permissions.Add(new SecurityProfilePermission { SecurityProfileId = profile.Id, Permission = perm });

        context.SecurityProfiles.Add(profile);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Create", "SecurityProfile", profile.Id, newValues: new { profile.Name, profile.Code }, cancellationToken: ct);

        return Result<Guid>.Success(profile.Id);
    }
}

public record DeleteSecurityProfileCommand(Guid Id) : IRequest<Result<bool>>;

public class DeleteSecurityProfileCommandHandler(IApplicationDbContext context, IAuditService auditService)
    : IRequestHandler<DeleteSecurityProfileCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteSecurityProfileCommand request, CancellationToken ct)
    {
        var profile = await context.SecurityProfiles
            .Include(sp => sp.Permissions)
            .Include(sp => sp.FunctionalRoles.Where(r => !r.IsDeleted))
            .FirstOrDefaultAsync(sp => sp.Id == request.Id, ct);

        if (profile is null)
            return Result<bool>.Failure("Profil de sécurité introuvable.");
        if (profile.IsSystem)
            return Result<bool>.Failure("Impossible de supprimer un profil système.");
        if (profile.FunctionalRoles.Count > 0)
            return Result<bool>.Failure("Impossible de supprimer un profil utilisé par des fonctions. Réaffectez-les d'abord.");

        context.SecurityProfilePermissions.RemoveRange(profile.Permissions);
        context.SecurityProfiles.Remove(profile);
        await context.SaveChangesAsync(ct);
        await auditService.LogAsync("Delete", "SecurityProfile", profile.Id, oldValues: new { profile.Name, profile.Code }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
