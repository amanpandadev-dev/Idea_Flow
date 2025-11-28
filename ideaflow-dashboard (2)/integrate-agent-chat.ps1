# PowerShell script to integrate AgentChat into App.tsx
# Run this script from the project root directory

$appFile = "App.tsx"

# Read the file
$content = Get-Content $appFile -Raw

# 1. Add AgentChat import after WishlistModal import
$content = $content -replace "import WishlistModal from './components/WishListModal';", "import WishlistModal from './components/WishListModal';`nimport AgentChat from './components/AgentChat';"

# 2. Add Bot to lucide-react imports
$content = $content -replace "import \{ X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3 \} from 'lucide-react';", "import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3, Bot } from 'lucide-react';"

# 3. Update TabType
$content = $content -replace "type TabType = 'dashboard' \| 'filtered-analytics' \| 'projects' \| string;", "type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | 'agent-chat' | string;"

# 4. Add AI Agent tab button after Ideas Submissions button
$tabButton = @"
                </button>

                <button 
                  onClick={() => setActiveTab('agent-chat')}
                  className={``flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors `${
                    activeTab === 'agent-chat' 
                      ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }``}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent
                </button>

                {activeFiltersCount > 0 && (
"@

$content = $content -replace "                </button>\r?\n\r?\n                \{activeFiltersCount > 0 &&", $tabButton

# 5. Add Agent Chat View before Details View
$agentView = @"
          )}

          {/* 4. Agent Chat View */}
          {activeTab === 'agent-chat' && (
            <AgentChat onNavigateToIdea={handleViewDetails} />
          )}

          {/* 5. Details View */}
"@

$content = $content -replace "          \)\}\r?\n\r?\n          /\* 4\. Details View \*/", $agentView

# 6. Update Chart Detail View comment
$content = $content -replace "/\* 5\. Chart Detail View \*/", "/* 6. Chart Detail View */"

# Write the file back
$content | Set-Content $appFile -NoNewline

Write-Host "✅ Successfully integrated AgentChat into App.tsx" -ForegroundColor Green
Write-Host ""
Write-Host "Changes made:" -ForegroundColor Cyan
Write-Host "  1. Added AgentChat import"
Write-Host "  2. Added Bot icon to lucide-react imports"
Write-Host "  3. Updated TabType to include 'agent-chat'"
Write-Host "  4. Added AI Agent tab button"
Write-Host "  5. Added Agent Chat view section"
Write-Host "  6. Updated view comments (4 -> 5, 5 -> 6)"
Write-Host ""
Write-Host "You can now run 'npm start' to test the application!" -ForegroundColor Yellow
