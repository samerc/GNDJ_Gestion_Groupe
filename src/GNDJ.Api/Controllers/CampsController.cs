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

    /// <summary>Maîtrise members who can be named on a commission (groupLevelOnly = ACGs, for the chefs).
    /// CG or a camp chef de commission.</summary>
    [HttpGet("commission-candidates")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> CommissionCandidates([FromQuery] bool groupLevelOnly = false)
        => Res(await Mediator.Send(new GetCampCommissionCandidatesQuery(groupLevelOnly)));

    /// <summary>Chooses the camp's chefs (ACGs with full rights on it). CG only.</summary>
    [HttpPut("{id:guid}/chefs")]
    [HasPermission(Permissions.CampManage)]
    public async Task<IActionResult> SetChefs(Guid id, [FromBody] ChefsBody body)
        => Res(await Mediator.Send(new SetCampChefsCommand(id, body.MemberIds ?? [])));

    /// <summary>Replaces the Commission BP members (CG or a camp chef de commission — checked in the handler).</summary>
    [HttpPut("{id:guid}/commission")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetCommission(Guid id, [FromBody] CommissionBody body)
        => Res(await Mediator.Send(new SetCampCommissionCommand(id, body.MemberIds ?? [])));

    /// <summary>Sets one commission member's rights per area (a chef de commission or the CG).</summary>
    [HttpPut("{id:guid}/commission/{memberId:guid}/access")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetCommissionAccess(Guid id, Guid memberId, [FromBody] CommissionAccessBody body)
        => Res(await Mediator.Send(new SetCampCommissionAccessCommand(id, memberId, body.FamillesAccess, body.JeuxAccess, body.ParametresAccess)));

    [HttpPost("{id:guid}/draft")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Draft(Guid id, [FromBody] DraftBody? body)
        => Res(await Mediator.Send(new RunCampDraftCommand(id, body?.IncludeLeaders ?? false)));
    public record DraftBody(bool IncludeLeaders);

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

    /// <summary>Downloads the « Liste de présence » Excel: one sheet per unit in the caller's scope (or <paramref name="unitId"/>),
    /// Prénom / Nom / Présence / Cotisation; members marked "ne vient pas" show « Absent(e) ». Requires camp.grade.</summary>
    [HttpGet("{id:guid}/presence/xlsx")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> PresenceList(Guid id, [FromQuery] Guid? unitId)
    {
        var r = await Mediator.Send(new GenerateCampPresenceListQuery(id, unitId));
        return r.IsSuccess
            ? File(r.Value!, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Liste_de_presence.xlsx")
            : BadRequest(new { error = r.Error });
    }

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
    public async Task<IActionResult> CreateGame(Guid id, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new CreateCampGameCommand(id, body.Name, body.Description, body.MainLocation, body.BackupLocation, body.Number, body.BackupGameName, body.BackupGameDescription)));
    /// <summary>Auto-assigns the places (lieu A, lieu B or both) of the camp's games from the camp.places list, within each place's capacity. Jeux edit rights.</summary>
    [HttpPost("{id:guid}/games/auto-places")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> AutoAssignPlaces(Guid id, [FromBody] AutoPlacesBody body) => Res(await Mediator.Send(new AutoAssignCampPlacesCommand(id, body.Main, body.Backup, body.Replace)));
    public record AutoPlacesBody(bool Main, bool Backup, bool Replace);

    public record CreateGameBody(string Name, string? Description, string? MainLocation = null, string? BackupLocation = null, int? Number = null,
        string? BackupGameName = null, string? BackupGameDescription = null);

    /// <summary>Updates a game's name and description. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPut("games/{gameId:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UpdateGame(Guid gameId, [FromBody] CreateGameBody body) => Res(await Mediator.Send(new UpdateCampGameCommand(gameId, body.Name, body.Description, body.MainLocation, body.BackupLocation, body.Number, body.BackupGameName, body.BackupGameDescription)));

    /// <summary>Deletes a game. Rights checked per area in the handler (CampAccess).</summary>
    [HttpDelete("games/{gameId:guid}")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> DeleteGame(Guid gameId) => Res(await Mediator.Send(new DeleteCampGameCommand(gameId)));

    /// <summary>Sets the étapiste members assigned to a game. Rights checked per area in the handler (CampAccess).</summary>
    [HttpPost("games/{gameId:guid}/etapistes")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetEtapistes(Guid gameId, [FromBody] EtapistesBody body) => Res(await Mediator.Send(new SetGameEtapistesCommand(gameId, body.MemberIds)));
    public record EtapistesBody(List<Guid> MemberIds);

    /// <summary>Games of live camps where the caller is an étapiste (with description). Any signed-in member.</summary>
    /// <summary>Replaces a game's « liste de matériel » (the whole list; items: name + optional quantity).
    /// Commission with Jeux edit rights, or an étapiste of the game. Requires authentication.</summary>
    [HttpPut("games/{gameId:guid}/materials")]
    public async Task<IActionResult> SetMaterials(Guid gameId, [FromBody] MaterialsBody body)
        => Res(await Mediator.Send(new SetCampGameMaterialsCommand(gameId, body.Items ?? [])));
    public record MaterialsBody(List<CampGameMaterialDto>? Items);

    [HttpGet("my-games")]
    public async Task<IActionResult> MyGames() => Res(await Mediator.Send(new GetMyCampGamesQuery()));

    /// <summary>Printable PDF of one game (name, étapistes, description). For its étapistes or anyone who can view the camp's Jeux.</summary>
    [HttpGet("games/{gameId:guid}/pdf")]
    public async Task<IActionResult> GamePdf(Guid gameId)
    {
        var r = await Mediator.Send(new GetCampGamePdfQuery(gameId));
        return r.IsSuccess ? File(r.Value!.Data, "application/pdf", r.Value.FileName) : BadRequest(new { error = r.Error });
    }

    // ── Grand jeu: rotation, lookup, scoring ──
    /// <summary>The camp's rotation: slots (dates / hours), the 25 game numbers with their game, rain plan, scoring
    /// progress. Commission / CG (Jeux view).</summary>
    [HttpGet("{id:guid}/rotation")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Rotation(Guid id) => Res(await Mediator.Send(new GetCampRotationQuery(id)));

    /// <summary>Creates the slots + matches of the fixed grid for the camp's two days (refused once a score exists).</summary>
    [HttpPost("{id:guid}/rotation/generate")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> GenerateRotation(Guid id, [FromBody] GenerateRotationBody body)
        => Res(await Mediator.Send(new GenerateCampRotationCommand(id, body.FirstDay, body.SecondDay, body.FirstDaySlots)));
    public record GenerateRotationBody(DateOnly FirstDay, DateOnly SecondDay, int? FirstDaySlots = null);

    /// <summary>Updates the dates / hours of the slots.</summary>
    [HttpPut("{id:guid}/rotation/slots")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UpdateRotationSlots(Guid id, [FromBody] List<CampRotationSlotInput> slots)
        => Res(await Mediator.Send(new UpdateCampRotationSlotsCommand(id, slots)));

    /// <summary>Turns the rain plan (backup places) on or off.</summary>
    [HttpPut("{id:guid}/rotation/plan-b")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetPlanB(Guid id, [FromBody] PlanBBody body) => Res(await Mediator.Send(new SetCampBackupLocationsCommand(id, body.UseBackup)));
    public record PlanBBody(bool UseBackup);

    /// <summary>Finds a person (famille member, Père or Mère) or a famille number. CG, commission, CUs and étapistes
    /// (checked in the handler — some étapistes hold no camp permission).</summary>
    [HttpGet("{id:guid}/lookup")]
    public async Task<IActionResult> Lookup(Guid id, [FromQuery] string? q) => Res(await Mediator.Send(new SearchCampPeopleQuery(id, q ?? "")));

    /// <summary>A famille's full route (time, game, place, opponent) + its Père / Mère. Same access as the lookup.</summary>
    [HttpGet("{id:guid}/familles/{number:int}/schedule")]
    public async Task<IActionResult> FamilleSchedule(Guid id, int number) => Res(await Mediator.Send(new GetFamilleScheduleQuery(id, number)));

    /// <summary>Matches with their score (optionally one game / one slot). Commission, or an étapiste for their games.</summary>
    [HttpGet("{id:guid}/matches")]
    public async Task<IActionResult> Matches(Guid id, [FromQuery] int? game, [FromQuery] int? slot)
        => Res(await Mediator.Send(new GetCampMatchesQuery(id, game, slot)));

    /// <summary>Enters or corrects a match score (source online / paper). Commission (Jeux edit) or the game's étapistes.</summary>
    [HttpPut("matches/{matchId:guid}/score")]
    public async Task<IActionResult> SaveScore(Guid matchId, [FromBody] SaveCampMatchScoreCommand command)
        => Res(await Mediator.Send(command with { MatchId = matchId }));

    /// <summary>Removes a score entered by mistake.</summary>
    [HttpDelete("matches/{matchId:guid}/score")]
    public async Task<IActionResult> ClearScore(Guid matchId) => Res(await Mediator.Send(new ClearCampMatchScoreCommand(matchId)));

    /// <summary>Ranking of the familles (and superfamilles). Commission / CG (Jeux view).</summary>
    [HttpGet("{id:guid}/ranking")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> Ranking(Guid id) => Res(await Mediator.Send(new GetCampRankingQuery(id)));

    /// <summary>Famille passports (all, or ?famille=N) as a PDF.</summary>
    [HttpGet("{id:guid}/passports/pdf")]
    public async Task<IActionResult> PassportsPdf(Guid id, [FromQuery] int? famille)
        => PdfFile(await Mediator.Send(new GenerateCampRotationPdfQuery(id, "passports", famille)));

    /// <summary>Paper score sheets (all games, or ?game=N) as a PDF. An étapiste may print their own game's sheet.</summary>
    [HttpGet("{id:guid}/score-sheets/pdf")]
    public async Task<IActionResult> ScoreSheetsPdf(Guid id, [FromQuery] int? game)
        => PdfFile(await Mediator.Send(new GenerateCampRotationPdfQuery(id, "scoresheets", game)));

    private IActionResult PdfFile(GNDJ.Application.Common.Models.Result<CampPdf> r)
        => r.IsSuccess ? File(r.Value!.Data, "application/pdf", r.Value.FileName) : BadRequest(new { error = r.Error });

    // ── Familles info, superfamilles, sub-commissions ──
    /// <summary>A famille's name, description and superfamille (Familles edit).</summary>
    [HttpPut("familles/{familleId:guid}/info")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> UpdateFamilleInfo(Guid familleId, [FromBody] FamilleInfoBody body)
        => Res(await Mediator.Send(new UpdateFamilleInfoCommand(familleId, body.Name, body.Description, body.SuperFamilleId)));
    public record FamilleInfoBody(string? Name, string? Description, Guid? SuperFamilleId);

    /// <summary>The camp's superfamilles (optional groups of familles).</summary>
    [HttpGet("{id:guid}/superfamilles")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SuperFamilles(Guid id) => Res(await Mediator.Send(new GetCampSuperFamillesQuery(id)));

    /// <summary>Replaces the list of superfamilles.</summary>
    [HttpPut("{id:guid}/superfamilles")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SaveSuperFamilles(Guid id, [FromBody] List<CampSuperFamilleInput> items)
        => Res(await Mediator.Send(new SaveCampSuperFamillesCommand(id, items)));

    /// <summary>Splits the familles evenly across the superfamilles, in number order.</summary>
    [HttpPost("{id:guid}/superfamilles/auto")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> AutoSuperFamilles(Guid id) => Res(await Mediator.Send(new AutoAssignSuperFamillesCommand(id)));

    /// <summary>The camp's sub-commissions (Trésor, Jeu, Code…).</summary>
    [HttpGet("{id:guid}/sub-commissions")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SubCommissions(Guid id) => Res(await Mediator.Send(new GetCampSubCommissionsQuery(id)));

    /// <summary>Replaces the list of sub-commissions (CG or a chef de commission).</summary>
    [HttpPut("{id:guid}/sub-commissions")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetSubCommissions(Guid id, [FromBody] List<string> names)
        => Res(await Mediator.Send(new SetCampSubCommissionsCommand(id, names)));

    /// <summary>Puts a commission member in one or more sub-commissions (CG or a chef de commission).</summary>
    [HttpPut("{id:guid}/commission/{memberId:guid}/sub-commissions")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> SetMemberSubCommissions(Guid id, Guid memberId, [FromBody] List<string> names)
        => Res(await Mediator.Send(new SetCommissionMemberSubCommissionsCommand(id, memberId, names)));

    /// <summary>Lists members eligible to be game étapistes. Rights checked per area in the handler (CampAccess).</summary>
    [HttpGet("{id:guid}/etapiste-candidates")]
    [HasPermission(Permissions.CampGrade)]
    public async Task<IActionResult> EtapisteCandidates(Guid id) => Res(await Mediator.Send(new GetEtapisteCandidatesQuery(id)));
}

public record CommissionBody(List<Guid>? MemberIds);
public record ChefsBody(List<Guid>? MemberIds);
public record CommissionAccessBody(string FamillesAccess, string JeuxAccess, string ParametresAccess);
