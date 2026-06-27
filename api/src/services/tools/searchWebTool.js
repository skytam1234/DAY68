// searchWebTool.js — DuckDuckGo HTML scrape (free, no API key).
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const definition = {
  name: 'search_web',
  description: 'Tìm kiếm trên internet qua DuckDuckGo. Dùng khi cần tin tức, thông tin thời sự, hoặc dữ liệu cập nhật.',
  params: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      num_results: { type: 'integer', default: 5 },
    },
    required: ['query'],
  },
};

export async function execute({ query, num_results = 5 }, ctx) {
  if (!query?.trim()) return { ok: false, error: 'query is empty' };
  const limit = Math.min(Math.max(parseInt(num_results, 10) || 5, 1), 10);
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
      timeout: 15000,
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $('div.result').each((i, el) => {
      if (results.length >= limit) return false;
      const $a = $(el).find('a.result__a');
      const $snip = $(el).find('a.result__snippet, .result__snippet');
      const title = $a.text().trim();
      let href = $a.attr('href') || '';
      if (href.includes('uddg=')) {
        try {
          const u = new URL(href.startsWith('//') ? 'https:' + href : href);
          href = decodeURIComponent(u.searchParams.get('uddg') || '');
        } catch {}
      }
      const snippet = $snip.text().trim();
      if (title && href) results.push({ title, url: href, snippet });
    });
    return { ok: true, query, count: results.length, results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
