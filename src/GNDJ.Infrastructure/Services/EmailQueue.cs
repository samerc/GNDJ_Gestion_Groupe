using System.Threading.Channels;
using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;

namespace GNDJ.Infrastructure.Services;

// Singleton in-memory email queue. Drained by EmailQueueBackgroundService.
// Bounded so a stuck/slow SMTP server can't let the queue grow without limit and exhaust memory while
// requests keep enqueuing (a demande/passage batch can push hundreds at once). 10k is far above any real
// backlog — the worker drains continuously and the largest batch is ~100 — so in practice it never fills.
public class EmailQueue : IEmailQueue
{
    private readonly ILogger<EmailQueue> _logger;

    public EmailQueue(ILogger<EmailQueue> logger) => _logger = logger;

    private readonly Channel<EmailJob> _channel = Channel.CreateBounded<EmailJob>(
        new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
        });

    public ChannelReader<EmailJob> Reader => _channel.Reader;

    // TryWrite never blocks; on a full queue it returns false and the message would be silently dropped —
    // log it loudly (Warning → also hits the DB sink) so a backed-up queue during a big batch is visible.
    public void Enqueue(EmailJob job)
    {
        if (!_channel.Writer.TryWrite(job))
            _logger.LogWarning("Email queue full ({Capacity}) — dropped '{Code}' to {To}. SMTP may be stuck/slow.",
                10_000, job.TemplateCode, job.ToEmail);
    }
}
