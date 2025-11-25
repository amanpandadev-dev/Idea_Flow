
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

export const fetchIdeas = async (): Promise<Idea[]> => {
  const response = await fetch(`${API_URL}/ideas`, {
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
