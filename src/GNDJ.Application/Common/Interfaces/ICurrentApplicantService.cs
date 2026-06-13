namespace GNDJ.Application.Common.Interfaces;

// Reads the current public applicant account from the request JWT (the "applicant" token).
// Null when the caller is not an authenticated applicant.
public interface ICurrentApplicantService
{
    Guid? ApplicantAccountId { get; }
}
