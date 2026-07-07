using System.Text.Json;
using FluentValidation;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using GNDJ.Application.Common.Validation;
using GNDJ.Domain.Entities;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Public;

// Editable site texts, stored as one JSON setting ("site.content"). Strongly typed so the admin
// edits a friendly form and the public site reads a stable shape. Tone: scout, sober, welcoming.
public record SiteValueDto(string Title, string Text);
public record SiteStatDto(string Value, string Label);
public record SiteHomeContent(
    string HeroBadge, string HeroTitle, string HeroSubtitle,
    string IntroTitle, string IntroText,
    List<SiteValueDto> Values, List<SiteStatDto> Stats,
    string CtaTitle, string CtaText);
// Instagram/Facebook are optional profile URLs shown as social icons in the public footer. Nullable
// defaults keep previously-stored site.content JSON (without these fields) deserializable.
public record SiteFooterContent(string Tagline, string? Instagram = null, string? Facebook = null);
public record SiteContactContent(string Intro, string Address);
public record SiteContentDto(SiteHomeContent Home, SiteFooterContent Footer, SiteContactContent Contact);

public record PublicSiteConfigDto(bool InscriptionsOpen, SiteContentDto Content);

public static class SiteContentDefaults
{
    public const string SettingKey = "site.content";

    public static SiteContentDto Default() => new(
        Home: new SiteHomeContent(
            HeroBadge: "Au service de la jeunesse depuis 1935",
            HeroTitle: "Groupe Notre-Dame Jamhour",
            HeroSubtitle: "Un groupe scout qui accompagne les jeunes sur le chemin de la foi, du service et de la vie d'équipe — pour grandir, ensemble, au grand air.",
            IntroTitle: "Le scoutisme, un chemin",
            IntroText: "Du louveteau au routier, chacun avance à son rythme, à travers le jeu, la nature et la vie de patrouille, guidé par des chefs bénévoles.",
            Values: new List<SiteValueDto>
            {
                new("Foi", "Une vie spirituelle vécue simplement, au quotidien, dans le respect de chacun."),
                new("Nature & aventure", "Camps, explorations et grands jeux : on apprend en vivant, dehors, ensemble."),
                new("Service", "Servir les autres et tenir sa place dans l'équipe : la promesse au cœur de tout."),
            },
            Stats: new List<SiteStatDto>
            {
                new("1935", "Fondation du groupe"),
                new("13", "Unités"),
                new("4", "Branches"),
                new("90+", "Années au service des jeunes"),
            },
            CtaTitle: "Rejoindre le groupe",
            CtaText: "Les inscriptions pour la nouvelle année scoute se font en ligne. Présentez une demande en quelques minutes."),
        Footer: new SiteFooterContent(
            Tagline: "Le Groupe Notre-Dame Jamhour, au service de la jeunesse du Liban depuis 1935. Une aventure scoute fondée sur la foi, le service et la vie d'équipe."),
        Contact: new SiteContactContent(
            Intro: "Une question sur le groupe, les unités ou l'inscription ? Écrivez-nous, un chef vous répondra.",
            Address: "Groupe Notre-Dame Jamhour\nLiban"));
}

