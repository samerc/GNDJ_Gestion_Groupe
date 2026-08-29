using GNDJ.Application.Common;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Members.DTOs;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Members.Queries;

// Paginated member list, unit-scoped per caller. Two modes: active members (default) or the
// Alumni view (former members, identity-only). See the handler for the scoping rules.
public record GetMembersQuery(
    string? Search, Guid? UnitId, Guid? TeamId, bool? NoUnit, bool? Alumni,
    string? SortBy, string? SortDir,
    int Page = 1, int PageSize = 50, bool? Maitrise = null
) : IRequest<PaginatedList<MemberListDto>>;

public class GetMembersQueryHandler : IRequestHandler<GetMembersQuery, PaginatedList<MemberListDto>>
{
    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMembersQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<PaginatedList<MemberListDto>> Handle(GetMembersQuery request, CancellationToken cancellationToken)
    {
        var query = _context.Members.AsQueryable();
        var authorizedUnitIds = _currentUser.AuthorizedUnitIds;
        var isAlumni = request.Alumni == true;
        // Group-level managers (super-admin or a Chef de Groupe — holds maitrise.manage) see the whole
        // group, so they get the unscoped alumni view (all former members), not just their units.
        var isGroupLevel = _currentUser.IsSuperAdmin
            || _currentUser.Permissions.Contains(Domain.Enums.Permissions.MaitriseManage);

        // Only member managers (super-admin / Chef de Groupe / Chef d'unité — i.e. members.edit) may list
        // members. A read-only youth holds members.view + their own unit in AuthorizedUnitIds, so without
        // this gate they could enumerate co-members' identities and contacts. Non-managers → empty list.
        if (!_currentUser.IsSuperAdmin && !_currentUser.Permissions.Contains(Domain.Enums.Permissions.MembersEdit))
            query = query.Where(_ => false);

        if (isAlumni)
        {
            // Alumni view: members who HAD an assignment in the unit that has ended and who
            // are NOT currently active in that unit (i.e. they moved away or left).
            // Personal data (contact) is withheld below — only identity is shown.
            if (request.UnitId.HasValue)
            {
                var uid = request.UnitId.Value;
                if (!_currentUser.IsSuperAdmin && !authorizedUnitIds.Contains(uid))
                    query = query.Where(_ => false); // not authorized for this unit
                else
                    query = query.Where(m =>
                        m.Assignments.Any(a => a.UnitId == uid && a.EndDate != null) &&
                        !m.Assignments.Any(a => a.UnitId == uid && a.EndDate == null));
            }
            else if (isGroupLevel)
            {
                // Super-admin / Chef de Groupe, no unit filter: ALL former members — had an assignment
                // that ended and have no active assignment anywhere (left the group / not currently placed).
                query = query.Where(m =>
                    m.Assignments.Any(a => a.EndDate != null) &&
                    !m.Assignments.Any(a => a.EndDate == null));
            }
            else
            {
                query = query.Where(m =>
                    m.Assignments.Any(a => a.EndDate != null && authorizedUnitIds.Contains(a.UnitId)) &&
                    !m.Assignments.Any(a => a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)));
            }
        }
        else
        {
            // Active-member scope — only members with an ACTIVE assignment in an authorized unit.
            // (Without the EndDate == null filter, a CU would also see members who merely passed
            // through their unit historically but have since moved elsewhere.)
            if (!_currentUser.IsSuperAdmin)
                query = query.Where(m => m.Assignments.Any(a => a.EndDate == null && authorizedUnitIds.Contains(a.UnitId)));

            if (request.NoUnit == true)
                query = query.Where(m => !m.Assignments.Any(a => a.EndDate == null));
            else if (request.UnitId.HasValue)
                query = query.Where(m => m.Assignments.Any(a => a.UnitId == request.UnitId.Value && a.EndDate == null));
            else
                // No unit filter: still restrict to members with ANY active assignment so the default
                // (super-admin) list shows current members only — alumni are reached via the Alumni view.
                query = query.Where(m => m.Assignments.Any(a => a.EndDate == null));
        }

        // "Maîtrises" filter: only members holding a leadership (is_maitrise) role — matching the current view
        // (active leaders, or former leaders in the Alumni view). Scoped like the branches above: super-admin and
        // Chef de Groupe (all units) see every maîtrise; a CU sees the maîtrise of their own units.
        if (request.Maitrise == true)
            query = query.Where(m => m.Assignments.Any(a =>
                a.FunctionalRole.IsMaitrise
                && (isAlumni ? a.EndDate != null : a.EndDate == null)
                && (_currentUser.IsSuperAdmin || authorizedUnitIds.Contains(a.UnitId))));

