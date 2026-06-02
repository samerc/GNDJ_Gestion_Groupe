# Start GNDJ backend and frontend
Write-Host "Starting GNDJ Scout..." -ForegroundColor Cyan

# Start backend in background
$env:PATH = "C:\Program Files\dotnet;$env:USERPROFILE\.dotnet\tools;$env:PATH"
Start-Process -NoNewWindow powershell -ArgumentList "-Command", "dotnet run --project src/GNDJ.Api --urls http://localhost:5000"
Write-Host "Backend starting on http://localhost:5000" -ForegroundColor Green

# Start frontend
Set-Location client
Write-Host "Frontend starting on http://localhost:5173" -ForegroundColor Green
npm run dev
