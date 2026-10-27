# Builds the JSON the website reads, in the same shape the old GROQ queries in
# web/src/app/core/queries.ts returned, so the Angular components don't change.
#
# Stored JSON keeps Sanity's references: `asset: { _ref }` for images and
# `internal: { _ref }` for links to pages, posts and projects. Responses are
# built with those references in place, then #resolve replaces every one of
# them in a single pass with two batched lookups.
class ContentResolver
  # Arrays are stored as [] when Sanity had no value; responses return null for
  # those, like GROQ did (see #list).
  #
  # Matches the upper bound the GROQ queries used for list blocks
  MAX_LIST_ITEMS = 24
  LINK_FIELDS = %w[_key label kind path url style internal].freeze
  LINKABLE = { "page" => Page, "post" => Post, "project" => Project }.freeze

  # `include_unpublished` is for admin previews: links and lists may then
  # point at documents that haven't been published yet.
  def initialize(base_url, include_unpublished: false)
    @base_url = base_url
    @include_unpublished = include_unpublished
  end

  def settings(settings)
    resolve(
      "title" => settings.title,
      "description" => settings.description,
      "footerText" => settings.footer_text,
      "navigation" => list(settings.navigation)&.map { |link| project_link(link) },
      "socialLinks" => list(settings.social_links)&.map { |social| pick(social, %w[_key platform label url]) },
      "seo" => seo(settings.seo),
    )
  end

  def page(page)
    resolve(
      "_id" => page.uid,
      "title" => page.title,
      "slug" => page.slug,
      "seo" => seo(page.seo),
      "sections" => sections(page.sections),
    )
  end

  def post_cards(posts) = resolve(posts.map { |post| post_card(post) })

  def post(post)
    resolve(post_card(post).merge("body" => list(post.body), "seo" => seo(post.seo)))
  end

  def project_cards(projects) = resolve(projects.map { |project| project_card(project) })

  def project(project)
    resolve(
      project_card(project).merge(
        "repoUrl" => project.repo_url,
        "liveUrl" => project.live_url,
        "body" => list(project.body),
        "gallery" => list(project.gallery),
        "seo" => seo(project.seo),
      ),
    )
  end

  def member_page_summaries(pages)
    pages.map { |page| member_page_summary(page) }
  end

  def member_page(page)
    resolve(member_page_summary(page).merge("sections" => sections(page.sections)))
  end

  private

  def member_page_summary(page)
    { "_id" => page.uid, "title" => page.title, "slug" => page.slug, "summary" => page.summary, "audiences" => list(page.audiences) }
  end

  def post_card(post)
    {
      "_id" => post.uid,
      "title" => post.title,
      "slug" => post.slug,
      "excerpt" => post.excerpt,
      "publishedAt" => post.published_at&.utc&.iso8601(3),
      "tags" => list(post.tags),
      "coverImage" => post.cover_image,
    }
  end

  def project_card(project)
    {
      "_id" => project.uid,
      "title" => project.title,
      "slug" => project.slug,
      "summary" => project.summary,
      "techStack" => list(project.tech_stack),
      "year" => project.year,
      "featured" => project.featured,
      "coverImage" => project.cover_image,
    }
  end

  def seo(seo)
    seo && pick(seo, %w[title description noIndex image])
  end

  def project_link(link)
    link && pick(link, LINK_FIELDS)
  end

  # Like a GROQ projection: exactly these keys, null when missing
  def pick(hash, keys) = keys.index_with { |key| hash[key] }

  def list(array) = array.presence

  # Each block gets the keys the GROQ section projection added (null when
  # missing), plus its list items.
  def sections(sections)
    list(sections)&.map do |section|
      case section["_type"]
      when "heroBlock"
        section.merge("image" => section["image"], "buttons" => section["buttons"]&.map { |link| project_link(link) })
      when "richTextBlock"
        section.merge("content" => section["content"])
      when "imageBlock"
        section.merge("image" => section["image"])
      when "twoColumnBlock"
        section.merge(%w[left right].index_with { |side| section[side]&.merge("content" => section[side]["content"], "image" => section[side]["image"]) })
      when "ctaBlock"
        section.merge("button" => project_link(section["button"]))
      when "projectGridBlock"
        section.merge("items" => project_grid_items(section))
      when "postListBlock"
        section.merge("items" => visible(Post).newest_first.limit(MAX_LIST_ITEMS).map { |post| post_card(post) })
      else
        section
      end
    end
  end

  def project_grid_items(section)
    case section["mode"]
    when "manual"
      uids = Array(section["projects"]).map { |ref| ref["_ref"] }
      by_uid = visible(Project).where(uid: uids).index_by(&:uid)
      uids.filter_map { |uid| by_uid[uid] && project_card(by_uid[uid]) }.presence
    when "all"
      visible(Project).in_display_order.limit(MAX_LIST_ITEMS).map { |project| project_card(project) }
    else
      visible(Project).featured.in_display_order.limit(MAX_LIST_ITEMS).map { |project| project_card(project) }
    end
  end

  def visible(model) = @include_unpublished ? model.where(pending_delete: false) : model.live

  # Replaces image and link references throughout `value`.
  def resolve(value)
    image_ids = Set.new
    doc_uids = Set.new
    each_hash(value) do |hash|
      image_ids << hash["asset"]["_ref"] if hash["asset"].is_a?(Hash) && hash["asset"]["_ref"]
      doc_uids << hash["internal"]["_ref"] if hash["internal"].is_a?(Hash) && hash["internal"]["_ref"]
    end

    images = Image.where(id: image_ids.to_a).index_by(&:id)
    docs = LINKABLE.flat_map do |type, model|
      visible(model).where(uid: doc_uids.to_a).pluck(:uid, :slug).map { |uid, slug| [uid, { "_type" => type, "slug" => slug }] }
    end.to_h

    replace(value, images, docs)
  end

  def replace(value, images, docs)
    case value
    when Array
      value.map { |item| replace(item, images, docs) }
    when Hash
      value.to_h do |key, item|
        if key == "asset" && item.is_a?(Hash) && item["_ref"]
          # The usage (this hash) holds the crop and hotspot
          [key, images[item["_ref"]]&.as_asset(@base_url, crop: value["crop"], hotspot: value["hotspot"])]
        elsif key == "internal" && item.is_a?(Hash) && item["_ref"]
          [key, docs[item["_ref"]]]
        else
          [key, replace(item, images, docs)]
        end
      end
    else
      value
    end
  end

  def each_hash(value, &block)
    case value
    when Array then value.each { |item| each_hash(item, &block) }
    when Hash
      yield value
      value.each_value { |item| each_hash(item, &block) }
    end
  end
end
