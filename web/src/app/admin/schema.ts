/**
 * Describes the admin's forms. Each document and section type is a list of
 * fields (see schemas.ts), rendered by AdminField. Values are the editable
 * documents the content API stores: plain JSON in the shape Sanity used.
 */

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface Option {
  value: string | number;
  title: string;
}

interface FieldBase {
  name: string;
  title: string;
  help?: string;
  required?: boolean;
  /** Hide the field depending on the object it's in. */
  hidden?: (parent: JsonObject) => boolean;
  /** Value for new objects (a function for values like "now"). */
  initial?: Json | (() => Json);
}

export type Field = FieldBase &
  (
    | { kind: 'string' | 'url' }
    | { kind: 'text'; rows?: number }
    | { kind: 'slug'; source: string; prefix?: string }
    | { kind: 'number' }
    | { kind: 'boolean' }
    | { kind: 'datetime' | 'date' }
    | { kind: 'select'; options: Option[]; radio?: boolean }
    /** Several values from a fixed list (stored as an array). */
    | { kind: 'checkboxes'; options: Option[] }
    /** Free-form list of strings. */
    | { kind: 'tags' }
    /** An image usage: `{ asset: { _ref }, alt, caption, hotspot, crop }`. */
    | { kind: 'image'; caption?: boolean }
    /** A list of image usages (a gallery). */
    | { kind: 'images' }
    /** One reference: `{ _type: 'reference', _ref }`. */
    | { kind: 'reference'; to: LinkTargetType[] }
    /** An ordered list of references. */
    | { kind: 'references'; to: LinkTargetType[] }
    | { kind: 'richText' }
    | { kind: 'object'; fields: Field[]; collapsed?: boolean }
    /** A list of objects of one type. */
    | { kind: 'list'; of: ObjectType }
    /** A list of objects of several types (page sections, gallery images…), told apart by `_type`. */
    | { kind: 'blocks'; of: ObjectType[] }
  );

export type FieldKind = Field['kind'];
export type FieldOf<K extends FieldKind> = Extract<Field, { kind: K }>;

/** A kind of object in a list: a page section, a link, a budget category… */
export interface ObjectType {
  /** Stored as `_type`. */
  type: string;
  title: string;
  fields: Field[];
  /** Short text identifying an item in a collapsed list. */
  summary?: (value: JsonObject) => string;
}

export type LinkTargetType = 'page' | 'post' | 'project';

export interface LinkTarget {
  id: string;
  type: LinkTargetType;
  title: string;
  slug: string;
  status: string;
}

/** A random key for list items, like the ones Sanity generates. */
export function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A new object of `type` with its fields' initial values. */
export function newObject(type: ObjectType | { fields: Field[]; type?: string }): JsonObject {
  const value: JsonObject = { _key: newKey() };
  if (type.type) value['_type'] = type.type;
  for (const field of type.fields) {
    const initial = typeof field.initial === 'function' ? field.initial() : field.initial;
    if (initial !== undefined) value[field.name] = structuredClone(initial);
  }
  return value;
}

/**
 * Sets one field, leaving out empty values (as Sanity did) so documents only
 * hold what was entered.
 */
export function withField(parent: JsonObject, name: string, value: Json | undefined): JsonObject {
  const next = { ...parent };
  if (value === undefined || value === null || value === '') delete next[name];
  else next[name] = value;
  return next;
}

export function asObject(value: Json | undefined): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function asList(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** URL-friendly slug from a title: "Hello, World!" → "hello-world". */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

/** First line of plain text in Portable Text, for summaries. */
export function richTextSummary(value: Json | undefined): string {
  for (const block of asList(value)) {
    const children = asList(asObject(block)['children']);
    const text = children.map((child) => String(asObject(child)['text'] ?? '')).join('');
    if (text.trim()) return text.trim();
  }
  return '';
}
