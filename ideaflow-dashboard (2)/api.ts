
import { Idea, Status } from './types';

const API_URL = 'http://localhost:3001/api';

export const fetchIdeas = async (): Promise<Idea[]> => {
  const response = await fetch(`${API_URL}/ideas`);
  if (!response.ok) {
    throw new Error('Failed to fetch ideas');
  }
  return response.json();
};

export const updateIdeaStatus = async (id: string, status: Status): Promise<void> => {
  const response = await fetch(`${API_URL}/ideas/${id}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!response.ok) {
    throw new Error('Failed to update status');
  }
};
