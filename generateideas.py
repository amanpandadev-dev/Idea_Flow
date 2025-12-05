import csv
import random
import faker
from datetime import datetime, timedelta

# Set up Faker to generate realistic names and details
fake = faker.Faker()

# Predefined lists for business opportunities and business groups
business_opportunities = [
    "Proprietary models", "AI for Industry", "Orchestration & MCP", "AI for creative", 
    "Finops for AI", "Pre-built partner solution (e.g., Omniverse, COSMOS, Agentforce, NOW Assist)",
    "Responsible AI", "Classical AI/ML/DL for prediction/recommendations", "Agentic AI", 
    "AI for Cybersecurity & CyberSecurity for AI", "Agents and APIs", "AI for Organization", 
    "AI in service line", "Virtual workers/copilots", "Deep tech research", "AI in software engineering lifecycle", 
    "Multi-modal UX", "Edge AI", "AI for Data & Data for AI", "Open source/open weight models", 
    "AI for accessibility", "GenAI & its techniques"
]

business_groups = [
    "Hi-Tech", "Energy, Utilities, Resources & Services (EURS)", "Innovation Labs / R&D", 
    "Centers of Excellence (AI CoE, Cloud CoE, Automation CoE, Cyber CoE)", 
    "Application Development & Maintenance (ADM)", "Cloud, Infrastructure & Security", 
    "Product Engineering & IoT", "Digital Transformation Group", "Public Sector & Government", 
    "Emerging Tech (Quantum / Blockchain / Metaverse / Web3)", "Operations & Delivery Excellence", 
    "Finance & Procurement", "Education & EdTech", "Human Resources (HR)", 
    "Healthcare, Life Sciences & Insurance (HILSI)", "Enterprise Architecture Group", 
    "Enterprise Business Applications (SAP / Oracle / Salesforce / Workday)", 
    "Business Process Management (BPM / BPO)", "Communications, Media & Technology (CMT)", 
    "Business Group", "Travel, Hospitality & Services (THS)", "Manufacturing (MFG)", 
    "Data, AI & Analytics", "Management Consulting", "Automation & AI Ops", "Cybersecurity & Zero Trust", 
    "Retail, Consumer Goods & Logistics (RCL)", "Banking, Financial Services & Insurance (BFSI)", 
    "Sales, Marketing & Alliances"
]

# Create a list of associates (up to 300 associates)
associates = [{"associate_id": i, "name": fake.name(), "role": random.choice(["Developer", "Project Manager"])} for i in range(1, 301)]

# Function to generate random data for the `ideas` table
def generate_idea_data(idea_id):
    submitter_id = random.randint(1, 300)  # Submitter must be an associate
    business_opportunity = random.choice(business_opportunities)
    business_group = random.choice(business_groups)
    title = f"{business_opportunity} for {business_group}"
    summary = f"A groundbreaking idea that leverages {business_opportunity} for {business_group}."
    challenge_opportunity = random.choice(business_opportunities)
    scalability = random.choice(["Highly scalable", "Moderate scalability"])
    novelty = random.choice(["Highly novel", "Moderate novelty"])
    benefits = "Increased productivity, reduced costs"
    risks = "Security concerns, implementation challenges"
    responsible_ai = "Responsible AI practices with transparency"
    additional_info = f"Uses {business_opportunity} techniques."
    prototype_url = f"http://prototype.ai/{fake.slug()}"
    timeline = "6 months"
    success_metrics = "Successful implementation and adoption"
    expected_outcomes = "Increased market share and brand recognition"
    scalability_potential = "High scalability potential for large enterprises"
    business_model = "Subscription-based business model"
    competitive_analysis = "Growing market competition but still fragmented"
    risk_mitigation = "Continuous improvement and monitoring"
    second_file_url = f"http://secondfile.com/{fake.slug()}"
    participation_week = f"Q{random.randint(1, 4)} 2024"
    build_phase = random.choice(["Prototype", "Development", "MVP"])
    build_preference = random.choice(["New Solution / IP", "Existing Solution / IP"])
    code_preference = random.choice(["Python", "AI/ML", "Java", "JavaScript", "Flutter"])
    created_at = fake.date_this_decade()
    updated_at = created_at
    score = random.randint(1, 100)
    
    return [
        idea_id, submitter_id, title, summary, challenge_opportunity, scalability, novelty, benefits, risks, responsible_ai, 
        additional_info, prototype_url, timeline, success_metrics, expected_outcomes, scalability_potential, 
        business_model, competitive_analysis, risk_mitigation, second_file_url, participation_week, 
        build_phase, build_preference, code_preference, created_at, updated_at, business_group, score
    ]

# Generate data for `idea_team` table
def generate_idea_team_data(idea_id):
    role = random.choice(["Developer", "Project Manager"])
    associate_id = random.choice(associates)["associate_id"]
    is_primary = True if random.random() < 0.1 else False  # 10% chance to be primary
    business_group = random.choice(business_groups)
    
    return [idea_id, associate_id, is_primary, role, business_group]

# Generate CSV for `ideas` table
def generate_ideas_csv():
    with open("ideas.csv", mode="w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow([
            "idea_id", "submitter_id", "title", "summary", "challenge_opportunity", "scalability", "novelty", "benefits", "risks", 
            "responsible_ai", "additional_info", "prototype_url", "timeline", "success_metrics", "expected_outcomes", 
            "scalability_potential", "business_model", "competitive_analysis", "risk_mitigation", "second_file_url", 
            "participation_week", "build_phase", "build_preference", "code_preference", "created_at", "updated_at", 
            "business_group", "score"
        ])
        for idea_id in range(1, 5001):  # Generating 5000 ideas
            writer.writerow(generate_idea_data(idea_id))

# Generate CSV for `idea_team` table
def generate_idea_team_csv():
    with open("idea_team.csv", mode="w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["idea_id", "associate_id", "is_primary", "role", "business_group"])
        
        # Idea ids start from 1 to 5000 (matching the ideas table)
        for idea_id in range(1, 5001):
            for _ in range(random.randint(1, 5)):  # Each idea can have 1 to 5 team members
                writer.writerow(generate_idea_team_data(idea_id))

# Generate the CSV files
generate_ideas_csv()
generate_idea_team_csv()

print("CSV files generated successfully!")
