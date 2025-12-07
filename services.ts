import { Idea, Status, Associate, ExploreFilters } from './types';

const API_URL = '/api';

// Helper to get tokens
const getTokens = () => {
  return {
    accessToken: localStorage.getItem('token'), // Access Token (using 'token' for backward compatibility)
    refreshToken: localStorage.getItem('refreshToken') // Refresh Token
  };
};

// Generic Fetch Wrapper with Auth Handling
const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  // console.log(`[API Request] ${options.method || 'GET'} ${url}`);
  let { accessToken, refreshToken } = getTokens();

  let headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
  };

  try {
    let response = await fetch(url, { ...options, headers });
    // console.log(`[API Response] ${response.status} ${url}`);

    // Handle Token Expiry (401)
    if (response.status === 401 && refreshToken) {
      console.warn(`[API] 401 Unauthorized at ${url}. Attempting refresh...`);
      // Attempt Refresh
      try {
        const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken })
        });

        if (refreshRes.ok) {
          console.log("[API] Token refresh successful. Retrying original request.");
          const data = await refreshRes.json();
          localStorage.setItem('token', data.accessToken); // Update Access Token

          // Retry Original Request
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.accessToken}`
          };
          response = await fetch(url, { ...options, headers });
        } else {
          // Refresh Failed (Exp or Invalid) -> Logout
          console.error("[API] Token refresh failed. Session expired.");
          throw new Error('Session Expired');
        }
      } catch (err) {
        console.error("[API] Error during token refresh:", err);
        throw new Error('Session Expired');
      }
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      if (!response.ok) {
        console.error(`[API Error] ${url}:`, data.msg || 'Request Failed');
        throw new Error(data.msg || 'Request Failed');
      }
      return data;
    } else {
      if (!response.ok) {
        console.error(`[API Error] ${url}: Server Error ${response.status}`);
        throw new Error(`Server Error: ${response.status}`);
      }
      return null;
    }

  } catch (err: any) {
    console.error(`[API Exception] ${url}:`, err.message);
    if (err.message === 'Session Expired') {
      // Trigger global logout if possible, or re-throw for App to handle
      throw err;
    }
    throw err;
  }
};

export const loginUser = async (emp_id: string, password: string) => {
  console.log(`[Service] Logging in user: ${emp_id}`);
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, password }),
  });
  // Login is public, use standard handling
  const data = await response.json();
  if (!response.ok) {
    console.error("[Service] Login failed:", data.msg);
    throw new Error(data.msg || 'Login Failed');
  }
  console.log("[Service] Login successful");
  return data;
};

export const registerUser = async (emp_id: string, name: string, email: string, password: string) => {
  console.log(`[Service] Registering user: ${emp_id}`);
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, name, email, password }),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error("[Service] Registration failed:", data.msg);
    throw new Error(data.msg || 'Registration Failed');
  }
  console.log("[Service] Registration successful");
  return data;
};

export const resetPassword = async (emp_id: string, email: string, password: string) => {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.msg || 'Reset Failed');
  return data;
};

export const fetchCurrentUser = async () => {
  return fetchWithAuth(`${API_URL}/auth/me`);
};

export const fetchIdeas = async (): Promise<Idea[]> => {
  return fetchWithAuth(`${API_URL}/ideas`);
};

export const searchIdeas = async (query: string, filters?: ExploreFilters): Promise<{ results: Idea[], facets: any }> => {
  console.log(`[Service] Searching ideas with query: "${query}"`);
  let url = `${API_URL}/ideas/search?q=${encodeURIComponent(query)}`;

  if (filters) {
    if (filters.themes && filters.themes.length > 0) {
      url += `&themes=${encodeURIComponent(JSON.stringify(filters.themes))}`;
    }
    if (filters.businessGroups && filters.businessGroups.length > 0) {
      url += `&businessGroups=${encodeURIComponent(JSON.stringify(filters.businessGroups))}`;
    }
    if (filters.technologies && filters.technologies.length > 0) {
      url += `&technologies=${encodeURIComponent(JSON.stringify(filters.technologies))}`;
    }
  }

  return fetchWithAuth(url);
};

export const fetchLikedIdeas = async (): Promise<Idea[]> => {
  return fetchWithAuth(`${API_URL}/ideas/liked`);
};

export const fetchBusinessGroups = async (): Promise<string[]> => {
  return fetchWithAuth(`${API_URL}/business-groups`) || [];
};

export const fetchSimilarIdeas = async (id: string): Promise<Idea[]> => {
  return fetchWithAuth(`${API_URL}/ideas/${id}/similar`);
};

export const fetchAssociateDetails = async (associateId: number): Promise<Associate> => {
  return fetchWithAuth(`${API_URL}/associates/${associateId}`);
};

export const updateIdeaStatus = async (id: string, status: Status): Promise<void> => {
  return fetchWithAuth(`${API_URL}/ideas/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
};

