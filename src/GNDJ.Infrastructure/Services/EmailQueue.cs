using System.Threading.Channels;
using GNDJ.Application.Common.Interfaces;

namespace GNDJ.Infrastructure.Services;

// Singleton in-memory email queue backed by an unbounded channel. Drained by EmailQueueBackgroundService.
public class EmailQueue : IEmailQueue
{
    private readonly Channel<EmailJob> _channel = Channel.CreateUnbounded<EmailJob>();

    public ChannelReader<EmailJob> Reader => _channel.Reader;

    public void Enqueue(EmailJob job) => _channel.Writer.TryWrite(job);
}
