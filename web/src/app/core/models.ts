// Content returned by the content API (api/, see ContentResolver there). The
// shapes are what the Sanity GROQ queries used to return: nested content keeps
// Sanity's structure (`_type`, `_key`, Portable Text), and fields that may be
// missing are `null` or optional.

export type SectionTheme = 'light' | 'dark' | 'accent';

/** An image as used in one place: the file plus that usage's alt text and caption. */
export interface CmsImage {
  _type?: string;
  _key?: string;
  asset: {
    _id: string;
    /** Signed for this usage's crop and hotspot; append `&w=` (and `&h=`) to size it. */
    url: string | null;
    metadata: {
      lqip: string | null;
      dimensions: { width: number | null; height: number | null; aspectRatio?: number | null } | null;
    } | null;
  } | null;
  alt?: string;
  caption?: string;
}

export interface SiteLink {
  _key?: string | null;
  label: string | null;
  kind: 'external' | 'internal' | null;
  path: string | null;
  url: string | null;
  style: 'primary' | 'secondary' | 'text' | null;
  internal: { _type: 'page' | 'post' | 'project'; slug: string | null } | null;
}

export interface Seo {
  title: string | null;
  description: string | null;
  noIndex: boolean | null;
  image: CmsImage | null;
}

// ---------------------------------------------------------------------------
// Rich text (Portable Text)
// ---------------------------------------------------------------------------

export interface TextBlock {
  _type: 'block';
  _key: string;
  children?: { _type: 'span'; _key: string; text?: string; marks?: string[] }[];
  style?: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote';
  listItem?: 'bullet' | 'number';
  level?: number;
  markDefs?: { _type: 'link'; _key: string; href?: string; openInNewTab?: boolean }[];
}

export interface CodeSnippet {
  _type: 'code';
  _key: string;
  language?: string;
  filename?: string;
  code?: string;
  highlightedLines?: number[];
}

export type RichText = (
  | TextBlock
  | (CmsImage & { _type: 'accessibleImage'; _key: string })
  | CodeSnippet
)[];

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export interface SiteSettings {
  title: string | null;
  description: string | null;
  footerText: string | null;
  navigation: SiteLink[] | null;
  socialLinks: { _key: string | null; platform: string | null; label: string | null; url: string | null }[] | null;
  seo: Seo | null;
}

export interface PostCard {
  _id: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  publishedAt: string | null;
  tags: string[] | null;
  coverImage: CmsImage | null;
}

export interface Post extends PostCard {
  body: RichText | null;
  seo: Seo | null;
}

export interface ProjectCard {
  _id: string;
  title: string | null;
  slug: string | null;
  summary: string | null;
  techStack: string[] | null;
  year: number | null;
  featured: boolean | null;
  coverImage: CmsImage | null;
}

export interface Project extends ProjectCard {
  repoUrl: string | null;
  liveUrl: string | null;
  body: RichText | null;
  gallery: (CmsImage & { _key: string })[] | null;
  seo: Seo | null;
}

export interface Page {
  _id: string;
  title: string | null;
  slug: string | null;
  seo: Seo | null;
  sections: PageSection[] | null;
}

/** A members-only page as listed (without sections). */
export interface MemberPageSummary {
  _id: string;
  title: string | null;
  slug: string | null;
  summary: string | null;
  audiences: string[] | null;
}

export interface MemberPage extends MemberPageSummary {
  sections: PageSection[] | null;
}

// ---------------------------------------------------------------------------
// Page sections ("blocks"), each rendered by a component in blocks/
// ---------------------------------------------------------------------------

interface Section<T extends string> {
  _type: T;
  _key: string;
}

export type PageSection =
  | (Section<'heroBlock'> & {
      eyebrow?: string;
      heading?: string;
      tagline?: string;
      subheading?: string;
      image: CmsImage | null;
      showMascot?: boolean;
      buttons: SiteLink[] | null;
      layout?: 'centered' | 'split';
      theme?: SectionTheme;
    })
  | (Section<'richTextBlock'> & { content: RichText | null; width?: 'narrow' | 'wide' })
  | (Section<'imageBlock'> & { image: CmsImage | null; width?: 'content' | 'wide' | 'full' })
  | (Section<'twoColumnBlock'> & {
      heading?: string;
      layout?: 'aside' | 'even';
      verticalAlign?: 'top' | 'center';
      reverseOnMobile?: boolean;
      left: TwoColumnSide | null;
      right: TwoColumnSide | null;
    })
  | (Section<'ctaBlock'> & { heading?: string; text?: string; button: SiteLink | null; theme?: SectionTheme })
  | (Section<'projectGridBlock'> & {
      heading?: string;
      intro?: string;
      mode?: 'all' | 'featured' | 'manual';
      limit?: number;
      showViewAll?: boolean;
      items: ProjectCard[] | null;
    })
  | (Section<'postListBlock'> & {
      heading?: string;
      count?: number;
      showViewAll?: boolean;
      items: PostCard[];
    })
  | (Section<'skillsBlock'> & {
      heading?: string;
      intro?: string;
      groups?: { _type: 'skillGroup'; _key: string; title?: string; skills?: string[] }[];
      theme?: SectionTheme;
    });

export interface TwoColumnSide {
  content: RichText | null;
  image: CmsImage | null;
}

export type SectionOf<T extends PageSection['_type']> = Extract<PageSection, { _type: T }>;
