import { config } from 'dotenv';
config();

import { getTabService } from '../src/lib/services/tab-service';

const workspaceId = '3e4458eb-8821-4ab9-a937-afe82812ca5f';

async function test() {
  try {
    const tabService = getTabService();
    console.log('Creating tab...');
    const tab = await tabService.createTab(workspaceId, {
      name: 'Test Tab',
      command: ['/bin/bash'],
      tabType: 'terminal',
      icon: 'terminal',
      sortOrder: 0,
    });
    console.log('Tab created successfully:', tab);
    process.exit(0);
  } catch (error) {
    console.error('Error creating tab:', error);
    process.exit(1);
  }
}

test();
