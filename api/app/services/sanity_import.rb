# Loads a Sanity dataset export into Postgres. Safe to re-run: documents are
# matched on their Sanity `_id` and updated in place.
#
#   npx sanity dataset export production production.tar.gz   # from studio/
#   tar -xzf production.tar.gz -C api/db/import                # → db/import/production/
#   bin/rails "sanity:import[db/import/production]"
#
# The export rewrites image references to `_sanityAsset: "image@file://./images/<name>"`
# with the files alongside; those become Image records with Sanity's asset ids.
# Drafts and Sanity's own system documents are skipped.
class SanityImport
  ASSET_PATTERN = %r{\Aimage@file://\./images/(?<name>(?<hash>\h+)-(?<size>\d+x\d+)\.(?<ext>\w+))\z}
  CONTENT_TYPES = { "jpg" => "image/jpeg", "jpeg" => "image/jpeg", "png" => "image/png", "gif" => "image/gif",
                    "webp" => "image/webp", "svg" => "image/svg+xml", "avif" => "image/avif" }.freeze

  attr_reader :counts, :warnings

  # `source` is an extracted export directory (with data.ndjson) or an .ndjson file.
  def initialize(source)
    source = Pathname(source)
    @ndjson = source.directory? ? source.join("data.ndjson") : source
    @dir = @ndjson.dirname
    @counts = Hash.new(0)
    @warnings = []
  end

  def run
    ActiveRecord::Base.transaction do
      @ndjson.each_line do |line|
        next if line.strip.empty?

        import(JSON.parse(line))
      end
    end
    self
  end

  private

  def import(doc)
    id = doc["_id"]
    return if id.start_with?("drafts.", "versions.") || doc["_type"].start_with?("sanity.", "system.")

    doc = with_asset_refs(doc)
    case doc["_type"]
    when "siteSettings" then upsert_singleton(SiteSetting, settings_attrs(doc))
    when "spendingPlan" then upsert_singleton(SpendingPlan, doc.slice("title").merge(
      "categories" => doc["categories"] || [], "stages" => doc["stages"] || [],
    ))
    when "page" then upsert(Page, doc, "sections" => doc["sections"] || [], "seo" => doc["seo"])
    when "post" then upsert(Post, doc, post_attrs(doc))
    when "project" then upsert(Project, doc, project_attrs(doc))
    when "memberPage" then upsert(MemberPage, doc, "summary" => doc["summary"], "audiences" => doc["audiences"] || [],
                                                   "sections" => doc["sections"] || [])
    else
      @warnings << "Skipped #{id}: unknown type #{doc['_type']}"
    end
  end

  def settings_attrs(doc)
    {
      "title" => doc["title"], "description" => doc["description"], "footer_text" => doc["footerText"],
      "navigation" => doc["navigation"] || [], "social_links" => doc["socialLinks"] || [], "seo" => doc["seo"],
    }
  end

  def post_attrs(doc)
    {
      "excerpt" => doc["excerpt"], "published_at" => doc["publishedAt"], "tags" => doc["tags"] || [],
      "cover_image" => doc["coverImage"], "body" => doc["body"] || [], "seo" => doc["seo"],
    }
  end

  def project_attrs(doc)
    {
      "summary" => doc["summary"], "tech_stack" => doc["techStack"] || [], "year" => doc["year"],
      "featured" => doc["featured"] || false, "position" => doc["order"], "repo_url" => doc["repoUrl"],
      "live_url" => doc["liveUrl"], "cover_image" => doc["coverImage"], "body" => doc["body"] || [],
      "gallery" => doc["gallery"] || [], "seo" => doc["seo"],
    }
  end

  def upsert(model, doc, attrs)
    slug = doc.dig("slug", "current")
    return @warnings << "Skipped #{doc['_id']}: no slug (it was never published to the site)" if slug.blank?

    record = model.find_or_initialize_by(uid: doc["_id"])
    record.assign_attributes(attrs.merge("title" => doc["title"], "slug" => slug, **timestamps(doc)))
    record.save!
    @counts[model.name] += 1
  end

  def upsert_singleton(model, attrs)
    record = model.first_or_initialize
    record.update!(attrs)
    @counts[model.name] += 1
  end

  def timestamps(doc)
    { "created_at" => doc["_createdAt"], "updated_at" => doc["_updatedAt"] }.compact
  end

  # Replaces every `_sanityAsset` with `asset: { _ref }`, creating the Image.
  def with_asset_refs(value)
    case value
    when Array then value.map { |item| with_asset_refs(item) }
    when Hash
      hash = value.to_h { |key, item| [key, with_asset_refs(item)] }
      if (source = hash.delete("_sanityAsset"))
        hash["asset"] = { "_type" => "reference", "_ref" => image_for(source) }
      end
      hash
    else value
    end
  end

  def image_for(source)
    match = ASSET_PATTERN.match(source) or raise ArgumentError, "Unsupported asset #{source}"
    id = "image-#{match[:hash]}-#{match[:size]}-#{match[:ext]}"
    existing = Image.find_by(id:)
    unless existing&.stored?
      existing&.destroy!
      Image.create_from_file!(
        path: @dir.join("images", match[:name]), filename: match[:name], id:,
        content_type: CONTENT_TYPES.fetch(match[:ext], "application/octet-stream"),
      )
      @counts["Image"] += 1
    end
    id
  end
end
