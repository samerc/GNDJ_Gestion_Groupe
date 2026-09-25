namespace GNDJ.Application.Common;

// One-off text for a SINGLE send ("Modifier le texte pour cet envoi"): the CG edits the subject/body of a template
// for this send only; the saved template is untouched. The edited text rides with each queued email in its
// variables under these reserved keys (so no outbox schema change), and EmailService uses it INSTEAD of the
// template's subject/body — while still routing, attaching and substituting {{variables}} exactly as for the
// template. Keys start with "__" so they can never collide with a real {{variable}}.
public static class EmailOverride
{
    public const string SubjectKey = "__subject";
    public const string BodyKey = "__bodyHtml";

    public const int MaxSubjectLength = 300;
    public const int MaxBodyLength = 100_000;
}
