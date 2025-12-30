/**
 * Market Chat PDF Generator Service
 * 
 * Generates professional PDF reports for Market Validator Chat conversations
 */

import PDFDocument from 'pdfkit';

/**
 * Generate PDF from market chat conversation
 * @param {Object} idea - The idea object
 * @param {Array} messages - Array of chat messages
 * @returns {PDFDocument} PDF document stream
 */
export function generateMarketChatPDF(idea, messages) {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 60, right: 60 }
    });

    // Title Page
    addTitlePage(doc, idea, messages);

    // Conversation Section
    doc.addPage();
    addConversationSection(doc, messages);

    // Footer & Disclaimer
    addFooter(doc);

    return doc;
}

/**
 * Title Page
 */
function addTitlePage(doc, idea, messages) {
    doc.fontSize(28).fillColor('#1e40af').text('Market Validation Chat Report', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(18).fillColor('#334155').text(idea.title || 'Innovation Idea', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#64748b').text(`Business Group: ${idea.business_group || 'Not specified'}`, { align: 'center' });
    doc.moveDown(0.5);

    const generatedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    doc.text(`Generated: ${generatedDate}`, { align: 'center' });

    doc.moveDown(4);

    // Info box
    const startY = doc.y;
    doc.rect(100, startY, 400, 100).stroke('#cbd5e1');

    doc.y = startY + 20;
    doc.fontSize(14).fillColor('#0f172a').text('Conversation Summary', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(11).fillColor('#475569');
    const userMessages = messages.filter(m => m.role === 'user').length;
    const assistantMessages = messages.filter(m => m.role === 'assistant').length;

    doc.text(`Total Messages: ${messages.length}`, 120, doc.y, { width: 360 });
    doc.text(`Questions Asked: ${userMessages}`, 120, doc.y + 20, { width: 360 });
    doc.text(`AI Responses: ${assistantMessages}`, 120, doc.y + 40, { width: 360 });
}

/**
 * Conversation Section
 */
function addConversationSection(doc, messages) {
    doc.fontSize(20).fillColor('#1e40af').text('Conversation History');
    doc.moveDown(1.5);

    messages.forEach((message, index) => {
        // Check if we need a new page (leave space for at least 100 points)
        if (doc.y > 650) {
            doc.addPage();
        }

        const isUser = message.role === 'user';
        const timestamp = new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Message header
        doc.fontSize(12).fillColor(isUser ? '#4f46e5' : '#7c3aed')
            .text(isUser ? '👤 You' : '🤖 Market Validation Assistant', { continued: true })
            .fillColor('#94a3b8')
            .fontSize(9)
            .text(` • ${timestamp}`, { align: 'left' });

        doc.moveDown(0.5);

        // Message content
        if (isUser) {
            // User messages - simple text
            doc.fontSize(11).fillColor('#1e293b').text(message.content, {
                align: 'left',
                indent: 20
            });
        } else {
            // Assistant messages - parse markdown-like formatting
            renderAssistantMessage(doc, message.content);
        }

        doc.moveDown(1.5);

        // Add separator line except for last message
        if (index < messages.length - 1) {
            doc.strokeColor('#e2e8f0').lineWidth(0.5)
                .moveTo(doc.x, doc.y)
                .lineTo(doc.page.width - 60, doc.y)
                .stroke();
            doc.moveDown(1);
        }
    });
}

/**
 * Render assistant message with markdown-like formatting
 */
function renderAssistantMessage(doc, content) {
    const lines = content.split('\n');
    let inList = false;

    lines.forEach(line => {
        // Check if we need a new page
        if (doc.y > 700) {
            doc.addPage();
        }

        // Headers
        if (line.startsWith('## ')) {
            if (inList) inList = false;
            doc.fontSize(13).fillColor('#0f172a').text(line.slice(3), { indent: 20 });
            doc.moveDown(0.5);
            return;
        }
        if (line.startsWith('# ')) {
            if (inList) inList = false;
            doc.fontSize(14).fillColor('#0f172a').text(line.slice(2), { indent: 20 });
            doc.moveDown(0.5);
            return;
        }

        // Bullet points
        if (line.match(/^[\*\-•]\s/)) {
            inList = true;
            doc.fontSize(10).fillColor('#475569').text(`• ${line.slice(2).trim()}`, { indent: 30 });
            doc.moveDown(0.3);
            return;
        }

        // Numbered lists
        if (line.match(/^\d+\.\s/)) {
            inList = true;
            doc.fontSize(10).fillColor('#475569').text(line, { indent: 30 });
            doc.moveDown(0.3);
            return;
        }

        // Horizontal rule
        if (line.match(/^---+$/)) {
            if (inList) inList = false;
            doc.strokeColor('#cbd5e1').lineWidth(0.5)
                .moveTo(doc.x + 20, doc.y)
                .lineTo(doc.page.width - 80, doc.y)
                .stroke();
            doc.moveDown(0.5);
            return;
        }

        // Empty line
        if (line.trim() === '') {
            if (inList) inList = false;
            doc.moveDown(0.3);
            return;
        }

        // Regular paragraph - handle bold text
        if (inList) inList = false;
        renderParagraphWithFormatting(doc, line);
        doc.moveDown(0.5);
    });
}

/**
 * Render paragraph with bold formatting
 */
function renderParagraphWithFormatting(doc, text) {
    const parts = [];
    let remaining = text;
    let lastIndex = 0;

    // Pattern for bold **text**
    const boldPattern = /\*\*([^*]+)\*\*/g;
    let match;

    while ((match = boldPattern.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
            parts.push({ text: text.slice(lastIndex, match.index), bold: false });
        }
        // Add bold text
        parts.push({ text: match[1], bold: true });
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push({ text: text.slice(lastIndex), bold: false });
    }

    // If no formatting found, just render as is
    if (parts.length === 0) {
        doc.fontSize(11).fillColor('#1e293b').text(text, {
            align: 'left',
            indent: 20
        });
        return;
    }

    // Render parts with formatting
    doc.fontSize(11).fillColor('#1e293b');
    let firstPart = true;
    parts.forEach((part, index) => {
        if (part.bold) {
            doc.font('Helvetica-Bold').text(part.text, {
                continued: index < parts.length - 1,
                indent: firstPart ? 20 : 0
            });
        } else {
            doc.font('Helvetica').text(part.text, {
                continued: index < parts.length - 1,
                indent: firstPart ? 20 : 0
            });
        }
        firstPart = false;
    });
    doc.font('Helvetica'); // Reset to normal
}

/**
 * Footer & Disclaimer
 */
function addFooter(doc) {
    doc.addPage();
    doc.fontSize(10).fillColor('#64748b').text('DISCLAIMER', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#475569').text(
        'This market validation chat report is generated using AI-assisted analysis and should be used as a preliminary assessment tool only. ' +
        'The information provided is based on publicly available data and AI-generated insights as of the generation date. ' +
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

export default {
    generateMarketChatPDF
};
