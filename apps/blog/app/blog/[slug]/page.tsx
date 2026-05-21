import {getPostBySlug, getAllPosts, renderMarkdown} from '../../lib/posts';
import {notFound} from 'next/navigation';

interface PageProps {
  params: Promise<{slug: string}>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map(post => ({slug: post.slug}));
}

export default async function BlogPostPage({params}: PageProps) {
  const {slug} = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const html = renderMarkdown(post.content);

  const formattedDate = new Date(post.date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <article className="max-w-2xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <a href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 inline-block">
        ← Back to blog
      </a>

      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
            {post.category}
          </span>
          <span className="text-xs text-gray-400">{post.readingTime}</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3">{post.title}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{post.description}</p>
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span>{post.author}</span>
          <span>·</span>
          <time dateTime={post.date}>{formattedDate}</time>
        </div>
        {post.tags.length > 0 && (
          <div className="flex gap-2 mt-4">
            {post.tags.map(tag => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Divider */}
      <hr className="border-gray-200 dark:border-gray-700 mb-10" />

      {/* Content */}
      <div
        className="prose dark:prose-invert"
        dangerouslySetInnerHTML={{__html: html}}
      />

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-700 text-center">
        <a href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← Back to all posts
        </a>
      </footer>
    </article>
  );
}
