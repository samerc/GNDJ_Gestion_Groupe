using GNDJ.Api.Authorization;
using GNDJ.Application.Camps;
using GNDJ.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

// Camp BP: split the group into balanced "familles" led by a Père/Mère. Route api/v1/camps.
// Two permission tiers: camp.grade (CU — attendance + grading of their own unit, unit-scoped in the handler) and
// camp.manage (CG — create/draft/familles/games/leaders). PDF report endpoints return application/pdf file streams.
[Authorize]
public class CampsController : BaseApiController
{
    private IActionResult Res<T>(GNDJ.Application.Common.Models.Result<T> r)
        => r.IsSuccess ? Ok(r.Value) : BadRequest(new { error = r.Error });

    // ── Read (CU + CG) ──
    [HttpGet]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> List() => Res(await Mediator.Send(new GetCampsQuery()));

    [HttpGet("{id:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Get(Guid id) => Res(await Mediator.Send(new GetCampQuery(id)));

    // ── CU: attendance + grading for their unit ──
    [HttpGet("{id:guid}/attendance")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Attendance(Guid id, [FromQuery] Guid? unitId)
        => Res(await Mediator.Send(new GetCampAttendanceQuery(id, unitId)));

    [HttpPost("{id:guid}/attendance")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetAttendance(Guid id, [FromBody] SetCampAttendanceCommand command)
        => Res(await Mediator.Send(command with { CampId = id }));

    [HttpGet("{id:guid}/grading")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Grading(Guid id, [FromQuery] Guid? unitId)
        => Res(await Mediator.Send(new GetCampGradingQuery(id, unitId)));

    [HttpPost("{id:guid}/grading")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SaveGrades(Guid id, [FromBody] SaveCampGradesCommand command)
        => Res(await Mediator.Send(command with { CampId = id }));

    // ── CG: camp management ──
    [HttpPost]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Create([FromBody] CreateCampCommand command) => Res(await Mediator.Send(command));

    [HttpPut("{id:guid}")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCampCommand command) => Res(await Mediator.Send(command with { Id = id }));

    [HttpPost("{id:guid}/archive")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Archive(Guid id, [FromBody] ArchiveBody body) => Res(await Mediator.Send(new ArchiveCampCommand(id, body.Archive)));
    public record ArchiveBody(bool Archive);

    [HttpDelete("{id:guid}")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Delete(Guid id) => Res(await Mediator.Send(new DeleteCampCommand(id)));

    // ── CG: draft + familles ──
    // Runs the balanced randomized draft (deals graded participants across familles by branche×genre stratum).
    [HttpPost("{id:guid}/draft")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Draft(Guid id) => Res(await Mediator.Send(new RunCampDraftCommand(id)));

    [HttpGet("{id:guid}/familles")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Familles(Guid id) => Res(await Mediator.Send(new GetCampFamillesQuery(id)));

    // ── PDF reports (CU + CG) ──
    private IActionResult Pdf(GNDJ.Application.Common.Models.Result<byte[]> r, string filename)
        => r.IsSuccess ? File(r.Value!, "application/pdf", filename) : BadRequest(new { error = r.Error });

    [HttpGet("{id:guid}/familles/{number:int}/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> FamillePdf(Guid id, int number)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "famille", number)), $"Famille_{number}.pdf");

    [HttpGet("{id:guid}/familles/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> AllFamillesPdf(Guid id)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "all", null)), "Familles.pdf");

    [HttpGet("{id:guid}/unit-list/pdf")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UnitListPdf(Guid id)
        => Pdf(await Mediator.Send(new GenerateCampReportQuery(id, "units", null)), "Liste_par_unite.pdf");

    [HttpPost("participants/{participantId:guid}/move")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Move(Guid participantId, [FromBody] MoveBody body) => Res(await Mediator.Send(new MoveCampParticipantCommand(participantId, body.FamilleId)));
    public record MoveBody(Guid FamilleId);

    [HttpPost("swap")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Swap([FromBody] SwapCampParticipantsCommand command) => Res(await Mediator.Send(command));

    // Pins a famille's Père (must be male) / Mère (must be female) — handler rejects a mismatched gender.
    [HttpPost("familles/{familleId:guid}/leaders")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> SetLeaders(Guid familleId, [FromBody] LeadersBody body)
        => Res(await Mediator.Send(new SetFamillePereMereCommand(familleId, body.PereMemberId, body.MereMemberId)));
    public record LeadersBody(Guid? PereMemberId, Guid? MereMemberId);

    [HttpGet("{id:guid}/leader-candidates")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> LeaderCandidates(Guid id) => Res(await Mediator.Send(new GetPereMereCandidatesQuery(id)));

    // ── CG: games + étapistes ──
    [HttpGet("{id:guid}/games")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> Games(Guid id) => Res(await Mediator.Send(new GetCampGamesQuery(id)));

    [HttpPost("{id:guid}/games")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> CreateGame(Guid id, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new CreateCampGameCommand(id, body.Name, body.Description)));
    public record CreateGameBody(string Name, string? Description);

    [HttpPut("games/{gameId:guid}")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> UpdateGame(Guid gameId, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new UpdateCampGameCommand(gameId, body.Name, body.Description)));

    [HttpDelete("games/{gameId:guid}")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> DeleteGame(Guid gameId) => Res(await Mediator.Send(new DeleteCampGameCommand(gameId)));

    [HttpPost("games/{gameId:guid}/etapistes")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> SetEtapistes(Guid gameId, [FromBody] EtapistesBody body) => Res(await Mediator.Send(new SetGameEtapistesCommand(gameId, body.MemberIds)));
    public record EtapistesBody(List<Guid> MemberIds);

    [HttpGet("{id:guid}/etapiste-candidates")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> EtapisteCandidates(Guid id) => Res(await Mediator.Send(new GetEtapisteCandidatesQuery(id)));
}
