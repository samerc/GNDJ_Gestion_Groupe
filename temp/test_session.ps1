$ErrorActionPreference = 'Stop'
$base = 'http://localhost:5000/api/v1'
$pass = 0; $fail = 0
function Ok($n)   { Write-Host "  PASS  $n" -ForegroundColor Green; $script:pass++ }
function Bad($n,$d) { Write-Host "  FAIL  $n -> $d" -ForegroundColor Red; $script:fail++ }
function Try-Req($method,$url,$body,$headers) {
  $p = @{ Method = $method; Uri = $url; TimeoutSec = 20 }
  if ($headers) { $p.Headers = $headers }
  if ($null -ne $body) { $p.Body = ($body | ConvertTo-Json -Depth 8); $p.ContentType = 'application/json; charset=utf-8' }
  try { $r = Invoke-WebRequest @p -UseBasicParsing; return @{ code = [int]$r.StatusCode; body = $r.Content; headers = $r.Headers } }
  catch { $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }; $eb=''; try { $eb = $_.ErrorDetails.Message } catch {}; return @{ code = $c; body = $eb; headers = $null } }
}

Write-Host "`n== 1. Security headers (Development) ==" -ForegroundColor Cyan
$h = Try-Req 'GET' "$base/applicant/config" $null $null
if ($h.code -eq 200) { Ok "config 200" } else { Bad "config" $h.code }
$hd = $h.headers
if ($hd.'X-Content-Type-Options' -eq 'nosniff') { Ok "X-Content-Type-Options nosniff" } else { Bad "X-Content-Type-Options" $hd.'X-Content-Type-Options' }
if ($hd.'X-Frame-Options') { Ok "X-Frame-Options present ($($hd.'X-Frame-Options'))" } else { Bad "X-Frame-Options" 'missing' }
if ($hd.'Referrer-Policy') { Ok "Referrer-Policy present" } else { Bad "Referrer-Policy" 'missing' }
if ($hd.'Permissions-Policy') { Ok "Permissions-Policy present" } else { Bad "Permissions-Policy" 'missing (added this session)' }
# CSP is prod-only by design; note its absence in dev
if ($hd.'Content-Security-Policy') { Write-Host "  NOTE  CSP present in dev (unexpected but ok)" -ForegroundColor Yellow } else { Write-Host "  NOTE  CSP absent in Development (by design, prod-only)" -ForegroundColor Yellow }

Write-Host "`n== 2. Config / inscription gate ==" -ForegroundColor Cyan
$cfg = ($h.body | ConvertFrom-Json)
Write-Host "  inscriptions open (demande.enabled) = $($cfg.isOpen); terms set = $([bool]$cfg.terms)"
$openedByTest = $false
if (-not $cfg.isOpen) {
  Write-Host "  (inscriptions closed - temporarily enabling for the applicant-flow tests)" -ForegroundColor Yellow
  # admin login to flip demande.enabled
  $al = Try-Req 'POST' "$base/auth/login" @{ email='admin@gndj.local'; password='Admin123!' } $null
  if ($al.code -eq 200) { $adminTok = ($al.body | ConvertFrom-Json).accessToken; $ah = @{ Authorization = "Bearer $adminTok" }
    $su = Try-Req 'PUT' "$base/settings/demande.enabled" @{ key='demande.enabled'; value='true' } $ah
    if ($su.code -in 200,204) { $openedByTest = $true; Start-Sleep -Milliseconds 300 }
  }
  $h = Try-Req 'GET' "$base/applicant/config" $null $null; $cfg = ($h.body | ConvertFrom-Json)
}
if ($cfg.isOpen) { Ok "inscriptions open for portal tests" } else { Bad "inscriptions" 'could not open' }

Write-Host "`n== 3. Applicant register + T&C accept flow ==" -ForegroundColor Cyan
$rnd = Get-Random -Maximum 999999
$aemail = "sessiontest$rnd@example.com"
$reg = Try-Req 'POST' "$base/applicant/register" @{ email=$aemail; password='Passw0rd!'; contactName='Test Parent' } $null
if ($reg.code -eq 200) { Ok "register 200" } else { Bad "register" "$($reg.code) $($reg.body)" }
$atok = $null
if ($reg.code -eq 200) { $atok = ($reg.body | ConvertFrom-Json).accessToken }
$ah = @{ Authorization = "Bearer $atok" }

$prof = Try-Req 'GET' "$base/applicant/profile" $null $ah
if ($prof.code -eq 200) { Ok "profile 200"; $pj = ($prof.body | ConvertFrom-Json)
  if ($pj.PSObject.Properties.Name -contains 'termsAccepted') { Ok "profile exposes termsAccepted (=$($pj.termsAccepted))" } else { Bad "termsAccepted field" 'absent' }
} else { Bad "profile" $prof.code }

