import 'server-only';

import type { NewsItem } from './types';

/**
 * Israeli market news: Globes' capital-market RSS feed (שוק ההון והשקעות).
 * Yahoo has next to nothing on TASE listings, so IL stock pages get the
 * market's own press. Plain RSS 2.0, no auth; verified 2026-08-16.
 */
const FEED = 'https://www.globes.co.il/webservice/rss/rssfeeder.asmx/FeederNode?iID=585';

const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return undefined;
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
};

export async function getGlobesNews(): Promise<NewsItem[]> {
  const res = await fetch(FEED, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/rss+xml, text/xml' },
  });
  if (!res.ok) throw new Error(`globes rss: HTTP ${res.status}`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items
    .map((item): NewsItem | null => {
      const title = tag(item, 'title');
      const link = tag(item, 'link');
      if (!title || !link) return null;
      const pub = tag(item, 'pubDate');
      const thumb = item.match(/<media:content[^>]*url="([^"]+)"/)?.[1];
      return {
        id: link,
        title,
        publisher: 'Globes',
        link,
        publishedAt: pub ? Date.parse(pub) : Date.now(),
        thumbnail: thumb,
      };
    })
    .filter((n): n is NewsItem => n !== null);
}
