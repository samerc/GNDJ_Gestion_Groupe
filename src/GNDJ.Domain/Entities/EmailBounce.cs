namespace GNDJ.Domain.Entities;

// An email address the providers reported as undeliverable (bounce) or as marking our mail as spam (complaint),
// received through the providers' webhooks (Mailgun / SMTP2GO / SendPulse). One row per address. A SUPPRESSED
// address is skipped by the outbox (the email is marked Failed instead of being sent again), which protects the
// sending reputation. Listed on the "Qualité des données" page; a CG removes the row once the address is fixed.
public class EmailBounce
{
    public Guid Id { get; set; } = Guid.CreateVersion7();
    public string Address { get; set; } = string.Empty;   // lowercased
    public string Kind { get; set; } = "hard";            // hard | soft | complaint (the most serious seen)
    public string Provider { get; set; } = string.Empty;  // mailgun | smtp2go | sendpulse | …
    public string? Reason { get; set; }                   // the provider's message, for the CG
    public int Count { get; set; }                        // how many reports for this address
    public bool Suppressed { get; set; }                  // true = the outbox no longer sends to it
    public DateTime FirstAt { get; set; }
    public DateTime LastAt { get; set; }
}
