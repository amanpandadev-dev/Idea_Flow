
import { Idea, Status, Associate } from './types';

// Use relative path to leverage Vite proxy configured in vite.config.ts
const API_URL = '/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

// Helper to safely handle responses
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type");

  if (contentType && contentType.includes("application/json")) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.msg || data.error || 'API Request Failed');
    }
    return data;
  } else {
    // If response is not JSON (e.g., HTML 404 page), throw a readable error
    if (!response.ok) {
      throw new Error(`Server Error: ${response.status} ${response.statusText}. Please check server logs.`);
    }
    return null; // Should not happen for our API
  }
};

export const loginUser = async (emp_id: string, password: string): Promise<{ token: string, user: any }> => {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, password }),
  });
  return handleResponse(response);
};

export const registerUser = async (emp_id: string, name: string, email: string, password: string): Promise<any> => {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, name, email, password }),
  });
  return handleResponse(response);
};

export const resetPassword = async (emp_id: string, email: string, password: string): Promise<any> => {
  const response = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id, email, password }),
  });
  return handleResponse(response);
};

export const fetchCurrentUser = async (): Promise<any> => {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const fetchIdeas = async (): Promise<Idea[]> => {
  const response = await fetch(`${API_URL}/ideas`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const fetchLikedIdeas = async (): Promise<Idea[]> => {
  const response = await fetch(`${API_URL}/ideas/liked`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const fetchBusinessGroups = async (): Promise<string[]> => {
  const response = await fetch(`${API_URL}/business-groups`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response) || [];
};

export const fetchSimilarIdeas = async (id: string): Promise<Idea[]> => {
  const response = await fetch(`${API_URL}/ideas/${id}/similar`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const fetchAssociateDetails = async (associateId: number): Promise<Associate> => {
  const response = await fetch(`${API_URL}/associates/${associateId}`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const updateIdeaStatus = async (id: string, status: Status): Promise<void> => {
  const response = await fetch(`${API_URL}/ideas/${id}/status`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  return handleResponse(response);
};

export const toggleLikeIdea = async (id: string): Promise<{ liked: boolean }> => {
  const response = await fetch(`${API_URL}/ideas/${id}/like`, {
    method: 'POST',
    headers: getAuthHeaders()
  });
  return handleResponse(response);
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
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
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
  const response = await fetch(`${API_URL}/agent/query`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userQuery, embeddingProvider, filters, synergyMode })
  });
  return handleResponse(response);
};

export const startAgentSession = async (
  userQuery: string,
  embeddingProvider: 'llama' | 'grok',
  filters?: { businessGroups?: string[]; themes?: string[] }
): Promise<{ success: boolean; jobId: string; }> => {
  const response = await fetch(`${API_URL}/agent/session`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ userQuery, embeddingProvider, filters })
  });
  return handleResponse(response);
};

export const getAgentSessionStatus = async (jobId: string): Promise<AgentSession> => {
  const response = await fetch(`${API_URL}/agent/session/${jobId}/status`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

export const stopAgentSession = async (jobId: string): Promise<{ success: boolean; message: string; }> => {
  const response = await fetch(`${API_URL}/agent/session/${jobId}/stop`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Phase-2: Context Upload
export interface ContextUploadResponse {
  success: boolean;
  chunksProcessed: number;
  themes: string[];
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
  return handleResponse(response);
};

// Phase-2: Reset Context
export const resetContext = async (): Promise<{ success: boolean; message: string }> => {
  const response = await fetch(`${API_URL}/context/reset`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return handleResponse(response);
};

// Phase-2: Get Context Status
export interface ContextStatus {
  hasContext: boolean;
  sessionId: string | null;
  stats?: {
    sessionId: string;
    documentCount: number;
    collectionName: string;
  };
}

export const getContextStatus = async (): Promise<ContextStatus> => {
  const response = await fetch(`${API_URL}/context/status`, {
    headers: getAuthHeaders()
  });
  return handleResponse(response);
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
  const response = await fetch(`${API_URL}/context/find-matching-ideas`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ embeddingProvider })
  });
  const data = await handleResponse(response);
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

export const semanticSearchIdeas = async (
  query: string,
  embeddingProvider: 'llama' | 'grok',
  limit: number = 10
): Promise<SemanticSearchResult[]> => {
  const response = await fetch(`${API_URL}/ideas/semantic-search`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ query, embeddingProvider, limit })
  });
  const data = await handleResponse(response);
  return data.results || [];
};

