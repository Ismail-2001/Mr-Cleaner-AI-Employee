/**
 * Database Migration Runner
 *
 * Reads SQL migration files from supabase/ in order and applies them
 * to the Supabase project configured in environment variables.
 *
 * Usage:
 *   node scripts/migrate.js                    # Apply pending migrations
 *   node scripts/migrate.js --dry-run           # Show what would run
 *   node scripts/migrate.js --status            # Show migration status
 *
 * Migration files are named: NNNN_description.sql
 * Applied migrations are tracked in a _migrations tracking table.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase');
const TRACKING_TABLE = '_migrations';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const showStatus = args.includes('--status');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function ensureTrackingTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ DEFAULT NOW(),
            checksum TEXT NOT NULL
        );
    `;
    const { error } = await supabase.rpc('exec_sql', { sql }).single();
    if (error && error.message.includes('function "exec_sql" does not exist')) {
        // Fallback: try direct SQL via REST
        const { error: directError } = await supabase.from(TRACKING_TABLE).select('id').limit(1);
        if (directError && directError.message.includes('relation') && directError.message.includes('does not exist')) {
            console.warn('WARNING: Cannot auto-create tracking table. Run this SQL manually:\n');
            console.warn(sql);
            console.warn();
            return false;
        }
    }
    return true;
}

async function getAppliedMigrations() {
    const { data, error } = await supabase
        .from(TRACKING_TABLE)
        .select('filename, checksum')
        .order('id');

    if (error) {
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
            return [];
        }
        console.error('Error reading migration status:', error.message);
        return [];
    }
    return data || [];
}

function computeChecksum(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}

async function applyMigration(filename, sql) {
    const checksum = computeChecksum(sql);
    console.log(`  Applying ${filename}...`);

    if (dryRun) {
        console.log(`  [DRY-RUN] Would apply: ${filename}`);
        return true;
    }

    // Execute via Supabase REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql }),
    });

    if (!response.ok) {
        // Fallback: execute as raw SQL via a manual transaction
        const { error } = await supabase.rpc('exec_sql', { sql });
        if (error) {
            console.error(`  FAILED: ${filename}`, error.message);
            return false;
        }
    }

    // Record migration
    const { error: recordError } = await supabase
        .from(TRACKING_TABLE)
        .insert({ filename, checksum });

    if (recordError) {
        console.error(`  WARNING: Applied but failed to record: ${recordError.message}`);
    }

    console.log(`  Done.`);
    return true;
}

async function main() {
    console.log('\n=== Database Migration ===\n');

    const files = readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql') && f !== 'schema.sql')
        .sort();

    if (files.length === 0) {
        console.log('No migration files found.');
        process.exit(0);
    }

    const trackReady = await ensureTrackingTable();
    if (!trackReady) {
        console.log('Cannot proceed without tracking table.');
        process.exit(1);
    }

    const applied = await getAppliedMigrations();
    const appliedMap = new Map(applied.map(m => [m.filename, m.checksum]));

    if (showStatus) {
        console.log('Migration Status:\n');
        for (const file of files) {
            const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
            const checksum = computeChecksum(content);
            const appliedEntry = appliedMap.get(file);
            if (appliedEntry) {
                const match = appliedEntry === checksum ? 'OK' : 'CHECKSUM MISMATCH';
                console.log(`  [${match}] ${file}`);
            } else {
                console.log(`  [PENDING] ${file}`);
            }
        }
        console.log();
        process.exit(0);
    }

    let count = 0;
    for (const file of files) {
        if (appliedMap.has(file)) continue;

        const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
        const success = await applyMigration(file, content);
        if (success) count++;
    }

    console.log(`\n${count} migration(s) applied.`);
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
