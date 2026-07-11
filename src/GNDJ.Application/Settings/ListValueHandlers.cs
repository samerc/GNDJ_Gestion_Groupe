using System.Text.Json;
using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Common.Models;
using Mediator;
using Microsoft.EntityFrameworkCore;

namespace GNDJ.Application.Settings;

// The "managed list" settings (schools, classes, cities, profession domains) are json arrays of allowed
// strings. Member / guardian / demande records store the chosen string DIRECTLY — there is NO foreign key —
// so editing the list has to be handled explicitly:
//   • RENAME cascades the new spelling onto every record holding the old value (what an FK gives for free).
//   • DELETE archives an in-use value (moved to a companion "<key>.archived" list: hidden from pickers, kept
//     on the records that hold it, restorable) and hard-removes an unused one — mirroring functions/badges.
// Only the keys in ManagedListKeys get cascade + usage counts + archive; any other json_array is a plain list.
public static class ManagedListSettings
{
    public const string ArchivedSuffix = ".archived";

    // Managed keys whose stored strings must track the list values.
    public static readonly IReadOnlySet<string> Keys = new HashSet<string>
    {
        "member.schools", "member.classes", "member.cities", "member.profession_domains",
    };

    public static bool IsManaged(string key) => Keys.Contains(key);

    // Live usage counts per stored value (grouped, one query per source column) for a managed key.
    public static async Task<Dictionary<string, int>> UsageMapAsync(IApplicationDbContext ctx, string key, CancellationToken ct)
    {
        var map = new Dictionary<string, int>();
        void Merge(IEnumerable<KeyValuePair<string, int>> src)
        {
            foreach (var kv in src) map[kv.Key] = map.GetValueOrDefault(kv.Key) + kv.Value;
        }

        switch (key)
        {
            case "member.schools":
                Merge(await GroupCount(ctx.Members.Where(m => m.School != null).Select(m => m.School!), ct));
                Merge(await GroupCount(ctx.Demandes.Where(d => d.School != null).Select(d => d.School!), ct));
                break;
            case "member.classes":
                Merge(await GroupCount(ctx.Members.Where(m => m.Classe != null).Select(m => m.Classe!), ct));
                Merge(await GroupCount(ctx.Demandes.Where(d => d.Classe != null).Select(d => d.Classe!), ct));
                break;
            case "member.cities":
                Merge(await GroupCount(ctx.MemberAddresses.Where(a => a.City != null && a.City != "").Select(a => a.City), ct));
                Merge(await GroupCount(ctx.ApplicantAccounts.Where(a => a.AddressCity != null).Select(a => a.AddressCity!), ct));
                break;
            case "member.profession_domains":
                Merge(await GroupCount(ctx.Guardians.Where(g => g.ProfessionDomain != null).Select(g => g.ProfessionDomain!), ct));
                Merge(await GroupCount(ctx.ApplicantGuardians.Where(g => g.ProfessionDomain != null).Select(g => g.ProfessionDomain!), ct));
                break;
        }
        return map;
    }

    private static async Task<List<KeyValuePair<string, int>>> GroupCount(IQueryable<string> q, CancellationToken ct)
        => (await q.GroupBy(x => x).Select(g => new { V = g.Key, C = g.Count() }).ToListAsync(ct))
            .Select(x => new KeyValuePair<string, int>(x.V, x.C)).ToList();

