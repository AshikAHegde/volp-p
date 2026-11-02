#!/usr/bin/env node
/**
 * Standalone CLI runner for the Devpost & Unstop hackathon ingestion pipeline.
 * Usage:
 *   node scripts/fetch_hackathons_pipeline.js
 *   npm run pipeline:sync
 */

import 'dotenv/config';
import { runHackathonsPipeline } from '../services/hackathon_pipeline.service.js';
import { pgPool } from '../services/db.service.js';

console.log('====================================================');
console.log('🚀 VOLP HACKATHON & EVENT INGESTION PIPELINE');
console.log('   Platforms: Devpost + Unstop');
console.log('   Target:    PostgreSQL (unstop_events, devpost_events)');
console.log('====================================================\n');

try {
  const result = await runHackathonsPipeline({
    devpostPages: 5,
    unstopPages: 3,
    unstopPerPage: 50,
  });

  console.log('\n────────────────────────────────────────────────────');
  console.log(`✅ Pipeline execution completed in ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`📊 Devpost: ${result.devpost.upserted}/${result.devpost.attempted} events upserted (Total in DB: ${result.devpost.totalInDatabase})`);
  console.log(`📊 Unstop:  ${result.unstop.upserted}/${result.unstop.attempted} events upserted (Total in DB: ${result.unstop.totalInDatabase})`);
  console.log(`🏆 Total Live Hackathons in Database: ${result.totalInDatabase}`);
  console.log('────────────────────────────────────────────────────\n');

  if (result.devpost.errors.length > 0 || result.unstop.errors.length > 0) {
    console.warn('⚠️ Warning: Encountered minor errors during execution:');
    [...result.devpost.errors, ...result.unstop.errors].forEach((e) => console.warn(`  - ${e}`));
  }
} catch (err) {
  console.error('\n❌ Pipeline execution failed with fatal error:', err.message);
  process.exitCode = 1;
} finally {
  await pgPool.end();
  process.exit(process.exitCode || 0);
}
