using System.Reflection;
using GNDJ.Api.Authorization;
using GNDJ.Domain.Enums;

namespace GNDJ.Api.Tests;

// Every [HasPermission("x")] on a controller/action must reference a real Permissions.All value. A typo'd
// permission string would compile fine but never match any grant, silently locking everyone out of that
// endpoint (or, if the policy is unknown, failing closed). This reflection test catches that at build/CI time.
public class PermissionAttributeConsistencyTests
{
    private static IEnumerable<Type> ApiTypes()
    {
        var asm = typeof(HasPermissionAttribute).Assembly;
        try { return asm.GetTypes(); }
        catch (ReflectionTypeLoadException ex) { return ex.Types.Where(t => t is not null)!; }
    }

    // The attribute stores its permission in the base AuthorizeAttribute.Policy as "Permission:{permission}".
    private static IEnumerable<string> DeclaredPermissions()
    {
        const string prefix = "Permission:";
        foreach (var type in ApiTypes())
        {
            var members = new List<MemberInfo> { type };
            members.AddRange(type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly));
            foreach (var m in members)
                foreach (var attr in m.GetCustomAttributes<HasPermissionAttribute>(inherit: true))
                    if (attr.Policy is { } p && p.StartsWith(prefix))
                        yield return p[prefix.Length..];
        }
    }

    [Fact]
    public void Every_HasPermission_references_a_known_permission()
    {
        var all = Permissions.All.ToHashSet();
        var unknown = DeclaredPermissions().Where(p => !all.Contains(p)).Distinct().ToList();
        Assert.True(unknown.Count == 0, "Unknown permission(s) used in [HasPermission]: " + string.Join(", ", unknown));
    }

    [Fact]
    public void At_least_one_endpoint_is_permission_gated()
    {
        // Sanity: the reflection actually finds attributes (guards against the test silently passing on nothing).
        Assert.NotEmpty(DeclaredPermissions());
    }
}
