# Design Document: Market Validation Frontend Fix

## Overview

This design addresses the frontend-backend data alignment issues in the Market Validation Report feature. The core problem is that the backend returns structured section objects with rich data (summaries, evidence arrays, scores, metadata), but the frontend attempts to parse this data from a markdown string using regex, causing display failures.

The solution introduces a Data Adapter layer that transforms backend responses into UI-safe structures, updates React components to consume structured data directly, and ensures all metrics (similarity scores, patent risk) are displayed from backend calculations without frontend modification.

## Architecture

### Current Architecture (Problematic)

```
Backend API Response
  ├── fullReport (markdown string)
  ├── sections (structured objects) ❌ IGNORED
  ├── internalAnalysis (structured)
  ├── externalEvidence (structured)
  └── patentSignals (structured)
         ↓
Frontend Component
  ├── parseSection(fullReport, regex) ❌ FRAGILE
  ├── Hardcoded 0% similarity ❌ WRONG
  └── Direct object rendering ❌ BREAKS UI
```

### Proposed Architecture (Fixed)

```
Backend API Response
  ├── fullReport (for PDF only)
  ├── sections (PRIMARY DATA SOURCE) ✓
  ├── internalAnalysis (structured)
  ├── externalEvidence (structured)
  └── patentSignals (structured)
         ↓
Data Adapter Layer ✓ NEW
  ├── normalizeReport(apiResponse)
  ├── normalizeSections(sections)
  ├── normalizeSimilarIdeas(ideas)
  └── normalizePatentRisk(signals)
         ↓
UI-Safe Data Structure ✓
  ├── Validated shapes
  ├── Safe defaults
  └── Explicit field mappings
         ↓
Frontend Components ✓
  ├── Consume adapter output
  ├── Conditional rendering
  └── No regex parsing
```

## Components and Interfaces

### 1. Data Adapter Module

**File:** `components/marketValidationAdapter.ts`

**Purpose:** Transform backend API responses into UI-safe data structures with explicit field mappings and safe defaults.

**Interface:**

```typescript
// Input: Raw API response
interface RawMarketValidationResponse {
  success: boolean;
  ideaId: number;
  idea: { id: number; title: string };
  fullReport: string;
  sections: {
    internalPosition: SectionData;
    marketTrends: SectionData;
    competitors: SectionData;
    patentRisk: SectionData;
    opportunities: SectionData;
    risks: SectionData;
  };
  internalAnalysis: {
    similarIdeas: Array<any>;
    noveltyScore: number;
  };
  externalEvidence: {
    marketTrends: Array<any>;
    competitors: Array<any>;
    totalSources: number;
  };
  patentSignals: {
    riskLevel: string;
    score: number;
    patents: Array<any>;
    factors?: any;
  };
  verdict: string;
  sources: Array<any>;
  generatedAt: string;
}

// Output: UI-safe normalized structure
interface NormalizedMarketValidationReport {
  metadata: {
    ideaId: number;
    ideaTitle: string;
    generatedAt: string;
    hasData: boolean;
  };
  sections: {
    internalPosition: NormalizedSection;
    marketTrends: NormalizedSection;
    competitors: NormalizedSection;
    patentRisk: NormalizedSection;
    opportunities: NormalizedSection;
    risks: NormalizedSection;
  };
  metrics: {
    noveltyScore: number;
    noveltyLabel: string;
    totalSources: number;
    similarIdeasCount: number;
  };
  patentRisk: {
    level: 'Low' | 'Medium' | 'High';
    score: number;
    patentCount: number;
    factors: {
      numRelevantPatents: number;
      maxSimilarity: number;
      patentContribution: number;
      similarityContribution: number;
    };
    disclaimer: string;
  };
  similarIdeas: Array<NormalizedSimilarIdea>;
  verdict: string;
  sources: Array<NormalizedSource>;
}

interface NormalizedSection {
  hasData: boolean;
  summary: string;
  evidence: Array<EvidenceItem>;
  metadata: Record<string, any>;
}

interface NormalizedSimilarIdea {
  id: string;
  title: string;
  similarity: number;
  similarityPct: number;
  band: string;
  businessGroup: string;
}

interface EvidenceItem {
  title: string;
  description: string;
  source?: string;
  category?: string;
  score?: number;
}

interface NormalizedSource {
  title: string;
  url: string;
  category: string;
}
```

**Key Functions:**

```typescript
// Main adapter function
export function normalizeMarketValidationReport(
  apiResponse: RawMarketValidationResponse
): NormalizedMarketValidationReport;

// Section normalizers
function normalizeSection(
  sectionData: any,
  sectionType: string
): NormalizedSection;

// Similar ideas normalizer
function normalizeSimilarIdeas(
  ideas: Array<any>
): Array<NormalizedSimilarIdea>;

// Patent risk normalizer
function normalizePatentRisk(
  patentSignals: any
): NormalizedPatentRisk;

// Evidence normalizer
function normalizeEvidence(
  evidence: Array<any>,
  type: string
): Array<EvidenceItem>;
```

