# Requirements Document

## Introduction

This document specifies the requirements for a Natural Language Query Understanding (NL-QU) system that enables users to search for ideas using conversational, natural language queries. The system interprets user intent, handles multi-turn conversations with cumulative filtering, performs spell correction and synonym expansion, and returns semantically relevant ideas from the database using Ollama embeddings (nomic-embed-text, 768 dimensions) and vector search.

## Glossary

- **NL-QU System**: The Natural Language Query Understanding system that processes user queries
- **Query Parser**: Component that extracts structured filters from natural language input
- **Synonym Dictionary**: A mapping of terms to their synonyms and related concepts (e.g., "blockchain" → ["distributed ledger technology", "DLT", "decentralized ledger"])
- **Spell Corrector**: Component that detects and corrects spelling errors in user queries
- **Conversation Context**: Accumulated state of filters and constraints across multiple conversation turns
- **Semantic Vector Search**: Search technique using embedding vectors to find semantically similar content
- **nomic-embed-text**: Ollama embedding model producing 768-dimensional vectors
- **Filter Accumulator**: Logic that combines filters from multiple turns using AND semantics
- **Business Group (BG)**: Organizational unit classification for ideas (e.g., Retail, Healthcare)
- **Theme**: High-level categorization of ideas (e.g., "AI for Cybersecurity", "Agentic AI")
- **Tech Stack**: Technologies associated with an idea (e.g., Java, React, Python)

## Requirements

### Requirement 1: Natural Language Query Parsing

**User Story:** As a user, I want to enter natural language queries like "Ideas related to blockchain" or "Ideas related to anti-money laundering from year 2024", so that I can find relevant ideas without learning a specific query syntax.

#### Acceptance Criteria

1. WHEN a user submits a natural language query containing domain keywords THEN the NL-QU System SHALL extract the domain/topic terms and use them for semantic search
2. WHEN a user submits a query containing year filters (e.g., "from year 2024", "in 2023") THEN the NL-QU System SHALL extract the year value and apply it as a metadata filter
3. WHEN a user submits a query containing business group references (e.g., "bg Retail", "business group Healthcare") THEN the NL-QU System SHALL extract the business group and apply it as a metadata filter
4. WHEN a user submits a query containing technology references (e.g., "techstack Java", "using React") THEN the NL-QU System SHALL extract the technology terms and apply them as filters
5. WHEN a user submits a query containing theme references (e.g., "theme AI for Cybersecurity") THEN the NL-QU System SHALL extract the theme and apply it as a metadata filter

### Requirement 2: Spell Correction and Query Normalization

**User Story:** As a user, I want the system to understand my queries even when I make spelling mistakes, so that I can find relevant ideas without worrying about typos.

#### Acceptance Criteria

1. WHEN a user submits a query with misspelled keywords (e.g., "blockchan" instead of "blockchain") THEN the NL-QU System SHALL detect the spelling error and correct it before processing
2. WHEN the NL-QU System corrects a spelling error THEN the NL-QU System SHALL store both the original and corrected terms in the conversation context
3. WHEN a user submits a query with abbreviations (e.g., "AML" for "anti-money laundering") THEN the NL-QU System SHALL expand the abbreviation to its full form
4. WHEN the NL-QU System processes a query THEN the NL-QU System SHALL normalize the query text by converting to lowercase and removing extraneous punctuation

### Requirement 3: Synonym Expansion

**User Story:** As a user, I want the system to find ideas related to my search terms even when different terminology is used, so that I don't miss relevant results due to vocabulary differences.

#### Acceptance Criteria

1. WHEN a user searches for "blockchain" THEN the NL-QU System SHALL expand the search to include synonyms such as "distributed ledger technology", "DLT", and "decentralized ledger"
2. WHEN a user searches for "anti-money laundering" THEN the NL-QU System SHALL expand the search to include synonyms such as "AML", "financial crime prevention", and "transaction monitoring"
3. WHEN the NL-QU System expands a query with synonyms THEN the NL-QU System SHALL store all expanded terms in the conversation context
4. WHEN the NL-QU System performs synonym expansion THEN the NL-QU System SHALL use the expanded terms for both semantic embedding generation and keyword matching

