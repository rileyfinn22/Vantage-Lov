import { db } from '#/data';
import { exit } from 'node:process';
import { seedDatabase } from './seed';

await seedDatabase(db)
exit(0);