using FluentValidation;
using GNDJ.Application.Common.Validation;

namespace GNDJ.Application.Tests;

// The shared FluentValidation rules (NoHtml / RealEmail / HexColor / StrongPassword) are reused across dozens
// of command validators, so their pass/fail edges are worth pinning — especially RealEmail, which rejects the
// TLD-less "marie@gmail" typo that silently bounces every enrollment email.
public class ValidationExtensionsTests
{
    private sealed class Model
    {
        public string? Text { get; init; }
        public string? Email { get; init; }
        public string? Color { get; init; }
        public string Password { get; init; } = "";
    }

    private sealed class NoHtmlValidator : AbstractValidator<Model>
    {
        public NoHtmlValidator() => RuleFor(x => x.Text).NoHtml();
    }

    private sealed class EmailValidator : AbstractValidator<Model>
    {
        public EmailValidator() => RuleFor(x => x.Email).RealEmail();
    }

    private sealed class ColorValidator : AbstractValidator<Model>
    {
        public ColorValidator() => RuleFor(x => x.Color).HexColor();
    }

    private sealed class PasswordValidator : AbstractValidator<Model>
    {
        public PasswordValidator() => RuleFor(x => x.Password).StrongPassword();
    }

    [Theory]
    [InlineData("Bonjour", true)]
    [InlineData("", true)]
    [InlineData(null, true)]
    [InlineData("a < b", false)]
    [InlineData("<script>", false)]
    [InlineData("x > y", false)]
    public void NoHtml_rejects_angle_brackets(string? text, bool expectedValid)
    {
        Assert.Equal(expectedValid, new NoHtmlValidator().Validate(new Model { Text = text }).IsValid);
    }

    [Theory]
    [InlineData("marie@gmail.com", true)]
    [InlineData("prenom.nom@scouts.gndj.org", true)]
    [InlineData("", true)]               // empty passes (compose with NotEmpty where required)
    [InlineData(null, true)]
    [InlineData("marie@gmail", false)]   // the classic TLD-less typo
    [InlineData("notanemail", false)]
    [InlineData("a@b", false)]
    public void RealEmail_requires_a_dotted_domain(string? email, bool expectedValid)
    {
        Assert.Equal(expectedValid, new EmailValidator().Validate(new Model { Email = email }).IsValid);
    }

    [Theory]
    [InlineData("#3B82F6", true)]
    [InlineData("3b82f6", true)]     // '#' optional
    [InlineData("", true)]
    [InlineData(null, true)]
    [InlineData("#12345", false)]    // too short
    [InlineData("red", false)]
    [InlineData("#GGGGGG", false)]   // non-hex
    public void HexColor_accepts_only_6_hex_digits(string? color, bool expectedValid)
    {
        Assert.Equal(expectedValid, new ColorValidator().Validate(new Model { Color = color }).IsValid);
    }

    [Theory]
    [InlineData("Abcdef12", true)]   // upper + lower + digit, 8 chars
    [InlineData("short1A", false)]   // < 8
    [InlineData("alllower1", false)] // no uppercase
    [InlineData("ALLUPPER1", false)] // no lowercase
    [InlineData("NoDigitsHere", false)]
    [InlineData("", false)]
    public void StrongPassword_enforces_length_and_character_classes(string password, bool expectedValid)
    {
        Assert.Equal(expectedValid, new PasswordValidator().Validate(new Model { Password = password }).IsValid);
    }
}
