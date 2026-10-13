# register_queue_task.ps1 (R38): Windows Task Scheduler task "BugBrain Queue" for the current user (no admin rights needed).
# Triggers: at logon of this user, and when the PC has been idle 10 minutes. Runs run_queue.bat (below-normal priority; the queue
# itself honours the PAUSE file, waits while CPU use is above 60 %, and refuses to start a second copy).
#   Register:   powershell -ExecutionPolicy Bypass -File register_queue_task.ps1
#   Remove:     powershell -ExecutionPolicy Bypass -File register_queue_task.ps1 -Remove      (or: schtasks /Delete /TN "BugBrain Queue" /F)
#   Disable:    schtasks /Change /TN "BugBrain Queue" /DISABLE        Enable again: schtasks /Change /TN "BugBrain Queue" /ENABLE
param([switch]$Remove)
$name = 'BugBrain Queue'
if ($Remove) { Unregister-ScheduledTask -TaskName $name -Confirm:$false; Write-Output "removed $name"; exit }
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"$dir\run_queue.bat`"" -WorkingDirectory $dir
$user = "$env:USERDOMAIN\$env:USERNAME"
$t1 = New-ScheduledTaskTrigger -AtLogOn -User $user
$set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Priority 7 -RunOnlyIfIdle:$false
$set.IdleSettings.IdleDuration = 'PT10M'; $set.IdleSettings.StopOnIdleEnd = $false
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
try {
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $t1 -Settings $set -Principal $principal -Description 'BugBrain experiment queue (run/queue.js); pause with PAUSE file' -Force | Out-Null
} catch {
  Write-Output "logon trigger needs rights this account lacks ($($_.Exception.Message)); falling back to an on-idle trigger"
  schtasks /Create /TN $name /TR "cmd.exe /c \`"$dir\run_queue.bat\`"" /SC ONIDLE /I 10 /RL LIMITED /F | Out-Null
}
# add the idle trigger as a second trigger (schtasks XML-free way): an on-idle copy of the task
schtasks /Create /TN "$name (idle)" /TR "cmd.exe /c \`"$dir\run_queue.bat\`"" /SC ONIDLE /I 10 /RL LIMITED /F 2>&1 | Out-Null
schtasks /Query /TN $name /FO LIST | Select-String 'TaskName|Status|Next Run'
schtasks /Query /TN "$name (idle)" /FO LIST 2>$null | Select-String 'TaskName|Status'