        if (request.TeamId.HasValue)
            query = query.Where(m => m.Assignments.Any(a => a.TeamId == request.TeamId.Value && a.EndDate == null));

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            // Accent-insensitive: unaccent() strips diacritics so "rhea" matches "Rhéa". Both sides are
            // unaccent()'d inside the expression tree so EF translates them to SQL (never run in-process).
            var search = request.Search.ToLower();
            query = query.Where(m =>
                Common.DbFns.Unaccent(m.FirstName.ToLower()).Contains(Common.DbFns.Unaccent(search)) ||
                Common.DbFns.Unaccent(m.LastName.ToLower()).Contains(Common.DbFns.Unaccent(search)) ||
                (m.CardNumber != null && m.CardNumber.ToLower().Contains(search)));
        }

        // Sort
        var desc = string.Equals(request.SortDir, "desc", StringComparison.OrdinalIgnoreCase);
        IOrderedQueryable<Domain.Entities.Member> ordered = request.SortBy?.ToLower() switch
        {
            "firstname" => desc ? query.OrderByDescending(m => m.FirstName) : query.OrderBy(m => m.FirstName),
            "dateofbirth" => desc ? query.OrderByDescending(m => m.DateOfBirth) : query.OrderBy(m => m.DateOfBirth),
            "cardnumber" => desc ? query.OrderByDescending(m => m.CardNumber) : query.OrderBy(m => m.CardNumber),
            _ => desc ? query.OrderByDescending(m => m.LastName) : query.OrderBy(m => m.LastName),
        };

        var scopeUnitId = request.UnitId;

        // Alumni results expose identity only — contact details are withheld.
        var projected = ordered.ThenBy(m => m.FirstName)
            .Select(m => new MemberListDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender, m.CardNumber, m.ExternalCardNumber,
                isAlumni ? null : m.Emails.Where(e => e.IsPrimary && !e.IsDeleted).Select(e => e.Address).FirstOrDefault(),
                isAlumni ? null : m.Phones.Where(p => p.IsPrimary && !p.IsDeleted).Select(p => p.CountryCode + " " + p.Number).FirstOrDefault(),
                m.PhotoPath,
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Unit.Code).FirstOrDefault(),
                m.Assignments.Where(a => a.EndDate == null).Select(a => a.Team != null ? a.Team.Name : null).FirstOrDefault(),
                // Functional role of the active assignment (scoped to the queried unit when set).
                m.Assignments.Where(a => a.EndDate == null && (scopeUnitId == null || a.UnitId == scopeUnitId))
                    .Select(a => a.FunctionalRole.Name).FirstOrDefault(),
                m.Assignments.Where(a => a.EndDate == null && (scopeUnitId == null || a.UnitId == scopeUnitId))
                    .Select(a => (int?)a.FunctionalRole.Rank).FirstOrDefault(),
                // Father's FIRST name only (relationship stored as "Pere" or "Père"). The family name is
                // redundant next to the member's own last name in the roster, so we drop it.
                m.GuardianLinks.Where(l => !l.IsDeleted && (l.RelationshipType == "Pere" || l.RelationshipType == "Père"))
                    .Select(l => l.Guardian.FirstName).FirstOrDefault()
            ));

        var result = await PaginatedList<MemberListDto>.CreateAsync(projected, request.Page, request.PageSize, cancellationToken);

        // Dossier-compliance flags for active members (skipped for the alumni view). Computed in batch for
        // just this page — active doc types + approved-doc counts + current-year cotisation status — so it's
        // 3 extra set-based queries, never N+1. "Complete docs" = an Approved document for EVERY active
        // document type; "cotisation OK" = a current-year cotisation that's paid (has a payment) or exempt.
        if (!isAlumni && result.Items.Count > 0)
        {
            var ids = result.Items.Select(i => i.Id).ToList();

            var activeDocTypeIds = await _context.DocumentTypes
                .Where(d => d.IsActive && !d.IsDeleted).Select(d => d.Id).ToListAsync(cancellationToken);
            var requiredCount = activeDocTypeIds.Count;

            var approvedTypeCount = requiredCount == 0
                ? new Dictionary<Guid, int>()
                : await _context.MemberDocuments
                    .Where(d => ids.Contains(d.MemberId) && !d.IsDeleted
                        && d.Status == Domain.Enums.DocumentStatus.Approved && activeDocTypeIds.Contains(d.DocumentTypeId))
                    .GroupBy(d => d.MemberId)
                    .Select(g => new { Id = g.Key, N = g.Select(x => x.DocumentTypeId).Distinct().Count() })
                    .ToDictionaryAsync(x => x.Id, x => x.N, cancellationToken);

            // Active scout year follows the passage year (the year the CG opens) — single source of truth.
            var scoutYear = await _context.Settings.Where(s => s.Key == "passage.scout_year")
                .Select(s => s.Value).FirstOrDefaultAsync(cancellationToken);
            var cotisTracked = !string.IsNullOrWhiteSpace(scoutYear);
            var cotisOk = cotisTracked
                ? (await _context.MemberCotisations
                    .Where(c => ids.Contains(c.MemberId) && !c.IsDeleted && c.ScoutYear == scoutYear
                        && (c.WillNotPay || c.Payments.Any(p => !p.IsDeleted)))
                    .Select(c => c.MemberId).Distinct().ToListAsync(cancellationToken)).ToHashSet()
                : new HashSet<Guid>();

            var withCompliance = result.Items.Select(i => i with
            {
                DocsComplete = requiredCount == 0 || approvedTypeCount.GetValueOrDefault(i.Id) >= requiredCount,
                CotisationOk = cotisTracked ? cotisOk.Contains(i.Id) : (bool?)null,
            }).ToList();

            return new PaginatedList<MemberListDto>(withCompliance, result.TotalCount, result.Page, result.PageSize);
        }

        return result;
    }
}

