using GNDJ.Application.CustomFields;
using GNDJ.Application.Guardians;
using GNDJ.Application.Members.Commands.MyAppInstalled;
using GNDJ.Application.Members.Commands.MyContacts;
using GNDJ.Application.Members.Commands.MyOnboarding;
using GNDJ.Application.Members.Commands.Push;
using GNDJ.Application.Members.Commands.UpdateMyProfile;
using GNDJ.Application.Members.Queries.MySwitchAccounts;
using GNDJ.Application.Reports;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GNDJ.Api.Controllers;

/// <summary>
/// Member self-service edits of their OWN record (base route api/v1/my-profile). Authenticated but requires
/// NO members.edit permission — every action operates on the caller's own MemberId (resolved server-side),
/// and only fields a member is allowed to change are exposed. Used by "Ma fiche". Locked identity fields
/// (name, DOB, gender, matricule, card number) are never editable here. Data that needs approval
/// (progression, fonctions) is NOT in this controller.
/// </summary>
[Authorize]
[Route("api/v1/my-profile")]
public class MyProfileController : BaseApiController
{
    /// <summary>Updates the caller's own editable profile fields (nationalité, école, classe, section,
    /// groupe sanguin) and medical notes/allergies. No approval required.</summary>
    [HttpPut("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateMyProfileCommand command)
    {
        var result = await Mediator.Send(command);
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return NoContent();
    }

    /// <summary>Confirmed-sibling accounts the caller can switch to (name + login username). Auth-only, own
    /// family. Powers the account switcher; switching itself reuses the login/refresh endpoints.</summary>
    [HttpGet("switch-accounts")]
    public async Task<IActionResult> SwitchAccounts()
    {
        var result = await Mediator.Send(new GetMySwitchAccountsQuery());
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return Ok(result.Value);
    }


    /// <summary>One-time contact-review popup « Confirmer »: applies the caller's chosen courriel/téléphone
    /// principal + parents' situation + per-parent urgence/décédé, and stamps ContactReviewedAt so it stops showing.</summary>
    [HttpPost("review-contacts")]
    public async Task<IActionResult> ReviewContacts([FromBody] ReviewMyContactsCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Sets (or clears) the caller's own primary contact email — the recipient for member-facing mail.</summary>
    [HttpPut("primary-email")]
    public async Task<IActionResult> SetPrimaryEmail([FromBody] PrimaryEmailBody body) => Wrap(await Mediator.Send(new SetMyPrimaryContactEmailCommand(body?.Email)));

    /// <summary>Body for PUT /my-profile/primary-email.</summary>
    public record PrimaryEmailBody(string? Email);

    /// <summary>"Inscrire un frère ou une sœur": opens the family's enrollment-portal account from the member's own
    /// fiche (created if needed, prefilled with parents/address/siblings) and returns a portal session, so the parent
    /// lands straight in a new demande — no email code needed.</summary>
    [HttpPost("start-sibling-demande")]
    public async Task<IActionResult> StartSiblingDemande()
    {
        var result = await Mediator.Send(new GNDJ.Application.Applicants.StartSiblingDemandeCommand());
        return result.IsSuccess ? Ok(result.Value) : BadRequest(new { error = result.Error });
    }

    /// <summary>Marks the caller's first-login welcome tour as seen (so the carousel doesn't show again).</summary>
    [HttpPost("onboarding-seen")]
    public async Task<IActionResult> OnboardingSeen() => Wrap(await Mediator.Send(new MarkOnboardingSeenCommand()));

    /// <summary>Records that the caller runs the app as an installed PWA (first standalone launch / appinstalled).
    /// Stamps Member.AppInstalledAt once (idempotent) so the CG can see who installed the app. Best-effort.</summary>
    [HttpPost("app-installed")]
    public async Task<IActionResult> AppInstalled() => Wrap(await Mediator.Send(new MarkAppInstalledCommand()));

    /// <summary>The VAPID public key the client needs to subscribe to Web Push, + whether push is configured
    /// on the server. Auth-only (the public key isn't secret, but this is only used by signed-in members).</summary>
    [HttpGet("push/vapid-key")]
    public IActionResult PushVapidKey([FromServices] GNDJ.Infrastructure.Services.IWebPushSender push)
        => Ok(new { publicKey = push.PublicKey, enabled = push.IsConfigured });

    /// <summary>Registers this device's Web Push subscription for the caller (enables notifications).</summary>
    [HttpPost("push/subscribe")]
    public async Task<IActionResult> PushSubscribe([FromBody] SubscribePushCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Removes this device's Web Push subscription for the caller (disables notifications here).</summary>
    [HttpPost("push/unsubscribe")]
    public async Task<IActionResult> PushUnsubscribe([FromBody] UnsubscribePushCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Returns the caller's saved group-dashboard layout (JSON string, or null = default layout).</summary>
    [HttpGet("dashboard-layout")]
    public async Task<IActionResult> GetDashboardLayout()
        => Ok(new { layout = await Mediator.Send(new GNDJ.Application.Dashboard.GetDashboardLayoutQuery()) });

    /// <summary>Saves the caller's group-dashboard layout (widget order/visibility/width). Empty = reset to default.</summary>
    [HttpPut("dashboard-layout")]
    public async Task<IActionResult> UpdateDashboardLayout([FromBody] DashboardLayoutBody body)
        => Wrap(await Mediator.Send(new GNDJ.Application.Dashboard.UpdateDashboardLayoutCommand(body?.LayoutJson)));

    /// <summary>Body for PUT /my-profile/dashboard-layout.</summary>
    public record DashboardLayoutBody(string? LayoutJson);

    // ── Coordonnées: own phones / emails / addresses (add / edit / remove) ──────────────────────────
    // Each command is strictly own-scoped server-side (never a supplied member id), so no members.edit.

    /// <summary>Adds a phone to the caller's own record.</summary>
    [HttpPost("phones")]
    public async Task<IActionResult> AddPhone([FromBody] AddMyPhoneCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own phones.</summary>
    [HttpPut("phones/{id:guid}")]
    public async Task<IActionResult> UpdatePhone(Guid id, [FromBody] UpdateMyPhoneCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own phones.</summary>
    [HttpDelete("phones/{id:guid}")]
    public async Task<IActionResult> DeletePhone(Guid id) => Wrap(await Mediator.Send(new DeleteMyPhoneCommand(id)));

    /// <summary>Adds an email to the caller's own record.</summary>
    [HttpPost("emails")]
    public async Task<IActionResult> AddEmail([FromBody] AddMyEmailCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own emails.</summary>
    [HttpPut("emails/{id:guid}")]
    public async Task<IActionResult> UpdateEmail(Guid id, [FromBody] UpdateMyEmailCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own emails.</summary>
    [HttpDelete("emails/{id:guid}")]
    public async Task<IActionResult> DeleteEmail(Guid id) => Wrap(await Mediator.Send(new DeleteMyEmailCommand(id)));

    /// <summary>Adds an address to the caller's own record.</summary>
    [HttpPost("addresses")]
    public async Task<IActionResult> AddAddress([FromBody] AddMyAddressCommand command) => Wrap(await Mediator.Send(command));

    /// <summary>Edits one of the caller's own addresses.</summary>
    [HttpPut("addresses/{id:guid}")]
    public async Task<IActionResult> UpdateAddress(Guid id, [FromBody] UpdateMyAddressCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes one of the caller's own addresses.</summary>
    [HttpDelete("addresses/{id:guid}")]
    public async Task<IActionResult> DeleteAddress(Guid id) => Wrap(await Mediator.Send(new DeleteMyAddressCommand(id)));

    // ── Famille: own guardians (create-new only — no search/link of arbitrary existing guardians) ──────

    /// <summary>Creates a new guardian linked to the caller's own record.</summary>
    [HttpPost("guardians")]
    public async Task<IActionResult> CreateGuardian([FromBody] CreateMyGuardianCommand command)
    {
        var result = await Mediator.Send(command);
        return result.IsSuccess ? Ok(new { id = result.Value }) : BadRequest(new { error = result.Error });
    }

    /// <summary>Edits one of the caller's own linked guardians.</summary>
    [HttpPut("guardians/{id:guid}")]
    public async Task<IActionResult> UpdateGuardian(Guid id, [FromBody] UpdateMyGuardianCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Edits the relationship/flags of one of the caller's own guardian links.</summary>
    [HttpPut("guardian-links/{linkId:guid}")]
    public async Task<IActionResult> UpdateGuardianLink(Guid linkId, [FromBody] UpdateMyGuardianLinkCommand command)
        => linkId != command.LinkId ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Unlinks a guardian from the caller (the shared guardian record survives).</summary>
    [HttpDelete("guardian-links/{linkId:guid}")]
    public async Task<IActionResult> UnlinkGuardian(Guid linkId) => Wrap(await Mediator.Send(new UnlinkMyGuardianCommand(linkId)));

    /// <summary>Adds a phone to one of the caller's own linked guardians.</summary>
    [HttpPost("guardians/{guardianId:guid}/phones")]
    public async Task<IActionResult> AddGuardianPhone(Guid guardianId, [FromBody] AddMyGuardianPhoneCommand command)
        => guardianId != command.GuardianId ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Edits a phone of one of the caller's own linked guardians (fix a typo / type / primary flag).</summary>
    [HttpPut("guardian-phones/{id:guid}")]
    public async Task<IActionResult> UpdateGuardianPhone(Guid id, [FromBody] UpdateMyGuardianPhoneCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes a phone from one of the caller's own linked guardians.</summary>
    [HttpDelete("guardian-phones/{id:guid}")]
    public async Task<IActionResult> DeleteGuardianPhone(Guid id) => Wrap(await Mediator.Send(new DeleteMyGuardianPhoneCommand(id)));

    /// <summary>Adds an email to one of the caller's own linked guardians.</summary>
    [HttpPost("guardians/{guardianId:guid}/emails")]
    public async Task<IActionResult> AddGuardianEmail(Guid guardianId, [FromBody] AddMyGuardianEmailCommand command)
        => guardianId != command.GuardianId ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Edits an email of one of the caller's own linked guardians (fix a typo / type / primary flag).</summary>
    [HttpPut("guardian-emails/{id:guid}")]
    public async Task<IActionResult> UpdateGuardianEmail(Guid id, [FromBody] UpdateMyGuardianEmailCommand command)
        => id != command.Id ? BadRequest(new { error = "L'identifiant ne correspond pas." }) : Wrap(await Mediator.Send(command));

    /// <summary>Removes an email from one of the caller's own linked guardians.</summary>
    [HttpDelete("guardian-emails/{id:guid}")]
    public async Task<IActionResult> DeleteGuardianEmail(Guid id) => Wrap(await Mediator.Send(new DeleteMyGuardianEmailCommand(id)));

    // ── Infos complémentaires: own custom-field values (only fields the CG opened to members) ──────────

    /// <summary>Sets one of the caller's own custom-field values — only for fields whose EditableBy = Member.</summary>
    [HttpPut("custom-fields/{customFieldId:guid}")]
    public async Task<IActionResult> SetCustomFieldValue(Guid customFieldId, [FromBody] SetValueRequest body)
    {
        var result = await Mediator.Send(new SetMyCustomFieldValueCommand(customFieldId, body.Value));
        return result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
    }

    /// <summary>Clears one of the caller's own custom-field values (Member-editable fields only).</summary>
    [HttpDelete("custom-fields/{customFieldId:guid}")]
    public async Task<IActionResult> DeleteCustomFieldValue(Guid customFieldId)
        => Wrap(await Mediator.Send(new DeleteMyCustomFieldValueCommand(customFieldId)));

    /// <summary>Body for setting a custom-field value.</summary>
    public record SetValueRequest(string Value);

    // ── Trombinoscope: the member views the photo grid of the unit(s) they belong(ed) to, per year ──────

    /// <summary>The (scout year, unit) pairs the caller can view a trombinoscope for.</summary>
    [HttpGet("trombinoscopes")]
    public async Task<IActionResult> TrombinoscopeYears() => Ok(await Mediator.Send(new GetMyTrombinoscoreYearsQuery()));

    /// <summary>The trombinoscope PDF for a unit + scout year the caller was active in.</summary>
    [HttpGet("trombinoscope")]
    public async Task<IActionResult> Trombinoscope([FromQuery] Guid unitId, [FromQuery] string scoutYear)
    {
        var result = await Mediator.Send(new GenerateMyTrombinoscoreQuery(unitId, scoutYear ?? ""));
        if (!result.IsSuccess) return BadRequest(new { error = result.Error });
        return File(result.Value!.Data, "application/pdf", result.Value.FileName);
    }

    // Maps a Result to 204 (success) or 400 (with the error message).
    private IActionResult Wrap<T>(GNDJ.Application.Common.Models.Result<T> result)
        => result.IsSuccess ? NoContent() : BadRequest(new { error = result.Error });
}
