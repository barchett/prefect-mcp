#!/usr/bin/env node

import { createOpencodeClient } from '@opencode-ai/sdk';
import { resolveDirectory } from './src/config.js';
import { createSession, runPrompt, getDiff } from './src/handlers.js';

const client = createOpencodeClient({ baseUrl: 'http://localhost:4096' });

async function testMultipleRuns() {
  console.log('Starting multiple test runs...');
  
  // Test run 1
  console.log('\n=== Test Run 1 ===');
  try {
    const session1 = await createSession(client, 'Test Session 1', process.cwd());
    console.log('Session 1 created:', session1.id);
    
    const result1 = await runPrompt(client, session1.id, 'What is the capital of France?', {}, process.cwd());
    console.log('Prompt 1 completed');
    
    const diff1 = await getDiff(client, session1.id, undefined, process.cwd());
    console.log('Diff 1 retrieved:', diff1.length, 'files changed');
    
    // Clean up
    await client.session.abort({ path: { id: session1.id } });
    console.log('Session 1 aborted');
  } catch (error) {
    console.error('Test Run 1 failed:', error.message);
  }
  
  // Test run 2
  console.log('\n=== Test Run 2 ===');
  try {
    const session2 = await createSession(client, 'Test Session 2', process.cwd());
    console.log('Session 2 created:', session2.id);
    
    const result2 = await runPrompt(client, session2.id, 'What is 2+2?', {}, process.cwd());
    console.log('Prompt 2 completed');
    
    const diff2 = await getDiff(client, session2.id, undefined, process.cwd());
    console.log('Diff 2 retrieved:', diff2.length, 'files changed');
    
    // Clean up
    await client.session.abort({ path: { id: session2.id } });
    console.log('Session 2 aborted');
  } catch (error) {
    console.error('Test Run 2 failed:', error.message);
  }
  
  // Test run 3
  console.log('\n=== Test Run 3 ===');
  try {
    const session3 = await createSession(client, 'Test Session 3', process.cwd());
    console.log('Session 3 created:', session3.id);
    
    const result3 = await runPrompt(client, session3.id, 'Write a simple hello world program in JavaScript', {}, process.cwd());
    console.log('Prompt 3 completed');
    
    const diff3 = await getDiff(client, session3.id, undefined, process.cwd());
    console.log('Diff 3 retrieved:', diff3.length, 'files changed');
    
    // Clean up
    await client.session.abort({ path: { id: session3.id } });
    console.log('Session 3 aborted');
  } catch (error) {
    console.error('Test Run 3 failed:', error.message);
  }
  
  console.log('\n=== All tests completed ===');
}

testMultipleRuns().catch(console.error);