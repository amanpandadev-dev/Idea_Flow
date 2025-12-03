/**
 * Request Validation Middleware
 * Validates and sanitizes incoming request data
 */

import { AppError } from './errorHandler.js';

// Validate login request
export const validateLogin = (req, res, next) => {
  const { emp_id, password } = req.body;

  if (!emp_id || typeof emp_id !== 'string' || emp_id.trim().length === 0) {
    throw new AppError('Employee ID is required', 400);
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new AppError('Password must be at least 6 characters', 400);
  }

  // Sanitize
  req.body.emp_id = emp_id.trim();
  next();
};

// Validate registration request
export const validateRegistration = (req, res, next) => {
  const { emp_id, name, email, password } = req.body;

  if (!emp_id || typeof emp_id !== 'string' || emp_id.trim().length === 0) {
    throw new AppError('Employee ID is required', 400);
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new AppError('Name is required', 400);
  }

  if (!email || typeof email !== 'string' || !isValidEmail(email)) {
    throw new AppError('Valid email is required', 400);
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  // Sanitize
  req.body.emp_id = emp_id.trim();
  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

// Validate search query
export const validateSearch = (req, res, next) => {
  const { q, query } = req.query;
  const searchQuery = q || query;

  if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
    throw new AppError('Search query is required', 400);
  }

  if (searchQuery.length > 500) {
    throw new AppError('Search query too long (max 500 characters)', 400);
  }

  next();
};

// Validate agent query
export const validateAgentQuery = (req, res, next) => {
  const { userQuery, embeddingProvider } = req.body;

  if (!userQuery || typeof userQuery !== 'string' || userQuery.trim().length === 0) {
    throw new AppError('User query is required', 400);
  }

  if (userQuery.length > 1000) {
    throw new AppError('Query too long (max 1000 characters)', 400);
  }

  if (embeddingProvider && !['llama', 'grok'].includes(embeddingProvider)) {
    throw new AppError('Invalid embedding provider. Must be "llama" or "grok"', 400);
  }

  next();
};

// Validate idea ID
export const validateIdeaId = (req, res, next) => {
  const { id } = req.params;

  if (!id || typeof id !== 'string') {
    throw new AppError('Invalid idea ID', 400);
  }

  // Check if it's in IDEA-XXX format or numeric
  const numericId = id.replace('IDEA-', '');
  if (!/^\d+$/.test(numericId)) {
    throw new AppError('Invalid idea ID format', 400);
  }

  next();
};

// Helper: Email validation
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Sanitize string input (prevent XSS)
export const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
};

export default {
  validateLogin,
  validateRegistration,
  validateSearch,
  validateAgentQuery,
  validateIdeaId,
  sanitizeString
};