export const toggleLikeIdea = async (id: string): Promise<{ liked: boolean }> => {
  return fetchWithAuth(`${API_URL}/ideas/${id}/like`, { method: 'POST' });
};

// Phase-2: Agent Query
export interface AgentResponse {
  answer: string;
  citations: {
    internal: Array<{
      ideaId: string;
      title: string;
      snippet: string;
      domain?: string;
      relevance: number;
    }>;
    external: Array<{
      title: string;
      url: string;
      snippet: string;
    }>;
  };
  reasoning?: string;
  usedEphemeralContext: boolean;
  processingTime: number;
}

export interface AgentSession {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'starting';
  query: string;
  history: string[];
  result: AgentResponse | null;
  error?: string;
  createdAt: number;
  updatedAt: number;
}


/**
 * @deprecated Use session-based functions instead.
 */
export const queryAgent = async (
  userQuery: string,
  embeddingProvider: 'llama' | 'grok',
  filters?: { businessGroups?: string[]; themes?: string[] },
  synergyMode?: boolean
): Promise<AgentResponse> => {
  return fetchWithAuth(`${API_URL}/agent/query`, {
    method: 'POST',
    body: JSON.stringify({ userQuery, embeddingProvider, filters, synergyMode })
  });
};

export const startAgentSession = async (
  userQuery: string,
  embeddingProvider: 'llama' | 'grok',
  filters?: { businessGroups?: string[]; themes?: string[] }
): Promise<{ success: boolean; jobId: string; }> => {
  return fetchWithAuth(`${API_URL}/agent/session`, {
    method: 'POST',
    body: JSON.stringify({ userQuery, embeddingProvider, filters })
  });
};

export const getAgentSessionStatus = async (jobId: string): Promise<AgentSession> => {
  return fetchWithAuth(`${API_URL}/agent/session/${jobId}/status`);
};

export const stopAgentSession = async (jobId: string): Promise<{ success: boolean; message: string; }> => {
  return fetchWithAuth(`${API_URL}/agent/session/${jobId}/stop`, {
    method: 'POST'
  });
};

// Agent History Management
export interface AgentHistoryItem {
  id: string;
  query: string;
  timestamp: number;
  session: AgentSession;
}

export const fetchAgentHistory = async (): Promise<AgentHistoryItem[]> => {
  const response = await fetchWithAuth(`${API_URL}/agent/history`);
  return response.history || [];
};

export const clearAgentHistory = async (): Promise<{ success: boolean; message: string; count: number; }> => {
  return fetchWithAuth(`${API_URL}/agent/history`, {
    method: 'DELETE'
  });
};

export const deleteAgentSession = async (jobId: string): Promise<{ success: boolean; message: string; }> => {
  return fetchWithAuth(`${API_URL}/agent/history/${jobId}`, {
    method: 'DELETE'
  });
};

// Phase-2: Context Upload with RAG enhancements
export interface ContextUploadResponse {
  success: boolean;
  chunksProcessed: number;
  themes: string[];
  keywords?: string[];
  suggestedQuestions?: string[];
  filename?: string;
  ragData?: {
    themes: string[];
    keywords: string[];
    suggestedQuestions: string[];
    topics: string[];
    techStack: string[];
    industry: string[];
  };
  sessionId: string;
  stats: {
    originalLength: number;
    chunkCount: number;
    avgChunkLength: number;
  };
}

