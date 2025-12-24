import { Injectable, signal } from '@angular/core';

export interface BlogPost {
  title: string;
  excerpt: string;
  url: string;
  date: string;
  author?: string;
  image?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BlogService {
  private readonly BEEHIIV_URL = 'https://rocketgoals.beehiiv.com/';
  blogPosts = signal<BlogPost[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  async fetchBlogPosts(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // Since beehiiv doesn't have a public API, we'll use a CORS proxy
      // In production, you should create a Firebase Cloud Function to fetch this
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(this.BEEHIIV_URL)}`;
      
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch blog posts');
      }

      const data = await response.json();
      const htmlContent = data.contents;

      // Parse HTML to extract blog posts
      const posts = this.parseBlogPosts(htmlContent);
      
      // Take only the first 3 posts
      const initialPosts = posts.slice(0, 3);
      
      // Fetch images for posts that don't have them
      const postsWithImages = await Promise.all(
        initialPosts.map(async (post) => {
          if (!post.image && post.url && post.url.includes('/p/')) {
            try {
              const image = await this.fetchPostImage(post.url);
              return { ...post, image };
            } catch (err) {
              console.warn('Failed to fetch image for post:', post.url);
              return post;
            }
          }
          return post;
        })
      );
      
      this.blogPosts.set(postsWithImages);
    } catch (err) {
      console.error('Error fetching blog posts:', err);
      this.error.set('Failed to load blog posts');
      // Fallback to sample posts if fetch fails
      this.blogPosts.set(this.getFallbackPosts());
    } finally {
      this.isLoading.set(false);
    }
  }

  private parseBlogPosts(html: string): BlogPost[] {
    const posts: BlogPost[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Try multiple selectors to find blog posts
    // beehiiv uses various structures, so we'll try different approaches
    let postLinks = doc.querySelectorAll('a[href*="/p/"]');
    
    // If no /p/ links found, try other patterns
    if (postLinks.length === 0) {
      postLinks = doc.querySelectorAll('article a, .post a, [class*="post"] a, [class*="Post"] a');
    }

    // Also try finding by text patterns (Day X: pattern)
    if (postLinks.length === 0) {
      const allLinks = doc.querySelectorAll('a');
      const dayLinks: NodeListOf<Element> = doc.querySelectorAll('a');
      dayLinks.forEach(link => {
        const text = link.textContent || '';
        if (text.includes('Day') && text.includes(':')) {
          postLinks = doc.querySelectorAll(`a[href="${link.getAttribute('href')}"]`);
        }
      });
    }
    
    const seenUrls = new Set<string>();
    
    postLinks.forEach((link) => {
      if (posts.length >= 3) return; // Only get first 3
      
      const href = link.getAttribute('href');
      if (!href) return;

      // Construct full URL
      let fullUrl = href.startsWith('http') ? href : 
                   href.startsWith('/') ? `${this.BEEHIIV_URL}${href.substring(1)}` :
                   `${this.BEEHIIV_URL}${href}`;

      // Skip if we've already seen this URL
      if (seenUrls.has(fullUrl)) return;
      seenUrls.add(fullUrl);

      // Find the parent container (article, post card, etc.)
      const article = link.closest('article') || 
                     link.closest('[class*="post"]') || 
                     link.closest('[class*="Post"]') ||
                     link.closest('[class*="card"]') ||
                     link.parentElement?.parentElement ||
                     link.parentElement;

      // Get title - try multiple sources
      let title = article?.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]')?.textContent?.trim() ||
                 link.textContent?.trim() || 
                 link.getAttribute('title') ||
                 link.querySelector('h2, h3, h4')?.textContent?.trim() ||
                 'Blog Post';
      
      // Clean up title - remove extra whitespace and emojis if needed
      title = title.replace(/\s+/g, ' ').trim();
      
      // Try to find image - check multiple sources
      let image: string | undefined;
      
      // Try to find image in article container
      const imgElement = article?.querySelector('img[src], img[data-src], img[data-lazy-src], img[data-original]') as HTMLImageElement;
      if (imgElement) {
        image = imgElement.getAttribute('src') || 
               imgElement.getAttribute('data-src') || 
               imgElement.getAttribute('data-lazy-src') ||
               imgElement.getAttribute('data-original') ||
               imgElement.getAttribute('srcset')?.split(',')[0]?.trim().split(' ')[0];
        
        // Make sure image URL is absolute
        if (image && !image.startsWith('http')) {
          image = image.startsWith('/') ? `${this.BEEHIIV_URL}${image.substring(1)}` : `${this.BEEHIIV_URL}${image}`;
        }
      }
      
      // Image will be fetched separately if not found here
      
      // Try to find excerpt/description
      const excerptElement = article?.querySelector('p, .excerpt, .description, [class*="excerpt"], [class*="Excerpt"], [class*="summary"]');
      let excerpt = excerptElement?.textContent?.trim() || 
                   link.getAttribute('aria-label') ||
                   article?.querySelector('p')?.textContent?.trim() ||
                   'Read more about goal achievement and productivity tips.';

      // Clean and truncate excerpt
      excerpt = excerpt.replace(/\s+/g, ' ').trim();
      if (excerpt.length > 120) {
        excerpt = excerpt.substring(0, 120) + '...';
      }

      // Try to find date
      const dateElement = article?.querySelector('time, [datetime], .date, [class*="date"], [class*="Date"]') ||
                         link.parentElement?.querySelector('time, [datetime]');
      let date = dateElement?.getAttribute('datetime') || 
                dateElement?.textContent?.trim() || 
                new Date().toLocaleDateString();

      // Format date nicely
      try {
        const dateObj = new Date(date);
        if (!isNaN(dateObj.getTime())) {
          date = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } catch {
        // Keep original date string
      }

      posts.push({
        title,
        excerpt,
        url: fullUrl,
        date,
        author: 'Jim Walker',
        image
      });
    });

    // If no posts found, return fallback
    if (posts.length === 0) {
      return this.getFallbackPosts();
    }

    return posts;
  }

  private async fetchPostImage(postUrl: string): Promise<string | undefined> {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(postUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return undefined;
      
      const data = await response.json();
      const html = data.contents;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Try to find the main image in the post
      const img = doc.querySelector('article img[src], .post-content img[src], img[src*="cdn"], img[src*="image"]') as HTMLImageElement;
      if (img) {
        let src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        if (src && !src.startsWith('http')) {
          src = src.startsWith('/') ? `${this.BEEHIIV_URL}${src.substring(1)}` : `${this.BEEHIIV_URL}${src}`;
        }
        return src || undefined;
      }
    } catch (err) {
      console.warn('Error fetching post image:', err);
    }
    return undefined;
  }

  private getFallbackPosts(): BlogPost[] {
    // Fallback posts based on the actual website content from rocketgoals.beehiiv.com
    // These match the actual posts from the site
    const now = Date.now();
    return [
      {
        title: 'Day 24: 🧠 Focus Feeds Speed',
        excerpt: 'The Ultimate Productivity Advantage - Discover how focus can accelerate your goal achievement and unlock your full potential.',
        url: `${this.BEEHIIV_URL}`,
        date: new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: 'Jim Walker',
        image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=600&fit=crop'
      },
      {
        title: 'Day 23: Full Ownership = Full Speed Ahead',
        excerpt: 'Learn how taking full ownership of your goals can propel you forward at maximum velocity and create unstoppable momentum.',
        url: `${this.BEEHIIV_URL}`,
        date: new Date(now - 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: 'Jim Walker',
        image: 'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?w=800&h=600&fit=crop'
      },
      {
        title: 'Day 22: Lock Into the Acceleration Signal',
        excerpt: 'Three Steps for Instant Goal Acceleration - Master the signals that drive rapid progress and transform your results.',
        url: `${this.BEEHIIV_URL}`,
        date: new Date(now - 172800000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        author: 'Jim Walker',
        image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop'
      }
    ];
  }
}

