using PDFtoImage;
using SkiaSharp;

namespace FicheOcr;

/// <summary>Turns a document's files into JPEG pages the model can read: PDFs rendered page by page, phone photos
/// turned upright (EXIF) and shrunk so the longest side is at most <c>maxPixels</c>.</summary>
public static class PageImages
{
    /// <summary>Renders at most <c>maxPages</c> pages; <c>totalPages</c> = all pages of the document (files + PDF
    /// pages), so a skipped back page can be flagged.</summary>
    public static List<byte[]> Load(IEnumerable<string> files, int maxPages, int maxPixels, int dpi, out int totalPages)
    {
        var pages = new List<byte[]>();
        totalPages = 0;
        foreach (var file in files)
        {
            if (pages.Count >= maxPages) { totalPages++; continue; } // a further file = at least one more page
            var bytes = File.ReadAllBytes(file);
            if (IsPdf(bytes))
            {
                var count = Conversion.GetPageCount(bytes);
                totalPages += count;
                for (var i = 0; i < count && pages.Count < maxPages; i++)
                {
                    using var bmp = Conversion.ToImage(bytes, page: i, options: new RenderOptions(Dpi: dpi));
                    pages.Add(EncodeShrunk(bmp, maxPixels));
                }
            }
            else
            {
                using var bmp = DecodeUpright(bytes) ?? throw new InvalidDataException($"Image illisible : {Path.GetFileName(file)}");
                pages.Add(EncodeShrunk(bmp, maxPixels));
                totalPages++;
            }
        }
        return pages;
    }

    static bool IsPdf(byte[] b) => b.Length > 4 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F';

    /// <summary>Decodes a JPEG/PNG and applies the camera orientation (phone photos are often stored sideways).</summary>
    static SKBitmap? DecodeUpright(byte[] bytes)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if (codec is null) return null;
        var raw = SKBitmap.Decode(codec);
        if (raw is null) return null;
        var origin = codec.EncodedOrigin;
        if (origin is SKEncodedOrigin.TopLeft or SKEncodedOrigin.Default) return raw;

        var swap = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var outBmp = new SKBitmap(swap ? raw.Height : raw.Width, swap ? raw.Width : raw.Height);
        using (var canvas = new SKCanvas(outBmp))
        {
            switch (origin)
            {
                case SKEncodedOrigin.BottomRight: canvas.RotateDegrees(180, outBmp.Width / 2f, outBmp.Height / 2f); break;
                // Mirrored orientations (selfie cameras, very rare for a scan) are treated as the plain rotation:
                // the text would read mirrored, which the model flags as unreadable rather than misreading.
                case SKEncodedOrigin.RightTop or SKEncodedOrigin.LeftTop:
                    canvas.Translate(outBmp.Width, 0); canvas.RotateDegrees(90); break;
                case SKEncodedOrigin.LeftBottom or SKEncodedOrigin.RightBottom:
                    canvas.Translate(0, outBmp.Height); canvas.RotateDegrees(270); break;
            }
            using var rawImage = SKImage.FromBitmap(raw);
            canvas.DrawImage(rawImage, 0, 0, new SKSamplingOptions(SKFilterMode.Linear));
        }
        raw.Dispose();
        return outBmp;
    }

    static byte[] EncodeShrunk(SKBitmap bmp, int maxPixels)
    {
        var longest = Math.Max(bmp.Width, bmp.Height);
        if (longest <= maxPixels)
        {
            using var img = SKImage.FromBitmap(bmp);
            return img.Encode(SKEncodedImageFormat.Jpeg, 88).ToArray();
        }
        var scale = (float)maxPixels / longest;
        var info = new SKImageInfo((int)(bmp.Width * scale), (int)(bmp.Height * scale));
        using var resized = bmp.Resize(info, new SKSamplingOptions(SKCubicResampler.Mitchell));
        using var img2 = SKImage.FromBitmap(resized);
        return img2.Encode(SKEncodedImageFormat.Jpeg, 88).ToArray();
    }
}