export const uploadContext = async (file: File, embeddingProvider: 'llama' | 'grok'): Promise<ContextUploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('embeddingProvider', embeddingProvider);

  const token = localStorage.getItem('token');
  const response = await fetch(`${API_URL}/context/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }

  return response.json();
};

// Phase-2: Reset Context
export const resetContext = async (): Promise<{ success: boolean; message: string }> => {
  return fetchWithAuth(`${API_URL}/context/reset`, {
    method: 'DELETE'
  });
};


// Phase-2: Get Context Status
export interface ContextStatus {
  hasContext: boolean;
  sessionId: string | null;
  userId?: string;
  stats?: {
    sessionId: string;
    documentCount: number;
    collectionName: string;
    themes?: string[];
    keywords?: string[];
    suggestedQuestions?: string[];
    filename?: string;
  };
}

export const getContextStatus = async (): Promise<ContextStatus> => {
  return fetchWithAuth(`${API_URL}/context/status`);
};

// Find ideas matching uploaded document keywords
export interface MatchingIdea extends SemanticSearchResult {
  matchedKeywords?: string[];
}

export interface MatchingIdeasResponse {
  keywords: string[];
  count: number;
  ideas: MatchingIdea[];
}

export const findMatchingIdeas = async (embeddingProvider: 'llama' | 'grok'): Promise<MatchingIdeasResponse> => {
  const data = await fetchWithAuth(`${API_URL}/context/find-matching-ideas`, {
    method: 'POST',
    body: JSON.stringify({ embeddingProvider })
  });
  return {
    keywords: data.keywords || [],
    count: data.count || 0,
    ideas: data.ideas || []
  };
};

// Semantic search for similar idea submissions
export interface SemanticSearchResult {
  id: string;
  title: string;
  description: string;
  team: string;
  tags: string[];
  similarity: number;
  createdAt: string;
  category?: string;
  status?: string;
}

export interface SemanticSearchResponse {
  success: boolean;
  query: string;
  provider: string;
  pagination: {
    currentPage: number;
    pageSize: number;
    totalResults: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startIndex: number;
    endIndex: number;
  };
  minSimilarity: number;
  results: SemanticSearchResult[];
}

export const semanticSearchIdeas = async (
  query: string,
  embeddingProvider: 'llama' | 'grok',
  page: number = 1,
  limit: number = 20,
  minSimilarity: number = 0.3
): Promise<SemanticSearchResponse> => {
  const data = await fetchWithAuth(`${API_URL}/ideas/semantic-search`, {
    method: 'POST',
    body: JSON.stringify({ query, embeddingProvider, page, limit, minSimilarity })
  });
  return data;
};

// ============================================
// Chat History API Functions
// ============================================

export interface ChatSession {
  id: number;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GroupedChatSessions {
  [dateGroup: string]: ChatSession[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    results?: any[];
    filters?: any;
    [key: string]: any;
  };
  timestamp: string;
}

// Get all chat sessions for the current user
export const getChatSessions = async (): Promise<{ sessions: GroupedChatSessions }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions`);
};

// Create a new chat session
export const createChatSession = async (title?: string): Promise<{ session: ChatSession }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions`, {
    method: 'POST',
    body: JSON.stringify({ title })
  });
};

// Get messages for a specific session
export const getChatMessages = async (sessionId: number): Promise<{ messages: ChatMessage[] }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}/messages`);
};

// Add a message to a session
export const addChatMessage = async (
  sessionId: number,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: any
): Promise<{ message: ChatMessage }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content, metadata })
  });
};

// Delete a chat session
export const deleteChatSession = async (sessionId: number): Promise<{ success: boolean }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}`, {
    method: 'DELETE'
  });
};

// Rename a chat session
export const renameChatSession = async (sessionId: number, title: string): Promise<{ session: ChatSession }> => {
  return fetchWithAuth(`${API_URL}/chat/sessions/${sessionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
};
