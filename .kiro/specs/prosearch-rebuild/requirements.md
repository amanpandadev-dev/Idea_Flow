# Requirements Document

## Introduction

This document specifies the requirements for rebuilding the ProSearch backend as a conversational semantic search system. The system enables users to perform semantic searches on innovation ideas stored in a database, with subsequent conversational refinement through deterministic filtering. The core principle is stability and determinism: vector search happens once per conversation, and all follow-up interactions apply strict filters to narrow results without re-running semantic searches.

## Glossary

- **ProSearch System**: The conversational semantic search system that allows users to search and filter innovation ideas
- **ChromaDB**: The vector database used for semantic similarity search
- **PostgreSQL**: The relational database used for conversation state persistence and idea storage
- **Conversation**: A stateful search session identified by a unique conversation_id
- **Base Search**: The initial hybrid search performed when a conversation begins, combining semantic and keyword matching
- **Base Result Set**: The complete set of idea IDs returned from the initial hybrid search
- **Current Result Set**: The filtered subset of the base result set after applying user filters
- **Filter**: A deterministic criterion (technology, business group, theme, year) used to narrow search results
- **Idea Card**: A structured representation of an innovation idea with metadata
- **Filter Extractor**: A deterministic, rule-based service that parses user messages to extract filter criteria
- **Hybrid Search**: A search strategy that combines semantic similarity (vector search) with keyword matching (full-text search) using weighted scoring
- **Semantic Score**: A normalized score (0-1) representing vector similarity from ChromaDB
- **Keyword Score**: A normalized score (0-1) representing keyword match relevance from PostgreSQL full-text search
- **Match Type**: Classification of how an idea matched the query (hybrid, semantic-only, keyword-only)
- **Keyword Extractor**: A service that extracts meaningful content words from user queries for keyword matching

## Requirements

### Requirement 1

**User Story:** As a user, I want to initiate a hybrid search conversation with a natural language query, so that I can discover relevant innovation ideas based on both semantic similarity and keyword matching.

#### Acceptance Criteria

1. WHEN a user sends a message with conversationId null THEN the ProSearch System SHALL perform exactly one hybrid search combining semantic and keyword matching
2. WHEN performing hybrid search THEN the ProSearch System SHALL execute semantic search via ChromaDB and keyword search via PostgreSQL in parallel
3. WHEN the initial hybrid search completes THEN the ProSearch System SHALL store the base query text and base result IDs in PostgreSQL
4. WHEN the initial search completes THEN the ProSearch System SHALL return a new conversation_id to the client
5. WHEN the initial search completes THEN the ProSearch System SHALL return the complete set of matching ideas with metadata including matchType
6. WHEN embedding the user query THEN the ProSearch System SHALL use the same embedding model configured for ChromaDB indexing

### Requirement 2

**User Story:** As a user, I want to refine my search results through follow-up messages, so that I can narrow down to the most relevant ideas without losing my original search context.

#### Acceptance Criteria

1. WHEN a user sends a message with an existing conversationId THEN the ProSearch System SHALL NOT perform a new semantic search
2. WHEN processing a follow-up message THEN the ProSearch System SHALL extract filters from the message using deterministic rules
3. WHEN filters are extracted THEN the ProSearch System SHALL apply them to the base result set using AND logic
4. WHEN filters are applied THEN the ProSearch System SHALL update the current result IDs in PostgreSQL
5. WHEN no results match the applied filters THEN the ProSearch System SHALL return an empty array

### Requirement 3

**User Story:** As a user, I want my search results to remain stable across page refreshes and navigation, so that I can reliably return to my search context.

#### Acceptance Criteria

1. WHEN a user refreshes the page with an active conversationId THEN the ProSearch System SHALL return the exact same current result set
2. WHEN a user navigates away and returns to a conversation THEN the ProSearch System SHALL restore results instantly from PostgreSQL
3. WHEN retrieving conversation state THEN the ProSearch System SHALL fetch results using stored current_result_ids
4. WHEN hydrating results THEN the ProSearch System SHALL preserve the order specified in current_result_ids
5. WHEN multiple requests are made for the same conversation state THEN the ProSearch System SHALL return identical results

### Requirement 4

**User Story:** As a developer, I want a deterministic filter extraction system, so that user intent is parsed consistently without AI-based guessing.

#### Acceptance Criteria

