import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { remark } from 'remark';
import remarkHtml from 'remark-html';

const VAULT_PATH = '/Users/davidfavero/Desktop/ObsidianVault';

export type MarkdownContent = {
  title: string;
  description: string;
  lastUpdated: string;
  contentHtml: string;
};

export async function getMarkdownContent(filename: string): Promise<MarkdownContent | null> {
  const fullPath = path.join(VAULT_PATH, `${filename}.md`);

  try {
    if (!fs.existsSync(fullPath)) {
      console.warn(`[markdown] File not found: ${fullPath}`);
      return null;
    }

    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const { data, content } = matter(fileContents);

    const processed = await remark().use(remarkHtml, { sanitize: false }).process(content);
    const contentHtml = processed.toString();

    return {
      title: data.title || '',
      description: data.description || '',
      lastUpdated: data.lastUpdated || '',
      contentHtml,
    };
  } catch (error) {
    console.error(`[markdown] Error reading ${filename}:`, error);
    return null;
  }
}
