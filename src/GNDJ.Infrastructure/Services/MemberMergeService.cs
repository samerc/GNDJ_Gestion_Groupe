using GNDJ.Application.Common.Interfaces;
using GNDJ.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Merges duplicate member records into a keeper (see IMemberMergeService). All in ONE transaction:
//   1. move each loser's connected rows onto the keeper (dedup-on-move for the tables with a natural unique key
//      so no duplicate contacts / links / values are created; plain re-point for the rest),
//   2. move or disable each loser's login,
//   3. soft-delete each loser (which also frees its card numbers from the is_deleted-filtered unique indexes)
//      and disable its login,
//   4. apply the CG-chosen field values to the keeper (done LAST so a carried-over external card number can't
//      collide with a loser that isn't soft-deleted yet).
// Raw SQL (parameterized) is used so the moves + conflict handling are done in the database, bypassing the
// soft-delete interceptor for the physical re-points. Mirrors MemberPurgeService's architecture.
public class MemberMergeService : IMemberMergeService
{
    private readonly GndjDbContext _context;
    private readonly ILogger<MemberMergeService> _logger;

    public MemberMergeService(GndjDbContext context, ILogger<MemberMergeService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task MergeAsync(Guid keeperId, IReadOnlyList<Guid> loserIds, MemberMergeFields fields, CancellationToken ct = default)
    {
        var losers = loserIds.Where(id => id != keeperId).Distinct().ToList();
        if (losers.Count == 0) return;

        await using var tx = await _context.Database.BeginTransactionAsync(ct);
        try
        {
            var keeperHasUser = (await _context.Database.SqlQueryRaw<int>(
                "SELECT COUNT(*) AS \"Value\" FROM users WHERE member_id = {0}", keeperId).ToListAsync(ct)).FirstOrDefault() > 0;

            foreach (var loser in losers)
            {
                var p = new object[] { keeperId, loser };

                // ── Dedup-on-move: drop the loser's rows the keeper already has (by natural key), move the rest ──
                // Phones (match on digits only).
                await Exec("DELETE FROM member_phones l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM member_phones k WHERE k.member_id = {0} AND regexp_replace(k.number, '\\D', '', 'g') = regexp_replace(l.number, '\\D', '', 'g'))", p, ct);
                await Exec("UPDATE member_phones SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Emails (match case-insensitive).
                await Exec("DELETE FROM member_emails l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM member_emails k WHERE k.member_id = {0} AND lower(k.address) = lower(l.address))", p, ct);
                await Exec("UPDATE member_emails SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Addresses (match on city + details, case-insensitive).
                await Exec("DELETE FROM member_addresses l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM member_addresses k WHERE k.member_id = {0} AND lower(coalesce(k.city,'')) = lower(coalesce(l.city,'')) AND lower(coalesce(k.details,'')) = lower(coalesce(l.details,'')))", p, ct);
                await Exec("UPDATE member_addresses SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Guardian links (one per guardian).
                await Exec("DELETE FROM guardian_links l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM guardian_links k WHERE k.member_id = {0} AND k.guardian_id = l.guardian_id)", p, ct);
                await Exec("UPDATE guardian_links SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Custom-field values (one per field).
                await Exec("DELETE FROM member_custom_field_values l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM member_custom_field_values k WHERE k.member_id = {0} AND k.custom_field_id = l.custom_field_id)", p, ct);
                await Exec("UPDATE member_custom_field_values SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Camp participants (one per camp).
                await Exec("DELETE FROM camp_participants l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM camp_participants k WHERE k.member_id = {0} AND k.camp_id = l.camp_id)", p, ct);
                await Exec("UPDATE camp_participants SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Camp game étapistes (one per game).
                await Exec("DELETE FROM camp_game_etapistes l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM camp_game_etapistes k WHERE k.member_id = {0} AND k.camp_game_id = l.camp_game_id)", p, ct);
                await Exec("UPDATE camp_game_etapistes SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Commission BP memberships (one per camp).
                await Exec("DELETE FROM camp_commission_members l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM camp_commission_members k WHERE k.member_id = {0} AND k.camp_id = l.camp_id)", p, ct);
                await Exec("UPDATE camp_commission_members SET member_id = {0} WHERE member_id = {1}", p, ct);
                // Meeting absences (one per meeting).
                await Exec("DELETE FROM meeting_absences l WHERE l.member_id = {1} AND EXISTS (SELECT 1 FROM meeting_absences k WHERE k.member_id = {0} AND k.meeting_id = l.meeting_id)", p, ct);
                await Exec("UPDATE meeting_absences SET member_id = {0} WHERE member_id = {1}", p, ct);

                // ── Plain re-points (no natural unique key to conflict on) ──
                await Exec("UPDATE member_assignments SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE member_documents SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE member_cotisations SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE member_progressions SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE member_change_requests SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE passages SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE api_keys SET member_id = {0} WHERE member_id = {1}", p, ct);
                await Exec("UPDATE applicant_scout_relations SET related_member_id = {0} WHERE related_member_id = {1}", p, ct);
                await Exec("UPDATE demandes SET created_member_id = {0} WHERE created_member_id = {1}", p, ct);
                await Exec("UPDATE camp_familles SET pere_member_id = {0} WHERE pere_member_id = {1}", p, ct);
                await Exec("UPDATE camp_familles SET mere_member_id = {0} WHERE mere_member_id = {1}", p, ct);

                // ── Login: give the keeper the loser's account if it has none, else disable the loser's ──
                var loserHasUser = (await _context.Database.SqlQueryRaw<int>(
                    "SELECT COUNT(*) AS \"Value\" FROM users WHERE member_id = {0}", loser).ToListAsync(ct)).FirstOrDefault() > 0;
                if (!keeperHasUser && loserHasUser)
                {
                    await Exec("UPDATE users SET member_id = {0} WHERE member_id = {1}", p, ct);
                    keeperHasUser = true;
                }
                else if (loserHasUser)
                {
                    // Disable the loser's login AND free its username (prefix it) so the surviving member can reuse
                    // that username if the CG chose it. The loser is soft-deleted, so its email no longer matters.
                    await Exec("UPDATE users SET is_active = false, refresh_token = NULL, refresh_token_expiry = NULL, " +
                               "email = left(member_id::text, 8) || '.merged.' || email WHERE member_id = {0}", [loser], ct);
                }

                // ── Soft-delete the loser (also frees its card numbers from the is_deleted-filtered unique indexes) ──
                await Exec("UPDATE members SET is_deleted = true, deleted_at = {1}, external_card_number = NULL, sibling_group_id = NULL WHERE id = {0}", [loser, DateTime.UtcNow], ct);
            }

            // ── Dedup the keeper's now-merged PARENTS: two duplicate members each entered the same parent as a
            //    separate guardian record, so the keeper ends up linked to the same parent twice. Collapse them. ──
            await DedupKeeperGuardiansAsync(keeperId, ct);

            // ── Apply the chosen field values to the keeper (LAST, so a carried external card number can't collide) ──
            // Done via a tracked EF entity (not raw SQL) so nulls map cleanly. The keeper row wasn't touched by the
            // moves above, and the raw updates are visible on this same transaction/connection.
            var keeper = await _context.Members.FirstAsync(m => m.Id == keeperId, ct);
            keeper.FirstName = fields.FirstName ?? keeper.FirstName;   // NOT NULL columns keep their value if null sent
            keeper.LastName = fields.LastName ?? keeper.LastName;
            keeper.DateOfBirth = fields.DateOfBirth;
            keeper.Gender = fields.Gender;
            keeper.ExternalCardNumber = fields.ExternalCardNumber;
            keeper.BloodType = fields.BloodType;
            keeper.Nationality = fields.Nationality;
            keeper.School = fields.School;
            keeper.Classe = fields.Classe;
            keeper.Section = fields.Section;
            keeper.ProfessionDomain = fields.ProfessionDomain;
            keeper.Profession = fields.Profession;
            keeper.MedicalNotes = fields.MedicalNotes;
            keeper.Allergies = fields.Allergies;
            keeper.Notes = fields.Notes;
            keeper.PrimaryContactEmail = fields.PrimaryContactEmail;
            keeper.PhotoPath = fields.PhotoPath;
            await _context.SaveChangesAsync(ct);

            // ── Login username (User.Email): apply the CG's choice to the surviving member's account, if any. The
            //    losers' usernames were freed above, so this can't collide with them (a third-party collision was
            //    pre-checked in the handler; the unique index is the final backstop → rollback). ──
            if (!string.IsNullOrWhiteSpace(fields.Username))
                await Exec("UPDATE users SET email = {1} WHERE member_id = {0} AND NOT is_deleted", [keeperId, fields.Username.Trim()], ct);

            await tx.CommitAsync(ct);
            _logger.LogInformation("Merged {Count} member(s) into {Keeper}.", losers.Count, keeperId);
        }
        catch
        {
            await tx.RollbackAsync(ct);
            throw;
        }
    }

    private Task Exec(string sql, object[] p, CancellationToken ct) => _context.Database.ExecuteSqlRawAsync(sql, p, ct);

    // Collapse duplicate PARENTS now linked to the keeper. Two things create duplicates when merging duplicate
    // MEMBER records: (a) the same parent entered as two guardian records with slightly different spelling, and
    // (b) each duplicate member had its own "Père"/"Mère". Since the keeper is ONE child, all its "Père" links
    // point to the same father and all its "Mère" links to the same mother — so we group père/mère links BY ROLE
    // (catches a typo'd surname / different emails), and every OTHER role by normalized name (a child can have
    // several tuteurs). Keeps a canonical (prefer one also linked to OTHER families, then the richest in
    // contacts), moves the duplicates' phones/emails onto it (deduped by value), drops the keeper's duplicate
    // link, and soft-deletes a duplicate left linked to nobody. Only merges duplicates linked to the keeper ALONE
    // (LinkCount = 1) so a guardian genuinely shared with another family is never stripped.
    private async Task DedupKeeperGuardiansAsync(Guid keeperId, CancellationToken ct)
    {
        // Column aliases are snake_case: EF maps the unmapped result type's properties through the DB naming
        // convention (ContactCount -> contact_count), so the SELECT must emit those exact names.
        var rows = await _context.Database.SqlQueryRaw<GuardianDedupRow>(
            "SELECT g.id AS \"id\", " +
            "f_unaccent(lower(btrim(coalesce(g.first_name,'') || ' ' || coalesce(g.last_name,'')))) AS \"name_key\", " +
            "f_unaccent(lower(btrim(coalesce(gl_keeper.relationship_type,'')))) AS \"role\", " +
            "(SELECT count(*) FROM guardian_links gl WHERE gl.guardian_id = g.id AND NOT gl.is_deleted) AS \"link_count\", " +
            "(SELECT count(*) FROM guardian_phones p WHERE p.guardian_id = g.id AND NOT p.is_deleted) + " +
            "(SELECT count(*) FROM guardian_emails e WHERE e.guardian_id = g.id AND NOT e.is_deleted) AS \"contact_count\" " +
            "FROM guardians g " +
            "JOIN guardian_links gl_keeper ON gl_keeper.guardian_id = g.id AND gl_keeper.member_id = {0} AND NOT gl_keeper.is_deleted " +
            "WHERE NOT g.is_deleted", keeperId)
            .ToListAsync(ct);

        // Group key: père/mère collapse by ROLE (same child ⇒ same parent, even with a typo); other roles by name.
        static string GroupKey(GuardianDedupRow r) =>
            r.Role is "pere" or "mere" ? "role:" + r.Role : "name:" + (r.NameKey ?? "");

        foreach (var group in rows.GroupBy(GroupKey)
            .Where(g => g.Key != "name:" && g.Count() > 1)) // skip nameless "other" rows; need ≥2 to dedup
        {
            var ordered = group.OrderByDescending(r => r.LinkCount).ThenByDescending(r => r.ContactCount).ThenBy(r => r.Id).ToList();
            var canonical = ordered[0].Id;
            foreach (var dup in ordered.Skip(1))
            {
                if (dup.LinkCount != 1) continue; // shared with another family — leave it alone
                var d = new object[] { canonical, dup.Id };
                await Exec("DELETE FROM guardian_phones l WHERE l.guardian_id = {1} AND EXISTS (SELECT 1 FROM guardian_phones k WHERE k.guardian_id = {0} AND regexp_replace(k.number,'\\D','','g') = regexp_replace(l.number,'\\D','','g'))", d, ct);
                await Exec("UPDATE guardian_phones SET guardian_id = {0} WHERE guardian_id = {1}", d, ct);
                await Exec("DELETE FROM guardian_emails l WHERE l.guardian_id = {1} AND EXISTS (SELECT 1 FROM guardian_emails k WHERE k.guardian_id = {0} AND lower(k.address) = lower(l.address))", d, ct);
                await Exec("UPDATE guardian_emails SET guardian_id = {0} WHERE guardian_id = {1}", d, ct);
                await Exec("DELETE FROM guardian_links WHERE member_id = {0} AND guardian_id = {1}", [keeperId, dup.Id], ct);
                await Exec("UPDATE guardians SET is_deleted = true, deleted_at = {1} WHERE id = {0} AND NOT EXISTS (SELECT 1 FROM guardian_links gl WHERE gl.guardian_id = {0} AND NOT gl.is_deleted)", [dup.Id, DateTime.UtcNow], ct);
            }
        }
    }

    // Row shape for the guardian-dedup query (settable props so EF can materialize an unmapped type by column name).
    private sealed class GuardianDedupRow
    {
        public Guid Id { get; set; }
        public string? NameKey { get; set; }
        public string? Role { get; set; }
        public int LinkCount { get; set; }
        public int ContactCount { get; set; }
    }
}
