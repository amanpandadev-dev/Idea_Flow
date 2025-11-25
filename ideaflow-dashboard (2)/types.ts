
export enum Domain {
  AI_INDUSTRY = 'AI for Industry',
  AI_SERVICE = 'Ai in service line',
  AI_ORG = 'AI for Organization',
  VIRTUAL_WORKERS = 'Virtual workers/copilots',
  EDGE_AI = 'edge AI',
  AGENTS_API = 'agents and APIs',
  CLASSICAL_AI = 'classical AI/ML/DL for prediction/ recommendations etc',
  GEN_AI = 'GenAI & its techniques',
  MULTI_MODAL_UX = 'multi-modela UX',
  AGENTIC_AI = 'Agentic AI',
  ORCHESTRATION = 'Orchestration & MCP',
  DEEP_TECH = 'Deep tech research',
  AI_CREATIVE = 'AI for creative',
  OPEN_SOURCE = 'Open source/ open weight models',
  PROPRIETARY = 'Proprietary models',
  PARTNER_SOLUTIONS = 'Pre-built partner solution(e.g., Omniverse, COSMOS, Agentforce, NOW Assist)',
  RESPONSIBLE_AI = 'Responsible AI',
  AI_DATA = 'AI for Data & Data for AI',
  CYBERSECURITY_AI = 'AI for Cybersecurity & CyberSecurity for AI',
  FINOPS_AI = 'Finops for AI',
  AI_SE_LIFECYCLE = 'AI in software engineering lifecycle',
  AI_ACCESSIBILITY = 'AI for accessibility'
}

export enum Status {
  SUBMITTED = 'Submitted',
  IN_REVIEW = 'In Review',
  IN_DEVELOPMENT = 'In Development',
  IN_PRODUCTION = 'In Production',
  REJECTED = 'Rejected'
}

export enum BusinessGroup {
  RETAIL = 'Global Retail & CPG',
  FINANCE = 'Banking & Financial Services',
  HEALTHCARE = 'Healthcare & Life Sciences',
  MANUFACTURING = 'Manufacturing & Logistics',
  TECH = 'Technology & Media',
  CORP = 'Corporate Functions (HR, Legal, Finance)'
}

export enum BuildType {
  NEW_SOLUTION = 'New Solution / IP',
  ENHANCEMENT = 'Enhancement / Extension',
  POC = 'Proof of Concept (POC)',
  PROCESS_IMPROVEMENT = 'Process Improvement'
}

export interface Associate {
  associate_id: number;
  account: string;
  location: string;
  parent_ou: string;
  business_group: string;
}

export interface Idea {
  id: string; // Display ID (e.g., IDEA-101)
  dbId: number; // Actual DB ID
  title: string;
  description: string;
  domain: Domain;
  status: Status;
  businessGroup: BusinessGroup; // From Ideas Table
  buildType: BuildType;
  technologies: string[];
  submissionDate: string; // ISO String
  
  // Associate Info mapped from DB
  associateId: number; 
  associateAccount: string; // Used for display instead of Name
  associateBusinessGroup: string; // From Associates Table (via Idea Team/Associates)
  
  // Metrics
  score: number; // Actual score from DB (Mapped to 'score' column)
  likesCount: number;
  isLiked: boolean;
  
  // AI Analysis Fields (Optional/Computed)
  futureScope?: string;
  impactScore?: number;      // 1-10
  confidenceScore?: number;  // 1-10
  feasibilityScore?: number; // 1-10
}

export interface ChartDataPoint {
  name: string;
  value: number;
  color?: string;
}
