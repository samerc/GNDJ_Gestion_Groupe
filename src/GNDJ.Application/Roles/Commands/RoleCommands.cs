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

// Create
public record CreateFunctionalRoleCommand(string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId, int Rank = 0) : IRequest<Result<Guid>>;

public class CreateFunctionalRoleCommandValidator : AbstractValidator<CreateFunctionalRoleCommand>
{
    public CreateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.Rank).InclusiveBetween(0, 9999);
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

        var entity = new FunctionalRole
        {
            Name = request.Name,
            Code = request.Code,
            Description = request.Description,
            SecurityProfileId = request.SecurityProfileId,
            UnitTypeId = request.UnitTypeId,
            Rank = request.Rank
        };

        _context.FunctionalRoles.Add(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "FunctionalRole", entity.Id, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<Guid>.Success(entity.Id);
    }
}

// Update
public record UpdateFunctionalRoleCommand(Guid Id, string Name, string Code, string? Description, Guid SecurityProfileId, Guid? UnitTypeId, int Rank = 0) : IRequest<Result<bool>>;

public class UpdateFunctionalRoleCommandValidator : AbstractValidator<UpdateFunctionalRoleCommand>
{
    public UpdateFunctionalRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("Le nom est requis.").MaximumLength(100).NoHtml();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Le code est requis.").MaximumLength(50).NoHtml();
        RuleFor(x => x.Description).MaximumLength(1000).NoHtml();
        RuleFor(x => x.Rank).InclusiveBetween(0, 9999);
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
        entity.Rank = request.Rank;

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Update", "FunctionalRole", entity.Id, oldValues: oldValues, newValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

        return Result<bool>.Success(true);
    }
}

// Delete
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
        var entity = await _context.FunctionalRoles
            .Include(r => r.Assignments.Where(a => a.EndDate == null))
            .FirstOrDefaultAsync(r => r.Id == request.Id, cancellationToken);

        if (entity is null)
            return Result<bool>.Failure("Fonction introuvable.");

        if (entity.Assignments.Any())
            return Result<bool>.Failure("Impossible de supprimer une fonction utilisée par des membres actifs.");

        _context.FunctionalRoles.Remove(entity);
        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Delete", "FunctionalRole", entity.Id, oldValues: new { entity.Name, entity.Code }, cancellationToken: cancellationToken);

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
