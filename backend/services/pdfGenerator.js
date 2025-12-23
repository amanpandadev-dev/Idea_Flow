/**
 * PDF Generator Service
 * 
 * Generates professional PDF reports for Market Validation
 * Uses saved report data - NO regeneration
 */

import PDFDocument from 'pdfkit';

/**
 * Generate PDF from saved market validation report
 */
export function generateMarketValidationPDF(reportData, idea) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });

    // Title Page
    addTitlePage(doc, idea, reportData);

    // Table of Contents
    doc.addPage();
    addTableOfContents(doc);

    // Section 1: Internal Position
    doc.addPage();
    addInternalPositionSection(doc, reportData.sections?.internalPosition || reportData.internalAnalysis);

    // Section 2: Market Trends
    doc.addPage();
    addMarketTrendsSection(doc, reportData.sections?.marketTrends || reportData.externalEvidence);

    // Section 3: Competitors
    doc.addPage();
    addCompetitorsSection(doc, reportData.sections?.competitors || reportData.externalEvidence);

    // Section 4: Patent Risk
    doc.addPage();
    addPatentRiskSection(doc, reportData.sections?.patentRisk || reportData.patentSignals);

    // Section 5: Opportunities
    doc.addPage();
    addOpportunitiesSection(doc, reportData.sections?.opportunities);

    // Section 6: Risks
    doc.addPage();
    addRisksSection(doc, reportData.sections?.risks);

    // Executive Summary
    doc.addPage();
    addExecutiveSummary(doc, reportData.verdict);

    // Sources
    if (reportData.sources && reportData.sources.length > 0) {
        doc.addPage();
        addSourcesSection(doc, reportData.sources);
    }

    // Footer & Disclaimer
    addFooter(doc);

    return doc;
}

/**
 * Title Page
 */
