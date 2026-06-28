using System.Threading.Channels;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Singleton in-memory email queue. Drained by EmailQueueBackgroundService.
// Bounded so a stuck/slow SMTP server can't let the queue grow without limit and exhaust memory while
// requests keep enqueuing (a demande/passage batch can push hundreds at once). 10k is far above any real
// backlog — the worker drains continuously and the largest batch is ~100 — so in practice it never fills.
public class EmailQueue : IEmailQueue
{
    private readonly Channel<EmailJob> _channel = Channel.CreateBounded<EmailJob>(
        new BoundedChannelOptions(10_000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
        });

    public ChannelReader<EmailJob> Reader => _channel.Reader;

    public void Enqueue(EmailJob job) => _channel.Writer.TryWrite(job);
}
