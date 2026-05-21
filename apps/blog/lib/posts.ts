import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';

// ── Types ──

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author: string;
  tags: string[];
  category: 'engineering' | 'changelog' | 'tutorial' | 'design';
  readingTime: string;
  content: string;
  featured?: boolean;
}

// ── Content Directory ──

const CONTENT_DIR = path.join(process.cwd(), 'content');

// ── Parse Posts ──

export function getAllPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.md') || f.endsWith('.mdx'));

  const posts = files.map(file => {
    const slug = file.replace(/\.(md|mdx)$/, '');
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf-8');
    const {data, content} = matter(raw);
    const stats = readingTime(content);

    return {
      slug,
      title: data.title ?? slug,
      description: data.description ?? '',
      date: data.date ?? new Date().toISOString(),
      author: data.author ?? 'Anvil Team',
      tags: data.tags ?? [],
      category: data.category ?? 'engineering',
      readingTime: stats.text,
      content,
      featured: data.featured ?? false,
    } satisfies BlogPost;
  });

  // Sort by date descending
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return posts;
}

export function getPostBySlug(slug: string): BlogPost | null {
  const posts = getAllPosts();
  return posts.find(p => p.slug === slug) ?? null;
}

export function getPostsByCategory(category: BlogPost['category']): BlogPost[] {
  return getAllPosts().filter(p => p.category === category);
}

export function getChangelog(): BlogPost[] {
  return getPostsByCategory('changelog');
}

// ── Markdown to HTML (basic renderer) ──

export function renderMarkdown(markdown: string): string {
  let html = markdown;

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Lists (ul)
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr />');

  // Paragraphs (wrap lines that aren't already wrapped)
  html = html.replace(/^(?!<[a-z])((?!<\/)[^\n]+)$/gm, '<p>$1</p>');

  return html;
}
