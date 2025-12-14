import type { MediaItem } from "./infinite-canvas/types";

const API_BASE = "https://api.artic.edu/api/v1";
const IIIF_BASE = "https://www.artic.edu/iiif/2";

type ArticSearchResponse = {
  data: ArticArtwork[];
};

type ArticArtwork = {
  id: number;
  title: string;
  artist_display: string;
  date_display: string;
  image_id: string;
  thumbnail?: { width: number; height: number };
};

const GRID_IMAGE_WIDTH = 512;
const MAX_ITEMS = 250;

export async function fetchArticArtworks(page = 1, limit = 25): Promise<MediaItem[]> {
  try {
    const fields = "id,title,artist_display,date_display,image_id,thumbnail";

    const query = {
      query: {
        bool: {
          must: [
            { term: { is_public_domain: true } },
            { term: { "classification_titles.keyword": "painting" } },
            { exists: { field: "image_id" } },
            { range: { date_end: { gte: 1600 } } },
            { range: { date_start: { lte: 1725 } } },
          ],
          should: [
            { match: { style_title: "Baroque" } },
            { term: { "department_title.keyword": "Painting and Sculpture of Europe" } },
          ],
          minimum_should_match: 1,
        },
      },
    };

    const params = encodeURIComponent(JSON.stringify(query));
    const url = `${API_BASE}/artworks/search?params=${params}&page=${page}&limit=${limit}&fields=${fields}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`AIC API error: ${res.status}`);
    }

    const data: ArticSearchResponse = await res.json();
    if (!data.data?.length) return [];

    const shuffled = data.data.sort(() => 0.5 - Math.random());

    const artworks: MediaItem[] = [];

    for (const item of shuffled) {
      if (!item.image_id) continue;

      artworks.push({
        url: `${IIIF_BASE}/${item.image_id}/full/${GRID_IMAGE_WIDTH},/0/default.jpg`,
        type: "image",
        title: item.title,
        artist: item.artist_display || "Unknown Artist",
        year: item.date_display,
        link: `https://www.artic.edu/artworks/${item.id}`,
        width: item.thumbnail?.width,
        height: item.thumbnail?.height,
      });

      if (artworks.length >= MAX_ITEMS) break;
    }

    return artworks;
  } catch (err) {
    console.error("Failed to fetch Baroque artworks:", err);
    return [];
  }
}