### 2. Updated MarketValidation Component

**File:** `components/MarketValidation.tsx`

**Changes:**

1. Remove `parseSection()` function entirely
2. Import and use `normalizeMarketValidationReport()` adapter
3. Update state to use `NormalizedMarketValidationReport` type
4. Update all rendering logic to consume normalized data
5. Add conditional rendering based on `hasData` flags
6. Add visual indicators for data quality

**Key Rendering Patterns:**

```typescript
// Pattern 1: Section with summary
{report.sections.internalPosition.hasData && (
  <div>
    <p>{report.sections.internalPosition.summary}</p>
  </div>
)}

// Pattern 2: Section with evidence list
{report.sections.marketTrends.evidence.length > 0 && (
  <ul>
    {report.sections.marketTrends.evidence.map((item, idx) => (
      <li key={idx}>
        <strong>{item.title}</strong>
        <p>{item.description}</p>
      </li>
    ))}
  </ul>
)}

// Pattern 3: Similar ideas with similarity percentage
{report.similarIdeas.map((idea) => (
  <div key={idea.id}>
    <span>{idea.title}</span>
    <span>{idea.similarityPct}% similar</span>
    <ProgressBar value={idea.similarityPct} />
  </div>
))}

// Pattern 4: Patent risk with factors
<div>
  <h3>{report.patentRisk.level} Risk</h3>
  <p>Score: {report.patentRisk.score}/100</p>
  <p>Patents found: {report.patentRisk.patentCount}</p>
  <p>Patent contribution: {report.patentRisk.factors.patentContribution}</p>
  <p>Similarity contribution: {report.patentRisk.factors.similarityContribution}</p>
</div>
```

### 3. Section Components (Optional Enhancement)

**Purpose:** Break down large MarketValidation component into smaller, focused section components.

**Components:**

- `InternalPositionSection.tsx` - Displays novelty score and similar ideas
- `MarketTrendsSection.tsx` - Displays market trend evidence
- `CompetitorSection.tsx` - Displays competitor landscape
- `PatentRiskSection.tsx` - Displays patent risk assessment
- `OpportunitiesSection.tsx` - Displays opportunities
- `RisksSection.tsx` - Displays risks

Each component receives normalized section data as props and handles its own rendering logic.

## Data Models

### Backend Response Structure (Existing)

The backend already returns the correct structure from `marketValidationSynthesis.js`:

```javascript
{
  fullReport: string,           // Markdown for PDF
  sections: {                   // PRIMARY DATA SOURCE
    internalPosition: {
      summary: string,
      noveltyScore: number,
      similarIdeas: Array<{
        id: string,
        title: string,
        similarity: number,
        similarityPct: number,
        band: string,
        businessGroup: string
      }>
    },
    marketTrends: {
      summary: string,
      trends: Array<{
        title: string,
        summary: string,
        source: string,
        category: string,
        score: number
      }>,
      hasEvidence: boolean
    },
    competitors: {
      summary: string,
      competitors: Array<{
        name: string,
        title: string,
        description: string,
        source: string
      }>,
      competitiveIntensity: string,
      hasEvidence: boolean
    },
    patentRisk: {
      summary: string,
      riskLevel: string,
      score: number,
      patents: Array<{
        title: string,
        abstract: string,
        source: string
      }>,
      hasEvidence: boolean
    },
    opportunities: {
      summary: string,
      hasEvidence: boolean
    },
    risks: {
      summary: string,
      hasEvidence: boolean
    }
  },
  internalAnalysis: { ... },
  externalEvidence: { ... },
  patentSignals: {
    riskLevel: string,
    score: number,
    patents: Array,
    factors: {
      numRelevantPatents: number,
      maxSimilarity: number,
      patentContribution: number,
      similarityContribution: number
    }
  },
  verdict: string,
  sources: Array,
  generatedAt: string
}
```

### Frontend Normalized Structure

The adapter transforms this into a flatter, more UI-friendly structure with explicit field mappings and safe defaults.

## Error Handling

### Data Adapter Error Handling

1. **Missing Fields:** Provide safe defaults (empty strings, empty arrays, 0 values)
2. **Invalid Types:** Log warning and use default value
3. **Null/Undefined:** Check existence before accessing nested properties
4. **Shape Validation:** Validate expected structure and log mismatches

