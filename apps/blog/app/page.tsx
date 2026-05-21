import {getAllPosts, renderMarkdown, type BlogPost} from '../lib/posts';

// ── Helpers ──

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

const CATEGORY_STYLES: Record<string, string> = {
  engineering: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  changelog: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  tutorial: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  design: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
};

// ── Page ──

export default function BlogPage() {
  const posts = getAllPosts();
  const featured = posts.find(p => p.featured);
  const recent = posts.filter(p => !p.featured).slice(0, 10);

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Anvil Blog
        </h1>
        <p className="text-gray-500">Engineering, changelogs, and updates from the Anvil team.</p>
      </div>

      {/* Featured Post */}
      {featured && <FeaturedPost post={featured} />}

      {/* Posts Grid */}
      <div className="mt-12 space-y-8">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300">Recent Posts</h2>
        {recent.map(post => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>

      {posts.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">No posts yet. Check back soon!</p>
        </div>
      )}
    </div>
  );
}

function FeaturedPost({post}: {post: BlogPost}) {
  return (
    <a
      href={`/blog/${post.slug}`}
      className="block rounded-xl border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-8 hover:shadow-lg transition-shadow"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLES[post.category]}`}>
          {post.category}
        </span>
        <span className="text-xs text-gray-500">Featured</span>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{post.title}</h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">{post.description}</p>
      <div className="flex items-center gap-4 text-xs text-gray-500">
        <span>{formatDate(post.date)}</span>
        <span>{post.readingTime}</span>
        <span>{post.author}</span>
      </div>
    </a>
  );
}

function PostCard({post}: {post: BlogPost}) {
  return (
    <a
      href={`/blog/${post.slug}`}
      className="block rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_STYLES[post.category]}`}>
          {post.category}
        </span>
        <span className="text-xs text-gray-400">{post.readingTime}</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">{post.title}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{post.description}</p>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span>{formatDate(post.date)}</span>
        <span>·</span>
        <span>{post.author}</span>
      </div>
      {post.tags.length > 0 && (
        <div className="flex gap-2 mt-3">
          {post.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
              {tag}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