1. WHEN parsing a user message THEN the Filter Extractor SHALL use rule-based pattern matching without LLM inference
2. WHEN extracting technologies THEN the Filter Extractor SHALL identify known technology names from a predefined list
3. WHEN extracting business groups THEN the Filter Extractor SHALL identify known business group names from a predefined list
4. WHEN extracting themes THEN the Filter Extractor SHALL identify known theme names from a predefined list
5. WHEN extracting years THEN the Filter Extractor SHALL identify year values between 2021 and 2025
6. WHEN control words are detected THEN the Filter Extractor SHALL determine the filter mode as ADD, REMOVE, or REPLACE
7. WHEN filter extraction completes THEN the Filter Extractor SHALL return a structured object with arrays for each filter type and a mode

### Requirement 5

**User Story:** As a user, I want filters to strictly narrow my results using AND logic, so that I only see ideas that match all specified criteria.

#### Acceptance Criteria

1. WHEN multiple filter types are applied THEN the ProSearch System SHALL combine them using AND logic
2. WHEN a technology filter is applied THEN the ProSearch System SHALL return only ideas containing that technology
3. WHEN a business group filter is applied THEN the ProSearch System SHALL return only ideas from that business group
4. WHEN a theme filter is applied THEN the ProSearch System SHALL return only ideas matching that theme
5. WHEN a year filter is applied THEN the ProSearch System SHALL return only ideas from that year
6. WHEN filters produce no matches THEN the ProSearch System SHALL return an empty result set without fallback results

### Requirement 6

**User Story:** As a developer, I want conversation state persisted in a single PostgreSQL table, so that the system architecture remains simple and maintainable.

#### Acceptance Criteria

1. WHEN storing conversation state THEN the ProSearch System SHALL use a single prosearch_conversations table
2. WHEN creating a new conversation THEN the ProSearch System SHALL store conversation_id, base_query, base_result_ids, current_result_ids, applied_filters, created_at, and updated_at
3. WHEN updating a conversation THEN the ProSearch System SHALL update current_result_ids, applied_filters, and updated_at
4. WHEN storing result IDs THEN the ProSearch System SHALL store only integer idea_ids, not full documents
5. WHEN storing filters THEN the ProSearch System SHALL use JSONB format for the applied_filters column

### Requirement 7

**User Story:** As a user, I want to receive search results with complete metadata, so that I can evaluate ideas effectively.

#### Acceptance Criteria

1. WHEN returning results THEN the ProSearch System SHALL include title, summary, theme, business_group, technologies, year, and matchScore for each idea
2. WHEN hydrating results THEN the ProSearch System SHALL fetch full idea records from PostgreSQL using idea_ids
3. WHEN ordering results THEN the ProSearch System SHALL preserve the order from current_result_ids
4. WHEN calculating matchScore THEN the ProSearch System SHALL derive it from the initial semantic search ranking
5. WHEN formatting technologies THEN the ProSearch System SHALL return the complete list of technologies for each idea

### Requirement 8

**User Story:** As a developer, I want a single API endpoint for all ProSearch interactions, so that the client integration remains simple.

#### Acceptance Criteria

1. WHEN implementing the API THEN the ProSearch System SHALL expose a single POST endpoint at /api/prosearch/chat
2. WHEN receiving a request THEN the ProSearch System SHALL accept conversationId (null or UUID) and message (string)
3. WHEN returning a response THEN the ProSearch System SHALL include conversationId, results array, appliedFilters object, and isNewBaseSearch boolean
4. WHEN an error occurs THEN the ProSearch System SHALL return appropriate HTTP status codes and error messages
5. WHEN validating requests THEN the ProSearch System SHALL reject invalid conversationId formats and empty messages

### Requirement 9

**User Story:** As a system architect, I want the vector search to execute exactly once per conversation, so that the system remains performant and deterministic.

#### Acceptance Criteria

1. WHEN a conversation exists THEN the ProSearch System SHALL NOT re-embed user messages
2. WHEN a conversation exists THEN the ProSearch System SHALL NOT query ChromaDB for follow-up messages
3. WHEN base_result_ids exist for a conversation THEN the ProSearch System SHALL use only filter operations
4. WHEN processing follow-ups THEN the ProSearch System SHALL operate exclusively on the base result set
5. WHEN a new conversation is created THEN the ProSearch System SHALL perform exactly one ChromaDB query

