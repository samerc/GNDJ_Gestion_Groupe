namespace GNDJ.Infrastructure.Services;

// Wake-up signal between the push enqueue path (PushOutboxQueue) and the background push sender — same
// coalescing pattern as IOutboxSignal (email). Losing a signal only adds latency; correctness lives in the
// push_outbox table, and the sender polls on a timer as a fallback.
public interface IPushSignal
{
    void Notify();
    Task WaitAsync(TimeSpan timeout, CancellationToken ct);
}

public class PushSignal : IPushSignal
{
    private readonly SemaphoreSlim _sem = new(0, 1);

    public void Notify()
    {
        try { _sem.Release(); } catch (SemaphoreFullException) { /* a wake is already pending */ }
    }

    public async Task WaitAsync(TimeSpan timeout, CancellationToken ct)
    {
        try { await _sem.WaitAsync(timeout, ct); }
        catch (OperationCanceledException) { /* shutting down */ }
    }
}