    // Cascade a value rename onto every mapped column (IgnoreQueryFilters so soft-deleted rows stay consistent).
    // Returns the number of rows updated across all sources.
    public static async Task<int> CascadeRenameAsync(IApplicationDbContext ctx, string key, string oldV, string newV, CancellationToken ct)
    {
        var n = 0;
        switch (key)
        {
            case "member.schools":
                n += await ctx.Members.IgnoreQueryFilters().Where(m => m.School == oldV).ExecuteUpdateAsync(s => s.SetProperty(m => m.School, newV), ct);
                n += await ctx.Demandes.IgnoreQueryFilters().Where(d => d.School == oldV).ExecuteUpdateAsync(s => s.SetProperty(d => d.School, newV), ct);
                break;
            case "member.classes":
                n += await ctx.Members.IgnoreQueryFilters().Where(m => m.Classe == oldV).ExecuteUpdateAsync(s => s.SetProperty(m => m.Classe, newV), ct);
                n += await ctx.Demandes.IgnoreQueryFilters().Where(d => d.Classe == oldV).ExecuteUpdateAsync(s => s.SetProperty(d => d.Classe, newV), ct);
                break;
            case "member.cities":
                n += await ctx.MemberAddresses.IgnoreQueryFilters().Where(a => a.City == oldV).ExecuteUpdateAsync(s => s.SetProperty(a => a.City, newV), ct);
                n += await ctx.ApplicantAccounts.IgnoreQueryFilters().Where(a => a.AddressCity == oldV).ExecuteUpdateAsync(s => s.SetProperty(a => a.AddressCity, newV), ct);
                break;
            case "member.profession_domains":
                n += await ctx.Guardians.IgnoreQueryFilters().Where(g => g.ProfessionDomain == oldV).ExecuteUpdateAsync(s => s.SetProperty(g => g.ProfessionDomain, newV), ct);
                n += await ctx.ApplicantGuardians.IgnoreQueryFilters().Where(g => g.ProfessionDomain == oldV).ExecuteUpdateAsync(s => s.SetProperty(g => g.ProfessionDomain, newV), ct);
                break;
        }
        return n;
    }
}

// ---- DTOs ----
public record ListValueDto(string Value, int Count);
public record ListValueUsageDto(bool Managed, List<ListValueDto> Active, List<ListValueDto> Archived);

// ---- Shared helpers ----
internal static class ListValueHelpers
{
    public static List<string> Parse(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<string>>(json) ?? new(); } catch { return new(); }
    }

    public static bool Rejected(string v) => v.Length == 0 || v.Length > 150 || v.Contains('<') || v.Contains('>');

    // The list-value endpoints are gated on maitrise.manage so a Chef de Groupe can curate the member-data
    // reference lists they own (écoles / classes / villes / domaines de profession). Any OTHER managed key
    // requires super-admin / associations.manage.
    private static readonly HashSet<string> CgManagedKeys = new()
    {
        "member.cities", "member.schools", "member.classes", "member.profession_domains",
    };
    public static bool CanManageKey(string key, ICurrentUserService user)
        => CgManagedKeys.Contains(key) || user.IsSuperAdmin || user.Permissions.Contains(GNDJ.Domain.Enums.Permissions.AssociationsManage);
}

// ── Usage query: active + archived values (with live counts) for a list setting ──
public record GetListValueUsageQuery(string Key) : IRequest<Result<ListValueUsageDto>>;

public class GetListValueUsageQueryHandler(IApplicationDbContext context, ICurrentUserService currentUser) : IRequestHandler<GetListValueUsageQuery, Result<ListValueUsageDto>>
{
    public async ValueTask<Result<ListValueUsageDto>> Handle(GetListValueUsageQuery request, CancellationToken ct)
    {
        if (!ListValueHelpers.CanManageKey(request.Key, currentUser)) return Result<ListValueUsageDto>.Failure("Accès refusé.");
        var setting = await context.Settings.FindAsync([request.Key], ct);
        if (setting is null) return Result<ListValueUsageDto>.Failure("Paramètre introuvable.");

        var managed = ManagedListSettings.IsManaged(request.Key);
        var counts = managed ? await ManagedListSettings.UsageMapAsync(context, request.Key, ct) : new Dictionary<string, int>();

        var active = ListValueHelpers.Parse(setting.Value)
            .Select(v => new ListValueDto(v, counts.GetValueOrDefault(v))).ToList();

        var archivedSetting = await context.Settings.FindAsync([request.Key + ManagedListSettings.ArchivedSuffix], ct);
        var archived = ListValueHelpers.Parse(archivedSetting?.Value)
            .Select(v => new ListValueDto(v, counts.GetValueOrDefault(v))).ToList();

        return Result<ListValueUsageDto>.Success(new ListValueUsageDto(managed, active, archived));
    }
}