### Requirement 10

**User Story:** As a user, I want my conversations to remain isolated from each other, so that filters and results from one search do not affect another.

#### Acceptance Criteria

1. WHEN switching between conversations THEN the ProSearch System SHALL return results specific to each conversation_id
2. WHEN applying filters in one conversation THEN the ProSearch System SHALL NOT affect other conversations
3. WHEN retrieving conversation state THEN the ProSearch System SHALL use conversation_id as the sole identifier
4. WHEN creating a new conversation THEN the ProSearch System SHALL generate a unique UUID
5. WHEN conversations are concurrent THEN the ProSearch System SHALL maintain separate state for each conversation_id

### Requirement 11

**User Story:** As a user, I want search results that combine both keyword matching and semantic similarity, so that I can find ideas that contain specific terms as well as conceptually related ideas.

#### Acceptance Criteria

1. WHEN performing a hybrid search THEN the ProSearch System SHALL combine semantic scores and keyword scores using weighted formula
2. WHEN calculating hybrid scores THEN the ProSearch System SHALL use the formula: final_score = (0.6 × semantic_score) + (0.4 × keyword_score)
3. WHEN semantic search returns results THEN the ProSearch System SHALL normalize scores to 0-1 range based on ranking position
4. WHEN keyword search returns results THEN the ProSearch System SHALL normalize PostgreSQL full-text search scores to 0-1 range
5. WHEN merging results THEN the ProSearch System SHALL deduplicate ideas appearing in both result sets and use the combined score
6. WHEN ordering final results THEN the ProSearch System SHALL sort by final_score in descending order

### Requirement 12

**User Story:** As a user, I want to know whether each result matched my query through keywords, semantic similarity, or both, so that I can understand the relevance of each idea.

#### Acceptance Criteria

1. WHEN an idea appears in both semantic and keyword results THEN the ProSearch System SHALL classify it as matchType "hybrid"
2. WHEN an idea appears only in semantic results THEN the ProSearch System SHALL classify it as matchType "semantic"
3. WHEN an idea appears only in keyword results THEN the ProSearch System SHALL classify it as matchType "keyword"
4. WHEN returning results THEN the ProSearch System SHALL include matchType field for each idea
5. WHEN returning results THEN the ProSearch System SHALL include semanticScore and keywordScore fields for transparency

### Requirement 13

**User Story:** As a developer, I want keywords automatically extracted from user queries, so that keyword search focuses on meaningful content terms without noise.

#### Acceptance Criteria

1. WHEN extracting keywords from a query THEN the Keyword Extractor SHALL remove common stop words
2. WHEN extracting keywords THEN the Keyword Extractor SHALL remove terms already identified as filters
3. WHEN extracting keywords THEN the Keyword Extractor SHALL preserve meaningful content words and technical terms
4. WHEN no keywords remain after extraction THEN the Keyword Extractor SHALL return an empty array
5. WHEN keywords are extracted THEN the Keyword Extractor SHALL return them as an array of lowercase strings

### Requirement 14

**User Story:** As a user, I want keyword matching to be flexible and forgiving, so that variations of terms still produce relevant matches.

#### Acceptance Criteria

1. WHEN performing keyword search THEN the ProSearch System SHALL use PostgreSQL full-text search with fuzzy matching
2. WHEN matching keywords THEN the ProSearch System SHALL apply stemming to match word variations
3. WHEN searching for keywords THEN the ProSearch System SHALL search across title, summary, and technologies fields
4. WHEN multiple keywords are provided THEN the ProSearch System SHALL use OR logic for keyword matching
5. WHEN ranking keyword matches THEN the ProSearch System SHALL use PostgreSQL ts_rank for relevance scoring

### Requirement 15

**User Story:** As a system architect, I want hybrid search to execute efficiently, so that the system remains performant under load.

#### Acceptance Criteria

1. WHEN performing hybrid search THEN the ProSearch System SHALL execute semantic and keyword searches in parallel
2. WHEN keyword search completes THEN the ProSearch System SHALL limit results to a maximum of 300 matches
3. WHEN semantic search completes THEN the ProSearch System SHALL limit results to a maximum of 300 matches
4. WHEN merging results THEN the ProSearch System SHALL complete deduplication and scoring within 100ms
5. WHEN total hybrid search time exceeds 1000ms THEN the ProSearch System SHALL log a performance warning
