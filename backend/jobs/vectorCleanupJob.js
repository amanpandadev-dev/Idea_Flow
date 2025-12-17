/**
 * Vector Store Cleanup Job
 * 
 * Automatically removes expired ChromaDB collections based on TTL.
 * Runs periodically to maintain bounded memory usage.
 * 
 * @module vectorCleanupJob
 */

import { getChromaClient } from '../config/chroma.js';

export class VectorCleanupJob {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.deletedCount = 0;
        this.totalRuns = 0;
    }

    /**
     * Start cleanup job with interval
     * @param {number} intervalMinutes - How often to run cleanup
     */
    start(intervalMinutes = 60) {
        console.log(`[VectorCleanup] 🚀 Starting cleanup job (interval: ${intervalMinutes}min)`);

        // Run immediately on startup
        this.run().catch(err => {
            console.error('[VectorCleanup] Initial run failed:', err);
        });

        // Schedule recurring runs
        const intervalMs = intervalMinutes * 60 * 1000;
        setInterval(() => {
            this.run().catch(err => {
                console.error('[VectorCleanup] Scheduled run failed:', err);
            });
        }, intervalMs);

        console.log(`[VectorCleanup] ✅ Cleanup job scheduled`);
    }

    /**
     * Run cleanup (safe & idempotent)
     */
    async run() {
        if (this.isRunning) {
            console.log('[VectorCleanup] ⏭️  Cleanup already running, skipping');
            return;
        }

        this.isRunning = true;
        this.totalRuns++;
        const startTime = Date.now();

        try {
            console.log(`[VectorCleanup] 🧹 Starting cleanup run #${this.totalRuns}...`);

            const client = await getChromaClient();
            const collections = await client.listCollections();

            const now = Date.now();
            let deleted = 0;
            let checked = 0;

            for (const collection of collections) {
                checked++;
                const metadata = collection.metadata || {};
                const expiresAt = metadata.expiresAt;

                if (!expiresAt) {
                    // No TTL set - skip
                    continue;
                }

                if (now > expiresAt) {
                    const ageHours = Math.round((now - metadata.createdAt) / (1000 * 60 * 60));
                    console.log(`[VectorCleanup] 🗑️  Deleting expired collection: ${collection.name} (age: ${ageHours}h, expired: ${new Date(expiresAt).toISOString()})`);

                    try {
                        await client.deleteCollection({ name: collection.name });
                        deleted++;
                        this.deletedCount++;
                    } catch (err) {
                        console.error(`[VectorCleanup] ❌ Failed to delete ${collection.name}:`, err.message);
                    }
                } else {
                    // Collection still valid
                    const remainingHours = Math.round((expiresAt - now) / (1000 * 60 * 60));
                    console.log(`[VectorCleanup] ✅ ${collection.name} still valid (expires in ${remainingHours}h)`);
                }
            }

            const duration = Date.now() - startTime;
            console.log(`[VectorCleanup] ✨ Cleanup complete: checked ${checked} collections, deleted ${deleted} in ${duration}ms`);
            this.lastRun = new Date();

        } catch (error) {
            console.error('[VectorCleanup] 💥 Cleanup failed:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Get cleanup stats
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            lastRun: this.lastRun ? this.lastRun.toISOString() : 'Never',
            totalRuns: this.totalRuns,
            totalDeleted: this.deletedCount,
            isRunning: this.isRunning,
            uptime: this.lastRun ? `${Math.round((Date.now() - this.lastRun.getTime()) / 60000)} minutes ago` : 'N/A'
        };
    }

    /**
     * Manually trigger cleanup (for testing)
     */
    async triggerManual() {
        console.log('[VectorCleanup] 🎯 Manual cleanup triggered');
        return await this.run();
    }
}

export default VectorCleanupJob;
