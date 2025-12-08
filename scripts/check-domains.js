/**
 * Check what domains exist in the database
 */
import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkDomains() {
    try {
        // Get unique domains
        const domainResult = await pool.query(`
            SELECT DISTINCT challenge_opportunity as domain, COUNT(*) as count
            FROM ideas
            WHERE challenge_opportunity IS NOT NULL AND challenge_opportunity != ''
            GROUP BY challenge_opportunity
            ORDER BY count DESC
            LIMIT 30
        `);
        
        console.log('Top 30 Domains in Database:');
        console.log('='.repeat(60));
        domainResult.rows.forEach((row, i) => {
            console.log(`${i + 1}. ${row.domain} (${row.count} ideas)`);
        });
        
        // Check for healthcare-related
        console.log('\n\nSearching for healthcare-related ideas:');
        const healthResult = await pool.query(`
            SELECT title, challenge_opportunity, summary
            FROM ideas
            WHERE LOWER(challenge_opportunity) LIKE '%health%'
               OR LOWER(title) LIKE '%health%'
               OR LOWER(summary) LIKE '%health%'
            LIMIT 5
        `);
        console.log(`Found ${healthResult.rows.length} healthcare-related ideas`);
        healthResult.rows.forEach(r => console.log(`  - ${r.title}`));
        
        // Check for blockchain-related
        console.log('\n\nSearching for blockchain-related ideas:');
        const blockchainResult = await pool.query(`
            SELECT title, challenge_opportunity, summary
            FROM ideas
            WHERE LOWER(challenge_opportunity) LIKE '%blockchain%'
               OR LOWER(title) LIKE '%blockchain%'
               OR LOWER(summary) LIKE '%blockchain%'
            LIMIT 5
        `);
        console.log(`Found ${blockchainResult.rows.length} blockchain-related ideas`);
        blockchainResult.rows.forEach(r => console.log(`  - ${r.title}`));
        
        // Check for finance-related
        console.log('\n\nSearching for finance-related ideas:');
        const financeResult = await pool.query(`
            SELECT title, challenge_opportunity, summary
            FROM ideas
            WHERE LOWER(challenge_opportunity) LIKE '%financ%'
               OR LOWER(challenge_opportunity) LIKE '%bank%'
               OR LOWER(title) LIKE '%financ%'
               OR LOWER(title) LIKE '%bank%'
            LIMIT 5
        `);
        console.log(`Found ${financeResult.rows.length} finance-related ideas`);
        financeResult.rows.forEach(r => console.log(`  - ${r.title}`));
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkDomains();
