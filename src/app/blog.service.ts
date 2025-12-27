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

  // Multiple CORS proxies for fallback
  private readonly CORS_PROXIES = [
    (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  ];

  blogPosts = signal<BlogPost[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  // Cache to avoid refetching
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  private isFetching = false;

  async fetchBlogPosts(): Promise<void> {
    // Return cached data if still valid
    const now = Date.now();
    if (this.blogPosts().length > 0 && (now - this.lastFetchTime) < this.CACHE_DURATION_MS) {
      return;
    }

    // Prevent concurrent fetches
    if (this.isFetching) {
      return;
    }

    this.isFetching = true;
    this.isLoading.set(true);
    this.error.set(null);

    try {
      const htmlContent = await this.fetchWithRetry(this.BEEHIIV_URL);

      if (!htmlContent) {
        throw new Error('Failed to fetch blog posts');
      }

      // Parse HTML to extract blog posts
      const posts = this.parseBlogPosts(htmlContent);

      // Take only the first 3 posts
      const initialPosts = posts.slice(0, 3);

      // Try to fetch images in parallel with a short timeout
      // If image fetch fails, we just use the fallback images
      const postsWithImages = await this.fetchImagesWithTimeout(initialPosts, 3000);

      this.blogPosts.set(postsWithImages);
      this.lastFetchTime = now;
    } catch (err) {
      console.error('Error fetching blog posts:', err);
      // Only show error if we don't have any posts yet
      if (this.blogPosts().length === 0) {
        // Use fallback posts silently - don't show error to users
        this.blogPosts.set(this.getFallbackPosts());
        this.lastFetchTime = now;
      }
    } finally {
      this.isLoading.set(false);
      this.isFetching = false;
    }
  }

  /**
   * Fetch with retry logic using multiple CORS proxies
   */
  private async fetchWithRetry(url: string, maxRetries: number = 2): Promise<string | null> {
    for (let proxyIndex = 0; proxyIndex < this.CORS_PROXIES.length; proxyIndex++) {
      const proxyFn = this.CORS_PROXIES[proxyIndex];

      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          const proxyUrl = proxyFn(url);
          const response = await this.fetchWithTimeout(proxyUrl, 8000);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          // Different proxies return data differently
          const content = data.contents || data.body || data;

          if (typeof content === 'string' && content.length > 100) {
            return content;
          }
          throw new Error('Invalid response content');
        } catch (err) {
          const isLastRetry = retry === maxRetries;
          const isLastProxy = proxyIndex === this.CORS_PROXIES.length - 1;

          if (!isLastRetry) {
            // Wait before retrying (exponential backoff)
            await this.delay(500 * Math.pow(2, retry));
          } else if (!isLastProxy) {
            console.warn(`Proxy ${proxyIndex + 1} failed, trying next proxy...`);
          }
        }
      }
    }
    return null;
  }

  /**
   * Fetch with a timeout
   */
  private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch images for posts with a total timeout
   */
  private async fetchImagesWithTimeout(posts: BlogPost[], timeoutMs: number): Promise<BlogPost[]> {
    const imagePromises = posts.map(async (post) => {
      if (!post.image && post.url && post.url.includes('/p/')) {
        try {
          const image = await this.fetchPostImage(post.url);
          return { ...post, image };
        } catch {
          return { ...post, image: this.getPlaceholderImage(posts.indexOf(post)) };
        }
      }
      return post;
    });

    // Race between image fetching and timeout
    const timeoutPromise = this.delay(timeoutMs).then(() =>
      posts.map((post, index) => ({
        ...post,
        image: post.image || this.getPlaceholderImage(index)
      }))
    );

    try {
      return await Promise.race([
        Promise.all(imagePromises),
        timeoutPromise
      ]);
    } catch {
      return posts.map((post, index) => ({
        ...post,
        image: post.image || this.getPlaceholderImage(index)
      }));
    }
  }

  private getPlaceholderImage(index: number): string {
    const placeholders = [
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1487058792275-0ad4aaf24ca7?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop'
    ];
    return placeholders[index % placeholders.length];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
      // Use the first proxy with a short timeout for images
      const proxyUrl = this.CORS_PROXIES[0](postUrl);
      const response = await this.fetchWithTimeout(proxyUrl, 3000);
      if (!response.ok) return undefined;

      const data = await response.json();
      const html = data.contents || data.body || data;
      if (typeof html !== 'string') return undefined;

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
    } catch {
      // Silently fail - images are not critical
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

