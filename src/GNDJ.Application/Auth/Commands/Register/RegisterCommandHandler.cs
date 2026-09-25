using GNDJ.Application.Auth.Common;
using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Auth.Commands.Register;

// Creates a Member + its primary email + a login User in one transaction, then issues tokens. A new
// account has no roles, so it gets empty permissions/units (just "Ma fiche" access until a chef assigns one).
// The "email already exists" path returns a deliberately vague message to avoid user enumeration.
public class RegisterCommandHandler : IRequestHandler<RegisterCommand, Result<AuthResponse>>
{
    private readonly IApplicationDbContext _context;
    private readonly ITokenService _tokenService;
    private readonly IAuditService _auditService;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ICurrentUserService _device;

    public RegisterCommandHandler(IApplicationDbContext context, ITokenService tokenService, IAuditService auditService, IPasswordHasher passwordHasher, ICurrentUserService device)
    {
        _context = context;
        _tokenService = tokenService;
        _auditService = auditService;
        _passwordHasher = passwordHasher;
        _device = device;
    }

    public async ValueTask<Result<AuthResponse>> Handle(RegisterCommand request, CancellationToken cancellationToken)
    {
        // Check email uniqueness
        var emailExists = await _context.Users
            .AnyAsync(u => u.Email == request.Email, cancellationToken);

        if (emailExists)
            return Result<AuthResponse>.Failure("Impossible de créer le compte. Veuillez réessayer.");

        // Create member
        var member = new Member
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
            DateOfBirth = request.DateOfBirth,
        };
        _context.Members.Add(member);

        // Add primary email to member
        _context.MemberEmails.Add(new MemberEmail
        {
            MemberId = member.Id,
            Address = request.Email,
            Type = "Personnel",
            IsPrimary = true
        });

        // Create user
        var passwordHash = await _passwordHasher.HashAsync(request.Password);
        var user = new User
        {
            MemberId = member.Id,
            Email = request.Email,
            PasswordHash = passwordHash,
            IsActive = true,
            IsSuperAdmin = false
        };
        _context.Users.Add(user);

        // Generate tokens (new user has no permissions or unit access yet)
        var (sessionId, refreshToken) = await UserSessions.StartAsync(
            _context, _tokenService, _passwordHasher, _device, user.Id, false, cancellationToken);
        var accessToken = _tokenService.GenerateAccessToken(user, [], [], sessionId);

        await _context.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync("Create", "User", user.Id, newValues: new { user.Email, user.MemberId }, cancellationToken: cancellationToken);

        return Result<AuthResponse>.Success(new AuthResponse(
            user.Id, member.Id, user.Email, accessToken, refreshToken,
            DateTime.UtcNow.AddMinutes(15), []
        ));
    }
}
