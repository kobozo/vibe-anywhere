#!/usr/bin/env tsx
/**
 * Check existing proxmox_templates in the database
 */

import { db } from '../src/lib/db';
import { proxmoxTemplates } from '../src/lib/db/schema';

async function main() {
  console.log('Fetching all proxmox templates...');

  try {
    const templates = await db.select().from(proxmoxTemplates);
    console.log(`Found ${templates.length} templates`);

    for (const template of templates) {
      console.log('\n---');
      console.log('ID:', template.id);
      console.log('Name:', template.name);
      console.log('Tech Stacks (raw):', template.techStacks);
      console.log('Tech Stacks (type):', typeof template.techStacks);
      console.log('Inherited Tech Stacks (raw):', template.inheritedTechStacks);
      console.log('Inherited Tech Stacks (type):', typeof template.inheritedTechStacks);
    }
  } catch (error) {
    console.error('Error querying templates:', error);
  }

  process.exit(0);
}

main();
