# Add AI Agent Tab to Frontend - Step by Step

Follow these 3 simple steps to add the AI Agent tab to your dashboard:

## Step 1: Add Imports (Line 17)

**Find this line (line 17):**
```typescript
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3 } from 'lucide-react';
```

**Replace it with:**
```typescript
import { X, LayoutDashboard, FolderKanban, Loader2, Filter, BarChart3, Bot } from 'lucide-react';
import AgentChat from './components/AgentChat';
```

---

## Step 2: Add Tab Button (After Line 283)

**Find this section (around line 270-283):**
```typescript
                <button 
                  onClick={() => setActiveTab('projects')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'projects' 
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <FolderKanban className="h-4 w-4" />
                  Ideas Submissions
                  <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full border border-slate-200">
                    {filteredIdeas.length}
                  </span>
                </button>
```

**Add this RIGHT AFTER the closing `</button>` tag (after line 283):**
```typescript

                <button 
                  onClick={() => setActiveTab('agent-chat')}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'agent-chat' 
                      ? 'bg-purple-50 text-purple-700 shadow-sm ring-1 ring-purple-200' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Bot className="h-4 w-4" />
                  AI Agent
                </button>
```

---

## Step 3: Add View Rendering (After Line 359)

**Find this section (around line 355-361):**
```typescript
                 <StatsSection 
                  data={filteredIdeas} // Pass FILTERED dataset
                  onOpenChart={(id) => handleOpenChart(id, 'filtered')} 
                />
             </div>
           )}

           {/* 4. Details View */}
```

**Add this RIGHT AFTER `)}` and BEFORE `{/* 4. Details View */}` (after line 359):**
```typescript

          {/* AI Agent Chat View */}
          {activeTab === 'agent-chat' && (
            <AgentChat />
          )}
```

---

## That's It!

Save the file and your browser should auto-reload. You'll see the "AI Agent" tab appear in the navigation!

## Quick Visual Guide

**Line 17:** Add `Bot` icon and `AgentChat` import  
**Line 284:** Add purple AI Agent button  
**Line 360:** Add AgentChat view rendering  

The tab will appear between "Ideas Submissions" and "Filtered Analytics" (if filters are active).
