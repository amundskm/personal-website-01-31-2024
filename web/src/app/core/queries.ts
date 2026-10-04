import { defineQuery } from 'groq';

// ---------------------------------------------------------------------------
// Reusable projections
// ---------------------------------------------------------------------------

const imageFields = /* groq */ `
  ...,
  asset->{ _id, url, metadata { lqip, dimensions { width, height, aspectRatio } } }
`;

const linkFields = /* groq */ `
  _key, label, kind, path, url, style,
  "internal": internal->{ _type, "slug": slug.current }
`;

const blockContentFields = /* groq */ `
  ...,
  _type == "accessibleImage" => { ${imageFields} }
`;

const seoFields = /* groq */ `
  title, description, noIndex, image { ${imageFields} }
`;

const postCardFields = /* groq */ `
  _id, title, "slug": slug.current, excerpt, publishedAt, tags,
  coverImage { ${imageFields} }
`;

const projectCardFields = /* groq */ `
  _id, title, "slug": slug.current, summary, techStack, year, featured,
  coverImage { ${imageFields} }
`;

// Collections are fetched with an upper bound and trimmed by the block's own
// limit/count on the client, since GROQ slices only accept literal integers.
const MAX_LIST_ITEMS = 24;

// ---------------------------------------------------------------------------
// Site settings
// ---------------------------------------------------------------------------

export const SETTINGS_QUERY = defineQuery(`
  *[_type == "siteSettings" && _id == "siteSettings"][0]{
    title, description, footerText,
    navigation[]{ ${linkFields} },
    socialLinks[]{ _key, platform, label, url },
    seo { ${seoFields} }
  }
`);

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export const PAGE_QUERY = defineQuery(`
  *[_type == "page" && slug.current == $slug][0]{
    _id, title, "slug": slug.current,
    seo { ${seoFields} },
    sections[]{
      ...,
      _type == "heroBlock" => {
        image { ${imageFields} },
        buttons[]{ ${linkFields} }
      },
      _type == "richTextBlock" => {
        content[]{ ${blockContentFields} }
      },
      _type == "imageBlock" => {
        image { ${imageFields} }
      },
      _type == "twoColumnBlock" => {
        left { content[]{ ${blockContentFields} }, image { ${imageFields} } },
        right { content[]{ ${blockContentFields} }, image { ${imageFields} } }
      },
      _type == "ctaBlock" => {
        button { ${linkFields} }
      },
      _type == "projectGridBlock" => {
        "items": select(
          mode == "manual" => projects[]->{ ${projectCardFields} },
          mode == "all" => *[_type == "project" && defined(slug.current)]
            | order(order asc, _createdAt desc)[0...${MAX_LIST_ITEMS}]{ ${projectCardFields} },
          *[_type == "project" && defined(slug.current) && featured == true]
            | order(order asc, _createdAt desc)[0...${MAX_LIST_ITEMS}]{ ${projectCardFields} }
        )
      },
      _type == "postListBlock" => {
        "items": *[_type == "post" && defined(slug.current)]
          | order(publishedAt desc)[0...${MAX_LIST_ITEMS}]{ ${postCardFields} }
      }
    }
  }
`);

export const PAGE_SLUGS_QUERY = defineQuery(`
  *[_type == "page" && defined(slug.current) && slug.current != "home"].slug.current
`);

// ---------------------------------------------------------------------------
// Blog
// ---------------------------------------------------------------------------

export const POSTS_QUERY = defineQuery(`
  *[_type == "post" && defined(slug.current)] | order(publishedAt desc){ ${postCardFields} }
`);

export const POST_QUERY = defineQuery(`
  *[_type == "post" && slug.current == $slug][0]{
    ${postCardFields},
    body[]{ ${blockContentFields} },
    seo { ${seoFields} }
  }
`);

export const POST_SLUGS_QUERY = defineQuery(`
  *[_type == "post" && defined(slug.current)].slug.current
`);

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECTS_QUERY = defineQuery(`
  *[_type == "project" && defined(slug.current)] | order(order asc, _createdAt desc){ ${projectCardFields} }
`);

export const PROJECT_QUERY = defineQuery(`
  *[_type == "project" && slug.current == $slug][0]{
    ${projectCardFields},
    repoUrl, liveUrl,
    body[]{ ${blockContentFields} },
    gallery[]{ _key, ${imageFields} },
    seo { ${seoFields} }
  }
`);

export const PROJECT_SLUGS_QUERY = defineQuery(`
  *[_type == "project" && defined(slug.current)].slug.current
`);
