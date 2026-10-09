using GNDJ.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using SkiaSharp;

namespace GNDJ.Infrastructure.Services;

// Member-photo thumbnails: at most 320 px tall (enough for a 3:4 tile on a sharp screen), JPEG quality 75, usually
// 15–30 KB instead of 1–5 MB. Cached under uploads/photo-thumbs/ (outside uploads/photos, so the stray-file check
// never sees them), named after the photo file + its last-write time, so a new upload makes a new thumbnail and the
// old ones of that photo are removed. Phone photos are turned upright from their EXIF orientation first.
public class PhotoThumbnails(ILogger<PhotoThumbnails> logger) : IPhotoThumbnails
{
    private const int MaxHeight = 320;
    private const int Quality = 75;
    private static readonly object Gate = new();

    public string? GetThumbnail(string sourcePath)
    {
        try
        {
            var dir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "photo-thumbs");
            var stem = Path.GetFileNameWithoutExtension(sourcePath);
            var ticks = File.GetLastWriteTimeUtc(sourcePath).Ticks;
            var target = Path.Combine(dir, $"{stem}.{ticks}.jpg");
            if (File.Exists(target)) return target;

            // One build at a time: a photo wall asks for dozens at once and decoding big JPEGs is memory-hungry.
            lock (Gate)
            {
                if (File.Exists(target)) return target;
                Directory.CreateDirectory(dir);

                using var codec = SKCodec.Create(sourcePath);
                if (codec is null) return null;
                using var original = SKBitmap.Decode(codec);
                if (original is null) return null;
                using var upright = Orient(original, codec.EncodedOrigin);

                var scale = Math.Min(1f, (float)MaxHeight / upright.Height);
                var info = new SKImageInfo(Math.Max(1, (int)(upright.Width * scale)), Math.Max(1, (int)(upright.Height * scale)));
                using var small = upright.Resize(info, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
                if (small is null) return null;
                using var image = SKImage.FromBitmap(small);
                using var data = image.Encode(SKEncodedImageFormat.Jpeg, Quality);

                var tmp = target + ".tmp";
                using (var fs = File.Create(tmp)) data.SaveTo(fs);
                File.Move(tmp, target, overwrite: true);

                // Older thumbnails of the same photo (before it was replaced).
                foreach (var old in Directory.EnumerateFiles(dir, stem + ".*.jpg"))
                    if (!string.Equals(old, target, StringComparison.OrdinalIgnoreCase))
                        try { File.Delete(old); } catch { /* in use: removed next time */ }
                return target;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Photo thumbnail failed for {Path}", sourcePath);
            return null;
        }
    }

    // Applies the EXIF orientation so the thumbnail looks like the photo does in the browser.
    private static SKBitmap Orient(SKBitmap src, SKEncodedOrigin origin)
    {
        if (origin is SKEncodedOrigin.TopLeft or SKEncodedOrigin.Default) return src.Copy();
        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var dst = new SKBitmap(swap ? src.Height : src.Width, swap ? src.Width : src.Height);
        using var c = new SKCanvas(dst);
        switch (origin)
        {
            case SKEncodedOrigin.TopRight: c.Scale(-1, 1, src.Width / 2f, 0); break;
            case SKEncodedOrigin.BottomRight: c.RotateDegrees(180, src.Width / 2f, src.Height / 2f); break;
            case SKEncodedOrigin.BottomLeft: c.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.LeftTop: c.Translate(dst.Width, 0); c.RotateDegrees(90); c.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.RightTop: c.Translate(dst.Width, 0); c.RotateDegrees(90); break;
            case SKEncodedOrigin.RightBottom: c.Translate(0, dst.Height); c.RotateDegrees(-90); c.Scale(1, -1, 0, src.Height / 2f); break;
            case SKEncodedOrigin.LeftBottom: c.Translate(0, dst.Height); c.RotateDegrees(-90); break;
        }
        using var img = SKImage.FromBitmap(src);
        c.DrawImage(img, 0, 0, new SKSamplingOptions(SKFilterMode.Nearest));
        return dst;
    }
}
