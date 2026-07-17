using System.Text.Json;
using FluentValidation;

namespace GNDJ.Api.Middleware;

// Last-resort exception translator: maps unhandled exceptions bubbling out of the pipeline
// to consistent JSON responses so handlers/validators can throw rather than format errors.
//   ValidationException (FluentValidation) -> 400 with a per-property errors map (ProblemDetails-ish)
//   UnauthorizedAccessException            -> 403 "Accès refusé."
//   anything else                          -> 500 (logged) with a generic message (no leak)
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (ValidationException ex)
        {
            context.Response.StatusCode = 400;
            context.Response.ContentType = "application/json";

            var errors = ex.Errors
                .GroupBy(e => e.PropertyName)
                .ToDictionary(g => g.Key, g => g.Select(e => e.ErrorMessage).ToArray());

            var response = new
            {
                type = "https://tools.ietf.org/html/rfc7231#section-6.5.1",
                title = "Erreur de validation",
                status = 400,
                errors
            };

            await context.Response.WriteAsync(JsonSerializer.Serialize(response));
        }
        catch (UnauthorizedAccessException)
        {
            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "Accès refusé." }));
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException pg)
        {
            // A database constraint rejected the write — almost always duplicate/oversized/invalid input from a
            // user (e.g. a parent double-clicking "S'inscrire", a pasted 300-char field), NOT a server fault.
            // Map to a clean 4xx with a friendly French message instead of an opaque 500 that reads as a crash.
            var (status, message) = pg.SqlState switch
            {
                "23505" => (409, "Cet enregistrement existe déjà."),                // unique_violation
                "23503" => (400, "Référence invalide (élément lié introuvable)."),  // foreign_key_violation
                "23502" => (400, "Un champ obligatoire est manquant."),             // not_null_violation
                "22001" => (400, "Une valeur saisie est trop longue."),             // string_data_right_truncation
                "23514" => (400, "Une valeur saisie n'est pas valide."),            // check_violation
                _ => (400, "Impossible d'enregistrer : données invalides."),
            };
            _logger.LogWarning(ex, "DB constraint {SqlState} on {Method} {Path}", pg.SqlState, context.Request.Method, context.Request.Path);
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = message }));
        }
        catch (Exception ex) when (ex.GetType().FullName?.StartsWith("QuestPDF", StringComparison.Ordinal) == true)
        {
            // A report failed to lay out (e.g. one member with pathological data / an unrenderable field).
            // Return a readable 400 for the whole report endpoint rather than an opaque 500 that reads as a crash.
            _logger.LogWarning(ex, "PDF generation failed on {Path}", context.Request.Path);
            context.Response.StatusCode = 400;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "Impossible de générer le PDF — vérifiez les données ou les photos des membres." }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception");
            context.Response.StatusCode = 500;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = "Une erreur interne est survenue." }));
        }
    }
}
