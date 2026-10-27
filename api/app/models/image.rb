# An uploaded image file ("asset"). Content refers to it from JSON as
# `{ "asset": { "_ref": id } }`, alongside per-usage alt text, crop and hotspot.
class Image < ApplicationRecord
  # Formats served as uploaded instead of converted to WebP
  PASSTHROUGH_TYPES = %w[image/svg+xml image/gif].freeze

  # The only sizes served, so requests can't make unlimited variants. These are
  # what web/src/app/shared/sanity-image uses: its srcset candidates, the
  # widths components display at, and the aspect ratios they crop to (plus
  # 1200×630 for social share cards). Keep in sync with web/src/app/core/image.ts.
  WIDTHS = [320, 480, 640, 720, 800, 1024, 1200, 1280, 1600, 1920, 2000, 2400].freeze
  ASPECT_RATIOS = [16.0 / 9, 2.0, 4.0 / 3, 1200.0 / 630].freeze

  has_one_attached :file

  validates :width, :height, numericality: { greater_than: 0 }

  # Stores a file and records its size and a tiny blurred placeholder.
  # `id` keeps Sanity's asset ids on import; new uploads get a random one.
  def self.create_from_file!(path:, filename:, content_type:, id: nil)
    vips = Vips::Image.new_from_file(path.to_s)
    image = new(
      id: id || "image-#{SecureRandom.hex(20)}",
      width: vips.width,
      height: vips.height,
      lqip: placeholder_for(path),
      original_filename: filename,
    )
    # Upload now, while the file is open: attaching an IO defers the upload to
    # the end of the surrounding transaction, after the file has been closed.
    blob = File.open(path) { |io| ActiveStorage::Blob.create_and_upload!(io:, filename:, content_type:) }
    image.file.attach(blob)
    image.save!
    image
  end

  # A ~20px JPEG as a data URI, shown blurred while the real image loads.
  def self.placeholder_for(path)
    thumb = ImageProcessing::Vips.source(path.to_s).resize_to_limit(20, 20).convert("jpg").saver(quality: 60).call
    "data:image/jpeg;base64,#{Base64.strict_encode64(File.binread(thumb.path))}"
  rescue Vips::Error
    nil
  ensure
    thumb&.close!
  end

  def self.allowed_size?(width, height)
    WIDTHS.include?(width) && (height.nil? || ASPECT_RATIOS.any? { |ratio| (width / ratio).round == height })
  end

  # A usage's crop and hotspot as URL parameters, rounded so they're stable
  def self.crop_param(crop)
    crop && crop.values_at("top", "bottom", "left", "right").map { |n| format("%.4f", n || 0) }.join(",")
  end

  def self.hotspot_param(hotspot)
    hotspot && hotspot.values_at("x", "y").map { |n| format("%.4f", n || 0.5) }.join(",")
  end

  def self.signing_key
    @signing_key ||= Rails.application.key_generator.generate_key("image-urls", 32)
  end

  # Signs the parameters fixed by the content (crop, hotspot), so only crops
  # editors chose can be requested.
  def signature(crop_param, hotspot_param)
    OpenSSL::HMAC.hexdigest("SHA256", self.class.signing_key, [id, crop_param, hotspot_param].join("|"))[0, 32]
  end

  def valid_signature?(crop_param, hotspot_param, given)
    ActiveSupport::SecurityUtils.secure_compare(signature(crop_param, hotspot_param), given.to_s)
  end

  # What the site receives in place of an asset reference (the shape Sanity's
  # `asset->{ _id, url, metadata { lqip, dimensions } }` projection returned).
  # `url` is specific to one usage: it carries that usage's crop and hotspot,
  # signed, and the site appends `&w=` (and `&h=`) for each size it needs.
  def as_asset(base_url, crop: nil, hotspot: nil)
    query = { crop: self.class.crop_param(crop), hotspot: self.class.hotspot_param(hotspot) }.compact
    query[:s] = signature(query[:crop], query[:hotspot])
    {
      "_id" => id,
      "url" => "#{base_url}/images/#{id}?#{query.to_query}",
      "metadata" => {
        "lqip" => lqip,
        "dimensions" => { "width" => width, "height" => height, "aspectRatio" => width.fdiv(height) },
      },
    }
  end

  # Whether the file is actually in storage (an interrupted upload can leave
  # the record without it).
  def stored?
    file.attached? && file.service.exist?(file.key)
  end

  def passthrough?
    PASSTHROUGH_TYPES.include?(file.content_type)
  end

  # Pixel rectangle [left, top, width, height] to cut from the original for one
  # usage, or nil for the whole image. Ported from @sanity/image-url: apply the
  # editor's crop, then, if a target aspect ratio is given, cut a window of that
  # ratio centred on the hotspot as far as the crop allows.
  #
  # `crop` and `hotspot` are the fractions Sanity stores on an image usage.
  def crop_rect(crop: nil, hotspot: nil, width: nil, height: nil)
    crop_left = (crop&.fetch("left", 0) || 0) * self.width
    crop_top = (crop&.fetch("top", 0) || 0) * self.height
    crop_width = self.width - ((crop&.fetch("right", 0) || 0) * self.width) - crop_left
    crop_height = self.height - ((crop&.fetch("bottom", 0) || 0) * self.height) - crop_top
    cropped = crop_left.positive? || crop_top.positive? || crop_width < self.width || crop_height < self.height

    unless width && height
      return cropped ? [crop_left, crop_top, crop_width, crop_height].map(&:round) : nil
    end

    spot_x = (hotspot&.fetch("x", 0.5) || 0.5) * self.width
    spot_y = (hotspot&.fetch("y", 0.5) || 0.5) * self.height
    desired = width.fdiv(height)

    if crop_width.fdiv(crop_height) > desired
      # Wider than wanted: trim the sides around the hotspot
      out_height = crop_height.round
      out_width = (out_height * desired).round
      left = [0, (spot_x - out_width / 2.0).round].max
      left = left.clamp(crop_left.round, (crop_left + crop_width - out_width).round)
      [left, [0, crop_top.round].max, out_width, out_height]
    else
      # Taller than wanted: trim top and bottom
      out_width = crop_width.round
      out_height = (out_width / desired).round
      top = [0, (spot_y - out_height / 2.0).round].max
      top = top.clamp(crop_top.round, (crop_top + crop_height - out_height).round)
      [[0, crop_left.round].max, top, out_width, out_height]
    end
  end

  # An Active Storage variant at the requested size for one usage.
  def variant_for(width:, height: nil, crop: nil, hotspot: nil)
    rect = crop_rect(crop:, hotspot:, width:, height:)

    transformations = {}
    transformations[:crop] = rect if rect
    transformations[:resize_to_limit] = [width, height]
    transformations[:format] = :webp
    transformations[:saver] = { quality: 80 }
    file.variant(transformations)
  end
end
