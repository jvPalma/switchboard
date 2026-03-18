import { registerHandler } from './registry';
import { searchByType } from '@main/db';

export function register(): void {
  registerHandler('search', (type: string, query: string) => {
    return searchByType(type, query, 50);
  });
}