```typescript
function normalizeSection(sectionData: any, sectionType: string): NormalizedSection {
  if (!sectionData) {
    console.warn(`Section ${sectionType} is missing or null`);
    return {
      hasData: false,
      summary: 'No data available',
      evidence: [],
      metadata: {}
    };
  }

  return {
    hasData: Boolean(sectionData.summary || sectionData.evidence?.length),
    summary: sectionData.summary || 'No summary available',
    evidence: normalizeEvidence(sectionData.evidence || [], sectionType),
    metadata: sectionData.metadata || {}
  };
}
```

### Component Error Handling

1. **API Errors:** Display user-friendly error message with retry button
2. **Missing Data:** Show "No data available for this section" instead of crashing
3. **Rendering Errors:** Use React error boundaries to catch and display errors
4. **Validation Errors:** Log to console and render safe fallback

## Testing Strategy

This feature will use both unit tests and property-based tests to ensure comprehensive coverage.

### Unit Tests

Unit tests will verify specific examples and edge cases:

1. **Data Adapter Tests** (`marketValidationAdapter.test.ts`)
   - Test normalization with complete data
   - Test normalization with missing fields
   - Test normalization with null/undefined values
   - Test normalization with invalid types
   - Test safe defaults are applied correctly

2. **Component Tests** (`MarketValidation.test.tsx`)
   - Test rendering with complete report data
   - Test rendering with partial data
   - Test rendering with no data
   - Test similar ideas display with correct percentages
   - Test patent risk display with correct scores
   - Test error states and retry functionality

3. **Integration Tests**
   - Test full flow from API response to rendered UI
   - Test PDF download still works
   - Test regeneration produces consistent results

### Property-Based Tests

Property-based tests will verify universal properties across all inputs. We will use `fast-check` for TypeScript property-based testing, configured to run minimum 100 iterations per test.

Each property test will be tagged with a comment referencing its design document property:
```typescript
// Feature: market-validation-frontend-fix, Property 1: Adapter always returns valid structure
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Data Adapter Always Returns Valid Structure

*For any* raw API response (valid, partial, or malformed), the Data Adapter should return a normalized structure with all required fields present and type-safe values (no undefined, no null in required fields).

**Validates: Requirements 6.2, 6.6, 6.7**

### Property 2: Adapter Preserves Backend Values

*For any* API response containing similarity scores, risk scores, or other calculated metrics, the Data Adapter should preserve these exact values without modification, recalculation, or defaulting to incorrect values like 0.

**Validates: Requirements 2.2, 3.1, 3.2**

### Property 3: Section Data Renders Completely

*For any* section object containing summary, evidence arrays, scores, or metadata fields, the Frontend Component should render all available fields and omit only truly missing fields (not render "No data available" when data exists).

**Validates: Requirements 1.2, 1.3, 1.4, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7**

### Property 4: Evidence Items Render All Fields

*For any* evidence array (market trends, competitors, patents), the Frontend Component should render each item's title, description/summary, source URL as clickable link, and relevance score/category.

**Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

### Property 5: Similar Ideas Display Correct Percentages

*For any* similar ideas array, the Frontend Component should display each idea's title, business group, and similarity percentage using the backend-calculated similarityPct or similarity field, with a visual indicator (progress bar or badge).

**Validates: Requirements 2.1, 2.2, 2.4**

### Property 6: Patent Risk Displays Complete Information

*For any* patent risk data, the Frontend Component should display the risk level, numeric score, patent count, calculation factors (patent contribution, similarity contribution), and disclaimer text without modification.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**

### Property 7: Component Never Uses Regex Parsing

*For any* report data, the Frontend Component should extract all display data from the structured sections object and never call parseSection() or use regex to extract data from the fullReport markdown string.

**Validates: Requirements 1.1, 1.6**

### Property 8: Timestamp Always Displays

*For any* report with a generatedAt field, the Frontend Component should display the timestamp in a human-readable format.

**Validates: Requirements 4.3**

### Property 9: Visual Indicators Match Data

*For any* report, the Frontend Component should display color-coded badges for risk levels (green for Low, yellow for Medium, red for High) and evidence-backed badges when evidence exists.

**Validates: Requirements 8.2, 8.5**

### Property 10: No Crashes or Undefined Renders

*For any* input data (complete, partial, empty, or malformed), the Frontend Component should never crash, throw unhandled errors, or render undefined/null/[object Object] in the UI.

**Validates: Requirements 9.5**

### Property 11: Adapter Handles Missing Fields Gracefully

*For any* API response with missing or null fields, the Data Adapter should provide safe default values (empty strings for text, empty arrays for lists, 0 for numbers, false for booleans) and log warnings for unexpected missing data.

**Validates: Requirements 6.6, 9.4**

### Property 12: Adapter Maps All Section Types

*For any* section type (internalPosition, marketTrends, competitors, patentRisk, opportunities, risks), the Data Adapter should correctly map the section's summary, evidence arrays, scores, and metadata to the normalized structure.

**Validates: Requirements 6.3, 6.4, 6.5**
