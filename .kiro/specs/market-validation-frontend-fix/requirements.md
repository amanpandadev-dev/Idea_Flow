# Requirements Document

## Introduction

This specification addresses critical frontend-backend data alignment issues in the Market Validation Report feature. The backend successfully generates structured validation reports with detailed sections, evidence arrays, and deterministic risk calculations, but the frontend fails to properly consume and display this data, resulting in "No data available" messages, incorrect similarity percentages, and unstable patent risk scores.

## Glossary

- **Market_Validation_Report**: A comprehensive analysis document containing internal position analysis, external market evidence, competitor landscape, patent risk assessment, and strategic recommendations
- **Section_Object**: A structured data object returned by the backend containing summary text, evidence arrays, scores, and metadata for a specific report section
- **Data_Adapter**: A frontend layer that transforms backend API responses into UI-safe data structures
- **Similar_Ideas**: Internal ideas with semantic similarity to the target idea, including similarity scores and metadata
- **IP_Risk_Score**: A deterministic calculation (0-100) based on patent count and internal similarity, categorized as Low/Medium/High
- **Evidence_Array**: A collection of structured evidence items (market trends, competitors, patents) with titles, summaries, sources, and relevance scores
- **Frontend_Component**: React TypeScript components that render the Market Validation UI
- **Backend_Service**: Node.js services that generate and structure validation report data

## Requirements

### Requirement 1: Frontend Data Consumption

**User Story:** As a developer, I want the frontend to correctly consume backend section objects, so that all report data displays properly without "No data available" errors.

#### Acceptance Criteria

1. WHEN the backend returns a report with structured sections, THE Frontend_Component SHALL extract data from the sections object, not from fullReport markdown
2. WHEN a section object contains a summary field, THE Frontend_Component SHALL display the summary text
3. WHEN a section object contains evidence arrays, THE Frontend_Component SHALL iterate and display each evidence item
4. WHEN a section object contains score or metadata fields, THE Frontend_Component SHALL display these values
5. IF a section truly has no data (empty arrays, null values), THEN THE Frontend_Component SHALL display "No data available"
6. THE Frontend_Component SHALL NOT use regex parsing on fullReport for section extraction

### Requirement 2: Similar Ideas Display

**User Story:** As a user, I want to see accurate similarity percentages for internal ideas, so that I can assess novelty correctly.

#### Acceptance Criteria

1. WHEN similar ideas exist in the report, THE Frontend_Component SHALL display each idea's title, description, and business group
2. WHEN displaying similarity percentage, THE Frontend_Component SHALL use the backend-calculated similarityPct or similarity field
3. THE Frontend_Component SHALL NOT default similarity to 0% or calculate it independently
4. WHEN rendering similarity, THE Frontend_Component SHALL display a visual indicator (progress bar, badge, or percentage)
5. WHEN no similar ideas exist, THE Frontend_Component SHALL display a message indicating high novelty

### Requirement 3: Patent Risk Stability

**User Story:** As a user, I want patent risk scores to remain consistent across regenerations, so that I can trust the assessment.

#### Acceptance Criteria

1. THE Frontend_Component SHALL display the backend-calculated IP risk level (Low/Medium/High)
2. THE Frontend_Component SHALL display the backend-calculated IP risk score (0-100)
3. THE Frontend_Component SHALL NOT recalculate or modify risk scores
4. WHEN displaying patent risk, THE Frontend_Component SHALL show the number of relevant patents found
5. WHEN displaying patent risk, THE Frontend_Component SHALL include the risk calculation factors (patent contribution, similarity contribution)
6. THE Frontend_Component SHALL display the IP risk disclaimer text

### Requirement 4: Report Determinism

**User Story:** As a user, I want report regeneration to produce consistent results, so that the feature feels reliable and trustworthy.

#### Acceptance Criteria

1. WHEN a user regenerates a report, THE Backend_Service SHALL reuse stored evidence when available
2. WHEN evidence is reused, THE Backend_Service SHALL produce structurally consistent output
3. THE Frontend_Component SHALL display a timestamp showing when the report was generated
4. WHEN displaying cached vs fresh data, THE Frontend_Component SHALL indicate the data source
5. THE Backend_Service SHALL only re-run external searches if explicitly forced by a user action