function addTitlePage(doc, idea, reportData) {
    doc.fontSize(28).fillColor('#1e40af').text('Market Validation Report', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(18).fillColor('#334155').text(idea.title || 'Innovation Idea', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#64748b').text(`Business Group: ${idea.business_group || 'Not specified'}`, { align: 'center' });
    doc.moveDown(0.5);

    const generatedDate = new Date(reportData.generatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    doc.text(`Generated: ${generatedDate}`, { align: 'center' });

    doc.moveDown(4);

    // Key metrics box
    const startY = doc.y;
    doc.rect(100, startY, 400, 150).stroke('#cbd5e1');

    doc.y = startY + 20;
    doc.fontSize(14).fillColor('#0f172a').text('Key Metrics', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#475569');
    const noveltyScore = reportData.internalAnalysis?.noveltyScore || reportData.sections?.internalPosition?.noveltyScore || 50;
    const riskLevel = reportData.patentSignals?.riskLevel || reportData.sections?.patentRisk?.riskLevel || 'Medium';
    const sourceCount = reportData.sources?.length || 0;

    doc.text(`Novelty Score: ${noveltyScore}% novel`, 120, doc.y, { width: 360 });
    doc.text(`IP Risk Level: ${riskLevel}`, 120, doc.y + 20, { width: 360 });
    doc.text(`External Sources: ${sourceCount} analyzed`, 120, doc.y + 40, { width: 360 });
}

/**
 * Table of Contents
 */
function addTableOfContents(doc) {
    doc.fontSize(20).fillColor('#1e40af').text('Table of Contents');
    doc.moveDown(1.5);

    const toc = [
        '1. Internal Idea Position',
        '2. External Market Evidence',
        '3. Competitor Landscape',
        '4. Patent & IP Risk Signals',
        '5. Market Opportunities',
        '6. Risks & Challenges',
        '7. Executive Summary',
        '8. Sources & References'
    ];

    doc.fontSize(12).fillColor('#334155');
    toc.forEach((item, idx) => {
        doc.text(item, { indent: 20 });
        if (idx < toc.length - 1) doc.moveDown(0.5);
    });
}

/**
 * Section 1: Internal Position
 */
function addInternalPositionSection(doc, data) {
    addSectionHeader(doc, '1. Internal Idea Position');

    const noveltyScore = data?.noveltyScore || 50;
    doc.fontSize(12).fillColor('#475569').text(`Novelty Score: ${noveltyScore}% novel`);
    doc.moveDown(1);

    const summary = data?.summary || 'Analysis unavailable';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
    doc.moveDown(1.5);

    const similarIdeas = data?.similarIdeas || [];
    if (similarIdeas.length > 0) {
        doc.fontSize(13).fillColor('#0f172a').text('Similar Internal Ideas:');
        doc.moveDown(0.5);

        similarIdeas.forEach(idea => {
            const pct = idea.similarityPct || Math.round((idea.similarity || 0) * 100);
            doc.fontSize(10).fillColor('#475569')
                .text(`• "${idea.title}" - ${pct}% similar (${idea.band || 'N/A'})`, { indent: 20 });
            doc.moveDown(0.3);
        });
    }
}

/**
 * Section 2: Market Trends
 */
function addMarketTrendsSection(doc, data) {
    addSectionHeader(doc, '2. External Market Evidence');

    const summary = data?.summary || 'No market trend data available.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
    doc.moveDown(1);

    const trends = data?.trends || data?.marketTrends || [];
    if (trends.length > 0) {
        doc.fontSize(13).fillColor('#0f172a').text('Key Trends Identified:');
        doc.moveDown(0.5);

        trends.slice(0, 5).forEach(trend => {
            doc.fontSize(10).fillColor('#475569').text(`• ${trend.title}`, { indent: 20 });
            doc.moveDown(0.2);
        });
    }
}

/**
 * Section 3: Competitors
 */
function addCompetitorsSection(doc, data) {
    addSectionHeader(doc, '3. Competitor Landscape');

    const intensity = data?.competitiveIntensity || 'Unknown';
    doc.fontSize(12).fillColor('#475569').text(`Competitive Intensity: ${intensity}`);
    doc.moveDown(1);

    const summary = data?.summary || 'No competitor data available.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
    doc.moveDown(1);

    const competitors = data?.competitors || [];
    if (competitors.length > 0) {
        doc.fontSize(13).fillColor('#0f172a').text('Identified Competitors:');
        doc.moveDown(0.5);

        competitors.slice(0, 6).forEach(comp => {
            const name = comp.name || comp.title || 'Unknown';
            doc.fontSize(10).fillColor('#475569').text(`• ${name}`, { indent: 20 });
            doc.moveDown(0.2);
        });
    }
}

/**
 * Section 4: Patent Risk
 */
function addPatentRiskSection(doc, data) {
    addSectionHeader(doc, '4. Patent & IP Risk Signals');

    const riskLevel = data?.riskLevel || 'Medium';
    const score = data?.score || 50;

    doc.fontSize(12).fillColor('#475569').text(`Risk Level: ${riskLevel} (Score: ${score}/100)`);
    doc.moveDown(1);

    const summary = data?.summary || 'IP risk assessment unavailable.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
    doc.moveDown(1.5);

    // Disclaimer box
    doc.fillColor('#fef3c7').rect(doc.x, doc.y, 450, 60).fill();
    doc.fillColor('#92400e').fontSize(9)
        .text('⚠️ DISCLAIMER: This is an AI-assisted assessment, not legal advice.', doc.x + 10, doc.y + 10, { width: 430 })
        .text('Consult an IP attorney for thorough patent analysis.', doc.x + 10, doc.y + 30, { width: 430 });
    doc.moveDown(3);
}

/**
 * Section 5: Opportunities
 */
function addOpportunitiesSection(doc, data) {
    addSectionHeader(doc, '5. Market Opportunities & Strategic Gaps');

    const summary = data?.summary || 'Opportunity analysis unavailable.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
}

/**
 * Section 6: Risks
 */
function addRisksSection(doc, data) {
    addSectionHeader(doc, '6. Risks & Challenges');

    const summary = data?.summary || 'Risk analysis unavailable.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
}

/**
 * Executive Summary
 */
function addExecutiveSummary(doc, verdict) {
    addSectionHeader(doc, '7. Executive Summary');

    const summary = verdict || 'Market validation assessment complete. See detailed sections above for specific findings.';
    doc.fontSize(11).fillColor('#1e293b').text(summary, { align: 'justify' });
}

/**
 * Sources Section
 */
function addSourcesSection(doc, sources) {
    addSectionHeader(doc, '8. Sources & References');

    doc.fontSize(10).fillColor('#475569');
    sources.forEach((source, idx) => {
        doc.text(`[${idx + 1}] ${source.title || 'Untitled'}`, { continued: false });
        doc.fillColor('#3b82f6').text(source.url, { link: source.url, underline: true });
        doc.fillColor('#475569').moveDown(0.5);
    });
}

/**
 * Footer & Disclaimer
 */
function addFooter(doc) {
    // Add final disclaimer page instead of trying to modify all pages
    doc.addPage();
    doc.fontSize(10).fillColor('#64748b').text('DISCLAIMER', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#475569').text(
        'This market validation report is generated using AI-assisted analysis and should be used as a preliminary assessment tool only. ' +
        'The information provided is based on publicly available data and internal organizational records as of the generation date. ' +
        'This report does not constitute legal, financial, or business advice. For patent and IP matters, consult a qualified IP attorney. ' +
        'For business decisions, conduct thorough due diligence and consult appropriate experts.',
        { align: 'justify' }
    );
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#94a3b8').text(
        'Generated by Innovation Insights Portal | AI-assisted market intelligence',
        { align: 'center' }
    );
}

/**
 * Helper: Add section header
 */
function addSectionHeader(doc, title) {
    doc.fontSize(18).fillColor('#1e40af').text(title);
    doc.moveDown(1);
}

export default {
    generateMarketValidationPDF
};
