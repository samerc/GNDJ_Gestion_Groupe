namespace GNDJ.Domain.Enums;

public static class Permissions
{
    public const string MembersView = "members.view";
    public const string MembersCreate = "members.create";
    public const string MembersEdit = "members.edit";
    public const string MembersDelete = "members.delete";

    public const string UnitsView = "units.view";
    public const string UnitsCreate = "units.create";
    public const string UnitsEdit = "units.edit";
    public const string UnitsDelete = "units.delete";

    public const string TeamsView = "teams.view";
    public const string TeamsCreate = "teams.create";
    public const string TeamsEdit = "teams.edit";
    public const string TeamsDelete = "teams.delete";

    public const string AssignmentsView = "assignments.view";
    public const string AssignmentsCreate = "assignments.create";
    public const string AssignmentsEdit = "assignments.edit";
    public const string AssignmentsDelete = "assignments.delete";

    public const string RelationshipsView = "relationships.view";
    public const string RelationshipsCreate = "relationships.create";
    public const string RelationshipsEdit = "relationships.edit";
    public const string RelationshipsDelete = "relationships.delete";

    public const string RolesView = "roles.view";
    public const string RolesManage = "roles.manage";

    public const string AssociationsView = "associations.view";
    public const string AssociationsManage = "associations.manage";

    public const string UnitTypesView = "unit_types.view";
    public const string UnitTypesManage = "unit_types.manage";

    public const string AuditView = "audit.view";
    public const string AdminHardDelete = "admin.hard_delete";

    public static readonly string[] All =
    [
        MembersView, MembersCreate, MembersEdit, MembersDelete,
        UnitsView, UnitsCreate, UnitsEdit, UnitsDelete,
        TeamsView, TeamsCreate, TeamsEdit, TeamsDelete,
        AssignmentsView, AssignmentsCreate, AssignmentsEdit, AssignmentsDelete,
        RelationshipsView, RelationshipsCreate, RelationshipsEdit, RelationshipsDelete,
        RolesView, RolesManage,
        AssociationsView, AssociationsManage,
        UnitTypesView, UnitTypesManage,
        AuditView, AdminHardDelete
    ];
}
