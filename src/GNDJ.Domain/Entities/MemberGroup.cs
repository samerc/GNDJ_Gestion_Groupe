using GNDJ.Domain.Common;

namespace GNDJ.Domain.Entities;

// A reusable "dynamic group" of members defined by RULES, not a fixed team roster — created by a group manager
// (CG/ACG/super-admin). Membership is computed live from active assignments = the UNION of the group's include
// rules, minus its exclude rules, constrained to the group's scope (whole group / a unit type / a specific unit).
// Used for Réunions/absences (Grande Maîtrise, Chefs d'unité, "Haute Patrouille", …) and reusable elsewhere.
public class MemberGroup : BaseEntity
{
    public string Name { get; set; } = string.Empty;

    // Scope constrains every rule: Group = whole group; UnitType = all units of a branch; Unit = one unit.
    public string ScopeType { get; set; } = MemberGroupScopes.Group;
    public Guid? UnitTypeId { get; set; }   // when ScopeType == UnitType
    public Guid? UnitId { get; set; }       // when ScopeType == Unit

    // Only meaningful for a UnitType (branch) scope. true = the group is SPLIT per unit (one independent list
    // per unit of the branch — e.g. "Haute Patrouille" = each troupe's CP/SP; a réunion/mailing targets one unit
    // at a time). false = the branch is treated as ONE combined list (e.g. joining the 3 troupes; one top-level
    // réunion/mailing). Group and Unit scopes ignore this (Group = always combined, Unit = always one unit).
    public bool PerUnit { get; set; }

    public bool IsVisible { get; set; } = true;      // show in the réunion scope picker — the "réunions" toggle
    public bool ShowInUnitList { get; set; }         // offer as a filter in the CU/CG unit roster (never public/members)
    public bool IsSystem { get; set; }               // seeded preset (Grande Maîtrise / Chefs d'unité) — not deletable

    public UnitType? UnitType { get; set; }
    public Unit? Unit { get; set; }
    public ICollection<MemberGroupRule> Rules { get; set; } = [];
}

// One membership rule of a MemberGroup. Include rules ADD members (the group = their union); exclude rules
// REMOVE members. Criterion selects who; Value carries its target (a profile code, or a GUID as string).
// Plain child (not a BaseEntity) so editing a group's rules HARD-replaces them (no soft-deleted leftovers).
public class MemberGroupRule
{
    public Guid Id { get; set; }
    public Guid MemberGroupId { get; set; }
    public bool Include { get; set; } = true;   // true = add, false = remove
    public string Criterion { get; set; } = string.Empty; // see MemberGroupCriteria
    public string? Value { get; set; }          // profile code / role|unit|unit-type|member GUID (per criterion)
    public MemberGroup MemberGroup { get; set; } = null!;
}

public static class MemberGroupScopes
{
    public const string Group = "Group";        // whole group
    public const string UnitType = "UnitType";  // all units of a branch
    public const string Unit = "Unit";          // one unit
    public static readonly string[] All = { Group, UnitType, Unit };
}

// How a group is presented/used: as ONE combined list ("top-level" — a single réunion/mailing over the whole
// scope) or SPLIT per unit ("unit-context" — one independent list/réunion/mailing per unit). See MemberGroup.PerUnit.
public static class MemberGroupModes
{
    // Split per unit: a single Unit, or a UnitType branch explicitly flagged PerUnit (e.g. Haute Patrouille).
    public static bool IsPerUnit(string scopeType, bool perUnit)
        => scopeType == MemberGroupScopes.Unit || (scopeType == MemberGroupScopes.UnitType && perUnit);

    // One combined list: the whole group, or a UnitType branch NOT split (e.g. "joining the 3 troupes").
    public static bool IsTopLevel(string scopeType, bool perUnit)
        => scopeType == MemberGroupScopes.Group || (scopeType == MemberGroupScopes.UnitType && !perUnit);
}

public static class MemberGroupCriteria
{
    public const string Everyone = "all";            // everyone in scope
    public const string Maitrise = "maitrise";       // leaders (IsMaitrise) in scope
    public const string Youth = "youth";             // non-leaders in scope
    public const string TeamLeader = "team-leader";  // chefs d'équipe (IsTeamLeader) in scope
    public const string Profile = "profile";         // holders of a security profile (Value = code)
    public const string Role = "role";               // holders of a functional role (Value = role GUID)
    public const string Unit = "unit";               // members of a unit (Value = unit GUID)
    public const string UnitType = "unit-type";      // members of a branch (Value = unit-type GUID)
    public const string Member = "member";           // a specific member (Value = member GUID)
    public static readonly string[] All = { Everyone, Maitrise, Youth, TeamLeader, Profile, Role, Unit, UnitType, Member };
    // Criteria that need a Value (target); the rest (all/maitrise/youth/team-leader) don't.
    public static readonly string[] NeedValue = { Profile, Role, Unit, UnitType, Member };
}
