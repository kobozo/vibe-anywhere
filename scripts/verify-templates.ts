import { db } from '../src/lib/db';
import { proxmoxTemplates } from '../src/lib/db/schema';
import { getTemplateService } from '../src/lib/services';

async function verifyTemplates() {
  console.log('\n=== Verifying Template Storage and Parsing ===\n');

  // 1. Check raw database storage
  console.log('1. Raw Database Storage:');
  const rawTemplates = await db.select().from(proxmoxTemplates).limit(3);

  for (const template of rawTemplates) {
    console.log(`\nTemplate: ${template.name} (${template.id})`);
    console.log(`  - techStacks (raw): ${typeof template.techStacks} = ${JSON.stringify(template.techStacks)}`);
    console.log(`  - inheritedTechStacks (raw): ${typeof template.inheritedTechStacks} = ${JSON.stringify(template.inheritedTechStacks)}`);
    console.log(`  - envVars (raw): ${typeof template.envVars} = ${JSON.stringify(template.envVars)?.substring(0, 100)}`);
  }

  // 2. Check parsed templates via service
  console.log('\n\n2. Parsed Templates (via service):');
  const templateService = getTemplateService();
  // Call with 'admin' role to see all templates
  const parsedTemplates = await templateService.listTemplates(undefined, 'admin');

  for (const template of parsedTemplates.slice(0, 3)) {
    console.log(`\nTemplate: ${template.name} (${template.id})`);
    console.log(`  - techStacks (parsed): ${typeof template.techStacks} = ${JSON.stringify(template.techStacks)}`);
    console.log(`  - inheritedTechStacks (parsed): ${typeof template.inheritedTechStacks} = ${JSON.stringify(template.inheritedTechStacks)}`);
    console.log(`  - Is Array: techStacks=${Array.isArray(template.techStacks)}, inheritedTechStacks=${Array.isArray(template.inheritedTechStacks)}`);

    // 3. Test array operations
    try {
      const techStacks: string[] = Array.isArray(template.techStacks) ? template.techStacks : [];
      const sliced = techStacks.slice(0, 2);
      const mapped = sliced.map(t => t.toUpperCase());
      console.log(`  - Array operations work: slice/map succeeded = ${JSON.stringify(mapped)}`);
    } catch (error) {
      console.log(`  - ❌ Array operations FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 4. Test getEffectiveTechStacks
  console.log('\n\n3. Testing getEffectiveTechStacks():');
  for (const template of parsedTemplates.slice(0, 2)) {
    try {
      const effective = templateService.getEffectiveTechStacks(template);
      console.log(`  - ${template.name}: ${JSON.stringify(effective)}`);
    } catch (error) {
      console.log(`  - ❌ ${template.name}: FAILED - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('\n=== Verification Complete ===\n');
  process.exit(0);
}

verifyTemplates().catch(error => {
  console.error('Verification failed:', error);
  process.exit(1);
});
