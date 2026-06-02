using Microsoft.AspNetCore.Authorization;

namespace GNDJ.Api.Authorization;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class HasPermissionAttribute : AuthorizeAttribute
{
    public HasPermissionAttribute(string permission) : base($"Permission:{permission}")
    {
    }
}