// Units that actually HAVE members in the current view (Actifs vs Anciens), for the members-page unit filter
// dropdown — so an empty unit (no active members) is hidden under "Actifs" but appears under "Anciens" if it
// still has former members. Scoped like the member list: super-admin / Chef de Groupe see all units; a CU sees
// their own; a non-manager gets nothing.
public record MemberUnitOptionDto(Guid Id, string Name, string Code, int Count);
public record GetMemberUnitOptionsQuery(bool Alumni) : IRequest<IReadOnlyList<MemberUnitOptionDto>>;

public class GetMemberUnitOptionsQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    : IRequestHandler<GetMemberUnitOptionsQuery, IReadOnlyList<MemberUnitOptionDto>>
{
    public async ValueTask<IReadOnlyList<MemberUnitOptionDto>> Handle(GetMemberUnitOptionsQuery request, CancellationToken ct)
    {
        // Same manager gate as the list: only members.edit holders (CU/CG/super-admin) may enumerate units;
        // a read-only youth gets an empty dropdown.
        if (!currentUser.IsSuperAdmin && !currentUser.Permissions.Contains(Domain.Enums.Permissions.MembersEdit))
            return [];

        var authorized = currentUser.AuthorizedUnitIds;
        var assignments = context.MemberAssignments
            .Where(a => !a.IsDeleted && !a.Member.IsDeleted && !a.Unit.IsDeleted);

        if (request.Alumni)
            // Alumni-of-a-unit: an ended assignment there AND no active assignment in that same unit.
            assignments = assignments.Where(a => a.EndDate != null
                && !a.Member.Assignments.Any(b => b.UnitId == a.UnitId && b.EndDate == null && !b.IsDeleted));
        else
            assignments = assignments.Where(a => a.EndDate == null); // active members of the unit

        if (!currentUser.IsSuperAdmin) // CG's authorized set is all units; a CU is limited to their own
            assignments = assignments.Where(a => authorized.Contains(a.UnitId));

        // EF can't translate a GroupBy(...).Count() over a Distinct() subquery, so do the DISTINCT in SQL
        // (translatable) and the group+count in memory — a member appears once per unit. The set is the distinct
        // (member, unit) pairs in scope (bounded, admin endpoint), so materializing it is fine.
        var pairs = await assignments
            .Select(a => new { a.MemberId, a.UnitId, a.Unit.Name, a.Unit.Code })
            .Distinct()
            .ToListAsync(ct);

        return pairs
            .GroupBy(a => new { a.UnitId, a.Name, a.Code })
            .Select(g => new MemberUnitOptionDto(g.Key.UnitId, g.Key.Name, g.Key.Code, g.Count()))
            .OrderBy(o => o.Name)
            .ToList();
    }
}

// Full member detail. Access (IDOR guard): super-admin, the member themselves, or a leader with an
// ACTIVE assignment of the member in an authorized unit; otherwise returns null (treated as 404).
public record GetMemberByIdQuery(Guid Id) : IRequest<MemberDetailDto?>;

public class GetMemberByIdQueryHandler : IRequestHandler<GetMemberByIdQuery, MemberDetailDto?>
{
    // Youth branches (school-age) — a non-maîtrise member here fills Classe/Section, not a profession.
    private static readonly string[] YouthBranchCodes = ["MEU", "RON", "COM", "TRO"];

    private readonly IApplicationDbContext _context;
    private readonly ICurrentUserService _currentUser;

