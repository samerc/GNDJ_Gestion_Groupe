using FluentValidation;
using Mediator;

namespace GNDJ.Application.Common.Behaviors;

// Mediator pipeline step that runs all registered FluentValidation validators for a command/query BEFORE
// its handler. Any failures throw a ValidationException (translated to a 400 by middleware), so handlers
// can assume their input is already valid. No validators registered for a message => it passes straight through.
public sealed class ValidationBehavior<TMessage, TResponse> : IPipelineBehavior<TMessage, TResponse>
    where TMessage : IMessage
{
    private readonly IEnumerable<IValidator<TMessage>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TMessage>> validators)
    {
        _validators = validators;
    }

    public async ValueTask<TResponse> Handle(
        TMessage message,
        MessageHandlerDelegate<TMessage, TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!_validators.Any())
            return await next(message, cancellationToken);

        var context = new ValidationContext<TMessage>(message);

        // ValidateAsync (not Validate) so validators may use async rules (e.g. the password-policy rule reads
        // the security.password_* settings). Synchronous rules run exactly as before under ValidateAsync.
        var results = await Task.WhenAll(_validators.Select(v => v.ValidateAsync(context, cancellationToken)));
        var failures = results
            .SelectMany(result => result.Errors)
            .Where(f => f is not null)
            .ToList();

        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next(message, cancellationToken);
    }
}