// ── Rename a value in a list setting, cascading the new spelling onto member data for managed keys ──
public record RenameListValueCommand(string Key, string OldValue, string NewValue) : IRequest<Result<int>>;

public class RenameListValueCommandHandler(IApplicationDbContext context, IAuditService audit, ICurrentUserService currentUser) : IRequestHandler<RenameListValueCommand, Result<int>>
{
    public async ValueTask<Result<int>> Handle(RenameListValueCommand request, CancellationToken ct)
    {
        if (!ListValueHelpers.CanManageKey(request.Key, currentUser)) return Result<int>.Failure("Accès refusé.");
        var setting = await context.Settings.FindAsync([request.Key], ct);
        if (setting is null || setting.ValueType != "json_array") return Result<int>.Failure("Liste introuvable.");

        var oldV = (request.OldValue ?? "").Trim();
        var newV = (request.NewValue ?? "").Trim();
        if (ListValueHelpers.Rejected(newV)) return Result<int>.Failure("La nouvelle valeur est vide ou invalide.");
        if (oldV == newV) return Result<int>.Success(0);

        // Rename in the active list (replace old→new, drop any duplicate of new, keep order).
        var items = ListValueHelpers.Parse(setting.Value);
        if (!items.Contains(oldV)) return Result<int>.Failure("Valeur introuvable dans la liste.");
        items = items.Where(i => i != newV).Select(i => i == oldV ? newV : i).ToList();
        setting.Value = JsonSerializer.Serialize(items);

        // Rename it in the archived companion list too, if present (keeps the two lists in sync).
        var archivedSetting = await context.Settings.FindAsync([request.Key + ManagedListSettings.ArchivedSuffix], ct);
        if (archivedSetting is not null)
        {
            var arch = ListValueHelpers.Parse(archivedSetting.Value);
            if (arch.Contains(oldV))
                archivedSetting.Value = JsonSerializer.Serialize(arch.Where(i => i != newV).Select(i => i == oldV ? newV : i).ToList());
        }

        var affected = ManagedListSettings.IsManaged(request.Key)
            ? await ManagedListSettings.CascadeRenameAsync(context, request.Key, oldV, newV, ct)
            : 0;

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("RenameListValue", "Setting", null,
            oldValues: new { request.Key, Value = oldV },
            newValues: new { request.Key, Value = newV, Affected = affected }, cancellationToken: ct);

        return Result<int>.Success(affected);
    }
}

// ── Delete a value: archive it when still in use (managed keys), else hard-remove from the list ──
// Result value = true when archived, false when deleted (mirrors DeleteFunctionalRole).
public record DeleteListValueCommand(string Key, string Value) : IRequest<Result<bool>>;

public class DeleteListValueCommandHandler(IApplicationDbContext context, IAuditService audit, ICurrentUserService currentUser) : IRequestHandler<DeleteListValueCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(DeleteListValueCommand request, CancellationToken ct)
    {
        if (!ListValueHelpers.CanManageKey(request.Key, currentUser)) return Result<bool>.Failure("Accès refusé.");
        var setting = await context.Settings.FindAsync([request.Key], ct);
        if (setting is null || setting.ValueType != "json_array") return Result<bool>.Failure("Liste introuvable.");

        var val = (request.Value ?? "").Trim();
        var items = ListValueHelpers.Parse(setting.Value);
        if (!items.Contains(val)) return Result<bool>.Failure("Valeur introuvable dans la liste.");

        // In use (managed keys only) → archive instead of delete so it stays on the records that hold it.
        var inUse = false;
        if (ManagedListSettings.IsManaged(request.Key))
        {
            var counts = await ManagedListSettings.UsageMapAsync(context, request.Key, ct);
            inUse = counts.GetValueOrDefault(val) > 0;
        }

        items = items.Where(i => i != val).ToList();
        setting.Value = JsonSerializer.Serialize(items);

        if (inUse)
        {
            var archivedKey = request.Key + ManagedListSettings.ArchivedSuffix;
            var archivedSetting = await context.Settings.FindAsync([archivedKey], ct);
            if (archivedSetting is null)
            {
                archivedSetting = new Domain.Entities.Setting
                {
                    Key = archivedKey,
                    Value = "[]",
                    Category = setting.Category,
                    Label = setting.Label + " (archivées)",
                    Description = "Valeurs archivées — masquées des listes mais conservées sur les fiches.",
                    ValueType = "json_array",
                };
                context.Settings.Add(archivedSetting);
            }
            var arch = ListValueHelpers.Parse(archivedSetting.Value);
            if (!arch.Contains(val)) arch.Add(val);
            archivedSetting.Value = JsonSerializer.Serialize(arch);
        }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync(inUse ? "ArchiveListValue" : "DeleteListValue", "Setting", null,
            oldValues: new { request.Key, Value = val }, cancellationToken: ct);

        return Result<bool>.Success(inUse);
    }
}