internal static class SiteContentStore
{
    public static async Task<SiteContentDto> ReadAsync(IApplicationDbContext context, CancellationToken ct)
    {
        var raw = await context.Settings.Where(s => s.Key == SiteContentDefaults.SettingKey)
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        if (string.IsNullOrWhiteSpace(raw)) return SiteContentDefaults.Default();
        try
        {
            return JsonSerializer.Deserialize<SiteContentDto>(raw,
                new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? SiteContentDefaults.Default();
        }
        catch (JsonException) { return SiteContentDefaults.Default(); }
    }
}

// ----- Public config (anonymous): inscriptions open? + editable texts -----
public record GetPublicSiteConfigQuery() : IRequest<PublicSiteConfigDto>;

public class GetPublicSiteConfigQueryHandler(IApplicationDbContext context) : IRequestHandler<GetPublicSiteConfigQuery, PublicSiteConfigDto>
{
    public async ValueTask<PublicSiteConfigDto> Handle(GetPublicSiteConfigQuery request, CancellationToken ct)
    {
        var enabled = await context.Settings.Where(s => s.Key == "demande.enabled")
            .Select(s => s.Value).FirstOrDefaultAsync(ct);
        var content = await SiteContentStore.ReadAsync(context, ct);
        return new PublicSiteConfigDto(string.Equals(enabled, "true", StringComparison.OrdinalIgnoreCase), content);
    }
}

// ----- Admin: read + update editable texts -----
public record GetSiteContentQuery() : IRequest<SiteContentDto>;

public class GetSiteContentQueryHandler(IApplicationDbContext context) : IRequestHandler<GetSiteContentQuery, SiteContentDto>
{
    public ValueTask<SiteContentDto> Handle(GetSiteContentQuery request, CancellationToken ct)
        => new(SiteContentStore.ReadAsync(context, ct));
}

public record UpdateSiteContentCommand(SiteContentDto Content) : IRequest<Result<bool>>;

public class UpdateSiteContentCommandValidator : AbstractValidator<UpdateSiteContentCommand>
{
    public UpdateSiteContentCommandValidator()
    {
        RuleFor(x => x.Content).NotNull();
        When(x => x.Content is not null, () =>
        {
            RuleFor(x => x.Content.Home).NotNull();
            RuleFor(x => x.Content.Home.HeroTitle).MaximumLength(200).NoHtml();
            RuleFor(x => x.Content.Home.HeroBadge).MaximumLength(200).NoHtml();
            RuleFor(x => x.Content.Home.HeroSubtitle).MaximumLength(1000).NoHtml();
            RuleFor(x => x.Content.Home.IntroTitle).MaximumLength(200).NoHtml();
            RuleFor(x => x.Content.Home.IntroText).MaximumLength(1000).NoHtml();
            RuleFor(x => x.Content.Home.CtaTitle).MaximumLength(200).NoHtml();
            RuleFor(x => x.Content.Home.CtaText).MaximumLength(1000).NoHtml();
            RuleFor(x => x.Content.Home.Values).NotNull().Must(v => v.Count <= 6).WithMessage("Trop de valeurs.");
            RuleFor(x => x.Content.Home.Stats).NotNull().Must(s => s.Count <= 6).WithMessage("Trop de statistiques.");
            RuleForEach(x => x.Content.Home.Values).ChildRules(v => {
                v.RuleFor(i => i.Title).MaximumLength(100).NoHtml();
                v.RuleFor(i => i.Text).MaximumLength(500).NoHtml();
            });
            RuleForEach(x => x.Content.Home.Stats).ChildRules(s => {
                s.RuleFor(i => i.Value).MaximumLength(20).NoHtml();
                s.RuleFor(i => i.Label).MaximumLength(100).NoHtml();
            });
            RuleFor(x => x.Content.Footer.Tagline).MaximumLength(600).NoHtml();
            RuleFor(x => x.Content.Footer.Instagram).MaximumLength(300).NoHtml().When(x => x.Content.Footer.Instagram is not null);
            RuleFor(x => x.Content.Footer.Facebook).MaximumLength(300).NoHtml().When(x => x.Content.Footer.Facebook is not null);
            RuleFor(x => x.Content.Contact.Intro).MaximumLength(600).NoHtml();
            RuleFor(x => x.Content.Contact.Address).MaximumLength(400).NoHtml();
        });
    }
}

public class UpdateSiteContentCommandHandler(IApplicationDbContext context, IAuditService audit) : IRequestHandler<UpdateSiteContentCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UpdateSiteContentCommand request, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(request.Content, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var setting = await context.Settings.FirstOrDefaultAsync(s => s.Key == SiteContentDefaults.SettingKey, ct);
        if (setting is null)
        {
            context.Settings.Add(new Setting
            {
                Key = SiteContentDefaults.SettingKey, Value = json, Category = "site",
                Label = "Textes du site public", Description = "Contenu éditable des pages du site public (JSON)", ValueType = "json"
            });
        }
        else setting.Value = json;

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("Update", "SiteContent", null, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}
