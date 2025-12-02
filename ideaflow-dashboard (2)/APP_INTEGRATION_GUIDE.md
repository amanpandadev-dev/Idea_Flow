# IdeaFlow Phase-2: App.tsx Integration Guide

## Quick Integration Steps

To integrate the new AgentChat component into your existing App.tsx, follow these steps:

### 1. Add Import Statements (Line 13)

After the existing imports, add:
```typescript
import AgentChat from './components/AgentChat';
```

### 2. Update Icon Imports (Line 17)

Change:
```typescript
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3 } from 'lucide-react';
```

To:
```typescript
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3, Bot } from 'lucide-react';
```

### 3. Update TabType (Line 19)

Change:
```typescript
type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | string;
```

To:
```typescript
type TabType = 'dashboard' | 'filtered-analytics' | 'projects' | 'agent-chat' | string;
```

### 4. Add AI Agent Tab Button (After line 283)

After the "Ideas Submissions" button, add this new button:

```typescript
                <button 
                  onClick={() => setActiveTab('agent-chat')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'agent-chat' 
                      ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent
                </button>
```

### 5. Add Agent Chat View (After line 356, before "Details View")

Add this new view section:

```typescript
          {/* 4. Agent Chat View */}
          {activeTab === 'agent-chat' && (
            <AgentChat onNavigateToIdea={handleViewDetails} />
          )}
```

Then update the comment for the Details View from `{/* 4. Details View */}` to `{/* 5. Details View */}`.

And update the Chart Detail View comment from `{/* 5. Chart Detail View */}` to `{/* 6. Chart Detail View */}`.

---

## Complete Integration

That's it! The AgentChat component is now integrated. Users can:
1. Click the "AI Agent" tab
2. Upload documents for ephemeral context
3. Ask questions that combine internal ideas with external web search
4. View citations from both internal and external sources
5. Navigate to idea details by clicking internal citations

## Testing

After integration, test:
- Tab navigation works
- Document upload shows success message
- Queries return responses with citations
- Clicking internal citations navigates to idea details
