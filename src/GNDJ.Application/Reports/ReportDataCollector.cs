using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Reports;

// One report line — every field a column can print. Roster + export both map from this (they share the exact
// same field set), so the rich projection + guardian/contact lookups + multi-unit grouping live in ONE place.
public record ReportRow(
    string Name, string? FirstName, string? LastName, string? CardNumber, string? ExternalCardNumber,
    string? Gender, string? DateOfBirth, int? Age, string? BloodType, string? Nationality,
    string? School, string? Classe, string? Section, string? Profession, string? ProfessionDomain,
    string? Phone, string? Email, string? Address, string? PrimaryContactEmail,
    string? FatherName, string? FatherPhone, string? MotherName, string? MotherPhone, string? GuardianEmails,
    string? UnitName, string? RoleName, string? TeamName, string? StartDate,
    IReadOnlyList<MemberCardCustomField> CustomFields);

// A grouped section of the report (one team within a unit; label carries the unit prefix on multi-unit reports).
public record ReportSection(string Label, IReadOnlyList<ReportRow> Rows);

// Shared collector for roster/export reports: enforces access, gathers ALL fields for the active members of
// the target unit(s), applies the maîtrise/youth filter, and groups them into per-(unit,team) sections
// (Maîtrise team first). Used by GenerateRoster/GenerateExport (single unit) and the template generator
// (unit / units / branch / group scopes).
public static class ReportDataCollector
{
    public static async Task<Result<(string Title, List<ReportSection> Sections)>> CollectAsync(
        IApplicationDbContext context, ICurrentUserService currentUser,
        List<Guid> unitIds, Guid? teamId, string? memberFilter, string? titleOverride, CancellationToken ct)
    {
        unitIds = unitIds.Distinct().ToList();
        if (unitIds.Count == 0) return Result<(string, List<ReportSection>)>.Failure("Aucune unité.");

        // Leader-only report (multi-member PII). super-admin sees every target unit; any other leader
        // (members.edit) is FILTERED to the target units they actually lead — so a CU running a branch/group
        // report only ever gets their own units' members (no cross-unit PII), while a CG (all units granted)
        // gets the whole scope. Fails only when the caller can access none of the target units.
        var isSuper = currentUser.IsSuperAdmin;
        if (!isSuper)
        {
            if (!currentUser.Permissions.Contains(Permissions.MembersEdit))
                return Result<(string, List<ReportSection>)>.Failure("Accès non autorisé.");
            unitIds = unitIds.Where(id => currentUser.AuthorizedUnitIds.Contains(id)).ToList();
            if (unitIds.Count == 0)
                return Result<(string, List<ReportSection>)>.Failure("Aucune unité accessible pour ce rapport.");
        }

        var units = await context.Units
            .Where(u => unitIds.Contains(u.Id))
            .Select(u => new { u.Id, u.Name })
            .ToListAsync(ct);
        if (units.Count == 0) return Result<(string, List<ReportSection>)>.Failure("Unité introuvable.");
        var unitName = units.ToDictionary(u => u.Id, u => u.Name);
        var multiUnit = units.Count > 1;

        // Reports show the school CODE (CNDJ, CSG, …), not the long name — resolve via member.school_codes.
        var schoolCodesJson = await context.Settings
            .Where(s => s.Key == "member.school_codes").Select(s => s.Value).FirstOrDefaultAsync(ct);
        var schoolCode = SchoolCode.Resolver(schoolCodesJson);

        var query = context.MemberAssignments
            .Where(a => unitIds.Contains(a.UnitId) && a.EndDate == null);
        if (teamId.HasValue) query = query.Where(a => a.TeamId == teamId.Value);
        // Member filter: youth = non-maîtrise roles; maitrise = maîtrise roles; all = everyone.
        if (memberFilter == "youth") query = query.Where(a => !a.FunctionalRole.IsMaitrise);
        else if (memberFilter == "maitrise") query = query.Where(a => a.FunctionalRole.IsMaitrise);

        var rows = await query
            .Select(a => new
            {
                a.UnitId,
                a.StartDate,
                a.Member.Id,
                a.Member.FirstName, a.Member.LastName, a.Member.CardNumber, a.Member.ExternalCardNumber,
                a.Member.Gender, a.Member.DateOfBirth, a.Member.BloodType, a.Member.Nationality,
                a.Member.School, a.Member.Classe, a.Member.Section, a.Member.Profession, a.Member.ProfessionDomain,
                a.Member.PrimaryContactEmail,
                Phone = a.Member.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                Email = a.Member.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
                Address = a.Member.Addresses.Where(ad => ad.IsPrimary && !ad.IsDeleted)
                    .Select(ad => (ad.Details ?? "") + (ad.Details != null && ad.City != "" ? ", " : "") + ad.City).FirstOrDefault(),
                FatherName = a.Member.GuardianLinks
                    .Where(gl => !gl.IsDeleted && (gl.RelationshipType == "Père" || gl.RelationshipType == "Pere"))
                    .Select(gl => gl.Guardian.FirstName + " " + gl.Guardian.LastName).FirstOrDefault(),
                FatherPhone = a.Member.GuardianLinks
                    .Where(gl => !gl.IsDeleted && (gl.RelationshipType == "Père" || gl.RelationshipType == "Pere"))
                    .Select(gl => gl.Guardian.Phones.Where(p => !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault()).FirstOrDefault(),
                MotherName = a.Member.GuardianLinks
                    .Where(gl => !gl.IsDeleted && (gl.RelationshipType == "Mère" || gl.RelationshipType == "Mere"))
                    .Select(gl => gl.Guardian.FirstName + " " + gl.Guardian.LastName).FirstOrDefault(),
                MotherPhone = a.Member.GuardianLinks
                    .Where(gl => !gl.IsDeleted && (gl.RelationshipType == "Mère" || gl.RelationshipType == "Mere"))
                    .Select(gl => gl.Guardian.Phones.Where(p => !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault()).FirstOrDefault(),
                GuardianEmails = a.Member.GuardianLinks.Where(gl => !gl.IsDeleted)
                    .SelectMany(gl => gl.Guardian.Emails.Where(e => !e.IsDeleted).Select(e => e.Address)).ToList(),
                RoleName = a.FunctionalRole.Name,
                RoleRank = a.FunctionalRole.Rank,
                TeamName = a.Team != null ? a.Team.Name : null,
                TeamOrder = a.Team != null ? a.Team.DisplayOrder : 999,
                TeamIsMaitrise = a.Team != null && a.Team.IsMaitrise,
            })
            .ToListAsync(ct);

        // Custom field values for the gathered members (printed by name when a column key matches a field name).
        var memberIds = rows.Select(r => r.Id).Distinct().ToList();
        var customValues = await context.MemberCustomFieldValues
            .Where(v => memberIds.Contains(v.MemberId) && v.CustomField.IsActive)
            .Select(v => new { v.MemberId, v.CustomField.Name, v.Value })
            .ToListAsync(ct);
        var customByMember = customValues
            .GroupBy(v => v.MemberId)
            .ToDictionary(g => g.Key, g => g.Select(v => new MemberCardCustomField(v.Name, v.Value)).ToList());

        var today = LebanonClock.Today;

        // Group by (unit, team): units alphabetical, Maîtrise team first, then team order. On a single-unit report
        // the section label is just the team; on multi-unit it's "Unit — Team" so each block names its unit.
        var sections = rows
            .GroupBy(r => new { r.UnitId, r.TeamName, r.TeamOrder, r.TeamIsMaitrise })
            .OrderBy(g => unitName.GetValueOrDefault(g.Key.UnitId, ""))
            .ThenByDescending(g => g.Key.TeamIsMaitrise).ThenBy(g => g.Key.TeamOrder)
            .Select(g =>
            {
                var team = g.Key.TeamName ?? "Sans équipe";
                var label = multiUnit ? $"{unitName.GetValueOrDefault(g.Key.UnitId, "")} — {team}" : team;
                var members = g
                    .OrderByDescending(r => r.RoleRank).ThenBy(r => r.LastName).ThenBy(r => r.FirstName)
                    .Select(r =>
                    {
                        int? age = r.DateOfBirth.HasValue
                            ? today.Year - r.DateOfBirth.Value.Year - (today.DayOfYear < r.DateOfBirth.Value.DayOfYear ? 1 : 0)
                            : null;
                        return new ReportRow(
                            $"{r.FirstName} {r.LastName}", r.FirstName, r.LastName, r.CardNumber, r.ExternalCardNumber,
                            r.Gender, r.DateOfBirth?.ToString("dd/MM/yyyy"), age, r.BloodType, r.Nationality,
                            schoolCode(r.School), r.Classe, r.Section, r.Profession, r.ProfessionDomain,
                            r.Phone, r.Email, string.IsNullOrWhiteSpace(r.Address) ? null : r.Address, r.PrimaryContactEmail,
                            r.FatherName, r.FatherPhone, r.MotherName, r.MotherPhone,
                            r.GuardianEmails.Count > 0 ? string.Join(", ", r.GuardianEmails.Distinct()) : null,
                            unitName.GetValueOrDefault(r.UnitId, ""), r.RoleName, r.TeamName,
                            r.StartDate.ToString("dd/MM/yyyy"),
                            customByMember.GetValueOrDefault(r.Id, []));
                    }).ToList();
                return new ReportSection(label, members);
            })
            .Where(s => s.Rows.Count > 0)
            .ToList();

        // Title: explicit override → the single unit's name → a generic multi-unit label.
        var title = !string.IsNullOrWhiteSpace(titleOverride) ? titleOverride!
            : units.Count == 1 ? unitName[units[0].Id]
            : "Rapport de groupe";
        return Result<(string, List<ReportSection>)>.Success((title, sections));
    }
}