$acc = Try-Req 'POST' "$base/applicant/accept-terms" $null $ah
if ($acc.code -eq 200) { Ok "accept-terms 200" } else { Bad "accept-terms" "$($acc.code) $($acc.body)" }
$prof2 = Try-Req 'GET' "$base/applicant/profile" $null $ah
$pj2 = ($prof2.body | ConvertFrom-Json)
if ($pj2.termsAccepted -eq $true) { Ok "termsAccepted now true after accept" } else { Bad "termsAccepted persist" $pj2.termsAccepted }

Write-Host "`n== 4. Household lookup (A2 prefill) ==" -ForegroundColor Cyan
# request with a junk email -> generic success (no enumeration)
$lr = Try-Req 'POST' "$base/applicant/household-lookup/request" @{ email="nobody$rnd@nowhere.test" } $ah
if ($lr.code -eq 200) { Ok "lookup request generic 200 (no enumeration)" } else { Bad "lookup request" "$($lr.code) $($lr.body)" }
# verify with a wrong code -> 400
$lv = Try-Req 'POST' "$base/applicant/household-lookup/verify" @{ email="nobody$rnd@nowhere.test"; code='000000' } $ah
if ($lv.code -eq 400) { Ok "lookup verify wrong code -> 400" } else { Bad "lookup verify wrong code" $lv.code }

Write-Host "`n== 5. Demande with previous-demande fields ==" -ForegroundColor Cyan
$dbody = @{ data = @{ firstName='Enfant'; lastName='TEST'; dateOfBirth='2016-05-01'; gender='Masculin'; nationality='Libanaise'; school='CNDJ'; classe='7ème'; hasPreviousDemande=$true; previousDemandeYear='2024-2025' } }
$dc = Try-Req 'POST' "$base/applicant/demandes" $dbody $ah
if ($dc.code -eq 200) { Ok "create demande 200"; $did = ($dc.body | ConvertFrom-Json).id } else { Bad "create demande" "$($dc.code) $($dc.body)" }
$prof3 = Try-Req 'GET' "$base/applicant/profile" $null $ah
$pj3 = ($prof3.body | ConvertFrom-Json)
$dm = $pj3.demandes | Where-Object { $_.id -eq $did }
if ($dm -and $dm.hasPreviousDemande -eq $true -and $dm.previousDemandeYear -eq '2024-2025') { Ok "previous-demande fields persisted" } else { Bad "previous-demande persist" ($dm | ConvertTo-Json -Compress) }

Write-Host "`n== 6. Password reset by username -> generic success ==" -ForegroundColor Cyan
# forgot-password accepts a username or email; always returns generic success (no enumeration)
$fp = Try-Req 'POST' "$base/auth/forgot-password" @{ email='admin@gndj.local' } $null
if ($fp.code -in 200,204) { Ok "forgot-password (known) generic success" } else { Bad "forgot-password known" "$($fp.code) $($fp.body)" }
# synthetic usernames are email-formatted (firstname.lastname@scouts.gndj); an unknown well-formed one -> generic 200
$fp2 = Try-Req 'POST' "$base/auth/forgot-password" @{ email="ghost.$rnd@scouts.gndj" } $null
if ($fp2.code -in 200,204) { Ok "forgot-password (unknown username) generic success" } else { Bad "forgot-password unknown" "$($fp2.code) $($fp2.body)" }
# malformed (non-email) username -> 400 format rejection (does NOT leak existence)
$fp3 = Try-Req 'POST' "$base/auth/forgot-password" @{ email="not-an-email" } $null
if ($fp3.code -eq 400) { Ok "forgot-password malformed -> 400 (format, not enumeration)" } else { Bad "forgot-password malformed" $fp3.code }

Write-Host "`n== 7. Close-campaign endpoint guarded ==" -ForegroundColor Cyan
# must be authenticated (demande.manage) - anonymous should 401
$cc = Try-Req 'POST' "$base/demandes/close-campaign" @{ scoutYear='2025-2026' } $null
if ($cc.code -in 401,403) { Ok "close-campaign requires auth ($($cc.code))" } else { Bad "close-campaign auth" $cc.code }

# restore demande.enabled if we flipped it
if ($openedByTest) {
  $al = Try-Req 'POST' "$base/auth/login" @{ email='admin@gndj.local'; password='Admin123!' } $null
  if ($al.code -eq 200) { $adminTok = ($al.body | ConvertFrom-Json).accessToken; $ah2 = @{ Authorization = "Bearer $adminTok" }
    Try-Req 'PUT' "$base/settings/demande.enabled" @{ key='demande.enabled'; value='false' } $ah2 | Out-Null
    Write-Host "  (restored demande.enabled=false)" -ForegroundColor Yellow }
}

Write-Host "`n===== RESULT: $pass passed, $fail failed =====" -ForegroundColor $(if($fail -eq 0){'Green'}else{'Red'})
