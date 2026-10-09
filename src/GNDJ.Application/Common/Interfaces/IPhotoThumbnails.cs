namespace GNDJ.Application.Common.Interfaces;

// Small JPEG copies of member photos for lists and photo walls (a full photo can be several MB from a phone).
public interface IPhotoThumbnails
{
    // Path of a cached thumbnail of the photo at `sourcePath` (made on first use, remade when the photo changes);
    // null if the image can't be read — the caller then serves the original.
    string? GetThumbnail(string sourcePath);
}
