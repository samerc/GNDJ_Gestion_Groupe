using GNDJ.Api.Authorization;
using GNDJ.Application.Camps;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Camp BP: split the group into balanced "familles" led by a Père/Mère. Base route api/v1/camps. Requires JWT or
/// API-key auth. Two permission tiers: camp.grade (CU — attendance and grading of their own unit, unit-scoped in
/// the handler) and camp.manage (CG — create/draft/familles/games/leaders). PDF report endpoints return
/// application/pdf file streams.
/// </summary>
[Authorize]
public class CampsController : BaseApiController
{
    private IActionResult Res<T>(GNDJ.Application.Common.Models.Result<T> r)
        => r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });

    // ── Read (CU + CG) ──
    /// <summary>Lists camp editions. Requires camp.grade.</summary>
    [HttpGet]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> List() => Res(await Mediator.Send(new GetCampsQuery()));

    /// <summary>Gets one camp with its configuration. Requires camp.grade.</summary>
    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Get(Guid id) => Res(await Mediator.Send(new GetCampQuery(id)));

    // ── CU: attendance + grading for their unit ──
    /// <summary>Gets camp attendance for the caller's unit (or a given unit). Requires camp.grade.</summary>
    /// <param name="id">The camp id.</param>
    /// <param name="unitId">Restrict to this unit; defaults to the caller's unit scope.</param>
    [HttpGet("{id:guid}/attendance")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Attendance(Guid id, [FromQuery] Guid? unitId)
        => Res(await Mediator.Send(new GetCampAttendanceQuery(id, unitId)));

    /// <summary>Saves camp attendance for the caller's unit. Requires camp.grade.</summary>
    [HttpPost("{id:guid}/attendance")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetAttendance(Guid id, [FromBody] SetCampAttendanceCommand command)
        => Res(await Mediator.Send(command with { CampId = id }));

    /// <summary>Gets the grading table (Force, année, Père/Mère candidate, note) for the caller's unit. Requires camp.grade.</summary>
    /// <param name="id">The camp id.</param>
    /// <param name="unitId">Restrict to this unit; defaults to the caller's unit scope.</param>
    [HttpGet("{id:guid}/grading")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Grading(Guid id, [FromQuery] Guid? unitId)
        => Res(await Mediator.Send(new GetCampGradingQuery(id, unitId)));

    /// <summary>Saves grades and attendance for the caller's unit members. Requires camp.grade.</summary>
    [HttpPost("{id:guid}/grading")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SaveGrades(Guid id, [FromBody] SaveCampGradesCommand command)
        => Res(await Mediator.Send(command with { CampId = id }));

    // ── CG: camp management ──
    /// <summary>Creates a camp edition. CG / ACG (camp.manage).</summary>
    [HttpPost]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Create([FromBody] CreateCampCommand command) => Res(await Mediator.Send(command));

    /// <summary>Updates a camp edition (name, formula coefficients, familles count). Rights checked per area in the handler (CampAccess).</summary>
    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCampCommand command) => Res(await Mediator.Send(command with { Id = id }));

    /// <summary>Archives or unarchives a camp. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("{id:guid}/archive")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Archive(Guid id, [FromBody] ArchiveBody body) => Res(await Mediator.Send(new ArchiveCampCommand(id, body.Archive)));
    public record ArchiveBody(bool Archive);

    /// <summary>Deletes a camp edition. Rights checked per area in the handler (CampAccess).</summary>
    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Delete(Guid id) => Res(await Mediator.Send(new DeleteCampCommand(id)));

    // ── CG: draft + familles ──
    /// <summary>
    /// Runs the balanced randomized draft, dealing graded participants across familles by branche and gender
    /// stratum. Rights checked per area in the handler (CampAccess).
    /// </summary>
    /// <summary>Commission BP of a camp, with each member's rights. Camp admins + commission members.</summary>
    [HttpGet("{id:guid}/commission")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Commission(Guid id) => Res(await Mediator.Send(new GetCampCommissionQuery(id)));

    /// <summary>Maîtrise members who can be named on a commission (groupLevelOnly = ACGs, for the responsables).
    /// CG or a camp responsable.</summary>
    [HttpGet("commission-candidates")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> CommissionCandidates([FromQuery] bool groupLevelOnly = false)
        => Res(await Mediator.Send(new GetCampCommissionCandidatesQuery(groupLevelOnly)));

    /// <summary>Chooses the camp's responsables (ACGs with full rights on it). CG only.</summary>
    [HttpPut("{id:guid}/responsables")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> SetResponsables(Guid id, [FromBody] ResponsablesBody body)
        => Res(await Mediator.Send(new SetCampResponsablesCommand(id, body.MemberIds ?? [])));

    /// <summary>Replaces the Commission BP and names its chef (CG or a camp responsable — checked in the handler).</summary>
    [HttpPut("{id:guid}/commission")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetCommission(Guid id, [FromBody] CommissionBody body)
        => Res(await Mediator.Send(new SetCampCommissionCommand(id, body.MemberIds ?? [], body.ChefMemberId)));

    /// <summary>Sets one commission member's rights per area (chef de commission or CG / ACG).</summary>
    [HttpPut("{id:guid}/commission/{memberId:guid}/access")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetCommissionAccess(Guid id, Guid memberId, [FromBody] CommissionAccessBody body)
        => Res(await Mediator.Send(new SetCampCommissionAccessCommand(id, memberId, body.FamillesAccess, body.JeuxAccess, body.ParametresAccess)));

    [HttpPost("{id:guid}/draft")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Draft(Guid id) => Res(await Mediator.Send(new RunCampDraftCommand(id)));

    /// <summary>Lists the camp's familles with their members and balance metrics. Rights checked per area in the handler (CampAccess).</summary>
    [HttpGet("{id:guid}/familles")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Familles(Guid id) => Res(await Mediator.Send(new GetCampFamillesQuery(id)));

    // ── PDF reports (CU + CG) ──
    private IActionResult Pdf(GNDJ.Application.Common.Models.Result<byte[]> r, string filename)
        => r.IsSuccess ? File(r.Value!, "application/pdf", filename) : BadRequest(new { error = r.Error });

    /// <summary>Downloads a single famille's PDF sheet. Requires camp.grade.</summary>
    /// <param name="id">The camp id.</param>
    /// <param name="number">The famille number.</param>
    [HttpGet("{id:guid}/familles/{number:int}/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> FamillePdf(Guid id, int number)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "famille", number)), $"Famille_{number}.pdf");

    /// <summary>Downloads a PDF with every famille (one per page). Requires camp.grade.</summary>
    [HttpGet("{id:guid}/familles/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> AllFamillesPdf(Guid id)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "all", null)), "Familles.pdf");

    /// <summary>Downloads a PDF listing members grouped by unit with each member's famille number. Requires camp.grade.</summary>
    [HttpGet("{id:guid}/unit-list/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UnitListPdf(Guid id)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "units", null)), "Liste_par_unite.pdf");

    /// <summary>Moves a participant to another famille. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("participants/{participantId:guid}/move")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Move(Guid participantId, [FromBody] MoveBody body) => Res(await Mediator.Send(new MoveCampParticipantCommand(participantId, body.FamilleId)));
    public record MoveBody(Guid FamilleId);

    /// <summary>Swaps two participants between their familles. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("swap")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Swap([FromBody] SwapCampParticipantsCommand command) => Res(await Mediator.Send(command));

    /// <summary>
    /// Pins a famille's Père (must be male) and Mère (must be female); the handler rejects a mismatched gender.
    /// Rights checked per area in the handler (CampAccess).
    /// </summary>
    [HttpPost("familles/{familleId:guid}/leaders")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetLeaders(Guid familleId, [FromBody] LeadersBody body)
        => Res(await Mediator.Send(new SetFamillePereMereCommand(familleId, body.PereMemberId, body.MereMemberId)));
    public record LeadersBody(Guid? PereMemberId, Guid? MereMemberId);

    /// <summary>Lists eligible Père/Mère candidates for the camp. Rights checked per area in the handler (CampAccess).</summary>
    [HttpGet("{id:guid}/leader-candidates")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> LeaderCandidates(Guid id) => Res(await Mediator.Send(new GetPereMereCandidatesQuery(id)));

    // ── CG: games + étapistes ──
    /// <summary>Lists the camp's games and their étapistes. Rights checked per area in the handler (CampAccess).</summary>
    [HttpGet("{id:guid}/games")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Games(Guid id) => Res(await Mediator.Send(new GetCampGamesQuery(id)));

    /// <summary>Creates a game for the camp. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("{id:guid}/games")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> CreateGame(Guid id, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new CreateCampGameCommand(id, body.Name, body.Description)));
    public record CreateGameBody(string Name, string? Description);

    /// <summary>Updates a game's name and description. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPut("games/{gameId:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UpdateGame(Guid gameId, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new UpdateCampGameCommand(gameId, body.Name, body.Description)));

    /// <summary>Deletes a game. Rights checked per area in the handler (CampAccess).</summary>
    [HttpDelete("games/{gameId:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> DeleteGame(Guid gameId) => Res(await Mediator.Send(new DeleteCampGameCommand(gameId)));

    /// <summary>Sets the étapiste members assigned to a game. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("games/{gameId:guid}/etapistes")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetEtapistes(Guid gameId, [FromBody] EtapistesBody body) => Res(await Mediator.Send(new SetGameEtapistesCommand(gameId, body.MemberIds)));
    public record EtapistesBody(List<Guid> MemberIds);

    /// <summary>Lists members eligible to be game étapistes. Rights checked per area in the handler (CampAccess).</summary>
    [HttpGet("{id:guid}/etapiste-candidates")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> EtapisteCandidates(Guid id) => Res(await Mediator.Send(new GetEtapisteCandidatesQuery(id)));
}

public record CommissionBody(List<Guid>? MemberIds, Guid? ChefMemberId);
public record ResponsablesBody(List<Guid>? MemberIds);
public record CommissionAccessBody(string FamillesAccess, string JeuxAccess, string ParametresAccess);
