using GNDJ.Application.Auth.DTOs;
using GNDJ.Application.Common.Models;
using Mediator;

namespace GNDJ.Application.Auth.Commands.Register;

// Public self-registration: creates both a Member and its login User in one step. Applicants do NOT use
// this (they have their own isolated ApplicantAccount flow); most member accounts are created by a chef.
public record RegisterCommand(
    string Email,
    string Password,
    string ConfirmPassword,
    string FirstName,
    string LastName,
    DateOnly? DateOfBirth
) : IRequest<Result<AuthResponse>>;
