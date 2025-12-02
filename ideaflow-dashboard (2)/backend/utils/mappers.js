
const randomScore = () => Math.floor(Math.random() * 5) + 6;

// Helper: Generate synthetic future scope
const generateFutureScope = (domain) => {
    const scopes = [
        `Integration with wider enterprise ecosystems to enable cross-functional data synergy in ${domain}.`,
        "Scaling to support multi-tenant architecture and 3rd-party API monetization.",
        "Incorporating advanced reinforcement learning models to automate decision-making loops.",
        "Expansion into mobile-first experiences with offline capabilities for field workers.",
        "Adoption of edge computing principles to reduce latency and improve real-time processing."
    ];
    return scopes[Math.floor(Math.random() * scopes.length)];
};

// Map DB row to Frontend Idea Interface
export const mapDBToFrontend = (row) => {
    // Safe integer parsing helper
    const safeInt = (val) => (val !== null && val !== undefined) ? parseInt(val, 10) : 0;

    return {
        id: `IDEA-${row.idea_id}`,
        dbId: row.idea_id,
        title: row.title,
        description: row.summary || '',
        domain: row.challenge_opportunity || 'Other',
        status: row.build_phase || 'Submitted',
        businessGroup: row.idea_bg || 'Corporate Functions',
        buildType: row.build_preference || 'New Solution / IP',
        technologies: row.code_preference ? (row.code_preference.includes(',') ? row.code_preference.split(',').map(s => s.trim()) : [row.code_preference]) : [],
        submissionDate: row.created_at,

        // Mapped Associate Info
        associateId: row.associate_id,
        associateAccount: row.account || 'Unknown',
        associateBusinessGroup: row.assoc_bg || 'Unknown',

        // Metrics
        score: row.idea_score !== undefined && row.idea_score !== null ? safeInt(row.idea_score) : 0,
        likesCount: safeInt(row.likes_count),
        isLiked: !!row.is_liked,

        futureScope: generateFutureScope(row.challenge_opportunity),
        impactScore: randomScore(),
        confidenceScore: randomScore(),
        feasibilityScore: randomScore()
    };
};
