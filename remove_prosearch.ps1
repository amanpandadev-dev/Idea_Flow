# ProSearch Complete Removal Script
# Run this from project root

Write-Host "🗑️  ProSearch Complete Removal Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = "c:\Users\MrVamsiKasireddy\Desktop\My demos\HackathonFolders\Idea_Flow_2.1v\Idea_Flow"
Set-Location $projectRoot

Write-Host "📍 Working directory: $projectRoot" -ForegroundColor Yellow
Write-Host ""

# Files to delete
$filesToDelete = @(
    "backend\routes\proSearchRoutes.js",
    "backend\routes\_INTEGRATION_STEPS.js",
    "backend\routes\_temp_refine_handler.js",
    "backend\routes\_temp_fast_heuristic.js",
    "backend\routes\_rehydration_persistence.js",
    "backend\routes\_updated_fast_heuristic.js",
    "backend\services\searchStateService.js",
    "backend\services\conversationService.js",
    "backend\services\conversationContextManager.js",
    "backend\services\hybridSearchHelpers.js",
    "backend\services\filterExtractor.js"
)

$deletedCount = 0
$notFoundCount = 0

foreach ($file in $filesToDelete) {
    $fullPath = Join-Path $projectRoot $file
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Force
            Write-Host "✅ Deleted: $file" -ForegroundColor Green
            $deletedCount++
        } catch {
            Write-Host "❌ Failed to delete: $file" -ForegroundColor Red
            Write-Host "   Error: $_" -ForegroundColor Red
        }
    } else {
        Write-Host "⏭️  Not found (skipping): $file" -ForegroundColor Gray
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "✅ Deleted: $deletedCount files" -ForegroundColor Green
Write-Host "⏭️  Not found: $notFoundCount files" -ForegroundColor Gray
Write-Host ""
Write-Host "🔄 Next steps:" -ForegroundColor Yellow
Write-Host "1. Run database migration: backend/migrations/drop_prosearch_tables.sql" -ForegroundColor White
Write-Host "2. Restart server: npm run server" -ForegroundColor White
Write-Host "3. Test frontend: npm run dev" -ForegroundColor White
Write-Host ""
