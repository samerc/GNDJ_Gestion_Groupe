namespace GNDJ.Infrastructure.Services;

// A lightweight wake-up signal between the enqueue path (OutboxEmailQueue) and the background sender.
// After a row is written, Notify() wakes the sender so new mail goes out promptly instead of waiting for
// the next periodic poll. Losing a signal is harmless — the sender polls on a timer as a fallback, and the
// truth lives in the email_outbox table, so nothing depends on the signal for correctness (only latency).
public interface IOutboxSignal
{
    void Notify();
    Task WaitAsync(TimeSpan timeout, CancellationToken ct);
}

// SemaphoreSlim(0,1) as a coalescing signal: many Notify()s while one is pending collapse to a single wake
// (the sender drains ALL due rows per wake anyway, so coalescing is correct). WaitAsync returns on a signal
// or the timeout, whichever comes first.
public class OutboxSignal : IOutboxSignal
{
    private readonly SemaphoreSlim _sem = new(0, 1);

    public void Notify()
    {
        // Release throws if already at max (1) — that just means "a wake is already pending", so ignore it.
        try { _sem.Release(); } catch (SemaphoreFullException) { }
    }

    public async Task WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        try { await _sem.WaitAsync(timeout, ct); }
        catch (OperationCanceledException) { /* shutting down — caller re-checks the token */ }
    }
}
