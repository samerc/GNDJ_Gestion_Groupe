using GNDJ.Application.Common.Interfaces;
using GNDJ.Application.Documents;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace GNDJ.Api.Controllers;

// Shared upload-file handling for member documents: validates each file (size from documents.max_file_size_mb,
// extension from documents.allowed_file_types, and a magic-byte check that the content matches the extension)
// and saves it under uploads/documents. Used by the normal DocumentsController AND the phone ScanUploadController
// so both enforce the exact same limits/validation. Returns the saved file descriptors + their absolute paths
// (for cleanup on a later failure), or the first validation error (any already-saved files in the batch are
// removed before returning, so a bad file leaves nothing behind).
public static class DocumentUploadFiles
{
    public static async Task<(List<SavedDocFile> saved, List<string> paths, string? error)> SaveAsync(
        IApplicationDbContext context, IFormFileCollection files)
    {
        var maxSizeSetting = await context.Settings.FirstOrDefaultAsync(s => s.Key == "documents.max_file_size_mb");
        var maxSizeMb = int.TryParse(maxSizeSetting?.Value, out var parsed) ? parsed : 5;
        var allowedSetting = await context.Settings.FirstOrDefaultAsync(s => s.Key == "documents.allowed_file_types");
        var allowedTypes = new[] { "pdf", "jpg", "jpeg", "png" };
        if (allowedSetting is not null)
        {
            try { allowedTypes = JsonSerializer.Deserialize<string[]>(allowedSetting.Value) ?? allowedTypes; } catch { }
        }

        var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "documents");
        Directory.CreateDirectory(uploadsDir);

        var saved = new List<SavedDocFile>();
        var paths = new List<string>();
        foreach (var file in files)
        {
            if (file.Length == 0) { Cleanup(paths); return (saved, paths, "Un fichier fourni est vide."); }
            if (file.Length > maxSizeMb * 1024 * 1024) { Cleanup(paths); return (saved, paths, $"Le fichier dépasse la taille maximale autorisée ({maxSizeMb} Mo)."); }

            var ext = Path.GetExtension(file.FileName).TrimStart('.').ToLower();
            if (!allowedTypes.Contains(ext)) { Cleanup(paths); return (saved, paths, $"Type de fichier non autorisé. Types acceptés : {string.Join(", ", allowedTypes)}"); }

            // Magic-byte check: the content must match the extension.
            using (var headerStream = file.OpenReadStream())
            {
                var header = new byte[4];
                var bytesRead = 0;
                while (bytesRead < 4)
                {
                    var read = await headerStream.ReadAsync(header.AsMemory(bytesRead, 4 - bytesRead));
                    if (read == 0) break;
                    bytesRead += read;
                }
                var isValid = ext switch
                {
                    "pdf" => bytesRead >= 4 && header[0] == 0x25 && header[1] == 0x50 && header[2] == 0x44 && header[3] == 0x46, // %PDF
                    "jpg" or "jpeg" => bytesRead >= 3 && header[0] == 0xFF && header[1] == 0xD8 && header[2] == 0xFF,
                    "png" => bytesRead >= 4 && header[0] == 0x89 && header[1] == 0x50 && header[2] == 0x4E && header[3] == 0x47, // .PNG
                    _ => false
                };
                if (!isValid) { Cleanup(paths); return (saved, paths, "Le contenu du fichier ne correspond pas à son extension."); }
            }

            var safeFileName = Path.GetFileName(file.FileName); // Strip any directory components
            var uniqueName = $"{Guid.CreateVersion7()}_{safeFileName}";
            var fullPath = Path.Combine(uploadsDir, uniqueName);
            using (var stream = new FileStream(fullPath, FileMode.Create))
                await file.CopyToAsync(stream);

            var relativePath = Path.Combine("uploads", "documents", uniqueName);
            saved.Add(new SavedDocFile(relativePath, file.FileName, file.Length, file.ContentType));
            paths.Add(fullPath);
        }
        return (saved, paths, null);
    }

    public static void Cleanup(IEnumerable<string> fullPaths)
    {
        foreach (var p in fullPaths)
            try { if (System.IO.File.Exists(p)) System.IO.File.Delete(p); } catch { /* best effort */ }
    }
}
