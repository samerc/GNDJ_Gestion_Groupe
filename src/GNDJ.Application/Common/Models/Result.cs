namespace GNDJ.Application.Common.Models;

// Outcome wrapper returned by every handler: success carries a Value, failure carries an Error message
// (or a field->messages map for validation). Lets handlers signal expected failures without throwing.
public class Result<T>
{
    public bool IsSuccess { get; }
    public T? Value { get; }
    public string? Error { get; }
    public IDictionary<string, string[]>? ValidationErrors { get; }

    private Result(T value) { IsSuccess = true; Value = value; }
    private Result(string error) { IsSuccess = false; Error = error; }
    private Result(IDictionary<string, string[]> validationErrors) { IsSuccess = false; ValidationErrors = validationErrors; }

    public static Result<T> Success(T value) => new(value);
    public static Result<T> Failure(string error) => new(error);
    public static Result<T> ValidationFailure(IDictionary<string, string[]> errors) => new(errors);
}