### Requirement 5: Section Rendering Completeness

**User Story:** As a user, I want all report sections to display meaningful content, so that I get comprehensive market intelligence.

#### Acceptance Criteria

1. WHEN the Internal Position section has data, THE Frontend_Component SHALL display novelty score, summary text, and similar ideas list
2. WHEN the Market Trends section has data, THE Frontend_Component SHALL display summary text and trend count
3. WHEN the Competitor Landscape section has data, THE Frontend_Component SHALL display competitive intensity, summary text, and competitor count
4. WHEN the Patent Risk section has data, THE Frontend_Component SHALL display risk level, score, summary text, and patent count
5. WHEN the Opportunities section has data, THE Frontend_Component SHALL display summary text
6. WHEN the Risks section has data, THE Frontend_Component SHALL display summary text
7. IF a section has partial data, THE Frontend_Component SHALL display available fields and omit missing fields
8. THE Frontend_Component SHALL NOT stringify objects directly into JSX

### Requirement 6: Data Adapter Layer

**User Story:** As a developer, I want a single adapter function that normalizes API responses, so that UI components consume consistent data shapes.

#### Acceptance Criteria

1. THE Data_Adapter SHALL accept raw API response as input
2. THE Data_Adapter SHALL return a UI-safe data structure with explicit field mappings
3. THE Data_Adapter SHALL map section.summary to displayable text
4. THE Data_Adapter SHALL map section.evidence arrays to displayable lists
5. THE Data_Adapter SHALL map section.score and section.metadata to displayable values
6. THE Data_Adapter SHALL handle missing or null fields gracefully with default values
7. THE Data_Adapter SHALL validate data shapes before passing to UI components
8. ALL Frontend_Components SHALL consume data from the Data_Adapter output, not raw API responses

### Requirement 7: Evidence Display

**User Story:** As a user, I want to see detailed evidence for each section, so that I can verify the analysis.

#### Acceptance Criteria

1. WHEN market trends exist, THE Frontend_Component SHALL display each trend's title and summary
2. WHEN competitors exist, THE Frontend_Component SHALL display each competitor's name and description
3. WHEN patents exist, THE Frontend_Component SHALL display each patent's title and abstract
4. WHEN displaying evidence items, THE Frontend_Component SHALL include source URLs as clickable links
5. WHEN displaying evidence items, THE Frontend_Component SHALL show relevance scores or categories
6. THE Frontend_Component SHALL support expand/collapse for evidence lists

### Requirement 8: Visual Enhancements

**User Story:** As a user, I want clear visual indicators for data quality and confidence, so that I can assess report reliability.

#### Acceptance Criteria

1. WHEN displaying sections, THE Frontend_Component SHALL show confidence indicators where available
2. WHEN evidence is present, THE Frontend_Component SHALL display "Evidence-backed" badges
3. WHEN displaying the report, THE Frontend_Component SHALL show the generation timestamp
4. WHEN displaying similarity scores, THE Frontend_Component SHALL use progress bars or visual indicators
5. WHEN displaying risk levels, THE Frontend_Component SHALL use color-coded badges (green/yellow/red)
6. THE Frontend_Component SHALL support expand/collapse for long sections

### Requirement 9: Error Handling

**User Story:** As a user, I want clear error messages when data is unavailable, so that I understand what went wrong.

#### Acceptance Criteria

1. WHEN the API returns an error, THE Frontend_Component SHALL display a user-friendly error message
2. WHEN a section has no data, THE Frontend_Component SHALL display "No data available for this section"
3. WHEN the entire report fails to load, THE Frontend_Component SHALL display a retry button
4. WHEN data shape validation fails, THE Data_Adapter SHALL log the error and return safe defaults
5. THE Frontend_Component SHALL NOT crash or show undefined/null in the UI

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want changes to maintain existing functionality, so that PDF generation and database storage continue working.

#### Acceptance Criteria

1. THE Backend_Service SHALL continue generating fullReport markdown for PDF generation
2. THE Backend_Service SHALL continue saving reports to the database
3. THE Backend_Service SHALL NOT change the database schema
4. THE Frontend_Component SHALL NOT break PDF download functionality
5. THE Data_Adapter SHALL work with existing API response structure without backend changes