// ── Add a value to a list setting (CG-accessible for the member-data lists; dedup accent/case-insensitive) ──
public record AddListValueCommand(string Key, string Value) : IRequest<Result<bool>>;

public class AddListValueCommandHandler(IApplicationDbContext context, IAuditService audit, ICurrentUserService currentUser) : IRequestHandler<AddListValueCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(AddListValueCommand request, CancellationToken ct)
    {
        if (!ListValueHelpers.CanManageKey(request.Key, currentUser)) return Result<bool>.Failure("Accès refusé.");
        var setting = await context.Settings.FindAsync([request.Key], ct);
        if (setting is null || setting.ValueType != "json_array") return Result<bool>.Failure("Liste introuvable.");

        var val = (request.Value ?? "").Trim();
        if (ListValueHelpers.Rejected(val)) return Result<bool>.Failure("Valeur vide ou invalide.");
        var items = ListValueHelpers.Parse(setting.Value);
        if (items.Any(i => string.Equals(i, val, StringComparison.OrdinalIgnoreCase))) return Result<bool>.Failure("Cette valeur existe déjà.");

        items.Add(val);
        setting.Value = JsonSerializer.Serialize(items);
        await context.SaveChangesAsync(ct);
        await audit.LogAsync("AddListValue", "Setting", null, newValues: new { request.Key, Value = val }, cancellationToken: ct);
        return Result<bool>.Success(true);
    }
}

// ── Restore an archived value back into the active list ──
public record UnarchiveListValueCommand(string Key, string Value) : IRequest<Result<bool>>;

public class UnarchiveListValueCommandHandler(IApplicationDbContext context, IAuditService audit, ICurrentUserService currentUser) : IRequestHandler<UnarchiveListValueCommand, Result<bool>>
{
    public async ValueTask<Result<bool>> Handle(UnarchiveListValueCommand request, CancellationToken ct)
    {
        if (!ListValueHelpers.CanManageKey(request.Key, currentUser)) return Result<bool>.Failure("Accès refusé.");
        var setting = await context.Settings.FindAsync([request.Key], ct);
        if (setting is null) return Result<bool>.Failure("Liste introuvable.");

        var archivedSetting = await context.Settings.FindAsync([request.Key + ManagedListSettings.ArchivedSuffix], ct);
        var val = (request.Value ?? "").Trim();
        var arch = ListValueHelpers.Parse(archivedSetting?.Value);
        if (archivedSetting is null || !arch.Contains(val)) return Result<bool>.Failure("Valeur archivée introuvable.");

        archivedSetting.Value = JsonSerializer.Serialize(arch.Where(i => i != val).ToList());

        var items = ListValueHelpers.Parse(setting.Value);
        if (!items.Contains(val)) { items.Add(val); setting.Value = JsonSerializer.Serialize(items); }

        await context.SaveChangesAsync(ct);
        await audit.LogAsync("UnarchiveListValue", "Setting", null,
            newValues: new { request.Key, Value = val }, cancellationToken: ct);

        return Result<bool>.Success(true);
    }
}
