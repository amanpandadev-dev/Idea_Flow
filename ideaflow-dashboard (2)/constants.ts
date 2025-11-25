
import { Domain, Status, Idea, BusinessGroup, BuildType } from './types';

// Palette for domains to ensure distinctness
export const CHART_COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#a855f7', // Purple
];

// Map domains to colors cyclically
export const DOMAIN_COLORS: Record<string, string> = {};
Object.values(Domain).forEach((domain, index) => {
  DOMAIN_COLORS[domain] = CHART_COLORS[index % CHART_COLORS.length];
});

const NAMES = [
  "Alice Johnson", "Bob Smith", "Charlie Davis", "Diana Evans", "Ethan Hunt",
  "Fiona Gallagher", "George Martin", "Hannah Lee", "Ian Wright", "Jane Doe",
  "Kyle Reese", "Laura Croft", "Mike Ross", "Nancy Drew", "Oscar Isaac",
  "Peter Parker", "Quinn Fabray", "Rachel Green", "Steve Rogers", "Tony Stark",
  "Ursula K.", "Victor Von Doom", "Wanda Maximoff", "Xander Cage", "Yara Greyjoy", "Zack Morris"
];

const TECH_STACKS = [
  "Python", "TensorFlow", "PyTorch", "React", "Node.js", "Kubernetes", "Docker",
  "AWS Lambda", "Azure OpenAI", "Google Gemini", "LangChain", "Pinecone", "MongoDB",
  "PostgreSQL", "Next.js", "TailwindCSS", "Kafka", "Spark", "Hadoop", "Tableau",
  "PowerBI", "Salesforce", "ServiceNow", "UiPath", "Selenium", "FastAPI"
];

const TITLES = [
  "Automated Code Reviewer", "AI-Driven Customer Support", "Micro-Frontend Architecture", 
  "Serverless Image Processing", "Real-time Collaboration Tool", "Blockchain Identity Mgmt",
  "Predictive Maintenance System", "Smart Office IoT", "Legacy Migration Bot", 
  "GraphQL Gateway", "Edge Computing Analytics", "Zero Trust Network Setup",
  "GenAI Content Creator", "Autonomous Supply Chain Agent", "Financial Fraud Detector",
  "Personalized Learning Copilot", "HR Policy Chatbot", "Code Conversion Agent",
  "Accessibility Voice Control", "Green Energy Optimizer", "Retail Shelf Vision",
  "Patient Triage Assistant", "Legal Document Analyzer", "Cyber Threat Hunter"
];

const SCOPES = [
  "Expanding this solution to cover multi-regional deployments and localization support.",
  "Integration with legacy mainframes to ensure backward compatibility while modernizing the UI.",
  "Leveraging advanced predictive models to increase accuracy by another 15% in Q4.",
  "Rolling out a mobile-first version for field agents to enable offline data capture.",
  "Developing a self-service plugin architecture to allow 3rd party developers to extend functionality."
];

// Helper to generate random date within last 12 months
const getRandomDate = () => {
  const start = new Date();
  start.setMonth(start.getMonth() - 12);
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
};

const getRandomSubset = (arr: string[], min: number, max: number) => {
  const shuffled = arr.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.floor(Math.random() * (max - min + 1)) + min);
};

// Helper to generate synthetic data
export const generateMockIdeas = (count: number): Idea[] => {
  const domainKeys = Object.values(Domain);
  const statusKeys = Object.values(Status);
  const bgKeys = Object.values(BusinessGroup);
  const buildKeys = Object.values(BuildType);
  
  return Array.from({ length: count }).map((_, index) => {
    return {
      id: `IDEA-${2024000 + index}`,
      dbId: 2024000 + index,
      title: TITLES[Math.floor(Math.random() * TITLES.length)] + ` (v${Math.floor(Math.random() * 10)})`,
      description: "This is a synthetic description generated for the purpose of the UI mockup. It demonstrates the detailed view capability and provides context for the idea submission.",
      domain: domainKeys[Math.floor(Math.random() * domainKeys.length)],
      status: statusKeys[Math.floor(Math.random() * statusKeys.length)],
      businessGroup: bgKeys[Math.floor(Math.random() * bgKeys.length)],
      buildType: buildKeys[Math.floor(Math.random() * buildKeys.length)],
      technologies: getRandomSubset(TECH_STACKS, 2, 5),
      submissionDate: getRandomDate(),
      associateAccount: NAMES[Math.floor(Math.random() * NAMES.length)],
      associateId: Math.floor(Math.random() * 1000) + 1,
      associateBusinessGroup: bgKeys[Math.floor(Math.random() * bgKeys.length)],
      votes: Math.floor(Math.random() * 150) + 1,
      // Analysis Data
      futureScope: SCOPES[Math.floor(Math.random() * SCOPES.length)],
      impactScore: Math.floor(Math.random() * 5) + 5, // 5-10
      confidenceScore: Math.floor(Math.random() * 5) + 5,
      feasibilityScore: Math.floor(Math.random() * 5) + 5
    };
  });
};

// Generating a larger dataset to make the charts look good
export const INITIAL_DATA = generateMockIdeas(2840);
