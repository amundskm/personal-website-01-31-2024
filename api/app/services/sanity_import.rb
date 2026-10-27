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

  MODELS = { "siteSettings" => SiteSetting, "spendingPlan" => SpendingPlan, "page" => Page, "post" => Post,
             "project" => Project, "memberPage" => MemberPage }.freeze

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
    model = MODELS[doc["_type"]]
    return @warnings << "Skipped #{id}: unknown type #{doc['_type']}" unless model

    record =
      if model.column_names.include?("uid")
        slug = doc.dig("slug", "current")
        return @warnings << "Skipped #{id}: no slug (it was never published to the site)" if slug.blank?

        doc = doc.merge("slug" => slug)
        model.find_or_initialize_by(uid: id)
      else
        model.first_or_initialize # singletons
      end
    record.assign_document(model.normalize_document(doc))
    record.assign_attributes(timestamps(doc))
    record.save!
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
