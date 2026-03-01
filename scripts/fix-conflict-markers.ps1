param(
    [string]$Root = ".",
    [ValidateSet('smart','ours','theirs','both')]
    [string]$Mode = 'smart',
    [string[]]$Include = @('*.json', '*.js', '*.ts', '*.vue', '*.html', '*.css', '*.md'),
    [switch]$Apply,
    [switch]$NoBackup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-ConflictStart([string]$line) {
    return $line -match '^<<<<<<<\s'
}

function Test-ConflictSplit([string]$line) {
    return $line -eq '======='
}

function Test-ConflictEnd([string]$line) {
    return $line -match '^>>>>>>>\s'
}

function New-Frame([string]$startLabel) {
    return [ordered]@{
        StartLabel = $startLabel
        EndLabel = ''
        Side = 'left'
        Left = New-Object 'System.Collections.Generic.List[string]'
        Right = New-Object 'System.Collections.Generic.List[string]'
    }
}

function Select-ResolvedLines($frame, [string]$mode) {
    switch ($mode) {
        'ours' {
            return @($frame.Left)
        }
        'theirs' {
            return @($frame.Right)
        }
        'both' {
            $combined = New-Object 'System.Collections.Generic.List[string]'
            foreach ($line in $frame.Left) {
                $combined.Add($line)
            }
            foreach ($line in $frame.Right) {
                if (-not $combined.Contains($line)) {
                    $combined.Add($line)
                }
            }
            return @($combined)
        }
        'smart' {
            $start = $frame.StartLabel.ToLowerInvariant()
            $end = $frame.EndLabel.ToLowerInvariant()

            if ($start.Contains('updated upstream') -and $end.Contains('stashed changes')) {
                return @($frame.Right)
            }

            if ($start.Contains('head')) {
                return @($frame.Left)
            }

            return @($frame.Right)
        }
        default {
            return @($frame.Right)
        }
    }
}

function Resolve-ConflictText {
    param(
        [string]$Text,
        [string]$Mode
    )

    $hasTrailingNewline = $Text.EndsWith("`n")
    $lines = [regex]::Split($Text, "`r`n|`n|`r")

    $output = New-Object 'System.Collections.Generic.List[string]'
    $stack = New-Object 'System.Collections.Generic.Stack[hashtable]'
    $resolvedBlocks = 0

    foreach ($rawLine in $lines) {
        $line = $rawLine.TrimEnd("`r")
        if (Test-ConflictStart $line) {
            $stack.Push((New-Frame $line))
            continue
        }

        if ((Test-ConflictSplit $line) -and $stack.Count -gt 0) {
            $top = $stack.Pop()
            $top.Side = 'right'
            $stack.Push($top)
            continue
        }

        if ((Test-ConflictEnd $line) -and $stack.Count -gt 0) {
            $frame = $stack.Pop()
            $frame.EndLabel = $line
            $selected = Select-ResolvedLines -frame $frame -mode $Mode
            $resolvedBlocks++

            if ($stack.Count -gt 0) {
                $parent = $stack.Pop()
                if ($parent.Side -eq 'left') {
                    foreach ($selectedLine in $selected) {
                        $parent.Left.Add($selectedLine)
                    }
                } else {
                    foreach ($selectedLine in $selected) {
                        $parent.Right.Add($selectedLine)
                    }
                }
                $stack.Push($parent)
            } else {
                foreach ($selectedLine in $selected) {
                    $output.Add($selectedLine)
                }
            }
            continue
        }

        if ($stack.Count -eq 0) {
            $output.Add($line)
        } else {
            $current = $stack.Pop()
            if ($current.Side -eq 'left') {
                $current.Left.Add($line)
            } else {
                $current.Right.Add($line)
            }
            $stack.Push($current)
        }
    }

    if ($stack.Count -gt 0) {
        throw "Unbalanced conflict markers detected. Remaining blocks: $($stack.Count)"
    }

    $newText = [string]::Join("`n", $output)
    if ($hasTrailingNewline) {
        $newText += "`n"
    }

    return [ordered]@{
        Text = $newText
        Blocks = $resolvedBlocks
    }
}

$rootPath = Resolve-Path -LiteralPath $Root
$files = Get-ChildItem -Path $rootPath -Recurse -File -Include $Include
$targets = New-Object 'System.Collections.Generic.List[System.IO.FileInfo]'

foreach ($file in $files) {
    $sample = Select-String -Path $file.FullName -Pattern '^(<<<<<<<\s|=======|>>>>>>>\s)' -CaseSensitive -SimpleMatch:$false -ErrorAction SilentlyContinue
    if ($sample) {
        $targets.Add($file)
    }
}

if ($targets.Count -eq 0) {
    Write-Host 'No conflict markers found.'
    exit 0
}

Write-Host "Found $($targets.Count) files with conflict markers."
Write-Host "Mode: $Mode"
Write-Host "Apply: $Apply"

$totalBlocks = 0
$updatedFiles = 0

foreach ($file in $targets) {
    $original = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    $resolved = Resolve-ConflictText -Text $original -Mode $Mode

    if ($resolved.Blocks -eq 0) {
        continue
    }

    $totalBlocks += $resolved.Blocks

    if ($Apply) {
        if (-not $NoBackup) {
            Copy-Item -LiteralPath $file.FullName -Destination ($file.FullName + '.bak') -Force
        }

        Set-Content -LiteralPath $file.FullName -Value $resolved.Text -Encoding UTF8 -NoNewline

        if ($file.Extension -eq '.json') {
            try {
                $null = $resolved.Text | ConvertFrom-Json -Depth 100
            } catch {
                Write-Warning "JSON parse failed after resolve: $($file.FullName)"
            }
        }

        $updatedFiles++
        Write-Host "[UPDATED] $($file.FullName) (blocks: $($resolved.Blocks))"
    } else {
        Write-Host "[PREVIEW] $($file.FullName) (blocks: $($resolved.Blocks))"
    }
}

if ($Apply) {
    Write-Host "Done. Updated files: $updatedFiles, resolved blocks: $totalBlocks"
} else {
    Write-Host "Preview complete. Files: $($targets.Count), resolvable blocks: $totalBlocks"
    Write-Host 'Run with -Apply to write changes.'
}