    public GetMemberByIdQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser)
    {
        _context = context;
        _currentUser = currentUser;
    }

    public async ValueTask<MemberDetailDto?> Handle(GetMemberByIdQuery request, CancellationToken cancellationToken)
    {
        // Shared member-data policy: super-admin / own record / whole-group manager (CG/ACG — any member,
        // incl. orphans) / a members.edit leader of the member's active unit. Routed through MemberAccess so it
        // stays consistent with the document/cotisation/guardian handlers (this used to be an inline copy that
        // drifted — it blocked a CG from opening a member with no active assignment).
        if (!await MemberAccess.CanAccessMemberAsync(_context, _currentUser, request.Id, cancellationToken))
            return null;

        // Absence-count window (Oct-1 boundary) — uses the scout year that CONTAINS TODAY (the calendar year),
        // NOT the configured passage year (which is set ahead for the upcoming year). During the pre-season
        // (Aug–Sep), the running year and the configured year differ, so this keeps réunions logged now visible
        // and matches the roster/CG-list badges (also calendar-based).
        var (syStart, syEnd) = ScoutYearHelper.Window(null);

        return await _context.Members
            .Where(m => m.Id == request.Id)
            .Select(m => new MemberDetailDto(
                m.Id, m.FirstName, m.LastName, m.DateOfBirth, m.Gender,
                m.CardNumber, m.ExternalCardNumber, m.BloodType, m.Nationality, m.School,
                m.Classe, m.ProfessionDomain, m.Profession, m.Section,
                m.MedicalNotes, m.Allergies, m.Notes, m.PhotoPath,
                m.Phones.Where(p => !p.IsDeleted).OrderByDescending(p => p.IsPrimary)
                    .Select(p => new MemberPhoneDto(p.Id, p.CountryCode, p.Number, p.Type, p.IsPrimary, p.IsEmergency)).ToList(),
                m.Emails.Where(e => !e.IsDeleted).OrderByDescending(e => e.IsPrimary)
                    .Select(e => new MemberEmailDto(e.Id, e.Address, e.Type, e.IsPrimary, e.IsEmergency)).ToList(),
                m.Addresses.Where(a => !a.IsDeleted).OrderByDescending(a => a.IsPrimary)
                    .Select(a => new MemberAddressDto(a.Id, a.Type, a.Country, a.City, a.Details, a.IsPrimary)).ToList(),
                m.CreatedAt, m.UpdatedAt,
                // Login of the linked user account (correlated subquery); null if the member has no account.
                _context.Users.Where(u => u.MemberId == m.Id && !u.IsDeleted).Select(u => u.Email).FirstOrDefault(),
                m.PrimaryContactEmail,
                // Distinct guardian emails linked to this member (contact-email options for the picker).
                m.GuardianLinks.Where(gl => !gl.IsDeleted)
                    .SelectMany(gl => gl.Guardian.Emails.Where(e => !e.IsDeleted).Select(e => e.Address))
                    .Distinct().ToList(),
                // Tab badge counts (correlated subqueries — no extra round-trips; the panel no longer fetches
                // guardians/assignments/documents/cotisations/progressions just to show the numbers).
                new MemberTabCountsDto(
                    m.GuardianLinks.Count(gl => !gl.IsDeleted),
                    m.Assignments.Count(a => !a.IsDeleted),
                    m.Documents.Count(d => !d.IsDeleted),
                    m.Cotisations.Count(c => !c.IsDeleted),
                    m.Progressions.Count(p => !p.IsDeleted)),
                // Absences on APPROVED réunions within the current scout year (Réunions feature).
                _context.MeetingAbsences.Count(a => !a.IsDeleted && a.MemberId == m.Id
                    && a.Meeting.Status == "Approved" && a.Meeting.Date >= syStart && a.Meeting.Date < syEnd),
                // Access delegation flags (drive the panel badge; managed via the delegation dialog).
                m.DelegatedPermissionsJson != null && m.DelegatedPermissionsJson != "",
                m.DelegatedGroupAccess,
                // ShowProfession: hide the "En activité / Profession" option for a youth (non-maîtrise) whose active
                // branch is Meute/Ronde/Compagnie/Troupe (school-age → Classe/Section only). Shown for maîtrise/chefs,
                // older branches (Clan/Noyau/JEM/Feu…), or a member with no active assignment.
                !m.Assignments.Any(a => a.EndDate == null)
                    || m.Assignments.Any(a => a.EndDate == null
                        && (a.FunctionalRole.IsMaitrise || !YouthBranchCodes.Contains(a.Unit.UnitType.Code)))
            ))
            .FirstOrDefaultAsync(cancellationToken);
    }
}