### Requirement 4: Multi-Turn Conversation with Cumulative Filtering

**User Story:** As a user, I want to refine my search across multiple conversation turns, so that I can progressively narrow down results without repeating previous filters.

#### Acceptance Criteria

1. WHEN a user provides a follow-up query in the same conversation session THEN the NL-QU System SHALL combine the new filters with existing filters using AND logic
2. WHEN a user provides filters across multiple turns (e.g., Turn 1: "anti-money laundering", Turn 2: "techstack Java and React", Turn 3: "year 2024", Turn 4: "bg Retail and theme AI for Cybersecurity") THEN the NL-QU System SHALL return ideas matching ALL accumulated filters
3. WHEN a user explicitly requests to reset filters (e.g., "start over", "new search") THEN the NL-QU System SHALL clear all accumulated filters and start a fresh context
4. WHEN a conversation session exceeds 30 minutes of inactivity THEN the NL-QU System SHALL automatically reset the conversation context

### Requirement 5: Conversation Context Storage

**User Story:** As a user, I want my search context to be preserved during a session, so that I can continue refining my search without losing previous context.

#### Acceptance Criteria

1. WHEN a user initiates a search session THEN the NL-QU System SHALL create a conversation context record storing session ID, user ID, and timestamp
2. WHEN the NL-QU System processes a query THEN the NL-QU System SHALL store the original query, corrected query, expanded terms, and extracted filters in the conversation context
3. WHEN the NL-QU System returns search results THEN the NL-QU System SHALL store the top 50 idea IDs in the conversation context for reference
4. WHEN the NL-QU System stores conversation context THEN the NL-QU System SHALL persist the data to the database with the following schema: session_id, user_id, messages (array), accumulated_filters (JSON), result_ids (array), created_at, updated_at

### Requirement 6: Semantic Vector Search Integration

**User Story:** As a user, I want the system to find semantically related ideas even when exact keywords don't match, so that I can discover relevant ideas using natural language.

#### Acceptance Criteria

1. WHEN the NL-QU System processes a search query THEN the NL-QU System SHALL generate a 768-dimensional embedding vector using the nomic-embed-text model via Ollama
2. WHEN the NL-QU System performs semantic search THEN the NL-QU System SHALL combine the synthesized query (original + expanded terms) into a single embedding for vector similarity search
3. WHEN the NL-QU System retrieves candidate ideas THEN the NL-QU System SHALL apply metadata filters (year, business group, theme, tech stack) to narrow results
4. WHEN the NL-QU System ranks results THEN the NL-QU System SHALL use a hybrid scoring approach combining vector similarity and keyword matching scores

### Requirement 7: Search Result Presentation

**User Story:** As a user, I want to see the most relevant ideas matching my query, so that I can quickly find what I'm looking for.

#### Acceptance Criteria

1. WHEN the NL-QU System completes a search THEN the NL-QU System SHALL return ideas sorted by relevance score in descending order
2. WHEN the NL-QU System returns results THEN the NL-QU System SHALL include the match score, title, description, business group, theme, and tech stack for each idea
3. WHEN the NL-QU System returns results THEN the NL-QU System SHALL limit the response to the top 50 most relevant ideas
4. WHEN the NL-QU System returns results THEN the NL-QU System SHALL include metadata showing the active filters, corrected query terms, and expanded synonyms used

### Requirement 8: Query Understanding Feedback

**User Story:** As a user, I want to see how the system interpreted my query, so that I can understand why certain results were returned and adjust my search if needed.

#### Acceptance Criteria

1. WHEN the NL-QU System processes a query THEN the NL-QU System SHALL return a structured interpretation showing extracted filters, corrected terms, and expanded synonyms
2. WHEN the NL-QU System corrects spelling errors THEN the NL-QU System SHALL indicate the original term and the corrected term in the response
3. WHEN the NL-QU System applies synonym expansion THEN the NL-QU System SHALL list all synonyms used in the search in the response metadata
4. WHEN the NL-QU System applies cumulative filters THEN the NL-QU System SHALL display the complete set of active filters from all conversation turns

