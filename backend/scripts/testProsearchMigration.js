#!/usr/bin/env node

/**
 * Test script to verify prosearch_conversations table was created correctly
 */

import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function testMigration() {
    console.log('\n🧪 Testing prosearch_conversations migration...\n');
    
    const client = await pool.connect();
    
    try {
        // Test 1: Check if table exists
        console.log('✓ Test 1: Checking if table exists...');
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'prosearch_conversations'
            );
        `);
        
        if (!tableCheck.rows[0].exists) {
            throw new Error('Table prosearch_conversations does not exist');
        }
        console.log('  ✅ Table exists\n');
        
        // Test 2: Check table structure
        console.log('✓ Test 2: Checking table structure...');
        const columns = await client.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'prosearch_conversations'
            ORDER BY ordinal_position;
        `);
        
        console.log('  Columns:');
        columns.rows.forEach(col => {
            console.log(`    - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
        });
        console.log('');
        
        // Test 3: Check indexes
        console.log('✓ Test 3: Checking indexes...');
        const indexes = await client.query(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'prosearch_conversations';
        `);
        
        console.log('  Indexes:');
        indexes.rows.forEach(idx => {
            console.log(`    - ${idx.indexname}`);
        });
        console.log('');
        
        // Test 4: Test UUID generation
        console.log('✓ Test 4: Testing UUID generation...');
        const uuidTest = await client.query(`
            INSERT INTO prosearch_conversations (base_query, base_result_ids, current_result_ids)
            VALUES ('test query', ARRAY[1,2,3], ARRAY[1,2,3])
            RETURNING conversation_id, created_at, updated_at;
        `);
        
        const testRecord = uuidTest.rows[0];
        console.log(`  ✅ UUID generated: ${testRecord.conversation_id}`);
        console.log(`  ✅ Created at: ${testRecord.created_at}`);
        console.log(`  ✅ Updated at: ${testRecord.updated_at}\n`);
        
        // Test 5: Test JSONB default
        console.log('✓ Test 5: Testing JSONB default value...');
        const jsonbTest = await client.query(`
            SELECT applied_filters FROM prosearch_conversations 
            WHERE conversation_id = $1;
        `, [testRecord.conversation_id]);
        
        const filters = jsonbTest.rows[0].applied_filters;
        console.log(`  ✅ Default filters: ${JSON.stringify(filters)}\n`);
        
        // Cleanup
        await client.query(`
            DELETE FROM prosearch_conversations WHERE conversation_id = $1;
        `, [testRecord.conversation_id]);
        
        console.log('✅ All migration tests passed!\n');
        
    } catch (error) {
        console.error('❌ Migration test failed:', error.message);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

testMigration().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
